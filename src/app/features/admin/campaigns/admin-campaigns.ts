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
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { AdminCampaignListItem, CampaignStatus } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Danh sách chiến dịch toàn nền tảng (PlatformAdmin oversight — AUTH-7). Read-only. */
@Component({
  selector: 'app-admin-campaigns',
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
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Chiến dịch (toàn nền tảng)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline" class="f-status">
              <mat-label>Trạng thái</mat-label>
              <mat-select [(ngModel)]="status" name="status" (selectionChange)="load()">
                <mat-option value="">Tất cả</mat-option>
                <mat-option value="Draft">Nháp</mat-option>
                <mat-option value="Active">Đang chạy</mat-option>
                <mat-option value="Closed">Đã đóng</mat-option>
                <mat-option value="Archived">Lưu trữ</mat-option>
              </mat-select>
            </mat-form-field>
          </form>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách chiến dịch..." />
          } @else if (!items().length) {
            <app-empty-state icon="campaign" message="Không có chiến dịch nào." />
          } @else {
            <table mat-table [dataSource]="items()" class="tbl">
              <ng-container matColumnDef="title">
                <th mat-header-cell *matHeaderCellDef>Tiêu đề</th>
                <td mat-cell *matCellDef="let c">{{ c.title }}</td>
              </ng-container>
              <ng-container matColumnDef="domain">
                <th mat-header-cell *matHeaderCellDef>Lĩnh vực</th>
                <td mat-cell *matCellDef="let c">{{ c.domain ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let c">
                  <span class="chip" [class]="statusClass(c.status)">{{ statusLabel(c.status) }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="orgId">
                <th mat-header-cell *matHeaderCellDef>Tổ chức</th>
                <td mat-cell *matCellDef="let c"><code>{{ short(c.orgId) }}</code></td>
              </ng-container>
              <ng-container matColumnDef="maxCandidates">
                <th mat-header-cell *matHeaderCellDef>Số ứng viên tối đa</th>
                <td mat-cell *matCellDef="let c">{{ c.maxCandidates ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
                <td mat-cell *matCellDef="let c">{{ c.createdAt | date: 'short' }}</td>
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
        width: 180px;
      }
      .tbl {
        width: 100%;
      }
      code {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.closed {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .chip.archived {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
        opacity: 0.7;
      }
    `,
  ],
})
export class AdminCampaigns implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  readonly cols = ['title', 'domain', 'status', 'orgId', 'maxCandidates', 'createdAt'];

  readonly items = signal<AdminCampaignListItem[]>([]);
  readonly loading = signal(true);

  status: '' | CampaignStatus = '';

  private readonly labels: Record<CampaignStatus, string> = {
    Draft: 'Nháp',
    Active: 'Đang chạy',
    Closed: 'Đã đóng',
    Archived: 'Lưu trữ',
  };

  ngOnInit(): void {
    this.load();
  }

  statusLabel(s: CampaignStatus): string {
    return this.labels[s] ?? s;
  }

  statusClass(s: CampaignStatus): string {
    return s.toLowerCase();
  }

  short(id: string): string {
    return id ? id.slice(0, 8) : '—';
  }

  load(): void {
    this.loading.set(true);
    this.api.campaigns({ status: this.status || undefined }).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách chiến dịch.');
      },
    });
  }
}
