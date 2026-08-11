import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SubscriptionResponse } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { MySubscription } from './my-subscription';

const SUB_URL = `${environment.apiBase}/payment/me/subscription`;
const CANCEL_URL = `${environment.apiBase}/payment/me/subscription/cancel`;

/** Đúng shape backend trả khi CHƯA mua gói: 200 với active:false, mọi mốc null (KHÔNG phải 404). */
const NO_SUB: SubscriptionResponse = {
  ownerType: 1,
  ownerId: 'u-1',
  active: false,
  billingCycle: null,
  startedAt: null,
  expiresAt: null,
};

const EXPIRES_AT = '2030-01-15T10:00:00Z';
const ACTIVE_SUB: SubscriptionResponse = {
  ownerType: 1,
  ownerId: 'u-1',
  active: true,
  billingCycle: 'Monthly',
  startedAt: '2029-12-15T10:00:00Z',
  expiresAt: EXPIRES_AT,
};

describe('MySubscription (F8) — gói của tôi', () => {
  let httpMock: HttpTestingController;
  let confirmed: boolean;
  const notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  function setup(sub: SubscriptionResponse) {
    confirmed = true;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirmed) }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MySubscription);
    fixture.detectChanges();
    httpMock.expectOne(SUB_URL).flush(sub);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    vi.clearAllMocks();
  });

  function text(fixture: ReturnType<typeof setup>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('chưa mua gói (200 active:false) → hiện trạng thái trống, KHÔNG báo lỗi', () => {
    // Backend cố ý KHÔNG trả 404 ở đây; coi ca này là lỗi sẽ hiện snackbar đỏ cho người dùng
    // hoàn toàn bình thường chưa từng mua gói.
    const fixture = setup(NO_SUB);
    expect(text(fixture)).toContain('chưa có gói');
    expect(notify.error).not.toHaveBeenCalled();
    // Không có gì để huỷ ⇒ không được hiện nút huỷ.
    expect(text(fixture)).not.toContain('Huỷ gia hạn');
  });

  it('gói đang chạy → hiện chu kỳ + hạn + nút huỷ', () => {
    const fixture = setup(ACTIVE_SUB);
    expect(text(fixture)).toContain('Đang hoạt động');
    expect(text(fixture)).toContain('Theo tháng');
    expect(text(fixture)).toContain('Huỷ gia hạn');
  });

  /**
   * Vế dễ mất nhất của màn này. Backend lọc `Status == Active`, nên NGAY SAU khi huỷ,
   * `GET /me/subscription` đã trả `active:false` + `expiresAt: null` — ngày còn hiệu lực biến
   * mất khỏi API. Nếu component chỉ đọc lại từ server, người vừa huỷ sẽ thấy "chưa có gói nào"
   * và tưởng mình bị cắt quyền ngay lập tức, trong khi thực tế còn dùng tới hết kỳ đã trả tiền.
   */
  it('huỷ xong vẫn nói được gói còn hiệu lực tới ngày nào (API không trả lại mốc này nữa)', () => {
    const fixture = setup(ACTIVE_SUB);
    fixture.componentInstance.cancel();
    httpMock.expectOne(CANCEL_URL).flush({ subscriptionId: 's-1', cancelled: true });
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelledUntil()).toBe(EXPIRES_AT);
    expect(text(fixture)).toContain('Đã huỷ gia hạn');
    expect(text(fixture)).toContain('còn hiệu lực đến');
    expect(text(fixture)).toContain('15/01/2030');
    expect(notify.success).toHaveBeenCalled();
  });

  it('không xác nhận trong hộp thoại → KHÔNG gọi API huỷ', () => {
    const fixture = setup(ACTIVE_SUB);
    confirmed = false;
    fixture.componentInstance.cancel();
    httpMock.expectNone(CANCEL_URL);
  });

  it('backend báo cancelled:false (không có gói đang chạy) → không dựng màn "đã huỷ"', () => {
    // Phản hồi idempotent, không phải xác nhận đã huỷ được cái gì. Hiện "Đã huỷ gia hạn" ở đây
    // là khẳng định một việc chưa xảy ra.
    const fixture = setup(ACTIVE_SUB);
    fixture.componentInstance.cancel();
    httpMock.expectOne(CANCEL_URL).flush({ subscriptionId: null, cancelled: false });
    // Thất bại mềm → tải lại trạng thái thật.
    httpMock.expectOne(SUB_URL).flush(NO_SUB);
    fixture.detectChanges();

    expect(fixture.componentInstance.justCancelled()).toBe(false);
    expect(text(fixture)).not.toContain('Đã huỷ gia hạn');
  });
});

describe('MySubscription — nút "Xem các gói" trỏ về bảng giá', () => {
  let httpMock: HttpTestingController;

  afterEach(() => httpMock.verify());

  /**
   * Link này TỪNG trỏ sang trang credit (bán credit LẺ, không bán gói định kỳ) vì lúc đó chưa có
   * bảng giá cho người mua. Khoá lại: hỏng nữa thì triệu chứng chỉ là "bấm Xem các gói ra trang
   * không có gói nào" — kiểu lỗi người dùng bỏ đi chứ không đi báo.
   */
  function buyLinkFor(url: string): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // Router THẬT (RouterLink trong template cần nó) — chỉ giả `url`. Phải spy TRƯỚC khi đọc
    // `buyLink()`: đó là `computed` phụ thuộc `router.url` (không phải signal) nên nó cache lần đầu.
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(url);
    const fixture = TestBed.createComponent(MySubscription);
    fixture.detectChanges();
    httpMock.expectOne(SUB_URL).flush(NO_SUB);
    fixture.detectChanges();
    return fixture.componentInstance.buyLink();
  }

  it('khu vực Candidate → /candidate/plans', () => {
    expect(buyLinkFor('/candidate/subscription')).toBe('/candidate/plans');
  });

  it('khu vực Employer → /employer/plans', () => {
    expect(buyLinkFor('/employer/subscription')).toBe('/employer/plans');
  });
});
