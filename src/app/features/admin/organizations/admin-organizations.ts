import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { OrganizationResponse } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Danh sách tổ chức toàn nền tảng (PlatformAdmin oversight — AUTH-7). Read-only. */
@Component({
  selector: 'app-admin-organizations',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Tổ chức (toàn nền tảng)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline" class="f-search">
              <mat-label>Tìm tổ chức</mat-label>
              <input matInput [(ngModel)]="search" name="search" placeholder="Tên tổ chức..." />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              <mat-icon>search</mat-icon> Tìm
            </button>
          </form>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách tổ chức..." />
          } @else if (!items().length) {
            <app-empty-state icon="domain" message="Không có tổ chức nào." />
          } @else {
            <table mat-table [dataSource]="items()" class="tbl">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Tên</th>
                <td mat-cell *matCellDef="let o">{{ o.name }}</td>
              </ng-container>
              <ng-container matColumnDef="taxCode">
                <th mat-header-cell *matHeaderCellDef>Mã số thuế</th>
                <td mat-cell *matCellDef="let o">{{ o.taxCode ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="memberCount">
                <th mat-header-cell *matHeaderCellDef>Thành viên</th>
                <td mat-cell *matCellDef="let o">{{ o.memberCount }}</td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
                <td mat-cell *matCellDef="let o">{{ o.createdAt | date: 'short' }}</td>
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
      .f-search {
        width: 280px;
      }
      .tbl {
        width: 100%;
      }
    `,
  ],
})
export class AdminOrganizations implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  readonly cols = ['name', 'taxCode', 'memberCount', 'createdAt'];

  readonly items = signal<OrganizationResponse[]>([]);
  readonly loading = signal(true);

  search = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.organizations(this.search.trim() || undefined).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách tổ chức.');
      },
    });
  }
}
