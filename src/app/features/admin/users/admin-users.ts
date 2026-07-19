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
import { MatDialog } from '@angular/material/dialog';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { AdminUserResponse } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import {
  AdminUserActionData,
  AdminUserActionDialog,
  AdminUserActionResult,
} from './admin-user-action-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Danh sách người dùng toàn nền tảng (PlatformAdmin oversight — AUTH-7). Read-only. */
@Component({
  selector: 'app-admin-users',
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
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Người dùng</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline" class="f-role">
              <mat-label>Vai trò</mat-label>
              <mat-select [(ngModel)]="role" name="role">
                <mat-option value="">Tất cả</mat-option>
                <mat-option value="Candidate">Candidate</mat-option>
                <mat-option value="Employer">Employer</mat-option>
                <mat-option value="Admin">Admin</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-search">
              <mat-label>Tìm người dùng</mat-label>
              <input matInput [(ngModel)]="search" name="search" placeholder="Email hoặc tên..." />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              <mat-icon>search</mat-icon> Lọc
            </button>
          </form>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách người dùng..." />
          } @else if (!items().length) {
            <app-empty-state icon="group" message="Không có người dùng nào." />
          } @else {
            <table mat-table [dataSource]="items()" class="tbl">
              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef>Email</th>
                <td mat-cell *matCellDef="let u">{{ u.email ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="fullName">
                <th mat-header-cell *matHeaderCellDef>Họ tên</th>
                <td mat-cell *matCellDef="let u">{{ u.fullName ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="role">
                <th mat-header-cell *matHeaderCellDef>Vai trò</th>
                <td mat-cell *matCellDef="let u"><span class="chip">{{ u.role }}</span></td>
              </ng-container>
              <ng-container matColumnDef="orgName">
                <th mat-header-cell *matHeaderCellDef>Tổ chức</th>
                <td mat-cell *matCellDef="let u">{{ u.orgName ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="orgRole">
                <th mat-header-cell *matHeaderCellDef>Org-role</th>
                <td mat-cell *matCellDef="let u">{{ u.orgRole ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
                <td mat-cell *matCellDef="let u">{{ u.createdAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="state">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let u">
                  @if (u.bannedAt) {
                    <span class="chip banned" [title]="u.banReason || 'Không ghi lý do'">
                      Bị cấm
                    </span>
                  } @else {
                    <span class="chip ok">Hoạt động</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Thao tác</th>
                <td mat-cell *matCellDef="let u">
                  @if (u.bannedAt) {
                    <button
                      mat-icon-button
                      title="Gỡ cấm"
                      aria-label="Gỡ cấm"
                      [disabled]="busy() === u.id"
                      (click)="unban(u)"
                    >
                      <mat-icon>lock_open</mat-icon>
                    </button>
                  } @else {
                    <button
                      mat-icon-button
                      title="Cấm người dùng"
                      aria-label="Cấm người dùng"
                      [disabled]="busy() === u.id"
                      (click)="ban(u)"
                    >
                      <mat-icon>block</mat-icon>
                    </button>
                  }
                  <button
                    mat-icon-button
                    title="Đặt lại mật khẩu"
                    aria-label="Đặt lại mật khẩu"
                    [disabled]="busy() === u.id"
                    (click)="resetPassword(u)"
                  >
                    <mat-icon>key</mat-icon>
                  </button>
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
      .f-role {
        width: 160px;
      }
      .f-search {
        width: 280px;
      }
      .tbl {
        width: 100%;
      }
      .chip.banned {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .chip.ok {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class AdminUsers implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly cols = [
    'email',
    'fullName',
    'role',
    'orgName',
    'orgRole',
    'createdAt',
    'state',
    'actions',
  ];

  readonly items = signal<AdminUserResponse[]>([]);
  readonly loading = signal(true);
  /** Id user đang có request chạy — khoá nút của đúng dòng đó (chống bấm 2 lần). */
  readonly busy = signal<string | null>(null);

  role = '';
  search = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.users({ role: this.role || undefined, search: this.search.trim() || undefined }).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách người dùng.');
      },
    });
  }

  /** Thay 1 dòng tại chỗ để khỏi tải lại cả bảng (giữ nguyên bộ lọc đang xem). */
  private replace(u: AdminUserResponse): void {
    this.items.update((list) => list.map((x) => (x.id === u.id ? u : x)));
  }

  // ── Cấm / gỡ cấm / đặt lại mật khẩu (F20) ───────────────────────────────────
  ban(u: AdminUserResponse): void {
    this.dialog
      .open(AdminUserActionDialog, {
        data: { mode: 'ban', email: u.email ?? u.id } satisfies AdminUserActionData,
        width: '520px',
      })
      .afterClosed()
      .subscribe((res?: AdminUserActionResult) => {
        if (!res || !('reason' in res)) return;
        this.busy.set(u.id);
        this.api.banUser(u.id, res.reason).subscribe({
          next: (updated) => {
            this.busy.set(null);
            this.replace(updated);
            this.notify.success(
              'Đã cấm người dùng. Phiên đang mở của họ còn hiệu lực tối đa ~15 phút.',
            );
          },
          error: (e: HttpErrorResponse) => {
            this.busy.set(null);
            this.notify.error(extractErrorMessage(e) ?? 'Không cấm được người dùng.');
          },
        });
      });
  }

  unban(u: AdminUserResponse): void {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Gỡ cấm người dùng?',
          message: `Cho phép ${u.email ?? u.id} đăng nhập trở lại.`,
          confirmLabel: 'Gỡ cấm',
        } satisfies ConfirmDialogData,
        width: '480px',
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(u.id);
        this.api.unbanUser(u.id).subscribe({
          next: (updated) => {
            this.busy.set(null);
            this.replace(updated);
            this.notify.success('Đã gỡ cấm người dùng.');
          },
          error: (e: HttpErrorResponse) => {
            this.busy.set(null);
            this.notify.error(extractErrorMessage(e) ?? 'Không gỡ cấm được người dùng.');
          },
        });
      });
  }

  resetPassword(u: AdminUserResponse): void {
    this.dialog
      .open(AdminUserActionDialog, {
        data: { mode: 'reset-password', email: u.email ?? u.id } satisfies AdminUserActionData,
        width: '480px',
      })
      .afterClosed()
      .subscribe((res?: AdminUserActionResult) => {
        if (!res || !('newPassword' in res)) return;
        this.busy.set(u.id);
        this.api.resetUserPassword(u.id, res.newPassword).subscribe({
          next: () => {
            this.busy.set(null);
            this.notify.success('Đã đặt lại mật khẩu. Hãy báo mật khẩu mới cho người dùng.');
          },
          error: (e: HttpErrorResponse) => {
            this.busy.set(null);
            this.notify.error(extractErrorMessage(e) ?? 'Không đặt lại được mật khẩu.');
          },
        });
      });
  }
}
