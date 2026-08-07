import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Credits } from './credits';
import { NotifyService } from '../../../core/notify.service';
import { CreditAccountResponse, OrderResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const ACCOUNT_URL = `${environment.apiBase}/payment/me/account`;
const PACKAGES_URL = `${environment.apiBase}/payment/package`;
const ORDERS_URL = `${environment.apiBase}/payment/order/my-orders`;
const LEDGER_URL = `${environment.apiBase}/payment/me/credit-transactions`;

/** Ví rỗng đúng như backend trả khi row `credit_accounts` CHƯA tồn tại (`CreditAccountResponse.Empty`). */
const EMPTY_WALLET: CreditAccountResponse = {
  ownerType: 1,
  ownerId: 'u-1',
  paymentMode: 0,
  status: 0,
  remainingCredits: 0,
  reservedCredits: 0,
  freeCreditsGranted: 0,
  creditLimit: null,
  periodUsage: null,
  updatedAt: '2026-08-08T00:00:00Z',
};

const AN_ORDER: OrderResponse = {
  id: 'o-1',
  ownerType: 1,
  ownerId: 'u-1',
  kind: 0,
  packageId: 'p-1',
  invoiceId: null,
  status: 2,
  amountVnd: 20000,
  payosOrderCode: 1,
  expiredAt: '2026-08-08T00:00:00Z',
  paidAt: '2026-08-07T00:00:00Z',
  createdAt: '2026-08-07T00:00:00Z',
};

describe('Credits (candidate) — mời dùng suất dùng thử khi chưa có ví (BK32)', () => {
  let httpMock: HttpTestingController;

  function setup(account: CreditAccountResponse, orders: OrderResponse[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Credits);
    fixture.detectChanges();

    httpMock.expectOne(ACCOUNT_URL).flush(account);
    httpMock.expectOne(PACKAGES_URL).flush([]);
    httpMock.expectOne(ORDERS_URL).flush(orders);
    fixture.detectChanges();
    // <app-credit-history> chỉ được TẠO sau khi `loading()` tắt (nó nằm trong nhánh @else), nên
    // request sổ credit của nó chỉ xuất hiện SAU lần detectChanges này — drain sớm hơn là drain rỗng.
    httpMock.match((r) => r.url === LEDGER_URL).forEach((r) => r.flush([]));
    return fixture;
  }

  afterEach(() => httpMock.verify());

  function text(fixture: ReturnType<typeof setup>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('ví chưa từng tồn tại → mời dùng thử, KHÔNG hiện khối "0 credit"', () => {
    const fixture = setup(EMPTY_WALLET, []);
    const host = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.noWalletYet()).toBe(true);
    expect(host.querySelector('.trial')).toBeTruthy();
    // Khối số dư phải VẮNG — hiện "0 credit" ở đây là chính cái bug BK32.
    expect(host.querySelector('.balance')).toBeNull();
    expect(text(fixture)).toContain('dùng thử');

    // Có đường đi tiếp tới trang luyện tập, không phải chỉ một câu thông báo.
    const link = host.querySelector('.trial a[href]') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/candidate/practice');
  });

  it('KHÔNG hứa một con số suất dùng thử (số đó là cấu hình backend, FE không đọc được)', () => {
    const fixture = setup(EMPTY_WALLET, []);
    const trial = (fixture.nativeElement as HTMLElement).querySelector('.trial');
    expect(trial?.textContent ?? '').not.toMatch(/\d/);
  });

  it('ví ĐÃ nhận quà nhưng tiêu hết → hiện số dư thật, KHÔNG mời dùng thử lần nữa', () => {
    const fixture = setup({ ...EMPTY_WALLET, freeCreditsGranted: 3 }, []);
    const host = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.noWalletYet()).toBe(false);
    expect(host.querySelector('.trial')).toBeNull();
    expect(host.querySelector('.balance')).toBeTruthy();
  });

  it('đã có đơn mua → KHÔNG mời dùng thử, dù mọi số bằng 0 (ca suất dùng thử bị tắt)', () => {
    // Suất dùng thử tắt bằng cấu hình ⇒ người đã mua gói rồi tiêu hết cũng có freeCreditsGranted = 0.
    // Họ không còn suất nào; mời dùng thử là nói sai.
    const fixture = setup(EMPTY_WALLET, [AN_ORDER]);
    const host = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.noWalletYet()).toBe(false);
    expect(host.querySelector('.trial')).toBeNull();
    expect(host.querySelector('.balance')).toBeTruthy();
  });

  it('ví còn credit → hiện số dư, không mời dùng thử', () => {
    const fixture = setup({ ...EMPTY_WALLET, remainingCredits: 2, freeCreditsGranted: 3 }, []);
    expect(fixture.componentInstance.noWalletYet()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.trial')).toBeNull();
  });

  it('credit đang bị GIỮ cho buổi dở → KHÔNG mời dùng thử (ví hiển nhiên đã tồn tại)', () => {
    // Ca hẹp nhưng thật, và là ca DUY NHẤT mà vế `reservedCredits === 0` gánh một mình:
    // suất dùng thử TẮT bằng cấu hình (⇒ freeCreditsGranted = 0) + admin cấp credit khuyến mãi
    // (⇒ không sinh đơn nào) + user đang giữa buổi luyện (⇒ reserved = 1, remaining = 0).
    // Ba vế kia đều không loại được ca này; thiếu vế reserved thì đúng người đang thi lại bị bảo
    // "bạn chưa có ví credit".
    const fixture = setup({ ...EMPTY_WALLET, reservedCredits: 1, freeCreditsGranted: 0 }, []);
    expect(fixture.componentInstance.noWalletYet()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.trial')).toBeNull();
  });
});
