import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { PaymentApi } from '../../../core/api/payment.api';
import { NotifyService } from '../../../core/notify.service';
import { OrderResponse, OrderStatus, PackageResponse } from '../../../core/models';
import { OrderStatusPipe, VndPipe } from '../../../shared/pipes';
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
    VndPipe,
    OrderStatusPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './credits.html',
  styleUrl: './credits.scss',
})
export class Credits {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);

  readonly OrderStatus = OrderStatus;
  readonly packages = signal<PackageResponse[]>([]);
  readonly orders = signal<OrderResponse[]>([]);
  readonly loading = signal(true);
  readonly buying = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
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
    this.api.createOrder({ packageId: pkg.id }).subscribe({
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
}
