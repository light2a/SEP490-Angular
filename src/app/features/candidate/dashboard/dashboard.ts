import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthStore } from '../../../core/auth/auth.store';

interface QuickAction {
  path: string;
  icon: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule],
  template: `
    <h1>Xin chào{{ name() ? ', ' + name() : '' }} 👋</h1>
    <p class="sub">Bắt đầu luyện phỏng vấn hoặc phân tích CV của bạn.</p>

    <div class="grid">
      @for (a of actions; track a.path) {
        <mat-card class="card" [routerLink]="a.path">
          <mat-icon>{{ a.icon }}</mat-icon>
          <div class="body">
            <h3>{{ a.title }}</h3>
            <p>{{ a.desc }}</p>
          </div>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      h1 {
        margin: 0 0 4px;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 24px;
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
      mat-icon {
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
    `,
  ],
})
export class Dashboard {
  private auth = inject(AuthStore);
  readonly name = this.auth.displayName;

  readonly actions: QuickAction[] = [
    { path: '/candidate/practice', icon: 'mic', title: 'Luyện phỏng vấn', desc: 'Tạo buổi luyện, AI hỏi & chấm điểm' },
    { path: '/candidate/files', icon: 'description', title: 'CV / JD', desc: 'Tải lên và quản lý CV, JD (PDF)' },
    { path: '/candidate/cv-analysis', icon: 'insights', title: 'Phân tích CV', desc: 'AI đánh giá CV, khớp JD' },
    { path: '/candidate/roadmaps', icon: 'map', title: 'Lộ trình ôn', desc: 'Roadmap cá nhân hoá theo điểm yếu' },
    { path: '/candidate/rubrics', icon: 'rule', title: 'Tiêu chí chấm', desc: 'Tuỳ chỉnh rubric theo nhóm nghề' },
    { path: '/candidate/credits', icon: 'account_balance_wallet', title: 'Credit', desc: 'Mua & xem lịch sử thanh toán' },
  ];
}
