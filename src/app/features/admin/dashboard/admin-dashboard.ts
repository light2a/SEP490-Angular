import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { PackageResponse } from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

/** Trang tổng quan PlatformAdmin — thống kê gói + lối tắt tới các trang quản trị. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, Spinner],
  template: `
    <div class="page">
      <h1 class="title">Bảng điều khiển quản trị</h1>

      @if (loading()) {
        <app-spinner [diameter]="36" message="Đang tải dữ liệu..." />
      } @else {
        <div class="stats">
          <mat-card class="stat">
            <mat-card-content>
              <mat-icon class="stat-icon">inventory_2</mat-icon>
              <div class="stat-num">{{ total() }}</div>
              <div class="stat-label">Tổng số gói</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat">
            <mat-card-content>
              <mat-icon class="stat-icon on">check_circle</mat-icon>
              <div class="stat-num">{{ activeCount() }}</div>
              <div class="stat-label">Gói đang bật</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat">
            <mat-card-content>
              <mat-icon class="stat-icon off">do_not_disturb_on</mat-icon>
              <div class="stat-num">{{ inactiveCount() }}</div>
              <div class="stat-label">Gói đang tắt</div>
            </mat-card-content>
          </mat-card>
        </div>

        <div class="links">
          <mat-card class="link" routerLink="/admin/packages">
            <mat-card-content>
              <mat-icon>inventory_2</mat-icon>
              <div class="link-body">
                <div class="link-title">Quản lý gói credit</div>
                <div class="link-sub">Tạo, sửa, bật/tắt và xoá các gói mua credit.</div>
              </div>
              <button mat-button color="primary">Mở</button>
            </mat-card-content>
          </mat-card>
          <mat-card class="link" routerLink="/admin/billing">
            <mat-card-content>
              <mat-icon>receipt_long</mat-icon>
              <div class="link-body">
                <div class="link-title">Chốt kỳ hoá đơn</div>
                <div class="link-sub">Tổng hợp lượt dùng postpaid của một tổ chức thành hoá đơn.</div>
              </div>
              <button mat-button color="primary">Mở</button>
            </mat-card-content>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
      }
      .title {
        font-size: 22px;
        margin: 4px 0 20px;
        color: var(--mat-sys-on-surface);
      }
      .stats {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }
      .stat {
        flex: 1 1 180px;
      }
      .stat mat-card-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .stat-icon {
        font-size: 28px;
        height: 28px;
        width: 28px;
        color: var(--mat-sys-primary);
      }
      .stat-icon.on {
        color: var(--mat-sys-tertiary);
      }
      .stat-icon.off {
        color: var(--mat-sys-on-surface-variant);
      }
      .stat-num {
        font-size: 32px;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .stat-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .links {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }
      .link {
        flex: 1 1 320px;
        cursor: pointer;
      }
      .link mat-card-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .link mat-icon {
        font-size: 32px;
        height: 32px;
        width: 32px;
        color: var(--mat-sys-primary);
      }
      .link-body {
        flex: 1;
      }
      .link-title {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .link-sub {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class AdminDashboard {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);

  readonly loading = signal(true);
  readonly packages = signal<PackageResponse[]>([]);

  readonly total = computed(() => this.packages().length);
  readonly activeCount = computed(() => this.packages().filter((p) => p.isActive).length);
  readonly inactiveCount = computed(() => this.packages().filter((p) => !p.isActive).length);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.packages().subscribe({
      next: (list) => {
        this.packages.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách gói.');
      },
    });
  }
}
