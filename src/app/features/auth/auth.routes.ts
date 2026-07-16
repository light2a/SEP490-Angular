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
];
