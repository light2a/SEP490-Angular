import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { CloseBillingPeriodRequest, InvoiceResponse, InvoiceStatus } from '../../../core/models';

/** Nhãn trạng thái hoá đơn (không có sẵn trong models). */
const INVOICE_STATUS_LABEL: Record<number, string> = {
  [InvoiceStatus.Issued]: 'Đã phát hành',
  [InvoiceStatus.Paid]: 'Đã thanh toán',
  [InvoiceStatus.Overdue]: 'Quá hạn',
  [InvoiceStatus.Void]: 'Đã huỷ',
};

/** Chốt kỳ hoá đơn postpaid cho một tổ chức (PlatformAdmin). */
@Component({
  selector: 'app-billing-close',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Chốt kỳ hoá đơn postpaid</mat-card-title>
          <mat-card-subtitle>
            Nhập Org ID cần chốt kỳ; hệ thống tổng hợp lượt dùng postpaid trong kỳ thành hoá đơn.
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form class="form" [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="f-org">
              <mat-label>Org ID</mat-label>
              <input matInput formControlName="orgId" placeholder="UUID tổ chức" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-dt">
              <mat-label>Bắt đầu kỳ</mat-label>
              <input matInput type="datetime-local" formControlName="periodStart" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-dt">
              <mat-label>Kết thúc kỳ</mat-label>
              <input matInput type="datetime-local" formControlName="periodEnd" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="submitting() || form.invalid">
              <mat-icon>receipt_long</mat-icon> Chốt kỳ
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      @if (invoice(); as inv) {
        <mat-card class="card result">
          <mat-card-header>
            <mat-card-title>Hoá đơn đã tạo</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="grid">
              <div class="row"><span class="k">Mã hoá đơn</span><span class="v">{{ inv.id }}</span></div>
              <div class="row"><span class="k">Kỳ</span><span class="v">{{ inv.periodStart | date: 'short' }} → {{ inv.periodEnd | date: 'short' }}</span></div>
              <div class="row"><span class="k">Số lượt phỏng vấn</span><span class="v">{{ inv.interviewCount }}</span></div>
              <div class="row"><span class="k">Đơn giá</span><span class="v">{{ inv.unitPrice | number: '1.0-0' }} VND</span></div>
              <div class="row"><span class="k">Tổng tiền</span><span class="v total">{{ inv.amount | number: '1.0-0' }} VND</span></div>
              <div class="row"><span class="k">Trạng thái</span><span class="v"><span class="chip">{{ statusLabel(inv.status) }}</span></span></div>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card {
        width: 100%;
        max-width: 640px;
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .f-org {
        width: 100%;
      }
      .f-dt {
        width: 100%;
      }
      .grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 6px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .k {
        color: var(--mat-sys-on-surface-variant);
      }
      .v {
        color: var(--mat-sys-on-surface);
        font-weight: 500;
        text-align: right;
      }
      .v.total {
        color: var(--mat-sys-primary);
        font-size: 18px;
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
    `,
  ],
})
export class BillingClose {
  private fb = inject(FormBuilder);
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);

  readonly submitting = signal(false);
  readonly invoice = signal<InvoiceResponse | null>(null);

  readonly form = this.fb.group({
    orgId: ['', [Validators.required]],
    periodStart: ['', [Validators.required]],
    periodEnd: ['', [Validators.required]],
  });

  statusLabel(s: InvoiceStatus): string {
    return INVOICE_STATUS_LABEL[s] ?? String(s);
  }

  submit(): void {
    const v = this.form.getRawValue();
    const orgId = (v.orgId ?? '').trim();
    if (!orgId || !v.periodStart || !v.periodEnd) {
      this.notify.warn('Điền đủ Org ID và khoảng thời gian.');
      return;
    }
    const body: CloseBillingPeriodRequest = {
      orgId,
      periodStart: new Date(v.periodStart).toISOString(),
      periodEnd: new Date(v.periodEnd).toISOString(),
    };
    this.submitting.set(true);
    this.invoice.set(null);
    this.api.closeBillingPeriod(body).subscribe({
      next: (inv) => {
        this.submitting.set(false);
        this.invoice.set(inv);
        this.notify.success('Đã chốt kỳ và tạo hoá đơn.');
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Chốt kỳ thất bại.');
      },
    });
  }
}
