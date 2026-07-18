import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth.store';
import { GoogleCallback } from './google-callback';

/** JWT tối thiểu để AuthStore đọc được role (không verify chữ ký ở FE). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

/**
 * Giữ bản gốc: test cần đổi `location.search` NGAY CẢ KHI component đã spy replaceState để xoá query.
 */
const realReplaceState = history.replaceState.bind(history);

describe('GoogleCallback', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.fn>;
  let http: HttpTestingController;

  /** Giả lập backend 302 về trang này kèm query (mã dùng-một-lần, KHÔNG phải token). */
  function setQuery(query: string): void {
    realReplaceState(null, '', window.location.pathname + query);
  }

  beforeEach(() => {
    localStorage.clear();
    setQuery('');
    replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    TestBed.configureTestingModule({
      imports: [GoogleCallback],
      providers: [
        // AuthStore thật — để verify token đi qua đúng cơ chế lưu phiên sẵn có.
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    http = TestBed.inject(HttpTestingController);
    navigate = vi.fn().mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(
      navigate as unknown as Router['navigateByUrl'],
    );
  });

  afterEach(() => {
    replaceState.mockRestore();
    setQuery('');
  });

  function render() {
    const fixture = TestBed.createComponent(GoogleCallback);
    fixture.detectChanges();
    return fixture;
  }

  /** Trả lời request exchange đang bay bằng một phiên hợp lệ. */
  function flushExchange(role: string, accessToken = makeJwt({ sub: 'u', role })): void {
    http
      .expectOne((r) => r.url.endsWith('/auth/google/exchange'))
      .flush({ accessToken, refreshToken: 'rt-1', expiresAt: '2026-07-18T10:00:00Z' });
  }

  it('đổi mã lấy phiên rồi điều hướng theo role', () => {
    setQuery('?code=one-time-code');

    render();

    // Mã phải được POST lên exchange — token KHÔNG bao giờ nằm sẵn trong URL.
    const req = http.expectOne((r) => r.url.endsWith('/auth/google/exchange'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'one-time-code' });

    const accessToken = makeJwt({ sub: 'user-1', role: 'Candidate' });
    req.flush({ accessToken, refreshToken: 'rt-1', expiresAt: '2026-07-18T10:00:00Z' });

    const auth = TestBed.inject(AuthStore);
    expect(auth.accessToken()).toBe(accessToken);
    expect(auth.refreshToken()).toBe('rt-1');
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/candidate/dashboard');
  });

  it('xoá mã khỏi URL ngay để không nằm lại trong lịch sử trình duyệt', () => {
    setQuery('?code=one-time-code');

    render();

    expect(replaceState).toHaveBeenCalled();
    const url = replaceState.mock.calls[0][2] as string;
    expect(url).not.toContain('code');
    expect(url).not.toContain('?');

    flushExchange('Candidate');
  });

  it('điều hướng theo role Employer', () => {
    setQuery('?code=c2');

    render();
    flushExchange('Employer');

    expect(navigate).toHaveBeenCalledWith('/employer/dashboard');
  });

  // Mã hết hạn / đã dùng / bịa → backend trả 400. Không được đăng nhập nửa vời.
  it('mã bị backend từ chối → báo lỗi tiếng Việt, không lưu phiên', () => {
    setQuery('?code=ma-het-han');

    const fixture = render();
    http
      .expectOne((r) => r.url.endsWith('/auth/google/exchange'))
      .flush('Mã đăng nhập không hợp lệ hoặc đã hết hạn', {
        status: 400,
        statusText: 'Bad Request',
      });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('hết hạn hoặc đã được sử dụng');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hiện lỗi tiếng Việt khi backend trả ?error và không gọi exchange', () => {
    setQuery('?error=login_failed');

    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Không tạo được phiên đăng nhập');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((r) => r.url.endsWith('/auth/google/exchange'));
    // Vẫn phải xoá query kể cả khi lỗi.
    expect(replaceState).toHaveBeenCalled();
  });

  it('thiếu mã trong URL → báo lỗi, không gọi exchange', () => {
    setQuery('?foo=bar');

    const fixture = render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('không thành công');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((r) => r.url.endsWith('/auth/google/exchange'));
  });

  it('token không đọc được role → xoá phiên thay vì để guard đá ra', () => {
    setQuery('?code=c3');

    const fixture = render();
    flushExchange('Candidate', 'khong-phai-jwt');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('không thành công');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(localStorage.getItem('isas.accessToken')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('tôn trọng returnUrl tương đối backend đã lọc', () => {
    setQuery('?code=c4&returnUrl=%2Fcandidate%2Fpractice');

    render();
    flushExchange('Candidate');

    expect(navigate).toHaveBeenCalledWith('/candidate/practice');
  });
});
