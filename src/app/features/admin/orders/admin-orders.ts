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
import { MatDialog } from '@angular/material/dialog';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  ORDER_STATUS_LABEL,
  OrderKind,
  OrderResponse,
  OrderStatus,
  OwnerType,
  RefundConflictBody,
} from '../../../core/models';
import {
  RefundOrderDialog,
  RefundOrderDialogData,
  RefundOrderDialogResult,
} from './refund-order-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';
import { VndPipe } from '../../../shared/pipes';

/** Danh sách đơn hàng toàn nền tảng (PlatformAdmin oversight — AUTH-7). Read-only. */
@Component({
  selector: 'app-admin-orders',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    VndPipe,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Đơn hàng (toàn nền tảng)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline" class="f-status">
              <mat-label>Trạng thái</mat-label>
              <mat-select [(ngModel)]="status" name="status" (selectionChange)="load()">
                <mat-option [value]="null">Tất cả</mat-option>
                @for (s of statusOptions; track s) {
                  <mat-option [value]="s">{{ statusLabel(s) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </form>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách đơn hàng..." />
          } @else if (!items().length) {
            <app-empty-state icon="receipt_long" message="Không có đơn hàng nào." />
          } @else {
            <table mat-table [dataSource]="items()" class="tbl">
              <ng-container matColumnDef="payosOrderCode">
                <th mat-header-cell *matHeaderCellDef>Mã đơn</th>
                <td mat-cell *matCellDef="let o"><code>{{ o.payosOrderCode }}</code></td>
              </ng-container>
              <ng-container matColumnDef="owner">
                <th mat-header-cell *matHeaderCellDef>Chủ ví</th>
                <td mat-cell *matCellDef="let o">
                  <span class="chip">{{ ownerLabel(o.ownerType) }}</span>
                  <code class="muted">{{ short(o.ownerId) }}</code>
                </td>
              </ng-container>
              <ng-container matColumnDef="kind">
                <th mat-header-cell *matHeaderCellDef>Loại</th>
                <td mat-cell *matCellDef="let o">{{ kindLabel(o.kind) }}</td>
              </ng-container>
              <ng-container matColumnDef="amountVnd">
                <th mat-header-cell *matHeaderCellDef>Số tiền</th>
                <td mat-cell *matCellDef="let o">{{ o.amountVnd | vnd }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let o">
                  <span class="chip" [class]="statusClass(o.status)">{{ statusLabel(o.status) }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="paidAt">
                <th mat-header-cell *matHeaderCellDef>Thanh toán lúc</th>
                <td mat-cell *matCellDef="let o">{{ o.paidAt ? (o.paidAt | date: 'short') : '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
                <td mat-cell *matCellDef="let o">{{ o.createdAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Thao tác</th>
                <td mat-cell *matCellDef="let o">
                  @if (canRefund(o)) {
                    <button
                      mat-icon-button
                      title="Hoàn tiền đơn"
                      aria-label="Hoàn tiền đơn"
                      [disabled]="busy() === o.id"
                      (click)="refund(o)"
                    >
                      <mat-icon>currency_exchange</mat-icon>
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .filters {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .f-status {
        width: 200px;
      }
      .tbl {
        width: 100%;
      }
      code {
        font-size: 12px;
      }
      code.muted {
        color: var(--mat-sys-on-surface-variant);
        margin-left: 6px;
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.paid {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.failed,
      .chip.cancelled {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class AdminOrders implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly cols = [
    'payosOrderCode',
    'owner',
    'kind',
    'amountVnd',
    'status',
    'paidAt',
    'createdAt',
    'actions',
  ];

  readonly statusOptions: OrderStatus[] = [
    OrderStatus.Pending,
    OrderStatus.Paid,
    OrderStatus.Failed,
    OrderStatus.Expired,
    OrderStatus.Cancelled,
  ];

  private readonly kindLabels: Record<number, string> = {
    [OrderKind.CreditPack]: 'Mua credit',
    [OrderKind.InvoiceSettlement]: 'Tất toán hoá đơn',
    [OrderKind.SubscriptionPurchase]: 'Mua gói định kỳ',
    [OrderKind.SubscriptionRenewal]: 'Gia hạn gói',
  };

  readonly items = signal<OrderResponse[]>([]);
  readonly loading = signal(true);
  /** Id đơn đang có request hoàn — khoá nút đúng dòng đó. */
  readonly busy = signal<string | null>(null);

  status: OrderStatus | null = null;

  ngOnInit(): void {
    this.load();
  }

  statusLabel(s: OrderStatus): string {
    return ORDER_STATUS_LABEL[s] ?? String(s);
  }

  statusClass(s: OrderStatus): string {
    return OrderStatus[s]?.toLowerCase() ?? '';
  }

  ownerLabel(t: OwnerType): string {
    return t === OwnerType.Org ? 'Tổ chức' : 'Cá nhân';
  }

  kindLabel(k: OrderKind): string {
    return this.kindLabels[k] ?? String(k);
  }

  short(id: string): string {
    return id ? id.slice(0, 8) : '—';
  }

  /** Chỉ đơn mua credit đã thanh toán mới hoàn được (kind khác → 400, chưa Paid → 409). */
  canRefund(o: OrderResponse): boolean {
    return o.status === OrderStatus.Paid && o.kind === OrderKind.CreditPack;
  }

  /**
   * Hoàn tiền 1 đơn (F18). Khi ví đã tiêu bớt credit, backend trả **409 KÈM SỐ thu hồi được**
   * — đó là thông tin để quyết định, không phải lỗi kỹ thuật. Nên 409 dạng đó được mở lại hộp
   * thoại với con số cụ thể để admin xác nhận lần hai (`allowPartialClawback`), thay vì nuốt
   * thành "lỗi không xác định".
   */
  refund(o: OrderResponse, partial: RefundOrderDialogData['partial'] = null): void {
    this.dialog
      .open(RefundOrderDialog, {
        data: {
          orderCode: o.payosOrderCode,
          amountVnd: o.amountVnd,
          partial,
        } satisfies RefundOrderDialogData,
        width: '560px',
      })
      .afterClosed()
      .subscribe((res?: RefundOrderDialogResult) => {
        if (!res) return;
        this.busy.set(o.id);
        this.api.refundOrder(o.id, res).subscribe({
          next: (r) => {
            this.busy.set(null);
            const short =
              r.creditsClawedBack < r.creditsPurchased
                ? ` (thu hồi ${r.creditsClawedBack}/${r.creditsPurchased} credit)`
                : '';
            this.notify.success(
              `Đã ghi nhận hoàn tiền đơn${short}. Nhớ hoàn tiền thật trên dashboard PayOS nếu chưa làm.`,
            );
            this.load();
          },
          error: (e: HttpErrorResponse) => {
            this.busy.set(null);
            const body = e.error as RefundConflictBody | undefined;
            // 409 "ví không đủ credit để thu hồi" — nhận ra bằng SỰ CÓ MẶT của con số, vì 409
            // còn dùng cho ca khác (đơn chưa Paid, ví vừa đổi) vốn không kèm số nào.
            if (e.status === 409 && typeof body?.clawbackPossible === 'number') {
              this.refund(o, {
                creditsPurchased: body.creditsPurchased ?? 0,
                clawbackPossible: body.clawbackPossible,
              });
              return;
            }
            this.notify.error(extractErrorMessage(e) ?? 'Không hoàn được đơn.');
          },
        });
      });
  }

  load(): void {
    this.loading.set(true);
    this.api.orders({ status: this.status ?? undefined }).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách đơn hàng.');
      },
    });
  }
}
