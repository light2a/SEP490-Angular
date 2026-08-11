import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminPackages } from './packages';
import { NotifyService } from '../../../core/notify.service';
import { environment } from '../../../../environments/environment';

const PACKAGES = `${environment.apiBase}/payment/package`;
/** Catalog gói dịch vụ — nguồn cho ô "Gói dịch vụ áp dụng" của SKU định kỳ. */
const PLANS = `${environment.apiBase}/payment/admin/plans`;

/**
 * F24 — bảng 8 cột (rộng nhất trong nhóm admin) phải cuộn ngang TRONG khung của nó. Kiểm bằng
 * CẤU TRÚC DOM chứ không đo pixel: jsdom không layout thật nên số đo ở đây là tự lừa mình.
 */
describe('AdminPackages — F24 bảng cuộn ngang trong khung', () => {
  let httpMock: HttpTestingController;

  afterEach(() => httpMock.verify());

  it('bảng nằm trong khung .tbl-wrap', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminPackages);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === PACKAGES).flush([
      {
        id: 'p1',
        name: 'Gói 10 lượt',
        type: 'OneTime',
        priceVnd: 200000,
        interviewCredits: 10,
        durationDays: null,
        isActive: true,
        createdAt: '2026-08-07T00:00:00Z',
      },
    ]);
    httpMock.expectOne((r) => r.url === PLANS).flush([]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const table = host.querySelector('table[mat-table]');
    expect(table).not.toBeNull();
    const wrap = table!.closest('.tbl-wrap');
    expect(wrap).not.toBeNull();

    // Khung bọc phải THẬT SỰ cuộn được (mặc định của overflowX là "visible", nên giá trị
    // "auto" ở đây chứng minh style của component đã được áp).
    expect(getComputedStyle(wrap!).overflowX).toBe('auto');
    expect(getComputedStyle(table!).minWidth).toBe('880px');
  });
});


/**
 * Gói định kỳ BẮT BUỘC gắn plan: BE trả 400 "Subscription packages require PlanId and Audience"
 * (`PackageService.cs:123`), và bảng giá `GET /payment/plans` chỉ nhận SKU có `planId`.
 *
 * 🔴 Đây là lý do production có 6 gói mà 0 gói mua được: form này TỪNG không có ô chọn plan nên
 * mọi lần tạo SKU định kỳ đều ăn 400 — không có đường nào từ giao diện để mở bán gói.
 */
describe('AdminPackages — SKU gói định kỳ phải gắn gói dịch vụ', () => {
  let httpMock: HttpTestingController;
  const notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  const PLAN_PRO = {
    id: 'plan-pro',
    audience: 0,
    code: 'pro',
    name: 'Pro',
    rank: 2,
    interviewFunding: 1,
    adaptiveEnabled: true,
    groundingEnabled: true,
    selfConsistencyN: 3,
    cvAnalysisIncluded: true,
    repoAnalysisIncluded: true,
    roadmapEnabled: true,
    postpaidEligible: false,
    entitlementsVersion: 1,
    isActive: true,
  };

  function setup(plans: unknown[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminPackages);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === PACKAGES).flush([]);
    httpMock.expectOne((r) => r.url === PLANS).flush(plans);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    vi.clearAllMocks();
  });

  it('gửi planId + audience SUY TỪ PLAN đã chọn', () => {
    const fixture = setup([PLAN_PRO]);
    fixture.componentInstance.form.patchValue({
      name: 'Pro tháng',
      type: 2,
      priceVnd: 199000,
      durationDays: 30,
      planId: 'plan-pro',
    });

    fixture.componentInstance.create();

    const req = httpMock.expectOne(PACKAGES);
    expect(req.request.body.planId).toBe('plan-pro');
    // Audience KHÔNG lấy từ ô nhập riêng — BE bắt phải trùng audience của plan (`:127`).
    expect(req.request.body.audience).toBe(0);
    expect(req.request.body.durationDays).toBe(30);
    req.flush({});
    // Tạo xong chỉ tải lại DANH SÁCH GÓI (catalog plan không đổi).
    httpMock.expectOne((r) => r.url === PACKAGES).flush([]);
  });

  it('thiếu gói dịch vụ → chặn tại chỗ, KHÔNG bắn request để ăn 400', () => {
    const fixture = setup([PLAN_PRO]);
    fixture.componentInstance.form.patchValue({
      name: 'Pro tháng',
      type: 2,
      priceVnd: 199000,
      durationDays: 30,
      planId: null,
    });

    fixture.componentInstance.create();

    httpMock.expectNone(PACKAGES);
    expect(notify.warn).toHaveBeenCalled();
  });

  it('gói mua lẻ KHÔNG gắn plan (planId/audience null)', () => {
    const fixture = setup([PLAN_PRO]);
    fixture.componentInstance.form.patchValue({
      name: '10 credit',
      type: 1,
      priceVnd: 50000,
      interviewCredits: 10,
    });

    fixture.componentInstance.create();

    const req = httpMock.expectOne(PACKAGES);
    expect(req.request.body.planId).toBeNull();
    expect(req.request.body.audience).toBeNull();
    req.flush({});
    // Tạo xong chỉ tải lại DANH SÁCH GÓI (catalog plan không đổi).
    httpMock.expectOne((r) => r.url === PACKAGES).flush([]);
  });

  /** Gắn SKU vào gói đã ngừng bán = tạo thứ khách trả tiền được mà bảng giá không bao giờ hiện. */
  it('gói dịch vụ đã ngừng bán không xuất hiện trong ô chọn', () => {
    const fixture = setup([PLAN_PRO, { ...PLAN_PRO, id: 'plan-old', name: 'Cũ', isActive: false }]);

    expect(fixture.componentInstance.sellablePlans().map((p) => p.id)).toEqual(['plan-pro']);
  });
});
