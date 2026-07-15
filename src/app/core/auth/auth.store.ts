import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import { AuthResponse, LoginRequest, PlatformRole, RegisterRequest } from '../models';
import { decodeJwt } from './jwt.util';
import { tokenStorage } from './token-storage';

/**
 * Nguồn sự thật về phiên đăng nhập (signals). Vừa giữ token, vừa điều phối login/refresh/logout.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private authApi = inject(AuthApi);

  readonly accessToken = signal<string | null>(tokenStorage.access);
  readonly refreshToken = signal<string | null>(tokenStorage.refresh);

  readonly decoded = computed(() => decodeJwt(this.accessToken()));
  readonly userId = computed(() => this.decoded()?.userId ?? null);
  readonly roles = computed<string[]>(() => this.decoded()?.roles ?? []);
  readonly orgRole = computed(() => this.decoded()?.orgRole ?? null);
  /** Role ưu tiên hiển thị (Admin > Employer > Candidate). */
  readonly primaryRole = computed<PlatformRole | null>(() => {
    const r = this.roles();
    return ((['Admin', 'Employer', 'Candidate'] as PlatformRole[]).find((x) => r.includes(x)) ??
      null) as PlatformRole | null;
  });
  /**
   * Có refreshToken ⇒ đã đăng nhập (accessToken hết hạn sẽ tự refresh).
   * Phiên join-campaign (B2B magic-link) chỉ có accessToken → vẫn coi là đăng nhập
   * (hết hạn → 401 không refresh được → errorInterceptor đẩy về login).
   */
  readonly isAuthenticated = computed(() => !!this.refreshToken() || !!this.accessToken());

  /** Tên hiển thị lấy từ GET /me (nạp sau khi đăng nhập). */
  readonly displayName = signal<string | null>(null);

  hasRole(...roles: PlatformRole[]): boolean {
    const mine = this.roles();
    return roles.some((r) => mine.includes(r));
  }

  private setSession(res: AuthResponse): void {
    tokenStorage.set(res.accessToken, res.refreshToken);
    this.accessToken.set(res.accessToken);
    this.refreshToken.set(res.refreshToken);
  }

  /**
   * Phiên CHỈ có accessToken — dùng cho join campaign B2B (POST /campaign/invitations/{token}/join
   * trả JWT Candidate mới, KHÔNG kèm refreshToken). Thay thế session hiện tại (nếu có) vì token
   * thuộc về account candidate được provision riêng; giữ refreshToken cũ sẽ refresh nhầm user cũ.
   */
  setAccessOnlySession(accessToken: string): void {
    tokenStorage.setAccessOnly(accessToken);
    this.accessToken.set(accessToken);
    this.refreshToken.set(null);
    this.displayName.set(null);
  }

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.authApi.login(body).pipe(tap((r) => this.setSession(r)));
  }
  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.authApi.register(body).pipe(tap((r) => this.setSession(r)));
  }

  /** Nạp tên hiển thị (best-effort). */
  loadProfile(): void {
    this.authApi.me().subscribe({
      next: (p) => this.displayName.set(p.fullName || p.email),
      error: () => {},
    });
  }

  // Gộp 1 refresh đang bay để nhiều 401 đồng thời không gọi refresh nhiều lần.
  private refreshInFlight$?: Observable<string>;
  refresh$(): Observable<string> {
    if (this.refreshInFlight$) return this.refreshInFlight$;
    const rt = this.refreshToken();
    if (!rt) return throwError(() => new Error('No refresh token'));
    this.refreshInFlight$ = this.authApi.refresh({ refreshToken: rt }).pipe(
      tap((r) => this.setSession(r)),
      map((r) => r.accessToken),
      finalize(() => (this.refreshInFlight$ = undefined)),
      shareReplay(1),
    );
    return this.refreshInFlight$;
  }

  logout(): Observable<unknown> {
    const rt = this.refreshToken();
    this.clearSession();
    return rt ? this.authApi.logout(rt).pipe(map(() => true)) : of(true);
  }

  clearSession(): void {
    tokenStorage.clear();
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.displayName.set(null);
  }
}
