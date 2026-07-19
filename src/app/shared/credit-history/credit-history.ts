import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { PaymentApi } from '../../core/api/payment.api';
import { extractErrorMessage } from '../../core/api/http-utils';
import { NotifyService } from '../../core/notify.service';
import {
  CREDIT_REASON_LABEL,
  CreditTransactionReason,
  CreditTransactionResponse,
} from '../../core/models';
import { EmptyState } from '../ui/empty-state';
import { Spinner } from '../ui/spinner';

const PAGE_SIZE = 20;

/**
 * Sổ biến động credit của chính chủ ví (F19) — dùng chung cho cả trang credit của ứng viên
 * (ví cá nhân) lẫn của tổ chức (ví Org): backend suy chủ ví từ JWT nên FE không phải truyền gì.
 *
 * Nhãn `reason` được dịch RÕ TỪNG LOẠI thay vì gộp thành "được cộng": suất dùng thử, quà
 * khuyến mãi và credit mua bằng tiền là ba thứ khác hẳn nhau với người đọc sổ.
 */
@Component({
  selector: 'app-credit-history',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="head">
      <h2>Lịch sử credit</h2>
      <mat-form-field appearance="outline" class="f-reason">
        <mat-label>Loại biến động</mat-label>
        <mat-select [(ngModel)]="reason" name="reason" (selectionChange)="reload()">
          <mat-option [value]="null">Tất cả</mat-option>
          @for (r of reasonOptions; track r) {
            <mat-option [value]="r">{{ reasonLabel(r) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (loading()) {
      <app-spinner [diameter]="32" message="Đang tải lịch sử credit..." />
    } @else if (!items().length) {
      <app-empty-state icon="receipt_long" message="Chưa có biến động credit nào." />
    } @else {
      <mat-card>
        <table mat-table [dataSource]="items()" class="tbl">
          <ng-container matColumnDef="createdAt">
            <th mat-header-cell *matHeaderCellDef>Thời điểm</th>
            <td mat-cell *matCellDef="let t">{{ t.createdAt | date: 'short' }}</td>
          </ng-container>
          <ng-container matColumnDef="reason">
            <th mat-header-cell *matHeaderCellDef>Loại</th>
            <td mat-cell *matCellDef="let t">
              <span class="chip">{{ reasonLabel(t.reason) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="delta">
            <th mat-header-cell *matHeaderCellDef>Thay đổi</th>
            <td mat-cell *matCellDef="let t">
              <span class="delta" [class.plus]="t.delta > 0" [class.minus]="t.delta < 0">
                {{ signed(t.delta) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="context">
            <th mat-header-cell *matHeaderCellDef>Liên quan</th>
            <td mat-cell *matCellDef="let t">{{ context(t) }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
      </mat-card>

      @if (nextCursor()) {
        <div class="more">
          <button mat-stroked-button (click)="loadMore()" [disabled]="loadingMore()">
            @if (loadingMore()) {
              <mat-icon class="spin">progress_activity</mat-icon>
            }
            {{ loadingMore() ? 'Đang tải...' : 'Xem thêm' }}
          </button>
        </div>
      }
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
      }
      .f-reason {
        width: 200px;
      }
      .tbl {
        width: 100%;
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .delta {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .delta.plus {
        color: var(--mat-sys-primary);
      }
      .delta.minus {
        color: var(--mat-sys-error);
      }
      .more {
        display: flex;
        justify-content: center;
        margin-top: 12px;
      }
      .spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class CreditHistory implements OnInit {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);

  readonly cols = ['createdAt', 'reason', 'delta', 'context'];
  readonly reasonOptions: CreditTransactionReason[] = [
    CreditTransactionReason.Purchase,
    CreditTransactionReason.Consume,
    CreditTransactionReason.FreeGrant,
    CreditTransactionReason.PromoGrant,
    CreditTransactionReason.Refund,
  ];

  readonly items = signal<CreditTransactionResponse[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly nextCursor = signal<string | null>(null);

  reason: CreditTransactionReason | null = null;

  ngOnInit(): void {
    this.reload();
  }

  reasonLabel(r: CreditTransactionReason): string {
    return CREDIT_REASON_LABEL[r] ?? String(r);
  }

  /** Dấu hiện tường minh: `+3` dễ đọc hơn `3` khi cột có cả cộng lẫn trừ. */
  signed(delta: number): string {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  context(t: CreditTransactionResponse): string {
    if (t.orderId) return `Đơn ${t.orderId.slice(0, 8)}`;
    if (t.sessionId) return `Buổi ${t.sessionId.slice(0, 8)}`;
    if (t.note) return t.note;
    return '—';
  }

  reload(): void {
    this.loading.set(true);
    this.nextCursor.set(null);
    this.api.myCreditTransactions({ limit: PAGE_SIZE, reason: this.reason }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được lịch sử credit.');
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api.myCreditTransactions({ cursor, limit: PAGE_SIZE, reason: this.reason }).subscribe({
      next: (page) => {
        this.items.update((cur) => [...cur, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loadingMore.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải thêm được lịch sử credit.');
      },
    });
  }
}
