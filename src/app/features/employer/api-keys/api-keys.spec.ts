import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of } from 'rxjs';
import { ApiKeys } from './api-keys';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotifyService } from '../../../core/notify.service';
import { ApiKeyListItem } from '../../../core/models';
import { environment } from '../../../../environments/environment';
import { signal } from '@angular/core';

const KEYS = `${environment.apiBase}/campaign/api-keys`;

/**
 * Sentinel ASCII cho chuỗi bí mật.
 *
 * KHÔNG dùng tiếng Việt có dấu ở đây: `JSON.stringify` escape non-ASCII (\uXXXX) nên một assert
 * kiểu `not.toContain('bí mật')` trên JSON sẽ XANH một cách tầm thường **kể cả khi dữ liệu đã rò** —
 * đúng cái bẫy đã ghi nhận ở vòng 3 (F17 phía backend).
 */
const RAW_KEY = 'isas_ak_RAWSECRETVALUE_MUSTNEVERLEAK';

function key(partial: Partial<ApiKeyListItem> = {}): ApiKeyListItem {
  return {
    id: 'k1',
    name: 'ATS chính',
    keyPrefix: 'isas_ak_AbC1',
    includePii: false,
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    ...partial,
  };
}

describe('ApiKeys — quản lý API key cho bên thứ ba (F17)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: unknown;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let orgRole: ReturnType<typeof signal<string | null>>;

  /**
   * `afterClosed$` cho phép test chọn thời điểm hộp thoại đóng. Mặc định phát ngay (`of`) cho các
   * ca không quan tâm timing; ca kiểm rò key thô truyền `Subject` để giữ hộp thoại mở.
   */
  function setup(
    keys: ApiKeyListItem[] = [key()],
    role: string | null = 'OrgAdmin',
    afterClosed$?: () => Subject<unknown>,
  ) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    orgRole = signal<string | null>(role);
    dialogOpen = vi.fn(() => ({
      afterClosed: () => (afterClosed$ ? afterClosed$() : of(dialogResult)),
    }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        { provide: AuthStore, useValue: { orgRole, userId: signal('u1') } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ApiKeys);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === KEYS && r.method === 'GET').flush(keys);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // ── Bất biến an ninh: key thô KHÔNG bao giờ ra tới danh sách ────────────────

  /**
   * Cửa sổ nguy hiểm là lúc hộp thoại ĐANG MỞ: bảng vẫn render ngay phía sau nó. Nếu ai đó "tiện
   * tay" đẩy object vừa tạo (còn mang `key` thô) vào `keys()` để bảng cập nhật ngay, key sẽ hiện
   * trên nền màn hình — rồi `load()` lúc đóng hộp thoại sẽ ghi đè và **xoá sạch dấu vết**.
   *
   * Vì thế `afterClosed` ở đây là `Subject` do test điều khiển, KHÔNG phải `of(...)`: `of` phát
   * đồng bộ nên `load()` chạy ngay và assert sau đó chỉ nhìn thấy trạng thái đã sạch — một bản rò
   * rỉ thật vẫn XANH. (Đã kiểm bằng mutation: bản `of(...)` không bắt được lỗi này.)
   */
  it('key thô KHÔNG lọt vào bảng — kể cả trong lúc hộp thoại còn mở', () => {
    const closed = new Subject<unknown>();
    const fixture = setup([], 'OrgAdmin', () => closed);
    const cmp = fixture.componentInstance;

    cmp.newName = 'ATS mới';
    cmp.create();

    httpMock.expectOne((r) => r.url === KEYS && r.method === 'POST').flush({
      id: 'k2',
      name: 'ATS mới',
      key: RAW_KEY,
      keyPrefix: 'isas_ak_XyZ9',
      includePii: false,
      expiresAt: null,
      createdAt: '2026-07-19T00:00:00Z',
    });
    fixture.detectChanges();

    // ── Hộp thoại VẪN ĐANG MỞ ────────────────────────────────────────────────
    expect(JSON.stringify(cmp.keys())).not.toContain(RAW_KEY);
    expect(fixture.nativeElement.textContent).not.toContain(RAW_KEY);

    // ── Người dùng đóng hộp thoại → nạp lại từ server ─────────────────────────
    closed.next(true);
    httpMock
      .expectOne((r) => r.url === KEYS && r.method === 'GET')
      .flush([key({ id: 'k2', name: 'ATS mới', keyPrefix: 'isas_ak_XyZ9' })]);
    fixture.detectChanges();

    expect(JSON.stringify(cmp.keys())).not.toContain(RAW_KEY);
    expect(fixture.nativeElement.textContent).not.toContain(RAW_KEY);
    // Tiền tố thì PHẢI hiện — đó là thứ giúp người dùng nhận ra key nào là key nào.
    expect(fixture.nativeElement.textContent).toContain('isas_ak_XyZ9');
  });

  it('key thô được đưa vào hộp thoại một-lần và hộp thoại KHÔNG cho đóng bằng click nền', () => {
    dialogResult = true;
    const fixture = setup([]);
    const cmp = fixture.componentInstance;

    cmp.newName = 'ATS mới';
    cmp.create();
    httpMock.expectOne((r) => r.method === 'POST').flush({
      id: 'k2',
      name: 'ATS mới',
      key: RAW_KEY,
      keyPrefix: 'isas_ak_XyZ9',
      includePii: false,
      expiresAt: null,
      createdAt: '2026-07-19T00:00:00Z',
    });
    httpMock.expectOne((r) => r.method === 'GET').flush([]);

    const [, config] = dialogOpen.mock.calls[0] as [unknown, { data: { key: string }; disableClose: boolean }];
    expect(config.data.key).toBe(RAW_KEY);
    // Mất key vì lỡ tay click ra ngoài là mất vĩnh viễn → phải chặn ở cấu hình dialog.
    expect(config.disableClose).toBe(true);
  });

  // ── Thu hồi: phải xác nhận trước ────────────────────────────────────────────

  it('KHÔNG gọi DELETE khi người dùng huỷ hộp thoại xác nhận', () => {
    dialogResult = false;
    const fixture = setup();

    fixture.componentInstance.revoke(key());

    httpMock.expectNone((r) => r.method === 'DELETE');
    expect(dialogOpen).toHaveBeenCalled();
  });

  it('xác nhận → DELETE đúng key rồi nạp lại danh sách', () => {
    dialogResult = true;
    const fixture = setup();

    fixture.componentInstance.revoke(key({ id: 'k9' }));

    httpMock.expectOne((r) => r.url === `${KEYS}/k9` && r.method === 'DELETE').flush(null);
    httpMock.expectOne((r) => r.url === KEYS && r.method === 'GET').flush([]);
    expect(notify['success']).toHaveBeenCalled();
  });

  it('cảnh báo thu hồi nói rõ KHÔNG lấy lại được dữ liệu bên kia đã tải về', () => {
    dialogResult = false;
    const fixture = setup();

    fixture.componentInstance.revoke(key());

    const [, config] = dialogOpen.mock.calls[0] as [unknown, { data: { bullets?: string[]; danger?: boolean } }];
    expect(config.data.danger).toBe(true);
    expect(config.data.bullets?.join(' ')).toMatch(/đã tải về/);
  });

  // ── Gate OrgAdmin ───────────────────────────────────────────────────────────

  it('HrMember không thấy cột thao tác (không có lối vào thu hồi/tạo)', () => {
    const fixture = setup([key()], 'HrMember');
    expect(fixture.componentInstance.columns()).not.toContain('actions');
  });

  it('OrgAdmin thấy cột thao tác', () => {
    const fixture = setup([key()], 'OrgAdmin');
    expect(fixture.componentInstance.columns()).toContain('actions');
  });

  // ── Gửi đúng tham số tạo key ────────────────────────────────────────────────

  it('bỏ trống số ngày → KHÔNG gửi expiresInDays (backend hiểu là không đặt hạn)', () => {
    dialogResult = true;
    const fixture = setup([]);
    const cmp = fixture.componentInstance;

    cmp.newName = '  ATS  ';
    cmp.newExpiresInDays = null;
    cmp.newIncludePii = true;
    cmp.create();

    const req = httpMock.expectOne((r) => r.method === 'POST');
    expect(req.request.body).toEqual({
      name: 'ATS',
      expiresInDays: undefined,
      includePii: true,
    });
    req.flush({
      id: 'k2',
      name: 'ATS',
      key: RAW_KEY,
      keyPrefix: 'p',
      includePii: true,
      expiresAt: null,
      createdAt: '2026-07-19T00:00:00Z',
    });
    httpMock.expectOne((r) => r.method === 'GET').flush([]);
  });
});
