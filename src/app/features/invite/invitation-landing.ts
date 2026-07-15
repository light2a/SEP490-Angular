import { DatePipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CampaignApi } from '../../core/api/campaign.api';
import { extractErrorMessage } from '../../core/api/http-utils';
import { AuthStore } from '../../core/auth/auth.store';
import { InvitationInfo } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Spinner } from '../../shared/ui/spinner';

/**
 * Landing lời mời phỏng vấn B2B (public, ngoài shell): /invite/:token.
 * Xem metadata → "Tham gia" → backend provision Candidate + trả JWT → lưu session → vào chi tiết chiến dịch.
 */
@Component({
  selector: 'app-invitation-landing',
  imports: [
    DatePipe,
    PercentPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule,
    Spinner,
  ],
  templateUrl: './invitation-landing.html',
  styleUrl: './invitation-landing.scss',
})
export class InvitationLanding implements OnInit {
  private api = inject(CampaignApi);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private notify = inject(NotifyService);

  readonly token = input.required<string>();
  readonly invitation = signal<InvitationInfo | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly joining = signal(false);

  ngOnInit(): void {
    this.api.invitation(this.token()).subscribe({
      next: (inv) => {
        this.invitation.set(inv);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(
          e.status === 404 || e.status === 410
            ? 'Lời mời không tồn tại, đã bị thu hồi hoặc đã hết hạn.'
            : (extractErrorMessage(e) ?? 'Không tải được lời mời. Vui lòng thử lại sau.'),
        );
      },
    });
  }

  join(): void {
    this.joining.set(true);
    this.api.join(this.token()).subscribe({
      next: (res) => {
        // JWT Candidate mới (không có refreshToken) → lưu qua AuthStore để authInterceptor tự gắn.
        this.auth.setAccessOnlySession(res.accessToken);
        this.notify.success('Đã tham gia chiến dịch phỏng vấn.');
        this.router.navigate(['/candidate/campaigns', res.campaignId]);
      },
      error: (e: HttpErrorResponse) => {
        this.joining.set(false);
        this.notify.error(
          extractErrorMessage(e) ?? 'Không tham gia được. Lời mời có thể đã hết hạn.',
        );
      },
    });
  }
}
