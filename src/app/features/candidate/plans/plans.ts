import { Component } from '@angular/core';
import { PlanPricing } from '../../../shared/plans/plan-pricing';
import { PlanAudience } from '../../../core/models';

/** Bảng giá gói cá nhân (B2C): Free · Plus · Pro. Luồng mua dùng chung `app-plan-pricing`. */
@Component({
  selector: 'app-candidate-plans',
  imports: [PlanPricing],
  template: `
    <h1>Gói dịch vụ</h1>
    <p class="lead">Nâng gói để mở phỏng vấn thích ứng, lộ trình ôn tập và hạn mức luyện hằng tháng.</p>
    <app-plan-pricing [audience]="audience" returnBase="/candidate" />
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 24px;
      }
      h1 {
        margin: 0 0 4px;
      }
      .lead {
        margin: 0 0 20px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class CandidatePlans {
  readonly audience = PlanAudience.B2C;
}
