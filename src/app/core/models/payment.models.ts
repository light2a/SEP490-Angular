import { InvoiceStatus, OrderKind, OrderStatus, OwnerType, PackageType } from './enums';

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
