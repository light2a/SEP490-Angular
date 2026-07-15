import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isPublicAuthUrl } from '../api/http-utils';
import { AuthStore } from '../auth/auth.store';

/**
 * Gắn Bearer token cho request tới Gateway (trừ endpoint auth công khai).
 * Gặp 401 → refresh 1 lần (gộp in-flight) rồi retry; refresh fail → clear session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const isApi = req.url.startsWith(environment.apiBase);
  const publicAuth = isPublicAuthUrl(req.url);
  const token = auth.accessToken();

  const authReq =
    token && isApi && !publicAuth
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && isApi && !publicAuth && auth.refreshToken()) {
        return auth.refresh$().pipe(
          switchMap((newToken) =>
            next(authReq.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })),
          ),
          catchError((refreshErr) => {
            auth.clearSession();
            return throwError(() => refreshErr);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
