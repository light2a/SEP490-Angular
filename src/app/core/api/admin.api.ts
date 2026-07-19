import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminCampaignListItem,
  AdminResetPasswordRequest,
  AdminUserResponse,
  BanUserRequest,
  GrantCreditRequest,
  GrantCreditResponse,
  OrderResponse,
  OrganizationResponse,
  RefundOrderRequest,
  RefundOrderResponse,
  RevenueReportResponse,
} from '../models';

/**
 * PlatformAdmin oversight (AUTH-7) — đọc toàn nền tảng, cross-org. Mọi endpoint `[Authorize(Roles="Admin")]`.
 * Gọi thẳng từng service qua Gateway (`/auth/admin/*`, `/campaign/admin/*`, `/payment/admin/*`).
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  /** GET /auth/admin/organizations */
  organizations(search?: string): Observable<OrganizationResponse[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<OrganizationResponse[]>(`${this.base}/auth/admin/organizations`, { params });
  }

  /** GET /auth/admin/users */
  users(opts?: { role?: string; search?: string }): Observable<AdminUserResponse[]> {
    let params = new HttpParams();
    if (opts?.role) params = params.set('role', opts.role);
    if (opts?.search) params = params.set('search', opts.search);
    return this.http.get<AdminUserResponse[]>(`${this.base}/auth/admin/users`, { params });
  }

  // ── Quản lý người dùng (F20) ────────────────────────────────────────────────
  /**
   * POST /auth/admin/users/{id}/ban — chặn MỌI đường phát phiên mới + thu hồi refresh token.
   * ⚠ KHÔNG tức thì: access token đã phát vẫn sống tới hết TTL (≤15') vì service validate JWT
   * offline, không hỏi AuthService lúc chạy (GEN-3). Đây là giới hạn kiến trúc, không phải lỗi.
   */
  banUser(userId: string, reason?: string | null): Observable<AdminUserResponse> {
    const body: BanUserRequest = { reason: reason?.trim() || null };
    return this.http.post<AdminUserResponse>(
      `${this.base}/auth/admin/users/${userId}/ban`,
      body,
    );
  }

  /** POST /auth/admin/users/{id}/unban */
  unbanUser(userId: string): Observable<AdminUserResponse> {
    return this.http.post<AdminUserResponse>(`${this.base}/auth/admin/users/${userId}/unban`, {});
  }

  /** POST /auth/admin/users/{id}/reset-password → 204 (không trả body). */
  resetUserPassword(userId: string, newPassword: string): Observable<void> {
    const body: AdminResetPasswordRequest = { newPassword };
    return this.http.post<void>(
      `${this.base}/auth/admin/users/${userId}/reset-password`,
      body,
    );
  }

  /** GET /campaign/admin/campaigns */
  campaigns(opts?: { status?: string; orgId?: string }): Observable<AdminCampaignListItem[]> {
    let params = new HttpParams();
    if (opts?.status) params = params.set('status', opts.status);
    if (opts?.orgId) params = params.set('orgId', opts.orgId);
    return this.http.get<AdminCampaignListItem[]>(`${this.base}/campaign/admin/campaigns`, { params });
  }

  /** GET /payment/admin/orders */
  orders(opts?: { status?: number; ownerType?: number }): Observable<OrderResponse[]> {
    let params = new HttpParams();
    if (opts?.status != null) params = params.set('status', String(opts.status));
    if (opts?.ownerType != null) params = params.set('ownerType', String(opts.ownerType));
    return this.http.get<OrderResponse[]>(`${this.base}/payment/admin/orders`, { params });
  }

  /**
   * GET /payment/admin/revenue — báo cáo doanh thu, kỳ nửa mở [from, to) (F19).
   * `groupBy` chỉ nhận 'day' | 'month' (khác → 400); bỏ trống from/to → 30 ngày gần nhất.
   */
  revenue(opts?: {
    from?: string | null;
    to?: string | null;
    groupBy?: 'day' | 'month';
  }): Observable<RevenueReportResponse> {
    let params = new HttpParams();
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    if (opts?.groupBy) params = params.set('groupBy', opts.groupBy);
    return this.http.get<RevenueReportResponse>(`${this.base}/payment/admin/revenue`, { params });
  }

  /**
   * POST /payment/admin/orders/{id}/refund — hoàn tiền 1 đơn mua credit (F18).
   *
   * ⚠ Backend KHÔNG gọi API hoàn tiền của PayOS: nó chỉ ghi nhận việc hoàn và thu hồi
   * credit. Tiền thật phải do admin tự hoàn trên dashboard PayOS rồi nhập `gatewayRef`
   * vào đây làm dấu vết đối chiếu.
   *
   * 409 khi ví đã tiêu bớt credit và không thu hồi đủ — body 409 kèm số thu hồi được
   * (`clawbackPossible`); gọi lại với `allowPartialClawback=true` để chấp nhận thu hồi
   * một phần.
   */
  refundOrder(orderId: string, body: RefundOrderRequest): Observable<RefundOrderResponse> {
    return this.http.post<RefundOrderResponse>(
      `${this.base}/payment/admin/orders/${orderId}/refund`,
      body,
    );
  }

  /**
   * POST /payment/admin/credits/grant — cấp credit khuyến mãi vào 1 ví (F20).
   * ⚠ KHÔNG idempotent ở backend: gọi 2 lần = cấp 2 lần. Người gọi phải tự chặn bấm trùng.
   */
  grantCredits(body: GrantCreditRequest): Observable<GrantCreditResponse> {
    return this.http.post<GrantCreditResponse>(`${this.base}/payment/admin/credits/grant`, body);
  }
}
