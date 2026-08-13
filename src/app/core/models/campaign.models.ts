import { CampaignStatus, CandidateInterviewStatus, QuestionKind } from './enums';

/**
 * Tín hiệu proctoring (anti-cheat B2B) gửi lên backend — flag cho HR, KHÔNG auto-hủy.
 * `camera_blocked` (F4): OS/trình duyệt từ chối quyền camera ⇒ buổi thi KHÔNG được giám sát mặt.
 * Trước F4 lỗi này bị nuốt lặng lẽ, HR không phân biệt được "sạch" với "camera chưa từng bật".
 */
export type ProctorSignalType = 'tab_switch' | 'paste' | 'focus_lost' | 'camera_blocked';

/**
 * Nhãn tiếng Việt cho cờ gian lận hiện cho HR (bảng kết quả). Phủ CẢ 8 loại backend chấp nhận:
 * 4 cờ FE (`FeSignals`) + 5 cờ AIService (`AiSignals`).
 * Giá trị lạ (backend thêm signal mới trước khi FE kịp cập nhật) → `proctorSignalLabel` fallback
 * về chuỗi thô, KHÔNG hiện ô trống (thà HR thấy `foo_bar` còn hơn mất cảnh báo).
 */
export const PROCTOR_SIGNAL_LABEL: Record<string, string> = {
  tab_switch: 'Chuyển tab',
  paste: 'Dán nội dung',
  focus_lost: 'Rời cửa sổ thi',
  camera_blocked: 'Camera bị chặn',
  face_mismatch: 'Khuôn mặt không khớp',
  no_face: 'Không thấy khuôn mặt',
  multiple_faces: 'Nhiều khuôn mặt',
  multi_voice: 'Nhiều giọng nói',
  identity_unverified: 'Chưa xác minh danh tính',
};

/** Nhãn hiển thị của 1 cờ; không có trong bảng → trả nguyên `type`. */
export function proctorSignalLabel(type: string): string {
  return PROCTOR_SIGNAL_LABEL[type] ?? type;
}

/** Tiêu chí đánh giá của campaign (name/weight/maxScore — CAMP-5). */
export interface CampaignCriterion {
  name: string;
  weight: number;
  maxScore: number;
  description?: string | null;
}

/** GET /campaign/invitations/{token} (public) — metadata lời mời. */
export interface InvitationInfo {
  campaignId: string;
  title: string;
  orgName?: string | null;
  jobTitle: string;
  description?: string | null;
  deadline?: string | null;
  criteria: CampaignCriterion[];
}

/** POST /campaign/invitations/{token}/join — accessToken là JWT Candidate (KHÔNG có refreshToken). */
export interface JoinCampaignResult {
  accessToken: string;
  campaignId: string;
  candidateId: string;
  /** Trạng thái membership (chuỗi backend, vd 'Joined'). */
  membershipStatus: string;
}

/** GET /campaign/my-campaigns — 1 dòng danh sách. */
export interface MyCampaignSummary {
  campaignId: string;
  title: string;
  jobTitle: string;
  deadline?: string | null;
  membershipStatus: string;
  interviewStatus: CandidateInterviewStatus;
}

/** GET /campaign/my-campaigns/{id} — summary + chi tiết. */
export interface MyCampaignDetail extends MyCampaignSummary {
  description?: string | null;
  criteria: CampaignCriterion[];
  sessionId?: string | null;
  started: boolean;
}

/** Câu hỏi trả về từ start (cùng shape câu hỏi Interview, không có answer). */
export interface CampaignQuestion {
  id: string;
  orderNo: number;
  content: string;
  timeLimitSec: number;
  /** Phỏng vấn THÍCH ỨNG (INT-17): Seed = câu campaign gốc; FollowUp/Clarify/NewQuestion = AI sinh động. */
  kind?: QuestionKind;
}

/** POST /campaign/{id}/start — create-or-get session (402 = org hết credit, 409 = completed/closed). */
export interface StartInterviewResult {
  sessionId: string;
  campaignId: string;
  questions: CampaignQuestion[];
  antiCheatEnabled: boolean;
  faceEnrollRequired: boolean;
  /** INT-17: campaign bật thích ứng → sẽ có câu hỏi AI sinh ở đuôi (sau khi trả lời hết seed). */
  adaptiveEnabled?: boolean;
}

