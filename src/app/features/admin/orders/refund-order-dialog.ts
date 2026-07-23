import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface RefundOrderDialogData {
  orderCode: number;
  amountVnd: number;
  /**
   * Có giá trị = lần gọi trước đã bị 409 vì ví không còn đủ credit. Hộp thoại mở lại
   * với con số thu hồi được để admin xác nhận LẦN NỮA, thay vì nuốt 409 thành lỗi lạ.
   */
  partial?: { creditsPurchased: number; clawbackPossible: number } | null;
}

export interface RefundOrderDialogResult {
  reason: string;
  gatewayRef: string | null;
  allowPartialClawback: boolean;
  /** Admin đã chuyển tiền thật cho khách rồi → đánh dấu "đã chuyển" luôn (mặc định false = chờ). */
  settledNow: boolean;
}

/**
 * Hộp thoại hoàn tiền 1 đơn (F18).
 *
 * Nói rõ hai điều admin dễ hiểu sai:
 *  1. Hệ thống KHÔNG chuyển tiền — phải tự hoàn trên dashboard PayOS rồi nhập mã tham chiếu.
 *  2. Khi ví đã tiêu bớt credit, hoàn tiền chỉ thu hồi được một phần; số cụ thể hiện ra và
 *     admin phải bấm xác nhận lần nữa.
 */
@Component({
  selector: 'app-refund-order-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="ico danger">currency_exchange</mat-icon>
      {{ data.partial ? 'Xác nhận thu hồi một phần' : 'Hoàn tiền đơn' }}
    </h2>
    <mat-dialog-content>
      @if (data.partial; as p) {
        <p class="warn">
          Ví đã tiêu bớt credit nên <strong>không thu hồi đủ</strong>: đơn này bán
          <strong>{{ p.creditsPurchased }}</strong> credit nhưng chỉ thu hồi được
          <strong>{{ p.clawbackPossible }}</strong>. Tiếp tục nghĩa là chấp nhận thu hồi thiếu
          {{ p.creditsPurchased - p.clawbackPossible }} credit.
        </p>
      } @else {
        <p>
          Hoàn đơn <code>{{ data.orderCode }}</code> ({{ data.amountVnd }} ₫). Hệ thống sẽ đánh dấu
          đơn là đã hoàn và thu hồi credit đã cấp.
        </p>
      }

      <p class="note">
        <mat-icon inline>info</mat-icon>
        Hệ thống <strong>không tự chuyển tiền về cho khách</strong>. Bạn phải hoàn trên dashboard
        PayOS rồi nhập mã giao dịch hoàn vào đây để đối chiếu về sau.
      </p>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Lý do hoàn *</mat-label>
        <textarea
          matInput
          rows="2"
          maxlength="500"
          [(ngModel)]="reason"
          name="reason"
          placeholder="Ví dụ: khách mua nhầm gói"
        ></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Mã giao dịch hoàn của PayOS (nếu có)</mat-label>
        <input
          matInput
          maxlength="100"
          [(ngModel)]="gatewayRef"
          name="gatewayRef"
          (ngModelChange)="onGatewayRefChange()"
        />
        <mat-hint>Bỏ trống nếu hoàn bằng chuyển khoản tay (không có mã).</mat-hint>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="settledNow" name="settledNow" class="settled-box">
        Tôi đã chuyển tiền cho khách rồi
      </mat-checkbox>
      <p class="note-sm">
        Bỏ trống nếu chưa chuyển — đơn sẽ vào danh sách <strong>“chờ chuyển tiền”</strong> để không quên.
      </p>

      @if (error(); as e) {
        <p class="warn">{{ e }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Huỷ</button>
      <button matButton="filled" color="warn" (click)="confirm()">
        {{ data.partial ? 'Chấp nhận thu hồi một phần' : 'Hoàn tiền' }}
      </button>
    </mat-dialog-actions>
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
      .note {
        margin: 8px 0 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .warn {
        margin: 8px 0;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .settled-box {
        display: block;
        margin-top: 4px;
      }
      .note-sm {
        margin: 2px 0 4px 34px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class RefundOrderDialog {
  readonly data = inject<RefundOrderDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RefundOrderDialog, RefundOrderDialogResult>);

  reason = '';
  gatewayRef = '';
  settledNow = false;
  readonly error = signal<string | null>(null);

  /** Nhập mã hoàn = đã làm trên dashboard PayOS → tự tick "đã chuyển tiền". */
  onGatewayRefChange(): void {
    if (this.gatewayRef.trim()) this.settledNow = true;
  }

  confirm(): void {
    const reason = this.reason.trim();
    // Backend đòi 3..500; chặn ở đây để admin sửa ngay thay vì ăn 400 rồi mất nội dung vừa gõ.
    if (reason.length < 3) {
      this.error.set('Lý do hoàn phải có ít nhất 3 ký tự.');
      return;
    }
    this.error.set(null);
    this.ref.close({
      reason,
      gatewayRef: this.gatewayRef.trim() || null,
      // Chỉ bật khi admin đã nhìn thấy con số thu hồi được và xác nhận lần hai.
      allowPartialClawback: !!this.data.partial,
      settledNow: this.settledNow,
    });
  }
}
