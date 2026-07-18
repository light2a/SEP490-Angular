import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import {
  AuthResponse,
  LoginRequest,
  PlatformRole,
  RegisterOrgRequest,
  RegisterRequest,
} from '../models';
import { decodeJwt } from './jwt.util';
import { TOKEN_STORAGE_KEYS, tokenStorage } from './token-storage';

/**
 * Nguồn sự thật về phiên đăng nhập (signals). Vừa giữ token, vừa điều phối login/refresh/logout.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore implements OnDestroy {
  private authApi = inject(AuthApi);

  readonly accessToken = signal<string | null>(tokenStorage.access);
  readonly refreshToken = signal<string | null>(tokenStorage.refresh);

  readonly decoded = computed(() => decodeJwt(this.accessToken()));
  readonly userId = computed(() => this.decoded()?.userId ?? null);
  readonly roles = computed<string[]>(() => this.decoded()?.roles ?? []);
  readonly orgRole = computed(() => this.decoded()?.orgRole ?? null);
  /** org_id trong JWT (user thuộc org B2B) — dùng cho gate billing/quản thành viên. */
  readonly orgId = computed(() => this.decoded()?.orgId ?? null);
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

  constructor() {
    window.addEventListener('storage', this.onStorageChanged);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.onStorageChanged);
  }

  /**
   * Đồng bộ phiên giữa các tab. Sự kiện `storage` CHỈ bắn ở tab KHÁC (trình duyệt không bắn ở chính
   * tab vừa ghi) → đây đúng là kênh nghe "tab kia vừa đổi token".
   *
   * Không đồng bộ thì mỗi tab giữ token đã chụp lúc tải trang: tab A refresh → token cũ bị thu hồi →
   * tab B vẫn cầm token chết → refresh 401 → đăng xuất oan. Mở 2 tab là dính (quay về từ PayOS gần
   * như luôn tạo tab thứ hai).
   */
  private readonly onStorageChanged = (e: StorageEvent): void => {
    // key === null nghĩa là localStorage bị clear() sạch ở tab khác → vẫn phải xử lý.
    if (
      e.key !== null &&
      e.key !== TOKEN_STORAGE_KEYS.access &&
      e.key !== TOKEN_STORAGE_KEYS.refresh
    ) {
      return;
    }

    const access = tokenStorage.access;
    const refresh = tokenStorage.refresh;

    // Tab khác đăng xuất (storage sạch token) → tab này rời phiên theo, không giữ signal trỏ token
    // đã chết. Đăng xuất ở một tab là đăng xuất cả phiên.
    if (!access && !refresh) {
      this.accessToken.set(null);
      this.refreshToken.set(null);
      this.displayName.set(null);
      return;
    }

    this.accessToken.set(access);
    this.refreshToken.set(refresh);
  };

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
  /** Đăng ký tổ chức (B2B): tạo Employer + Organization + OrgAdmin, trả JWT mang org_id/org_role. */
  registerOrg(body: RegisterOrgRequest): Observable<AuthResponse> {
    return this.authApi.registerOrg(body).pipe(tap((r) => this.setSession(r)));
  }
  /**
   * Đăng nhập Google, chặng 2: đổi mã dùng-một-lần (nhận qua URL callback) lấy phiên. Token về qua
   * response HTTP y như `login()` — KHÔNG đi qua URL — nên dùng chung `setSession`, token chỉ có
   * MỘT đường vào store/localStorage.
   */
  loginWithGoogleCode(code: string): Observable<AuthResponse> {
    return this.authApi.exchangeGoogleCode(code).pipe(tap((r) => this.setSession(r)));
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
    // Đọc token từ STORAGE tại thời điểm gọi, không dùng giá trị đã chụp vào signal lúc tải trang:
    // tab khác có thể vừa xoay vòng token và ghi token mới vào storage. Refresh bằng token cũ đã bị
    // thu hồi → 401 → người dùng bị đá về trang đăng nhập dù phiên vẫn còn hạn.
    const rt = tokenStorage.refresh;
    if (!rt) return throwError(() => new Error('No refresh token'));
    this.refreshInFlight$ = this.authApi.refresh({ refreshToken: rt }).pipe(
      tap((r) => this.setSession(r)),
      map((r) => r.accessToken),
      finalize(() => (this.refreshInFlight$ = undefined)),
      shareReplay(1),
    );
    return this.refreshInFlight$;
  }

  /**
   * Xoá phiên ở máy TRƯỚC rồi mới gọi API: access token không thu hồi được ở server (validate offline)
   * nên việc dọn storage là phần bắt buộc của đăng xuất, không được phụ thuộc API thành công.
   * Server thu hồi MỌI refresh token của user → tab khác cũng không gia hạn phiên tiếp được.
   */
  logout(): Observable<unknown> {
    const rt = tokenStorage.refresh; // đọc lúc gọi — tab khác có thể vừa xoay vòng token
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
