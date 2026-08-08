import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { InvoiceResponse, InvoiceStatus } from '../../../core/models';
import { VndPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

export interface InvoiceDetailDialogData {
  invoiceId: string;
}

const INVOICE_STATUS_LABEL: Record<number, string> = {
  [InvoiceStatus.Issued]: 'Đã phát hành',
  [InvoiceStatus.Paid]: 'Đã thanh toán',
  [InvoiceStatus.Overdue]: 'Quá hạn',
  [InvoiceStatus.Void]: 'Đã huỷ',
};

/**
 * Chi tiết một hoá đơn postpaid — `GET /payment/me/invoices/{id}`.
 *
 * Endpoint này đã có từ P8b nhưng trước đó không màn nào gọi: danh sách hoá đơn hiện sẵn mọi
 * trường, nên phần thêm được ở đây là **cách tính ra số tiền** (số lượt × đơn giá) và mã hoá đơn
 * để đối chiếu — thứ HR cần khi thắc mắc "sao kỳ này thu ngần này".
 *
 * Đọc LẠI từ server chứ không nhận nguyên object từ danh sách: hoá đơn có thể đã được thanh toán
 * ở tab khác, và trạng thái sai ở đây dẫn tới bấm "Thanh toán" một hoá đơn đã trả.
 */
@Component({
  selector: 'app-invoice-detail-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, VndPipe, Spinner],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-ico">receipt</mat-icon>
      Chi tiết hoá đơn
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <app-spinner message="Đang tải hoá đơn…" />
      } @else if (error(); as err) {
        <p class="err">{{ err }}</p>
      } @else if (invoice(); as inv) {
        <div class="row">
          <span class="label">Kỳ</span>
          <span>
            {{ inv.periodStart | date: 'dd/MM/yyyy' }} – {{ inv.periodEnd | date: 'dd/MM/yyyy' }}
          </span>
        </div>
        <div class="row">
          <span class="label">Trạng thái</span>
          <span class="strong">{{ statusLabel(inv.status) }}</span>
        </div>
        <div class="row">
          <span class="label">Số lượt phỏng vấn</span>
          <span>{{ inv.interviewCount }}</span>
        </div>
        <div class="row">
          <span class="label">Đơn giá</span>
          <span>{{ inv.unitPrice | vnd }}</span>
        </div>
        <div class="row total">
          <span class="label">Thành tiền</span>
          <span>{{ inv.amount | vnd }}</span>
        </div>
        <p class="calc">{{ inv.interviewCount }} lượt × {{ inv.unitPrice | vnd }}</p>
        <div class="row">
          <span class="label">Tạo lúc</span>
          <span>{{ inv.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
        </div>
        <div class="row">
          <span class="label">Mã hoá đơn</span>
          <code class="mono">{{ inv.id }}</code>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Đóng</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 5px 0;
      }
      .label {
        color: var(--mat-sys-on-surface-variant);
      }
      .strong {
        font-weight: 600;
      }
      .total {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .calc {
        margin: 0 0 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        text-align: right;
      }
      .mono {
        font-family: monospace;
        font-size: 12px;
        word-break: break-all;
      }
      .err {
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class InvoiceDetailDialog {
  private api = inject(PaymentApi);
  readonly data = inject<InvoiceDetailDialogData>(MAT_DIALOG_DATA);

  readonly invoice = signal<InvoiceResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.invoice(this.data.invoiceId).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Không tải được hoá đơn.');
      },
    });
  }

  statusLabel(status: InvoiceStatus): string {
    return INVOICE_STATUS_LABEL[status] ?? String(status);
  }
}
