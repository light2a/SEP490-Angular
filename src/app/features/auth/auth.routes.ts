import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login) },
  { path: 'register', loadComponent: () => import('./register/register').then((m) => m.Register) },
  {
    path: 'register-org',
    loadComponent: () => import('./register-org/register-org').then((m) => m.RegisterOrg),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    // Đích backend 302 về sau khi đăng nhập Google — URL chỉ mang MÃ dùng-một-lần (`?code=`),
    // trang này đổi mã lấy token qua POST /auth/google/exchange (token không đi qua URL).
    path: 'google/callback',
    loadComponent: () => import('./google-callback/google-callback').then((m) => m.GoogleCallback),
  },
];
