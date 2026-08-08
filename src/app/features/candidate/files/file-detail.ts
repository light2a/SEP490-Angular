import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FilesApi } from '../../../core/api/files.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { FileRecord } from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Chi tiết 1 file CV/JD: metadata + TOÀN VĂN đã bóc + thay file tại chỗ.
 *
 * Trang danh sách cố ý không mang toàn văn (payload + hở dữ liệu), nên đây là chỗ duy nhất xem
 * được AI thực sự đọc ra gì từ PDF của mình — quan trọng vì PDF scan/nhiều cột hay bị bóc lỗi,
 * mà người dùng chỉ nhìn danh sách thì không tài nào biết CV của họ vào hệ thống ra hình gì.
 */
@Component({
  selector: 'app-file-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    Spinner,
  ],
  templateUrl: './file-detail.html',
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin: 8px 0 16px;
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
        margin-bottom: 16px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      .card {
        padding: 20px;
      }
      /* Toàn văn bóc từ PDF: giữ nguyên xuống dòng (đó chính là thứ cần soi khi bóc lỗi)
         và cho cuộn thay vì kéo dài vô tận. */
      .parsed {
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 60vh;
        overflow: auto;
        background: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 12px;
        font-size: 13px;
        line-height: 1.6;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class FileDetail implements OnInit {
  private api = inject(FilesApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly id = input.required<string>();
  readonly file = signal<FileRecord | null>(null);
  readonly parsedText = signal<string | null>(null);
  readonly loading = signal(true);
  /** Toàn văn nạp rời (endpoint khác) → có trạng thái riêng, không dựa vào `loading` của metadata. */
  readonly loadingText = signal(true);
  readonly replacing = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.get(this.id()).subscribe({
      next: (f) => {
        this.file.set(f);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notify.error('Không tải được thông tin file.');
      },
    });
    this.loadParsedText();
  }

  private loadParsedText(): void {
    this.loadingText.set(true);
    this.api.parsedText(this.id()).subscribe({
      next: (r) => {
        this.parsedText.set(r.parsedText ?? '');
        this.loadingText.set(false);
      },
      // Bóc lỗi/chưa bóc là ca BÌNH THƯỜNG (PDF scan), không phải sự cố → để null và nói ở
      // template, đừng bắn toast lỗi làm người dùng tưởng hệ thống hỏng.
      error: () => {
        this.parsedText.set(null);
        this.loadingText.set(false);
      },
    });
  }

  /**
   * Thay nội dung file, GIỮ NGUYÊN id — khác hẳn xoá-rồi-tải-lại: id cũ còn được các buổi luyện
   * và bản phân tích CV cũ tham chiếu tới, xoá là chúng trỏ vào khoảng không.
   */
  onReplace(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    if (picked.type !== 'application/pdf') {
      this.notify.error('Chỉ chấp nhận file PDF.');
      return;
    }
    if (picked.size > 10 * 1024 * 1024) {
      this.notify.error('File vượt quá 10MB.');
      return;
    }
    this.replacing.set(true);
    this.api.replace(this.id(), picked).subscribe({
      next: () => {
        this.replacing.set(false);
        this.notify.success('Đã thay file.');
        // Nạp lại CẢ metadata lẫn toàn văn: cả hai đều đổi theo file mới.
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.replacing.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Thay file thất bại.');
      },
    });
  }

  download(): void {
    this.api.download(this.id()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.notify.error('Không tải được file.'),
    });
  }

  remove(): void {
    const f = this.file();
    if (!f || !confirm(`Xoá "${f.originalName}"?`)) return;
    this.api.remove(this.id()).subscribe({
      next: () => this.router.navigate(['/candidate/files']),
      error: () => this.notify.error('Xoá thất bại.'),
    });
  }
}
