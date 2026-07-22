import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdminOrders } from './admin-orders';
import { NotifyService } from '../../../core/notify.service';
import {
  AdminOrderListItem,
  OrderKind,
  OrderStatus,
  OwnerType,
  RefundSettlementFilter,
} from '../../../core/models';
import { environment } from '../../../../environments/environment';
import { RefundOrderDialogData } from './refund-order-dialog';

const ORDERS = `${environment.apiBase}/payment/admin/orders`;

function order(partial: Partial<AdminOrderListItem> = {}): AdminOrderListItem {
  return {
    id: 'o1',
    ownerType: OwnerType.User,
    ownerId: 'u1',
    kind: OrderKind.CreditPack,
    status: OrderStatus.Paid,
    amountVnd: 500_000,
    payosOrderCode: 260719123456,
    expiredAt: '2026-07-19T01:00:00Z',
    paidAt: '2026-07-19T00:10:00Z',
    createdAt: '2026-07-19T00:00:00Z',
    ...partial,
  };
}

describe('AdminOrders — hoàn tiền đơn (F18)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  /** Mỗi lần mở hộp thoại lấy 1 kết quả từ hàng đợi (để mô phỏng vòng xác nhận lần hai). */
  let dialogResults: unknown[];
  let dialogData: RefundOrderDialogData[];

  function setup(orders: AdminOrderListItem[] = [order()]) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    dialogData = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: {
            open: (_c: unknown, cfg: { data: RefundOrderDialogData }) => {
              dialogData.push(cfg.data);
              return { afterClosed: () => of(dialogResults.shift()) };
            },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === ORDERS).flush(orders);
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('chỉ cho hoàn đơn mua credit đã thanh toán', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    expect(cmp.canRefund(order())).toBe(true);
    expect(cmp.canRefund(order({ status: OrderStatus.Pending }))).toBe(false);
    expect(cmp.canRefund(order({ status: OrderStatus.Refunded }))).toBe(false);
    expect(cmp.canRefund(order({ kind: OrderKind.InvoiceSettlement }))).toBe(false);
  });

  it('POST refund kèm lý do + mã + settledNow (từ hộp thoại)', () => {
    dialogResults = [
      { reason: 'mua nhầm', gatewayRef: 'PAYOS-1', allowPartialClawback: false, settledNow: true },
    ];
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.refund(cmp.items()[0]);

    const req = httpMock.expectOne(`${ORDERS}/o1/refund`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      reason: 'mua nhầm',
      gatewayRef: 'PAYOS-1',
      allowPartialClawback: false,
      settledNow: true,
    });
    req.flush({
      orderId: 'o1',
      amountVnd: 500_000,
      creditsPurchased: 10,
      creditsClawedBack: 10,
      clawbackCeiling: 10,
      refundTransactionId: 'rt1',
      refundedAt: '2026-07-19T02:00:00Z',
      refundSettledAt: '2026-07-19T02:00:00Z',
    });
    httpMock.expectOne((r) => r.url === ORDERS).flush([order({ status: OrderStatus.Refunded })]);

    expect(notify['success']).toHaveBeenCalled();
    expect(cmp.busy()).toBeNull();
  });

  // ── Điểm quan trọng nhất của mục này ─────────────────────────────────────────
  // 409 "không đủ credit thu hồi" MANG THEO SỐ. Nuốt nó thành "lỗi không xác định"
  // là giấu mất đúng thông tin admin cần để quyết định.
  it('409 kèm số → hiện con số cho admin và hỏi lại, KHÔNG báo lỗi chung chung', () => {
    dialogResults = [
      { reason: 'khách đòi hoàn', gatewayRef: null, allowPartialClawback: false, settledNow: false },
      { reason: 'khách đòi hoàn', gatewayRef: null, allowPartialClawback: true, settledNow: false },
    ];
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.refund(cmp.items()[0]);

    httpMock.expectOne(`${ORDERS}/o1/refund`).flush(
      {
        message: 'Ví không còn đủ credit để thu hồi trọn khoản đã bán.',
        creditsPurchased: 10,
        clawbackPossible: 4,
        clawbackCeiling: 4,
      },
      { status: 409, statusText: 'Conflict' },
    );

    // Hộp thoại mở lần hai và mang theo con số thu hồi được.
    expect(dialogData.length).toBe(2);
    expect(dialogData[1].partial).toEqual({ creditsPurchased: 10, clawbackPossible: 4 });
    expect(notify['error']).not.toHaveBeenCalled();

    // Lần gọi thứ hai phải bật cờ chấp nhận thu hồi một phần.
    const retry = httpMock.expectOne(`${ORDERS}/o1/refund`);
    expect(retry.request.body.allowPartialClawback).toBe(true);
    retry.flush({
      orderId: 'o1',
      amountVnd: 500_000,
      creditsPurchased: 10,
      creditsClawedBack: 4,
      clawbackCeiling: 4,
      refundTransactionId: 'rt2',
      refundedAt: '2026-07-19T02:00:00Z',
    });
    httpMock.expectOne((r) => r.url === ORDERS).flush([order({ status: OrderStatus.Refunded })]);

    // Thông báo phải nêu rõ đã thu hồi thiếu, không chỉ "thành công".
    expect(notify['success']).toHaveBeenCalledWith(expect.stringContaining('4/10'));
  });

  it('admin huỷ ở lần xác nhận thứ hai → KHÔNG gọi lại API', () => {
    dialogResults = [
      { reason: 'x1x', gatewayRef: null, allowPartialClawback: false, settledNow: false },
      undefined,
    ];
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.refund(cmp.items()[0]);
    httpMock
      .expectOne(`${ORDERS}/o1/refund`)
      .flush(
        { creditsPurchased: 10, clawbackPossible: 4, clawbackCeiling: 4 },
        { status: 409, statusText: 'Conflict' },
      );

    httpMock.expectNone(`${ORDERS}/o1/refund`);
    expect(cmp.busy()).toBeNull();
  });

  // 409 còn dùng cho ca khác (đơn chưa Paid, ví vừa đổi) và KHÔNG kèm số — không được
  // mở lại hộp thoại "thu hồi một phần" cho những ca đó.
  it('409 KHÔNG kèm số → báo lỗi bình thường, không hỏi thu hồi một phần', () => {
    dialogResults = [{ reason: 'x1x', gatewayRef: null, allowPartialClawback: false, settledNow: false }];
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.refund(cmp.items()[0]);
    httpMock
      .expectOne(`${ORDERS}/o1/refund`)
      .flush({ message: 'Số dư ví vừa thay đổi giữa lúc hoàn.' }, {
        status: 409,
        statusText: 'Conflict',
      });

    expect(dialogData.length).toBe(1);
    expect(notify['error']).toHaveBeenCalledWith('Số dư ví vừa thay đổi giữa lúc hoàn.');
  });

  it('huỷ hộp thoại lần đầu → KHÔNG gọi API', () => {
    dialogResults = [undefined];
    const fixture = setup();
    fixture.componentInstance.refund(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${ORDERS}/o1/refund`);
  });
});

describe('AdminOrders — xác nhận đã chuyển tiền hoàn (settle)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResults: unknown[];

  function setup(orders: AdminOrderListItem[]) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(dialogResults.shift()) }) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === ORDERS).flush(orders);
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('canSettle: chỉ đơn đã hoàn mà CHƯA chuyển tiền', () => {
    dialogResults = [];
    const cmp = setup([order()]).componentInstance;
    expect(cmp.canSettle(order({ status: OrderStatus.Refunded, refundSettledAt: null }))).toBe(true);
    expect(
      cmp.canSettle(order({ status: OrderStatus.Refunded, refundSettledAt: '2026-07-19T02:00:00Z' })),
    ).toBe(false);
    expect(cmp.canSettle(order({ status: OrderStatus.Paid }))).toBe(false);
  });

  it('settle POST /refund/settle kèm mã, rồi tải lại', () => {
    dialogResults = [{ gatewayRef: 'PAYOS-SETTLE-1' }];
    const pending = order({ id: 'o9', status: OrderStatus.Refunded, refundSettledAt: null });
    const cmp = setup([pending]).componentInstance;

    cmp.settle(cmp.items()[0]);

    const req = httpMock.expectOne(`${ORDERS}/o9/refund/settle`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ gatewayRef: 'PAYOS-SETTLE-1' });
    req.flush({
      orderId: 'o9',
      refundedAt: '2026-07-19T01:00:00Z',
      refundSettledAt: '2026-07-19T03:00:00Z',
      refundGatewayRef: 'PAYOS-SETTLE-1',
    });
    // load() lại
    httpMock
      .expectOne((r) => r.url === ORDERS)
      .flush([order({ id: 'o9', status: OrderStatus.Refunded, refundSettledAt: '2026-07-19T03:00:00Z' })]);

    expect(notify['success']).toHaveBeenCalled();
    expect(cmp.busy()).toBeNull();
  });

  it('huỷ hộp thoại settle → KHÔNG gọi API', () => {
    dialogResults = [undefined];
    const pending = order({ id: 'o9', status: OrderStatus.Refunded, refundSettledAt: null });
    const cmp = setup([pending]).componentInstance;
    cmp.settle(cmp.items()[0]);
    httpMock.expectNone(`${ORDERS}/o9/refund/settle`);
  });

  it('lọc "chờ chuyển tiền" → gửi query refundSettlement=1', () => {
    dialogResults = [];
    const cmp = setup([order()]).componentInstance;

    cmp.refundSettlement = RefundSettlementFilter.Pending;
    cmp.load();

    const req = httpMock.expectOne((r) => r.url === ORDERS && r.params.get('refundSettlement') === '1');
    req.flush([]);
    expect(req.request.params.get('refundSettlement')).toBe('1');
  });
});
