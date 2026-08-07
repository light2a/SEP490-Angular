import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CampaignApi } from '../../core/api/campaign.api';
import { AuthStore } from '../../core/auth/auth.store';
import { NotifyService } from '../../core/notify.service';
import { InvitationInfo, JoinCampaignResult } from '../../core/models';
import { InvitationLanding } from './invitation-landing';

const INV: InvitationInfo = {
  campaignId: 'c1',
  title: 'Tuyển Backend .NET',
  orgName: 'FPT Software',
  jobTitle: 'Backend Developer',
  description: 'Phỏng vấn AI 5 câu',
  deadline: null,
  criteria: [{ name: 'OOP', weight: 0.5, maxScore: 10 }],
};

const JOIN: JoinCampaignResult = {
  accessToken: 'header.eyJzdWIiOiJjYW5kLTEiLCJyb2xlIjoiQ2FuZGlkYXRlIn0.sig',
  campaignId: 'c1',
  candidateId: 'cand-1',
  membershipStatus: 'Joined',
};

// Phiên "thường" (login/register) — CÓ refreshToken. Đây là tiền đề của hướng Q17(b).
const MY_ACCESS = 'header.eyJzdWIiOiJ1LTEiLCJyb2xlIjoiQ2FuZGlkYXRlIn0.sig';
const MY_REFRESH = 'refresh-token-cua-phien-thuong';

/** `expectOne` không nhận RegExp ở bản Angular này → khớp bằng predicate. */
const endsWith = (suffix: string) => (req: { url: string }) => req.url.endsWith(suffix);

