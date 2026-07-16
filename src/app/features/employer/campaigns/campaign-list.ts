import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse, CampaignStatus } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

const STATUS_LABEL: Record<CampaignStatus, string> = {
  Draft: 'Nháp',
  Active: 'Đang chạy',
  Closed: 'Đã đóng',
  Archived: 'Lưu trữ',
};

@Component({
  selector: 'app-campaign-list',
  imports: [
    RouterLink,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="head">
      <h1>Chiến dịch</h1>
      <a mat-flat-button color="primary" routerLink="/employer/campaigns/new">
        <mat-icon>add</mat-icon>
        Tạo chiến dịch
      </a>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải chiến dịch..." />
    } @else if (campaigns().length === 0) {
      <app-empty-state icon="campaign" message="Chưa có chiến dịch nào. Hãy tạo chiến dịch đầu tiên." />
    } @else {
      <div class="list">
        @for (c of campaigns(); track c.id) {
          <mat-card class="row" [routerLink]="['/employer/campaigns', c.id]">
            <div class="main">
              <div class="title-line">
                <h3>{{ c.title }}</h3>
                <span class="chip" [class]="c.status.toLowerCase()">{{ statusLabel(c.status) }}</span>
              </div>
              <p class="meta">
                @if (c.domain) {
                  <span><mat-icon>work</mat-icon>{{ c.domain }}</span>
                }
                <span><mat-icon>quiz</mat-icon>{{ c.questions.length }} câu hỏi</span>
                <span><mat-icon>rule</mat-icon>{{ c.criteria.length }} tiêu chí</span>
                <span><mat-icon>schedule</mat-icon>{{ c.createdAt | date: 'dd/MM/yyyy' }}</span>
              </p>
            </div>
            <mat-icon class="go">chevron_right</mat-icon>
          </mat-card>
        }
      </div>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        cursor: pointer;
        transition: box-shadow 0.15s;
      }
      .row:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      }
      .main {
        flex: 1;
        min-width: 0;
      }
      .title-line {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      h3 {
        margin: 0;
      }
      .meta {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin: 6px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .meta mat-icon {
        font-size: 16px;
        height: 16px;
        width: 16px;
      }
      .go {
        color: var(--mat-sys-on-surface-variant);
      }
      .chip {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 10px;
        border-radius: 12px;
        white-space: nowrap;
      }
      .chip.draft {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.closed {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .chip.archived {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-outline);
      }
    `,
  ],
})
export class CampaignList {
  private api = inject(CampaignApi);

  readonly loading = signal(true);
  readonly campaigns = signal<CampaignResponse[]>([]);

  constructor() {
    this.api.listCampaigns().subscribe({
      next: (list) => {
        this.campaigns.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  statusLabel(s: CampaignStatus): string {
    return STATUS_LABEL[s];
  }
}
