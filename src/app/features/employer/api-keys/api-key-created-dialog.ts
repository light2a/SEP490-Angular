import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NotifyService } from '../../../core/notify.service';
import { CreateApiKeyResponse } from '../../../core/models';

/**
 * Hiện key thô **đúng một lần** ngay sau khi tạo (F17).
 *
 * Backend chỉ lưu hash ⇒ không endpoint nào đọc lại được chuỗi này. Đóng hộp thoại mà chưa lưu là
 * mất vĩnh viễn — cách khắc phục duy nhất là thu hồi key rồi tạo cái khác. Vì thế hộp thoại:
 *
 * - mở với `disableClose: true` (bấm ra ngoài / ESC không đóng được) — mất key vì lỡ tay click
 *   nền là hỏng thật, không phải phiền toái nhỏ;
 * - **chốt nút đóng sau một checkbox xác nhận đã lưu**: không phải thủ tục rườm rà mà là chỗ duy
 *   nhất buộc người dùng đọc cảnh báo trước khi hệ quả xảy ra. Nút "Đóng" bấm được ngay sẽ bị
 *   click theo phản xạ và cảnh báo coi như không tồn tại.
 */
@Component({
  selector: 'app-api-key-created-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-ico">vpn_key</mat-icon>
      Đã tạo API key "{{ data.name }}"
    </h2>

    <mat-dialog-content>
      <p class="lead">
        Sao chép key ngay bây giờ. Đây là <strong>lần duy nhất</strong> hệ thống hiện chuỗi này —
        chúng tôi chỉ lưu bản băm, nên không ai (kể cả quản trị viên) đọc lại được.
      </p>

      <div class="key-box">
        <code class="key" data-testid="raw-key">{{ data.key }}</code>
        <button
          matIconButton
          type="button"
          aria-label="Sao chép key"
          title="Sao chép"
          (click)="copy()"
        >
          <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
        </button>
      </div>

      <p class="warn">
        <mat-icon inline>warning</mat-icon>
        Đóng hộp thoại mà chưa lưu = mất key. Muốn dùng tiếp phải thu hồi key này và tạo key mới.
      </p>

      <ul class="meta">
        <li>Tiền tố nhận diện: <code>{{ data.keyPrefix }}</code></li>
        <li>
          Dữ liệu cá nhân ứng viên (họ tên, email):
          <strong>{{ data.includePii ? 'CÓ trả về' : 'không trả về' }}</strong>
        </li>
        <li>
          Hết hạn:
          <strong>{{ data.expiresAt ? (data.expiresAt | date: 'short') : 'không đặt hạn' }}</strong>
        </li>
      </ul>

      <mat-checkbox [checked]="saved()" (change)="saved.set($event.checked)">
        Tôi đã lưu key vào nơi an toàn
      </mat-checkbox>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton="filled" color="primary" [disabled]="!saved()" [mat-dialog-close]="true">
        Đóng
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .lead {
        margin: 0 0 12px;
      }
      .key-box {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .key {
        flex: 1;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        word-break: break-all;
      }
      .warn {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 12px 0;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .meta {
        margin: 0 0 12px;
        padding-left: 20px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .meta li {
        margin-bottom: 4px;
      }
    `,
  ],
})
export class ApiKeyCreatedDialog {
  readonly data = inject<CreateApiKeyResponse>(MAT_DIALOG_DATA);
  private notify = inject(NotifyService);

  /** Chốt nút Đóng — xem docblock class về lý do không cho đóng ngay. */
  readonly saved = signal(false);
  readonly copied = signal(false);

  /**
   * Clipboard API không dùng được ở ngữ cảnh không bảo mật (http) và có thể bị người dùng từ chối
   * quyền. Thất bại thì phải NÓI RA — im lặng sẽ khiến người dùng tick "đã lưu" trong khi tay chưa
   * cầm được gì, rồi mất key.
   */
  copy(): void {
    navigator.clipboard?.writeText(this.data.key).then(
      () => {
        this.copied.set(true);
        this.notify.success('Đã sao chép key vào clipboard.');
      },
      () => this.notify.error('Không sao chép được — hãy bôi đen và copy thủ công.'),
    );
  }
}
