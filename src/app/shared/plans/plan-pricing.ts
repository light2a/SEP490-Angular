import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PaymentApi } from '../../core/api/payment.api';
import { PlanApi } from '../../core/api/plan.api';
import { NotifyService } from '../../core/notify.service';
import {
  InterviewFunding,
  MyPlanResponse,
  PlanAudience,
  PlanPackageOption,
  PublicPlanResponse,
} from '../../core/models';
import { VndPipe } from '../pipes';
import { EmptyState } from '../ui/empty-state';
import { Spinner } from '../ui/spinner';

/** Một dòng quyền lợi để render — gom ở TS cho template khỏi phải chứa logic so sánh gói. */
interface PlanFeature {
  icon: string;
  label: string;
  /** false = gói này KHÔNG có ⇒ hiện mờ + icon gạch, thay vì giấu đi (người mua cần thấy cái mình thiếu). */
  included: boolean;
}

/**
 * Bảng giá gói phân tầng — dùng CHUNG cho B2C (candidate) và B2B (employer).
 *
 * Hai dòng khác nhau đúng ở `audience` + đường quay về sau khi thanh toán, nên tách hai component sẽ đẻ
 * ra hai bản sao của cùng luồng mua và chúng sẽ trôi khỏi nhau (đúng vụ `campaign-form.ts` bị nhân đôi
 * ở vòng 3 §S9 P1). Mọi khác biệt được truyền vào bằng input.
 */
@Component({
  selector: 'app-plan-pricing',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    VndPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './plan-pricing.html',
  styleUrl: './plan-pricing.scss',
})
export class PlanPricing implements OnInit {
  private plansApi = inject(PlanApi);
  private paymentApi = inject(PaymentApi);
  private notify = inject(NotifyService);

  /** Dòng sản phẩm cần hiện: B2C cho candidate, B2B cho employer. */
  readonly audience = input.required<PlanAudience>();
  /** Tiền tố route để dựng returnUrl/cancelUrl PayOS, ví dụ `/candidate` hoặc `/employer`. */
  readonly returnBase = input.required<string>();

  readonly InterviewFunding = InterviewFunding;
  readonly plans = signal<PublicPlanResponse[]>([]);
  readonly mine = signal<MyPlanResponse | null>(null);
  readonly loading = signal(true);
  readonly buying = signal<string | null>(null);

  /**
   * Cờ `Tiering:Enabled` phía server. Mặc định TRUE khi chưa đọc được (chưa đăng nhập / API lỗi) để
   * bảng giá không nhấp nháy sang trạng thái "tạm khoá" trong lúc đang tải; nút Mua vẫn cần đăng nhập
   * nên không có đường mua nhầm.
   */
  readonly tieringEnabled = computed(() => this.mine()?.tieringEnabled ?? true);

  /** Phần trăm hạn mức tháng ĐÃ dùng (gồm cả lượt đang giữ) — để vẽ thanh tiến trình. */
  readonly quotaPercent = computed(() => {
    const me = this.mine();
    if (!me?.monthlyQuota || me.quotaRemaining == null) return null;
    return Math.round(((me.monthlyQuota - me.quotaRemaining) / me.monthlyQuota) * 100);
  });

