import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { PlatformRole } from '../models';

/** Chặn khi chưa đăng nhập → về /auth/login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.parseUrl('/auth/login');
};

/** Chặn theo role. Chưa đăng nhập → login; sai role → về trang chủ. */
export function roleGuard(...roles: PlatformRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.parseUrl('/auth/login');
    return auth.hasRole(...roles) ? true : router.parseUrl('/');
  };
}
