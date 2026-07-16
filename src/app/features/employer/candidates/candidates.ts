import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CandidateListItem,
  InviteShortlistResponse,
  ScreenCandidatesResponse,
} from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Các trạng thái ứng viên được phép mời shortlist. */
const INVITABLE = new Set(['Analyzed', 'Filtered']);

/** Sàng lọc CV + shortlist mời ứng viên cho 1 campaign (C13–C15). */
@Component({
  selector: 'app-candidates',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
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
      <a mat-button [routerLink]="['/employer/campaigns', campaignId()]">
        <mat-icon>arrow_back</mat-icon> Quay lại chiến dịch
      </a>

      <!-- Upload CV -->
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Tải CV ứng viên</mat-card-title>
          <mat-card-subtitle>Chọn nhiều file PDF để hệ thống sàng lọc.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="upload-row">
            <input
              #fileInput
              type="file"
              multiple
              accept="application/pdf"
              hidden
              (change)="onFiles($event)"
            />
            <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="uploading()">
              <mat-icon>upload_file</mat-icon> Chọn file PDF
            </button>
            @if (selectedFiles().length) {
              <span class="muted">{{ selectedFiles().length }} file đã chọn</span>
              <button mat-flat-button color="primary" (click)="upload()" [disabled]="uploading()">
                <mat-icon>cloud_upload</mat-icon> Tải lên &amp; sàng lọc
              </button>
            }
          </div>

          @if (uploading()) {
            <app-spinner [diameter]="28" message="Đang tải lên và sàng lọc CV..." />
          }

          @if (lastResult(); as r) {
            <div class="summary">
              <span class="chip">Nhận: {{ r.received }}</span>
              <span class="chip ok">Qua sàng: {{ r.filtered }}</span>
              <span class="chip warn">Loại: {{ r.rejected }}</span>
              <span class="chip muted-chip">Bỏ qua: {{ r.skipped }}</span>
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Danh sách ứng viên -->
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Danh sách ứng viên (đã sàng)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="filters">
            <mat-form-field appearance="outline" class="f-status">
              <mat-label>Trạng thái</mat-label>
              <mat-select [(ngModel)]="filterStatus">
                <mat-option [value]="''">Tất cả</mat-option>
                <mat-option value="Filtered">Qua sàng</mat-option>
                <mat-option value="Rejected">Bị loại</mat-option>
                <mat-option value="Analyzed">Đã chấm</mat-option>
                <mat-option value="Invited">Đã mời</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-score">
              <mat-label>Điểm tối thiểu</mat-label>
              <input matInput type="number" min="0" max="100" [(ngModel)]="filterMinScore" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-skill">
              <mat-label>Kỹ năng</mat-label>
              <input matInput [(ngModel)]="filterSkill" placeholder="vd: react" />
            </mat-form-field>
            <button mat-stroked-button (click)="load()">
              <mat-icon>search</mat-icon> Lọc
            </button>
            <button mat-button (click)="clearFilters()">Xoá lọc</button>
            <span class="spacer"></span>
            <button
              mat-flat-button
              color="primary"
              [disabled]="!selectedIds().length || inviting()"
              (click)="invite()"
            >
              <mat-icon>mail</mat-icon> Mời shortlist ({{ selectedIds().length }})
            </button>
          </div>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách..." />
          } @else if (!candidates().length) {
            <app-empty-state icon="person_search" message="Chưa có ứng viên nào. Hãy tải CV lên." />
          } @else {
            <table mat-table [dataSource]="candidates()" class="tbl">
              <ng-container matColumnDef="select">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let c">
                  <mat-checkbox
                    [disabled]="!canInvite(c)"
                    [checked]="isChecked(c.id)"
                    (change)="toggle(c.id, $event.checked)"
                  />
                </td>
              </ng-container>
              <ng-container matColumnDef="fullName">
                <th mat-header-cell *matHeaderCellDef>Họ tên</th>
                <td mat-cell *matCellDef="let c">{{ c.fullName || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef>Email</th>
                <td mat-cell *matCellDef="let c">{{ c.email || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let c">
                  <span class="status-chip" [class]="'st-' + c.status">{{ statusLabel(c.status) }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="score">
                <th mat-header-cell *matHeaderCellDef>Điểm khớp</th>
                <td mat-cell *matCellDef="let c">
                  {{ c.overallMatchScore != null ? c.overallMatchScore : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="reason">
                <th mat-header-cell *matHeaderCellDef>Lý do loại</th>
                <td mat-cell *matCellDef="let c" class="muted">{{ c.rejectReason || '' }}</td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let c">
                  <a
                    mat-button
                    color="primary"
                    [routerLink]="['/employer/campaigns', campaignId(), 'candidates', c.id]"
                  >
                    Chi tiết
                  </a>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          }

          @if (inviteResult(); as ir) {
            <div class="invite-result">
              @if (ir.invited.length) {
                <p class="ok">Đã mời {{ ir.invited.length }} ứng viên.</p>
              }
              @if (ir.failed.length) {
                <p class="warn">Thất bại {{ ir.failed.length }}:</p>
                <ul>
                  @for (f of ir.failed; track f.candidateId) {
                    <li class="muted">{{ f.candidateId }} — {{ f.reason }}</li>
                  }
                </ul>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .upload-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .summary {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .chip {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 13px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.ok {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .filters {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .filters .spacer {
        flex: 1 1 auto;
      }
      .f-status {
        width: 150px;
      }
      .f-score {
        width: 130px;
      }
      .f-skill {
        width: 160px;
      }
      .tbl {
        width: 100%;
      }
      .status-chip {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .status-chip.st-Analyzed,
      .status-chip.st-Invited {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .status-chip.st-Rejected,
      .status-chip.st-AnalysisFailed {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .invite-result {
        margin-top: 12px;
      }
      .invite-result .ok {
        color: var(--mat-sys-primary);
      }
      .invite-result .warn {
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class Candidates implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();

  readonly columns = ['select', 'fullName', 'email', 'status', 'score', 'reason', 'actions'];

  readonly candidates = signal<CandidateListItem[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly inviting = signal(false);
  readonly selectedFiles = signal<File[]>([]);
  readonly lastResult = signal<ScreenCandidatesResponse | null>(null);
  readonly inviteResult = signal<InviteShortlistResponse | null>(null);
  readonly checked = signal<Set<string>>(new Set());

  filterStatus = '';
  filterMinScore: number | null = null;
  filterSkill = '';

  readonly selectedIds = computed(() => [...this.checked()]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getCandidates(this.campaignId(), {
        status: this.filterStatus || undefined,
        minScore: this.filterMinScore ?? undefined,
        skill: this.filterSkill || undefined,
        sort: 'score',
      })
      .subscribe({
        next: (list) => {
          this.candidates.set(list);
          // Loại bỏ id đã check nhưng không còn trong danh sách.
          const ids = new Set(list.map((c) => c.id));
          this.checked.set(new Set([...this.checked()].filter((id) => ids.has(id))));
          this.loading.set(false);
        },
        error: (e: HttpErrorResponse) => {
          this.loading.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách ứng viên.');
        },
      });
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterMinScore = null;
    this.filterSkill = '';
    this.load();
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFiles.set(input.files ? Array.from(input.files) : []);
  }

  upload(): void {
    const files = this.selectedFiles();
    if (!files.length) return;
    this.uploading.set(true);
    this.api.uploadCandidateCvs(this.campaignId(), files).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.lastResult.set(res);
        this.selectedFiles.set([]);
        this.notify.success(`Đã nhận ${res.received} CV — qua sàng ${res.filtered}, loại ${res.rejected}.`);
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Tải CV thất bại.');
      },
    });
  }

  canInvite(c: CandidateListItem): boolean {
    return INVITABLE.has(c.status);
  }

  isChecked(id: string): boolean {
    return this.checked().has(id);
  }

  toggle(id: string, checked: boolean): void {
    const next = new Set(this.checked());
    if (checked) next.add(id);
    else next.delete(id);
    this.checked.set(next);
  }

  invite(): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.inviting.set(true);
    this.inviteResult.set(null);
    this.api.inviteShortlist(this.campaignId(), { candidateIds: ids }).subscribe({
      next: (res) => {
        this.inviting.set(false);
        this.inviteResult.set(res);
        if (res.invited.length) {
          this.notify.success(`Đã mời ${res.invited.length} ứng viên.`);
        }
        if (res.failed.length) {
          this.notify.warn(`${res.failed.length} lời mời thất bại.`);
        }
        this.checked.set(new Set());
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.inviting.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Mời shortlist thất bại.');
      },
    });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      Filtered: 'Qua sàng',
      Rejected: 'Bị loại',
      Analyzing: 'Đang chấm',
      Analyzed: 'Đã chấm',
      AnalysisFailed: 'Lỗi chấm',
      Invited: 'Đã mời',
    };
    return map[status] ?? status;
  }
}
