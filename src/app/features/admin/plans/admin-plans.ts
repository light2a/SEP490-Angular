import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  INTERVIEW_FUNDING_LABEL,
  InterviewFunding,
  PLAN_AUDIENCE_LABEL,
  PlanAudience,
  PlanResponse,
} from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';
import { PlanFormDialog, PlanFormDialogData, PlanFormDialogResult } from './plan-form-dialog';

/**
 * Catalog gói thuê bao (S11 tiering) — PlatformAdmin.
 *
 * Hai catalog B2C/B2B được tách bằng `audience` và ràng buộc ở TẦNG DB (CHECK
 * `ck_sub_audience_owner`): ví cá nhân chỉ nhận gói B2C, ví tổ chức chỉ nhận gói B2B. Bộ lọc
 * trên màn này chỉ là tiện ích đọc — nó không phải thứ giữ hai catalog khỏi trộn.
 */
@Component({
  selector: 'app-admin-plans',
  imports: [
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
          <mat-card-title>Gói thuê bao</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="filters">
            <mat-form-field appearance="outline" class="f-aud">
              <mat-label>Catalog</mat-label>
              <mat-select [(ngModel)]="audience" name="audience" (selectionChange)="load()">
                <mat-option [value]="null">Tất cả</mat-option>
                <mat-option [value]="PlanAudience.B2C">B2C (cá nhân)</mat-option>
                <mat-option [value]="PlanAudience.B2B">B2B (tổ chức)</mat-option>
              </mat-select>
            </mat-form-field>
            <span class="spacer"></span>
            <button mat-flat-button color="primary" (click)="create()">
              <mat-icon>add</mat-icon>
              Tạo gói
            </button>
          </div>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải catalog gói..." />
          } @else if (!items().length) {
            <app-empty-state icon="layers" message="Chưa có gói thuê bao nào." />
          } @else {
            <div class="tbl-wrap">
              <table mat-table [dataSource]="items()" class="tbl">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Mã</th>
                  <td mat-cell *matCellDef="let p"><code>{{ p.code }}</code></td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Tên</th>
                  <td mat-cell *matCellDef="let p">{{ p.name }}</td>
                </ng-container>
                <ng-container matColumnDef="audience">
                  <th mat-header-cell *matHeaderCellDef>Catalog</th>
                  <td mat-cell *matCellDef="let p">
                    <span class="chip">{{ audienceLabel(p.audience) }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="rank">
                  <th mat-header-cell *matHeaderCellDef>Bậc</th>
                  <td mat-cell *matCellDef="let p">{{ p.rank }}</td>
                </ng-container>
                <ng-container matColumnDef="funding">
                  <th mat-header-cell *matHeaderCellDef>Buổi thi</th>
                  <td mat-cell *matCellDef="let p">
                    {{ fundingLabel(p.interviewFunding) }}
                    @if (p.monthlyQuota != null) {
                      <span class="muted">· {{ p.monthlyQuota }}/tháng</span>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="features">
                  <th mat-header-cell *matHeaderCellDef>Tính năng</th>
                  <td mat-cell *matCellDef="let p">
                    <span class="feats">{{ features(p) || '—' }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="isActive">
                  <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                  <td mat-cell *matCellDef="let p">
                    <span class="chip" [class.on]="p.isActive" [class.off]="!p.isActive">
                      {{ p.isActive ? 'Đang bán' : 'Đã tắt' }}
                    </span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Thao tác</th>
                  <td mat-cell *matCellDef="let p">
                    <button
                      mat-icon-button
                      title="Sửa gói"
                      aria-label="Sửa gói"
                      [disabled]="busy() === p.id"
                      (click)="edit(p)"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                    @if (p.isActive) {
                      <button
                        mat-icon-button
                        title="Ngừng bán gói"
                        aria-label="Ngừng bán gói"
                        [disabled]="busy() === p.id"
                        (click)="deactivate(p)"
                      >
                        <mat-icon>block</mat-icon>
                      </button>
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols"></tr>
              </table>
            </div>
          }

          <p class="warn">
            <mat-icon inline>warning</mat-icon>
            Sửa gói là <strong>ghi đè toàn bộ</strong> cấu hình. Kỳ hạn thuê bao đã cấp giữ bản
            chụp quyền lợi tại thời điểm kích hoạt nên không đổi theo — thay đổi ở đây chỉ áp cho
            lần mua/cấp sau.
          </p>
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
      .spacer {
        flex: 1 1 auto;
      }
      .f-aud {
        width: 200px;
      }
      .tbl-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .tbl {
        width: 100%;
        min-width: 940px;
      }
      code {
        font-size: 12px;
      }
      .muted,
      .feats {
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
      }
      .chip {
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.on {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.off {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .warn {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
    `,
  ],
})
export class AdminPlans implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  protected readonly PlanAudience = PlanAudience;

  readonly cols = ['code', 'name', 'audience', 'rank', 'funding', 'features', 'isActive', 'actions'];

  readonly items = signal<PlanResponse[]>([]);
  readonly loading = signal(true);
  /** Id gói đang có request — khoá nút đúng dòng đó. */
  readonly busy = signal<string | null>(null);

  audience: PlanAudience | null = null;

  ngOnInit(): void {
    this.load();
  }

  audienceLabel(a: PlanAudience): string {
    return PLAN_AUDIENCE_LABEL[a] ?? String(a);
  }

  fundingLabel(f: InterviewFunding): string {
    return INTERVIEW_FUNDING_LABEL[f] ?? String(f);
  }

  features(p: PlanResponse): string {
    const on: string[] = [];
    if (p.adaptiveEnabled) on.push('thích ứng');
    if (p.groundingEnabled) on.push('trích nguồn');
    if (p.cvAnalysisIncluded) on.push('phân tích CV');
    if (p.repoAnalysisIncluded) on.push('phân tích repo');
    if (p.roadmapEnabled) on.push('lộ trình');
    if (p.postpaidEligible) on.push('trả sau');
    return on.join(' · ');
  }

  create(): void {
    this.dialog
      .open(PlanFormDialog, {
        data: { plan: null } satisfies PlanFormDialogData,
        width: '820px',
      })
      .afterClosed()
      .subscribe((body?: PlanFormDialogResult) => {
        if (!body) return;
        this.api.createPlan(body).subscribe({
          next: (p) => {
            this.notify.success(`Đã tạo gói ${p.code}.`);
            this.load();
          },
          error: (e: HttpErrorResponse) =>
            this.notify.error(extractErrorMessage(e) ?? 'Không tạo được gói.'),
        });
      });
  }

  /**
   * Sửa gói — nạp lại BẢN ĐẦY ĐỦ từ server trước khi mở form, không dùng dòng trong bảng.
   * PUT là replace toàn bộ, nên sửa trên dữ liệu cũ (danh sách có thể đã lỗi thời) là ghi đè
   * bằng trạng thái quá khứ.
   */
  edit(row: PlanResponse): void {
    this.busy.set(row.id);
    this.api.plan(row.id).subscribe({
      next: (plan) => {
        this.busy.set(null);
        this.dialog
          .open(PlanFormDialog, {
            data: { plan } satisfies PlanFormDialogData,
            width: '820px',
          })
          .afterClosed()
          .subscribe((body?: PlanFormDialogResult) => {
            if (!body) return;
            this.busy.set(row.id);
            this.api.updatePlan(row.id, body).subscribe({
              next: (p) => {
                this.busy.set(null);
                this.notify.success(`Đã lưu gói ${p.code}.`);
                this.load();
              },
              error: (e: HttpErrorResponse) => {
                this.busy.set(null);
                this.notify.error(extractErrorMessage(e) ?? 'Không lưu được gói.');
              },
            });
          });
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được gói.');
      },
    });
  }

  /** Vô hiệu hoá MỀM (isActive=false) — kỳ hạn đã cấp vẫn chạy tới hết hạn. */
  deactivate(p: PlanResponse): void {
    if (!confirm(`Ngừng bán gói "${p.name}"? Kỳ hạn đã cấp vẫn chạy tới khi hết hạn.`)) return;
    this.busy.set(p.id);
    this.api.deactivatePlan(p.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.notify.success(`Đã ngừng bán gói ${p.code}.`);
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không ngừng bán được gói.');
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.plans(this.audience).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được catalog gói.');
      },
    });
  }
}
