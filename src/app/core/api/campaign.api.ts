import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiKeyListItem,
  CampaignLanguage,
  JobCategory,
  RubricPreviewRun,
  RunRubricPreviewRequest,
  SuggestCriterionLevelsResponse,
  CampaignResponse,
  CampaignResultsResponse,
  CampaignSlotResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CandidateDetailResponse,
  CandidateListItem,
  JobNeedInput,
  CreateCampaignRequest,
  CreateCampaignSlotRequest,
  PatchCandidateRequest,
  CreateInvitationsRequest,
  CreateInvitationsResponse,
  FaceCheckResult,
  InvitationInfo,
  InvitationListItem,
  UpdateCampaignSlotRequest,
  InviteShortlistRequest,
  InviteShortlistResponse,
  OverrideResultRequest,
  JoinCampaignResult,
  MyCampaignDetail,
  MyCampaignSummary,
  ProctorSignalType,
  ImportQuestionsResult,
  QuestionItem,
  ScreenCandidatesResponse,
  SessionTranscriptResponse,
  SystemDefaultPreviewResponse,
  StartInterviewResult,
  TransitionStatusRequest,
  UpdateCampaignRequest,
} from '../models';

/**
 * Thời hạn cho lượt chấm thử thước đo. Rộng hơn nhiều lần thời gian đo được (~25–40s) vì đây là
 * chuỗi nhiều lượt gọi mô hình nối tiếp; cắt sớm thì HR mất kết quả của một lượt **đã tính phí**.
 */
const RUBRIC_PREVIEW_TIMEOUT_MS = 180_000;

/**
 * /api/v1/campaign/* — luồng B2B phía ứng viên (invitation → join → my-campaigns → start).
 * Answers/submit của bài phỏng vấn dùng lại PracticeApi (endpoint Interview chung B2C/B2B).
 */
