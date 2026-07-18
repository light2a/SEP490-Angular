import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth.store';
import { GoogleCallback } from './google-callback';

/** JWT tối thiểu để AuthStore đọc được role (không verify chữ ký ở FE). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

describe('GoogleCallback', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.fn>;

  /** Giả lập backend 302 về trang này kèm fragment. */
  function setHash(hash: string): void {
    window.location.hash = hash;
  }

  beforeEach(() => {
    localStorage.clear();
    setHash('');
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

    navigate = vi.fn().mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(
      navigate as unknown as Router['navigateByUrl'],
    );
  });

  afterEach(() => {
    replaceState.mockRestore();
    setHash('');
  });

  function render() {
    const fixture = TestBed.createComponent(GoogleCallback);
    fixture.detectChanges();
    return fixture;
  }

  it('nạp phiên từ fragment rồi điều hướng theo role', () => {
    const accessToken = makeJwt({ sub: 'user-1', role: 'Candidate' });
    setHash(`#accessToken=${accessToken}&refreshToken=rt-1&expiresAt=2026-07-18T10%3A00%3A00Z`);

    render();
    const auth = TestBed.inject(AuthStore);

    expect(auth.accessToken()).toBe(accessToken);
    expect(auth.refreshToken()).toBe('rt-1');
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/candidate/dashboard');
  });

  it('xoá fragment khỏi URL ngay để token không nằm lại trong lịch sử trình duyệt', () => {
    setHash(`#accessToken=${makeJwt({ sub: 'u', role: 'Employer' })}&refreshToken=rt-2`);

    render();

    expect(replaceState).toHaveBeenCalled();
    const url = replaceState.mock.calls[0][2] as string;
    expect(url).not.toContain('#');
    expect(url).not.toContain('accessToken');
  });

  it('điều hướng theo role Employer', () => {
    setHash(`#accessToken=${makeJwt({ sub: 'u', role: 'Employer' })}&refreshToken=rt-3`);

    render();

    expect(navigate).toHaveBeenCalledWith('/employer/dashboard');
  });

  it('hiện lỗi tiếng Việt khi backend trả #error và không lưu phiên', () => {
    setHash('#error=login_failed');

    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Không tạo được phiên đăng nhập');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    // Vẫn phải xoá fragment kể cả khi lỗi.
    expect(replaceState).toHaveBeenCalled();
  });

  it('thiếu token trong fragment → báo lỗi, không đăng nhập nửa vời', () => {
    setHash('#accessToken=only-access');

    const fixture = render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('không thành công');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('token không đọc được role → xoá phiên thay vì để guard đá ra', () => {
    setHash('#accessToken=khong-phai-jwt&refreshToken=rt-4');

    const fixture = render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('không thành công');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    expect(localStorage.getItem('isas.accessToken')).toBeNull();
  });

  it('tôn trọng returnUrl tương đối backend đã lọc', () => {
    setHash(
      `#accessToken=${makeJwt({ sub: 'u', role: 'Candidate' })}&refreshToken=rt-5&returnUrl=%2Fcandidate%2Fpractice`,
    );

    render();

    expect(navigate).toHaveBeenCalledWith('/candidate/practice');
  });
});
