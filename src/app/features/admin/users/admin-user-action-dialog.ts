import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PLATFORM_ROLES, PLATFORM_ROLE_LABEL, PlatformRole } from '../../../core/models';

export interface AdminUserActionData {
  mode: 'ban' | 'reset-password' | 'role';
  email: string;
  /** Chỉ dùng cho mode `role`: vai trò hiện tại, để chặn gửi đi một thay đổi rỗng. */
  currentRole?: string;
}

/** Kết quả: `null`/undefined = huỷ. */
export type AdminUserActionResult =
  | { reason: string | null }
  | { newPassword: string }
  | { role: PlatformRole };

/**
 * Hộp thoại nhập liệu cho 3 hành động admin trên 1 người dùng (F20 + đổi vai trò):
 *  - `ban`: lý do (tuỳ chọn, ≤500) + nói rõ ban KHÔNG tức thì.
 *  - `reset-password`: mật khẩu mới, gõ 2 lần để không đặt nhầm rồi khoá luôn người ta ra ngoài.
 *  - `role`: chọn 1 trong 3 platform-role (AUTH-3) + nói rõ hệ quả (đăng xuất, độ trễ ≤15').
 *
 * Tách khỏi ConfirmDialog vì cả ba đều cần nhập liệu, còn ConfirmDialog chỉ có yes/no.
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
    MatSelectModule,
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
    } @else if (data.mode === 'role') {
      <h2 mat-dialog-title><mat-icon class="ico">badge</mat-icon> Đổi vai trò</h2>
      <mat-dialog-content>
        <p>
          Vai trò của <strong>{{ data.email }}</strong> trên nền tảng. Hiện tại:
          <strong>{{ data.currentRole || 'chưa có' }}</strong
          >.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Vai trò mới</mat-label>
          <mat-select [(ngModel)]="role" name="role">
            @for (r of roles; track r) {
              <mat-option [value]="r">{{ roleLabel[r] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (role === 'Admin' && data.currentRole !== 'Admin') {
          <p class="warn">
            Quản trị viên nền tảng thấy và sửa được dữ liệu của <strong>mọi</strong> tổ chức, kể cả
            đơn hàng và ví tiền. Chỉ cấp cho người thực sự cần.
          </p>
        }
        @if (error(); as e) {
          <p class="warn">{{ e }}</p>
        }
        <p class="note">
          Người này sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại. Quyền cũ còn hiệu lực
          tối đa khoảng 15 phút nữa — giới hạn kiến trúc (các dịch vụ kiểm tra token ngoại tuyến),
          không phải lỗi.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton mat-dialog-close>Huỷ</button>
        <button matButton="filled" color="primary" (click)="confirmRole()">Đổi vai trò</button>
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
      .note {
        margin-top: 8px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class AdminUserActionDialog {
  readonly data = inject<AdminUserActionData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AdminUserActionDialog, AdminUserActionResult>);

  readonly roles = PLATFORM_ROLES;
  /** Nhãn chỉ để HIỂN THỊ — giá trị gửi đi luôn là tên gốc (server phân biệt hoa thường). */
  readonly roleLabel = PLATFORM_ROLE_LABEL;
  reason = '';
  pwd = '';
  pwd2 = '';
  // Vai trò hiện tại có thể là "No role" (server trả khi user chưa có role nào) — giá trị đó
  // không gửi lại được, nên lùi về Candidate thay vì để select mang một giá trị chắc chắn 400.
  role: PlatformRole = (PLATFORM_ROLES as readonly string[]).includes(this.data.currentRole ?? '')
    ? (this.data.currentRole as PlatformRole)
    : 'Candidate';
  readonly error = signal<string | null>(null);

  confirmRole(): void {
    if (this.role === this.data.currentRole) {
      // Server coi đây là no-op vô hại, nhưng để lọt thì admin nhận thông báo "đã đổi" trong khi
      // chẳng có gì đổi — tệ hơn một câu báo lỗi thẳng thắn.
      this.error.set('Vai trò không thay đổi. Chọn một vai trò khác hoặc bấm Huỷ.');
      return;
    }
    this.error.set(null);
    this.ref.close({ role: this.role });
  }

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