@Injectable({ providedIn: 'root' })
export class CampaignApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/campaign`;

  /** Public — metadata lời mời từ magic-link. */
  invitation(token: string): Observable<InvitationInfo> {
    return this.http.get<InvitationInfo>(`${this.base}/invitations/${encodeURIComponent(token)}`);
  }

  /**
   * Join lời mời — **CẦN JWT role Candidate** (tên "Public" cũ là sai: backend gác
   * `[Authorize(Roles="Candidate")]`, gọi ẩn danh → 401). Backend còn so email người đăng nhập với
   * email được mời → lệch thì **403**, không tạo membership.
   *
   * `accessToken` trong response là JWT của candidate được provision, KHÔNG kèm refreshToken. Từ
   * Q17(b) FE **không dùng** nó nữa (đã đăng nhập trước khi join) — lưu nó qua
   * `setAccessOnlySession` sẽ xoá refreshToken và làm buổi phỏng vấn dài đứt giữa chừng.
   */
  join(token: string): Observable<JoinCampaignResult> {
    return this.http.post<JoinCampaignResult>(
      `${this.base}/invitations/${encodeURIComponent(token)}/join`,
      {},
    );
  }

  myCampaigns(): Observable<MyCampaignSummary[]> {
    return this.http.get<MyCampaignSummary[]>(`${this.base}/my-campaigns`);
  }

  myCampaign(campaignId: string): Observable<MyCampaignDetail> {
    return this.http.get<MyCampaignDetail>(`${this.base}/my-campaigns/${campaignId}`);
  }

  /** Create-or-get session phỏng vấn. 402 = org hết credit · 409 = completed/closed. */
  start(campaignId: string): Observable<StartInterviewResult> {
    return this.http.post<StartInterviewResult>(`${this.base}/${campaignId}/start`, {});
  }

  /** Proctoring: gửi cờ anti-cheat (tab_switch/paste/focus_lost) — UI proctoring dùng (agent khác). */
  reportFlag(
    campaignId: string,
    sessionId: string,
    signalType: ProctorSignalType,
    note?: string,
  ): Observable<unknown> {
    return this.http.post(`${this.base}/${campaignId}/sessions/${sessionId}/flags`, {
      signalType,
      note,
    });
  }

  /** Proctoring: đăng ký ảnh khuôn mặt tham chiếu (multipart `file`). */
  faceEnroll(
    campaignId: string,
    sessionId: string,
    image: Blob,
    filename = 'face.jpg',
  ): Observable<unknown> {
    const form = new FormData();
    form.append('image', image, filename);
    return this.http.post(`${this.base}/${campaignId}/sessions/${sessionId}/face-enroll`, form);
  }

  /** Proctoring: đối chiếu khuôn mặt trong lúc thi (multipart `image`). */
  faceCheck(
    campaignId: string,
    sessionId: string,
    image: Blob,
    filename = 'face.jpg',
  ): Observable<FaceCheckResult> {
    const form = new FormData();
    form.append('image', image, filename);
    return this.http.post<FaceCheckResult>(
      `${this.base}/${campaignId}/sessions/${sessionId}/face-check`,
      form,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EMPLOYER / HR — quản lý campaign (role Employer, JWT mang org_id). Owner = ORG.
  // ───────────────────────────────────────────────────────────────────────────

  /** GET /campaign — danh sách campaign của org. */
  listCampaigns(): Observable<CampaignResponse[]> {
    return this.http.get<CampaignResponse[]>(this.base);
  }

  /** GET /campaign/{id} — chi tiết (Employer). Ngoài org → 404. */
  getCampaign(id: string): Observable<CampaignResponse> {
    return this.http.get<CampaignResponse>(`${this.base}/${id}`);
  }

  /** POST /campaign — tạo Draft. 400 nếu thiếu question / ngày quá khứ / Σweight sai. */
  createCampaign(body: CreateCampaignRequest): Observable<CampaignResponse> {
    return this.http.post<CampaignResponse>(this.base, body);
  }

  /** PUT /campaign/{id} — sửa metadata + JD/criteria (chỉ Draft → khác 409). */
  updateCampaign(id: string, body: UpdateCampaignRequest): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}`, body);
  }

  /** PUT /campaign/{id}/questions — ghi đè câu hỏi (chỉ Draft). */
  updateQuestions(id: string, questions: QuestionItem[]): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}/questions`, questions);
  }

  /**
   * POST /campaign/{id}/questions/import — đọc file CSV câu hỏi + đáp án mẫu.
   *
   * **CHỈ ĐỌC — backend KHÔNG ghi gì.** Trả danh sách để HR xem trước; muốn lưu thì gọi
   * {@link updateQuestions} như bình thường. Nhờ thế guard "chỉ sửa khi Draft", nhật ký thao tác và
   * luật trộn câu F10 vẫn nằm đúng một chỗ, và file hỏng mã hoá chỉ làm HR thấy chữ lỗi trên màn
   * hình rồi bấm huỷ — thay vì cơ sở dữ liệu ăn text hỏng.
   *
   * 400 file hỏng/sai định dạng/thiếu cột · 404 ngoài tổ chức · 409 campaign không còn Draft.
   * Lỗi của TỪNG DÒNG nằm trong `errors` của body 200, không phải lỗi HTTP.
   */
  importQuestions(id: string, file: File): Observable<ImportQuestionsResult> {
    const form = new FormData();
    // KHÔNG tự set Content-Type: để trình duyệt tự sinh boundary (mẫu uploadCandidateCvs).
    form.append('file', file, file.name);
    return this.http.post<ImportQuestionsResult>(`${this.base}/${id}/questions/import`, form);
  }

  /** GET /campaign/questions/template — file CSV mẫu (đã có BOM UTF-8 để Excel đọc đúng tiếng Việt). */
  downloadQuestionsTemplate(): Observable<Blob> {
    return this.http.get(`${this.base}/questions/template`, { responseType: 'blob' });
  }

  /**
   * POST /campaign/{id}/questions/generate?count= — AI đọc JD ĐÃ LƯU rồi sinh câu hỏi (F9).
   * Backend chỉ xoá câu `AiGenerated` cũ, GIỮ NGUYÊN câu HR tự gõ (`CustomHr`) ⇒ gọi nhiều lần
   * không cộng dồn. Chỉ chạy khi campaign `Draft` (CAMP-2 → 409) và JD đã lưu (rỗng → 400).
   * Trả CampaignResponse đầy đủ (đã gồm danh sách câu hỏi sau khi sinh).
   */
  generateQuestions(id: string, count?: number | null): Observable<CampaignResponse> {
    let params = new HttpParams();
    if (count != null) params = params.set('count', String(count));
    return this.http.post<CampaignResponse>(`${this.base}/${id}/questions/generate`, null, {
      params,
    });
  }

  // ── Mốc điểm + chấm thử thước đo ───────────────────────────────────────────
  /**
   * POST /campaign/{id}/criteria/levels/suggest — AI viết mốc điểm cho từng tiêu chí ĐÃ LƯU.
   *
   * **KHÔNG ghi DB**: trả về để HR xem/sửa rồi lưu qua {@link updateCampaign} như bình thường —
   * cùng nguyên tắc với {@link importQuestions}, để nhật ký thao tác và luật tăng phiên bản thước
   * đo nằm đúng một cửa. AI lỗi → **502** và không có dải mặc định thay thế: mốc rỗng là trạng
   * thái hợp lệ, còn mốc bịa (`"Mức 3/10"`) thì HR sẽ tưởng là do AI viết ra.
   */
  suggestCriterionLevels(id: string): Observable<SuggestCriterionLevelsResponse> {
    return this.http.post<SuggestCriterionLevelsResponse>(
      `${this.base}/${id}/criteria/levels/suggest`,
      {},
    );
  }

  /**
   * GET /campaign/criteria/system-default/preview — xem trước bộ chuẩn của một nghề.
   *
   * **CHỈ ĐỌC, không ghi gì** — dùng để nhà tuyển dụng nhìn thấy mình sắp chép về cái gì trước khi
   * bấm. Không có `{id}` vì nó không thuộc chiến dịch nào.
   *
   * ⚠ **404 KHÔNG phải lỗi**: quản trị viên chưa soạn bộ chuẩn cho tổ hợp (nghề, ngôn ngữ) đó.
   * Đây là câu hỏi *"có sẵn không"*, khác hẳn 502 của đường chép (*"chép hộ tôi"* mà hỏng).
   */
  previewSystemDefaultCriteria(
    jobCategory: JobCategory,
    language: CampaignLanguage,
  ): Observable<SystemDefaultPreviewResponse> {
    return this.http.get<SystemDefaultPreviewResponse>(
      `${this.base}/criteria/system-default/preview`,
      { params: new HttpParams().set('jobCategory', jobCategory).set('language', language) },
    );
  }

  /**
   * POST /campaign/{id}/criteria/from-system-default — chép bộ chuẩn của hệ thống theo nghề vào
   * chiến dịch.
   *
   * **CHÉP chứ không tham chiếu**: quản trị viên sửa bộ gốc về sau sẽ KHÔNG đổi thước đo của các
   * chiến dịch đang tuyển — đúng thứ mà cơ chế phiên bản thước đo sinh ra để chặn.
   *
   * ⚠ Ghi thẳng DB (khác {@link suggestCriterionLevels} vốn chỉ trả về để xem): thao tác này
   * **THAY THẾ** toàn bộ tiêu chí đang có, nên phải hỏi lại trước khi gọi.
   * ⚠ `jobCategory` do HR **chọn**, không suy từ `domain` — `domain` là chuỗi tự do.
   */
  copyCriteriaFromSystemDefault(
    id: string,
    body: { jobCategory: JobCategory; language: CampaignLanguage },
  ): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/criteria/from-system-default`, body);
  }

  /**
   * POST /campaign/{id}/rubric-preview — AI viết 3 bài mẫu (yếu/khá/xuất sắc) cho 1 câu hỏi rồi
   * **chấm thật** cả 3 bằng đúng bộ chấm của ứng viên.
   *
   * ⚠ Chạy trên bộ tiêu chí **ĐÃ LƯU trong DB**, không phải bản đang gõ dở trên form.
   * ⚠ Chậm (≈25–40s, cá biệt hơn): sinh bài rồi chấm từng bài là nhiều lượt gọi mô hình nối tiếp.
   * Đặt `timeout` **tường minh 180s** thay vì để mặc định — không có thời hạn thì một request treo
   * sẽ giữ mãi vòng quay chờ và HR không bao giờ nhận được lỗi để bấm lại.
   *
   * 402 = ví Org không đủ credit (lượt tính phí) · 409 = đang có lượt chạy dở · 400 = thước đo
   * chưa hợp lệ (thiếu tiêu chí/mốc) · 404 = chiến dịch ngoài org.
   */
  runRubricPreview(id: string, body: RunRubricPreviewRequest): Observable<RubricPreviewRun> {
    return this.http
      .post<RubricPreviewRun>(`${this.base}/${id}/rubric-preview`, body)
      .pipe(timeout(RUBRIC_PREVIEW_TIMEOUT_MS));
  }

  /**
   * GET /campaign/{id}/rubric-preview — lịch sử chấm thử (mới nhất trước, backend cap 20).
   *
   * Cũng là đường CỨU khi lượt chạy bị lỗi mạng/timeout: lượt chạy thường đã xong ở server và nằm
   * sẵn trong lịch sử, nên đọc lại một lần trước khi báo lỗi cho HR.
   */
  getRubricPreviewRuns(id: string): Observable<RubricPreviewRun[]> {
    return this.http.get<RubricPreviewRun[]>(`${this.base}/${id}/rubric-preview`);
  }

  /** POST /campaign/{id}/publish → Active (sinh campaign_criteria + nhu cầu công việc từ JD). */
  publishCampaign(id: string): Observable<CampaignResponse> {
    return this.http.post<CampaignResponse>(`${this.base}/${id}/publish`, {});
  }

  /**
   * PUT /campaign/{id}/job-needs — HR chốt nhu cầu công việc dùng để sàng CV (replace-all).
   * Chỉ khi campaign còn `Draft` (đổi thước đo giữa chừng thì ứng viên sàng trước và sàng sau
   * không so sánh được nữa) → ngoài Draft server trả 409.
   */
  updateJobNeeds(id: string, needs: JobNeedInput[]): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}/job-needs`, needs);
  }

  /** PUT /campaign/{id}/status — Active→Closed→Archived. */
  transitionStatus(id: string, body: TransitionStatusRequest): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}/status`, body);
  }

  /** DELETE /campaign/{id} — soft-delete. */
  deleteCampaign(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  // ── Khung giờ phỏng vấn (slot) ─────────────────────────────────────────────
  /** GET /campaign/{id}/slots — sắp theo `startsAt`; ngoài org → 404. */
  getSlots(id: string): Observable<CampaignSlotResponse[]> {
    return this.http.get<CampaignSlotResponse[]>(`${this.base}/${id}/slots`);
  }

  /** POST /campaign/{id}/slots — 400 giờ/sức chứa không hợp lệ · 409 chồng lấn khung giờ khác. */
  createSlot(id: string, body: CreateCampaignSlotRequest): Observable<CampaignSlotResponse> {
    return this.http.post<CampaignSlotResponse>(`${this.base}/${id}/slots`, body);
  }

  /** PUT /campaign/{id}/slots/{slotId} — thêm 400 khi hạ sức chứa dưới số lời mời đã gán. */
  updateSlot(
    id: string,
    slotId: string,
    body: UpdateCampaignSlotRequest,
  ): Observable<CampaignSlotResponse> {
    return this.http.put<CampaignSlotResponse>(`${this.base}/${id}/slots/${slotId}`, body);
  }

  /** DELETE /campaign/{id}/slots/{slotId} → 204. Đang có ứng viên thi trong khung → 409. */
  deleteSlot(id: string, slotId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}/slots/${slotId}`);
  }

  // ── File JD / tiêu chí (PDF) ───────────────────────────────────────────────
  /**
   * POST /campaign/{id}/files — đính kèm lần đầu (multipart). Ít nhất 1 file, mỗi file ≤ 10MB.
   *
   * ⚠ C11 — **text ưu tiên file**: slot nào đã có `jdText`/`criteriaText` nhập tay thì backend
   * BỎ QUA file gửi kèm cho slot đó (không lỗi, chỉ lặng lẽ không nhận). Phải nói rõ trên UI.
   */
  uploadCampaignFiles(
    id: string,
    files: { jdFile?: File | null; criteriaFile?: File | null },
  ): Observable<CampaignResponse> {
    return this.http.post<CampaignResponse>(`${this.base}/${id}/files`, buildFileForm(files));
  }

  /** PUT /campaign/{id}/files — thay file. **Chỉ khi Draft** (khác → 409). Cùng luật text-ưu-tiên. */
  updateCampaignFiles(
    id: string,
    files: { jdFile?: File | null; criteriaFile?: File | null },
  ): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}/files`, buildFileForm(files));
  }

  /**
   * POST /campaign/{id}/files/download?fileType=jd|criteria — tải PDF (blob).
   * Chưa upload file cho slot đó → **404** (không phải lỗi hệ thống, phải hiện thông báo tử tế).
   */
  downloadCampaignFile(id: string, fileType: 'jd' | 'criteria'): Observable<Blob> {
    return this.http.post(`${this.base}/${id}/files/download`, null, {
      params: new HttpParams().set('fileType', fileType),
      responseType: 'blob',
    });
  }

  // ── Mời ứng viên (đường 1: email) ──────────────────────────────────────────
  /** POST /campaign/{id}/invitations — mời theo danh sách email → {created[], failed[]}. */
  createInvitations(
    id: string,
    body: CreateInvitationsRequest,
  ): Observable<CreateInvitationsResponse> {
    return this.http.post<CreateInvitationsResponse>(`${this.base}/${id}/invitations`, body);
  }

  /**
   * GET /campaign/{id}/invitations — lời mời ĐÃ PHÁT của chiến dịch (HR theo dõi + lấy `id` để
   * gửi lại). Lọc `status`/`search` chạy ở SQL nên đúng trên toàn bộ tập, không chỉ trang hiện tại.
   * Keyset-paged: `cursor`/`limit` opt-in, mặc định trả tối đa 500 (đủ cho mọi campaign hiện có).
   */
  getInvitations(
    id: string,
    opts?: { status?: string; search?: string; cursor?: string; limit?: number },
  ): Observable<InvitationListItem[]> {
    let params = new HttpParams();
    if (opts?.status) params = params.set('status', opts.status);
    if (opts?.search) params = params.set('search', opts.search);
    if (opts?.cursor) params = params.set('cursor', opts.cursor);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http.get<InvitationListItem[]>(`${this.base}/${id}/invitations`, { params });
  }

  /** POST /campaign/{id}/invitations/{invId}/reissue — cấp lại token + gửi mail. */
  reissueInvitation(id: string, invitationId: string): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/invitations/${invitationId}/reissue`, {});
  }

  // ── Kết quả + xếp hạng (E5/E6) ──────────────────────────────────────────────
  /** GET /campaign/{id}/results — ranking + pass/fail + flags. */
  getResults(id: string): Observable<CampaignResultsResponse> {
    return this.http.get<CampaignResultsResponse>(`${this.base}/${id}/results`);
  }

  /** PUT /campaign/{id}/results/{sessionId}/override — HR chốt/sửa điểm cuối (E11b). Clear = score/result null. */
  overrideResult(
    id: string,
    sessionId: string,
    body: OverrideResultRequest,
  ): Observable<unknown> {
    return this.http.put(`${this.base}/${id}/results/${sessionId}/override`, body);
  }

  /**
   * GET /campaign/{id}/results/{sessionId}/transcript — transcript + dẫn chứng AI 1 buổi (AI4).
   * 404 = buổi chưa chấm / ngoài org · 502 = InterviewService lỗi (transcript đọc xuyên service).
   */
  getSessionTranscript(id: string, sessionId: string): Observable<SessionTranscriptResponse> {
    return this.http.get<SessionTranscriptResponse>(
      `${this.base}/${id}/results/${sessionId}/transcript`,
    );
  }

  /** GET /campaign/{id}/results/export?format=csv — tải CSV (blob). */
  exportResults(id: string, format = 'csv'): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/results/export?format=${encodeURIComponent(format)}`, {
      responseType: 'blob',
    });
  }

  // ── Lọc CV / shortlist (C13–C15) ────────────────────────────────────────────
  /** POST /campaign/{id}/candidates — bulk upload CV (multipart `files`) → sàng lọc. */
  uploadCandidateCvs(id: string, files: File[]): Observable<ScreenCandidatesResponse> {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return this.http.post<ScreenCandidatesResponse>(`${this.base}/${id}/candidates`, form);
  }

  /** GET /campaign/{id}/candidates — danh sách CV đã sàng (filter tuỳ chọn). */
  getCandidates(
    id: string,
    opts?: { status?: string; minScore?: number; skill?: string; sort?: string },
  ): Observable<CandidateListItem[]> {
    let params = new HttpParams();
    if (opts?.status) params = params.set('status', opts.status);
    if (opts?.minScore != null) params = params.set('minScore', String(opts.minScore));
    if (opts?.skill) params = params.set('skill', opts.skill);
    if (opts?.sort) params = params.set('sort', opts.sort);
    return this.http.get<CandidateListItem[]>(`${this.base}/${id}/candidates`, { params });
  }

  /** GET /campaign/{id}/candidates/{cid} — chi tiết ứng viên (điểm + reasoning từng tiêu chí + CV key). */
  getCandidate(id: string, candidateId: string): Observable<CandidateDetailResponse> {
    return this.http.get<CandidateDetailResponse>(`${this.base}/${id}/candidates/${candidateId}`);
  }

  /**
   * GET /campaign/{id}/candidates/{cid}/cv — CV gốc. Backend trả THẲNG file PDF (không phải URL/key),
   * mà endpoint cần JWT → phải tải bằng HttpClient (interceptor gắn token) rồi tự tạo link tải,
   * không dùng được <a href> trực tiếp. 404 = chưa archive CV / ngoài org.
   */
  downloadCandidateCv(id: string, candidateId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/candidates/${candidateId}/cv`, {
      responseType: 'blob',
    });
  }

  /** PATCH /campaign/{id}/candidates/{cid} — bổ sung email/fullName (Invited → 409). */
  patchCandidate(
    id: string,
    candidateId: string,
    body: PatchCandidateRequest,
  ): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/candidates/${candidateId}`, body);
  }

  /**
   * POST /campaign/{id}/candidates/{cid}/rescreen → **202** — đẩy lại sàng CV cho 1 ứng viên
   * (điền `fullName`/điểm còn thiếu, hoặc retry `AnalysisFailed`).
   *
   * **409** khi trạng thái không cho phép: `Invited` (kết quả đã chốt, chạy tiếp chỉ đốt token
   * rồi vứt) và `Analyzing` (job đang bay — đây cũng chính là cooldown chống bấm liên tục, không
   * phải lỗi). Chỉ `Filtered`/`Analyzed`/`AnalysisFailed` mới đẩy lại được.
   */
  rescreenCandidate(id: string, candidateId: string): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/candidates/${candidateId}/rescreen`, null);
  }

  /** POST /campaign/{id}/candidates/invite — mời shortlist theo candidateIds. */
  inviteShortlist(
    id: string,
    body: InviteShortlistRequest,
  ): Observable<InviteShortlistResponse> {
    return this.http.post<InviteShortlistResponse>(`${this.base}/${id}/candidates/invite`, body);
  }

  // ── API key cho bên thứ ba / ATS (F17) — JWT, CHỈ OrgAdmin ──────────────────
  /**
   * POST /campaign/api-keys → 201. **Response duy nhất mang key thô** (`CreateApiKeyResponse.key`);
   * DB chỉ giữ hash nên không có đường đọc lại. 400 = `expiresInDays` ngoài dải cho phép hoặc
   * vượt trần số key active của org.
   */
  createApiKey(body: CreateApiKeyRequest): Observable<CreateApiKeyResponse> {
    return this.http.post<CreateApiKeyResponse>(`${this.base}/api-keys`, body);
  }

  /** GET /campaign/api-keys — key của org. Trả `ApiKeyListItem` (KHÔNG có key thô/hash). */
  listApiKeys(): Observable<ApiKeyListItem[]> {
    return this.http.get<ApiKeyListItem[]>(`${this.base}/api-keys`);
  }

  /**
   * DELETE /campaign/api-keys/{id} — thu hồi (soft), **idempotent** → 204.
   * Key của org khác → 404 (backend cố ý không xác nhận hộ là key đó tồn tại).
   */
  revokeApiKey(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/api-keys/${id}`);
  }
}

/**
 * Multipart cho POST/PUT `/campaign/{id}/files`. Tên field khớp `UploadCampaignFilesRequest`
 * (`JdFile`/`CriteriaFile`) — model binding của ASP.NET không phân biệt hoa/thường.
 * Chỉ append file thật sự có: gửi phần rỗng sẽ bị bind thành `IFormFile` độ dài 0 thay vì null.
 */
function buildFileForm(files: { jdFile?: File | null; criteriaFile?: File | null }): FormData {
  const form = new FormData();
  if (files.jdFile) form.append('jdFile', files.jdFile, files.jdFile.name);
  if (files.criteriaFile) form.append('criteriaFile', files.criteriaFile, files.criteriaFile.name);
  return form;
}
