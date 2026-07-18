import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isPublicAuthUrl } from '../api/http-utils';
import { AuthStore } from '../auth/auth.store';

/**
 * Gắn Bearer token cho request tới Gateway (trừ endpoint auth công khai).
 * Gặp 401 → refresh 1 lần (gộp in-flight) rồi retry; **chỉ khi CHÍNH refresh hỏng** mới clear session.
 *
 * Bug đã sửa (bắt 2026-07-19): trước đây `catchError` đặt SAU `switchMap` nên nó bắt lỗi của cả
 * refresh LẪN request được gửi lại → request retry chết vì bất kỳ lý do gì (502 tunnel, timeout,
 * mạng chớp) cũng xoá sạch phiên, dù token vừa refresh xong vẫn còn tốt. Triệu chứng: tải lại trang
 * chi tiết buổi luyện thì bị đá về /auth/login, trong khi trang danh sách thì không — vì trang chi
 * tiết gọi `/speech` mất tới ~6,4s lúc cache lạnh, đúng loại request dễ đứt giữa chừng.
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
          // catchError nằm TRƯỚC switchMap: chỉ ôm lỗi của refresh. Refresh hỏng = phiên thật sự
          // chết (refresh token bị thu hồi/hết hạn) → clear session là đúng.
          catchError((refreshErr) => {
            auth.clearSession();
            return throwError(() => refreshErr);
          }),
          // Request gửi lại nằm NGOÀI catchError trên: nó hỏng thì để lỗi nổi lên như một lỗi
          // request bình thường (component/errorInterceptor xử), KHÔNG đá người dùng ra ngoài.
          switchMap((newToken) =>
            next(authReq.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })),
          ),
        );
      }
      return throwError(() => err);
    }),
  );
};
