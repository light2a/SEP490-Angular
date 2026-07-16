import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse, CampaignStatus } from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

interface StatCard {
  status: CampaignStatus;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-employer-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, Spinner],
  template: `
    <div class="head">
      <div>
        <h1>Bảng điều khiển</h1>
        <p class="sub">Tổng quan các chiến dịch tuyển dụng của tổ chức.</p>
      </div>
      <a mat-flat-button color="primary" routerLink="/employer/campaigns/new">
        <mat-icon>add</mat-icon>
        Tạo chiến dịch
      </a>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải..." />
    } @else {
      <div class="stats">
        @for (s of statCards; track s.status) {
          <mat-card class="stat">
            <mat-icon [class]="'ico ' + s.status.toLowerCase()">{{ s.icon }}</mat-icon>
            <div class="num">{{ countBy()[s.status] }}</div>
            <div class="lbl">{{ s.label }}</div>
          </mat-card>
        }
      </div>

      <div class="links">
        <mat-card class="link" routerLink="/employer/campaigns">
          <mat-icon>campaign</mat-icon>
          <div class="body">
            <h3>Tất cả chiến dịch</h3>
            <p>Xem, sửa và quản lý toàn bộ chiến dịch ({{ campaigns().length }})</p>
          </div>
        </mat-card>
        <mat-card class="link" routerLink="/employer/campaigns/new">
          <mat-icon>add_circle</mat-icon>
          <div class="body">
            <h3>Tạo chiến dịch mới</h3>
            <p>Khai JD, tiêu chí và câu hỏi phỏng vấn</p>
          </div>
        </mat-card>
        <mat-card class="link" routerLink="/employer/members">
          <mat-icon>group</mat-icon>
          <div class="body">
            <h3>Thành viên tổ chức</h3>
            <p>Quản lý HR trong tổ chức</p>
          </div>
        </mat-card>
        <mat-card class="link" routerLink="/employer/credits">
          <mat-icon>account_balance_wallet</mat-icon>
          <div class="body">
            <h3>Credit tổ chức</h3>
            <p>Mua & theo dõi credit phỏng vấn</p>
          </div>
        </mat-card>
      </div>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 4px;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 20px;
        text-align: center;
      }
      .num {
        font-size: 32px;
        font-weight: 600;
      }
      .lbl {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .ico {
        font-size: 28px;
        height: 28px;
        width: 28px;
      }
      .ico.draft {
        color: var(--mat-sys-on-surface-variant);
      }
      .ico.active {
        color: var(--mat-sys-primary);
      }
      .ico.closed {
        color: var(--mat-sys-tertiary);
      }
      .ico.archived {
        color: var(--mat-sys-outline);
      }
      .links {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
      }
      .link {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        padding: 20px;
        cursor: pointer;
        transition: box-shadow 0.15s;
      }
      .link:hover {
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
      }
      .link mat-icon {
        color: var(--mat-sys-primary);
        font-size: 32px;
        height: 32px;
        width: 32px;
      }
      h3 {
        margin: 0 0 4px;
      }
      .body p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
    `,
  ],
})
export class EmployerDashboard {
  private api = inject(CampaignApi);

  readonly loading = signal(true);
  readonly campaigns = signal<CampaignResponse[]>([]);

  readonly statCards: StatCard[] = [
    { status: 'Draft', label: 'Nháp', icon: 'edit_note' },
    { status: 'Active', label: 'Đang chạy', icon: 'play_circle' },
    { status: 'Closed', label: 'Đã đóng', icon: 'lock' },
    { status: 'Archived', label: 'Lưu trữ', icon: 'inventory_2' },
  ];

  readonly countBy = computed<Record<CampaignStatus, number>>(() => {
    const acc: Record<CampaignStatus, number> = { Draft: 0, Active: 0, Closed: 0, Archived: 0 };
    for (const c of this.campaigns()) acc[c.status]++;
    return acc;
  });

  constructor() {
    this.api.listCampaigns().subscribe({
      next: (list) => {
        this.campaigns.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
