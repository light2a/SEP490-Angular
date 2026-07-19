import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { OrderKind, RevenueReportResponse } from '../../../core/models';
import { VndPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Báo cáo doanh thu toàn nền tảng (F19).
 *
 * Hai con số CỐ Ý tách rời: doanh thu gộp đếm theo lúc đơn được thanh toán, còn tiền hoàn
 * đếm theo lúc hoàn — nên một khoản hoàn tháng này không sửa lại báo cáo tháng trước đã
 * chốt. Hệ quả trực tiếp: **doanh thu ròng của một kỳ có thể ÂM** (kỳ đó hoàn nhiều hơn
 * thu). UI phải trình bày số âm như một kết quả hợp lệ, không phải lỗi.
 */
@Component({
  selector: 'app-admin-revenue',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
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
          <mat-card-title>Doanh thu</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline">
              <mat-label>Từ ngày</mat-label>
              <input matInput type="date" [(ngModel)]="from" name="from" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Đến ngày (không tính)</mat-label>
              <input matInput type="date" [(ngModel)]="to" name="to" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-group">
              <mat-label>Gom theo</mat-label>
              <mat-select [(ngModel)]="groupBy" name="groupBy">
                <mat-option value="day">Ngày</mat-option>
                <mat-option value="month">Tháng</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              <mat-icon>search</mat-icon> Xem
            </button>
          </form>
          <p class="hint">
            Khoảng thời gian là nửa mở: tính từ "Từ ngày" đến trước "Đến ngày". Bỏ trống cả hai =
            30 ngày gần nhất.
          </p>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tính doanh thu..." />
          } @else if (report(); as r) {
            <div class="kpis">
              <div class="kpi">
                <span class="k-label">Doanh thu gộp</span>
                <span class="k-num">{{ r.grossRevenueVnd | vnd }}</span>
                <span class="k-sub">{{ r.paidOrderCount }} đơn đã thanh toán</span>
              </div>
              <div class="kpi">
                <span class="k-label">Đã hoàn</span>
                <span class="k-num refund">{{ r.refundedVnd | vnd }}</span>
                <span class="k-sub">{{ r.refundedOrderCount }} đơn được hoàn</span>
              </div>
              <div class="kpi">
                <span class="k-label">Doanh thu ròng</span>
                <span class="k-num" [class.negative]="r.netRevenueVnd < 0">
                  {{ r.netRevenueVnd | vnd }}
                </span>
                <span class="k-sub">gộp − hoàn</span>
              </div>
            </div>

            <p class="note">
              <mat-icon inline>info</mat-icon>
              Doanh thu gộp đếm theo thời điểm <strong>thanh toán</strong>, tiền hoàn đếm theo thời
              điểm <strong>hoàn</strong> — hai mốc khác nhau, cố ý, để một khoản hoàn hôm nay không
              sửa lại báo cáo kỳ trước đã chốt. Vì vậy doanh thu ròng của một kỳ
              <strong>có thể âm</strong>, và đó là con số đúng.
              Credit tặng (dùng thử, khuyến mãi) không xuất hiện ở đây vì chúng không sinh đơn hàng.
            </p>

            <h3>Theo loại đơn</h3>
            @if (!r.byKind.length) {
              <app-empty-state icon="category" message="Không có đơn nào trong kỳ." />
            } @else {
              <table mat-table [dataSource]="r.byKind" class="tbl">
                <ng-container matColumnDef="kind">
                  <th mat-header-cell *matHeaderCellDef>Loại</th>
                  <td mat-cell *matCellDef="let k">{{ kindLabel(k.kind) }}</td>
                </ng-container>
                <ng-container matColumnDef="amountVnd">
                  <th mat-header-cell *matHeaderCellDef>Số tiền</th>
                  <td mat-cell *matCellDef="let k">{{ k.amountVnd | vnd }}</td>
                </ng-container>
                <ng-container matColumnDef="orderCount">
                  <th mat-header-cell *matHeaderCellDef>Số đơn</th>
                  <td mat-cell *matCellDef="let k">{{ k.orderCount }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="kindCols"></tr>
                <tr mat-row *matRowDef="let row; columns: kindCols"></tr>
              </table>
            }

            <h3>Theo {{ r.granularity === 'month' ? 'tháng' : 'ngày' }}</h3>
            @if (!r.buckets.length) {
              <app-empty-state icon="calendar_month" message="Không có dữ liệu trong kỳ." />
            } @else {
              <table mat-table [dataSource]="r.buckets" class="tbl">
                <ng-container matColumnDef="periodStart">
                  <th mat-header-cell *matHeaderCellDef>Mốc</th>
                  <td mat-cell *matCellDef="let b">
                    {{ b.periodStart | date: (r.granularity === 'month' ? 'MM/yyyy' : 'dd/MM/yyyy') }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="amountVnd">
                  <th mat-header-cell *matHeaderCellDef>Số tiền</th>
                  <td mat-cell *matCellDef="let b">{{ b.amountVnd | vnd }}</td>
                </ng-container>
                <ng-container matColumnDef="orderCount">
                  <th mat-header-cell *matHeaderCellDef>Số đơn</th>
                  <td mat-cell *matCellDef="let b">{{ b.orderCount }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="bucketCols"></tr>
                <tr mat-row *matRowDef="let row; columns: bucketCols"></tr>
              </table>
            }
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
      }
      .f-group {
        width: 140px;
      }
      .hint,
      .note {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .note {
        margin: 12px 0 4px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .kpis {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin: 12px 0;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 200px;
        padding: 16px 20px;
        border-radius: 12px;
        background: var(--mat-sys-surface-variant);
      }
      .k-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .k-num {
        font-size: 24px;
        font-weight: 700;
        color: var(--mat-sys-primary);
        font-variant-numeric: tabular-nums;
      }
      .k-num.refund,
      .k-num.negative {
        color: var(--mat-sys-error);
      }
      .k-sub {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      h3 {
        margin: 20px 0 8px;
        font-size: 16px;
      }
      .tbl {
        width: 100%;
      }
    `,
  ],
})
export class AdminRevenue implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  readonly kindCols = ['kind', 'amountVnd', 'orderCount'];
  readonly bucketCols = ['periodStart', 'amountVnd', 'orderCount'];

  private readonly kindLabels: Record<number, string> = {
    [OrderKind.CreditPack]: 'Mua credit',
    [OrderKind.InvoiceSettlement]: 'Tất toán hoá đơn',
    [OrderKind.SubscriptionPurchase]: 'Mua gói định kỳ',
    [OrderKind.SubscriptionRenewal]: 'Gia hạn gói',
  };

  readonly report = signal<RevenueReportResponse | null>(null);
  readonly loading = signal(true);

  from = '';
  to = '';
  groupBy: 'day' | 'month' = 'day';

  ngOnInit(): void {
    this.load();
  }

  kindLabel(k: OrderKind): string {
    return this.kindLabels[k] ?? String(k);
  }

  load(): void {
    // Ô ngày trả 'yyyy-MM-dd'; để nguyên cho backend (nó coi timestamp không múi giờ là UTC).
    if (this.from && this.to && this.from >= this.to) {
      this.notify.warn('"Từ ngày" phải nhỏ hơn "Đến ngày".');
      return;
    }
    this.loading.set(true);
    this.api
      .revenue({ from: this.from || null, to: this.to || null, groupBy: this.groupBy })
      .subscribe({
        next: (r) => {
          this.report.set(r);
          this.loading.set(false);
        },
        error: (e: HttpErrorResponse) => {
          this.loading.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không tải được báo cáo doanh thu.');
        },
      });
  }
}
