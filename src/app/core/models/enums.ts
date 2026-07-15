/**
 * Enum toàn hệ thống. QUY TẮC QUAN TRỌNG (khác nhau theo service):
 *  - Auth / Interview / Campaign: enum serialize dạng CHUỖI  → dùng string-literal union.
 *  - Payment: enum serialize dạng SỐ (integer)               → dùng numeric enum + bảng nhãn.
 * Xem docs/api-spec.md §Enum.
 */

// ---------- Auth ----------
export type PlatformRole = 'Candidate' | 'Employer' | 'Admin';
export type OrgRole = 'OrgAdmin' | 'HrMember';

// ---------- Interview (CHUỖI) ----------
export type JobCategory = 'BA' | 'BE' | 'FE';
export const JOB_CATEGORIES: readonly JobCategory[] = ['BA', 'BE', 'FE'] as const;
export const JOB_CATEGORY_LABEL: Record<JobCategory, string> = {
  BA: 'Business Analyst (BA)',
  BE: 'Backend (BE)',
  FE: 'Frontend (FE)',
};

export type SessionStatus =
  | 'GeneratingQuestions'
  | 'Ready'
  | 'InProgress'
  | 'Completed'
  | 'Scoring'
  | 'Scored'
  | 'Failed'
  | 'SessionAbandoned';

/** Trạng thái "đang chạy tiếp" (poll) vs "kết thúc". */
export const SESSION_TERMINAL: readonly SessionStatus[] = ['Scored', 'Failed', 'SessionAbandoned'] as const;
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  GeneratingQuestions: 'Đang sinh câu hỏi',
  Ready: 'Sẵn sàng',
  InProgress: 'Đang làm',
  Completed: 'Đã nộp',
  Scoring: 'Đang chấm',
  Scored: 'Đã chấm',
  Failed: 'Lỗi',
  SessionAbandoned: 'Đã huỷ/quá hạn',
};

export type AnswerStatus =
  | 'Uploaded'
  | 'Transcribing'
  | 'Transcribed'
  | 'Scoring'
  | 'Scored'
  | 'Skipped'
  | 'Failed';
export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  Uploaded: 'Đã tải lên',
  Transcribing: 'Đang bóc băng',
  Transcribed: 'Đã bóc băng',
  Scoring: 'Đang chấm',
  Scored: 'Đã chấm',
  Skipped: 'Bỏ qua',
  Failed: 'Lỗi',
};

export type RoadmapLevel = 'Fresher' | 'Junior' | 'Middle' | 'Senior';
export const ROADMAP_LEVELS: readonly RoadmapLevel[] = ['Fresher', 'Junior', 'Middle', 'Senior'] as const;
export type RoadmapStatus = 'Active' | 'Completed' | 'Abandoned';
export type MilestoneStatus = 'Pending' | 'InProgress' | 'Completed';
export type LessonStatus = 'Theory' | 'Practicing' | 'Done';

// ---------- Campaign (CHUỖI) ----------
export type CampaignStatus = 'Draft' | 'Active' | 'Closed' | 'Archived';
export type CandidateInterviewStatus = 'NotStarted' | 'InProgress' | 'Completed';
export const CANDIDATE_INTERVIEW_STATUS_LABEL: Record<CandidateInterviewStatus, string> = {
  NotStarted: 'Chưa phỏng vấn',
  InProgress: 'Đang phỏng vấn',
  Completed: 'Đã hoàn thành',
};

// ---------- Payment (SỐ) ----------
export enum OrderStatus {
  Pending = 1,
  Paid = 2,
  Failed = 3,
  Expired = 4,
  Cancelled = 5,
}
export enum OrderKind {
  CreditPack = 0,
  InvoiceSettlement = 1,
  SubscriptionPurchase = 2,
  SubscriptionRenewal = 3,
}
export enum OwnerType {
  Org = 0,
  User = 1,
}
export enum PackageType {
  OneTime = 1,
  Subscription = 2,
}
export enum InvoiceStatus {
  Issued = 0,
  Paid = 1,
  Overdue = 2,
  Void = 3,
}

export const ORDER_STATUS_LABEL: Record<number, string> = {
  [OrderStatus.Pending]: 'Đang chờ thanh toán',
  [OrderStatus.Paid]: 'Đã thanh toán',
  [OrderStatus.Failed]: 'Thất bại',
  [OrderStatus.Expired]: 'Hết hạn',
  [OrderStatus.Cancelled]: 'Đã huỷ',
};
export const PACKAGE_TYPE_LABEL: Record<number, string> = {
  [PackageType.OneTime]: 'Mua lẻ',
  [PackageType.Subscription]: 'Gói định kỳ',
};

/** status CHUỖI của riêng endpoint GET /payment/order/{id}/status (ngoại lệ Payment). */
export type OrderStatusString = 'Pending' | 'Paid' | 'Failed' | 'Expired' | 'Cancelled';
