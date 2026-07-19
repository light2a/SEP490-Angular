import { Routes } from '@angular/router';

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
  {
    path: 'members',
    loadComponent: () => import('./members/members').then((m) => m.Members),
  },
  {
    path: 'api-keys',
    loadComponent: () => import('./api-keys/api-keys').then((m) => m.ApiKeys),
  },
  {
    path: 'credits',
    loadComponent: () => import('./credits/employer-credits').then((m) => m.EmployerCredits),
  },
  {
    path: 'invoices',
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
  { path: '**', redirectTo: 'dashboard' },
];
