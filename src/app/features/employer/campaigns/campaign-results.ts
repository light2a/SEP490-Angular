import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
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
            <!--
              Q12 — thang đo PHẢI hiện rõ ngay tại chỗ nhập. Backend so điểm override TRỰC TIẾP với
              pass_score_pct (0–100) và CỐ Ý không quy đổi hộ (heuristic "score<=10 thì ×10" sẽ âm
              thầm biến điểm 8% thật thành 80% Đạt), nên HR gõ 8 theo thang maxScore=10 sẽ bị hiểu là
              8% → Không đạt oan. Nhắc lại ngưỡng ở đây vì thẻ ngưỡng trên đầu trang đã cuộn khỏi
              tầm nhìn khi form này mở dưới bảng xếp hạng.
            -->
            <p class="scale-note">
              <mat-icon>info</mat-icon>
              <span>
                Nhập theo <strong>thang phần trăm 0–100</strong> (ví dụ 8/10 điểm → nhập
                <strong>80</strong>), <strong>không</strong> nhập theo thang điểm tiêu chí.
                @if (d.passScorePct != null) {
                  Ngưỡng đạt của chiến dịch: <strong>{{ d.passScorePct }}%</strong>.
                } @else {
                  Chiến dịch chưa đặt ngưỡng đạt — hãy chọn kết quả tay ở ô bên cạnh.
                }
              </span>
            </p>
            <div class="edit-row">
              <mat-form-field appearance="outline">
                <mat-label>Điểm mới (%)</mat-label>
                <input matInput type="number" min="0" max="100" step="0.1" [(ngModel)]="editScore" />
                <mat-hint>Thang phần trăm 0–100</mat-hint>
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

      <!--
        R7 — ứng viên CÓ CỜ mà CHƯA được chấm. Nằm NGOÀI nhánh "results rỗng" có chủ đích: buổi bỏ
        ngang không bao giờ được chấm, nên chiến dịch hoàn toàn có thể có 0 dòng xếp hạng mà vẫn có
        người cần HR để mắt. Trước đây bảng chỉ liệt kê người đã chấm ⇒ cờ của đúng nhóm đáng ngờ
        nhất (bỏ ngang giữa chừng) nằm trong DB, nằm trong response, mà HR không bao giờ thấy.
      -->
      @if (unscored().length > 0) {
        <mat-card class="tbl-card unscored">
          <div class="unscored-head">
            <mat-icon>flag</mat-icon>
            <div>
              <h2>Chưa chấm — có cờ đáng chú ý ({{ unscored().length }})</h2>
              <p class="muted">
                Những người này bỏ ngang hoặc đang thi nên chưa có điểm và không nằm trong bảng xếp
                hạng. Cờ là <strong>gợi ý để HR xem lại</strong>, hệ thống không tự loại ai.
              </p>
            </div>
          </div>
          <table mat-table [dataSource]="unscored()">
            <ng-container matColumnDef="candidate">
              <th mat-header-cell *matHeaderCellDef>Ứng viên</th>
              <td mat-cell *matCellDef="let r">
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

            <ng-container matColumnDef="flags">
              <th mat-header-cell *matHeaderCellDef>Cờ gian lận</th>
              <td mat-cell *matCellDef="let r">
                <div class="flags">
                  @for (f of r.flags; track f.type) {
                    <mat-chip class="chip-flag" [matTooltip]="f.note || f.type" highlighted>
                      <mat-icon matChipAvatar>warning</mat-icon>
                      {{ flagLabel(f.type) }} ×{{ f.count }}
                    </mat-chip>
                  }
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="unscoredCols"></tr>
            <tr mat-row *matRowDef="let row; columns: unscoredCols"></tr>
          </table>
        </mat-card>
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
      .unscored {
        margin-top: 24px;
      }
      .unscored-head {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 16px 16px 8px;
      }
      .unscored-head h2 {
        margin: 0;
        font-size: 17px;
      }
      .unscored-head .muted {
        margin: 4px 0 0;
        font-size: 13px;
        max-width: 640px;
      }
      .unscored-head mat-icon {
        color: #b26a00;
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
      /* Q12 — nhắc thang đo: phải đọc được, không phải chú thích mờ cho có. */
      .scale-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 16px;
        padding: 10px 12px;
        border-radius: 8px;
        background: #fff8e1;
        color: #6d4c00;
        font-size: 13px;
        line-height: 1.45;
      }
      .scale-note mat-icon {
        flex: 0 0 auto;
        font-size: 18px;
        width: 18px;
        height: 18px;
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
  readonly unscoredCols = ['candidate', 'flags'];

  /**
   * R7 — `?? []` chứ không bind thẳng: field là additive, deploy backend cũ hơn không gửi nó và
   * `mat-table` sẽ nổ với `undefined`.
   */
  readonly unscored = computed(() => this.data()?.unscoredFlagged ?? []);

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

  /**
   * Q12 — điểm HR chốt là **phần trăm 0–100**, không phải thang điểm tiêu chí. Backend validate
   * cùng dải và trả 400 khi ngoài dải; chặn sẵn ở client để đỡ một vòng request và để câu nhắc
   * thang đo hiện ngay, thay vì hiện thông báo lỗi chung của server.
   */
  private isScoreInPercentRange(v: number): boolean {
    return Number.isFinite(v) && v >= 0 && v <= 100;
  }

  saveOverride(sessionId: string): void {
    if (!this.editNote.trim()) {
      this.notify.warn('Vui lòng nhập lý do điều chỉnh.');
      return;
    }
    // Bỏ trống điểm là hợp lệ (chỉ chốt kết quả Đạt/Không đạt) → chỉ kiểm khi HR có nhập số.
    if (this.editScore != null && !this.isScoreInPercentRange(this.editScore)) {
      this.notify.warn(
        'Điểm phải theo thang phần trăm 0–100 (ví dụ 8/10 điểm → nhập 80).',
      );
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
