import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import {
  CampaignResultRow,
  CampaignResultsResponse,
  proctorSignalLabel,
} from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';
import {
  SessionTranscriptDialog,
  SessionTranscriptDialogData,
} from './session-transcript-dialog';

/** Kết quả + xếp hạng ứng viên của 1 campaign (E5/E6) — chỉ thành viên org sở hữu. */
@Component({
  selector: 'app-campaign-results',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="head">
      <a mat-button [routerLink]="['/employer/campaigns', campaignId()]">
        <mat-icon>arrow_back</mat-icon> Quay lại
      </a>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải kết quả…" />
    } @else if (data(); as d) {
      <div class="summary">
        <h1>Kết quả & Xếp hạng</h1>
        <div class="stats">
          <mat-card class="stat">
            <div class="num">{{ d.totalCandidates }}</div>
            <div class="lbl">Ứng viên đã chấm</div>
          </mat-card>
          <mat-card class="stat">
            <div class="num">{{ d.passScorePct != null ? d.passScorePct + '%' : 'HR tự quyết' }}</div>
            <div class="lbl">Ngưỡng đạt</div>
          </mat-card>
        </div>
        <button
          mat-flat-button
          color="primary"
          (click)="exportCsv()"
          [disabled]="exporting() || d.results.length === 0"
        >
          <mat-icon>download</mat-icon> Xuất CSV
        </button>
      </div>

      @if (d.results.length === 0) {
        <app-empty-state icon="leaderboard" message="Chưa có ứng viên nào được chấm" />
      } @else {
        <mat-card class="tbl-card">
          <table mat-table [dataSource]="d.results">
            <ng-container matColumnDef="rank">
              <th mat-header-cell *matHeaderCellDef>Hạng</th>
              <td mat-cell *matCellDef="let r">{{ r.rank }}</td>
            </ng-container>

            <ng-container matColumnDef="candidate">
              <th mat-header-cell *matHeaderCellDef>Ứng viên</th>
              <td mat-cell *matCellDef="let r">
                <!-- F5: ưu tiên tên/email đọc được; chưa có (membership đường-1 cũ) → về UUID như trước. -->
                @if (r.fullName || r.email) {
                  <span>{{ r.fullName || r.email }}</span>
                  @if (r.fullName && r.email) {
                    <span class="sub">{{ r.email }}</span>
                  }
                } @else {
                  <span class="mono" [matTooltip]="r.candidateId">{{ short(r.candidateId) }}</span>
                }
                <span class="mono sub" [matTooltip]="r.sessionId">buổi {{ short(r.sessionId) }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="score">
              <th mat-header-cell *matHeaderCellDef>Điểm</th>
              <td mat-cell *matCellDef="let r">
                <strong>{{ r.totalScore }}</strong>
                @if (r.overrideScore != null || r.overrideResult) {
                  <mat-chip
                    class="chip-hr"
                    [matTooltip]="'Điểm AI gốc: ' + r.aiScore + (r.overrideNote ? ' · ' + r.overrideNote : '')"
                    highlighted
                    >HR chỉnh</mat-chip
                  >
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="result">
              <th mat-header-cell *matHeaderCellDef>Kết quả</th>
              <td mat-cell *matCellDef="let r">
                @if (r.result === 'Pass') {
                  <mat-chip class="chip-pass" highlighted>Đạt</mat-chip>
                } @else if (r.result === 'Fail') {
                  <mat-chip class="chip-fail" highlighted>Không đạt</mat-chip>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="scoredAt">
              <th mat-header-cell *matHeaderCellDef>Chấm lúc</th>
              <td mat-cell *matCellDef="let r">{{ r.scoredAt | date: 'short' }}</td>
            </ng-container>

            <ng-container matColumnDef="flags">
              <th mat-header-cell *matHeaderCellDef>Cờ gian lận</th>
              <td mat-cell *matCellDef="let r">
                @if (r.flags.length === 0) {
                  <span class="muted">—</span>
                } @else {
                  <div class="flags">
                    @for (f of r.flags; track f.type) {
                      <!-- F4: nhãn tiếng Việt; tooltip giữ mã thô để HR đối chiếu với log/BE. -->
                      <mat-chip
                        class="chip-flag"
                        [matTooltip]="f.note || f.type"
                        highlighted
                      >
                        <mat-icon matChipAvatar>warning</mat-icon>
                        {{ flagLabel(f.type) }} ×{{ f.count }}
                      </mat-chip>
                    }
                  </div>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Thao tác</th>
              <td mat-cell *matCellDef="let r">
                <button
                  mat-button
                  matTooltip="Xem transcript + lý do AI chấm điểm"
                  (click)="openTranscript(r)"
                >
                  <mat-icon>record_voice_over</mat-icon> Transcript
                </button>
                <button mat-button (click)="startEdit(r)">
                  <mat-icon>tune</mat-icon> Điều chỉnh
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
        </mat-card>

        @if (editing(); as sid) {
          <mat-card class="edit-card">
            <h3>Điều chỉnh kết quả (HR chốt) — buổi {{ short(sid) }}</h3>
            <p class="hint">Điểm AI = gợi ý. Bỏ trống điểm + kết quả và bấm "Về AI" để huỷ điều chỉnh.</p>
            <div class="edit-row">
              <mat-form-field appearance="outline">
                <mat-label>Điểm mới</mat-label>
                <input matInput type="number" [(ngModel)]="editScore" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Kết quả</mat-label>
                <mat-select [(ngModel)]="editResult">
                  <mat-option [value]="''">— giữ theo ngưỡng —</mat-option>
                  <mat-option value="Pass">Đạt</mat-option>
                  <mat-option value="Fail">Không đạt</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Lý do điều chỉnh (bắt buộc)</mat-label>
              <input matInput [(ngModel)]="editNote" />
            </mat-form-field>
            <div class="edit-actions">
              <button mat-flat-button color="primary" [disabled]="saving()" (click)="saveOverride(sid)">
                Lưu điều chỉnh
              </button>
              <button mat-stroked-button [disabled]="saving()" (click)="clearOverride(sid)">Về AI</button>
              <button mat-button [disabled]="saving()" (click)="cancelEdit()">Huỷ</button>
            </div>
          </mat-card>
        }
      }
    }
  `,
  styles: [
    `
      .head {
        margin-bottom: 8px;
      }
      .summary {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }
      .summary h1 {
        margin: 0;
        flex: 1 1 100%;
      }
      .stats {
        display: flex;
        gap: 12px;
      }
      .stat {
        padding: 12px 20px;
        text-align: center;
      }
      .stat .num {
        font-size: 24px;
        font-weight: 600;
      }
      .stat .lbl {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tbl-card {
        overflow-x: auto;
      }
      table {
        width: 100%;
      }
      .mono {
        font-family: monospace;
      }
      .sub {
        display: block;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .flags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .chip-pass {
        --mdc-chip-label-text-color: #fff;
        background: #2e7d32;
      }
      .chip-fail {
        --mdc-chip-label-text-color: #fff;
        background: var(--mat-sys-error);
      }
      .chip-flag {
        --mdc-chip-label-text-color: #7a4f00;
        background: #ffecb3;
      }
      .chip-hr {
        --mdc-chip-label-text-color: #4a148c;
        background: #e1bee7;
        margin-left: 6px;
        font-size: 11px;
      }
      .edit-card {
        margin-top: 16px;
        padding: 20px;
        max-width: 560px;
      }
      .edit-card h3 {
        margin: 0 0 4px;
      }
      .edit-card .hint {
        margin: 0 0 12px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .edit-row {
        display: flex;
        gap: 12px;
      }
      .edit-row mat-form-field {
        flex: 1;
      }
      .full {
        width: 100%;
      }
      .edit-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class CampaignResults implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly campaignId = input.required<string>();

  readonly data = signal<CampaignResultsResponse | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly cols = ['rank', 'candidate', 'score', 'result', 'scoredAt', 'flags', 'actions'];

  /** F4 — nhãn tiếng Việt của cờ gian lận; loại lạ → giữ nguyên mã thô. */
  flagLabel(type: string): string {
    return proctorSignalLabel(type);
  }

  // E11b — override inline form state
  readonly editing = signal<string | null>(null);
  editScore: number | null = null;
  editResult = '';
  editNote = '';
  readonly saving = signal(false);

  ngOnInit(): void {
    this.load();
  }

  /**
   * AI4 — mở transcript + dẫn chứng AI của buổi trên dòng đang xem. Dialog (không đổi route) để
   * HR đọc xong là đóng lại, giữ nguyên bảng xếp hạng + form điều chỉnh đang mở dở.
   */
  openTranscript(r: CampaignResultRow): void {
    const data: SessionTranscriptDialogData = {
      campaignId: this.campaignId(),
      sessionId: r.sessionId,
      candidateId: r.candidateId,
    };
    this.dialog.open(SessionTranscriptDialog, { data, width: '760px', maxWidth: '95vw' });
  }

  startEdit(r: CampaignResultRow): void {
    this.editing.set(r.sessionId);
    this.editScore = r.overrideScore ?? null;
    this.editResult = r.overrideResult ?? '';
    this.editNote = r.overrideNote ?? '';
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  saveOverride(sessionId: string): void {
    if (!this.editNote.trim()) {
      this.notify.warn('Vui lòng nhập lý do điều chỉnh.');
      return;
    }
    this.saving.set(true);
    this.api
      .overrideResult(this.campaignId(), sessionId, {
        score: this.editScore,
        result: this.editResult || null,
        note: this.editNote.trim(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(null);
          this.notify.success('Đã lưu điều chỉnh.');
          this.load();
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Lưu điều chỉnh thất bại.');
        },
      });
  }

  clearOverride(sessionId: string): void {
    this.saving.set(true);
    this.api
      .overrideResult(this.campaignId(), sessionId, {
        score: null,
        result: null,
        note: this.editNote.trim() || 'Huỷ điều chỉnh',
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(null);
          this.notify.success('Đã về điểm AI.');
          this.load();
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Thao tác thất bại.');
        },
      });
  }

  load(): void {
    this.loading.set(true);
    this.api.getResults(this.campaignId()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được kết quả.');
      },
    });
  }

  short(id: string): string {
    return id ? id.slice(0, 8) : '';
  }

  exportCsv(): void {
    this.exporting.set(true);
    this.api.exportResults(this.campaignId(), 'csv').subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaign-${this.campaignId()}-results.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e: HttpErrorResponse) => {
        this.exporting.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Xuất CSV thất bại.');
      },
    });
  }
}
