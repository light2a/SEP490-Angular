import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { CampaignApi } from '../../../core/api/campaign.api';
import { MyCampaignSummary } from '../../../core/models';
import { InterviewStatusPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** My Campaigns — các chiến dịch tuyển dụng ứng viên đã join (qua magic-link). */
@Component({
  selector: 'app-campaign-list',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatListModule,
    MatIconModule,
    MatChipsModule,
    InterviewStatusPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './campaign-list.html',
})
export class CampaignList {
  private api = inject(CampaignApi);

  readonly campaigns = signal<MyCampaignSummary[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.api.myCampaigns().subscribe({
      next: (list) => {
        this.campaigns.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
