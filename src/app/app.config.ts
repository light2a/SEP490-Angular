import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AVATAR_MODEL_URL } from './shared/avatar/interview-avatar';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // errorInterceptor ngoài cùng (bắt lỗi cuối), authInterceptor trong (gắn token + refresh).
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    // Avatar người thật cho màn phỏng vấn. Tự host trong `public/` chứ không trỏ CDN ngoài: buổi
    // phỏng vấn đã trừ credit thật của người dùng, không nên phụ thuộc dịch vụ bên thứ ba lúc chạy.
    // Đặt `null` (hoặc gỡ dòng này) → quay về đầu người dựng bằng hình học, không cần tải gì.
    { provide: AVATAR_MODEL_URL, useValue: '/avatar/interviewer.glb' },
  ],
};
