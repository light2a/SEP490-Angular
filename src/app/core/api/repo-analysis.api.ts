import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RepoAnalysisPage, RepoAnalysisRequest, RepoAnalysisResponse } from '../models';

/**
 * BC18 — phân tích repository GitHub public (`[Authorize(Roles="Candidate")]`).
 *
 * 🔴 PREFIX: controller khai `[Route("api/practice/repo-analysis")]`, nhưng đường client gọi là
 * **`/api/v1/interview/practice/repo-analysis`** — gateway thêm segment `interview`. Gọi thiếu nó ra
 * **404** và rất dễ đọc nhầm thành "backend chưa có endpoint" (đã có cả một vòng e2e đọc nhầm đúng
 * kiểu này). `environment.apiBase` đã gồm `/api/v1`, nên chỉ ghép `/interview/practice/...`.
 *
 * ⚠ POST trừ **1 credit** ví User → component phải cảnh báo chi phí trước khi gọi.
 */
@Injectable({ providedIn: 'root' })
export class RepoAnalysisApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/practice/repo-analysis`;

  /**
   * POST `/` → 201 `RepoAnalysisResponse`.
   * Lỗi: 400 (URL/jobCategory sai) · 402 (hết credit) · 403 (gói không bao gồm) · 404 (repo không
   * tồn tại) · 429 (GitHub rate limit, kèm header `Retry-After`) · 502 (AI/Payment bận).
   */
  create(body: RepoAnalysisRequest): Observable<RepoAnalysisResponse> {
    return this.http.post<RepoAnalysisResponse>(this.base, body);
  }

  /**
   * GET `/` — phân trang keyset (mẫu DB8): body là **mảng**, con trỏ trang kế nằm ở header
   * `X-Next-Cursor` (vắng = hết trang) ⇒ phải `observe: 'response'`, đọc body một mình là mất
   * đường sang trang sau trong im lặng.
   */
  list(opts?: { cursor?: string | null; limit?: number }): Observable<RepoAnalysisPage> {
    let params = new HttpParams();
    if (opts?.cursor) params = params.set('cursor', opts.cursor);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http.get<RepoAnalysisResponse[]>(this.base, { params, observe: 'response' }).pipe(
      map((res) => ({
        items: res.body ?? [],
        nextCursor: res.headers.get('X-Next-Cursor'),
      })),
    );
  }

  /** GET `/{id}` → 200 · 404 (không có) · 403 (không phải chủ — BC-3). */
  get(id: string): Observable<RepoAnalysisResponse> {
    return this.http.get<RepoAnalysisResponse>(`${this.base}/${id}`);
  }
}
