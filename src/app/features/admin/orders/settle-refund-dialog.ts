import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface SettleRefundDialogData {
  orderCode: number;
  amountVnd: number;
}

export interface SettleRefundDialogResult {
  gatewayRef: string | null;
}

/**
 * Hộp thoại "Xác nhận đã chuyển tiền hoàn cho khách" (F18).
 *
 * Dùng khi đơn ĐÃ được đánh dấu hoàn nhưng lúc đó chưa chuyển tiền (đang ở trạng thái "chờ chuyển
 * tiền"). Admin chuyển tiền trên dashboard PayOS / chuyển khoản tay rồi mở hộp thoại này để đóng dấu.
 * KHÔNG đụng credit — chỉ ghi mốc đối soát + mã tham chiếu.
 */
@Component({
  selector: 'app-settle-refund-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="ico">price_check</mat-icon>
      Xác nhận đã chuyển tiền
    </h2>
    <mat-dialog-content>
      <p>
        Xác nhận <strong>đã chuyển tiền hoàn</strong> cho khách của đơn <code>{{ data.orderCode }}</code>
        ({{ data.amountVnd }} ₫). Chỉ đóng dấu đối soát — không thay đổi credit hay trạng thái đơn.
      </p>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Mã giao dịch hoàn của PayOS (nếu có)</mat-label>
        <input matInput maxlength="100" [(ngModel)]="gatewayRef" name="gatewayRef" />
        <mat-hint>Bỏ trống nếu chuyển khoản tay không có mã.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Huỷ</button>
      <button matButton="filled" (click)="confirm()">Xác nhận đã chuyển</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .full {
        width: 100%;
        margin-top: 8px;
      }
    `,
  ],
})
export class SettleRefundDialog {
  readonly data = inject<SettleRefundDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SettleRefundDialog, SettleRefundDialogResult>);

  gatewayRef = '';

  confirm(): void {
    this.ref.close({ gatewayRef: this.gatewayRef.trim() || null });
  }
}
