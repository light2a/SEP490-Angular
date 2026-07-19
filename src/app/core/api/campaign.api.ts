import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CampaignResponse,
  CampaignResultsResponse,
  CandidateDetailResponse,
  CandidateListItem,
  CreateCampaignRequest,
  PatchCandidateRequest,
  CreateInvitationsRequest,
  CreateInvitationsResponse,
  FaceCheckResult,
  InvitationInfo,
  InviteShortlistRequest,
  InviteShortlistResponse,
  OverrideResultRequest,
  JoinCampaignResult,
  MyCampaignDetail,
  MyCampaignSummary,
  ProctorSignalType,
  QuestionItem,
  ScreenCandidatesResponse,
  SessionTranscriptResponse,
  StartInterviewResult,
  TransitionStatusRequest,
  UpdateCampaignRequest,
} from '../models';

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

  /** Public — join: backend provision Candidate + trả JWT (KHÔNG refreshToken → AuthStore.setAccessOnlySession). */
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

  /** POST /campaign/{id}/publish → Active (sinh campaign_criteria từ text/structured). */
  publishCampaign(id: string): Observable<CampaignResponse> {
    return this.http.post<CampaignResponse>(`${this.base}/${id}/publish`, {});
  }

  /** PUT /campaign/{id}/status — Active→Closed→Archived. */
  transitionStatus(id: string, body: TransitionStatusRequest): Observable<CampaignResponse> {
    return this.http.put<CampaignResponse>(`${this.base}/${id}/status`, body);
  }

  /** DELETE /campaign/{id} — soft-delete. */
  deleteCampaign(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  // ── Mời ứng viên (đường 1: email) ──────────────────────────────────────────
  /** POST /campaign/{id}/invitations — mời theo danh sách email → {created[], failed[]}. */
  createInvitations(
    id: string,
    body: CreateInvitationsRequest,
  ): Observable<CreateInvitationsResponse> {
    return this.http.post<CreateInvitationsResponse>(`${this.base}/${id}/invitations`, body);
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

  /** POST /campaign/{id}/candidates/invite — mời shortlist theo candidateIds. */
  inviteShortlist(
    id: string,
    body: InviteShortlistRequest,
  ): Observable<InviteShortlistResponse> {
    return this.http.post<InviteShortlistResponse>(`${this.base}/${id}/candidates/invite`, body);
  }
}
