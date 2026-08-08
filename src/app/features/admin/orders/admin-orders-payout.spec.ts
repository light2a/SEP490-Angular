import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { environment } from '../../../../environments/environment';
import { AdminOrderListItem, OrderKind, OrderStatus, OwnerType } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { AdminOrders } from './admin-orders';

const ORDERS = `${environment.apiBase}/payment/admin/orders`;

function refundedOrder(partial: Partial<AdminOrderListItem> = {}): AdminOrderListItem {
  return {
    id: 'o1',
    ownerType: OwnerType.User,
    ownerId: 'u1',
    kind: OrderKind.CreditPack,
    status: OrderStatus.Refunded,
    amountVnd: 2000,
    payosOrderCode: 260808123456,
    expiredAt: '2026-08-08T01:00:00Z',
    paidAt: '2026-08-08T00:10:00Z',
    createdAt: '2026-08-08T00:00:00Z',
    refundedAt: '2026-08-08T02:00:00Z',
    refundSettledAt: null,
    ...partial,
  };
}

/**
 * F18 payout — chi tiền hoàn tự động qua kênh chi payOS.
 *
 * Điểm sống còn: **202 ≠ 200**. 202 = lệnh đã gửi, tiền đang bay, CHƯA chắc tới. 200 = đã tới và
 * đã đóng dấu. Gộp hai mã này lại là nói dối về dòng tiền — admin đọc "đã hoàn xong" rồi thôi
 * không theo dõi nữa, trong khi lệnh vẫn có thể hỏng ở ngân hàng.
 */
describe('AdminOrders — chi tiền hoàn tự động (F18 payout)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let cmp: AdminOrders;

  beforeEach(() => {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => {} }) }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    cmp = TestBed.runInInjectionContext(() => new AdminOrders());
    // Bỏ qua hộp thoại xác nhận của trình duyệt — jsdom không có `confirm` thật.
    vi.stubGlobal('confirm', () => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    httpMock.verify();
  });

  function payoutUrl(id: string): string {
    return `${ORDERS}/${id}/refund/payout`;
  }

  /** Sau mỗi lần payout, component tải lại danh sách — trả lời cho request đó. */
  function flushReload(): void {
    httpMock.expectOne((r) => r.url === ORDERS).flush([]);
  }

  it('202 → báo "đang chờ ngân hàng", KHÔNG báo đã hoàn xong', () => {
    cmp.payout(refundedOrder());

    const req = httpMock.expectOne(payoutUrl('o1'));
    expect(req.request.method).toBe('POST');
    req.flush(
      { orderId: 'o1', payoutId: 'PO-1', refundSettledAt: null, outcome: 'InFlight' },
      { status: 202, statusText: 'Accepted' },
    );
    flushReload();

    expect(notify['info']).toHaveBeenCalledTimes(1);
    expect(notify['success']).not.toHaveBeenCalled();
    const msg = notify['info'].mock.calls[0][0] as string;
    expect(msg).toContain('đang chờ');
    expect(msg).toContain('PO-1');
  });

  it('200 → báo đã chuyển tiền xong', () => {
    cmp.payout(refundedOrder());

    httpMock.expectOne(payoutUrl('o1')).flush({
      orderId: 'o1',
      payoutId: 'PO-2',
      refundSettledAt: '2026-08-08T03:00:00Z',
      outcome: 'Succeeded',
    });
    flushReload();

    expect(notify['success']).toHaveBeenCalledTimes(1);
    expect(notify['info']).not.toHaveBeenCalled();
  });

  /**
   * 409 NameMismatch: tiền **ĐÃ ĐI** nhưng tên người nhận không khớp người đã trả. Message của
   * server kèm mã lệnh để đối soát ngay — thay nó bằng câu chung chung là xoá đúng thông tin cần.
   */
  it('409 tên không khớp → hiện NGUYÊN message của server (tiền đã đi, cần đối soát)', () => {
    cmp.payout(refundedOrder());

    httpMock.expectOne(payoutUrl('o1')).flush(
      { message: 'Tên người nhận không khớp — đối soát lệnh PO-3.', payoutId: 'PO-3' },
      { status: 409, statusText: 'Conflict' },
    );
    flushReload();

    expect(notify['error']).toHaveBeenCalledWith('Tên người nhận không khớp — đối soát lệnh PO-3.');
    expect(notify['success']).not.toHaveBeenCalled();
  });

  /** 503 = chưa bật hoặc ví chi không đủ → vẫn còn lối thoát chuyển tay. */
  it('503 chưa bật → hiện message server, không báo thành công', () => {
    cmp.payout(refundedOrder());

    httpMock
      .expectOne(payoutUrl('o1'))
      .flush(
        { message: 'Chi tiền hoàn tự động chưa được bật.' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    flushReload();

    expect(notify['error']).toHaveBeenCalledWith('Chi tiền hoàn tự động chưa được bật.');
    expect(notify['success']).not.toHaveBeenCalled();
  });

  /**
   * Nút chỉ hiện với đơn đã hoàn mà CHƯA chuyển tiền — cùng điều kiện với nút xác nhận tay, vì
   * hai nút là hai đường của cùng một việc.
   */
  it('chỉ đơn đã hoàn & chưa chuyển tiền mới hiện nút', () => {
    expect(cmp.canSettle(refundedOrder())).toBe(true);
    expect(cmp.canSettle(refundedOrder({ refundSettledAt: '2026-08-08T03:00:00Z' }))).toBe(false);
    expect(cmp.canSettle(refundedOrder({ status: OrderStatus.Paid }))).toBe(false);
  });
});
