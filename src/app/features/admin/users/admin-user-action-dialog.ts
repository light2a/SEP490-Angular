import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface AdminUserActionData {
  mode: 'ban' | 'reset-password';
  email: string;
}

/** Kết quả: `null`/undefined = huỷ. */
export type AdminUserActionResult = { reason: string | null } | { newPassword: string };

/**
 * Hộp thoại nhập liệu cho 2 hành động admin trên 1 người dùng (F20):
 *  - `ban`: lý do (tuỳ chọn, ≤500) + nói rõ ban KHÔNG tức thì.
 *  - `reset-password`: mật khẩu mới, gõ 2 lần để không đặt nhầm rồi khoá luôn người ta ra ngoài.
 *
 * Tách khỏi ConfirmDialog vì cả hai đều cần nhập liệu, còn ConfirmDialog chỉ có yes/no.
 */
@Component({
  selector: 'app-admin-user-action-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    @if (data.mode === 'ban') {
      <h2 mat-dialog-title><mat-icon class="ico danger">block</mat-icon> Cấm người dùng</h2>
      <mat-dialog-content>
        <p>
          Cấm <strong>{{ data.email }}</strong> khỏi nền tảng. Người này sẽ không đăng nhập được nữa
          (kể cả qua Google hay link mời B2B), và mọi phiên làm mới đều bị thu hồi.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Lý do (tuỳ chọn)</mat-label>
          <textarea
            matInput
            rows="3"
            maxlength="500"
            [(ngModel)]="reason"
            name="reason"
            placeholder="Ví dụ: gian lận trong bài thi tuyển"
          ></textarea>
          <mat-hint align="end">{{ reason.length }} / 500</mat-hint>
        </mat-form-field>
        <p class="warn">
          Lệnh cấm <strong>không có hiệu lực tức thì</strong>: phiên đang mở của người này còn dùng
          được tối đa khoảng 15 phút nữa. Đây là giới hạn kiến trúc (các dịch vụ kiểm tra token
          ngoại tuyến), không phải lỗi. Cần chặn ngay lập tức thì phải xử lý ngoài hệ thống.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton mat-dialog-close>Huỷ</button>
        <button matButton="filled" color="warn" (click)="confirmBan()">Cấm người dùng</button>
      </mat-dialog-actions>
    } @else {
      <h2 mat-dialog-title><mat-icon class="ico">key</mat-icon> Đặt lại mật khẩu</h2>
      <mat-dialog-content>
        <p>
          Đặt mật khẩu mới cho <strong>{{ data.email }}</strong> và báo lại cho họ qua kênh khác.
          Hệ thống không gửi mật khẩu này đi đâu cả.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Mật khẩu mới</mat-label>
          <input matInput type="password" [(ngModel)]="pwd" name="pwd" autocomplete="new-password" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nhập lại mật khẩu mới</mat-label>
          <input
            matInput
            type="password"
            [(ngModel)]="pwd2"
            name="pwd2"
            autocomplete="new-password"
          />
        </mat-form-field>
        @if (error(); as e) {
          <p class="warn">{{ e }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton mat-dialog-close>Huỷ</button>
        <button matButton="filled" color="primary" (click)="confirmReset()">Đặt lại</button>
      </mat-dialog-actions>
    }
  `,
  styles: [
    `
      .ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .ico.danger {
        color: var(--mat-sys-error);
      }
      .full {
        width: 100%;
      }
      .warn {
        margin-top: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
    `,
  ],
})
export class AdminUserActionDialog {
  readonly data = inject<AdminUserActionData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AdminUserActionDialog, AdminUserActionResult>);

  reason = '';
  pwd = '';
  pwd2 = '';
  readonly error = signal<string | null>(null);

  confirmBan(): void {
    this.ref.close({ reason: this.reason.trim() || null });
  }

  confirmReset(): void {
    if (this.pwd.length < 6) {
      this.error.set('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (this.pwd !== this.pwd2) {
      this.error.set('Hai lần nhập không khớp.');
      return;
    }
    this.error.set(null);
    this.ref.close({ newPassword: this.pwd });
  }
}
