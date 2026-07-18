import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CloseBillingPeriodRequest,
  CreateOrderRequest,
  CreatePackageRequest,
  CreditAccountResponse,
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
