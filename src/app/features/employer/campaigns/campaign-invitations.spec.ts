import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignInvitations } from './campaign-invitations';
import { NotifyService } from '../../../core/notify.service';
import { InvitationListItem } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const LIST = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/invitations`;

function inv(partial: Partial<InvitationListItem> = {}): InvitationListItem {
  return {
    id: 'inv-1',
    email: 'a@example.com',
    status: 'Sent',
    sentAt: '2026-08-01T10:00:00Z',
    emailSentAt: '2026-08-01T10:00:05Z',
    expiresAt: '2026-08-20T10:00:00Z',
    revokedAt: null,
    joinedAt: null,
    campaignCandidateId: null,
    createdAt: '2026-08-01T09:59:00Z',
    ...partial,
  };
}

/**
 * Trước màn này, danh sách lời mời chỉ tồn tại trong đúng response của lần bấm "Gửi lời mời"
 * ⇒ HR đóng tab là mất dấu, và không lấy được id để bấm "Gửi lại".
 */
describe('CampaignInvitations — theo dõi lời mời đã gửi', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(list: InvitationListItem[] = [inv()]) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignInvitations);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === LIST).flush(list);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('hiện email + trạng thái tiếng Việt', () => {
    const text =
      (setup([inv({ status: 'Joined' })]).nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('a@example.com');
    expect(text).toContain('Đã tham gia');
  });

  it('trạng thái lạ (backend thêm mới) → hiện mã thô, KHÔNG bỏ trống', () => {
    const cmp = setup().componentInstance;
    expect(cmp.label('SomethingNew')).toBe('SomethingNew');
  });

  // ── Lọc chạy ở SQL nên phải đi kèm request, không lọc phía client ───────────
  it('lọc theo trạng thái → gửi query param status', () => {
    const cmp = setup().componentInstance;
    cmp.filterStatus = 'Revoked';

    cmp.load();

    const req = httpMock.expectOne((r) => r.url === LIST);
    expect(req.request.params.get('status')).toBe('Revoked');
    req.flush([]);
  });

  it('tìm theo email → gửi query param search (đã trim)', () => {
    const cmp = setup().componentInstance;
    cmp.filterSearch = '  b@example.com  ';

    cmp.load();

    const req = httpMock.expectOne((r) => r.url === LIST);
    expect(req.request.params.get('search')).toBe('b@example.com');
    req.flush([]);
  });

  it('bộ lọc rỗng → KHÔNG gửi param rỗng (backend hiểu là lọc theo chuỗi rỗng)', () => {
    const cmp = setup().componentInstance;
    cmp.filterStatus = '';
    cmp.filterSearch = '   ';

    cmp.load();

    const req = httpMock.expectOne((r) => r.url === LIST);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('search')).toBe(false);
    req.flush([]);
  });

  it('xoá lọc → reset cả hai ô rồi nạp lại', () => {
    const cmp = setup().componentInstance;
    cmp.filterStatus = 'Joined';
    cmp.filterSearch = 'x';

    cmp.resetFilters();

    expect(cmp.filterStatus).toBe('');
    expect(cmp.filterSearch).toBe('');
    httpMock.expectOne((r) => r.url === LIST).flush([]);
  });

  // ── Gửi lại: lý do màn này tồn tại ──────────────────────────────────────────
  it('gửi lại → POST reissue đúng id rồi nạp lại danh sách', () => {
    const cmp = setup().componentInstance;

    cmp.reissue(inv());

    const req = httpMock.expectOne(`${LIST}/inv-1/reissue`);
    expect(req.request.method).toBe('POST');
    req.flush({});
    // Nạp lại để dòng cũ chuyển sang "Đã thu hồi" và dòng mới xuất hiện.
    httpMock.expectOne((r) => r.url === LIST).flush([inv({ status: 'Revoked' })]);
    expect(notify['success']).toHaveBeenCalled();
  });

  it('409 (chiến dịch không còn Active) → cảnh báo, không phải error đỏ', () => {
    const cmp = setup().componentInstance;

    cmp.reissue(inv());

    httpMock
      .expectOne(`${LIST}/inv-1/reissue`)
      .flush('Campaign is not Active.', { status: 409, statusText: 'Conflict' });

    expect(notify['warn']).toHaveBeenCalled();
    expect(notify['error']).not.toHaveBeenCalled();
    expect(cmp.busy()).toBe(false);
  });

  /**
   * Backend chỉ giữ hash của token (DB23) ⇒ không có đường sao chép link. Khoá lại để không ai
   * "bổ sung tính năng" bằng cách dựng link từ một field không tồn tại.
   */
  it('không hiện nút sao chép link mời (backend không trả token)', () => {
    const text = (setup().nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Sao chép');
    expect(text.toLowerCase()).not.toContain('token');
  });
});