describe('InvitationLanding', () => {
  let api: { invitation: ReturnType<typeof vi.fn>; join: ReturnType<typeof vi.fn> };
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    api = { invitation: vi.fn().mockReturnValue(of(INV)), join: vi.fn().mockReturnValue(of(JOIN)) };
    notify = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [InvitationLanding],
      providers: [
        // AuthStore thật (AuthApi cần HttpClient testing) — để verify phiên đi qua đúng cơ chế lưu.
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: { ...notify, warn: vi.fn(), info: vi.fn() } },
      ],
    });
  });

  /** Đặt phiên TRƯỚC khi render: AuthStore đọc localStorage lúc khởi tạo (component inject nó). */
  function signIn(): void {
    localStorage.setItem('isas.accessToken', MY_ACCESS);
    localStorage.setItem('isas.refreshToken', MY_REFRESH);
  }

  function render() {
    const fixture = TestBed.createComponent(InvitationLanding);
    fixture.componentRef.setInput('token', 'tok-1');
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ReturnType<typeof render>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('renders invitation metadata from the token', () => {
    const fixture = render();

    expect(api.invitation).toHaveBeenCalledWith('tok-1');
    expect(text(fixture)).toContain('Tuyển Backend .NET');
    expect(text(fixture)).toContain('Backend Developer');
    expect(text(fixture)).toContain('OOP');
  });

  // ── Q17: chưa đăng nhập ────────────────────────────────────────────────────
  // Backend gác [Authorize(Roles=Candidate)] ngay trên join và provision Candidate nằm BÊN TRONG
  // join ⇒ gọi ẩn danh chỉ nhận 401 và không có đường tự lấy token. Phải bắt đăng nhập trước.

  it('chưa đăng nhập: KHÔNG gọi join, chỉ mời đăng nhập/đăng ký', () => {
    const fixture = render();

    fixture.componentInstance.join();

    expect(api.join).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('Đăng nhập');
    expect(text(fixture)).toContain('Đăng ký');
    expect(text(fixture)).not.toContain('Tham gia phỏng vấn');
  });

  it('chưa đăng nhập: link đăng nhập/đăng ký mang returnUrl trỏ về đúng trang mời', () => {
    const fixture = render();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/auth/login?returnUrl=%2Finvite%2Ftok-1');
    expect(hrefs).toContain('/auth/register?returnUrl=%2Finvite%2Ftok-1');
  });

  it('returnUrl ENCODE token — token dạng base64 (/ + =) vẫn dựng đúng đường dẫn', () => {
    // Token thật là 256-bit CSPRNG; nếu mã hoá base64 thường thì có `/`, `+`, `=`. Không encode thì
    // `/` cắt thành segment mới ⇒ quay lại sai trang. Token 'tok-1' của các test khác encode ra
    // CHÍNH NÓ nên không phát hiện được lỗi này (mutation bỏ encodeURIComponent vẫn xanh).
    const fixture = TestBed.createComponent(InvitationLanding);
    fixture.componentRef.setInput('token', 'a/b+c==');
    fixture.detectChanges();

    expect(fixture.componentInstance.returnUrl()).toBe('/invite/a%2Fb%2Bc%3D%3D');
  });

  // GET /campaign/invitations/{token} KHÔNG trả email được mời ⇒ FE chỉ nói được ràng buộc, không
  // kiểm hộ được. Thiếu câu này thì người dùng đăng ký email khác rồi ăn 403 mà không hiểu vì sao.
  // Hai trạng thái tách thành hai test vì AuthStore đọc localStorage MỘT LẦN lúc khởi tạo — render
  // lần hai trong cùng injector vẫn thấy phiên cũ.
  it('nói rõ ràng buộc email khi CHƯA đăng nhập', () => {
    expect(text(render())).toContain('chính email đã nhận lời mời');
  });

  it('nói rõ ràng buộc email khi ĐÃ đăng nhập', () => {
    signIn();
    const fixture = render();
    TestBed.inject(HttpTestingController).expectOne(endsWith('/auth/me')).flush({ email: 'a@b.c' });
    fixture.detectChanges();

    expect(text(fixture)).toContain('chính email đã nhận lời mời');
  });

  // ── Q17: đã đăng nhập ──────────────────────────────────────────────────────

  it('đã đăng nhập: join() GIỮ NGUYÊN phiên (không ghi đè bằng token của join) rồi vào campaign', () => {
    signIn();
    const fixture = render();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endsWith('/auth/me')).flush({ email: 'moi@isas.local' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.join();

    expect(api.join).toHaveBeenCalledWith('tok-1');
    // Tiền đề ĐỔI CÓ CHỦ ĐÍCH so với bản cũ (`setAccessOnlySession(res.accessToken)`): sau hướng
    // Q17(b) người dùng đã có phiên đầy đủ, ghi đè bằng token access-only của join sẽ XOÁ
    // refreshToken → buổi phỏng vấn B2B dài hơn TTL 15' đứt giữa chừng.
    expect(localStorage.getItem('isas.accessToken')).toBe(MY_ACCESS);
    expect(localStorage.getItem('isas.refreshToken')).toBe(MY_REFRESH);
    expect(navigate).toHaveBeenCalledWith(['/candidate/campaigns', 'c1']);
    expect(notify.success).toHaveBeenCalled();
  });

  it('đã đăng nhập: hiện email đang dùng để người dùng tự đối chiếu', () => {
    signIn();
    const fixture = render();

    // UserProfile đầy đủ (không chỉ `email`) để chắc chắn component đọc ĐÚNG field email.
    const profile = {
      id: 'u1',
      fullName: 'A',
      email: 'moi@isas.local',
      location: '',
      title: '',
      createdAt: '',
      role: 'Candidate',
    };
    TestBed.inject(HttpTestingController).expectOne(endsWith('/auth/me')).flush(profile);
    fixture.detectChanges();

    expect(text(fixture)).toContain('moi@isas.local');
    expect(text(fixture)).toContain('Tham gia phỏng vấn');
  });

  it('GET /auth/me lỗi thì bỏ qua, KHÔNG chặn trang mời', () => {
    signIn();
    const fixture = render();

    TestBed.inject(HttpTestingController)
      .expectOne(endsWith('/auth/me'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text(fixture)).toContain('Tuyển Backend .NET');
    expect(text(fixture)).toContain('Tham gia phỏng vấn');
  });

  // ── Q17: 403 = tài khoản sai ────────────────────────────────────────────────

  it('join 403: hiện lý do + lối ra "Đăng nhập bằng email khác", KHÔNG chỉ chuỗi lỗi trần', () => {
    signIn();
    api.join.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { error: 'Email đăng nhập không khớp với email được mời.' },
          }),
      ),
    );
    const fixture = render();
    TestBed.inject(HttpTestingController)
      .expectOne(endsWith('/auth/me'))
      .flush({ email: 'sai@isas.local' });

    fixture.componentInstance.join();
    fixture.detectChanges();

    expect(text(fixture)).toContain('không khớp với email được mời');
    expect(text(fixture)).toContain('Đăng nhập bằng email khác');
    expect(fixture.componentInstance.joining()).toBe(false);
  });

  it('403 không có body: vẫn nói được cả hai nguyên nhân (email lệch / không phải ứng viên)', () => {
    // ASP.NET trả 403 body RỖNG khi [Authorize(Roles)] chặn ⇒ không phân biệt được nguyên nhân,
    // nói cả hai thay vì đoán một.
    signIn();
    api.join.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = render();
    TestBed.inject(HttpTestingController).expectOne(endsWith('/auth/me')).flush({ email: 'x@y.z' });

    fixture.componentInstance.join();
    fixture.detectChanges();

    expect(text(fixture)).toContain('email không khớp email được mời');
    expect(text(fixture)).toContain('không phải tài khoản ứng viên');
  });

  it('lỗi khác 403 vẫn báo snackbar như trước (vd lời mời hết hạn)', () => {
    signIn();
    api.join.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 410 })));
    const fixture = render();
    TestBed.inject(HttpTestingController).expectOne(endsWith('/auth/me')).flush({ email: 'x@y.z' });

    fixture.componentInstance.join();

    expect(notify.error).toHaveBeenCalled();
    expect(fixture.componentInstance.joinRejected()).toBeNull();
  });

  it('switchAccount(): rời phiên rồi về login mang returnUrl quay lại trang mời', () => {
    signIn();
    const fixture = render();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endsWith('/auth/me')).flush({ email: 'sai@isas.local' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.switchAccount();

    // logout() xoá storage NGAY (đồng bộ) rồi mới gọi API thu hồi → không phải chờ API mới đi được.
    expect(localStorage.getItem('isas.accessToken')).toBeNull();
    expect(localStorage.getItem('isas.refreshToken')).toBeNull();
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/invite/tok-1' },
    });
    // Thu hồi refresh token phía server là best-effort, nhưng phải THẬT sự được gọi.
    http.expectOne(endsWith('/auth/logout')).flush({});
  });
});
