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
    path: 'candidate',
    canActivate: [roleGuard('Candidate')],
    loadComponent: () =>
      import('./layout/candidate-shell/candidate-shell').then((m) => m.CandidateShell),
    loadChildren: () =>
      import('./features/candidate/candidate.routes').then((m) => m.CANDIDATE_ROUTES),
  },
  { path: '**', redirectTo: 'candidate/dashboard' },
];
