import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AuthResponse } from '../../../core/models';
import { Register } from './register';

/** POST /auth/register cấp role Candidate mặc định (AUTH-1) ⇒ JWT mẫu mang đúng role đó. */
const CANDIDATE_JWT =
  'h.' + btoa(JSON.stringify({ sub: 'u1', role: 'Candidate' })).replace(/=+$/, '') + '.s';
const AUTH: AuthResponse = {
  accessToken: CANDIDATE_JWT,
  refreshToken: 'rt',
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

const endsWith = (suffix: string) => (req: { url: string }) => req.url.endsWith(suffix);

describe('Register — returnUrl (Q17)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  /** Seed TRƯỚC khi tạo component: `returnUrlQuery` đọc snapshot ngay trong field initializer. */
  function seedQuery(params: Record<string, unknown>): void {
    TestBed.inject(ActivatedRoute).snapshot.queryParams = params;
  }

  function render() {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return fixture;
  }

  function submitAndCaptureUrl(fixture: ReturnType<typeof render>): string | undefined {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.form.setValue({
      fullName: 'Ứng viên A',
      email: 'a@b.c',
      password: 'Test@123456',
    });

    fixture.componentInstance.submit();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endsWith('/auth/register')).flush(AUTH);
    http.expectOne(endsWith('/auth/me')).flush({ email: 'a@b.c', fullName: 'Ứng viên A' });
    return nav.mock.calls[0]?.[0] as string | undefined;
  }

  it('không có returnUrl → giữ hành vi cũ: trang chủ theo role', () => {
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/candidate/dashboard');
  });

  it('returnUrl nội bộ → quay về trang lời mời để join ngay sau khi đăng ký', () => {
    seedQuery({ returnUrl: '/invite/tok-1' });
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/invite/tok-1');
  });

  it('returnUrl trỏ host ngoài → BỎ QUA, không mở-redirect', () => {
    seedQuery({ returnUrl: '//evil.com' });
    const fixture = render();
    expect(submitAndCaptureUrl(fixture)).toBe('/candidate/dashboard');
  });

  it('link "Đăng nhập" chuyển tiếp returnUrl', () => {
    seedQuery({ returnUrl: '/invite/tok-1' });
    const fixture = render();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/auth/login?returnUrl=%2Finvite%2Ftok-1');
  });
});
