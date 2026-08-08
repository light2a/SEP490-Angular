import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CreditAccountResponse,
  OrderResponse,
  OrderStatus,
  PackageResponse,
} from '../../../core/models';
import { OrderActions } from './order-actions';
import { OrderStatusPipe, PackageOfferPipe, PackageTypePipe, VndPipe } from '../../../shared/pipes';
import { CreditHistory } from '../../../shared/credit-history/credit-history';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-credits',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    RouterLink,
    VndPipe,
    OrderStatusPipe,
    PackageTypePipe,
    PackageOfferPipe,
    CreditHistory,
    Spinner,
    EmptyState,
  ],
  templateUrl: './credits.html',
  styleUrl: './credits.scss',
})
export class Credits {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);
  private orderActions = inject(OrderActions);

  readonly OrderStatus = OrderStatus;
  readonly cancelling = signal<string | null>(null);
  /** Số dư ví — null khi chưa tải xong hoặc API lỗi: khối số dư ẩn, không chặn phần mua gói. */
  readonly account = signal<CreditAccountResponse | null>(null);
  readonly packages = signal<PackageResponse[]>([]);
  readonly orders = signal<OrderResponse[]>([]);
  readonly loading = signal(true);
  readonly buying = signal<string | null>(null);

  /**
   * BK32 — ví trông như CHƯA TỪNG tồn tại ⇒ mời dùng suất dùng thử thay vì hiện "0 credit".
   *
   * Người mới đăng ký THẬT SỰ luyện được ngay: ví (kèm suất dùng thử F7) chỉ được tạo ở lần
   * reserve đầu tiên, còn `GET /me/account` là endpoint chỉ-đọc nên nó trả ví rỗng toàn số 0.
   * Hiện "0 credit" ở đúng bước đầu của phễu khiến người dùng bỏ đi hoặc đi mua gói mà không cần.
   *
   * `freeCreditsGranted` là dấu hiệu duy nhất phân biệt "chưa có ví" với "đã có ví và tiêu hết
   * quà" (ví đã nhận quà thì > 0 vĩnh viễn). `orders().length === 0` là vế BẮT BUỘC cho ca suất
   * dùng thử bị TẮT bằng cấu hình: lúc đó người đã mua gói rồi tiêu hết cũng có mọi số bằng 0,
   * mà họ không còn suất nào — mời họ dùng thử là nói sai.
   *
   * CỐ Ý không nêu con số suất dùng thử: đó là cấu hình phía backend (`Billing:FreeTrialCredits`,
   * 0 = tắt) mà endpoint này không trả về, nên hứa một con số là hứa điều FE không đọc được.
   */
  readonly noWalletYet = computed(() => {
    const acc = this.account();
    return (
      acc != null &&
      acc.remainingCredits === 0 &&
      acc.reservedCredits === 0 &&
      acc.freeCreditsGranted === 0 &&
      this.orders().length === 0
    );
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.myAccount().subscribe({ next: (a) => this.account.set(a) });
    this.api.packages().subscribe({ next: (p) => this.packages.set(p) });
    this.api.myOrders().subscribe({
      next: (o) => {
        this.orders.set(o);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  buy(pkg: PackageResponse): void {
    this.buying.set(pkg.id);
    const origin = window.location.origin;
    this.api
      .createOrder({
        packageId: pkg.id,
        returnUrl: `${origin}/candidate/payment/success`,
        cancelUrl: `${origin}/candidate/payment/cancel`,
      })
      .subscribe({
      next: (order) => {
        this.buying.set(null);
        if (order.checkoutUrl) {
          // Chuyển sang trang thanh toán PayOS.
          window.location.href = order.checkoutUrl;
        } else {
          this.notify.warn('Không nhận được link thanh toán.');
          this.load();
        }
      },
      error: () => this.buying.set(null),
    });
  }

  checkStatus(order: OrderResponse): void {
    this.api.orderStatus(order.id).subscribe({
      next: (s) => {
        this.notify.info(`Trạng thái đơn: ${s.status}`);
        this.load();
      },
      error: () => this.notify.error('Không kiểm tra được trạng thái.'),
    });
  }

  openOrder(order: OrderResponse): void {
    this.orderActions.openDetail(order.id);
  }

  /** Huỷ đơn còn chờ thanh toán (backend trả 204). Đơn đã terminal thì không có nút này. */
  cancelOrder(order: OrderResponse): void {
    this.orderActions.confirmCancel(order).subscribe((ok) => {
      if (!ok) return;
      this.cancelling.set(order.id);
      this.api.cancelOrder(order.id).subscribe({
        next: () => {
          this.cancelling.set(null);
          this.notify.success('Đã huỷ đơn.');
          this.load();
        },
        error: (e: HttpErrorResponse) => {
          this.cancelling.set(null);
          this.notify.error(extractErrorMessage(e) ?? 'Không huỷ được đơn.');
        },
      });
    });
  }
}
