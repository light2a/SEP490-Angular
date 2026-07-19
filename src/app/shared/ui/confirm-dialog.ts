import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/** Nội dung hộp thoại xác nhận. `bullets` để liệt kê hệ quả — thứ người dùng dễ hiểu sai nhất. */
export interface ConfirmDialogData {
  title: string;
  message: string;
  /** Các dòng hệ quả (mỗi dòng 1 gạch đầu dòng). Dùng để nói rõ "cái gì mất, cái gì giữ". */
  bullets?: string[];
  /** Cảnh báo đậm (nền error) — dành cho hành động khó đảo. */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true → nút xác nhận màu cảnh báo (ban, hoàn tiền, xoá...). */
  danger?: boolean;
}

/**
 * Hộp thoại xác nhận dùng chung cho các hành động khó đảo (ban người dùng, hoàn tiền đơn,
 * sinh lại câu hỏi AI). Đóng với `true` = xác nhận, `false`/undefined = huỷ.
 *
 * Có mặt vì 3 màn khác nhau đều cần "nói rõ hệ quả trước khi bấm" — nếu mỗi màn tự viết
 * một hộp thoại thì lời cảnh báo sẽ lệch nhau, mà đây đúng là chỗ không được lệch.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      @if (data.danger) {
        <mat-icon class="title-ico danger">warning</mat-icon>
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.bullets?.length) {
        <ul class="bullets">
          @for (b of data.bullets; track b) {
            <li>{{ b }}</li>
          }
        </ul>
      }
      @if (data.warning) {
        <p class="warn">{{ data.warning }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false">{{ data.cancelLabel ?? 'Huỷ' }}</button>
      <button
        matButton="filled"
        [color]="data.danger ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel ?? 'Xác nhận' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .title-ico.danger {
        color: var(--mat-sys-error);
      }
      .bullets {
        margin: 8px 0 0;
        padding-left: 20px;
        font-size: 14px;
      }
      .bullets li {
        margin-bottom: 4px;
      }
      .warn {
        margin-top: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
    `,
  ],
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
