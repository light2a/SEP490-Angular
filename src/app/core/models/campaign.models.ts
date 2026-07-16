import { CampaignStatus, CandidateInterviewStatus } from './enums';

/** Tín hiệu proctoring (anti-cheat B2B) gửi lên backend — flag cho HR, KHÔNG auto-hủy. */
export type ProctorSignalType = 'tab_switch' | 'paste' | 'focus_lost';

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
}

/** POST /campaign/{id}/start — create-or-get session (402 = org hết credit, 409 = completed/closed). */
export interface StartInterviewResult {
  sessionId: string;
  campaignId: string;
  questions: CampaignQuestion[];
  antiCheatEnabled: boolean;
  faceEnrollRequired: boolean;
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

/** Nguồn tiêu chí (HrEdited = HR khai; AiSuggested = AI gợi ý). */
export type CriterionSource = 'HrEdited' | 'AiSuggested';

/** 1 câu hỏi campaign (đọc) — GET /campaign/{id}. */
export interface CampaignQuestionResponse {
  id: string;
  questionText: string;
  source: QuestionSource;
  isRequired: boolean;
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
}

/** GET /campaign & GET /campaign/{id} — campaign đầy đủ hướng Employer. */
export interface CampaignResponse {
  id: string;
  orgId: string;
  title: string;
  domain?: string | null;
  status: CampaignStatus;
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled: boolean;
  faceVerifyEnabled: boolean;
  passScorePct?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  questions: CampaignQuestionResponse[];
  criteria: CampaignCriterionResponse[];
  jdText?: string | null;
  criteriaText?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tiêu chí HR khai thẳng (ghi) — Σweight ∈ [0.99,1.01] → BE chuẩn hoá Σ→1. */
export interface CriterionItem {
  name: string;
  weight: number;
  maxScore: number;
  description?: string | null;
}

/** Câu hỏi HR khai (ghi). */
export interface QuestionItem {
  questionText: string;
  source: QuestionSource;
  isRequired: boolean;
}

/** POST /campaign — tạo campaign Draft. StartsAt/ExpiresAt KHÔNG được quá khứ; StartsAt < ExpiresAt; ≥1 question. */
export interface CreateCampaignRequest {
  title: string;
  domain?: string | null;
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled: boolean;
  faceVerifyEnabled: boolean;
  passScorePct?: number | null;
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
  maxCandidates?: number | null;
  timeLimitMinutes?: number | null;
  antiCheatEnabled?: boolean;
  faceVerifyEnabled?: boolean;
  passScorePct?: number | null;
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
}

/** PUT /campaign/{id}/results/{sessionId}/override — HR chốt điểm cuối. Score+Result null = clear (về AI). */
export interface OverrideResultRequest {
  score?: number | null;
  result?: string | null;
  note: string;
}
export interface CampaignResultsResponse {
  campaignId: string;
  passScorePct?: number | null;
  totalCandidates: number;
  results: CampaignResultRow[];
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
