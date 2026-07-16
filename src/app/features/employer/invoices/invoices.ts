import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotifyService } from '../../../core/notify.service';
import { InvoiceResponse, InvoiceStatus } from '../../../core/models';
import { VndPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

const INVOICE_STATUS_LABEL: Record<number, string> = {
  0: 'Đã phát hành',
  1: 'Đã thanh toán',
  2: 'Quá hạn',
  3: 'Đã huỷ',
};

/** Hoá đơn postpaid (trả sau) của tổ chức. Chỉ OrgAdmin được thanh toán (HrMember → 403). */
@Component({
  selector: 'app-employer-invoices',
  imports: [DatePipe, MatCardModule, MatButtonModule, MatIconModule, VndPipe, Spinner, EmptyState],
  template: `
    <h1>Hoá đơn postpaid</h1>
    <p class="sub">
      Hoá đơn phát sinh khi tổ chức dùng gói trả sau (postpaid). Thanh toán để tất toán kỳ.
    </p>

    @if (!canPay()) {
      <mat-card class="note">
        <mat-icon>info</mat-icon>
        <span>Chỉ OrgAdmin được thanh toán hoá đơn.</span>
      </mat-card>
    }

    @if (loading()) {
      <app-spinner message="Đang tải hoá đơn…" />
    } @else if (invoices().length === 0) {
      <app-empty-state icon="receipt_long" message="Chưa có hoá đơn postpaid nào." />
    } @else {
      <div class="grid">
        @for (inv of invoices(); track inv.id) {
          <mat-card class="inv">
            <div class="row head">
              <span class="period">
                {{ inv.periodStart | date: 'dd/MM/yyyy' }} –
                {{ inv.periodEnd | date: 'dd/MM/yyyy' }}
              </span>
              <span class="chip" [class]="statusClass(inv.status)">
                {{ statusLabel(inv.status) }}
              </span>
            </div>

            <div class="row">
              <span class="label">Số lượt</span>
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
            <div class="row">
              <span class="label">Tạo lúc</span>
              <span>{{ inv.createdAt | date: 'short' }}</span>
            </div>

            @if (canPay() && isUnpaid(inv.status)) {
              <button
                mat-flat-button
                color="primary"
                (click)="pay(inv)"
                [disabled]="paying() === inv.id"
              >
                Thanh toán
              </button>
            }
          </mat-card>
        }
      </div>
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
      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      .inv {
        padding: 16px 20px;
        min-width: 260px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .row.head {
        margin-bottom: 4px;
      }
      .period {
        font-weight: 600;
      }
      .label {
        color: var(--mat-sys-on-surface-variant);
      }
      .total {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .inv button {
        margin-top: 8px;
      }
      .chip {
        font-size: 12px;
        font-weight: 600;
        padding: 2px 10px;
        border-radius: 12px;
        white-space: nowrap;
      }
      .chip.paid {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .chip.overdue {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .chip.issued {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.void {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-outline);
      }
    `,
  ],
})
export class EmployerInvoices {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);
  private auth = inject(AuthStore);

  readonly invoices = signal<InvoiceResponse[]>([]);
  readonly loading = signal(true);
  readonly paying = signal<string | null>(null);
  /** HrMember bị backend chặn (403) → ẩn nút thanh toán. */
  readonly canPay = computed(() => this.auth.orgRole() === 'OrgAdmin');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.myInvoices().subscribe({
      next: (list) => {
        this.invoices.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được hoá đơn.');
      },
    });
  }

  pay(inv: InvoiceResponse): void {
    this.paying.set(inv.id);
    this.api.payInvoice(inv.id).subscribe({
      next: (order) => {
        this.paying.set(null);
        if (order.checkoutUrl) {
          window.location.href = order.checkoutUrl;
        } else {
          this.notify.warn('Không nhận được link thanh toán.');
          this.load();
        }
      },
      error: (e: HttpErrorResponse) => {
        this.paying.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không thanh toán được hoá đơn.');
      },
    });
  }

  isUnpaid(status: InvoiceStatus): boolean {
    return status === InvoiceStatus.Issued || status === InvoiceStatus.Overdue;
  }

  statusLabel(status: InvoiceStatus): string {
    return INVOICE_STATUS_LABEL[status] ?? String(status);
  }

  statusClass(status: InvoiceStatus): string {
    switch (status) {
      case InvoiceStatus.Paid:
        return 'paid';
      case InvoiceStatus.Overdue:
        return 'overdue';
      case InvoiceStatus.Void:
        return 'void';
      default:
        return 'issued';
    }
  }
}
