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

  it('logout() clears session and calls AuthApi.logout when a refresh token exists', () => {
    api.login.mockReturnValue(of(makeAuthResponse()));
    store.login({ email: 'a@b.c', password: 'x' }).subscribe();
    api.logout.mockReturnValue(of({}));

    store.logout().subscribe();

    expect(api.logout).toHaveBeenCalledWith('refresh-token-1');
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('isas.refreshToken')).toBeNull();
  });
});
