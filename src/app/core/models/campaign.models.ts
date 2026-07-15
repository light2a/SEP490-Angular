import { CandidateInterviewStatus } from './enums';

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
  faceEnrollRequired: boolean;
}

/** POST .../face-check — kết quả đối chiếu khuôn mặt. */
export interface FaceCheckResult {
  match: boolean;
  faceCount: number;
  signals: string[];
}
