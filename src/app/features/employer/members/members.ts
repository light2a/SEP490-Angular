import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { OrgApi } from '../../../core/api/org.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotifyService } from '../../../core/notify.service';
import { OrgMemberResponse, OrgRole } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Quản lý thành viên tổ chức (A6/A6b). Mutations chỉ dành cho OrgAdmin. */
@Component({
  selector: 'app-members',
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
          <mat-card-title>Thành viên tổ chức</mat-card-title>
          @if (!isOrgAdmin()) {
            <mat-card-subtitle>Chỉ OrgAdmin quản lý thành viên.</mat-card-subtitle>
          }
        </mat-card-header>

        <mat-card-content>
          @if (isOrgAdmin()) {
            <form class="add-form" (ngSubmit)="add()">
              <mat-form-field appearance="outline" class="f-email">
                <mat-label>Email</mat-label>
                <input matInput type="email" [(ngModel)]="newEmail" name="email" required />
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-name">
                <mat-label>Họ tên (tuỳ chọn)</mat-label>
                <input matInput [(ngModel)]="newFullName" name="fullName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-role">
                <mat-label>Vai trò</mat-label>
                <mat-select [(ngModel)]="newRole" name="role">
                  <mat-option value="HrMember">HrMember</mat-option>
                  <mat-option value="OrgAdmin">OrgAdmin</mat-option>
                </mat-select>
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="adding() || !newEmail.trim()"
              >
                <mat-icon>person_add</mat-icon> Thêm thành viên
              </button>
            </form>
          }

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải thành viên..." />
          } @else if (!members().length) {
            <app-empty-state icon="group" message="Chưa có thành viên nào." />
          } @else {
            <table mat-table [dataSource]="members()" class="tbl">
              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef>Email</th>
                <td mat-cell *matCellDef="let m">{{ m.email }}</td>
              </ng-container>
              <ng-container matColumnDef="fullName">
                <th mat-header-cell *matHeaderCellDef>Họ tên</th>
                <td mat-cell *matCellDef="let m">{{ m.fullName || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="orgRole">
                <th mat-header-cell *matHeaderCellDef>Vai trò</th>
                <td mat-cell *matCellDef="let m">
                  @if (isOrgAdmin() && !isSelf(m)) {
                    <mat-select
                      [value]="m.orgRole"
                      [disabled]="busyId() === m.userId"
                      (selectionChange)="changeRole(m, $event.value)"
                    >
                      <mat-option value="HrMember">HrMember</mat-option>
                      <mat-option value="OrgAdmin">OrgAdmin</mat-option>
                    </mat-select>
                  } @else {
                    <span class="role-chip" [class.admin]="m.orgRole === 'OrgAdmin'">{{ m.orgRole }}</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="joinedAt">
                <th mat-header-cell *matHeaderCellDef>Tham gia</th>
                <td mat-cell *matCellDef="let m">{{ m.joinedAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let m">
                  @if (isOrgAdmin()) {
                    <button
                      mat-icon-button
                      color="warn"
                      [disabled]="isSelf(m) || busyId() === m.userId"
                      (click)="remove(m)"
                      title="Xoá thành viên"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns()"></tr>
              <tr mat-row *matRowDef="let row; columns: columns()"></tr>
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
      .add-form {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .f-email {
        width: 240px;
      }
      .f-name {
        width: 200px;
      }
      .f-role {
        width: 150px;
      }
      .tbl {
        width: 100%;
      }
      .role-chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .role-chip.admin {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
    `,
  ],
})
export class Members implements OnInit {
  private api = inject(OrgApi);
  private auth = inject(AuthStore);
  private notify = inject(NotifyService);

  readonly members = signal<OrgMemberResponse[]>([]);
  readonly loading = signal(true);
  readonly adding = signal(false);
  readonly busyId = signal<string | null>(null);

  readonly isOrgAdmin = computed(() => this.auth.orgRole() === 'OrgAdmin');

  newEmail = '';
  newFullName = '';
  newRole: OrgRole = 'HrMember';

  readonly columns = computed(() =>
    this.isOrgAdmin()
      ? ['email', 'fullName', 'orgRole', 'joinedAt', 'actions']
      : ['email', 'fullName', 'orgRole', 'joinedAt'],
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.members().subscribe({
      next: (list) => {
        this.members.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách thành viên.');
      },
    });
  }

  isSelf(m: OrgMemberResponse): boolean {
    return m.userId === this.auth.userId();
  }

  add(): void {
    const email = this.newEmail.trim();
    if (!email) return;
    this.adding.set(true);
    this.api
      .addMember({ email, fullName: this.newFullName.trim() || undefined, orgRole: this.newRole })
      .subscribe({
        next: () => {
          this.adding.set(false);
          this.notify.success('Đã thêm thành viên.');
          this.newEmail = '';
          this.newFullName = '';
          this.newRole = 'HrMember';
          this.load();
        },
        error: (e: HttpErrorResponse) => {
          this.adding.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Thêm thành viên thất bại.');
        },
      });
  }

  changeRole(m: OrgMemberResponse, role: OrgRole): void {
    if (role === m.orgRole) return;
    this.busyId.set(m.userId);
    this.api.changeRole(m.userId, { orgRole: role }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success('Đã đổi vai trò.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Đổi vai trò thất bại.');
        this.load();
      },
    });
  }

  remove(m: OrgMemberResponse): void {
    if (this.isSelf(m)) return;
    if (!confirm(`Xoá thành viên ${m.email} khỏi tổ chức?`)) return;
    this.busyId.set(m.userId);
    this.api.removeMember(m.userId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success('Đã xoá thành viên.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Xoá thành viên thất bại.');
      },
    });
  }
}