  /**
   * Tải ở `ngOnInit`, KHÔNG ở constructor: `audience` là required input nên lúc constructor chạy nó
   * chưa được gán ⇒ đọc ra là NG0950, và lỗi đó xảy ra cả ở production chứ không riêng test.
   * (Mẫu `constructor() { this.load(); }` của `credits.ts` chỉ đúng vì component đó không có input.)
   */
  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.plansApi.catalog(this.audience()).subscribe({
      next: (p) => {
        this.plans.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    // Chưa đăng nhập → 401: bảng giá vẫn phải xem được, nên nuốt lỗi thay vì để interceptor phá trang.
    this.plansApi.mine().subscribe({ next: (m) => this.mine.set(m), error: () => this.mine.set(null) });
  }

  isCurrent(plan: PublicPlanResponse): boolean {
    return this.mine()?.tierCode === plan.code;
  }

  /**
   * Gói nền ai cũng đang có (`free` / `starter`, `rank = 0`) — thứ duy nhất đúng nghĩa "miễn phí".
   *
   * Phân biệt bằng `rank` chứ không bằng "có SKU hay không": gói TRẢ PHÍ chưa được admin tạo SKU cũng
   * có `packages` rỗng, mà gộp hai ca đó lại thì `plus`/`pro` hiện "Miễn phí — không cần mua", tức là
   * vừa nói sai giá vừa khiến người dùng tưởng mình đã có sẵn quyền lợi của gói.
   */
  isFreeTier(plan: PublicPlanResponse): boolean {
    return plan.rank === 0;
  }

  /** Gói thấp hơn gói đang dùng: không cho "mua lùi" vì hệ thống không có đường hạ cấp có hoàn tiền. */
  isLower(plan: PublicPlanResponse): boolean {
    const me = this.mine();
    return me != null && plan.rank < me.tierRank;
  }

  /** Quyền lợi hiện trên thẻ. Thứ tự cố định để mắt so hàng ngang giữa các gói. */
  features(plan: PublicPlanResponse): PlanFeature[] {
    const common: PlanFeature[] = [
      {
        icon: 'psychology',
        label: plan.adaptiveEnabled
          ? `Phỏng vấn thích ứng${plan.adaptiveMaxQuestions ? ` (tối đa ${plan.adaptiveMaxQuestions} câu)` : ''}`
          : 'Phỏng vấn thích ứng',
        included: plan.adaptiveEnabled,
      },
      {
        icon: 'menu_book',
        label: plan.groundingEnabled ? 'Câu hỏi có trích nguồn' : 'Câu hỏi có trích nguồn',
        included: plan.groundingEnabled,
      },
    ];

    if (plan.audience === PlanAudience.B2C) {
      return [
        {
          icon: 'confirmation_number',
          label:
            plan.interviewFunding === InterviewFunding.Metered && plan.monthlyQuota
              ? `${plan.monthlyQuota} lượt phỏng vấn/tháng`
              : plan.interviewFunding === InterviewFunding.Unlimited
                ? 'Phỏng vấn không giới hạn'
                : 'Trừ credit trong ví',
          included: true,
        },
        ...common,
        { icon: 'map', label: 'Lộ trình ôn tập', included: plan.roadmapEnabled },
        { icon: 'description', label: 'Phân tích CV', included: plan.cvAnalysisIncluded },
        { icon: 'code', label: 'Phân tích repo GitHub', included: plan.repoAnalysisIncluded },
      ];
    }

    return [
      {
        icon: 'work',
        label: plan.maxActiveCampaigns
          ? `${plan.maxActiveCampaigns} chiến dịch đang chạy`
          : 'Chiến dịch không giới hạn',
        included: true,
      },
      {
        icon: 'groups',
        label: plan.maxCandidatesCap
          ? `Tối đa ${plan.maxCandidatesCap} ứng viên/chiến dịch`
          : 'Ứng viên không giới hạn',
        included: true,
      },
      {
        icon: 'badge',
        label: plan.seatCount ? `${plan.seatCount} tài khoản HR` : 'Tài khoản HR không giới hạn',
        included: true,
      },
      ...common,
      { icon: 'schedule', label: 'Trả sau (xuất hoá đơn cuối kỳ)', included: plan.postpaidEligible },
    ];
  }

  buy(option: PlanPackageOption): void {
    this.buying.set(option.packageId);
    const origin = window.location.origin;
    const base = this.returnBase();
    this.paymentApi
      .createOrder({
        packageId: option.packageId,
        returnUrl: `${origin}${base}/payment/success`,
        cancelUrl: `${origin}${base}/payment/cancel`,
      })
      .subscribe({
        next: (order) => {
          this.buying.set(null);
          if (order.checkoutUrl) {
            window.location.href = order.checkoutUrl;
          } else {
            this.notify.warn('Không nhận được link thanh toán.');
            this.load();
          }
        },
        error: () => this.buying.set(null),
      });
  }
}
