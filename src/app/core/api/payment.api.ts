import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateOrderRequest,
  OrderResponse,
  OrderStatusResponse,
  PackageResponse,
} from '../models';

/** /api/v1/payment/* — enum trả dạng SỐ (giải mã bằng bảng nhãn trong enums.ts). */
@Injectable({ providedIn: 'root' })
export class PaymentApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/payment`;

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
}
