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
