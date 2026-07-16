import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/admin-dashboard').then((m) => m.AdminDashboard),
  },
  {
    path: 'packages',
    loadComponent: () => import('./packages/packages').then((m) => m.AdminPackages),
  },
  {
    path: 'billing',
    loadComponent: () => import('./billing/billing-close').then((m) => m.BillingClose),
  },
  {
    path: 'profile',
    loadComponent: () => import('../account/account-profile').then((m) => m.AccountProfile),
  },
  { path: '**', redirectTo: 'dashboard' },
];
