import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AuthResponse } from '../../../core/models';
import { Login } from './login';

/** JWT (payload base64url) mang role Candidate — để `primaryRole()` ra đúng khi không có returnUrl. */
const CANDIDATE_JWT =
  'h.' + btoa(JSON.stringify({ sub: 'u1', role: 'Candidate' })).replace(/=+$/, '') + '.s';
const AUTH: AuthResponse = {
  accessToken: CANDIDATE_JWT,
  refreshToken: 'rt',
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

const endsWith = (suffix: string) => (req: { url: string }) => req.url.endsWith(suffix);

describe('Login — returnUrl (Q17)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  /**
   * Seed query param TRƯỚC khi tạo component: `returnUrlQuery` đọc snapshot ngay trong field
   * initializer. Dùng ActivatedRoute THẬT (không stub) để RouterLink trong template vẫn dựng được.
   */
  function seedQuery(params: Record<string, unknown>): void {
    TestBed.inject(ActivatedRoute).snapshot.queryParams = params;
  }

  function render() {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  /** Đăng nhập thành công, trả về URL mà component đã điều hướng tới. */
  function submitAndCaptureUrl(fixture: ReturnType<typeof render>): string | undefined {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.form.setValue({ email: 'a@b.c', password: 'Test@123456' });

    fixture.componentInstance.submit();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endsWith('/auth/login')).flush(AUTH);
    // loadProfile() là best-effort, nhưng vẫn phải tiêu thụ request kẻo lẫn sang expectOne khác.
    http.expectOne(endsWith('/auth/me')).flush({ email: 'a@b.c', fullName: 'A' });
    return nav.mock.calls[0]?.[0] as string | undefined;
  }

  it('không có returnUrl → giữ hành vi cũ: trang chủ theo role', () => {
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/candidate/dashboard');
  });

  it('returnUrl nội bộ → quay về đúng đó (vd trang lời mời B2B)', () => {
    seedQuery({ returnUrl: '/invite/tok-1' });
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/invite/tok-1');
  });

  it('returnUrl trỏ host ngoài → BỎ QUA, không mở-redirect', () => {
    seedQuery({ returnUrl: '//evil.com' });
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/candidate/dashboard');
  });

  it('returnUrl dạng URL tuyệt đối → BỎ QUA', () => {
    seedQuery({ returnUrl: 'https://evil.com/invite/x' });
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/candidate/dashboard');
  });

  it('link "Tạo tài khoản" chuyển tiếp returnUrl (lối vòng không được làm mất đích)', () => {
    seedQuery({ returnUrl: '/invite/tok-1' });
    const fixture = render();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/auth/register?returnUrl=%2Finvite%2Ftok-1');
  });

  it('không có returnUrl thì link đăng ký KHÔNG mang query rác "returnUrl=null"', () => {
    const fixture = render();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/auth/register');
  });
});
