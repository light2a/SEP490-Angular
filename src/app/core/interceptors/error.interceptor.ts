import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { extractErrorMessage, isPublicAuthUrl } from '../api/http-utils';
import { AuthStore } from '../auth/auth.store';
import { NotifyService } from '../notify.service';

/**
 * Map mã lỗi HTTP → UX toàn cục. Chạy NGOÀI authInterceptor (đăng ký trước) để bắt lỗi cuối.
 * 402 = hết credit → điều hướng mua credit. 502 = dịch vụ phụ thuộc bận.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotifyService);
  const router = inject(Router);
  const auth = inject(AuthStore);
  const publicAuth = isPublicAuthUrl(req.url);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Endpoint auth công khai: để component tự hiển thị (không toast/redirect toàn cục).
      if (publicAuth) return throwError(() => err);

      switch (err.status) {
        case 0:
          notify.error('Không kết nối được máy chủ. Kiểm tra mạng hoặc Gateway.');
          break;
        case 401:
          // Chỉ đá về login khi phiên THẬT SỰ chết (authInterceptor đã refresh hỏng và clear session).
          // Phiên còn sống mà vẫn 401 = lỗi cục bộ của riêng request đó → báo thôi, giữ người dùng ở
          // lại trang. Trước đây mọi 401 đều điều hướng, nên một 401 thoáng qua là mất cả phiên làm
          // việc dở (bắt 2026-07-19 cùng lỗi retry-clears-session bên authInterceptor).
          if (auth.isAuthenticated()) {
            notify.error('Không thực hiện được thao tác này. Vui lòng thử lại.');
          } else {
            notify.warn('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            router.navigate(['/auth/login']);
          }
          break;
        case 402:
          // 402 từ /campaign/* (B2B start) = ORG hết credit — để feature hiển thị thông điệp
          // phù hợp thay vì đẩy đi mua credit. Còn lại: điều hướng trang mua credit đúng khu vực
          // (Employer → /employer/credits, ứng viên → /candidate/credits).
          if (!req.url.startsWith(`${environment.apiBase}/campaign`)) {
            notify.warn('Bạn đã hết credit. Vui lòng mua thêm để tiếp tục.');
            router.navigate([
              auth.primaryRole() === 'Employer' ? '/employer/credits' : '/candidate/credits',
            ]);
          }
          break;
        case 403:
          notify.error('Bạn không có quyền thực hiện thao tác này.');
          break;
        case 409:
          notify.warn(extractErrorMessage(err) ?? 'Thao tác xung đột với trạng thái hiện tại.');
          break;
        case 500:
        case 502:
        case 503:
          notify.error('Dịch vụ đang bận (AI/thanh toán). Vui lòng thử lại sau.');
          break;
        // 400 / 404: để feature tự hiển thị chi tiết.
      }
      return throwError(() => err);
    }),
  );
};
