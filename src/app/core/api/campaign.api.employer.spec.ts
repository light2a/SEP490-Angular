import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CampaignApi } from './campaign.api';
import { environment } from '../../../environments/environment';
import { CreateCampaignRequest } from '../models';

const BASE = `${environment.apiBase}/campaign`;

describe('CampaignApi (Employer/HR)', () => {
  let api: CampaignApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CampaignApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listCampaigns() GETs /campaign', () => {
    api.listCampaigns().subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getCampaign() GETs /campaign/{id}', () => {
    api.getCampaign('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('createCampaign() POSTs the request body to /campaign', () => {
    const body: CreateCampaignRequest = {
      title: 'T',
      antiCheatEnabled: true,
      faceVerifyEnabled: false,
      adaptiveEnabled: false,   // INT-17: bắt buộc như antiCheat/faceVerify (mặc định tắt)
      questions: [{ questionText: 'Q1', source: 'CustomHr', isRequired: true }],
    };
    api.createCampaign(body).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  // INT-17: HR bật thích ứng + trần → phải đi nguyên vẹn trong body POST (không bị API layer lọc).
  it('createCampaign() forwards the adaptive toggle and caps', () => {
    const body: CreateCampaignRequest = {
      title: 'Adaptive',
      antiCheatEnabled: false,
      faceVerifyEnabled: false,
      adaptiveEnabled: true,
      maxFollowUps: 2,
      maxQuestions: 8,
      questions: [{ questionText: 'Q1', source: 'CustomHr', isRequired: true }],
    };
    api.createCampaign(body).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.body.adaptiveEnabled).toBe(true);
    expect(req.request.body.maxFollowUps).toBe(2);
    expect(req.request.body.maxQuestions).toBe(8);
    req.flush({});
  });

  it('updateQuestions() PUTs a questions array to /campaign/{id}/questions', () => {
    const qs = [{ questionText: 'Q', source: 'CustomHr' as const, isRequired: true }];
    api.updateQuestions('c1', qs).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/questions`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(qs);
    req.flush({});
  });

  it('publishCampaign() POSTs empty body to /campaign/{id}/publish', () => {
    api.publishCampaign('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/publish`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('transitionStatus() PUTs {status} to /campaign/{id}/status', () => {
    api.transitionStatus('c1', { status: 'Closed' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/status`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'Closed' });
    req.flush({});
  });

  it('deleteCampaign() DELETEs /campaign/{id}', () => {
    api.deleteCampaign('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('createInvitations() POSTs {emails} to /campaign/{id}/invitations', () => {
    api.createInvitations('c1', { emails: ['a@b.com'] }).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ emails: ['a@b.com'] });
    req.flush({ created: [], failed: [] });
  });

  it('reissueInvitation() POSTs to /campaign/{id}/invitations/{invId}/reissue', () => {
    api.reissueInvitation('c1', 'inv1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/invitations/inv1/reissue`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('getResults() GETs /campaign/{id}/results', () => {
    api.getResults('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/results`);
    expect(req.request.method).toBe('GET');
    req.flush({ campaignId: 'c1', totalCandidates: 0, results: [] });
  });

  it('overrideResult() PUTs {score,result,note} to /results/{sessionId}/override', () => {
    api.overrideResult('c1', 's1', { score: 90, result: 'Pass', note: 'tốt' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/results/s1/override`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ score: 90, result: 'Pass', note: 'tốt' });
    req.flush(null);
  });

  // AI4 — HR drill-down transcript: đường dẫn phải nằm dưới /results/{sessionId} (org-scoped như override).
  it('getSessionTranscript() GETs /campaign/{id}/results/{sessionId}/transcript', () => {
    api.getSessionTranscript('c1', 's1').subscribe((t) => {
      expect(t.questions[0].needsReview).toBe(true);
      expect(t.questions[0].scores[0].reasoning).toBe('Ứng viên nói "…"');
    });
    const req = httpMock.expectOne(`${BASE}/c1/results/s1/transcript`);
    expect(req.request.method).toBe('GET');
    req.flush({
      sessionId: 's1',
      questions: [
        {
          questionId: 'q1',
          orderNo: 1,
          content: 'Giới thiệu bản thân',
          transcript: 'Tôi là…',
          needsReview: true,
          scores: [{ criterionId: 'cr1', score: 3, reasoning: 'Ứng viên nói "…"' }],
        },
      ],
    });
  });

  it('exportResults() GETs the CSV export as a blob', () => {
    api.exportResults('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/results/export?format=csv`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['rank\n']));
  });

  it('getCandidates() applies query filters', () => {
    api.getCandidates('c1', { status: 'Filtered', minScore: 50, sort: 'score' }).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/c1/candidates` && r.params.get('status') === 'Filtered',
    );
    expect(req.request.params.get('minScore')).toBe('50');
    expect(req.request.params.get('sort')).toBe('score');
    req.flush([]);
  });

  it('inviteShortlist() POSTs {candidateIds} to /campaign/{id}/candidates/invite', () => {
    api.inviteShortlist('c1', { candidateIds: ['x'] }).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/candidates/invite`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ candidateIds: ['x'] });
    req.flush({ invited: [], failed: [] });
  });
});
