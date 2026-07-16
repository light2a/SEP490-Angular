import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../../core/api/payment.api';
import { OrderStatus } from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Trang PayOS redirect về: /candidate/payment/success | /candidate/payment/cancel.
 * PayOS gắn `?orderCode=...&status=...` → tự đối soát đơn (khớp orderCode qua my-orders → orderStatus)
 * để hiện credit đã cộng chưa, thay vì bắt user tự bấm "Kiểm tra".
 */
@Component({
  selector: 'app-payment-return',
  imports: [RouterLink, MatButtonModule, MatIconModule, Spinner],
  template: `
    <div class="wrap">
      <mat-icon [class.ok]="success()" [class.no]="!success()">
        {{ success() ? 'check_circle' : 'cancel' }}
      </mat-icon>
      <h1>{{ success() ? 'Thanh toán thành công' : 'Thanh toán đã huỷ' }}</h1>

      @if (success()) {
        @if (checking()) {
          <app-spinner [diameter]="28" message="Đang xác nhận credit..." />
        } @else if (paid()) {
          <p class="paid">Credit đã được cộng vào ví của bạn.</p>
        } @else {
          <p>
            Credit sẽ được cộng sau khi hệ thống xác nhận từ PayOS. Nếu chưa thấy, bấm "Kiểm tra" ở
            danh sách đơn.
          </p>
        }
      } @else {
        <p>Bạn có thể thử lại bất cứ lúc nào.</p>
      }

      <button mat-flat-button color="primary" routerLink="/candidate/credits">
        <mat-icon>arrow_back</mat-icon> Về trang Credit
      </button>
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 420px;
        margin: 48px auto;
        text-align: center;
      }
      mat-icon {
        font-size: 64px;
        height: 64px;
        width: 64px;
      }
      mat-icon.ok {
        color: #2e7d32;
      }
      mat-icon.no {
        color: var(--mat-sys-error);
      }
      p {
        color: var(--mat-sys-on-surface-variant);
      }
      .paid {
        color: #2e7d32;
        font-weight: 500;
      }
    `,
  ],
})
export class PaymentReturn implements OnInit {
  private api = inject(PaymentApi);
  private route = inject(ActivatedRoute);

  readonly result = input<string>('success');
  readonly success = computed(() => this.result() === 'success');
  readonly checking = signal(false);
  readonly paid = signal(false);

  ngOnInit(): void {
    if (!this.success()) return;
    const orderCode = this.route.snapshot.queryParamMap.get('orderCode');
    if (!orderCode) return;

    // Khớp order theo payosOrderCode (my-orders) → đối soát trạng thái thật (orderStatus gọi PayOS).
    this.checking.set(true);
    this.api.myOrders().subscribe({
      next: (orders) => {
        const order = orders.find((o) => String(o.payosOrderCode) === orderCode);
        if (!order) {
          this.checking.set(false);
          return;
        }
        if (order.status === OrderStatus.Paid) {
          this.checking.set(false);
          this.paid.set(true);
          return;
        }
        this.api.orderStatus(order.id).subscribe({
          next: (s) => {
            this.checking.set(false);
            this.paid.set(s.status === 'Paid');
          },
          error: () => this.checking.set(false),
        });
      },
      error: () => this.checking.set(false),
    });
  }
}
