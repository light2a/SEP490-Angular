import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MyPlanResponse, PlanAudience, PublicPlanResponse } from '../models';

/**
 * /api/v1/payment/plans/* — bảng giá gói phân tầng (S11) cho CẢ B2C lẫn B2B.
 *
 * Khác `PaymentApi.packages()`: chỗ đó là gói CREDIT lẻ (`product_packages` OneTime), chỗ này là gói
 * THUÊ BAO có quyền lợi (adaptive, hạn mức tháng, roadmap, phân tích repo…). Hai catalog tách nhau ở BE
 * nên đừng gộp lại ở FE.
 */
@Injectable({ providedIn: 'root' })
export class PlanApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/payment/plans`;

  /** Bảng giá — không cần đăng nhập. Bỏ trống `audience` để lấy cả hai dòng. */
  catalog(audience?: PlanAudience): Observable<PublicPlanResponse[]> {
    // Payment giữ enum SỐ theo hợp đồng FE ⇒ gửi giá trị số, không gửi tên.
    const params =
      audience == null ? undefined : new HttpParams().set('audience', String(audience));
    return this.http.get<PublicPlanResponse[]>(this.base, { params });
  }

  /** Gói đang dùng của chính người đăng nhập (ví Org nếu thuộc tổ chức, else ví cá nhân). */
  mine(): Observable<MyPlanResponse> {
    return this.http.get<MyPlanResponse>(`${this.base}/me`);
  }
}
