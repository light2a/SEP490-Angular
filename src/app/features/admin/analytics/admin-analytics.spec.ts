import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import {
  AuthAnalyticsResponse,
  CampaignAnalyticsResponse,
  InterviewAnalyticsResponse,
  TrafficReportResponse,
} from '../../../core/models/admin-ops.models';
import { AdminAnalytics } from './admin-analytics';

const AUTH_URL = `${environment.apiBase}/auth/admin/analytics`;
const INT_URL = `${environment.apiBase}/interview/admin/analytics`;
const CAMP_URL = `${environment.apiBase}/campaign/admin/analytics`;
const TRAFFIC_URL = `${environment.apiBase}/payment/admin/traffic`;

function authRes(partial: Partial<AuthAnalyticsResponse> = {}): AuthAnalyticsResponse {
  return {
    from: '2026-07-01T00:00:00Z',
    to: '2026-08-01T00:00:00Z',
    granularity: 'day',
    totals: {
      totalUsers: 130,
      newUsers: 9,
      bannedUsers: 1,
      totalOrganizations: 4,
      byRole: [{ role: 'Candidate', count: 100 }],
    },
    activeUsers: { last7Days: 12, last30Days: 40 },
    buckets: [{ periodStart: '2026-07-01T00:00:00Z', newUsers: 2, logins: 7, distinctUsers: 5 }],
    ...partial,
  };
}

function interviewRes(): InterviewAnalyticsResponse {
  return {
    from: '2026-07-01T00:00:00Z',
    to: '2026-08-01T00:00:00Z',
    granularity: 'day',
    activeSessions: { b2c: 3, b2b: 1 },
    totals: {
      answersUploaded: 5,
      answersNeedsReview: 0,
      byJobCategory: [{ jobCategory: 'BE', count: 11 }],
    },
    buckets: [
      { periodStart: '2026-07-01T00:00:00Z', created: 4, scored: 3, failed: 1, abandoned: 0 },
    ],
  };
}

function campaignRes(): CampaignAnalyticsResponse {
  return {
    from: '2026-07-01T00:00:00Z',
    to: '2026-08-01T00:00:00Z',
    granularity: 'day',
    totals: {
      byStatus: [{ status: 'Active', count: 6 }],
      invitationsSent: 50,
      invitationsUnsent: 21,
      flagsBySignal: [{ signalType: 'tab_switch', count: 25 }],
    },
    buckets: [
      {
        periodStart: '2026-07-01T00:00:00Z',
        campaignsCreated: 1,
        invitationsCreated: 3,
        joins: 2,
        interviewsStarted: 1,
      },
    ],
  };
}

function trafficRes(partial: Partial<TrafficReportResponse> = {}): TrafficReportResponse {
  return {
    from: '2026-08-08T00:00:00Z',
    to: '2026-08-08T12:00:00Z',
    granularity: 'day',
    totals: {
      requests: 25,
      errors4xx: 2,
      errors5xx: 0,
      avgDurationMs: 41.7,
      maxDurationMs: 900,
    },
    byRoute: [
      {
        routeId: 'payment-route',
        summary: {
          requests: 25,
          errors4xx: 2,
          errors5xx: 0,
          avgDurationMs: 41.7,
          maxDurationMs: 900,
        },
      },
    ],
    buckets: [
      {
        periodStart: '2026-08-08T00:00:00Z',
        summary: {
          requests: 25,
          errors4xx: 2,
          errors5xx: 0,
          avgDurationMs: 41.7,
          maxDurationMs: 900,
        },
      },
    ],
    ...partial,
  };
}

