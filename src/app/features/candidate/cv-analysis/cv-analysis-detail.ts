import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { CvAnalysisApi } from '../../../core/api/cv-analysis.api';
import { CvAnalysisResponse } from '../../../core/models';
import { JobCategoryPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Chi tiết 1 lần phân tích CV — trang riêng để chia sẻ/đánh dấu được bằng URL.
 *
 * ⚠ CỐ Ý KHÔNG làm mỏng payload của trang danh sách để "nhường việc" cho trang này: danh sách
 * hiện đang đóng luôn vai chi tiết (mở accordion là thấy đủ), và ba mảng `strengths`/`weaknesses`/
 * `suggestions` bên đó được duyệt `@for` không guard — cắt bớt là văng runtime trắng cả mục lịch
 * sử. Đây là phần THÊM, không phải phần thay.
 */
@Component({
  selector: 'app-cv-analysis-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    JobCategoryPipe,
    Spinner,
  ],
  templateUrl: './cv-analysis-detail.html',
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
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
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
export class CvAnalysisDetail implements OnInit {
  private api = inject(CvAnalysisApi);

  readonly id = input.required<string>();
  readonly analysis = signal<CvAnalysisResponse | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.api.get(this.id()).subscribe({
      next: (a) => {
        this.analysis.set(a);
        this.loading.set(false);
      },
      // 404 (không có) và 403 (không phải chủ — BC-3) đều dẫn tới cùng một màn hình: không có gì
      // để xem. Cố ý KHÔNG phân biệt hai ca trên UI — nói "cái này tồn tại nhưng của người khác"
      // là tự rò thông tin về dữ liệu người khác.
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }
}
