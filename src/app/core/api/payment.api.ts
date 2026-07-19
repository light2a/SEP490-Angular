import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CloseBillingPeriodRequest,
  CreateOrderRequest,
  CreatePackageRequest,
  CreditAccountResponse,
  CreditTransactionPage,
  CreditTransactionReason,
  CreditTransactionResponse,
  InvoiceResponse,
  OrderResponse,
  OrderStatusResponse,
  PackageResponse,
  UpdatePackageRequest,
} from '../models';

/** /api/v1/payment/* — enum trả dạng SỐ (giải mã bằng bảng nhãn trong enums.ts). */
@Injectable({ providedIn: 'root' })
export class PaymentApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/payment`;

  /** Số dư ví của chính người đăng nhập (ví Org nếu thuộc tổ chức, else ví cá nhân). */
  myAccount(): Observable<CreditAccountResponse> {
    return this.http.get<CreditAccountResponse>(`${this.base}/me/account`);
  }
  /**
   * GET /payment/me/credit-transactions — sổ biến động credit của CHÍNH chủ ví (F19).
   * Chủ ví suy từ JWT (thuộc org → ví Org, không → ví cá nhân); không đọc được ví người khác.
   *
   * Phân trang keyset: body là mảng, con trỏ trang kế nằm ở header `X-Next-Cursor`
   * (vắng mặt = đã hết trang) ⇒ phải đọc cả response chứ không chỉ body.
   */
  myCreditTransactions(opts?: {
    cursor?: string | null;
    limit?: number;
    reason?: CreditTransactionReason | null;
  }): Observable<CreditTransactionPage> {
    let params = new HttpParams();
    if (opts?.cursor) params = params.set('cursor', opts.cursor);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    if (opts?.reason != null) params = params.set('reason', String(opts.reason));
    return this.http
      .get<CreditTransactionResponse[]>(`${this.base}/me/credit-transactions`, {
        params,
        observe: 'response',
      })
      .pipe(
        map((res) => ({
          items: res.body ?? [],
          nextCursor: res.headers.get('X-Next-Cursor'),
        })),
      );
  }

  packages(): Observable<PackageResponse[]> {
    return this.http.get<PackageResponse[]>(`${this.base}/package`);
  }
  package(id: string): Observable<PackageResponse> {
    return this.http.get<PackageResponse>(`${this.base}/package/${id}`);
  }
  /** 201 + checkoutUrl (redirect PayOS). checkoutUrl chỉ có ở response này. */
  createOrder(body: CreateOrderRequest): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(`${this.base}/order`, body);
  }
  myOrders(): Observable<OrderResponse[]> {
    return this.http.get<OrderResponse[]>(`${this.base}/order/my-orders`);
  }
  order(id: string): Observable<OrderResponse> {
    return this.http.get<OrderResponse>(`${this.base}/order/${id}`);
  }
  /** status ở đây là CHUỖI. */
  orderStatus(id: string): Observable<OrderStatusResponse> {
    return this.http.get<OrderStatusResponse>(`${this.base}/order/${id}/status`);
  }
  cancelOrder(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/order/${id}`);
  }

  // ── Invoice / postpaid (Employer) ───────────────────────────────────────────
  /** GET /payment/me/invoices — hoá đơn postpaid của org. */
  myInvoices(): Observable<InvoiceResponse[]> {
    return this.http.get<InvoiceResponse[]>(`${this.base}/me/invoices`);
  }
  invoice(id: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(`${this.base}/me/invoices/${id}`);
  }
  /** POST /payment/invoices/{id}/pay — tạo order tất toán → checkoutUrl PayOS. */
  payInvoice(id: string): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(`${this.base}/invoices/${id}/pay`, {});
  }

  // ── Package admin (Admin) ───────────────────────────────────────────────────
  createPackage(body: CreatePackageRequest): Observable<PackageResponse> {
    return this.http.post<PackageResponse>(`${this.base}/package`, body);
  }
  updatePackage(id: string, body: UpdatePackageRequest): Observable<PackageResponse> {
    return this.http.put<PackageResponse>(`${this.base}/package/${id}`, body);
  }
  deletePackage(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/package/${id}`);
  }

  // ── Billing close (Admin) ───────────────────────────────────────────────────
  /** POST /payment/admin/invoices/close — chốt kỳ postpaid 1 org → InvoiceResponse. */
  closeBillingPeriod(body: CloseBillingPeriodRequest): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>(`${this.base}/admin/invoices/close`, body);
  }
}
