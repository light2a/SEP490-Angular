import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminCampaignListItem,
  AdminOrderListItem,
  AdminResetPasswordRequest,
  AdminUserResponse,
  BanUserRequest,
  GrantCreditRequest,
  GrantCreditResponse,
  OrganizationResponse,
  RefundOrderRequest,
  RefundOrderResponse,
  SettleRefundRequest,
  SettleRefundResponse,
  AiUsageReportResponse,
  RevenueReportResponse,
  CreditAccountResponse,
  CreditTransactionPage,
  CreditTransactionReason,
  CreditTransactionResponse,
  GrantSubscriptionRequest,
  OwnerType,
  PlanAudience,
  PlanRequest,
  PlanResponse,
  RefundPayoutResponse,
  SetPaymentModeRequest,
  SetPaymentModeResponse,
  SubscriptionResponse,
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

  /**
   * GET /payment/admin/orders — mảng đơn (kèm field refund admin-only).
   * `refundSettlement` (1=Pending chờ chuyển tiền, 2=Settled đã chuyển) lọc đơn hoàn theo trạng thái chuyển tiền.
   */
  orders(opts?: {
    status?: number;
    ownerType?: number;
    refundSettlement?: number;
  }): Observable<AdminOrderListItem[]> {
    let params = new HttpParams();
    if (opts?.status != null) params = params.set('status', String(opts.status));
    if (opts?.ownerType != null) params = params.set('ownerType', String(opts.ownerType));
    if (opts?.refundSettlement != null)
      params = params.set('refundSettlement', String(opts.refundSettlement));
    return this.http.get<AdminOrderListItem[]>(`${this.base}/payment/admin/orders`, { params });
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
   * GET /payment/admin/ai-usage — tiêu thụ token + chi phí AI, kỳ nửa mở [from, to) (F22).
   * Cùng hợp đồng tham số với `revenue()`; `groupBy` chỉ nhận 'day' | 'month' (khác → 400).
   */
  aiUsage(opts?: {
    from?: string | null;
    to?: string | null;
    groupBy?: 'day' | 'month';
  }): Observable<AiUsageReportResponse> {
    let params = new HttpParams();
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    if (opts?.groupBy) params = params.set('groupBy', opts.groupBy);
    return this.http.get<AiUsageReportResponse>(`${this.base}/payment/admin/ai-usage`, { params });
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
   * POST /payment/admin/orders/{id}/refund/settle — XÁC NHẬN đã chuyển tiền hoàn thật cho khách (F18).
   *
   * PayOS không có API refund → tiền về bank làm tay; endpoint này chỉ đóng dấu mốc đối soát +
   * ghi mã tham chiếu, KHÔNG đụng credit/status. Chỉ hợp lệ trên đơn đã Refunded (409 nếu chưa).
   * Idempotent: đơn đã xác nhận rồi → trả nguyên trạng.
   */
  settleRefund(orderId: string, body: SettleRefundRequest): Observable<SettleRefundResponse> {
    return this.http.post<SettleRefundResponse>(
      `${this.base}/payment/admin/orders/${orderId}/refund/settle`,
      body,
    );
  }

  /**
   * POST /payment/admin/credits/grant — cấp credit khuyến mãi vào 1 ví (F20).
   *
   * Q14 — idempotent KHI VÀ CHỈ KHI gửi `idempotencyKey`: backend khớp theo
   * `(ownerType, ownerId, key)` rồi replay đúng response lần cấp đầu. Bỏ trống khoá thì mỗi
   * request là một lần cấp mới (hành vi cũ).
   *
   * ⚠ Khớp khoá KHÔNG xét `credits`/`note` ⇒ dùng lại khoá cũ sau khi sửa số credit sẽ nhận lại
   * khoản CŨ trong im lặng. Đổi nội dung cấp thì phải đổi khoá.
   */
  grantCredits(body: GrantCreditRequest): Observable<GrantCreditResponse> {
    return this.http.post<GrantCreditResponse>(`${this.base}/payment/admin/credits/grant`, body);
  }

  // ── Catalog gói thuê bao (S11 tiering) ──────────────────────────────────────
  /**
   * GET /payment/admin/plans — catalog gói. `audience` tách B2C/B2B; bỏ trống = cả hai.
   *
   * ⚠ Hai catalog không được trộn: ví User chỉ nhận gói B2C, ví Org chỉ nhận gói B2B, và ràng
   * buộc đó nằm ở TẦNG DB (CHECK `ck_sub_audience_owner`) chứ không phải chỉ ở UI.
   */
  plans(audience?: PlanAudience | null): Observable<PlanResponse[]> {
    let params = new HttpParams();
    if (audience != null) params = params.set('audience', String(audience));
    return this.http.get<PlanResponse[]>(`${this.base}/payment/admin/plans`, { params });
  }

  /** GET /payment/admin/plans/{id} — 404 nếu không có. */
  plan(id: string): Observable<PlanResponse> {
    return this.http.get<PlanResponse>(`${this.base}/payment/admin/plans/${id}`);
  }

  /** POST /payment/admin/plans — tạo gói mới (400 kèm `message` khi dữ liệu sai). */
  createPlan(body: PlanRequest): Observable<PlanResponse> {
    return this.http.post<PlanResponse>(`${this.base}/payment/admin/plans`, body);
  }

  /**
   * PUT /payment/admin/plans/{id} — **REPLACE toàn bộ gói**, không phải patch từng phần.
   * Backend gán đè MỌI field từ body; field bỏ sót nhận giá trị mặc định của nó và ghi đè
   * giá trị đang có ⇒ luôn gửi lại gói đầy đủ (form sửa phải nạp từ `plan()` trước).
   */
  updatePlan(id: string, body: PlanRequest): Observable<PlanResponse> {
    return this.http.put<PlanResponse>(`${this.base}/payment/admin/plans/${id}`, body);
  }

  /** DELETE /payment/admin/plans/{id} — vô hiệu hoá MỀM (`isActive=false`), trả 204. */
  deactivatePlan(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/payment/admin/plans/${id}`);
  }

  /**
   * POST /payment/admin/subscriptions/grant — cấp tay một kỳ hạn thuê bao.
   *
   * ⚠ `idempotencyKey` BẮT BUỘC (rỗng → 400). Backend khớp theo `(ownerType, ownerId, key)` và
   * trả lại kỳ hạn CŨ nếu trùng, **KHÔNG** xét `planId`/`durationDays` — đổi nội dung mà giữ khoá
   * cũ thì nội dung mới bị bỏ qua trong im lặng. Người gọi phải sinh khoá mới khi nội dung đổi và
   * giữ nguyên khoá khi đang thử lại đúng khoản đó.
   */
  grantSubscription(body: GrantSubscriptionRequest): Observable<SubscriptionResponse> {
    return this.http.post<SubscriptionResponse>(
      `${this.base}/payment/admin/subscriptions/grant`,
      body,
    );
  }

  // ── Ví bất kỳ + chế độ thanh toán (BK24) ────────────────────────────────────
  /**
   * POST /payment/admin/credits/payment-mode — duyệt/đổi Prepaid ↔ Postpaid cho ví **Org**.
   *
   * Đường hợp lệ duy nhất để bật Postpaid (PAY-3 đòi PlatformAdmin duyệt). Backend có nhiều
   * guard trả `message` cụ thể (400 ví User · 400 `creditLimit` sai combo · 403 tier không đủ
   * điều kiện · 404 chưa có ví · 409 credit mắc kẹt / còn nợ / mode vừa đổi) ⇒ người gọi phải
   * hiện `message` của server thay vì thay bằng câu chung chung.
   */
  setPaymentMode(body: SetPaymentModeRequest): Observable<SetPaymentModeResponse> {
    return this.http.post<SetPaymentModeResponse>(
      `${this.base}/payment/admin/credits/payment-mode`,
      body,
    );
  }

  /**
   * GET /payment/admin/credits/{ownerType}/{ownerId} — số dư ví BẤT KỲ (đọc thuần, không tạo ví).
   *
   * Ví chưa tồn tại → 200 với 0 credit (cùng quy ước `me/account`): "chưa có ví" là sự thật hợp lệ
   * về chủ ví đó, không phải lỗi tra cứu. `ownerType` đi trong ĐƯỜNG DẪN dưới dạng tên enum
   * (`Org`/`User`) — chuỗi lạ → 400.
   */
  walletAccount(ownerType: OwnerType, ownerId: string): Observable<CreditAccountResponse> {
    return this.http.get<CreditAccountResponse>(
      `${this.base}/payment/admin/credits/${OwnerType[ownerType]}/${ownerId}`,
    );
  }

  /**
   * GET /payment/admin/credits/{ownerType}/{ownerId}/transactions — sổ cái ví BẤT KỲ.
   *
   * Cùng hợp đồng keyset với `me/credit-transactions`: body là mảng, con trỏ trang kế nằm ở header
   * `X-Next-Cursor` (vắng = hết trang) ⇒ phải đọc cả response chứ không chỉ body. Bản admin trả kèm
   * `grantedBy`/`note` (ai cấp quà và vì sao) — hai field luôn null ở đường `/me`.
   */
  walletTransactions(
    ownerType: OwnerType,
    ownerId: string,
    opts?: { cursor?: string | null; limit?: number; reason?: CreditTransactionReason | null },
  ): Observable<CreditTransactionPage> {
    let params = new HttpParams();
    if (opts?.cursor) params = params.set('cursor', opts.cursor);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    if (opts?.reason != null) params = params.set('reason', String(opts.reason));
    return this.http
      .get<CreditTransactionResponse[]>(
        `${this.base}/payment/admin/credits/${OwnerType[ownerType]}/${ownerId}/transactions`,
        { params, observe: 'response' },
      )
      .pipe(
        map((res) => ({
          items: res.body ?? [],
          nextCursor: res.headers.get('X-Next-Cursor'),
        })),
      );
  }

  /**
   * POST /payment/admin/orders/{id}/refund/payout — CHI tiền hoàn về tài khoản người đã trả, qua
   * kênh chi payOS. Không có body (đích chuyển dựng từ webhook gốc của chính đơn đó).
   *
   * ⚠ **202 ≠ 200**: 202 = lệnh đã gửi, đang chờ ngân hàng (`refundSettledAt` còn null); 200 = tiền
   * đã tới và đã đóng dấu. Người gọi phải phân biệt — báo "đã hoàn xong" khi mới 202 là nói dối.
   * Vì thế trả cả `status` chứ không chỉ body. Ca không tự động được vẫn rơi về `settleRefund()`.
   */
  payoutRefund(orderId: string): Observable<{ status: number; body: RefundPayoutResponse | null }> {
    return this.http
      .post<RefundPayoutResponse>(
        `${this.base}/payment/admin/orders/${orderId}/refund/payout`,
        null,
        { observe: 'response' },
      )
      .pipe(map((res) => ({ status: res.status, body: res.body })));
  }
}
