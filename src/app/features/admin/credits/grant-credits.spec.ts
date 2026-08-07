import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GrantCredits } from './grant-credits';
import { NotifyService } from '../../../core/notify.service';
import { OwnerType } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiBase}/payment/admin/credits/grant`;

describe('GrantCredits — cấp credit khuyến mãi (F20)', () => {
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
    const fixture = TestBed.createComponent(GrantCredits);
    fixture.detectChanges();
    return fixture;
  }

  function fill(cmp: GrantCredits) {
    cmp.ownerType = OwnerType.User;
    cmp.ownerId = ' u-123 ';
    cmp.credits = 5;
    cmp.note = ' bù sự cố ';
  }

  afterEach(() => httpMock.verify());

  it('gửi ownerType dạng SỐ và trim id/ghi chú', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.submit();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    // Payment serialize enum dạng SỐ — gửi 'User' sẽ bị từ chối.
    // Q14: body nay mang thêm `idempotencyKey` (giá trị ngẫu nhiên) — tiền đề đổi CÓ CHỦ ĐÍCH.
    expect(req.request.body).toEqual({
      ownerType: 1,
      ownerId: 'u-123',
      credits: 5,
      note: 'bù sự cố',
      idempotencyKey: expect.any(String),
    });
    expect(req.request.body.idempotencyKey.length).toBeGreaterThan(0);
    req.flush({
      ownerType: 1,
      ownerId: 'u-123',
      creditsGranted: 5,
      remainingCredits: 15,
      transactionId: 'tx1',
    });

    expect(cmp.last()?.remainingCredits).toBe(15);
    expect(cmp.submitting()).toBe(false);
  });

  it('ownerType Tổ chức gửi số 0', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.ownerType = OwnerType.Org;
    cmp.submit();

    const req = httpMock.expectOne(URL);
    expect(req.request.body.ownerType).toBe(0);
    req.flush({
      ownerType: 0,
      ownerId: 'u-123',
      creditsGranted: 5,
      remainingCredits: 5,
      transactionId: 'tx1',
    });
  });

  // ── Lớp 1: chặn double-click trong cùng một lần bấm ─────────────────────────
  // (Lớp 2 = idempotencyKey, phủ ở nhóm Q14 dưới, lo ca bấm lại sau khi request đã kết thúc.)
  it('bấm lần hai khi request đầu CHƯA xong → chỉ đúng MỘT request được gửi', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);

    cmp.submit();
    cmp.submit();
    cmp.submit();

    // expectOne sẽ nổ nếu có nhiều hơn một request đang chờ.
    const req = httpMock.expectOne(URL);
    req.flush({
      ownerType: 1,
      ownerId: 'u-123',
      creditsGranted: 5,
      remainingCredits: 15,
      transactionId: 'tx1',
    });
  });

  it('xoá id/ghi chú/số credit sau khi cấp xong để không lặp lại đúng khoản vừa cấp', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.submit();
    httpMock.expectOne(URL).flush({
      ownerType: 1,
      ownerId: 'u-123',
      creditsGranted: 5,
      remainingCredits: 15,
      transactionId: 'tx1',
    });

    expect(cmp.ownerId).toBe('');
    expect(cmp.note).toBe('');
    expect(cmp.credits).toBeNull();
  });

  it('lỗi server → mở khoá nút để admin thử lại (không kẹt vĩnh viễn)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.submit();
    httpMock
      .expectOne(URL)
      .flush({ message: 'Không cộng được vào ví (ví vừa thay đổi) — thử lại.' }, {
        status: 409,
        statusText: 'Conflict',
      });

    expect(cmp.submitting()).toBe(false);
    expect(notify['error']).toHaveBeenCalled();
  });

  // ── Chặn trước các ca backend sẽ 400 ─────────────────────────────────────────
  it('thiếu id ví → không gửi request', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.ownerId = '   ';
    cmp.submit();
    httpMock.expectNone(URL);
  });

  it('số credit ngoài 1..10000 → không gửi request', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    fill(cmp);
    cmp.credits = 0;
    cmp.submit();
    httpMock.expectNone(URL);

    fill(cmp);
    cmp.credits = 10001;
    cmp.submit();
    httpMock.expectNone(URL);
  });

  it('ghi chú ngắn hơn 3 ký tự → không gửi request (backend đòi 3..500)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fill(cmp);
    cmp.note = 'ab';
    cmp.submit();
    httpMock.expectNone(URL);
  });

  // ── Q14 — khoá idempotency: lớp chống cấp trùng ở MÁY CHỦ ────────────────────
  // Backend khớp theo (ownerType, ownerId, key) và replay response lần cấp đầu. Hai bất biến:
  //  · GIỮ khoá khi thử lại đúng khoản đó  → backend replay, không cấp thêm.
  //  · ĐỔI khoá khi nội dung cấp thay đổi → không bị replay khoản cũ trong im lặng.
  describe('khoá idempotency (Q14)', () => {
    const OK = {
      ownerType: 1,
      ownerId: 'u-123',
      creditsGranted: 5,
      remainingCredits: 15,
      transactionId: 'tx1',
    };

    /** Gửi 1 lần rồi trả về khoá đã dùng + hàm kết thúc request (thành công hoặc lỗi). */
    function submitOnce(cmp: GrantCredits) {
      cmp.submit();
      const req = httpMock.expectOne(URL);
      return {
        key: req.request.body.idempotencyKey as string,
        ok: () => req.flush(OK),
        fail: () =>
          req.flush({ message: 'mạng lỗi' }, { status: 503, statusText: 'Service Unavailable' }),
      };
    }

    it('lỗi rồi bấm lại CÙNG khoản → gửi lại ĐÚNG khoá cũ (backend replay, không cấp thêm)', () => {
      const fixture = setup();
      const cmp = fixture.componentInstance;
      fill(cmp);

      const first = submitOnce(cmp);
      first.fail();

      // Form cố ý không bị xoá khi lỗi → admin bấm lại là đúng khoản đó.
      const second = submitOnce(cmp);
      expect(second.key).toBe(first.key);
      second.ok();
    });

    it('cấp thành công → lần cấp kế dùng khoá MỚI (không bị replay thành khoản cũ)', () => {
      const fixture = setup();
      const cmp = fixture.componentInstance;

      fill(cmp);
      const first = submitOnce(cmp);
      first.ok();

      // Cùng ví + cùng số credit + cùng ghi chú: nếu giữ khoá cũ, backend sẽ replay khoản trước
      // và admin tưởng đã cấp hai lần trong khi ví chỉ nhận một lần.
      fill(cmp);
      const second = submitOnce(cmp);
      expect(second.key).not.toBe(first.key);
      second.ok();
    });

    it('sửa số credit sau khi lỗi → khoá MỚI (backend không xét credits khi khớp khoá)', () => {
      const fixture = setup();
      const cmp = fixture.componentInstance;
      fill(cmp);

      const first = submitOnce(cmp);
      first.fail();

      cmp.credits = 50;
      const second = submitOnce(cmp);
      expect(second.key).not.toBe(first.key);
      expect(second.key.length).toBeGreaterThan(0);
      second.ok();
    });

    it('đổi ví sau khi lỗi → khoá MỚI (không mang khoá của ví khác sang)', () => {
      const fixture = setup();
      const cmp = fixture.componentInstance;
      fill(cmp);

      const first = submitOnce(cmp);
      first.fail();

      cmp.ownerId = 'u-999';
      const second = submitOnce(cmp);
      expect(second.key).not.toBe(first.key);
      second.ok();
    });

    it('chỉ thêm khoảng trắng → VẪN là khoá cũ (request gửi đi không đổi)', () => {
      const fixture = setup();
      const cmp = fixture.componentInstance;
      fill(cmp);

      const first = submitOnce(cmp);
      first.fail();

      // Khoá neo vào giá trị ĐÃ TRIM: cùng một khoản cấp, không được coi là khoản mới.
      cmp.ownerId = '  u-123  ';
      cmp.note = '  bù sự cố  ';
      const second = submitOnce(cmp);
      expect(second.key).toBe(first.key);
      second.ok();
    });
  });
});
