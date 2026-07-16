import { Routes } from '@angular/router';

export const CANDIDATE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'files', loadComponent: () => import('./files/files').then((m) => m.Files) },
  {
    path: 'practice',
    loadComponent: () => import('./practice/practice-list').then((m) => m.PracticeList),
  },
  {
    path: 'practice/:sessionId',
    loadComponent: () => import('./practice/practice-session').then((m) => m.PracticeSession),
  },
  {
    path: 'campaigns',
    loadComponent: () => import('./campaigns/campaign-list').then((m) => m.CampaignList),
  },
  {
    path: 'campaigns/:campaignId',
    loadComponent: () => import('./campaigns/campaign-detail').then((m) => m.CampaignDetail),
  },
  {
    path: 'campaigns/:campaignId/interview',
    loadComponent: () =>
      import('./campaigns/campaign-interview').then((m) => m.CampaignInterview),
  },
  {
    path: 'cv-analysis',
    loadComponent: () => import('./cv-analysis/cv-analysis').then((m) => m.CvAnalysis),
  },
  {
    path: 'roadmaps',
    loadComponent: () => import('./roadmaps/roadmaps').then((m) => m.Roadmaps),
  },
  {
    path: 'roadmaps/:id',
    loadComponent: () => import('./roadmaps/roadmap-detail').then((m) => m.RoadmapDetail),
  },
  { path: 'rubrics', loadComponent: () => import('./rubrics/rubrics').then((m) => m.Rubrics) },
  {
    path: 'profile',
    loadComponent: () =>
      import('../account/account-profile').then((m) => m.AccountProfile),
  },
  { path: 'credits', loadComponent: () => import('./credits/credits').then((m) => m.Credits) },
  {
    path: 'payment/:result',
    loadComponent: () => import('./credits/payment-return').then((m) => m.PaymentReturn),
  },
  { path: '**', redirectTo: 'dashboard' },
];
