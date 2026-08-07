import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { RepoAnalysisApi } from '../../../core/api/repo-analysis.api';
import { NotifyService } from '../../../core/notify.service';
import {
  JD_TEXT_MAX_CHARS,
  JOB_CATEGORIES,
  JobCategory,
  RepoAnalysisResponse,
} from '../../../core/models';
import { JobCategoryPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * URL repo hợp lệ ở mức tối thiểu mà BE chấp nhận: HTTPS + host github.com + có `{owner}/{repo}`.
 *
 * CỐ Ý LỎNG HƠN regex của BE (`RepoAnalysisService.AnalyzeAsync`): BE chỉ lấy 2 segment đầu nên
 * `https://github.com/owner/repo/tree/main` là hợp lệ. Chặn chặt hơn BE ở FE = từ chối input mà
 * backend vốn nhận được, một kiểu hỏng khó truy vì "server bảo được mà form bảo không".
 * Đây chỉ là lưới bắt lỗi gõ sai (thiếu owner, dùng http) để đỡ một round-trip 400.
 */
const GITHUB_REPO_URL = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+/;

/** Ngôn ngữ + tỉ lệ để hiển thị (BE trả BYTES theo ngôn ngữ, không phải phần trăm). */
interface LanguageShare {
  name: string;
  pct: number;
}

@Component({
  selector: 'app-repo-analysis',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatExpansionModule,
    MatProgressBarModule,
    JobCategoryPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './repo-analysis.html',
  styles: [
    `
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 20px;
      }
      .form-card {
        padding: 20px;
        margin-bottom: 28px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .err {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        border-radius: 8px;
        padding: 12px 14px;
        margin: 4px 0 12px;
      }
      .err mat-icon {
        flex: none;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
        margin: 0 0 12px;
      }
      .summary {
        white-space: pre-wrap;
      }
      h4 {
        margin: 18px 0 6px;
      }
      .more {
        margin-top: 12px;
        display: flex;
        justify-content: center;
      }
    `,
  ],
})
export class RepoAnalysis {
  private fb = inject(FormBuilder);
  private api = inject(RepoAnalysisApi);
  private notify = inject(NotifyService);

  readonly jobCategories = JOB_CATEGORIES;
  readonly jdTextMaxChars = JD_TEXT_MAX_CHARS;

  readonly analyses = signal<RepoAnalysisResponse[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly submitting = signal(false);
  /** Panel nào đang mở — mở sẵn kết quả vừa phân tích để khỏi phải đi tìm. */
  readonly expandedId = signal<string | null>(null);
  /**
   * Lỗi hiện ngay trên form. Cần CẢ inline lẫn toast vì toast biến mất sau 4,5s, còn 402/429 là hai
   * ca người dùng phải đọc kỹ mới biết làm gì tiếp (nạp credit / chờ hết rate limit).
   */
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    repoUrl: ['', [Validators.required, Validators.pattern(GITHUB_REPO_URL)]],
    jobCategory: ['BA' as JobCategory, [Validators.required]],
    jdText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
  });

  readonly jdTextLength = signal(0);

  constructor() {
    this.form.controls.jdText.valueChanges.subscribe((v) => this.jdTextLength.set(v.length));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (page) => {
        this.analyses.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Trang kế theo con trỏ keyset (header `X-Next-Cursor`) — nối vào cuối, không thay cả danh sách. */
  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api.list({ cursor }).subscribe({
      next: (page) => {
        this.analyses.update((list) => [...list, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  submit(): void {
    // Dán URL từ trình duyệt/chat rất hay kèm khoảng trắng đầu-cuối, mà `Validators.pattern` neo CẢ
    // chuỗi ⇒ " https://github.com/o/r " bị coi là SAI ĐỊNH DẠNG. Người dùng nhìn thấy URL hoàn toàn
    // đúng mà form vẫn báo sai định dạng — không có cách nào đoán ra là do khoảng trắng vô hình.
    // Chuẩn hoá TRƯỚC khi validate, đừng bắt họ tự đi tìm.
    const trimmedUrl = this.form.controls.repoUrl.value.trim();
    if (trimmedUrl !== this.form.controls.repoUrl.value) {
      this.form.controls.repoUrl.setValue(trimmedUrl);
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const jdText = v.jdText.trim();
    this.submitting.set(true);
    this.error.set(null);
    this.api
      .create({
        repoUrl: v.repoUrl.trim(),
        jobCategory: v.jobCategory,
        // Không có JD → gửi null thay vì chuỗi rỗng: BE gate `jdMatch` theo "có nội dung JD".
        jdText: jdText || null,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.analyses.update((list) => [res, ...list]);
          this.expandedId.set(res.id);
          this.notify.success('Phân tích repository hoàn tất.');
        },
        error: (e: HttpErrorResponse) => {
          this.submitting.set(false);
          this.handleError(e);
        },
      });
  }

  /** Ngôn ngữ chiếm tỉ trọng lớn nhất (tối đa 6) — nhiều repo có cả chục ngôn ngữ vụn. */
  languageShares(a: RepoAnalysisResponse): LanguageShare[] {
    const entries = Object.entries(a.languages ?? {});
    const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
    if (total <= 0) return [];
    return entries
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }));
  }

  /**
   * Thông báo lỗi theo từng mã, tiếng Việt và NÓI ĐƯỢC PHẢI LÀM GÌ.
   *
   * Chỉ toast những mã mà `errorInterceptor` toàn cục KHÔNG xử: 400 · 404 · 429. Các mã còn lại
   * (402/403/50x) interceptor đã toast rồi — toast lần hai là hai popup chồng nhau nói khác chữ
   * cùng một việc; ta chỉ hiện thêm bản inline chi tiết hơn.
   */
  private handleError(e: HttpErrorResponse): void {
    const server = extractErrorMessage(e);
    let msg: string;
    switch (e.status) {
      case 402:
        // Interceptor còn điều hướng sang trang mua credit → người dùng có thể không kịp đọc inline.
        msg =
          'Bạn không còn credit để phân tích repository (mỗi lần phân tích trừ 1 credit). ' +
          'Hãy nạp thêm credit rồi thử lại.';
        break;
      case 429:
        msg =
          'GitHub đang giới hạn số lượt truy cập (rate limit) nên chưa đọc được repository.' +
          this.retryAfterHint(e) +
          ' Credit của bạn KHÔNG bị trừ cho lần này.';
        break;
      case 502:
        msg =
          'Dịch vụ AI/thanh toán đang bận nên phân tích chưa hoàn tất. Vui lòng thử lại sau ít phút — ' +
          'credit của bạn KHÔNG bị trừ cho lần này.';
        break;
      case 404:
        msg =
          server ??
          'Không tìm thấy repository này trên GitHub. Kiểm tra lại URL và nhớ rằng repo phải là PUBLIC.';
        break;
      case 403:
        // Hai nghĩa khác nhau: gói dịch vụ không bao gồm (tiering) HOẶC không phải chủ dữ liệu.
        msg = server ?? 'Bạn không có quyền dùng tính năng phân tích repository.';
        break;
      case 400:
        msg = server ?? 'Dữ liệu chưa hợp lệ. Kiểm tra URL repository và nhóm nghề.';
        break;
      default:
        msg = server ?? 'Phân tích repository thất bại. Vui lòng thử lại.';
    }
    this.error.set(msg);
    if (e.status === 400 || e.status === 404 || e.status === 429) this.notify.error(msg);
  }

  /**
   * `Retry-After` của GitHub có thể là SỐ GIÂY hoặc HTTP-date → không parse cứng thành số.
   * Vắng header thì không bịa ra mốc thời gian (thà không nói còn hơn nói sai).
   */
  private retryAfterHint(e: HttpErrorResponse): string {
    const raw = e.headers?.get('Retry-After');
    if (!raw) return '';
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs > 0) {
      return secs < 60
        ? ` Vui lòng thử lại sau khoảng ${Math.ceil(secs)} giây.`
        : ` Vui lòng thử lại sau khoảng ${Math.ceil(secs / 60)} phút.`;
    }
    return ` Vui lòng thử lại sau: ${raw}.`;
  }
}
