import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotifyService } from '../../../core/notify.service';
import {
  CreditAccountResponse,
  OrderResponse,
  OrderStatus,
  PackageResponse,
} from '../../../core/models';
import { OrderStatusPipe, PackageOfferPipe, PackageTypePipe, VndPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';
import { CreditHistory } from '../../../shared/credit-history/credit-history';

/** Mua credit cho tổ chức (B2B). Chỉ OrgAdmin được mua (HrMember → 403). */
@Component({
  selector: 'app-employer-credits',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    VndPipe,
    OrderStatusPipe,
    PackageTypePipe,
    PackageOfferPipe,
    CreditHistory,
    Spinner,
    EmptyState,
  ],
  template: `
    <h1>Credit tổ chức</h1>
    <p class="sub">Mỗi buổi phỏng vấn AI-chấm của ứng viên tiêu 1 credit của tổ chức.</p>

    @if (!canBuy()) {
      <mat-card class="note">
        <mat-icon>info</mat-icon>
        <span>Chỉ OrgAdmin được mua credit.</span>
      </mat-card>
    }

    @if (loading()) {
      <app-spinner />
    } @else {
      @if (account(); as acc) {
        <mat-card class="balance">
          <div class="bal-main">
            <span class="bal-num">{{ acc.remainingCredits }}</span>
            <span class="bal-unit">credit khả dụng của tổ chức</span>
          </div>
          @if (acc.reservedCredits > 0) {
            <p class="bal-sub">
              {{ acc.reservedCredits }} credit đang giữ cho buổi phỏng vấn ứng viên chưa hoàn tất.
            </p>
          }
        </mat-card>
      }

      <h2>Gói credit</h2>
      <div class="grid">
        @for (p of packages(); track p.id) {
          <mat-card class="pkg">
            <h3>{{ p.name }}</h3>
            <div class="type">{{ p.type | packageType }}</div>
            <div class="credits">{{ p | packageOffer }}</div>
            <div class="price">{{ p.priceVnd | vnd }}</div>
            @if (canBuy()) {
              <button
                mat-flat-button
                color="primary"
                (click)="buy(p)"
                [disabled]="buying() === p.id || !p.isActive"
              >
                <mat-icon>shopping_cart</mat-icon> Mua
              </button>
            }
          </mat-card>
        } @empty {
          <app-empty-state icon="sell" message="Chưa có gói credit nào" />
        }
      </div>

      <h2>Đơn của tổ chức</h2>
      @if (orders().length === 0) {
        <app-empty-state icon="receipt_long" message="Chưa có đơn nào" />
      } @else {
        <mat-card>
          <mat-list>
            @for (o of orders(); track o.id) {
              <mat-list-item>
                <mat-icon matListItemIcon>receipt_long</mat-icon>
                <span matListItemTitle>{{ o.amountVnd | vnd }} · {{ o.status | orderStatus }}</span>
                <span matListItemLine>{{ o.createdAt | date: 'short' }}</span>
                <span matListItemMeta>
                  @if (o.status === OrderStatus.Pending) {
                    <button mat-button (click)="checkStatus(o)">Kiểm tra</button>
                  }
                </span>
              </mat-list-item>
            }
          </mat-list>
        </mat-card>
      }

      <app-credit-history />
    }
  `,
  styles: [
    `
      .sub {
        color: var(--mat-sys-on-surface-variant);
      }
      .note {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        margin-bottom: 12px;
      }
      .balance {
        padding: 20px;
        margin-bottom: 20px;
      }
      .bal-main {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .bal-num {
        font-size: 34px;
        font-weight: 700;
        line-height: 1;
        color: var(--mat-sys-primary);
      }
      .bal-unit {
        color: var(--mat-sys-on-surface-variant);
      }
      .bal-sub {
        margin: 8px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      .pkg {
        padding: 16px 20px;
        min-width: 200px;
        text-align: center;
      }
      .pkg h3 {
        margin: 0 0 4px;
      }
      .type {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .credits {
        font-size: 20px;
        font-weight: 600;
        margin: 8px 0 4px;
      }
      .price {
        margin-bottom: 12px;
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class EmployerCredits {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);
  private auth = inject(AuthStore);

  readonly OrderStatus = OrderStatus;
  /** Số dư ví ORG (chủ ví suy từ claim org_id). HrMember vẫn XEM được, chỉ không mua được. */
  readonly account = signal<CreditAccountResponse | null>(null);
  readonly packages = signal<PackageResponse[]>([]);
  readonly orders = signal<OrderResponse[]>([]);
  readonly loading = signal(true);
  readonly buying = signal<string | null>(null);
  /** HrMember bị backend chặn (403) → ẩn nút mua. */
  readonly canBuy = computed(() => this.auth.orgRole() === 'OrgAdmin');

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
        returnUrl: `${origin}/employer/payment/success`,
        cancelUrl: `${origin}/employer/payment/cancel`,
      })
      .subscribe({
      next: (order) => {
        this.buying.set(null);
        if (order.checkoutUrl) {
          window.location.href = order.checkoutUrl;
        } else {
          this.notify.warn('Không nhận được link thanh toán.');
          this.load();
        }
      },
      error: (e: HttpErrorResponse) => {
        this.buying.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không tạo được đơn.');
      },
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