/** POST .../face-check — kết quả đối chiếu khuôn mặt. */
export interface FaceCheckResult {
  match: boolean;
  faceCount: number;
  signals: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYER / HR (B2B orchestrator) — quản lý campaign, tiêu chí, mời, kết quả.
// Enum Campaign serialize CHUỖI. Nguồn: docs/services/campaign.md + DTO backend.
// ─────────────────────────────────────────────────────────────────────────────

/** Nguồn câu hỏi B2B (CustomHr = HR khai tay; AiGenerated = sinh từ JD). */
export type QuestionSource = 'CustomHr' | 'AiGenerated';

/**
 * Cấp độ ứng viên của chiến dịch — AI dùng để định độ khó câu hỏi.
 * Backend `ValidateSeniority` phân biệt HOA/thường và **từ chối chuỗi rỗng bằng 400**
 * (trước đó `""` âm thầm ghi đè về `Junior` = mất dữ liệu không báo). Vì thế FE không
 * bao giờ được gửi `''` — hoặc gửi một trong 4 giá trị dưới, hoặc bỏ hẳn field.
 */
export type CampaignSeniority = 'Fresher' | 'Junior' | 'Middle' | 'Senior';

/** 4 mức seniority + nhãn tiếng Việt cho ô chọn. */
export const CAMPAIGN_SENIORITY_OPTIONS: ReadonlyArray<{
  value: CampaignSeniority;
  label: string;
}> = [
  { value: 'Fresher', label: 'Fresher (mới ra trường)' },
  { value: 'Junior', label: 'Junior (dưới 2 năm)' },
  { value: 'Middle', label: 'Middle (2–5 năm)' },
  { value: 'Senior', label: 'Senior (trên 5 năm)' },
];

/**
 * Ngôn ngữ BÀI PHỎNG VẤN của chiến dịch (không phải ngôn ngữ giao diện). Câu hỏi, nhận xét
 * và câu trả lời mẫu do AI sinh đều theo giá trị này. Backend chỉ nhận 'vi' | 'en'.
 */
export type CampaignLanguage = 'vi' | 'en';

/** 2 ngôn ngữ + nhãn cho ô chọn. */
export const CAMPAIGN_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: CampaignLanguage;
  label: string;
}> = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh' },
];

/** Nguồn tiêu chí (HrEdited = HR khai; AiSuggested = AI gợi ý). */
export type CriterionSource = 'HrEdited' | 'AiSuggested';

/** 1 câu hỏi campaign (đọc) — GET /campaign/{id}. */
export interface CampaignQuestionResponse {
  id: string;
  questionText: string;
  source: QuestionSource;
  /** Câu BẮT BUỘC — mọi ứng viên đều gặp. `false` = nằm trong rổ rút thăm (xem `questionsPerSession`). */
  isRequired: boolean;
  /**
   * Đáp án mẫu HR soạn. `undefined` ở DANH SÁCH campaign (BE cố ý không trả để payload không cõng
   * tới 200 × 5.000 ký tự mỗi lần mở trang) — chỉ màn chi tiết/sửa mới có.
   */
  sampleAnswer?: string | null;
  /** Nhóm chủ đề — dùng để rút đề ĐỀU theo nhóm khi bật ngân hàng đề. */
  questionGroup?: string | null;
}

/**
 * 1 MỐC ĐIỂM của thước đo (E9 hard-anchor). `score` là điểm thật trên thang `maxScore` của tiêu
 * chí, `descriptor` mô tả **quan sát được** ứng viên làm/nói gì ở mức đó — không phải tính từ đánh
 * giá ("khá", "tốt") vì đó chỉ là đổi tên con số.
 *
 * Quy ước soạn: hai vế `CÓ: … | CÒN THIẾU: …` — vế sau ép mô tả dựng **biên** giữa mức n và n+1,
 * nếu không thì gradient mờ và AI không phân biệt được 3 với 6.
 */
export interface CriterionLevelItem {
  score: number;
  descriptor: string;
}

/** 1 tiêu chí campaign có cấu trúc (đọc) — C12. */
export interface CampaignCriterionResponse {
  id: string;
  orderNo: number;
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
  source: CriterionSource;
  /**
   * Mốc điểm của tiêu chí, sắp tăng dần theo `score`. Backend LUÔN gửi field này; mảng **rỗng**
   * nghĩa là tiêu chí chưa có mốc (hợp lệ — lúc đó bộ chấm rơi về dải mặc định 0..maxScore).
   * Vẫn đọc phòng thủ (`?? []`) ở nơi hiển thị vì deploy backend cũ hơn không có field.
   */
  levels: CriterionLevelItem[];
}

