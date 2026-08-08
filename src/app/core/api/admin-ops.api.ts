import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnalyticsGranularity,
  AuthAnalyticsResponse,
  CampaignAnalyticsResponse,
  InterviewAnalyticsResponse,
  PromptTemplateItem,
  TrafficGranularity,
  TrafficReportResponse,
  UpdatePromptTemplateRequest,
} from '../models/admin-ops.models';

/** Bộ lọc kỳ dùng chung cho 3 analytics nghiệp vụ. */
export interface AnalyticsQuery {
  from?: string | null;
  to?: string | null;
  groupBy?: AnalyticsGranularity;
}

/**
 * Vận hành nền tảng (AUTH-7) — analytics FR18 + prompt registry F21. Mọi endpoint
 * `[Authorize(Roles="Admin")]`, gọi qua Gateway.
 *
 * Tách khỏi `AdminApi` có chủ đích: đây là nhóm công cụ **vận hành** (đo tải, sửa prompt đang
 * chạy) chứ không phải quản trị dữ liệu nghiệp vụ, và tách file thì hai luồng phát triển không
 * chọi nhau trên cùng một service.
 */
@Injectable({ providedIn: 'root' })
export class AdminOpsApi {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  /**
   * Tham số kỳ CHỈ được set khi có giá trị: gửi `from=` rỗng khác hẳn với không gửi — không gửi
   * thì backend tự lấy 30 ngày gần nhất, còn chuỗi rỗng thì đi vào đường parse ngày.
   */
  private periodParams(
    q: { from?: string | null; to?: string | null } | undefined,
    groupBy: string | undefined,
  ): HttpParams {
    let params = new HttpParams();
    if (q?.from) params = params.set('from', q.from);
    if (q?.to) params = params.set('to', q.to);
    if (groupBy) params = params.set('groupBy', groupBy);
    return params;
  }

  /**
   * GET /auth/admin/analytics — đăng nhập, người dùng mới, người dùng hoạt động.
   * `groupBy` chỉ nhận 'day' | 'month' (khác → 400); bỏ trống from/to → 30 ngày gần nhất.
   */
  authAnalytics(q?: AnalyticsQuery): Observable<AuthAnalyticsResponse> {
    return this.http.get<AuthAnalyticsResponse>(`${this.base}/auth/admin/analytics`, {
      params: this.periodParams(q, q?.groupBy),
    });
  }

  /** GET /interview/admin/analytics — buổi phỏng vấn tạo/chấm/hỏng/bỏ dở + câu trả lời. */
  interviewAnalytics(q?: AnalyticsQuery): Observable<InterviewAnalyticsResponse> {
    return this.http.get<InterviewAnalyticsResponse>(`${this.base}/interview/admin/analytics`, {
      params: this.periodParams(q, q?.groupBy),
    });
  }

  /**
   * GET /campaign/admin/analytics — funnel B2B (tạo campaign → mời → join → bắt đầu thi).
   * Campaign đã soft-delete bị loại bởi global query filter phía BE, không phải bug hụt số.
   */
  campaignAnalytics(q?: AnalyticsQuery): Observable<CampaignAnalyticsResponse> {
    return this.http.get<CampaignAnalyticsResponse>(`${this.base}/campaign/admin/analytics`, {
      params: this.periodParams(q, q?.groupBy),
    });
  }

  /**
   * GET /payment/admin/traffic — requests/4xx/5xx/latency gom theo **route id của YARP**.
   * ⚠ `groupBy` ở đây là 'hour' | 'day' — KHÁC 3 endpoint trên ('day' | 'month'); gửi 'month' → 400.
   */
  paymentTraffic(
    q?: Omit<AnalyticsQuery, 'groupBy'> & { groupBy?: TrafficGranularity },
  ): Observable<TrafficReportResponse> {
    return this.http.get<TrafficReportResponse>(`${this.base}/payment/admin/traffic`, {
      params: this.periodParams(q, q?.groupBy),
    });
  }

  // ── F21 prompt registry ─────────────────────────────────────────────────────

  /** GET /interview/admin/prompts — MỌI khoá khai trong code, kể cả khoá chưa ai sửa (`body: null`). */
  prompts(): Observable<PromptTemplateItem[]> {
    return this.http.get<PromptTemplateItem[]>(`${this.base}/interview/admin/prompts`);
  }

  /** GET /interview/admin/prompts/{key}/history — append-only, mới nhất trước. */
  promptHistory(key: string): Observable<PromptTemplateItem[]> {
    return this.http.get<PromptTemplateItem[]>(
      `${this.base}/interview/admin/prompts/${encodeURIComponent(key)}/history`,
    );
  }

  /**
   * PUT /interview/admin/prompts/{key} — sửa = tạo version MỚI (không UPDATE tại chỗ).
   *
   * ⚠ Có hiệu lực với **mọi người dùng** ở lần sinh/chấm kế tiếp, sau khi cache prompt của
   * AIService hết hạn (mặc định 60s). KHÔNG cần deploy — đó vừa là điểm mạnh vừa là rủi ro.
   * 400 khi: khoá lạ · body rỗng · body quá dài · body chứa delimiter khung dữ liệu (AI-4).
   */
  updatePrompt(key: string, body: UpdatePromptTemplateRequest): Observable<PromptTemplateItem> {
    return this.http.put<PromptTemplateItem>(
      `${this.base}/interview/admin/prompts/${encodeURIComponent(key)}`,
      body,
    );
  }

  /**
   * DELETE /interview/admin/prompts/{key} → 204. Quay về bản mặc định trong code,
   * **giữ nguyên lịch sử** (không hard-delete). 404 khi khoá chưa từng được tuỳ biến.
   */
  resetPrompt(key: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/interview/admin/prompts/${encodeURIComponent(key)}`,
    );
  }
}
