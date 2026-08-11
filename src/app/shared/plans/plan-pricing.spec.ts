import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { environment } from '../../../environments/environment';
import { InterviewFunding, MyPlanResponse, PlanAudience, PublicPlanResponse } from '../../core/models';
import { PlanPricing } from './plan-pricing';

const BASE = `${environment.apiBase}/payment/plans`;

function plan(over: Partial<PublicPlanResponse> = {}): PublicPlanResponse {
  return {
    id: over.code ?? 'p1',
    audience: PlanAudience.B2C,
    code: 'pro',
    name: 'Pro',
    rank: 2,
    interviewFunding: InterviewFunding.Metered,
    monthlyQuota: 100,
    adaptiveEnabled: true,
    adaptiveMaxQuestions: 20,
    adaptiveMaxFollowups: 5,
    groundingEnabled: true,
    selfConsistencyN: 3,
    cvAnalysisIncluded: true,
    repoAnalysisIncluded: true,
    roadmapEnabled: true,
    maxQuestionsCap: 20,
    maxActiveCampaigns: null,
    maxCandidatesCap: null,
    postpaidEligible: false,
    seatCount: null,
    packages: [{ packageId: 'pkg-pro', name: 'Pro tháng', priceVnd: 199000, durationDays: 30 }],
    ...over,
  };
}

function mine(over: Partial<MyPlanResponse> = {}): MyPlanResponse {
  return {
    audience: PlanAudience.B2C,
    tierCode: 'free',
    tierName: 'Free',
    tierRank: 0,
    interviewFunding: InterviewFunding.Credit,
    isPaid: false,
    expiresAt: null,
    monthlyQuota: null,
    quotaUsed: null,
    quotaReserved: null,
    quotaRemaining: null,
    periodStart: null,
    tieringEnabled: true,
    ...over,
  };
}

