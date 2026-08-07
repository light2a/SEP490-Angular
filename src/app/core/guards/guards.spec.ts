import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Routes,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { authGuard, roleGuard } from './guards';
import { AuthStore } from '../auth/auth.store';
import { PlatformRole } from '../models';

interface FakeAuthStore {
  isAuthenticated: () => boolean;
  hasRole: (...r: string[]) => boolean;
  /** Guard đọc để biết đưa người sai-role về trang chủ NÀO (xem test vòng lặp bên dưới). */
  primaryRole: () => PlatformRole | null;
}

function configure(store: FakeAuthStore) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: store }],
  });
}

const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = { url: '/candidate/dashboard' } as RouterStateSnapshot;

describe('authGuard', () => {
  it('redirects to /auth/login (UrlTree) when unauthenticated', () => {
    configure({ isAuthenticated: () => false, hasRole: () => false, primaryRole: () => null });
    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.parseUrl('/auth/login'));
    expect(String(result)).toBe('/auth/login');
  });

  it('returns true when authenticated', () => {
    configure({ isAuthenticated: () => true, hasRole: () => false, primaryRole: () => null });
    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));
    expect(result).toBe(true);
  });
});

describe("roleGuard('Candidate')", () => {
  it('allows (true) when authenticated with the role', () => {
    configure({
      isAuthenticated: () => true,
      hasRole: (...r) => r.includes('Candidate'),
      primaryRole: () => 'Candidate',
    });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(result).toBe(true);
  });

  /**
   * ⚠ TIỀN ĐỀ ĐÃ ĐỔI CÓ CHỦ ĐÍCH. Test này trước đây khẳng định sai-role → `'/'`, tức nó **khoá đúng
   * hành vi gây vòng lặp redirect vô hạn**: `''` lại redirect về `candidate/dashboard` (route do chính
   * guard này gác) nên Employer/Admin bị đẩy đi đẩy lại tới khi treo tab. Nay phải là trang chủ CỦA
   * CHÍNH role đó — đó mới là điểm dừng. Không phải nới assert, mà là sửa điều đang được khoá sai.
   */
  it('sai role → trang chủ của CHÍNH role đó, KHÔNG phải "/" (chống vòng lặp redirect)', () => {
    configure({
      isAuthenticated: () => true,
      hasRole: () => false,
      primaryRole: () => 'Employer',
    });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/employer/dashboard');
  });

  it('sai role, role là Admin → /admin/dashboard', () => {
    configure({ isAuthenticated: () => true, hasRole: () => false, primaryRole: () => 'Admin' });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/admin/dashboard');
  });

  /**
   * Ca dễ bỏ sót: đã đăng nhập nhưng KHÔNG có role nào dùng được (JWT lạ / thiếu claim role).
   * `homeRouteFor(null)` trả `/candidate/dashboard` — nếu guard đưa về đó thì chính nó lại chặn tiếp
   * ⇒ vòng lặp y như cũ, chỉ khác chỗ nổ. Phải là `/auth/login` (route không có guard).
   */
  it('đã đăng nhập nhưng không có role dùng được → /auth/login (điểm dừng thật)', () => {
    configure({ isAuthenticated: () => true, hasRole: () => false, primaryRole: () => null });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/auth/login');
  });

  it('redirects to /auth/login when unauthenticated', () => {
    configure({ isAuthenticated: () => false, hasRole: () => true, primaryRole: () => null });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/auth/login');
  });
});

// ── Vòng lặp redirect: kiểm ở tầng ROUTER, không chỉ ở giá trị trả về của guard ───────────────
/**
 * Ba test ở trên chỉ chứng minh guard trả về ĐÚNG CHỖ. Chúng KHÔNG chứng minh navigation **dừng** —
 * mà "treo tab" mới là triệu chứng thật. Nên phần này đếm số lần route bị đánh giá cho MỘT lần
 * `navigateByUrl`: không vòng lặp thì đúng **1**; có vòng lặp thì con số nổ (đo trên code cũ: 26 lần
 * và vẫn đang tiếp, Angular không tự cắt).
 *
 * Route dựng INLINE, KHÔNG lazy-load: `provideRouter(routes)` với `loadComponent` thật sẽ **treo cả
 * suite** trong jsdom vì dynamic import — lúc đó "treo" là hiện tượng của harness, không phải bằng
 * chứng về app. Hình dạng vẫn giữ đúng cái nguy hiểm của `app.routes.ts`: `''` VÀ `'**'` đều đổ về
 * `candidate/dashboard`, và route đó do chính `roleGuard('Candidate')` THẬT gác.
 */
@Component({ template: 'x' })
class Dummy {}

describe('roleGuard — navigation phải DỪNG, không quay vòng', () => {
  let evaluations = 0;
  const CAP = 20;

  /** Đếm số lần route candidate bị đánh giá; quá CAP thì huỷ navigation để test kết thúc được. */
  const countAndCap: CanActivateFn = () => {
    evaluations++;
    return evaluations <= CAP;
  };

  function setup(store: FakeAuthStore) {
    evaluations = 0;
    const shape: Routes = [
      { path: '', pathMatch: 'full', redirectTo: 'candidate/dashboard' },
      {
        path: 'candidate/dashboard',
        canActivate: [countAndCap, roleGuard('Candidate')],
        component: Dummy,
      },
      { path: 'employer/dashboard', component: Dummy },
      { path: 'admin/dashboard', component: Dummy },
      { path: 'auth/login', component: Dummy },
      { path: '**', redirectTo: 'candidate/dashboard' },
    ];
    TestBed.configureTestingModule({
      providers: [provideRouter(shape), { provide: AuthStore, useValue: store }],
    });
  }

  const employer: FakeAuthStore = {
    isAuthenticated: () => true,
    hasRole: (...r) => r.includes('Employer'),
    primaryRole: () => 'Employer',
  };

  it('Employer mở /candidate/dashboard → dừng sau 1 lần, về /employer/dashboard', async () => {
    setup(employer);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/candidate/dashboard');

    expect(evaluations).toBe(1);
    expect(router.url).toBe('/employer/dashboard');
  });

  /**
   * Đây là ca phơi nhiễm rộng nhất: vì `'**'` đổ về `candidate/dashboard`, MỌI url gõ sai / bookmark
   * cũ đều đi qua đúng đường vừa treo tab — không cần người dùng bấm link khu ứng viên.
   */
  it('Employer mở URL rác (rơi vào wildcard) → dừng sau 1 lần, về /employer/dashboard', async () => {
    setup(employer);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/url-khong-ton-tai');

    expect(evaluations).toBe(1);
    expect(router.url).toBe('/employer/dashboard');
  });

  it('đã đăng nhập mà không có role dùng được → dừng, về /auth/login', async () => {
    setup({ isAuthenticated: () => true, hasRole: () => false, primaryRole: () => null });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/candidate/dashboard');

    expect(evaluations).toBe(1);
    expect(router.url).toBe('/auth/login');
  });

  it('Candidate vào khu của mình → qua bình thường, không hồi quy', async () => {
    setup({
      isAuthenticated: () => true,
      hasRole: (...r) => r.includes('Candidate'),
      primaryRole: () => 'Candidate',
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/candidate/dashboard');

    expect(evaluations).toBe(1);
    expect(router.url).toBe('/candidate/dashboard');
  });
});
