import { DatePipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { MyCampaignDetail } from '../../../core/models';
import { InterviewStatusPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

/** Chi tiết chiến dịch đã join + nút Bắt đầu/Tiếp tục phỏng vấn (POST /campaign/{id}/start). */
@Component({
  selector: 'app-campaign-detail',
  imports: [
    DatePipe,
    PercentPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    InterviewStatusPipe,
    Spinner,
  ],
  templateUrl: './campaign-detail.html',
  styleUrl: './campaign-detail.scss',
})
export class CampaignDetail implements OnInit {
  private api = inject(CampaignApi);
  private router = inject(Router);

  readonly campaignId = input.required<string>();
  readonly detail = signal<MyCampaignDetail | null>(null);
  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);

  readonly completed = computed(() => this.detail()?.interviewStatus === 'Completed');
  /** Đã có session (Start trước đó) → nút hiển thị "Tiếp tục". */
  readonly resumable = computed(() => {
    const d = this.detail();
    return !!d && (d.started || !!d.sessionId || d.interviewStatus === 'InProgress');
  });

  ngOnInit(): void {
    this.api.myCampaign(this.campaignId()).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Start = create-or-get session (idempotent phía backend) → chuyển sang trang thi kèm kết quả. */
  start(): void {
    this.starting.set(true);
    this.startError.set(null);
    this.api.start(this.campaignId()).subscribe({
      next: (res) => {
        this.router.navigate(['/candidate/campaigns', this.campaignId(), 'interview'], {
          state: { start: res },
        });
      },
      error: (e: HttpErrorResponse) => {
        this.starting.set(false);
        if (e.status === 402) {
          this.startError.set(
            'Tổ chức tuyển dụng đã hết lượt phỏng vấn (credit). Vui lòng liên hệ nhà tuyển dụng để được cấp thêm.',
          );
        } else if (e.status === 409) {
          this.startError.set(
            extractErrorMessage(e) ??
              'Không thể bắt đầu: bạn đã hoàn thành phỏng vấn hoặc chiến dịch đã đóng.',
          );
        } else {
          this.startError.set(extractErrorMessage(e) ?? 'Không bắt đầu được phỏng vấn. Thử lại sau.');
        }
      },
    });
  }
}
