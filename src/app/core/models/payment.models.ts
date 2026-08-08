import {
  CreditAccountStatus,
  CreditTransactionReason,
  InvoiceStatus,
  OrderKind,
  OrderStatus,
  OwnerType,
  PackageType,
  PaymentMode,
} from './enums';

/**
 * GET /payment/me/account — số dư ví của chính người đăng nhập (chủ ví suy từ JWT:
 * thuộc org → ví Org, không → ví cá nhân). Chưa từng mua credit → 200 với 0 credit.
 */
export interface CreditAccountResponse {
  ownerType: OwnerType;
  ownerId: string;
  paymentMode: PaymentMode;
  status: CreditAccountStatus;
  remainingCredits: number;
  reservedCredits: number;
  /**
   * F7 — tổng số credit dùng thử ĐÃ ĐƯỢC TẶNG cho ví này (không phải số còn lại). 0 với mọi ví Org
   * và với ví chưa từng tồn tại; > 0 vĩnh viễn sau khi đã tặng, kể cả khi đã tiêu hết.
   *
   * ⚠ Đây là dấu hiệu DUY NHẤT phân biệt "chưa có ví" với "đã có ví và tiêu hết quà": khi chủ ví
   * chưa có row `credit_accounts`, backend cố ý trả ví rỗng toàn số 0 và KHÔNG hứa trước suất dùng
   * thử (cấu hình có thể đổi/tắt) ⇒ không có field nào nói "còn N suất chưa cấp".
   */
  freeCreditsGranted: number;
  creditLimit?: number | null;
  periodUsage?: number | null;
  updatedAt: string;
}

