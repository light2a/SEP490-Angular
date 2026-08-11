import { Routes } from '@angular/router';
import { orgAdminGuard } from './org-admin.guard';

export const EMPLOYER_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.EmployerDashboard),
  },
  {
    path: 'campaigns',
    loadComponent: () => import('./campaigns/campaign-list').then((m) => m.CampaignList),
  },
  {
    path: 'campaigns/new',
    loadComponent: () => import('./campaigns/campaign-form').then((m) => m.CampaignForm),
  },
  {
    path: 'campaigns/:campaignId',
    loadComponent: () => import('./campaigns/campaign-detail').then((m) => m.CampaignDetail),
  },
  {
    path: 'campaigns/:campaignId/edit',
    loadComponent: () => import('./campaigns/campaign-form').then((m) => m.CampaignForm),
  },
  {
    path: 'campaigns/:campaignId/candidates',
    loadComponent: () => import('./candidates/candidates').then((m) => m.Candidates),
  },
  {
    path: 'campaigns/:campaignId/candidates/:candidateId',
    loadComponent: () =>
      import('./candidates/candidate-detail').then((m) => m.CandidateDetail),
  },
  {
    path: 'campaigns/:campaignId/results',
    loadComponent: () => import('./campaigns/campaign-results').then((m) => m.CampaignResults),
  },
  // 4 khu OrgAdmin-only. Sidenav đã ẩn các mục này với HrMember, nhưng ẩn menu không chặn được
  // người gõ thẳng URL — thiếu guard thì họ vào tới màn hình rồi mới ăn 403 lúc bấm nút.
  {
    path: 'members',
    canActivate: [orgAdminGuard],
    loadComponent: () => import('./members/members').then((m) => m.Members),
  },
  {
    path: 'api-keys',
    canActivate: [orgAdminGuard],
    loadComponent: () => import('./api-keys/api-keys').then((m) => m.ApiKeys),
  },
  {
    path: 'plans',
    // Nav đánh dấu orgAdminOnly nên route phải có guard tương ứng — thiếu nó thì HrMember gõ tay URL
    // vẫn vào được màn mua gói (mua gói là money-mutation, AUTH-6: HrMember → 403).
    canActivate: [orgAdminGuard],
    loadComponent: () => import('./plans/employer-plans').then((m) => m.EmployerPlans),
  },
  {
    path: 'credits',
    canActivate: [orgAdminGuard],
    loadComponent: () => import('./credits/employer-credits').then((m) => m.EmployerCredits),
  },
  {
    path: 'invoices',
    canActivate: [orgAdminGuard],
    loadComponent: () => import('./invoices/invoices').then((m) => m.EmployerInvoices),
  },
  {
    path: 'profile',
    loadComponent: () => import('../account/account-profile').then((m) => m.AccountProfile),
  },
  {
    path: 'payment/:result',
    loadComponent: () => import('./credits/employer-payment-return').then((m) => m.EmployerPaymentReturn),
  },
  {
    // Màn "Gói của tôi" dùng chung cho cả hai khu vực (backend suy chủ thuê bao từ JWT).
    // File nằm bên candidate/credits vì vòng này worker chỉ được sửa hai thư mục credits.
    path: 'subscription',
    // Nav đánh dấu orgAdminOnly nên route phải có guard tương ứng — thiếu nó thì
    // HrMember gõ tay URL vẫn vào được màn, đúng lỗ mà orgAdminGuard sinh ra để bịt.
    canActivate: [orgAdminGuard],
    loadComponent: () =>
      import('../candidate/credits/my-subscription').then((m) => m.MySubscription),
  },
  {
    path: 'campaigns/:campaignId/slots',
    loadComponent: () => import('./campaigns/campaign-slots').then((m) => m.CampaignSlots),
  },
  {
    path: 'campaigns/:campaignId/invitations',
    loadComponent: () =>
      import('./campaigns/campaign-invitations').then((m) => m.CampaignInvitations),
  },
  { path: '**', redirectTo: 'dashboard' },
];
