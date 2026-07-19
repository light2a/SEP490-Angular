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
    path: 'organizations',
    loadComponent: () =>
      import('./organizations/admin-organizations').then((m) => m.AdminOrganizations),
  },
  {
    path: 'users',
    loadComponent: () => import('./users/admin-users').then((m) => m.AdminUsers),
  },
  {
    path: 'campaigns',
    loadComponent: () => import('./campaigns/admin-campaigns').then((m) => m.AdminCampaigns),
  },
  {
    path: 'revenue',
    loadComponent: () => import('./revenue/admin-revenue').then((m) => m.AdminRevenue),
  },
  {
    path: 'orders',
    loadComponent: () => import('./orders/admin-orders').then((m) => m.AdminOrders),
  },
  {
    path: 'profile',
    loadComponent: () => import('../account/account-profile').then((m) => m.AccountProfile),
  },
  { path: '**', redirectTo: 'dashboard' },
];
