import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AddKnowledgeSourceRequest,
  Context7Candidate,
  Context7IngestRequest,
  KnowledgeSource,
  KnowledgeSourcePage,
} from '../models';

/**
 * RAG grounding — quản kho tri thức nguồn (Contract 3). Mọi endpoint `[Authorize(Roles="Admin")]`,
 * gọi InterviewService qua Gateway (`/api/v1/interview/admin/knowledge/*`).
 *
 * ⚠ API service này KHÔNG bao giờ nhận/gửi credential Context7 — key sống ở server. FE chỉ đẩy
 * `libraryId`/`topics`/URL/nội dung dán tay.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/admin/knowledge`;

  /**
   * GET / — danh sách nguồn, phân trang keyset (mẫu DB8): body là mảng, con trỏ trang kế nằm ở
   * header `X-Next-Cursor` (vắng = hết trang) ⇒ phải đọc cả response, không chỉ body.
   */
  list(opts?: { cursor?: string | null; limit?: number }): Observable<KnowledgeSourcePage> {
    let params = new HttpParams();
    if (opts?.cursor) params = params.set('cursor', opts.cursor);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http
      .get<KnowledgeSource[]>(this.base, { params, observe: 'response' })
      .pipe(
        map((res) => ({
          items: res.body ?? [],
          nextCursor: res.headers.get('X-Next-Cursor'),
        })),
      );
  }

  /** POST / — ingest nguồn dán tay / URL → 201 KnowledgeSource. */
  add(body: AddKnowledgeSourceRequest): Observable<KnowledgeSource> {
    return this.http.post<KnowledgeSource>(this.base, body);
  }

  /**
   * DELETE /{id} — server xoá point Qdrant TRƯỚC rồi mới xoá row Postgres (Contract 3). FE chỉ gọi.
   */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** POST /{id}/reindex — re-chunk + re-embed lại nguồn. */
  reindex(id: string): Observable<KnowledgeSource> {
    return this.http.post<KnowledgeSource>(`${this.base}/${id}/reindex`, {});
  }

  /** GET /context7/search — proxy Context7 tìm thư viện ứng viên (kèm reputation). */
  context7Search(libraryName: string, query: string): Observable<Context7Candidate[]> {
    let params = new HttpParams().set('libraryName', libraryName);
    if (query) params = params.set('query', query);
    return this.http.get<Context7Candidate[]>(`${this.base}/context7/search`, { params });
  }

  /** POST /context7/ingest — nạp 1 thư viện Context7 theo các chủ đề → 201 KnowledgeSource. */
  context7Ingest(body: Context7IngestRequest): Observable<KnowledgeSource> {
    return this.http.post<KnowledgeSource>(`${this.base}/context7/ingest`, body);
  }
}
