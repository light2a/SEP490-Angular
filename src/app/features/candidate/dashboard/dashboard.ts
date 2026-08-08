import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { CampaignApi } from '../../../core/api/campaign.api';
import { PaymentApi } from '../../../core/api/payment.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { MyCampaignSummary, PracticeSessionSummary } from '../../../core/models';
import { JobCategoryPipe, SessionStatusPipe } from '../../../shared/pipes';

interface QuickAction {
  path: string;
  icon: string;
  title: string;
  desc: string;
}

/** Số buổi luyện gần nhất hiện trên tổng quan — đủ để "đi tiếp việc đang dở", không phải trang lịch sử. */
const RECENT_LIMIT = 5;

/**
 * Tổng quan của ứng viên.
 *
 * Trước đây trang này là 7 thẻ điều hướng TĨNH, không gọi API nào — mở lên không biết mình còn bao
 * nhiêu credit, buổi luyện dở nằm đâu, có lời mời phỏng vấn nào không. Nay kéo về ba số liệu thật.
 *
 * Mọi lời gọi đều HỎNG ĐỘC LẬP: một API chết chỉ làm mất đúng ô của nó, các thẻ điều hướng và phần
 * còn lại vẫn dùng được. Tổng quan mà trắng trang vì một endpoint phụ là hỏng nặng hơn hẳn cái nó
 * định chữa.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatListModule,
    JobCategoryPipe,
    SessionStatusPipe,
  ],
  templateUrl: './dashboard.html',
  styles: [
    `
      h1 {
        margin: 0 0 4px;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 24px;
      }
      h2 {
        margin: 28px 0 12px;
        font-size: 18px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-bottom: 8px;
      }
      .stat {
        padding: 18px 20px;
      }
      .stat-label {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 500;
        line-height: 1.2;
      }
      .stat-note {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .stat-note.warn {
        color: var(--mat-sys-error);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 16px;
      }
      .card {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        padding: 20px;
        cursor: pointer;
        transition: box-shadow 0.15s;
      }
      .card:hover {
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
      }
      .card mat-icon {
        color: var(--mat-sys-primary);
        font-size: 32px;
        height: 32px;
        width: 32px;
      }
      h3 {
        margin: 0 0 4px;
      }
      .body p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
        padding: 8px 0 0;
      }
      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 16px;
      }
      .list-card {
        padding: 8px 4px;
      }
      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px 0;
      }
      .list-head h2 {
        margin: 0;
      }
    `,
  ],
})
export class Dashboard {
  private auth = inject(AuthStore);
  private paymentApi = inject(PaymentApi);
  private practiceApi = inject(PracticeApi);
  private campaignApi = inject(CampaignApi);

  readonly name = this.auth.displayName;

  /** `null` = chưa đọc được số dư (API lỗi) — KHÁC "0 credit", nên hiển thị khác nhau. */
  readonly credits = signal<number | null>(null);
  readonly sessions = signal<PracticeSessionSummary[]>([]);
  readonly campaigns = signal<MyCampaignSummary[]>([]);
  readonly loadingCredits = signal(true);
  readonly loadingSessions = signal(true);
  readonly loadingCampaigns = signal(true);

  readonly recentSessions = computed(() => this.sessions().slice(0, RECENT_LIMIT));

  /**
   * Chiến dịch còn phải làm = chưa phỏng vấn xong. Đó mới là thứ cần nhắc trên tổng quan; cái đã
   * `Completed` chỉ là lịch sử, để ở trang chiến dịch.
   */
  readonly openCampaigns = computed(() =>
    this.campaigns().filter((c) => c.interviewStatus !== 'Completed'),
  );

  constructor() {
    this.paymentApi.myAccount().subscribe({
      next: (a) => {
        this.credits.set(a.remainingCredits);
        this.loadingCredits.set(false);
      },
      error: () => {
        this.credits.set(null);
        this.loadingCredits.set(false);
      },
    });

    this.practiceApi.history().subscribe({
      next: (h) => {
        this.sessions.set(h);
        this.loadingSessions.set(false);
      },
      error: () => this.loadingSessions.set(false),
    });

    // Ứng viên B2C thuần vẫn gọi được (trả mảng rỗng); lỗi ở đây chỉ ẩn ô chiến dịch.
    this.campaignApi.myCampaigns().subscribe({
      next: (c) => {
        this.campaigns.set(c);
        this.loadingCampaigns.set(false);
      },
      error: () => this.loadingCampaigns.set(false),
    });
  }

  readonly actions: QuickAction[] = [
    { path: '/candidate/practice', icon: 'mic', title: 'Luyện phỏng vấn', desc: 'Tạo buổi luyện, AI hỏi & chấm điểm' },
    { path: '/candidate/files', icon: 'description', title: 'CV / JD', desc: 'Tải lên và quản lý CV, JD (PDF)' },
    { path: '/candidate/cv-analysis', icon: 'insights', title: 'Phân tích CV', desc: 'AI đánh giá CV, khớp JD' },
    { path: '/candidate/repo-analysis', icon: 'code', title: 'Phân tích repo GitHub', desc: 'AI đọc repo public, gợi ý cách kể khi phỏng vấn' },
    { path: '/candidate/roadmaps', icon: 'map', title: 'Lộ trình ôn', desc: 'Roadmap cá nhân hoá theo điểm yếu' },
    { path: '/candidate/rubrics', icon: 'rule', title: 'Tiêu chí chấm', desc: 'Tuỳ chỉnh rubric theo nhóm nghề' },
    { path: '/candidate/credits', icon: 'account_balance_wallet', title: 'Credit', desc: 'Mua & xem lịch sử thanh toán' },
  ];
}