/** GET /campaign & GET /campaign/{id} — campaign đầy đủ hướng Employer. */
export interface CampaignResponse {
  id: string;
  orgId: string;
  title: string;
  domain?: string | null;
  /** Cấp độ ứng viên — AI định độ khó câu hỏi theo mức này. Backend mặc định 'Junior'. */
  seniority?: CampaignSeniority | null;
  /** Ngôn ngữ bài phỏng vấn. Backend mặc định 'vi'; chiến dịch cũ có thể không trả field này. */
  language?: CampaignLanguage | null;
  status: CampaignStatus;
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled: boolean;
  faceVerifyEnabled: boolean;
  passScorePct?: number | null;
  /**
   * Trần ứng viên thi ĐỒNG THỜI. null = không giới hạn.
   * PHẢI >= 1 khi có: guard backend là `running >= max`, nên 0/số âm làm MỌI lượt Start trả 429
   * ⇒ khoá chiến dịch vĩnh viễn ngay từ ứng viên đầu tiên.
   */
  maxConcurrentInterviews?: number | null;
  /** INT-17: bật phỏng vấn THÍCH ỨNG cho chiến dịch (AI hỏi thêm ở đuôi sau khi hết câu seed). */
  adaptiveEnabled: boolean;
  /** INT-17: trần câu thích ứng / tổng câu. null = dùng mặc định phía backend. */
  maxFollowUps?: number | null;
  maxQuestions?: number | null;
  /** NGÂN HÀNG ĐỀ: số câu mỗi ứng viên thi, rút từ bộ câu hỏi. null = thi HẾT bộ. */
  questionsPerSession?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  questions: CampaignQuestionResponse[];
  criteria: CampaignCriterionResponse[];
  jdText?: string | null;
  criteriaText?: string | null;
  /**
   * Phiên bản THƯỚC ĐO (bộ tiêu chí + mốc điểm). Bắt đầu từ 1; mỗi lần HR sửa mốc trên chiến dịch
   * đang chạy thì tăng 1 và **chỉ áp cho ứng viên thi sau đó** — người đã chấm giữ nguyên điểm.
   *
   * Đây là ĐỊNH DANH chứ không phải bộ đếm: được phép có lỗ số (v1, v3, không có v2) khi HR sửa
   * hai lần mà chưa ai vào thi ở giữa. Deploy backend cũ hơn không gửi field → `undefined` lúc
   * chạy, nơi hiển thị phải kiểm trước khi vẽ chip.
   */
  rubricVersion: number;
  rubricVersionUpdatedAt?: string | null;
  /** Tên người sửa thước đo lần gần nhất (BE resolve sẵn, FE không tra Auth). */
  rubricVersionUpdatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tiêu chí HR khai thẳng (ghi) — Σweight ∈ [0.99,1.01] → BE chuẩn hoá Σ→1. */
export interface CriterionItem {
  name: string;
  weight: number;
  maxScore: number;
  description?: string | null;

  /**
   * Mốc điểm — hợp đồng BA TRẠNG THÁI, giống `QuestionItem.sampleAnswer`:
   * - `undefined` / không gửi field = **KHÔNG ĐỔI** (giữ nguyên mốc đang có)
   * - `[]` = **XOÁ hết mốc**
   * - `[...]` = thay thế toàn bộ
   *
   * ⚠ Hai bẫy mất-mốc-câm, cả hai đều không sinh lỗi nào:
   * 1. PUT là **replace-all mint id mới**, nên BE ghép mốc cũ sang tiêu chí mới theo **`name`**.
   *    HR đổi TÊN tiêu chí mà client không gửi `levels` ⇒ carry-over trượt ⇒ mốc bay mất. Vì thế
   *    form BUỘC phải gửi `levels` khi tên đổi, kể cả khi HR không mở panel mốc.
   * 2. Khởi tạo mảng rỗng cho mọi hàng rồi gửi vô điều kiện ⇒ **mỗi lần Lưu là xoá sạch mốc**.
   *    Phải theo dõi "HR đã chạm panel chưa" và chỉ gửi khi đã chạm (xem `levelsTouched`).
   */
  levels?: CriterionLevelItem[] | null;
}

/** Câu hỏi campaign (ghi) — F10. */
export interface QuestionItem {
  /**
   * F10 — id của câu hỏi ĐANG CÓ (echo lại từ `CampaignQuestionResponse.id`).
   * Có id  → BE sửa đúng row đó, GIỮ NGUYÊN `source` (câu AI không mất nhãn `AiGenerated`) + thứ tự.
   * Không id → câu mới; BE luôn ghi `source = CustomHr`.
   * ⚠ Bỏ id khi gửi lại một câu đang có = BE hiểu "xoá câu cũ + thêm câu mới" ⇒ mất provenance, mất id.
   */
  id?: string;

  questionText: string;

  /**
   * ⚠ BE KHÔNG đọc field này — nguồn gốc do server quyết (F9 = AiGenerated, HR gõ tay = CustomHr).
   * Giữ optional cho tương thích ngược; đừng gửi 'CustomHr' cho mọi câu như bản trước F10.
   */
  source?: QuestionSource;

  isRequired: boolean;

  /**
   * Đáp án mẫu. BE hiểu BA trạng thái, không phải hai:
   * - `undefined` / không gửi field = **KHÔNG ĐỔI** (giữ nguyên đáp án đang có)
   * - `''` (chuỗi rỗng) = **XOÁ** đáp án
   * - chuỗi có nội dung = ghi đè
   *
   * ⚠ Đừng "dọn" bằng cách bỏ field khi ô trống — ô trống là ý định XOÁ của HR, bỏ field đi thì
   * đáp án cũ sống lại sau mỗi lần Lưu.
   */
  sampleAnswer?: string;

