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
}

export interface GrantCreditResponse {
  ownerType: OwnerType;
  ownerId: string;
  creditsGranted: number;
  remainingCredits: number;
  transactionId: string;
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
