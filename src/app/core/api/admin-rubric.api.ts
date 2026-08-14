import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminRubricPreviewRun,
  JobCategory,
  RubricLanguage,
  RunAdminRubricPreviewRequest,
  SystemRubricMatrixCell,
  SystemRubricResponse,
  UpdateSystemRubricRequest,
  UpdateSystemRubricResponse,
} from '../models';

/**
 * BỘ CHUẨN HỆ THỐNG (rubric B2C) — `api/v1/interview/admin/rubrics`, `[Authorize(Roles="Admin")]`.
 *
 * Tách khỏi `AdminOpsApi` có chủ đích: file kia là công cụ **vận hành** (đo tải, sửa prompt), còn
 * đây là **dữ liệu nghiệp vụ** mà đường chấm đọc thẳng. Tách file thì hai luồng phát triển không
 * chọi nhau trên cùng một service.
 *
 * ⚠ `language` LUÔN gửi tường minh. Bộ chuẩn đánh version theo từng ô `(nghề, ngôn ngữ)`, nên bỏ
 * trống tham số là để backend tự đoán — mà đoán sai ở đây nghĩa là ghi đè nhầm bộ của ngôn ngữ kia.
 */
@Injectable({ providedIn: 'root' })
export class AdminRubricApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/admin/rubrics`;

  private lang(language: RubricLanguage): HttpParams {
    return new HttpParams().set('language', language);
  }

  /** GET /admin/rubrics?language= — ma trận trạng thái (mỗi nghề 1 dòng cho ngôn ngữ đang xem). */
  matrix(language: RubricLanguage): Observable<SystemRubricMatrixCell[]> {
    return this.http.get<SystemRubricMatrixCell[]>(this.base, { params: this.lang(language) });
  }

  /** GET /admin/rubrics/{jobCategory}?language= — 7 tiêu chí + mốc của đúng một ô. */
  get(jobCategory: JobCategory, language: RubricLanguage): Observable<SystemRubricResponse> {
    return this.http.get<SystemRubricResponse>(`${this.base}/${jobCategory}`, {
      params: this.lang(language),
    });
  }

  /**
   * PUT — chỉ gửi `id` + `description` + `levels`.
   *
   * `changed:false` nghĩa là nội dung không khác bản đang chạy nên backend KHÔNG bump version.
   * Đó là câu trả lời đúng chứ không phải lỗi: bump khi không đổi gì làm nhãn phiên bản mất nghĩa.
   */
  update(
    jobCategory: JobCategory,
    language: RubricLanguage,
    body: UpdateSystemRubricRequest,
  ): Observable<UpdateSystemRubricResponse> {
    return this.http.put<UpdateSystemRubricResponse>(`${this.base}/${jobCategory}`, body, {
      params: this.lang(language),
    });
  }

  /** DELETE — reset ô này về bộ gốc (append một phiên bản mới có nội dung baseline, không xoá lịch sử). */
  reset(jobCategory: JobCategory, language: RubricLanguage): Observable<unknown> {
    return this.http.delete(`${this.base}/${jobCategory}`, { params: this.lang(language) });
  }

  /** GET history — append-only, mới nhất trước. */
  history(jobCategory: JobCategory, language: RubricLanguage): Observable<SystemRubricResponse[]> {
    return this.http.get<SystemRubricResponse[]>(`${this.base}/${jobCategory}/history`, {
      params: this.lang(language),
    });
  }

  // ── Chấm thử ────────────────────────────────────────────────────────────────
  /**
   * POST preview → chấm THẬT 3 bài mẫu bằng đúng bộ chấm của người luyện.
   * **429** = hết trần miễn phí của phiên bản này (không phải lỗi hệ thống) — sửa mốc rồi Lưu
   * sẽ sang phiên bản mới và được cấp lượt mới.
   */
  runPreview(
    jobCategory: JobCategory,
    language: RubricLanguage,
    body: RunAdminRubricPreviewRequest,
  ): Observable<AdminRubricPreviewRun> {
    return this.http.post<AdminRubricPreviewRun>(`${this.base}/${jobCategory}/preview`, body, {
      params: this.lang(language),
    });
  }

  /** GET preview — lịch sử chấm thử của ô này. */
  previewRuns(
    jobCategory: JobCategory,
    language: RubricLanguage,
  ): Observable<AdminRubricPreviewRun[]> {
    return this.http.get<AdminRubricPreviewRun[]>(`${this.base}/${jobCategory}/preview`, {
      params: this.lang(language),
    });
  }
}
