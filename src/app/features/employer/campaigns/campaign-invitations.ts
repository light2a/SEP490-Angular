import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { InvitationListItem, invitationStatusLabel } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'Queued', label: 'Đang chờ gửi' },
  { value: 'Sent', label: 'Đã gửi mail' },
  { value: 'Joined', label: 'Đã tham gia' },
  { value: 'Expired', label: 'Hết hạn' },
  { value: 'Revoked', label: 'Đã thu hồi' },
];

/**
 * Danh sách lời mời ĐÃ PHÁT của chiến dịch.
 *
 * Trước màn này, `created[]` chỉ sống trong đúng response của lần bấm "Gửi lời mời" ⇒ HR đóng
 * tab là mất dấu hoàn toàn; mà mời theo đường email KHÔNG sinh row CV nên trang "Lọc CV" cũng
 * không thấy. Đây cũng là chỗ DUY NHẤT lấy được id để bấm "Gửi lại".
 *
 * ⚠ Backend không bao giờ trả token của lời mời (DB chỉ giữ hash) — không có nút "sao chép link".
 */
@Component({
  selector: 'app-campaign-invitations',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="head">
      <a mat-button [routerLink]="['/employer/campaigns', campaignId()]">
        <mat-icon>arrow_back</mat-icon> Quay lại chiến dịch
      </a>
    </div>

    <h1>Lời mời đã gửi</h1>

    <mat-card class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Trạng thái</mat-label>
        <mat-select [(ngModel)]="filterStatus" (selectionChange)="load()">
          @for (f of statusFilters; track f.value) {
            <mat-option [value]="f.value">{{ f.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Tìm theo email</mat-label>
        <input matInput [(ngModel)]="filterSearch" (keyup.enter)="load()" />
      </mat-form-field>
      <button mat-flat-button color="primary" [disabled]="loading()" (click)="load()">
        <mat-icon>search</mat-icon> Lọc
      </button>
      <button mat-button [disabled]="loading()" (click)="resetFilters()">Xoá lọc</button>
    </mat-card>

    @if (loading()) {
      <app-spinner message="Đang tải lời mời…" />
    } @else if (items().length === 0) {
      <app-empty-state icon="mail" message="Chưa có lời mời nào khớp bộ lọc." />
    } @else {
      <mat-card class="tbl-card">
        <table mat-table [dataSource]="items()">
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let i">{{ i.email }}</td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
            <td mat-cell *matCellDef="let i">
              <mat-chip [class]="'st-' + i.status" highlighted>{{ label(i.status) }}</mat-chip>
            </td>
          </ng-container>

          <ng-container matColumnDef="sent">
            <th mat-header-cell *matHeaderCellDef>Gửi mail lúc</th>
            <td mat-cell *matCellDef="let i">
              @if (i.emailSentAt) {
                {{ i.emailSentAt | date: 'dd/MM/yyyy HH:mm' }}
              } @else if (i.sentAt) {
                <span class="muted" matTooltip="Đã vào hàng đợi, chưa gửi xong">đang chờ gửi</span>
              } @else {
                <span class="muted">—</span>
              }
            </td>
          </ng-container>

          <ng-container matColumnDef="joined">
            <th mat-header-cell *matHeaderCellDef>Tham gia lúc</th>
            <td mat-cell *matCellDef="let i">
              {{ i.joinedAt ? (i.joinedAt | date: 'dd/MM/yyyy HH:mm') : '—' }}
            </td>
          </ng-container>

          <ng-container matColumnDef="expires">
            <th mat-header-cell *matHeaderCellDef>Hết hạn</th>
            <td mat-cell *matCellDef="let i">{{ i.expiresAt | date: 'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Thao tác</th>
            <td mat-cell *matCellDef="let i">
              <button
                mat-button
                [disabled]="busy()"
                matTooltip="Thu hồi link cũ và gửi link mới tới email này"
                (click)="reissue(i)"
              >
                <mat-icon>forward_to_inbox</mat-icon> Gửi lại
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
      </mat-card>
      <p class="hint">
        Bấm "Gửi lại" sẽ <strong>vô hiệu link cũ</strong> (dòng cũ chuyển sang "Đã thu hồi") và
        phát một link mới tới cùng email.
      </p>
    }
  `,
  styles: [
    `
      .head {
        margin-bottom: 8px;
      }
      h1 {
        margin: 0 0 16px;
      }
      .filters {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        padding: 16px;
        margin-bottom: 16px;
      }
      .filters mat-form-field {
        flex: 1 1 200px;
      }
      .tbl-card {
        overflow-x: auto;
      }
      table {
        width: 100%;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin-top: 12px;
      }
      .st-Joined {
        --mdc-chip-label-text-color: #fff;
        background: #2e7d32;
      }
      .st-Revoked,
      .st-Expired {
        --mdc-chip-label-text-color: #fff;
        background: var(--mat-sys-error);
      }
      .st-Queued {
        --mdc-chip-label-text-color: #7a4f00;
        background: #ffecb3;
      }
    `,
  ],
})
export class CampaignInvitations implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly items = signal<InvitationListItem[]>([]);
  readonly cols = ['email', 'status', 'sent', 'joined', 'expires', 'actions'];
  readonly statusFilters = STATUS_FILTERS;

  filterStatus = '';
  filterSearch = '';

  ngOnInit(): void {
    this.load();
  }

  label(status: string): string {
    return invitationStatusLabel(status);
  }

  resetFilters(): void {
    this.filterStatus = '';
    this.filterSearch = '';
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getInvitations(this.campaignId(), {
        status: this.filterStatus || undefined,
        search: this.filterSearch.trim() || undefined,
      })
      .subscribe({
        next: (list) => {
          this.items.set(list);
          this.loading.set(false);
        },
        error: (e: HttpErrorResponse) => {
          this.loading.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách lời mời.');
        },
      });
  }

  reissue(item: InvitationListItem): void {
    this.busy.set(true);
    this.api.reissueInvitation(this.campaignId(), item.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success(`Đã gửi lại lời mời tới ${item.email}.`);
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        // 409 = chiến dịch không còn Active; gửi lại lúc này không có ý nghĩa.
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ??
              'Chiến dịch không còn hoạt động — không gửi lại lời mời được.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Gửi lại lời mời thất bại.');
      },
    });
  }
}
