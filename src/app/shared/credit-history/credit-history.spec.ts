import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreditHistory } from './credit-history';
import { PaymentApi } from '../../core/api/payment.api';
import { NotifyService } from '../../core/notify.service';
import { CreditTransactionReason, CreditTransactionResponse } from '../../core/models';
import { environment } from '../../../environments/environment';

const URL = `${environment.apiBase}/payment/me/credit-transactions`;

function tx(partial: Partial<CreditTransactionResponse> = {}): CreditTransactionResponse {
  return {
    id: 't1',
    delta: 5,
    reason: CreditTransactionReason.Purchase,
    createdAt: '2026-07-19T00:00:00Z',
    orderId: null,
    sessionId: null,
    reversesTransactionId: null,
    grantedBy: null,
    note: null,
    ...partial,
  };
}

describe('CreditHistory — sổ biến động credit (F19)', () => {
  let httpMock: HttpTestingController;

  function setup() {
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
    const fixture = TestBed.createComponent(CreditHistory);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // Con trỏ trang nằm ở HEADER, không ở body. Nếu đọc nhầm chỗ thì nút "Xem thêm"
  // không bao giờ hiện và người dùng im lặng mất phần lịch sử cũ hơn.
  it('đọc con trỏ trang kế từ header X-Next-Cursor', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    httpMock
      .expectOne((r) => r.url === URL)
      .flush([tx()], { headers: { 'X-Next-Cursor': 'CURSOR_2' } });

    expect(cmp.items().length).toBe(1);
    expect(cmp.nextCursor()).toBe('CURSOR_2');
  });

  it('không có header → hết trang (không hiện nút Xem thêm)', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === URL).flush([tx()]);
    expect(fixture.componentInstance.nextCursor()).toBeNull();
  });

  it('Xem thêm gửi cursor và NỐI THÊM vào danh sách (không ghi đè)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    httpMock
      .expectOne((r) => r.url === URL)
      .flush([tx({ id: 't1' })], { headers: { 'X-Next-Cursor': 'C2' } });

    cmp.loadMore();
    const req = httpMock.expectOne((r) => r.url === URL && r.params.get('cursor') === 'C2');
    req.flush([tx({ id: 't2' })], { headers: { 'X-Next-Cursor': 'C3' } });

    expect(cmp.items().map((t) => t.id)).toEqual(['t1', 't2']);
    expect(cmp.nextCursor()).toBe('C3');
  });

  it('đổi bộ lọc → tải LẠI từ đầu, không nối vào trang cũ', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    httpMock
      .expectOne((r) => r.url === URL)
      .flush([tx({ id: 'old' })], { headers: { 'X-Next-Cursor': 'C2' } });

    cmp.reason = CreditTransactionReason.PromoGrant;
    cmp.reload();

    const req = httpMock.expectOne((r) => r.url === URL && r.params.has('reason'));
    // Payment serialize enum dạng SỐ — gửi tên chuỗi sẽ bị backend từ chối.
    expect(req.request.params.get('reason')).toBe('4');
    expect(req.request.params.has('cursor')).toBe(false);
    req.flush([tx({ id: 'new' })]);

    expect(cmp.items().map((t) => t.id)).toEqual(['new']);
    expect(cmp.nextCursor()).toBeNull();
  });

  it('bộ lọc "Tất cả" → KHÔNG gửi param reason', () => {
    const fixture = setup();
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.has('reason')).toBe(false);
    req.flush([]);
  });

  // Ba loại "được cộng" phải đọc ra ba thứ khác nhau — gộp lại là nói dối người đọc sổ.
  it('mỗi lý do có nhãn riêng, phân biệt được suất dùng thử / quà tặng / mua', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    httpMock.expectOne((r) => r.url === URL).flush([]);

    const labels = [
      cmp.reasonLabel(CreditTransactionReason.Purchase),
      cmp.reasonLabel(CreditTransactionReason.FreeGrant),
      cmp.reasonLabel(CreditTransactionReason.PromoGrant),
      cmp.reasonLabel(CreditTransactionReason.Refund),
      cmp.reasonLabel(CreditTransactionReason.Consume),
    ];
    expect(new Set(labels).size).toBe(5);
    expect(labels[1]).toContain('dùng thử');
    expect(labels[2]).toContain('khuyến mãi');
  });

  it('hiển thị dấu của delta (+ cộng / − trừ)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    httpMock.expectOne((r) => r.url === URL).flush([]);

    expect(cmp.signed(3)).toBe('+3');
    expect(cmp.signed(-1)).toBe('-1');
  });

  it('không gọi thêm khi đã hết trang (nextCursor null)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    httpMock.expectOne((r) => r.url === URL).flush([tx()]);

    cmp.loadMore();
    httpMock.expectNone((r) => r.url === URL);
  });
});
