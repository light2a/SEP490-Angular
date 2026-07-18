import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignApi } from '../../../core/api/campaign.api';
import { NotifyService } from '../../../core/notify.service';
import {
  CampaignResponse,
  CampaignStatus,
  CreateInvitationsResponse,
} from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

const STATUS_LABEL: Record<CampaignStatus, string> = {
  Draft: 'Nháp',
  Active: 'Đang chạy',
  Closed: 'Đã đóng',
  Archived: 'Lưu trữ',
};

@Component({
  selector: 'app-campaign-detail',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    Spinner,
  ],
  template: `
    <div class="head">
      <button mat-icon-button routerLink="/employer/campaigns" aria-label="Quay lại">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h1>Chi tiết chiến dịch</h1>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải..." />
    } @else if (campaign(); as c) {
      <mat-card class="section">
        <div class="title-line">
          <h2>{{ c.title }}</h2>
          <span class="chip" [class]="c.status.toLowerCase()">{{ statusLabel(c.status) }}</span>
        </div>
        @if (c.domain) {
          <p class="domain"><mat-icon>work</mat-icon>{{ c.domain }}</p>
        }

        <div class="grid">
          <div class="item">
            <span class="k">Số ứng viên tối đa</span>
            <span class="v">{{ c.maxCandidates ?? '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Thời gian mỗi câu</span>
            <span class="v">{{ c.timeLimitMinutes ? c.timeLimitMinutes + ' phút' : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Điểm đạt</span>
            <span class="v">{{ c.passScorePct != null ? c.passScorePct + '%' : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Chống gian lận</span>
            <span class="v">{{ c.antiCheatEnabled ? 'Bật' : 'Tắt' }}</span>
          </div>
          <div class="item">
            <span class="k">Xác thực khuôn mặt</span>
            <span class="v">{{ c.faceVerifyEnabled ? 'Bật' : 'Tắt' }}</span>
          </div>
          <div class="item">
            <span class="k">Phỏng vấn thích ứng</span>
            <span class="v">
              {{ c.adaptiveEnabled ? 'Bật' : 'Tắt' }}
              @if (c.adaptiveEnabled) {
                · tối đa {{ c.maxFollowUps ?? '—' }} câu hỏi thêm, {{ c.maxQuestions ?? '—' }} tổng
              }
            </span>
          </div>
          <div class="item">
            <span class="k">Bắt đầu</span>
            <span class="v">{{ c.startsAt ? (c.startsAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Kết thúc</span>
            <span class="v">{{ c.expiresAt ? (c.expiresAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Tạo lúc</span>
            <span class="v">{{ c.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>
        </div>

        @if (c.jdText) {
          <mat-divider />
          <h3>Mô tả công việc (JD)</h3>
          <p class="jd">{{ c.jdText }}</p>
        }
      </mat-card>

      <mat-card class="section">
        <h3>Tiêu chí đánh giá ({{ c.criteria.length }})</h3>
        @if (c.criteria.length === 0) {
          <p class="muted">Chưa có tiêu chí.</p>
        } @else {
          <div class="crit-list">
            @for (cr of c.criteria; track cr.id) {
              <div class="crit">
                <div class="crit-main">
                  <strong>{{ cr.name }}</strong>
                  @if (cr.description) {
                    <span class="muted">{{ cr.description }}</span>
                  }
                </div>
                <div class="crit-meta">
                  <span class="pct">{{ (cr.weight * 100).toFixed(0) }}%</span>
                  <span class="muted">tối đa {{ cr.maxScore }}</span>
                </div>
              </div>
            }
          </div>
        }
      </mat-card>

      <mat-card class="section">
        <h3>Câu hỏi ({{ c.questions.length }})</h3>
        @if (c.questions.length === 0) {
          <p class="muted">Chưa có câu hỏi.</p>
        } @else {
          <ol class="q-list">
            @for (q of c.questions; track q.id) {
              <li>
                {{ q.questionText }}
                @if (q.isRequired) {
                  <span class="req">Bắt buộc</span>
                }
              </li>
            }
          </ol>
        }
      </mat-card>

      <!-- Actions theo trạng thái -->
      @if (c.status === 'Draft') {
        <mat-card class="section actions-card">
          <a mat-flat-button color="primary" [routerLink]="['/employer/campaigns', c.id, 'edit']">
            <mat-icon>edit</mat-icon>
            Sửa
          </a>
          @if (confirmPublish()) {
            <span class="confirm">
              Xuất bản chiến dịch? Sau khi xuất bản không sửa được tiêu chí/câu hỏi.
              <button mat-flat-button color="primary" [disabled]="busy()" (click)="publish()">
                Xác nhận
              </button>
              <button mat-button (click)="confirmPublish.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="primary" (click)="confirmPublish.set(true)">
              <mat-icon>publish</mat-icon>
              Xuất bản
            </button>
          }
          @if (confirmDelete()) {
            <span class="confirm">
              Xoá chiến dịch này?
              <button mat-flat-button color="warn" [disabled]="busy()" (click)="remove()">
                Xoá
              </button>
              <button mat-button (click)="confirmDelete.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="warn" (click)="confirmDelete.set(true)">
              <mat-icon>delete</mat-icon>
              Xoá
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Active') {
        <mat-card class="section">
          <h3>Mời ứng viên</h3>
          <p class="muted">Nhập danh sách email, mỗi email 1 dòng hoặc cách nhau bởi dấu phẩy.</p>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Email ứng viên</mat-label>
            <textarea
              matInput
              rows="3"
              [(ngModel)]="emailsText"
              placeholder="a@example.com&#10;b@example.com"
            ></textarea>
          </mat-form-field>
          <button mat-flat-button color="primary" [disabled]="busy()" (click)="invite()">
            <mat-icon>send</mat-icon>
            Gửi lời mời
          </button>

          @if (inviteResult(); as r) {
            @if (r.created.length > 0) {
              <div class="res-block">
                <strong>Đã mời ({{ r.created.length }})</strong>
                @for (inv of r.created; track inv.id) {
                  <div class="res-row">
                    <span>{{ inv.email }}</span>
                    <button
                      mat-button
                      [disabled]="busy()"
                      (click)="reissue(c.id, inv.id)"
                    >
                      Gửi lại
                    </button>
                  </div>
                }
              </div>
            }
            @if (r.failed.length > 0) {
              <div class="res-block fail">
                <strong>Thất bại ({{ r.failed.length }})</strong>
                @for (f of r.failed; track f.email) {
                  <div class="res-row">
                    <span>{{ f.email }}</span>
                    <span class="muted">{{ f.reason }}</span>
                  </div>
                }
              </div>
            }
          }
        </mat-card>

        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'candidates']">
            <mat-icon>filter_alt</mat-icon>
            Lọc CV
          </a>
          @if (confirmClose()) {
            <span class="confirm">
              Đóng chiến dịch?
              <button mat-flat-button color="warn" [disabled]="busy()" (click)="transition('Closed')">
                Đóng
              </button>
              <button mat-button (click)="confirmClose.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="warn" (click)="confirmClose.set(true)">
              <mat-icon>lock</mat-icon>
              Đóng chiến dịch
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Closed') {
        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
          @if (confirmArchive()) {
            <span class="confirm">
              Lưu trữ chiến dịch?
              <button
                mat-flat-button
                color="primary"
                [disabled]="busy()"
                (click)="transition('Archived')"
              >
                Lưu trữ
              </button>
              <button mat-button (click)="confirmArchive.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button (click)="confirmArchive.set(true)">
              <mat-icon>inventory_2</mat-icon>
              Lưu trữ
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Archived') {
        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
        </mat-card>
      }
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
      }
      .section {
        padding: 20px;
        margin-bottom: 16px;
      }
      h2 {
        margin: 0;
      }
      h3 {
        margin: 16px 0 12px;
        font-size: 16px;
      }
      .section h3:first-child {
        margin-top: 0;
      }
      .title-line {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .domain {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
      .domain mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
        font-weight: 500;
      }
      .jd {
        white-space: pre-wrap;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .crit-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .crit {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .crit-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .crit-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pct {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .q-list {
        margin: 0;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .req {
        font-size: 11px;
        margin-left: 8px;
        padding: 1px 8px;
        border-radius: 10px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .actions-card {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .confirm {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .full {
        width: 100%;
      }
      .res-block {
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .res-block.fail strong {
        color: var(--mat-sys-error);
      }
      .res-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .chip {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 10px;
        border-radius: 12px;
        white-space: nowrap;
      }
      .chip.draft {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.closed {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .chip.archived {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-outline);
      }
    `,
  ],
})
export class CampaignDetail implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly campaignId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly campaign = signal<CampaignResponse | null>(null);

  readonly confirmPublish = signal(false);
  readonly confirmDelete = signal(false);
  readonly confirmClose = signal(false);
  readonly confirmArchive = signal(false);

  emailsText = '';
  readonly inviteResult = signal<CreateInvitationsResponse | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getCampaign(this.campaignId()).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
    });
  }

  statusLabel(s: CampaignStatus): string {
    return STATUS_LABEL[s];
  }

  publish(): void {
    this.busy.set(true);
    this.api.publishCampaign(this.campaignId()).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.confirmPublish.set(false);
        this.campaign.set(c);
        this.notify.success('Đã xuất bản chiến dịch.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Xuất bản thất bại.');
      },
    });
  }

  remove(): void {
    this.busy.set(true);
    this.api.deleteCampaign(this.campaignId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã xoá chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Xoá thất bại.');
      },
    });
  }

  transition(status: 'Closed' | 'Archived'): void {
    this.busy.set(true);
    this.api.transitionStatus(this.campaignId(), { status }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.confirmClose.set(false);
        this.confirmArchive.set(false);
        this.campaign.set(c);
        this.notify.success(status === 'Closed' ? 'Đã đóng chiến dịch.' : 'Đã lưu trữ chiến dịch.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Đổi trạng thái thất bại.');
      },
    });
  }

  private parseEmails(): string[] {
    return this.emailsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  invite(): void {
    const emails = this.parseEmails();
    if (emails.length === 0) {
      this.notify.warn('Nhập ít nhất 1 email.');
      return;
    }
    this.busy.set(true);
    this.api.createInvitations(this.campaignId(), { emails }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.inviteResult.set(r);
        this.emailsText = '';
        if (r.created.length > 0) this.notify.success(`Đã mời ${r.created.length} ứng viên.`);
        if (r.failed.length > 0) this.notify.warn(`${r.failed.length} email không mời được.`);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Gửi lời mời thất bại.');
      },
    });
  }

  reissue(campaignId: string, invitationId: string): void {
    this.busy.set(true);
    this.api.reissueInvitation(campaignId, invitationId).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã gửi lại lời mời.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Gửi lại thất bại.');
      },
    });
  }
}
