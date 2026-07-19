import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAiUsage } from './admin-ai-usage';
import { NotifyService } from '../../../core/notify.service';
import { AiUsageReportResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiBase}/payment/admin/ai-usage`;

function report(partial: Partial<AiUsageReportResponse> = {}): AiUsageReportResponse {
  return {
    from: '2026-07-01T00:00:00Z',
    to: '2026-08-01T00:00:00Z',
    granularity: 'Day',
    totalCalls: 4,
    promptTokens: 8000,
    outputTokens: 2000,
    totalTokens: 10000,
    totalCostUsd: 0.0074,
    byOperation: [
      {
        operation: 'score',
        calls: 3,
        promptTokens: 6000,
        outputTokens: 1500,
        totalTokens: 7500,
        costUsd: 0.0056,
      },
    ],
    buckets: [
      { periodStart: '2026-07-01T00:00:00Z', calls: 4, totalTokens: 10000, costUsd: 0.0074 },
    ],
    resourceUrls: null,
    ...partial,
  };
}

describe('AdminAiUsage — tiêu thụ token & chi phí AI (F22)', () => {
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
    const fixture = TestBed.createComponent(AdminAiUsage);
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
    expect(fixture.componentInstance.report()?.totalTokens).toBe(10000);
  });

  // Giá trị của màn này KHÔNG nằm ở tổng chi phí mà ở chỗ "tiền đi đâu" — nếu bảng theo
  // đường gọi không hiện thì không ai quyết được nên tắt tính năng đắt nào.
  it('hiển thị tiêu thụ THEO ĐƯỜNG GỌI kèm nhãn tiếng Việt', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report());
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Chấm câu trả lời');
  });

  // Endpoint AI mới sẽ xuất hiện với tên chưa có trong bảng nhãn. Nuốt mất dòng đó =
  // giấu một khoản chi; hiện nguyên chuỗi gốc xấu hơn nhưng đúng.
  it('đường gọi lạ hiện NGUYÊN tên gốc, không bị bỏ qua', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(
      report({
        byOperation: [
          {
            operation: 'endpoint_moi_chua_co_nhan',
            calls: 1,
            promptTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            costUsd: 0.00001,
          },
        ],
      }),
    );
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('endpoint_moi_chua_co_nhan');
  });

  // Chi phí một lượt gọi cỡ 1e-4 USD; làm tròn 2 số sẽ cho ra "0.00" ở phần lớn dòng và
  // biến một màn giám sát chi phí thành một màn toàn số 0.
  it('hiển thị chi phí đủ chữ số thập phân, không làm tròn về 0', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report({ totalCostUsd: 0.0074 }));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0.0074');
  });

  it('gửi from/to/groupBy khi admin lọc theo kỳ', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report());

    const cmp = fixture.componentInstance;
    cmp.from = '2026-07-01';
    cmp.to = '2026-07-15';
    cmp.groupBy = 'month';
    cmp.load();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.get('to')).toBe('2026-07-15');
    expect(req.request.params.get('groupBy')).toBe('month');
    req.flush(report({ granularity: 'Month' }));
  });

  // F15: null ≠ 0/0. Hiện "0% liên kết bị loại" khi không có dữ liệu là một khẳng định
  // ta không có cơ sở để nói.
  it('KHÔNG hiện mục liên kết khi backend trả null', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush(report({ resourceUrls: null }));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Liên kết tài liệu do AI sinh');
  });

  it('hiện tỉ lệ liên kết bị loại khi có dữ liệu', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(report({ resourceUrls: { proposed: 10, rejected: 5, rejectedRate: 0.5 } }));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Liên kết tài liệu do AI sinh');
    expect(text).toContain('50%');
  });

  it('không có lượt gọi nào → trung bình 0, không chia cho 0', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(report({ totalCalls: 0, totalTokens: 0, byOperation: [], buckets: [] }));
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.avgTokens(cmp.report()!)).toBe(0);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('NaN');
  });

  it('lỗi tải → báo lỗi, không kẹt spinner', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'lỗi' }, { status: 500, statusText: 'Server Error' });

    expect(notify['error']).toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
