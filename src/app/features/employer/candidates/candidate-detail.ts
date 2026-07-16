import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { CandidateDetailResponse } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Nhãn tiếng Việt cho trạng thái ứng viên. */
const STATUS_LABEL: Record<string, string> = {
  Filtered: 'Qua sàng',
  Rejected: 'Bị loại',
  Analyzing: 'Đang chấm',
  Analyzed: 'Đã chấm',
  AnalysisFailed: 'Lỗi chấm',
  Invited: 'Đã mời',
};

/** Chi tiết 1 ứng viên CV: điểm khớp + điểm/dẫn chứng từng tiêu chí + sửa email/họ tên (C13–C15). */
@Component({
  selector: 'app-candidate-detail',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <a mat-button [routerLink]="['/employer/campaigns', campaignId(), 'candidates']">
        <mat-icon>arrow_back</mat-icon> Quay lại danh sách ứng viên
      </a>

      @if (loading()) {
        <app-spinner [diameter]="36" message="Đang tải chi tiết ứng viên..." />
      } @else if (candidate(); as c) {
        <!-- Thông tin chung -->
        <mat-card class="card">
          <mat-card-content>
            <div class="title-line">
              <h1>{{ c.fullName || '(chưa có tên)' }}</h1>
              <span class="status-chip" [class]="'st-' + c.status">{{ statusLabel(c.status) }}</span>
            </div>
            @if (c.email) {
              <p class="email"><mat-icon>mail</mat-icon>{{ c.email }}</p>
            }

            <div class="grid">
              <div class="item">
                <span class="k">Điểm khớp CV</span>
                <span class="v">{{ c.overallMatchScore != null ? c.overallMatchScore : '—' }}</span>
              </div>
              <div class="item">
                <span class="k">Số năm KN</span>
                <span class="v">{{ c.yearsExperience != null ? c.yearsExperience : '—' }}</span>
              </div>
            </div>

            @if (c.skills?.length) {
              <mat-divider />
              <h3>Kỹ năng</h3>
              <mat-chip-set>
                @for (s of c.skills; track s) {
                  <mat-chip>{{ s }}</mat-chip>
                }
              </mat-chip-set>
            }

            @if (c.summary) {
              <mat-divider />
              <h3>Tóm tắt CV</h3>
              <p class="summary">{{ c.summary }}</p>
            }

            @if (c.rejectReason) {
              <div class="callout warn">
                <mat-icon>warning</mat-icon>
                <div>
                  <strong>Lý do loại</strong>
                  <p>{{ c.rejectReason }}</p>
                </div>
              </div>
            }

            @if (c.cvFileUrl) {
              <mat-divider />
              <p class="cv-key">
                <mat-icon>description</mat-icon>
                <span>CV: {{ c.cvFileUrl }}</span>
                <span class="muted">(khoá lưu trữ S3)</span>
              </p>
            }
          </mat-card-content>
        </mat-card>

        <!-- Điểm theo tiêu chí -->
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Điểm theo tiêu chí ({{ c.criterionScores.length }})</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (!c.criterionScores.length) {
              <p class="muted">Chưa có điểm chấm theo tiêu chí.</p>
            } @else {
              <div class="crit-list">
                @for (cs of c.criterionScores; track cs.criterionId) {
                  <div class="crit">
                    <div class="crit-head">
                      <strong>{{ cs.criterionName }}</strong>
                      <span class="score">{{ cs.matchScore }}/{{ cs.maxScore }}</span>
                    </div>
                    <div class="bar">
                      <div class="bar-fill" [style.width.%]="pct(cs.matchScore, cs.maxScore)"></div>
                    </div>
                    @if (cs.reasoning) {
                      <p class="reasoning">{{ cs.reasoning }}</p>
                    }
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Sửa email / họ tên -->
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Sửa email/họ tên</mat-card-title>
            <mat-card-subtitle>Bổ sung khi CV không tách được thông tin.</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Họ tên</mat-label>
                <input matInput [(ngModel)]="editFullName" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" [(ngModel)]="editEmail" />
              </mat-form-field>
            </div>
            <button mat-flat-button color="primary" [disabled]="busy()" (click)="save()">
              <mat-icon>save</mat-icon> Lưu
            </button>
          </mat-card-content>
        </mat-card>
      } @else {
        <app-empty-state icon="person_off" message="Không tìm thấy ứng viên." />
      }
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
      .title-line {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      h1 {
        margin: 0;
        font-size: 22px;
      }
      h3 {
        margin: 16px 0 8px;
        font-size: 15px;
      }
      .email {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
      .email mat-icon,
      .cv-key mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      .item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .k {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .v {
        font-weight: 600;
        font-size: 18px;
      }
      .summary {
        white-space: pre-wrap;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .callout {
        display: flex;
        gap: 10px;
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 8px;
      }
      .callout.warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .callout p {
        margin: 4px 0 0;
      }
      .cv-key {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 12px 0 0;
        color: var(--mat-sys-on-surface-variant);
        word-break: break-all;
      }
      .crit-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .crit {
        padding: 12px 14px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .crit-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .score {
        font-weight: 600;
        color: var(--mat-sys-primary);
        white-space: nowrap;
      }
      .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--mat-sys-outline-variant);
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        background: var(--mat-sys-primary);
      }
      .reasoning {
        margin: 10px 0 0;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
        white-space: pre-wrap;
      }
      .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .form-row mat-form-field {
        flex: 1 1 220px;
      }
      .status-chip {
        padding: 2px 10px;
        border-radius: 12px;
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
    `,
  ],
})
export class CandidateDetail implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();
  readonly candidateId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly candidate = signal<CandidateDetailResponse | null>(null);

  editFullName = '';
  editEmail = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getCandidate(this.campaignId(), this.candidateId()).subscribe({
      next: (c) => {
        this.candidate.set(c);
        this.editFullName = c.fullName ?? '';
        this.editEmail = c.email ?? '';
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.candidate.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được thông tin ứng viên.');
      },
    });
  }

  statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  pct(score: number, max: number): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.max(0, (score / max) * 100));
  }

  save(): void {
    const body = {
      fullName: this.editFullName.trim() || undefined,
      email: this.editEmail.trim() || undefined,
    };
    this.busy.set(true);
    this.api.patchCandidate(this.campaignId(), this.candidateId(), body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã cập nhật thông tin ứng viên.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ?? 'Ứng viên đã được mời, không sửa được.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Cập nhật thất bại.');
      },
    });
  }
}
