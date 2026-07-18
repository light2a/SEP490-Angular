import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AuthStore } from './auth.store';
import { AuthApi } from '../api/auth.api';
import { AuthResponse } from '../models';

/** JWT tối thiểu để decoded()/roles() có dữ liệu thật. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

function makeAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  const future = Math.floor(Date.now() / 1000) + 3600;
  return {
    accessToken: makeJwt({ sub: 'user-1', role: 'Candidate', exp: future }),
    refreshToken: 'refresh-token-1',
    expiresAt: new Date(future * 1000).toISOString(),
    ...overrides,
  };
}

describe('AuthStore', () => {
  let store: AuthStore;
  let api: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    api = { login: vi.fn(), refresh: vi.fn(), logout: vi.fn(), me: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthApi, useValue: api }],
    });
    store = TestBed.inject(AuthStore);
  });

  it('login() persists tokens to localStorage and updates signals', () => {
    const res = makeAuthResponse();
    api.login.mockReturnValue(of(res));

    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    expect(localStorage.getItem('isas.accessToken')).toBe(res.accessToken);
    expect(localStorage.getItem('isas.refreshToken')).toBe(res.refreshToken);
    expect(store.accessToken()).toBe(res.accessToken);
    expect(store.refreshToken()).toBe(res.refreshToken);
    expect(store.roles()).toEqual(['Candidate']);
    expect(store.userId()).toBe('user-1');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('refresh$() shares one in-flight observable (dedup concurrent refreshes)', () => {
    // Cần có refreshToken trước để refresh$ không throw.
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    const refreshSubject = new Subject<AuthResponse>();
    api.refresh.mockReturnValue(refreshSubject.asObservable());

    const first$ = store.refresh$();
    const second$ = store.refresh$();

    expect(first$).toBe(second$); // cùng observable đang bay
    // subscribe để kích hoạt shareReplay; nhiều subscriber vẫn 1 lần gọi API
    first$.subscribe();
    second$.subscribe();
    expect(api.refresh).toHaveBeenCalledTimes(1);

    refreshSubject.next(makeAuthResponse({ accessToken: makeJwt({ sub: 'user-1', role: 'Candidate' }) }));
    refreshSubject.complete();
  });

  it('clearSession() clears storage and resets signals', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();
    expect(store.isAuthenticated()).toBe(true);

    store.clearSession();

    expect(localStorage.getItem('isas.accessToken')).toBeNull();
    expect(localStorage.getItem('isas.refreshToken')).toBeNull();
    expect(store.accessToken()).toBeNull();
    expect(store.refreshToken()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('setAccessOnlySession() (join campaign B2B) stores access token, clears refresh, authenticated', () => {
    // Đang có session cũ đầy đủ → join campaign thay bằng JWT candidate mới (không refreshToken).
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    const joinJwt = makeJwt({ sub: 'cand-2', role: 'Candidate' });
    store.setAccessOnlySession(joinJwt);

    expect(localStorage.getItem('isas.accessToken')).toBe(joinJwt);
    expect(localStorage.getItem('isas.refreshToken')).toBeNull(); // refresh cũ bị xoá (khác user)
    expect(store.accessToken()).toBe(joinJwt);
    expect(store.refreshToken()).toBeNull();
    expect(store.isAuthenticated()).toBe(true); // access-only vẫn là đăng nhập
    expect(store.userId()).toBe('cand-2');
    expect(store.roles()).toEqual(['Candidate']);
  });

  it('logout() clears session and calls AuthApi.logout when a refresh token exists', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();
    api.logout.mockReturnValue(of({}));

    store.logout().subscribe();

    expect(api.logout).toHaveBeenCalledWith('refresh-token-1');
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('isas.refreshToken')).toBeNull();
  });

  // ── Đồng bộ phiên giữa nhiều tab ────────────────────────────────────────────
  // Mô phỏng "tab kia vừa ghi localStorage": ghi thẳng vào storage rồi bắn StorageEvent — đúng như
  // trình duyệt làm (sự kiện chỉ tới các tab KHÁC, không tới tab vừa ghi).
  function simulateOtherTabWrite(key: string | null, newValue: string | null): void {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
  }

  it('refresh$() uses the token currently in storage, not the one captured at load', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();
    api.refresh.mockReturnValue(of(makeAuthResponse({ refreshToken: 'refresh-token-3' })));

    // Tab khác vừa xoay vòng token và ghi token mới, nhưng tab này CHƯA nhận sự kiện storage.
    localStorage.setItem('isas.refreshToken', 'refresh-token-2');

    store.refresh$().subscribe();

    // Phải gửi token mới nhất trong storage — gửi token đã chụp sẵn ('refresh-token-1') thì server
    // trả 401 (token đã bị thu hồi) và người dùng bị đăng xuất oan.
    expect(api.refresh).toHaveBeenCalledWith({ refreshToken: 'refresh-token-2' });
  });

  it('adopts tokens written by another tab (storage event)', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    const rotated = makeJwt({ sub: 'user-1', role: 'Candidate' });
    localStorage.setItem('isas.accessToken', rotated);
    localStorage.setItem('isas.refreshToken', 'refresh-token-rotated');
    simulateOtherTabWrite('isas.refreshToken', 'refresh-token-rotated');

    expect(store.refreshToken()).toBe('refresh-token-rotated');
    expect(store.accessToken()).toBe(rotated);
  });

  it('clears the session when another tab logs out', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();
    expect(store.isAuthenticated()).toBe(true);

    localStorage.clear(); // tab kia đăng xuất
    simulateOtherTabWrite('isas.refreshToken', null);

    expect(store.accessToken()).toBeNull();
    expect(store.refreshToken()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('clears the session when another tab wipes storage entirely (key === null)', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    localStorage.clear();
    simulateOtherTabWrite(null, null); // localStorage.clear() ở tab khác → key null

    expect(store.isAuthenticated()).toBe(false);
  });

  it('ignores storage events for unrelated keys', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();

    localStorage.setItem('some.other.app', 'noise');
    simulateOtherTabWrite('some.other.app', 'noise');

    expect(store.refreshToken()).toBe('refresh-token-1'); // phiên không bị đụng
    expect(store.isAuthenticated()).toBe(true);
  });
});