describe('AdminAnalytics — thống kê vận hành (FR18)', () => {
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
    const fixture = TestBed.createComponent(AdminAnalytics);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  /**
   * Bốn endpoint này thuộc bốn service độc lập. Bắn cả bốn cùng lúc thì một service chết sẽ
   * kéo theo cả trang, nên chỉ tab đang xem được tải.
   */
  it('chỉ tải tab đang xem, KHÔNG bắn cả 4 endpoint', () => {
    const fixture = setup();

    const req = httpMock.expectOne((r) => r.url === AUTH_URL);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('to')).toBe(false);
    expect(req.request.params.get('groupBy')).toBe('day');
    req.flush(authRes());

    httpMock.expectNone((r) => r.url === INT_URL);
    httpMock.expectNone((r) => r.url === CAMP_URL);
    httpMock.expectNone((r) => r.url === TRAFFIC_URL);
    expect(fixture.componentInstance.auth()?.totals.totalUsers).toBe(130);
  });

  it('đổi tab thì tải đúng endpoint của tab đó; quay lại tab cũ không gọi lại', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.selectTab('interview');
    httpMock.expectOne((r) => r.url === INT_URL).flush(interviewRes());
    expect(cmp.interview()?.activeSessions.b2c).toBe(3);

    cmp.selectTab('auth');
    httpMock.expectNone((r) => r.url === AUTH_URL);
  });

  it('tab chiến dịch B2B gọi campaign analytics', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());

    fixture.componentInstance.selectTab('campaign');
    httpMock.expectOne((r) => r.url === CAMP_URL).flush(campaignRes());

    expect(fixture.componentInstance.campaign()?.totals.invitationsSent).toBe(50);
  });

  /**
   * Traffic nhận 'hour'|'day' còn 3 endpoint kia nhận 'day'|'month'. Dùng chung một ô select sẽ
   * gửi 'month' sang traffic → 400. Đây là lý do component giữ hai biến groupBy riêng.
   */
  it('tab tải hệ thống KHÔNG bao giờ gửi groupBy=month (backend chỉ nhận hour|day)', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.groupBy = 'month';
    cmp.apply();
    httpMock
      .expectOne((r) => r.url === AUTH_URL && r.params.get('groupBy') === 'month')
      .flush(authRes({ granularity: 'month' }));

    cmp.selectTab('traffic');
    const req = httpMock.expectOne((r) => r.url === TRAFFIC_URL);
    expect(req.request.params.get('groupBy')).toBe('day');
    req.flush(trafficRes());

    cmp.trafficGroupBy = 'hour';
    cmp.apply();
    const hourly = httpMock.expectOne((r) => r.url === TRAFFIC_URL);
    expect(hourly.request.params.get('groupBy')).toBe('hour');
    hourly.flush(trafficRes({ granularity: 'hour' }));
  });

  it('gửi from/to khi admin chọn khoảng, và bấm Xem thì tải lại tab đang xem', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.from = '2026-07-01';
    cmp.to = '2026-08-01';
    cmp.apply();

    const req = httpMock.expectOne((r) => r.url === AUTH_URL);
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.get('to')).toBe('2026-08-01');
    req.flush(authRes());
  });

  it('from >= to → chặn tại chỗ, không bắn request', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.from = '2026-08-01';
    cmp.to = '2026-07-01';
    cmp.apply();

    httpMock.expectNone((r) => r.url === AUTH_URL);
    expect(notify['warn']).toHaveBeenCalled();
  });

  /**
   * Backend gom bucket theo ngày UTC còn admin ngồi +07:00. FE không nắn biên (sẽ đẻ bucket
   * hụt), nên tối thiểu phải làm độ lệch NHÌN THẤY ĐƯỢC: hiện kỳ thật, quy chiếu UTC tường minh.
   * Khoá luôn tham số 'UTC' của DatePipe — bỏ nó đi là hiện giờ máy người xem, tức một con số
   * KHÁC con số backend đã dùng để cộng.
   */
  it('hiện KỲ THẬT backend trả về, quy chiếu UTC tường minh', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === AUTH_URL)
      .flush(authRes({ from: '2026-06-30T17:00:00Z', to: '2026-07-31T17:00:00Z' }));

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('30/06/2026 17:00');
    expect(text).toContain('31/07/2026 17:00');
    expect(text).toContain('UTC');
  });

  /** Một service chết không được làm ba tab kia trông như cũng hỏng. */
  it('lỗi ở một tab không xoá dữ liệu tab khác', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.selectTab('campaign');
    httpMock
      .expectOne((r) => r.url === CAMP_URL)
      .flush({ message: 'nổ' }, { status: 500, statusText: 'Server Error' });

    expect(cmp.activeError()).toBe('nổ');
    expect(notify['error']).toHaveBeenCalled();

    cmp.selectTab('auth');
    expect(cmp.activeError()).toBeNull();
    expect(cmp.auth()?.totals.totalUsers).toBe(130);
  });

  it('nút Thử lại gọi lại đúng endpoint đã lỗi', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    cmp.selectTab('traffic');
    httpMock
      .expectOne((r) => r.url === TRAFFIC_URL)
      .flush({ message: 'nổ' }, { status: 500, statusText: 'Server Error' });

    cmp.load('traffic', true);
    httpMock.expectOne((r) => r.url === TRAFFIC_URL).flush(trafficRes());
    expect(cmp.activeError()).toBeNull();
    expect(cmp.traffic()?.totals.requests).toBe(25);
  });

  /**
   * `avgDurationMs: null` nghĩa là kỳ KHÔNG có request nào, không phải "0ms". Hiện 0 ms đọc thành
   * "nhanh tuyệt đối" — sai lệch nghiêng về phía đẹp, kiểu không ai đi báo.
   */
  it('độ trễ null hiện "—", KHÔNG hiện 0 ms', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    expect(cmp.ms(null)).toBe('—');
    expect(cmp.ms(41.7)).toBe('42 ms');
    expect(cmp.ms(0)).toBe('0 ms');
  });

  it('nhãn/format bucket theo granularity backend trả về', () => {
    const fixture = setup();
    httpMock.expectOne((r) => r.url === AUTH_URL).flush(authRes());
    const cmp = fixture.componentInstance;

    expect(cmp.bucketFormat('month')).toBe('MM/yyyy');
    expect(cmp.bucketFormat('hour')).toBe('dd/MM HH:mm');
    expect(cmp.bucketFormat('day')).toBe('dd/MM/yyyy');
    expect(cmp.bucketLabel('hour')).toBe('giờ');
  });

  it('kỳ rỗng → hiện trạng thái trống, không vỡ', () => {
    const fixture = setup();
    httpMock
      .expectOne((r) => r.url === AUTH_URL)
      .flush(
        authRes({
          buckets: [],
          totals: {
            totalUsers: 0,
            newUsers: 0,
            bannedUsers: 0,
            totalOrganizations: 0,
            byRole: [],
          },
        }),
      );

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Không có dữ liệu trong kỳ.');
  });
});
