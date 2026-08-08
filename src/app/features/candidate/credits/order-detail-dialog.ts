import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { OrderKind, OrderResponse, PackageResponse } from '../../../core/models';
import { OrderStatusPipe, PackageTypePipe, VndPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

export interface OrderDetailDialogData {
  orderId: string;
}

const ORDER_KIND_LABEL: Record<number, string> = {
  [OrderKind.CreditPack]: 'Mua credit',
  [OrderKind.InvoiceSettlement]: 'Tất toán hoá đơn',
  [OrderKind.SubscriptionPurchase]: 'Mua gói định kỳ',
  [OrderKind.SubscriptionRenewal]: 'Gia hạn gói định kỳ',
};

/**
 * Chi tiết một đơn — `GET /payment/order/{id}` (+ `GET /payment/package/{id}` để hiện TÊN gói
 * thay vì id trần). Dùng chung cho danh sách đơn của Candidate và của Employer.
 *
 * Dùng chính hai endpoint đã có mà trước đó không màn nào gọi: danh sách đơn chỉ hiện số tiền và
 * trạng thái, nên `payosOrderCode` (thứ duy nhất đối chiếu được với PayOS khi tiền đã trừ mà đơn
 * chưa Paid) không lộ ra ở đâu.
 *
 * ⚠ `checkoutUrl` CỐ Ý không hiện: nó chỉ có ở response TẠO đơn, endpoint đọc lại luôn trả null —
 * hiện một ô trống ở đây sẽ khiến người dùng tưởng link thanh toán đã mất.
 */
@Component({
  selector: 'app-order-detail-dialog',
  imports: [
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    VndPipe,
    OrderStatusPipe,
    PackageTypePipe,
    Spinner,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-ico">receipt_long</mat-icon>
      Chi tiết đơn
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <app-spinner message="Đang tải đơn…" />
      } @else if (error(); as err) {
        <p class="err">{{ err }}</p>
      } @else if (order(); as o) {
        <div class="row">
          <span class="label">Loại đơn</span>
          <span>{{ kindLabel(o.kind) }}</span>
        </div>
        <div class="row">
          <span class="label">Trạng thái</span>
          <span class="strong">{{ o.status | orderStatus }}</span>
        </div>
        <div class="row">
          <span class="label">Số tiền</span>
          <span class="strong">{{ o.amountVnd | vnd }}</span>
        </div>

        @if (pkg(); as p) {
          <div class="row">
            <span class="label">Gói</span>
            <span>{{ p.name }} ({{ p.type | packageType }})</span>
          </div>
          @if (p.interviewCredits != null) {
            <div class="row">
              <span class="label">Số credit</span>
              <span>{{ p.interviewCredits }}</span>
            </div>
          }
          @if (p.durationDays != null) {
            <div class="row">
              <span class="label">Thời hạn</span>
              <span>{{ p.durationDays }} ngày</span>
            </div>
          }
        } @else if (o.invoiceId) {
          <div class="row">
            <span class="label">Hoá đơn</span>
            <code class="mono">{{ o.invoiceId }}</code>
          </div>
        }

        <div class="row">
          <span class="label">Mã PayOS</span>
          <code class="mono">{{ o.payosOrderCode }}</code>
        </div>
        <div class="row">
          <span class="label">Tạo lúc</span>
          <span>{{ o.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
        </div>
        <div class="row">
          <span class="label">Hết hạn</span>
          <span>{{ o.expiredAt | date: 'dd/MM/yyyy HH:mm' }}</span>
        </div>
        @if (o.paidAt) {
          <div class="row">
            <span class="label">Thanh toán lúc</span>
            <span>{{ o.paidAt | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>
        }
        <div class="row">
          <span class="label">Mã đơn</span>
          <code class="mono">{{ o.id }}</code>
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
export class OrderDetailDialog {
  private api = inject(PaymentApi);
  readonly data = inject<OrderDetailDialogData>(MAT_DIALOG_DATA);

  readonly order = signal<OrderResponse | null>(null);
  readonly pkg = signal<PackageResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.order(this.data.orderId).subscribe({
      next: (o) => {
        this.order.set(o);
        this.loading.set(false);
        // Tên gói là thông tin PHỤ: gói đã bị xoá/ẩn vẫn phải xem được đơn ⇒ lỗi ở đây nuốt im
        // lặng, đơn vẫn hiện đầy đủ.
        if (o.packageId) {
          this.api.package(o.packageId).subscribe({ next: (p) => this.pkg.set(p), error: () => {} });
        }
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Không tải được chi tiết đơn.');
      },
    });
  }

  kindLabel(kind: number): string {
    return ORDER_KIND_LABEL[kind] ?? String(kind);
  }
}
