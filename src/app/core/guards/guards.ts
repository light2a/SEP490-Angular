import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { homeRouteFor } from '../auth/home-route';
import { PlatformRole } from '../models';

/** Chặn khi chưa đăng nhập → về /auth/login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.parseUrl('/auth/login');
};

/**
 * Chặn theo role. Chưa đăng nhập → login; sai role → **trang chủ CỦA CHÍNH họ**.
 *
 * ⚠ Trước đây vế sai-role trả `parseUrl('/')` và đó là **vòng lặp redirect vô hạn làm treo tab**:
 * `app.routes.ts` cho `''` → `candidate/dashboard`, route đó lại gác `roleGuard('Candidate')` ⇒ một
 * Employer/Admin bị đẩy `/candidate/dashboard` → `/` → `/candidate/dashboard` → … Angular KHÔNG tự
 * cắt (đo được: một lần `navigateByUrl` làm guard chạy 26 lần và vẫn đang tiếp). Phơi nhiễm rộng hơn
 * vẻ ngoài vì `'**'` cũng đổ về `candidate/dashboard` ⇒ **mọi URL gõ sai** đều treo tab với
 * Employer/Admin, không chỉ khi họ bấm link khu ứng viên.
 *
 * Vòng dừng được vì `homeRouteFor` map mỗi role về ĐÚNG khu của role đó, và guard khu đó nhận role
 * đó ⇒ lần chuyển hướng thứ hai luôn đi qua.
 *
 * ⚠ Nhưng `homeRouteFor(null)` trả `/candidate/dashboard`, nên nếu chỉ đổi sang
 * `homeRouteFor(primaryRole())` thì token KHÔNG có role nào dùng được (JWT lạ / thiếu claim role) sẽ
 * quay vòng y như cũ — chỉ khác chỗ nổ. Ca đó phải đi `/auth/login` (route không có guard, điểm
 * dừng thật), chứ không phải một trang mà chính guard này sẽ chặn lại.
 */
export function roleGuard(...roles: PlatformRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.parseUrl('/auth/login');
    if (auth.hasRole(...roles)) return true;

    const role = auth.primaryRole();
    return router.parseUrl(role ? homeRouteFor(role) : '/auth/login');
  };
}
