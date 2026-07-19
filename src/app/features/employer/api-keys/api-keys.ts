import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotifyService } from '../../../core/notify.service';
import { ApiKeyListItem } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';
import { ApiKeyCreatedDialog } from './api-key-created-dialog';

/**
 * Quản lý API key cho bên thứ ba / ATS (F17) — **chỉ OrgAdmin**.
 *
 * Backend đã gate OrgAdmin ở cả GET lẫn mutation; màn này không được bày lối vào cho HrMember, vì
 * chính danh sách tên + tiền tố key đã là "bản đồ tích hợp" của tổ chức.
 *
 * Bất biến của màn hình: **bảng không bao giờ hiển thị key thô**. Kiểu `ApiKeyListItem` không có
 * trường `key`, nên ràng buộc này được TypeScript giữ hộ chứ không phụ thuộc kỷ luật người viết —
 * nếu bảng hiện được key thì toàn bộ việc băm ở backend thành vô nghĩa.
 */
@Component({
  selector: 'app-api-keys',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
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
          <mat-card-title>API key cho tích hợp</mat-card-title>
          <mat-card-subtitle>
            @if (isOrgAdmin()) {
              Cấp key để hệ thống tuyển dụng (ATS) của bạn đọc campaign và kết quả.
            } @else {
              Chỉ OrgAdmin được quản lý API key của tổ chức.
            }
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @if (isOrgAdmin()) {
            <form class="add-form" (ngSubmit)="create()">
              <mat-form-field appearance="outline" class="f-name">
                <mat-label>Tên key</mat-label>
                <input
                  matInput
                  [(ngModel)]="newName"
                  name="name"
                  required
                  placeholder="VD: ATS phòng tuyển dụng"
                />
                <mat-hint>Đặt tên theo nơi dùng — để sau này biết thu hồi cái nào.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-days">
                <mat-label>Hết hạn sau (ngày)</mat-label>
                <input matInput type="number" min="1" [(ngModel)]="newExpiresInDays" name="days" />
                <mat-hint>Bỏ trống = không đặt hạn.</mat-hint>
              </mat-form-field>
              <mat-checkbox [(ngModel)]="newIncludePii" name="pii" class="f-pii">
                Cho phép đọc họ tên + email ứng viên
              </mat-checkbox>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="creating() || !newName.trim()"
              >
                <mat-icon>add</mat-icon> Tạo key
              </button>
            </form>
            <p class="pii-note">
              <mat-icon inline>info</mat-icon>
              Mặc định key <strong>không</strong> đọc được dữ liệu cá nhân ứng viên. Chỉ bật khi bên
              tích hợp thực sự cần — key rò rỉ là dữ liệu ứng viên rò theo.
            </p>
          }

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải API key..." />
          } @else if (!keys().length) {
            <app-empty-state icon="vpn_key" message="Chưa có API key nào." />
          } @else {
            <table mat-table [dataSource]="keys()" class="tbl">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Tên</th>
                <td mat-cell *matCellDef="let k">{{ k.name }}</td>
              </ng-container>
              <ng-container matColumnDef="keyPrefix">
                <th mat-header-cell *matHeaderCellDef>Tiền tố</th>
                <td mat-cell *matCellDef="let k">
                  <code>{{ k.keyPrefix }}…</code>
                </td>
              </ng-container>
              <ng-container matColumnDef="includePii">
                <th mat-header-cell *matHeaderCellDef>PII</th>
                <td mat-cell *matCellDef="let k">
                  @if (k.includePii) {
                    <span class="chip pii">có</span>
                  } @else {
                    <span class="chip">không</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
                <td mat-cell *matCellDef="let k">{{ k.createdAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="expiresAt">
                <th mat-header-cell *matHeaderCellDef>Hết hạn</th>
                <td mat-cell *matCellDef="let k">
                  {{ k.expiresAt ? (k.expiresAt | date: 'short') : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="lastUsedAt">
                <th mat-header-cell *matHeaderCellDef>Dùng lần cuối</th>
                <td mat-cell *matCellDef="let k">
                  {{ k.lastUsedAt ? (k.lastUsedAt | date: 'short') : 'chưa dùng' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let k">
                  @if (k.isActive) {
                    <span class="chip active">đang hoạt động</span>
                  } @else {
                    <span class="chip revoked">đã thu hồi</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let k">
                  @if (isOrgAdmin() && k.isActive) {
                    <button
                      mat-icon-button
                      color="warn"
                      [disabled]="busyId() === k.id"
                      (click)="revoke(k)"
                      title="Thu hồi key"
                    >
                      <mat-icon>block</mat-icon>
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
        margin-bottom: 4px;
      }
      .f-name {
        width: 260px;
      }
      .f-days {
        width: 170px;
      }
      .f-pii {
        margin-bottom: 20px;
      }
      .pii-note {
        margin: 0 0 12px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tbl {
        width: 100%;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
      }
      .chip.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.revoked,
      .chip.pii {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class ApiKeys implements OnInit {
  private api = inject(CampaignApi);
  private auth = inject(AuthStore);
  private dialog = inject(MatDialog);
  private notify = inject(NotifyService);

  readonly keys = signal<ApiKeyListItem[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly busyId = signal<string | null>(null);

  readonly isOrgAdmin = computed(() => this.auth.orgRole() === 'OrgAdmin');

  newName = '';
  newExpiresInDays: number | null = null;
  newIncludePii = false;

  private readonly baseColumns = [
    'name',
    'keyPrefix',
    'includePii',
    'createdAt',
    'expiresAt',
    'lastUsedAt',
    'status',
  ];

  readonly columns = computed(() =>
    this.isOrgAdmin() ? [...this.baseColumns, 'actions'] : this.baseColumns,
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.listApiKeys().subscribe({
      next: (list) => {
        this.keys.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách API key.');
      },
    });
  }

  /**
   * Tạo key rồi mở ngay hộp thoại hiện key thô. Hộp thoại mở với `disableClose` — đây là lần duy
   * nhất chuỗi bí mật tồn tại ở phía client, đóng nhầm bằng một cú click ra ngoài là mất thật.
   *
   * Chỉ nạp lại danh sách SAU khi hộp thoại đóng: nạp lại ngay sẽ đẩy một lần render bảng chen
   * vào giữa lúc người dùng đang sao chép.
   */
  create(): void {
    const name = this.newName.trim();
    if (!name) return;
    const days = Number(this.newExpiresInDays);
    this.creating.set(true);
    this.api
      .createApiKey({
        name,
        expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
        includePii: this.newIncludePii,
      })
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.newName = '';
          this.newExpiresInDays = null;
          this.newIncludePii = false;
          this.dialog
            .open(ApiKeyCreatedDialog, { data: created, disableClose: true, width: '560px' })
            .afterClosed()
            .subscribe(() => this.load());
        },
        error: (e: HttpErrorResponse) => {
          this.creating.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Tạo API key thất bại.');
        },
      });
  }

  /**
   * Thu hồi = khó đảo, nên phải xác nhận. Lời cảnh báo nói thẳng giới hạn thật của việc thu hồi:
   * nó chặn được request kể từ lúc này, **không** lấy lại được dữ liệu bên kia đã tải về. HR đọc
   * "thu hồi" rất dễ hiểu nhầm thành "gỡ được dữ liệu đã rò", rồi yên tâm sai chỗ.
   */
  revoke(k: ApiKeyListItem): void {
    const data: ConfirmDialogData = {
      title: `Thu hồi key "${k.name}"?`,
      message: 'Mọi tích hợp đang dùng key này sẽ ngừng truy cập được ngay lập tức.',
      bullets: [
        'Không khôi phục được key đã thu hồi — muốn dùng lại phải tạo key mới.',
        'Thu hồi KHÔNG xoá dữ liệu mà bên tích hợp đã tải về trước đó.',
      ],
      warning: 'Hãy chắc chắn hệ thống bên kia đã có key thay thế trước khi thu hồi.',
      confirmLabel: 'Thu hồi',
      danger: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busyId.set(k.id);
        this.api.revokeApiKey(k.id).subscribe({
          next: () => {
            this.busyId.set(null);
            this.notify.success('Đã thu hồi API key.');
            this.load();
          },
          error: (e: HttpErrorResponse) => {
            this.busyId.set(null);
            this.notify.error(extractErrorMessage(e) ?? 'Thu hồi API key thất bại.');
          },
        });
      });
  }
}
