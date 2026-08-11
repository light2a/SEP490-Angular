import { Component } from '@angular/core';
import { PlanPricing } from '../../../shared/plans/plan-pricing';
import { PlanAudience } from '../../../core/models';

/**
 * Bảng giá gói doanh nghiệp (B2B): Starter · Business · Enterprise.
 *
 * Gói gắn theo ORG chứ không theo cá nhân HR (AUTH-8/PAY-2) — chủ ví do server suy từ claim `org_id`,
 * FE không truyền gì. Route gác `orgAdminOnly` vì mua gói là money-mutation (AUTH-6: HrMember → 403).
 */
@Component({
  selector: 'app-employer-plans',
  imports: [PlanPricing],
  template: `
    <h1>Gói dịch vụ</h1>
    <p class="lead">
      Gói áp dụng cho toàn tổ chức: số chiến dịch chạy song song, trần ứng viên và số tài khoản HR.
    </p>
    <app-plan-pricing [audience]="audience" returnBase="/employer" />
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
export class EmployerPlans {
  readonly audience = PlanAudience.B2B;
}
