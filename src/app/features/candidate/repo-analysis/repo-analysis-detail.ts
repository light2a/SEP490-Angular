import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { RepoAnalysisApi } from '../../../core/api/repo-analysis.api';
import { RepoAnalysisResponse } from '../../../core/models';
import { JobCategoryPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

/** Ngôn ngữ + tỉ lệ để hiển thị (BE trả BYTES theo ngôn ngữ, không phải phần trăm). */
interface LanguageShare {
  name: string;
  pct: number;
}

/**
 * Chi tiết 1 lần phân tích repo — trang riêng, mở được bằng URL.
 *
 * Trang danh sách vẫn giữ nguyên toàn bộ nội dung trong accordion (không làm mỏng): đây là phần
 * THÊM cho ca cần lưu/gửi link, không phải phần thay.
 */
@Component({
  selector: 'app-repo-analysis-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    JobCategoryPipe,
    Spinner,
  ],
  templateUrl: './repo-analysis-detail.html',
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin: 8px 0 4px;
      }
      .head h1 {
        margin: 0;
        font-size: 20px;
        word-break: break-all;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
        margin: 0 0 16px;
      }
      .card {
        padding: 20px;
      }
      .summary {
        white-space: pre-wrap;
      }
      h4 {
        margin: 18px 0 6px;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class RepoAnalysisDetail implements OnInit {
  private api = inject(RepoAnalysisApi);

  readonly id = input.required<string>();
  readonly analysis = signal<RepoAnalysisResponse | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  /** Ngôn ngữ chiếm tỉ trọng lớn nhất (tối đa 6) — nhiều repo có cả chục ngôn ngữ vụn. */
  readonly languageShares = computed<LanguageShare[]>(() => {
    const entries = Object.entries(this.analysis()?.languages ?? {});
    const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
    if (total <= 0) return [];
    return entries
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }));
  });

  ngOnInit(): void {
    this.api.get(this.id()).subscribe({
      next: (a) => {
        this.analysis.set(a);
        this.loading.set(false);
      },
      // 404 và 403 (không phải chủ — BC-3) gộp về một màn hình: phân biệt là tự nói cho người ta
      // biết id này có tồn tại và thuộc về ai đó.
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }
}
