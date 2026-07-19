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

// Phỏng vấn THÍCH ỨNG (INT-17) — nguồn câu hỏi. Seed = mở đầu; còn lại do AI sinh động theo câu trả lời.
export type QuestionKind = 'Seed' | 'FollowUp' | 'Clarify' | 'NewQuestion';
/** Nhãn hiển thị badge (Seed không hiện badge — đó là câu bình thường). */
export const QUESTION_KIND_LABEL: Record<Exclude<QuestionKind, 'Seed'>, string> = {
  FollowUp: 'AI hỏi sâu',
  Clarify: 'AI làm rõ',
  NewQuestion: 'Chủ đề mới',
};

// INT-17 — hành động AI quyết định sau mỗi câu trả lời.
export type AdaptiveAction = 'follow_up' | 'clarify' | 'new_question' | 'end';
export const ADAPTIVE_ACTION_MESSAGE: Record<AdaptiveAction, string> = {
  follow_up: 'AI hỏi sâu thêm về câu trả lời vừa rồi.',
  clarify: 'AI muốn bạn làm rõ câu trả lời.',
  new_question: 'AI chuyển sang một năng lực khác.',
  end: 'AI đã hỏi xong — bạn có thể nộp bài.',
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
  /**
   * F18 — đơn đã Paid rồi được admin hoàn tiền. Trạng thái RIÊNG chứ không tái dùng
   * `Cancelled` ("đơn chết trước khi có tiền"): báo cáo doanh thu phải phân biệt được
   * "chưa bao giờ thu" với "đã thu rồi trả lại".
   */
  Refunded = 6,
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
/** Ví: B2C (User) luôn Prepaid; Org có thể Postpaid (hạn mức + hoá đơn cuối kỳ). */
export enum PaymentMode {
  Prepaid = 0,
  Postpaid = 1,
}
export enum CreditAccountStatus {
  Active = 0,
  Suspended = 1,
}
export enum InvoiceStatus {
  Issued = 0,
  Paid = 1,
  Overdue = 2,
  Void = 3,
}

/**
 * Lý do 1 bút toán credit. Ba loại "được cộng" KHÁC NHAU VỀ BẢN CHẤT — gộp chung một nhãn
 * là nói dối người dùng: FreeGrant là suất tặng lúc mở ví (F7), PromoGrant là quà admin cấp
 * tay (F20), còn Purchase mới là credit họ bỏ tiền mua.
 */
export enum CreditTransactionReason {
  Purchase = 0,
  Consume = 1,
  Refund = 2,
  FreeGrant = 3,
  PromoGrant = 4,
}

export const CREDIT_REASON_LABEL: Record<number, string> = {
  [CreditTransactionReason.Purchase]: 'Mua credit',
  [CreditTransactionReason.Consume]: 'Đã dùng',
  [CreditTransactionReason.Refund]: 'Hoàn tiền',
  [CreditTransactionReason.FreeGrant]: 'Suất dùng thử',
  [CreditTransactionReason.PromoGrant]: 'Quà khuyến mãi',
};

export const ORDER_STATUS_LABEL: Record<number, string> = {
  [OrderStatus.Pending]: 'Đang chờ thanh toán',
  [OrderStatus.Paid]: 'Đã thanh toán',
  [OrderStatus.Failed]: 'Thất bại',
  [OrderStatus.Expired]: 'Hết hạn',
  [OrderStatus.Cancelled]: 'Đã huỷ',
  [OrderStatus.Refunded]: 'Đã hoàn tiền',
};
export const PACKAGE_TYPE_LABEL: Record<number, string> = {
  [PackageType.OneTime]: 'Mua lẻ',
  [PackageType.Subscription]: 'Gói định kỳ',
};

/** status CHUỖI của riêng endpoint GET /payment/order/{id}/status (ngoại lệ Payment). */
export type OrderStatusString = 'Pending' | 'Paid' | 'Failed' | 'Expired' | 'Cancelled';