  /** Nhóm chủ đề. Cùng hợp đồng ba trạng thái với `sampleAnswer`. */
  questionGroup?: string;
}

/** 1 dòng lỗi khi nhập câu hỏi từ file CSV. */
export interface ImportRowError {
  /** Số dòng TRONG FILE, tính cả dòng tiêu đề (tiêu đề = 1) — HR mở Excel nhảy đúng tới dòng này. */
  line: number;
  column?: string | null;
  message: string;
}

/** Kết quả đọc file CSV — POST /campaign/{id}/questions/import. CHỈ ĐỌC, BE không ghi gì. */
export interface ImportQuestionsResult {
  totalRows: number;
  /** Dòng hợp lệ, đúng thứ tự file. Nhồi thẳng vào form rồi Lưu — không cần ánh xạ lại. */
  questions: QuestionItem[];
  /** Dòng hỏng — không chặn cả file, HR sửa vài dòng dễ hơn tải lại từ đầu. */
  errors: ImportRowError[];
}

/** POST /campaign — tạo campaign Draft. StartsAt/ExpiresAt KHÔNG được quá khứ; StartsAt < ExpiresAt; ≥1 question. */
export interface CreateCampaignRequest {
  title: string;
  domain?: string | null;
  /** Không gửi → backend mặc định 'Junior'. **Không bao giờ gửi chuỗi rỗng** (→ 400). */
  seniority?: CampaignSeniority;
  /** Không gửi → backend mặc định 'vi'. **Không bao giờ gửi chuỗi rỗng** (→ 400, cùng luật seniority). */
  language?: CampaignLanguage;
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled: boolean;
  faceVerifyEnabled: boolean;
  passScorePct?: number | null;
  /** Trần thi đồng thời — null = không giới hạn; có giá trị thì phải >= 1 (ngược lại 400). */
  maxConcurrentInterviews?: number | null;
  /** INT-17: bật phỏng vấn thích ứng (không gửi → backend mặc định false = luồng tĩnh). */
  adaptiveEnabled: boolean;
  maxFollowUps?: number | null;
  maxQuestions?: number | null;
  /** NGÂN HÀNG ĐỀ: số câu mỗi ứng viên thi. Không gửi = thi HẾT bộ. Có gửi thì phải >= 1. */
  questionsPerSession?: number | null;
  jdText?: string | null;
  criteriaText?: string | null;
  criteria?: CriterionItem[];
  questions: QuestionItem[];
  startsAt?: string | null;
  expiresAt?: string | null;
}

/** PUT /campaign/{id} — sửa metadata + JD/criteria (chỉ Draft). */
export interface UpdateCampaignRequest {
  title: string;
  domain?: string | null;
  /**
   * undefined/null = KHÔNG đổi (giữ mức cũ). ⚠ Chuỗi rỗng KHÔNG phải "không đổi" — backend trả 400
   * (có chủ đích: `""` từng âm thầm hạ mức đã chọn về Junior). Kiểu ở đây cấm luôn `''`.
   */
  seniority?: CampaignSeniority | null;
  /** undefined/null = KHÔNG đổi. Chuỗi rỗng → 400 (kiểu ở đây cấm luôn `''`). */
  language?: CampaignLanguage | null;
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled?: boolean;
  faceVerifyEnabled?: boolean;
  passScorePct?: number | null;
  /**
   * null = KHÔNG đổi (giữ trần cũ) — đồng nếp với các trần khác.
   * ⚠ Hệ quả: đã đặt trần thì KHÔNG gỡ về "không giới hạn" qua API được; muốn bỏ trần thì đặt
   * một số lớn hơn số ứng viên của chiến dịch.
   */
  maxConcurrentInterviews?: number | null;
  /** INT-17: undefined/null = KHÔNG đổi (giữ giá trị cũ), như antiCheatEnabled. */
  adaptiveEnabled?: boolean;
  maxFollowUps?: number | null;
  maxQuestions?: number | null;
  /** NGÂN HÀNG ĐỀ: undefined/null = KHÔNG đổi (giữ giá trị cũ), cùng nếp các trần trên. */
  questionsPerSession?: number | null;
  jdText?: string | null;
  criteriaText?: string | null;
  criteria?: CriterionItem[];
  startsAt?: string | null;
  expiresAt?: string | null;
}

/** PUT /campaign/{id}/status — Active→Closed→Archived (Draft→Active dùng /publish). */
export interface TransitionStatusRequest {
  status: CampaignStatus;
}

// ── Mời ứng viên (đường 1: theo email) ──────────────────────────────────────
export interface CreateInvitationsRequest {
  emails: string[];
}
export interface InvitationItem {
  id: string;
  email: string;
  expiresAt?: string | null;
}
export interface FailedInvitationItem {
  email: string;
  reason: string;
}
export interface CreateInvitationsResponse {
  created: InvitationItem[];
  failed: FailedInvitationItem[];
}

/**
 * Trạng thái giao lời mời — backend **suy read-time** từ các mốc thời gian, không lưu cột riêng.
 * Thứ tự ưu tiên khi suy: Revoked → Joined → Expired → Sent → Queued. (Revoked đứng TRƯỚC Joined
 * có chủ ý: sau reissue, lời mời cũ phải hiện Revoked chứ không "thơm lây" trạng thái Joined của
 * lời mời mới cùng email.)
 */
export type InvitationDeliveryStatus = 'Revoked' | 'Joined' | 'Expired' | 'Sent' | 'Queued';

/** Nhãn tiếng Việt; giá trị lạ → `invitationStatusLabel` trả nguyên chuỗi thô. */
export const INVITATION_STATUS_LABEL: Record<string, string> = {
  Revoked: 'Đã thu hồi',
  Joined: 'Đã tham gia',
  Expired: 'Hết hạn',
  Sent: 'Đã gửi mail',
  Queued: 'Đang chờ gửi',
};

export function invitationStatusLabel(status: string): string {
  return INVITATION_STATUS_LABEL[status] ?? status;
}

/**
 * GET /campaign/{id}/invitations — 1 dòng lời mời ĐÃ PHÁT.
 *
 * Trước endpoint này, `created[]` chỉ sống trong đúng response của lần POST ⇒ HR đóng tab là
 * mất dấu hoàn toàn, và đường-1 (mời thẳng email) không sinh row `cv_submission` nên
 * `GET /candidates` cũng không thấy. Đây cũng là chỗ DUY NHẤT lấy được `id` để bấm "Gửi lại" (D4).
 *
 * ⚠ DB23 — **không bao giờ có token** (DB chỉ giữ hash). Đừng chờ field đó.
 */
export interface InvitationListItem {
  id: string;
  email: string;
  status: InvitationDeliveryStatus | string;
  /** Producer-side: đã vào outbox. */
  sentAt?: string | null;
  /** Consumer-side: SMTP đã gửi thật. */
  emailSentAt?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  /** Từ membership (D2); null = chưa tham gia. */
  joinedAt?: string | null;
  /** Đường-2 (mời từ shortlist CV): link về `cv_submission`. Đường-1 = null. */
  campaignCandidateId?: string | null;
  createdAt: string;
}

// ── Kết quả + xếp hạng (E5/E6) ──────────────────────────────────────────────
/** 1 loại cờ anti-cheat đã gom cho HR (SEC-4). */
export interface FlagDto {
  type: string;
  count: number;
  note?: string | null;
}
export interface CampaignResultRow {
  rank: number;
  candidateId: string;
  /**
   * F5 — danh tính người-đọc-được. Có thể null: membership "đường-1" (mời thẳng qua email) tạo
   * trước F5 không có nguồn dữ liệu để suy ra, và BE cố ý KHÔNG đoán (email sai còn tệ hơn trống).
   */
  fullName?: string | null;
  email?: string | null;
  sessionId: string;
  /** Điểm effective (đã áp override HR nếu có). */
  totalScore: number;
  /** 'Pass' | 'Fail' | null (ngưỡng chưa đặt → HR quyết tay). */
  result?: string | null;
  scoredAt: string;
  flags: FlagDto[];
  /** E11b — điểm AI gốc (không đổi khi HR override). */
  aiScore: number;
  overrideScore?: number | null;
  overrideResult?: string | null;
  overrideNote?: string | null;
  overriddenAt?: string | null;
  /**
   * Thước đo đã dùng để chấm buổi này. **null = KHÔNG BIẾT** (buổi chấm trước khi có versioning),
   * KHÔNG được vẽ thành `v1`: suy "biết" từ "không biết" chính là lỗi BK23. Chip `?` + tooltip.
   */
  rubricVersion?: number | null;
}

/** PUT /campaign/{id}/results/{sessionId}/override — HR chốt điểm cuối. Score+Result null = clear (về AI). */
export interface OverrideResultRequest {
  score?: number | null;
  result?: string | null;
  note: string;
}
/**
 * R7 — ứng viên CÓ CỜ chống gian lận nhưng CHƯA được chấm (bỏ ngang / đang thi).
 *
 * `campaign_rankings` chỉ có row cho ứng viên `Scored` (CAMP-11) ⇒ bảng xếp hạng giấu mất
 * nhóm này, mà **bỏ ngang giữa chừng lại chính là hành vi đáng ngờ nhất**. Không rank/không
 * điểm (chưa chấm) — chỉ danh tính + cờ để HR tự đánh giá (D13: cờ = gợi ý, không auto-hủy).
 * Backend đã sắp nhiều-cờ-trước.
 */
export interface UnscoredFlaggedRow {
  candidateId: string;
  sessionId: string;
  /** F5 — có thể null với membership "đường-1" cũ; BE cố ý không đoán. */
  fullName?: string | null;
  email?: string | null;
  flags: FlagDto[];
}

export interface CampaignResultsResponse {
  campaignId: string;
  passScorePct?: number | null;
  totalCandidates: number;
  results: CampaignResultRow[];
  /**
   * R7 — additive (BE luôn gửi, nhưng deploy cũ thì không) ⇒ optional; nơi đọc phải `?? []`.
   * CỐ Ý là interface RIÊNG chứ không tái dùng `CampaignResultRow` với field optional:
   * `CampaignResultRow.flags`/`rank`/`totalScore` đang là non-optional và nhiều template bind
   * thẳng, nới lỏng chúng sẽ làm `strictTemplates` fail ở chỗ khác.
   */
  unscoredFlagged?: UnscoredFlaggedRow[];
  /**
   * Thước đo HIỆN TẠI của chiến dịch — để đối chiếu với `rubricVersion` từng dòng. Additive nên
   * optional; deploy cũ không gửi ⇒ nơi đọc coi như "không biết", không so sánh gì cả.
   */
  currentRubricVersion?: number | null;
}

// ── Mốc điểm: AI gợi ý + chấm thử (kiểm chứng thước đo trước khi phát link) ──
/** 1 tiêu chí kèm mốc do AI gợi ý — POST /campaign/{id}/criteria/levels/suggest. */
export interface SuggestedCriterionLevels {
  criterionId: string;
  name: string;
  maxScore: number;
  levels: CriterionLevelItem[];
}

/**
 * Kết quả gợi ý mốc. **Backend KHÔNG ghi DB** — chỉ trả về để HR xem/sửa rồi lưu qua `PUT /campaign/{id}`
 * như bình thường (giữ nhật ký thao tác + luật tăng phiên bản ở đúng một chỗ).
 * AI lỗi → 502, KHÔNG có dải mặc định thay thế (fallback sẽ khiến HR tin `"Mức 3/10"` là do AI viết).
 */
export interface SuggestCriterionLevelsResponse {
  criteria: SuggestedCriterionLevels[];
}

/** Trạng thái 1 lượt chấm thử. `Running` là hàng rào chống bấm hai lần, tồn tại kể cả khi tab chết. */
export type RubricPreviewStatus = 'Running' | 'Succeeded' | 'Failed';

/** Bài mẫu thuộc nhóm nào. `Custom` = bài HR tự dán — bài DUY NHẤT không do bộ chấm viết ra. */
export type RubricPreviewBand = 'Weak' | 'Good' | 'Excellent' | 'Custom';

/** Điểm 1 tiêu chí trên 1 bài mẫu: mức KỲ VỌNG (code chọn trước) vs điểm THẬT (AI chấm). */
export interface RubricPreviewCriterionScore {
  criterionId: string;
  criterionName: string;
  maxScore: number;
  /** Mức do CODE chọn trước khi sinh bài — biết trước nên so được, không phải AI tự khai. */
  expectedLevel: number;
  actualScore: number;
  /** Mức mà AI tự nhận đã chọn (E9); null nếu bộ chấm không neo được về mốc nào. */
  levelMatched?: number | null;
  reasoning?: string | null;
}

/** 1 bài mẫu + điểm chấm được. */
export interface RubricPreviewSample {
  band: RubricPreviewBand;
  answerText: string;
  /** Đếm bởi backend — cùng nguồn với phép kiểm chênh lệch độ dài (`lengthParityWarning`). */
  wordCount: number;
  expectedWeightedPct: number;
  actualWeightedPct: number;
  scores: RubricPreviewCriterionScore[];
}

/** Ảnh chụp 1 tiêu chí tại thời điểm chấm thử — để đọc lại lịch sử mà không phụ thuộc bộ hiện tại. */
export interface RubricPreviewCriterionSnapshot {
  criterionId: string;
  name: string;
  weight: number;
  maxScore: number;
  levels: CriterionLevelItem[];
}

/**
 * 1 lượt chấm thử — POST/GET /campaign/{id}/rubric-preview.
 *
 * `rubricFingerprint` + `rubricVersion` + `promptVersion` là thứ làm "so trước/sau" TRUNG THỰC:
 * cùng dấu vân tay mà điểm khác = **nhiễu của mô hình**; khác dấu vân tay = **đã đổi thước đo**.
 * Thiếu chúng thì mọi so sánh giữa hai lượt đều là bịa, và HR sẽ quy mọi thay đổi cho việc mình
 * vừa sửa mốc (kể cả khi thực ra admin đổi prompt hệ thống ở giữa).
 */
export interface RubricPreviewRun {
  id: string;
  status: RubricPreviewStatus;
  /** Câu hỏi đã dùng; null khi câu đó đã bị xoá khỏi chiến dịch (không có FK, cố ý). */
  questionId?: string | null;
  /** Ảnh chụp nội dung câu hỏi lúc chạy — vẫn đọc được sau khi câu gốc bị thay. */
  questionText: string;
  rubricFingerprint: string;
  rubricVersion: number;
  promptVersion?: number | null;
  /**
   * **v1 luôn `false`**: bài mẫu là VĂN BẢN nên không có số đo cách nói (tốc độ, khoảng lặng, từ
   * đệm) như buổi thi có ghi âm. Là cờ CẤU TRÚC chứ không phải suy từ tên tiêu chí — nhận diện
   * tiêu chí "trôi chảy" bằng khớp tên sẽ bắn nhầm (tên do HR gõ, lại song ngữ).
   */
  deliveryMetricsAvailable: boolean;
  /**
   * 3 bài lệch nhau quá nhiều về SỐ TỪ. Khi đó dải điểm đẹp có thể chỉ phản ánh độ dài chứ không
   * phải thước đo phân biệt được — nên cảnh báo chứ không giấu.
   */
  lengthParityWarning: boolean;
  /** Lượt này có trừ credit ví Org hay không (3 lượt **thành công** đầu mỗi phiên bản là miễn phí). */
  billed: boolean;
  freeRunsRemaining: number;
  rubric: RubricPreviewCriterionSnapshot[];
  samples: RubricPreviewSample[];
  errorReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

/** POST /campaign/{id}/rubric-preview — `customAnswer` là bài thứ 4 tuỳ chọn do HR tự dán. */
export interface RunRubricPreviewRequest {
  questionId: string;
  customAnswer?: string;
}

// ── Transcript + dẫn chứng chấm điểm cho HR (AI4) ───────────────────────────
/**
 * Điểm + nhận xét AI của 1 tiêu chí trong 1 câu trả lời.
 *
 * `criterionId` là GUID `rubric_criteria` phía Interview (KHÁC id `campaign_criteria` vì được
 * materialize mới lúc tạo session) ⇒ FE không tra ngược tên được, phải nhận từ backend.
 *
 * ⚠ `criterionName`/`maxScore` **nullable có chủ đích**: buổi chấm trước 2026-07-18 không có hai
 * field này. Bỏ nhánh dự phòng về mã rút gọn = màn transcript của buổi cũ hiện trống.
 */
export interface TranscriptCriterionScore {
  criterionId: string;
  /** Tên tiêu chí do backend trả; null với buổi chấm cũ → hiển thị mã rút gọn của `criterionId`. */
  criterionName?: string | null;
  score: number;
  /** Thang điểm của tiêu chí (để hiện `3/5` thay vì `3`); null với buổi chấm cũ. */
  maxScore?: number | null;
  /** E11 — AI phải trích dẫn chứng từ transcript; rỗng/ngắn → BE bật needsReview. */
  reasoning?: string | null;
}

/** 1 câu hỏi + transcript câu trả lời + điểm từng tiêu chí. Chưa trả lời/Skipped → transcript null, scores rỗng. */
export interface TranscriptQuestion {
  questionId: string;
  orderNo: number;
  content: string;
  transcript?: string | null;
  /** E10 — spread điểm giữa các lần chấm vượt ngưỡng → AI không chắc, HR nên soi lại. */
  needsReview: boolean;
  scores: TranscriptCriterionScore[];
}

/** GET /campaign/{id}/results/{sessionId}/transcript — chi tiết 1 buổi cho HR đối chiếu điểm ranking. */
export interface SessionTranscriptResponse {
  sessionId: string;
  questions: TranscriptQuestion[];
}

// ── Lọc CV / shortlist (C13–C15) ────────────────────────────────────────────
export type ScreenedCandidateStatus =
  | 'Filtered'
  | 'Rejected'
  | 'Analyzing'
  | 'Analyzed'
  | 'AnalysisFailed'
  | 'Invited';

/** POST /campaign/{id}/candidates — kết quả sàng CV hàng loạt. */
export interface ScreenCandidatesResponse {
  received: number;
  rejected: number;
  filtered: number;
  skipped: number;
  candidates: ScreenedCandidateItem[];
}
export interface ScreenedCandidateItem {
  id: string;
  fullName?: string | null;
  email?: string | null;
  status: string;
  rejectReason?: string | null;
}

/** GET /campaign/{id}/candidates — 1 dòng danh sách (C13/C14). */
export interface CandidateListItem {
  id: string;
  fullName?: string | null;
  email?: string | null;
  status: string;
  overallMatchScore?: number | null;
  skills?: string[] | null;
  rejectReason?: string | null;
}

/** GET /campaign/{id}/candidates/{cid} — chi tiết ứng viên: summary + skills + điểm/reasoning từng tiêu chí. */
export interface CriterionScoreItem {
  criterionId: string;
  criterionName: string;
  matchScore: number;
  maxScore: number;
  reasoning?: string | null;
}
export interface CandidateDetailResponse {
  id: string;
  fullName?: string | null;
  email?: string | null;
  status: string;
  overallMatchScore?: number | null;
  skills?: string[] | null;
  yearsExperience?: number | null;
  summary?: string | null;
  rejectReason?: string | null;
  cvFileUrl?: string | null;
  criterionScores: CriterionScoreItem[];
}

/** PATCH /campaign/{id}/candidates/{cid} — HR bổ sung email/fullName khi CV không tách được. */
export interface PatchCandidateRequest {
  email?: string | null;
  fullName?: string | null;
}

// ── Khung giờ phỏng vấn (slot) ──────────────────────────────────────────────
/**
 * 1 khung giờ của chiến dịch. Ứng viên được gán slot chỉ vào thi được trong khoảng đó, và
 * `deadline` buổi thi = min(slot.endsAt, campaign.expiresAt).
 *
 * `assignedCount`/`startedCount` là số ĐỌC (BE tính), không gửi lên khi tạo/sửa.
 */
export interface CampaignSlotResponse {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  /** Số lời mời chưa thu hồi đã gán vào khung giờ này. */
  assignedCount: number;
  /** Số ứng viên ĐANG thi trong khung giờ này. */
  startedCount: number;
}

/** POST /campaign/{id}/slots — `endsAt` phải sau `startsAt`, `capacity` >= 1; chồng lấn giờ → 409. */
export interface CreateCampaignSlotRequest {
  startsAt: string;
  endsAt: string;
  capacity: number;
}

/**
 * PUT /campaign/{id}/slots/{slotId} — cùng ràng buộc với tạo, thêm:
 * hạ `capacity` xuống dưới số lời mời đã gán → 400.
 */
export interface UpdateCampaignSlotRequest {
  startsAt: string;
  endsAt: string;
  capacity: number;
}

/** GET /campaign/admin/campaigns — Admin oversight: 1 campaign cross-org. */
export interface AdminCampaignListItem {
  id: string;
  orgId: string;
  title: string;
  domain?: string | null;
  status: CampaignStatus;
  maxCandidates?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

/** POST /campaign/{id}/candidates/invite — mời theo shortlist. */
export interface InviteShortlistRequest {
  candidateIds: string[];
}
export interface InvitedCandidateItem {
  candidateId: string;
  invitationId: string;
  email: string;
}
export interface FailedInviteItem {
  candidateId: string;
  reason: string;
}
export interface InviteShortlistResponse {
  invited: InvitedCandidateItem[];
  failed: FailedInviteItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// API key cho bên thứ ba (F17) — chỉ OrgAdmin. Nguồn: docs/services/campaign.md
// §"Public API + API key cho bên thứ ba".
// ─────────────────────────────────────────────────────────────────────────────

/** POST /campaign/api-keys — `expiresInDays` ngoài `1..MaxExpiryDays` → 400; vượt trần key active/org → 400. */
export interface CreateApiKeyRequest {
  name: string;
  expiresInDays?: number | null;
  /** Mặc định false — PII (họ tên/email ứng viên) deny-by-default. */
  includePii?: boolean | null;
}

/**
 * Response của POST /campaign/api-keys — **thể duy nhất mang `key` thô**.
 *
 * Backend chỉ lưu hash nên không endpoint nào đọc lại được `key`: đóng hộp thoại mà chưa sao chép
 * là mất vĩnh viễn, phải thu hồi rồi tạo key khác. Vì thế kiểu này KHÁC `ApiKeyListItem` — tách
 * hai kiểu để không chỗ nào lỡ tay bind `key` vào bảng danh sách (danh sách không bao giờ có
 * trường đó, nên bind nhầm là lỗi biên dịch chứ không phải lỗi rò dữ liệu lúc chạy).
 */
export interface CreateApiKeyResponse {
  id: string;
  name: string;
  /** Chuỗi bí mật thô `isas_ak_…` — CHỈ xuất hiện ở đây, đúng một lần. */
  key: string;
  keyPrefix: string;
  includePii: boolean;
  expiresAt?: string | null;
  createdAt: string;
}

/**
 * GET /campaign/api-keys — 1 dòng danh sách. **Không bao giờ có `key` thô hoặc hash.**
 * `lastUsedAt` là tín hiệu để org dám thu hồi key (không có nó thì không ai biết key nào còn ai dùng).
 */
export interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  includePii: boolean;
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}
