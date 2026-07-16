import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'candidate/dashboard' },
  {
    path: 'auth',
    loadComponent: () => import('./layout/auth-shell/auth-shell').then((m) => m.AuthShell),
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    // Landing lời mời B2B (magic-link) — PUBLIC, ngoài shell (ứng viên có thể chưa đăng nhập).
    path: 'invite/:token',
    loadComponent: () =>
      import('./features/invite/invitation-landing').then((m) => m.InvitationLanding),
  },
  {
    // Đích PayOS redirect DÙNG CHUNG (fallback khi order không truyền returnUrl riêng): /payment/success|cancel.
    // Role-agnostic, tự đối soát theo orderCode; back-link credit theo role.
    path: 'payment/:result',
    loadComponent: () =>
      import('./features/account/payment-return').then((m) => m.PaymentReturnShared),
  },
  {
    path: 'candidate',
    canActivate: [roleGuard('Candidate')],
    loadComponent: () =>
      import('./layout/candidate-shell/candidate-shell').then((m) => m.CandidateShell),
    loadChildren: () =>
      import('./features/candidate/candidate.routes').then((m) => m.CANDIDATE_ROUTES),
  },
  {
    path: 'employer',
    canActivate: [roleGuard('Employer')],
    loadComponent: () =>
      import('./layout/employer-shell/employer-shell').then((m) => m.EmployerShell),
    loadChildren: () => import('./features/employer/employer.routes').then((m) => m.EMPLOYER_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [roleGuard('Admin')],
    loadComponent: () => import('./layout/admin-shell/admin-shell').then((m) => m.AdminShell),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: 'candidate/dashboard' },
];