describe('PlanPricing (bảng giá dùng chung B2C/B2B)', () => {
  let fixture: ComponentFixture<PlanPricing>;
  let httpMock: HttpTestingController;

  function setup(audience: PlanAudience, plans: PublicPlanResponse[], me: MyPlanResponse | 'error') {
    fixture = TestBed.createComponent(PlanPricing);
    fixture.componentRef.setInput('audience', audience);
    fixture.componentRef.setInput('returnBase', '/candidate');
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === BASE).flush(plans);
    const meReq = httpMock.expectOne(`${BASE}/me`);
    if (me === 'error') meReq.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    else meReq.flush(me);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlanPricing],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gọi catalog theo đúng audience được truyền vào', () => {
    fixture = TestBed.createComponent(PlanPricing);
    fixture.componentRef.setInput('audience', PlanAudience.B2B);
    fixture.componentRef.setInput('returnBase', '/employer');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('audience')).toBe('1');
    req.flush([]);
    httpMock.expectOne(`${BASE}/me`).flush(mine());
  });

  /**
   * 🔴 Chưa đăng nhập thì `/plans/me` trả 401 — bảng giá VẪN phải xem được. Nếu lỗi đó làm hỏng trang
   * thì trang bán hàng chỉ người đã đăng nhập mới xem được, tức là chặn đúng nhóm cần thuyết phục nhất.
   */
  it('chưa đăng nhập (me 401) vẫn hiện đủ bảng giá', () => {
    setup(PlanAudience.B2C, [plan()], 'error');

    expect(fixture.componentInstance.plans().length).toBe(1);
    expect(fixture.componentInstance.mine()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pro');
  });

  it('đánh dấu đúng gói đang dùng', () => {
    setup(PlanAudience.B2C, [plan({ code: 'free', rank: 0, packages: [] }), plan()], mine());

    expect(fixture.componentInstance.isCurrent(plan({ code: 'free' }))).toBe(true);
    expect(fixture.componentInstance.isCurrent(plan())).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Đang dùng');
  });

  /** Không có đường hạ cấp có hoàn tiền ⇒ không được mời mua gói thấp hơn gói đang trả tiền. */
  it('gói thấp hơn gói đang dùng bị chặn mua', () => {
    setup(PlanAudience.B2C, [plan()], mine({ tierCode: 'pro', tierRank: 2, isPaid: true }));

    expect(fixture.componentInstance.isLower(plan({ code: 'plus', rank: 1 }))).toBe(true);
    expect(fixture.componentInstance.isLower(plan({ code: 'pro', rank: 2 }))).toBe(false);
  });

  /**
   * 🔴 `Tiering:Enabled=false` = quyền lợi gói CHƯA có hiệu lực lúc chạy. Bán lúc đó là thu tiền cho
   * thứ người mua không dùng được — và không có triệu chứng nào ngoài việc họ khiếu nại.
   */
  it('tiering tắt thì khoá nút mua và báo cho người dùng', () => {
    setup(PlanAudience.B2C, [plan()], mine({ tieringEnabled: false }));

    expect(fixture.componentInstance.tieringEnabled()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('tạm khoá mua');
    const buyBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      'mat-card-actions button',
    );
    expect(buyBtn?.disabled).toBe(true);
  });

  it('hạn mức tháng: hiện số còn lại và tính % đã dùng gồm cả lượt đang giữ', () => {
    setup(
      PlanAudience.B2C,
      [plan()],
      mine({
        tierCode: 'pro',
        tierName: 'Pro',
        tierRank: 2,
        isPaid: true,
        interviewFunding: InterviewFunding.Metered,
        monthlyQuota: 100,
        quotaUsed: 30,
        quotaReserved: 10,
        quotaRemaining: 60,
      }),
    );

    // 100 − 60 = 40 đã tiêu (30 dùng + 10 đang giữ).
    expect(fixture.componentInstance.quotaPercent()).toBe(40);
    expect(fixture.nativeElement.textContent).toContain('60 / 100');
    expect(fixture.nativeElement.textContent).toContain('đã tính vào hạn mức');
  });

  it('gói không bán SKU nào thì không có nút mua', () => {
    setup(PlanAudience.B2C, [plan({ code: 'free', rank: 0, packages: [] })], mine({ tierCode: 'x' }));

    expect(fixture.nativeElement.textContent).toContain('Không cần mua');
  });

  it('mua gói tạo order với packageId + returnUrl theo returnBase', () => {
    setup(PlanAudience.B2C, [plan()], mine());

    fixture.componentInstance.buy(plan().packages[0]);
    const req = httpMock.expectOne(`${environment.apiBase}/payment/order`);
    expect(req.request.body.packageId).toBe('pkg-pro');
    expect(req.request.body.returnUrl).toContain('/candidate/payment/success');
    expect(req.request.body.cancelUrl).toContain('/candidate/payment/cancel');

    // `checkoutUrl` rỗng = nhánh "PayOS không trả link" ⇒ component tải lại bảng giá. Phải flush 2
    // request đó, không thì `verify()` ném TRONG afterEach, TestBed kẹt ở trạng thái đã dựng và mọi
    // test sau (kể cả file khác trong cùng worker vitest) đổ theo với lỗi hoàn toàn lạc đề.
    req.flush({ id: 'o1', checkoutUrl: '' });
    httpMock.expectOne((r) => r.url === BASE).flush([]);
    httpMock.expectOne(`${BASE}/me`).flush(mine());
  });

  it('quyền lợi B2B nói về chiến dịch/ứng viên/ghế, không nói hạn mức luyện', () => {
    const b2b = plan({
      audience: PlanAudience.B2B,
      code: 'business',
      name: 'Business',
      interviewFunding: InterviewFunding.Credit,
      monthlyQuota: null,
      maxActiveCampaigns: 10,
      maxCandidatesCap: 200,
      seatCount: 10,
      postpaidEligible: true,
    });
    setup(PlanAudience.B2B, [b2b], mine({ audience: PlanAudience.B2B, tierCode: 'starter' }));

    const labels = fixture.componentInstance.features(b2b).map((f) => f.label);
    expect(labels).toContain('10 chiến dịch đang chạy');
    expect(labels).toContain('Tối đa 200 ứng viên/chiến dịch');
    expect(labels).toContain('10 tài khoản HR');
    expect(labels.some((l) => l.includes('lượt phỏng vấn/tháng'))).toBe(false);
  });

  it('quyền lợi KHÔNG có vẫn hiện (gạch mờ) để người mua thấy mình thiếu gì', () => {
    const free = plan({
      code: 'free',
      rank: 0,
      interviewFunding: InterviewFunding.Credit,
      monthlyQuota: null,
      adaptiveEnabled: false,
      groundingEnabled: false,
      roadmapEnabled: false,
      cvAnalysisIncluded: false,
      repoAnalysisIncluded: false,
      packages: [],
    });
    setup(PlanAudience.B2C, [free], mine());

    const features = fixture.componentInstance.features(free);
    expect(features.some((f) => !f.included)).toBe(true);
    // Vẫn nằm trong danh sách chứ không bị lọc bỏ.
    expect(features.map((f) => f.label)).toContain('Lộ trình ôn tập');
  });
});
