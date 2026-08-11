// `PlanAudience`/`InterviewFunding` ĐÃ có sẵn trong payment.models.ts (màn admin CRUD gói dùng trước)
// — khai lại ở đây sẽ thành hai enum trùng tên cùng được re-export từ `index.ts`.
import { InterviewFunding, PlanAudience } from './payment.models';

/**
 * GET /payment/plans — bảng giá gói phân tầng (public, không cần đăng nhập).
 *
 * ⚠ `packages` RỖNG nghĩa là gói không bán SKU nào (gói miễn phí, hoặc SKU đã ngừng bán) ⇒ ẩn nút Mua.
 * Gói (`plans`) không phải thứ mua được — thứ mua được là `packageId` trong đây, truyền thẳng vào
 * `POST /payment/order` như mọi gói credit khác.
 */
export interface PublicPlanResponse {
  id: string;
  audience: PlanAudience;
  code: string;
  name: string;
  rank: number;
  interviewFunding: InterviewFunding;
  monthlyQuota: number | null;
  adaptiveEnabled: boolean;
  adaptiveMaxQuestions: number | null;
  adaptiveMaxFollowups: number | null;
  groundingEnabled: boolean;
  selfConsistencyN: number;
  cvAnalysisIncluded: boolean;
  repoAnalysisIncluded: boolean;
  roadmapEnabled: boolean;
  maxQuestionsCap: number | null;
  maxActiveCampaigns: number | null;
  maxCandidatesCap: number | null;
  postpaidEligible: boolean;
  seatCount: number | null;
  packages: PlanPackageOption[];
}

export interface PlanPackageOption {
  packageId: string;
  name: string;
  priceVnd: number;
  durationDays: number | null;
}

/**
 * GET /payment/plans/me — gói ĐANG DÙNG của chính người gọi.
 *
 * Chưa mua gì KHÔNG phải lỗi: server trả gói mặc định (`free` / `starter`) với `isPaid=false`.
 */
export interface MyPlanResponse {
  audience: PlanAudience;
  tierCode: string;
  tierName: string;
  tierRank: number;
  interviewFunding: InterviewFunding;
  isPaid: boolean;
  expiresAt: string | null;
  monthlyQuota: number | null;
  quotaUsed: number | null;
  quotaReserved: number | null;
  /** Đã trừ CẢ lượt đang giữ — khớp guard `used + reserved + 1 <= quota` của server. */
  quotaRemaining: number | null;
  periodStart: string | null;
  /**
   * `Tiering:Enabled` phía server. FALSE = quyền lợi gói CHƯA có hiệu lực lúc chạy ⇒ phải ẩn nút Mua,
   * không thì bán thứ người mua chưa dùng được.
   */
  tieringEnabled: boolean;
}
