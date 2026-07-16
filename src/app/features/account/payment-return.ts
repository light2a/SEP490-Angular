import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../core/api/payment.api';
import { AuthStore } from '../../core/auth/auth.store';
import { OrderStatus } from '../../core/models';
import { Spinner } from '../../shared/ui/spinner';

/**
 * Trang PayOS redirect về DÙNG CHUNG (role-agnostic): /payment/success | /payment/cancel.
 * Đây là đích FALLBACK khi backend không nhận returnUrl per-order (config PayOS chung). Đơn mua có
 * truyền returnUrl riêng (candidate/employer) sẽ về trang khu vực; đơn không truyền → về đây.
 * Tự đối soát đơn theo orderCode PayOS gắn; back-link về trang credit theo role.
 */
@Component({
  selector: 'app-payment-return-shared',
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
          <p class="paid">Credit đã được cộng.</p>
        } @else {
          <p>Credit sẽ được cộng sau khi hệ thống xác nhận từ PayOS.</p>
        }
      } @else {
        <p>Bạn có thể thử lại bất cứ lúc nào.</p>
      }

      <button mat-flat-button color="primary" [routerLink]="creditsPath()">
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
export class PaymentReturnShared implements OnInit {
  private api = inject(PaymentApi);
  private auth = inject(AuthStore);
  private route = inject(ActivatedRoute);

  readonly result = input<string>('success');
  readonly success = computed(() => this.result() === 'success');
  readonly checking = signal(false);
  readonly paid = signal(false);
  readonly creditsPath = computed(() =>
    this.auth.primaryRole() === 'Employer' ? '/employer/credits' : '/candidate/credits',
  );

  ngOnInit(): void {
    if (!this.success()) return;
    const orderCode = this.route.snapshot.queryParamMap.get('orderCode');
    if (!orderCode) return;

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
