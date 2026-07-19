import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminRevenue } from './admin-revenue';
import { NotifyService } from '../../../core/notify.service';
import { OrderKind, RevenueReportResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiBase}/payment/admin/revenue`;

function report(partial: Partial<RevenueReportResponse> = {}): RevenueReportResponse {
  return {
    from: '2026-07-01T00:00:00Z',
    to: '2026-08-01T00:00:00Z',
    granularity: 'day',
    grossRevenueVnd: 1_000_000,
    paidOrderCount: 4,
    refundedVnd: 200_000,
    refundedOrderCount: 1,
    netRevenueVnd: 800_000,
    byKind: [{ kind: OrderKind.CreditPack, amountVnd: 1_000_000, orderCount: 4 }],
    buckets: [{ periodStart: '2026-07-01T00:00:00Z', amountVnd: 1_000_000, orderCount: 4 }],
    ...partial,
  };
}

describe('AdminRevenue — báo cáo doanh thu (F19)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup() {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminRevenue);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('tải mặc định không kèm from/to (backend lấy 30 ngày gần nhất)', () => {
    const fixture = setup();
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('to')).toBe(false);
    expect(req.request.params.get('groupBy')).toBe('day');
    req.flush(report());
    expect(fixture.componentInstance.report()?.grossRevenueVnd).toBe(1_000_000);
  });

  // Kỳ ÂM là kết quả hợp lệ (kỳ đó hoàn nhiều hơn thu) — nếu UI coi là lỗi và
  // nuốt mất thì admin đọc báo cáo sai mà không biết.
  it('doanh thu ròng ÂM vẫn hiển thị bình thường, không bị coi là lỗi', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(
        report({ grossRevenueVnd: 100_000, refundedVnd: 500_000, netRevenueVnd: -400_000 }),
      );

    const cmp = fixture.componentInstance;
    expect(cmp.report()?.netRevenueVnd).toBe(-400_000);
    expect(notify['error']).not.toHaveBeenCalled();

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('-400.000');
  });

  // Gộp và hoàn đếm theo hai mốc thời gian khác nhau → KHÔNG được tự tính lại
  // net = gross - refunded ở FE; phải dùng đúng con số backend trả về.
  it('dùng netRevenueVnd của backend, không tự tính lại', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(report({ grossRevenueVnd: 900, refundedVnd: 100, netRevenueVnd: 42 }));

    expect(fixture.componentInstance.report()?.netRevenueVnd).toBe(42);
  });

  it('gửi from/to/groupBy khi admin chọn khoảng', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report());

    const cmp = fixture.componentInstance;
    cmp.from = '2026-07-01';
    cmp.to = '2026-08-01';
    cmp.groupBy = 'month';
    cmp.load();

    const req = httpMock.expectOne((r) => r.url === URL && r.params.get('groupBy') === 'month');
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.get('to')).toBe('2026-08-01');
    req.flush(report({ granularity: 'month' }));
  });

  it('from >= to → chặn tại chỗ, không bắn request (backend sẽ 400)', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report());

    const cmp = fixture.componentInstance;
    cmp.from = '2026-08-01';
    cmp.to = '2026-07-01';
    cmp.load();

    httpMock.expectNone((r) => r.url === URL);
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('byKind dùng nhãn tiếng Việt theo enum SỐ của Payment', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report());
    const cmp = fixture.componentInstance;

    expect(cmp.kindLabel(OrderKind.CreditPack)).toBe('Mua credit');
    expect(cmp.kindLabel(OrderKind.SubscriptionRenewal)).toBe('Gia hạn gói');
  });

  it('kỳ rỗng → hiện trạng thái trống, không vỡ', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(
        report({
          byKind: [],
          buckets: [],
          grossRevenueVnd: 0,
          paidOrderCount: 0,
          refundedVnd: 0,
          refundedOrderCount: 0,
          netRevenueVnd: 0,
        }),
      );

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Không có đơn nào trong kỳ.');
  });
});
