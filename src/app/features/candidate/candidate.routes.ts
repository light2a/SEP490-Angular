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
    path: 'repo-analysis',
    loadComponent: () => import('./repo-analysis/repo-analysis').then((m) => m.RepoAnalysis),
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
  { path: 'plans', loadComponent: () => import('./plans/plans').then((m) => m.CandidatePlans) },
  { path: 'credits', loadComponent: () => import('./credits/credits').then((m) => m.Credits) },
  {
    path: 'payment/:result',
    loadComponent: () => import('./credits/payment-return').then((m) => m.PaymentReturn),
  },
  {
    path: 'subscription',
    loadComponent: () => import('./credits/my-subscription').then((m) => m.MySubscription),
  },
  // ⚠ Mọi route MỚI phải nằm TRÊN wildcard `**` — đặt dưới thì không bao giờ khớp, người dùng bị
  // đá về dashboard mà không có lỗi nào để lần ra.
  {
    path: 'files/:id',
    loadComponent: () => import('./files/file-detail').then((m) => m.FileDetail),
  },
  {
    path: 'cv-analysis/:id',
    loadComponent: () =>
      import('./cv-analysis/cv-analysis-detail').then((m) => m.CvAnalysisDetail),
  },
  {
    path: 'repo-analysis/:id',
    loadComponent: () =>
      import('./repo-analysis/repo-analysis-detail').then((m) => m.RepoAnalysisDetail),
  },
  { path: '**', redirectTo: 'dashboard' },
];
