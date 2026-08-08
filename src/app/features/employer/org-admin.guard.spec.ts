import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { orgAdminGuard } from './org-admin.guard';
import { AuthStore } from '../../core/auth/auth.store';

interface FakeAuthStore {
  isAuthenticated: () => boolean;
  orgRole: () => string | null;
}

function configure(store: FakeAuthStore) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: store }],
  });
}

const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = { url: '/employer/members' } as RouterStateSnapshot;

function run() {
  return TestBed.runInInjectionContext(() => orgAdminGuard(ROUTE, STATE));
}

/**
 * Sidenav đã lọc các mục OrgAdmin-only, nhưng lọc menu KHÔNG phải phân quyền: gõ thẳng URL vẫn
 * vào tới màn hình. Guard này là vế chặn thật ở phía FE.
 */
describe('orgAdminGuard', () => {
  it('OrgAdmin → cho qua', () => {
    configure({ isAuthenticated: () => true, orgRole: () => 'OrgAdmin' });
    expect(run()).toBe(true);
  });

  // Ca chính của task: đây đúng là người mà sidenav đã giấu mục đi.
  it('HrMember → chặn, đưa về dashboard khu Employer', () => {
    configure({ isAuthenticated: () => true, orgRole: () => 'HrMember' });
    expect(String(run())).toBe('/employer/dashboard');
  });

  // Employer không thuộc org nào (org_role vắng trong JWT) cũng không phải OrgAdmin.
  it('không có org_role → chặn', () => {
    configure({ isAuthenticated: () => true, orgRole: () => null });
    expect(String(run())).toBe('/employer/dashboard');
  });

  it('chưa đăng nhập → về /auth/login chứ không phải dashboard', () => {
    configure({ isAuthenticated: () => false, orgRole: () => 'OrgAdmin' });
    expect(String(run())).toBe('/auth/login');
  });

  /**
   * Đích chuyển hướng phải là khu Employer, KHÔNG phải `/`. `/` đổ về khu ứng viên rồi bị guard ở
   * đó đẩy ngược lại — đúng vòng lặp redirect đã từng làm treo tab.
   */
  it('không bao giờ đẩy về "/" hay khu ứng viên', () => {
    configure({ isAuthenticated: () => true, orgRole: () => 'HrMember' });
    const url = String(run());
    expect(url).not.toBe('/');
    expect(url).not.toContain('/candidate');
  });

  it('trả UrlTree (không phải chuỗi) để router xử đúng', () => {
    configure({ isAuthenticated: () => true, orgRole: () => 'HrMember' });
    const router = TestBed.inject(Router);
    expect(run()).toEqual(router.parseUrl('/employer/dashboard'));
  });
});