/** GET /payment/package (enum dạng SỐ). */
export interface PackageResponse {
  id: string;
  name: string;
  type: PackageType;
  priceVnd: number;
  interviewCredits?: number | null;
  durationDays?: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateOrderRequest {
  packageId: string;
  /** Redirect PayOS về đúng khu vực người mua (candidate/employer). URL http(s) tuyệt đối; thiếu → config BE. */
  returnUrl?: string | null;
  cancelUrl?: string | null;
}

/** POST /payment/package (Admin) — tạo gói. interviewCredits required nếu OneTime; durationDays nếu Subscription. */
export interface CreatePackageRequest {
  name: string;
  type: PackageType;
  priceVnd: number;
  interviewCredits?: number | null;
  durationDays?: number | null;
}

/** PUT /payment/package/{id} (Admin) — sửa gói (chỉ trường gửi lên). */
export interface UpdatePackageRequest {
  name?: string | null;
  priceVnd?: number | null;
  interviewCredits?: number | null;
  durationDays?: number | null;
  isActive?: boolean | null;
}

/** POST /payment/admin/invoices/close (Admin) — chốt kỳ postpaid 1 org. */
export interface CloseBillingPeriodRequest {
  orgId: string;
  periodStart: string;
  periodEnd: string;
}

/** OrderResponse. checkoutUrl CHỈ có ở response tạo order & trả hoá đơn. */
export interface OrderResponse {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  kind: OrderKind;
  packageId?: string | null;
  invoiceId?: string | null;
  status: OrderStatus;
  amountVnd: number;
  payosOrderCode: number;
  expiredAt: string;
  paidAt?: string | null;
  createdAt: string;
  checkoutUrl?: string | null;
}

/**
 * 1 dòng sổ credit — GET /payment/me/credit-transactions (F19).
 * `delta` có DẤU: dương = được cộng, âm = bị trừ. `reason` là SỐ (quy ước Payment).
 * `grantedBy`/`note` chỉ có ở đường admin; ở endpoint /me chúng luôn null.
 */
export interface CreditTransactionResponse {
  id: string;
  delta: number;
  reason: CreditTransactionReason;
  orderId?: string | null;
  sessionId?: string | null;
  reversesTransactionId?: string | null;
  createdAt: string;
  grantedBy?: string | null;
  note?: string | null;
}

/** 1 trang sổ credit + con trỏ trang kế (đọc từ header `X-Next-Cursor`; null = hết trang). */
export interface CreditTransactionPage {
  items: CreditTransactionResponse[];
  nextCursor: string | null;
}

// ── Báo cáo doanh thu admin (F19) ───────────────────────────────────────────
/** 1 dòng theo loại đơn. `kind` là SỐ (quy ước Payment). */
export interface RevenueByKind {
  kind: OrderKind;
  amountVnd: number;
  orderCount: number;
}

/** 1 cột theo mốc thời gian (ngày hoặc tháng, tuỳ `granularity`). */
export interface RevenueBucket {
  periodStart: string;
  amountVnd: number;
  orderCount: number;
}

/**
 * GET /payment/admin/revenue — kỳ nửa mở [from, to).
 *
 * ⚠ `grossRevenueVnd` và `refundedVnd` đếm theo HAI MỐC THỜI GIAN KHÁC NHAU (gộp theo
 * `paid_at`, hoàn theo `refunded_at`) — cố ý, để một khoản hoàn tháng này không âm thầm
 * sửa lại báo cáo tháng trước đã chốt. Hệ quả: `netRevenueVnd` CÓ THỂ ÂM trong một kỳ
 * (kỳ đó hoàn nhiều hơn thu) — đó là con số đúng, không phải lỗi hiển thị.
 *
 * Credit tặng (FreeGrant/PromoGrant) KHÔNG bao giờ xuất hiện ở đây: báo cáo đọc bảng
 * `orders`, mà tặng credit thì không sinh đơn nào.
 */
export interface RevenueReportResponse {
  from: string;
  to: string;
  /** CHUỖI ('day' | 'month') — ngoại lệ enum-số của Payment. */
  granularity: string;
  grossRevenueVnd: number;
  paidOrderCount: number;
  refundedVnd: number;
  refundedOrderCount: number;
  netRevenueVnd: number;
  byKind: RevenueByKind[];
  buckets: RevenueBucket[];
}

// ── Danh sách đơn cho MÀN ADMIN (kèm field refund admin-only) ───────────────
export interface AdminOrderListItem {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  kind: OrderKind;
  packageId?: string | null;
  invoiceId?: string | null;
  status: OrderStatus;
  amountVnd: number;
  payosOrderCode: number;
  expiredAt: string;
  paidAt?: string | null;
  createdAt: string;
  // Chỉ có giá trị với đơn Refunded.
  refundedAt?: string | null;
  refundReason?: string | null;
  refundGatewayRef?: string | null;
  /** NULL trên đơn đã Refunded = "chờ chuyển tiền cho khách"; có giá trị = "đã chuyển". */
  refundSettledAt?: string | null;
}

/** Lọc đơn hoàn theo trạng thái chuyển tiền (số — quy ước enum Payment). */
export enum RefundSettlementFilter {
  Pending = 1,
  Settled = 2,
}

// ── Hoàn tiền đơn (F18, Admin) ──────────────────────────────────────────────
export interface RefundOrderRequest {
  /** Bắt buộc, 3..500 ký tự. */
  reason: string;
  /** Mã giao dịch hoàn của PayOS do admin nhập tay sau khi hoàn trên dashboard. */
  gatewayRef?: string | null;
  /** true = chấp nhận thu hồi ÍT hơn số credit đã bán (ví đã tiêu bớt). */
  allowPartialClawback?: boolean;
  /** true = admin đã chuyển tiền thật cho khách ngay lúc hoàn → đánh dấu "đã chuyển" luôn. */
  settledNow?: boolean;
}

export interface RefundOrderResponse {
  orderId: string;
  amountVnd: number;
  creditsPurchased: number;
  creditsClawedBack: number;
  clawbackCeiling: number;
  refundTransactionId?: string | null;
  refundedAt?: string | null;
  /** NULL = đã hoàn nhưng CHƯA chuyển tiền cho khách. */
  refundSettledAt?: string | null;
}

// ── Xác nhận đã chuyển tiền hoàn (F18, Admin) ───────────────────────────────
export interface SettleRefundRequest {
  /** Mã giao dịch hoàn của PayOS (nếu có). Bỏ trống nếu chuyển khoản tay không mã. */
  gatewayRef?: string | null;
}

export interface SettleRefundResponse {
  orderId: string;
  refundedAt?: string | null;
  refundSettledAt?: string | null;
  refundGatewayRef?: string | null;
}

/**
 * Body của 409 "ví không đủ credit để thu hồi trọn".
 * ⚠ Backend gọi số thu hồi được là `clawbackPossible` ở body 409 nhưng `creditsClawedBack`
 * ở body 200 — cùng một đại lượng, hai tên. Đọc nhầm tên là mất số, hiện ra "undefined".
 */
export interface RefundConflictBody {
  message?: string;
  creditsPurchased?: number;
  clawbackPossible?: number;
  clawbackCeiling?: number;
}

// ── Cấp credit khuyến mãi (F20, Admin) ──────────────────────────────────────
export interface GrantCreditRequest {
  /** SỐ (Org=0, User=1) — quy ước enum-số của Payment. */
  ownerType: OwnerType;
  ownerId: string;
  /** 1..10000. */
  credits: number;
  /** Bắt buộc, 3..500 ký tự — đi vào sổ kiểm toán. */
  note: string;
  /**
   * Q14 — khoá chống cấp trùng do retry/double-click (≤200 ký tự). Bỏ trống = giữ hành vi cũ:
   * mỗi request là một lần cấp mới.
   *
   * ⚠ Backend khớp khoá theo `(ownerType, ownerId, idempotencyKey)` và **KHÔNG** xét `credits`/`note`:
   * gửi lại cùng khoá trên cùng ví sẽ replay đúng response lần cấp đầu và **bỏ qua số credit mới**.
   * Vì vậy người gọi phải sinh khoá MỚI mỗi khi nội dung cấp thay đổi, và chỉ giữ nguyên khoá khi
   * đang thử lại đúng khoản đó.
   */
  idempotencyKey?: string | null;
}

export interface GrantCreditResponse {
  ownerType: OwnerType;
  ownerId: string;
  creditsGranted: number;
  remainingCredits: number;
  transactionId: string;
}

// ── Thuê bao / gói định kỳ (F8) ─────────────────────────────────────────────
/**
 * GET /payment/me/subscription — kỳ hạn thuê bao của CHÍNH người gọi (chủ ví suy từ JWT:
 * thuộc org → thuê bao Org, không → thuê bao cá nhân). Không nhận tham số ⇒ không đọc được
 * thuê bao người khác.
 *
 * ⚠ Chưa mua gói KHÔNG phải 404 — backend trả **200 với `active: false`** và mọi trường kỳ hạn
 * null (cùng lối `CreditAccountResponse` trả ví rỗng). Bắt 404 để suy ra "chưa mua" là sai:
 * 404 ở đây chỉ có thể là route hỏng.
 *
 * ⚠ `active` = "đang chạy", KHÔNG phải "còn quyền lợi". Backend lọc `Status == Active`
 * (`SubscriptionQueryExtensions.ActiveAt`), nên gói vừa bị huỷ — vẫn còn hiệu lực tới hết kỳ đã
 * trả tiền — cũng rơi về `active: false` với mọi trường null. Hệ quả: sau khi huỷ, FE **không
 * đọc lại được** ngày hết hiệu lực; muốn hiện thì phải giữ `expiresAt` đọc được TRƯỚC lúc huỷ.
 */
export interface SubscriptionResponse {
  ownerType: OwnerType;
  ownerId: string;
  active: boolean;
  /** CHUỖI 'Monthly' | 'Annual' — ngoại lệ enum-số của Payment (BE `.ToString()`). null khi không có gói. */
  billingCycle?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
}

export const BILLING_CYCLE_LABEL: Record<string, string> = {
  Monthly: 'Theo tháng',
  Annual: 'Theo năm',
};

/**
 * POST /payment/me/subscription/cancel — huỷ **có hiệu lực cuối kỳ**: backend chỉ đổi
 * `Status → Cancelled` và giữ nguyên `ExpiresAt`, không hoàn tiền, không cắt quyền ngay.
 *
 * `cancelled: false` = không có gói nào đang chạy để huỷ (kể cả khi đã huỷ trước đó rồi) —
 * đây là phản hồi idempotent, không phải lỗi.
 */
export interface SubscriptionCancellationResponse {
  subscriptionId?: string | null;
  cancelled: boolean;
}

/** GET /payment/order/{id}/status — status là CHUỖI ở riêng endpoint này. */
export interface OrderStatusResponse {
  orderCode: number;
  status: string;
  paidAt?: string | null;
}

export interface InvoiceResponse {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  accountId?: string | null;
  periodStart: string;
  periodEnd: string;
  interviewCount: number;
  unitPrice: number;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
}

// ── Tiêu thụ token / chi phí AI (F22, Admin) ────────────────────────────────
/**
 * Báo cáo tiêu thụ token + chi phí AI theo kỳ (`GET /payment/admin/ai-usage`).
 *
 * Nguồn số liệu: AIService đo token mỗi lượt gọi Gemini rồi ĐẨY về Payment qua callback
 * nội bộ (GEN-4 cấm AIService ghi DB). Bảng nằm ở Payment vì chi phí AI chỉ có nghĩa khi
 * đọc cạnh doanh thu (F19) — "tháng này thu bao nhiêu, đốt bao nhiêu".
 *
 * ⚠ Tiền ở đây là **USD**, không phải VND như mọi số tiền khác của Payment (Google tính
 * giá bằng USD) — đừng dùng `VndPipe` cho `totalCostUsd`.
 */
export interface AiUsageReportResponse {
  from: string;
  to: string;
  /** CHUỖI ('Day' | 'Month') — ngoại lệ enum-số của Payment, giống `RevenueReportResponse`. */
  granularity: string;
  totalCalls: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byOperation: AiUsageByOperation[];
  buckets: AiUsageBucket[];
  /** F15 — null khi kỳ KHÔNG có lượt sinh tài liệu học. null ≠ 0/0: hiện "0% bị loại" là
   *  một khẳng định không có cơ sở. */
  resourceUrls?: AiResourceUrlStats | null;
}

export interface AiUsageByOperation {
  /** Tên đường gọi phía AIService: score · generate_questions · decide_next · text_to_speech … */
  operation: string;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface AiUsageBucket {
  periodStart: string;
  calls: number;
  totalTokens: number;
  costUsd: number;
}

export interface AiResourceUrlStats {
  proposed: number;
  rejected: number;
  /** Tỉ lệ [0,1]. */
  rejectedRate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gói thuê bao phân tầng (S11 tiering) + duyệt chế độ thanh toán (BK24) +
// chi tiền hoàn tự động (F18 payout) — nhóm màn ADMIN.
//
// ⚠ Enum ở khối này khai TẠI ĐÂY chứ không ở `enums.ts` để tránh đụng file mà
// worker khác đang sửa trong cùng vòng. `models/index.ts` re-export cả file này
// nên import từ `core/models` không phân biệt được — vị trí là chi tiết nội bộ.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Catalog nào — B2C (cá nhân) hay B2B (tổ chức). SỐ (quy ước Payment).
 *
 * ⚠ Hai catalog bị tách ở TẦNG DB bằng CHECK `ck_sub_audience_owner`: ví User chỉ nhận
 * plan B2C, ví Org chỉ nhận plan B2B. Cấp chéo → backend 400, không phải chỉ là quy ước UI.
 */
export enum PlanAudience {
  B2C = 0,
  B2B = 1,
}
export const PLAN_AUDIENCE_LABEL: Record<number, string> = {
  [PlanAudience.B2C]: 'B2C (cá nhân)',
  [PlanAudience.B2B]: 'B2B (tổ chức)',
};

/**
 * Buổi phỏng vấn của gói này được tài trợ kiểu gì.
 * - `Credit` — vẫn trừ credit như thường (gói chỉ mở tính năng).
 * - `Metered` — quota tháng, không đụng credit đã mua.
 * - `Unlimited` — không giới hạn (chỉ còn dùng cho row F8 cũ; KHÔNG gói mới nào nên chọn).
 */
export enum InterviewFunding {
  Credit = 0,
  Metered = 1,
  Unlimited = 2,
}
export const INTERVIEW_FUNDING_LABEL: Record<number, string> = {
  [InterviewFunding.Credit]: 'Trừ credit',
  [InterviewFunding.Metered]: 'Quota tháng',
  [InterviewFunding.Unlimited]: 'Không giới hạn',
};

export enum SubscriptionStatus {
  Active = 0,
  Expired = 1,
  Cancelled = 2,
}
export const SUBSCRIPTION_STATUS_LABEL: Record<number, string> = {
  [SubscriptionStatus.Active]: 'Đang chạy',
  [SubscriptionStatus.Expired]: 'Hết hạn',
  [SubscriptionStatus.Cancelled]: 'Đã huỷ',
};

export enum SubscriptionSource {
  Purchase = 0,
  AdminGrant = 1,
}

export enum BillingCycle {
  Monthly = 0,
  Annual = 1,
}

// ── Catalog gói thuê bao (Admin) ────────────────────────────────────────────
/** GET /payment/admin/plans — 1 gói trong catalog. */
export interface PlanResponse {
  id: string;
  audience: PlanAudience;
  /** Mã máy đọc (`free`/`plus`/`pro`/`starter`...) — dùng để đối chiếu, không đổi tuỳ tiện. */
  code: string;
  name: string;
  /** Bậc tăng dần trong cùng audience (0 = thấp nhất). */
  rank: number;
  interviewFunding: InterviewFunding;
  monthlyQuota?: number | null;
  adaptiveEnabled: boolean;
  adaptiveMaxQuestions?: number | null;
  adaptiveMaxFollowups?: number | null;
  groundingEnabled: boolean;
  selfConsistencyN: number;
  cvAnalysisIncluded: boolean;
  repoAnalysisIncluded: boolean;
  roadmapEnabled: boolean;
  maxQuestionsCap?: number | null;
  maxActiveCampaigns?: number | null;
  maxCandidatesCap?: number | null;
  postpaidEligible: boolean;
  seatCount?: number | null;
  entitlementsVersion: number;
  isActive: boolean;
}

/**
 * POST/PUT /payment/admin/plans — thân request.
 *
 * ⚠ PUT là REPLACE TOÀN BỘ (`PlanRequest.ApplyTo` gán đè mọi field), KHÔNG phải patch từng
 * phần như `UpdatePackageRequest`: bỏ sót một field khi sửa = ghi giá trị mặc định của nó
 * đè lên giá trị đang có. Vì thế form sửa phải nạp đủ gói hiện tại rồi gửi lại nguyên vẹn.
 *
 * `entitlementsJson` không lộ ở `PlanResponse` (chỉ có `entitlementsVersion`) ⇒ khi sửa mà
 * không biết giá trị cũ thì buộc phải gửi mặc định `"[]"`.
 */
export interface PlanRequest {
  audience: PlanAudience;
  code: string;
  name: string;
  rank: number;
  interviewFunding: InterviewFunding;
  monthlyQuota?: number | null;
  adaptiveEnabled: boolean;
  adaptiveMaxQuestions?: number | null;
  adaptiveMaxFollowups?: number | null;
  groundingEnabled: boolean;
  selfConsistencyN: number;
  cvAnalysisIncluded: boolean;
  repoAnalysisIncluded: boolean;
  roadmapEnabled: boolean;
  maxQuestionsCap?: number | null;
  maxActiveCampaigns?: number | null;
  maxCandidatesCap?: number | null;
  postpaidEligible: boolean;
  seatCount?: number | null;
  entitlementsJson: string;
  entitlementsVersion: number;
  isActive: boolean;
}

// ── Cấp thuê bao tay (Admin) ────────────────────────────────────────────────
/**
 * POST /payment/admin/subscriptions/grant.
 *
 * ⚠ `idempotencyKey` BẮT BUỘC (backend khai non-nullable, rỗng → 400). Backend khớp theo
 * `(ownerType, ownerId, idempotencyKey)` và trả lại kỳ hạn CŨ nếu trùng — **KHÔNG** xét
 * `planId`/`durationDays`, y hệt bẫy của {@link GrantCreditRequest}. Đổi gói hoặc đổi số ngày
 * mà giữ khoá cũ ⇒ backend replay kỳ hạn cũ và bỏ qua nội dung mới trong im lặng.
 *
 * Điều kiện backend từ chối (đều 400 kèm `message`):
 * - `durationDays <= 0` hoặc khoá rỗng;
 * - gói không tồn tại / đã tắt (`isActive=false`);
 * - **audience không khớp chủ ví** (ví User ↔ gói B2C, ví Org ↔ gói B2B);
 * - **chủ ví CHƯA có ví credit** — phải có row `credit_accounts` trước khi được cấp thuê bao.
 */
export interface GrantSubscriptionRequest {
  ownerType: OwnerType;
  ownerId: string;
  planId: string;
  /** > 0. */
  durationDays: number;
  /** Mốc kích hoạt (ISO). Bỏ trống = ngay bây giờ. */
  activatedAt?: string | null;
  idempotencyKey: string;
}

/**
 * Kỳ hạn thuê bao (entity `Subscription` serialize thẳng — mỗi lần cấp/mua là MỘT row mới,
 * không sửa row cũ để kéo dài hạn).
 */
export interface SubscriptionEntity {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  packageId?: string | null;
  orderId?: string | null;
  adminGrantIdempotencyKey?: string | null;
  planId?: string | null;
  audience: PlanAudience;
  tierCode: string;
  tierRank: number;
  interviewFunding: InterviewFunding;
  monthlyQuota?: number | null;
  entitlementsVersion: number;
  source: SubscriptionSource;
  activatedAt: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
}

// ── Duyệt chế độ thanh toán Prepaid ↔ Postpaid (BK24, Admin) ────────────────
/**
 * POST /payment/admin/credits/payment-mode — đường HỢP LỆ DUY NHẤT để bật Postpaid cho một
 * tổ chức (trước đây chỉ làm được bằng `UPDATE` SQL tay, tức bỏ qua bước PlatformAdmin duyệt
 * mà PAY-3 yêu cầu).
 *
 * Mã lỗi backend — **hiện `message` của server, đừng nuốt**: 400 ví User (B2C luôn Prepaid) ·
 * 400 `creditLimit` sai combo · 403 tier B2B không đủ điều kiện Postpaid · 404 chưa có ví ·
 * 409 ví còn credit đã mua sẽ mắc kẹt (`allowStrandedCredits` để tiếp tục) · 409 còn nợ chưa
 * tất toán · 409 mode vừa bị đổi bởi thao tác khác.
 */
export interface SetPaymentModeRequest {
  ownerType: OwnerType;
  ownerId: string;
  paymentMode: PaymentMode;
  /** BẮT BUỘC > 0 khi Postpaid; PHẢI bỏ trống khi Prepaid (sai combo → 400). */
  creditLimit?: number | null;
  /** Bắt buộc, 3..500 ký tự — vào sổ kiểm toán cùng tên người duyệt. */
  note: string;
  /** Opt-in tường minh khi ví còn credit đã mua sẽ mắc kẹt sau khi chuyển Postpaid. */
  allowStrandedCredits?: boolean;
}

export interface SetPaymentModeResponse {
  ownerType: OwnerType;
  ownerId: string;
  paymentMode: PaymentMode;
  creditLimit?: number | null;
  remainingCredits: number;
  reservedCredits: number;
}

/**
 * Body của 409 "credit sẽ mắc kẹt". Nhận ra ca này bằng SỰ CÓ MẶT của hai con số — 409 còn
 * dùng cho ca khác (còn nợ, mode vừa đổi) vốn chỉ có `message` (mẫu {@link RefundConflictBody}).
 */
export interface StrandedCreditsConflictBody {
  message?: string;
  remainingCredits?: number;
  reservedCredits?: number;
}

// ── Chi tiền hoàn tự động qua kênh chi payOS (F18 payout, Admin) ────────────
/**
 * POST /payment/admin/orders/{id}/refund/payout — không có body.
 *
 * **202** = lệnh đã gửi, đang chờ ngân hàng (`refundSettledAt` còn null) · **200** = tiền đã tới
 * và đã đóng dấu. Hai mã này khác nhau về sự thật, không được gộp: 202 mà báo "đã hoàn xong" là
 * nói dối. Lỗi: 404 · 409 (chưa hoàn / đã settle / lệnh trước hỏng / **tên người nhận không khớp
 * — tiền ĐÃ ĐI, cần đối soát ngay**) · 422 không dựng được đích chuyển · 503 chưa bật hoặc ví chi
 * không đủ. Mọi ca không tự động được vẫn rơi về nút "xác nhận đã chuyển" (`/refund/settle`).
 */
export interface RefundPayoutResponse {
  orderId: string;
  /** Mã lệnh chi payOS — dùng để lần theo dòng tiền khi đối soát. */
  payoutId?: string | null;
  /** NULL = tiền chưa xác nhận tới khách (đang bay, hoặc cần người xử lý). */
  refundSettledAt?: string | null;
  /** CHUỖI tên outcome (`Succeeded`/`InFlight`/...) — ngoại lệ enum-số của Payment. */
  outcome: string;
  message?: string | null;
}
