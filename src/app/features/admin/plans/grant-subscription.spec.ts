import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { GrantSubscriptionRequest, OwnerType, PlanAudience } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { GrantSubscription } from './grant-subscription';

const PLANS = `${environment.apiBase}/payment/admin/plans`;
const GRANT = `${environment.apiBase}/payment/admin/subscriptions/grant`;

describe('GrantSubscription — chống cấp trùng kỳ hạn', () => {
  let httpMock: HttpTestingController;
  let cmp: GrantSubscription;

  beforeEach(() => {
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
    cmp = TestBed.runInInjectionContext(() => new GrantSubscription());
    cmp.ngOnInit();
    httpMock.expectOne((r) => r.url === PLANS).flush([]);

    cmp.ownerType = OwnerType.User;
    cmp.ownerId = 'u1';
    cmp.planId = 'p1';
    cmp.durationDays = 30;
  });

  afterEach(() => httpMock.verify());

  /** Lấy body của request grant đang chờ rồi trả lời nó. */
  function flushGrant(status = 200): GrantSubscriptionRequest {
    const req = httpMock.expectOne(GRANT);
    const body = req.request.body as GrantSubscriptionRequest;
    if (status === 200) {
      req.flush({ id: 's1', tierCode: 'plus', expiresAt: '2026-09-01T00:00:00Z' });
    } else {
      req.flush({ message: 'boom' }, { status, statusText: 'Server Error' });
    }
    return body;
  }

  it('khoá idempotency luôn được gửi (backend khai bắt buộc, rỗng → 400)', () => {
    cmp.submit();
    const body = flushGrant();
    expect(body.idempotencyKey).toBeTruthy();
  });

  /**
   * Đây là lý do khoá tồn tại: lỗi mạng/5xx không cho biết backend đã commit hay chưa, nên lần
   * bấm lại phải mang ĐÚNG khoá cũ để backend replay thay vì cấp thêm một kỳ hạn nữa.
   */
  it('bấm lại sau lỗi → GIỮ NGUYÊN khoá (backend replay, không cấp kỳ hạn thứ hai)', () => {
    cmp.submit();
    const first = flushGrant(500);

    cmp.submit();
    const retry = flushGrant();

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  /**
   * Mặt trái: backend khớp khoá theo (ownerType, ownerId, key) và KHÔNG xét planId/durationDays.
   * Giữ khoá cũ sau khi đổi nội dung ⇒ nó replay kỳ hạn CŨ và bỏ qua gói/số ngày mới trong im lặng.
   */
  it('đổi số ngày sau lỗi → khoá MỚI (nếu không, backend replay kỳ hạn cũ trong im lặng)', () => {
    cmp.submit();
    const first = flushGrant(500);

    cmp.durationDays = 90;
    cmp.submit();
    const changed = flushGrant();

    expect(changed.durationDays).toBe(90);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('đổi gói sau lỗi → khoá MỚI', () => {
    cmp.submit();
    const first = flushGrant(500);

    cmp.planId = 'p2';
    cmp.submit();
    const changed = flushGrant();

    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  /**
   * Cấp xong thì khoá hết vai trò. Giữ lại sẽ khiến lần cấp KẾ cho cùng ví với cùng nội dung bị
   * backend replay thành kỳ hạn cũ — admin tưởng đã cấp hai lần mà thực ra chỉ có một.
   */
  it('cấp thành công rồi cấp lại cùng nội dung → khoá MỚI', () => {
    cmp.submit();
    const first = flushGrant();

    cmp.ownerId = 'u1';
    cmp.submit();
    const second = flushGrant();

    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  /** Ví cá nhân ↔ catalog B2C, ví tổ chức ↔ catalog B2B — cấp chéo bị máy chủ từ chối. */
  it('chỉ đề xuất gói đang bán, đúng catalog của loại ví', () => {
    cmp.plans.set([
      { id: 'a', audience: PlanAudience.B2C, isActive: true, code: 'plus' },
      { id: 'b', audience: PlanAudience.B2B, isActive: true, code: 'starter' },
      { id: 'c', audience: PlanAudience.B2C, isActive: false, code: 'old' },
    ] as never);

    cmp.ownerType = OwnerType.User;
    expect(cmp.eligiblePlans().map((p) => p.id)).toEqual(['a']);

    cmp.ownerType = OwnerType.Org;
    expect(cmp.eligiblePlans().map((p) => p.id)).toEqual(['b']);
  });
});
