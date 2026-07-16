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
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignResultsResponse } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

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
                <span class="mono" [matTooltip]="r.candidateId">{{ short(r.candidateId) }}</span>
                <span class="mono sub" [matTooltip]="r.sessionId">buổi {{ short(r.sessionId) }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="score">
              <th mat-header-cell *matHeaderCellDef>Điểm</th>
              <td mat-cell *matCellDef="let r">
                <strong>{{ r.totalScore }}</strong>
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
                      <mat-chip class="chip-flag" [matTooltip]="f.note || f.type" highlighted>
                        <mat-icon matChipAvatar>warning</mat-icon>
                        {{ f.type }} ×{{ f.count }}
                      </mat-chip>
                    }
                  </div>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
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
    `,
  ],
})
export class CampaignResults implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();

  readonly data = signal<CampaignResultsResponse | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly cols = ['rank', 'candidate', 'score', 'result', 'scoredAt', 'flags'];

  ngOnInit(): void {
    this.load();
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
