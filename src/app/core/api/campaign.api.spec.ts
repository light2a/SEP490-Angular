import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CampaignApi } from './campaign.api';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiBase}/campaign`;

describe('CampaignApi', () => {
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

  it('invitation() GETs /invitations/{token} (token URL-encoded)', () => {
    api.invitation('tok/123').subscribe();

    const req = httpMock.expectOne(`${BASE}/invitations/tok%2F123`);
    expect(req.request.method).toBe('GET');
    req.flush({ campaignId: 'c1', title: 'T', jobTitle: 'Dev', criteria: [] });
  });

  it('join() POSTs empty body to /invitations/{token}/join', () => {
    api.join('tok-1').subscribe();

    const req = httpMock.expectOne(`${BASE}/invitations/tok-1/join`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      accessToken: 'jwt',
      campaignId: 'c1',
      candidateId: 'u1',
      membershipStatus: 'Joined',
    });
  });

  it('myCampaigns() GETs /my-campaigns and myCampaign(id) GETs /my-campaigns/{id}', () => {
    api.myCampaigns().subscribe();
    httpMock.expectOne(`${BASE}/my-campaigns`).flush([]);

    api.myCampaign('c9').subscribe();
    const req = httpMock.expectOne(`${BASE}/my-campaigns/c9`);
    expect(req.request.method).toBe('GET');
    req.flush({
      campaignId: 'c9',
      title: 'T',
      jobTitle: 'Dev',
      membershipStatus: 'Joined',
      interviewStatus: 'NotStarted',
      criteria: [],
      started: false,
    });
  });

  it('start() POSTs to /{campaignId}/start', () => {
    api.start('c1').subscribe();

    const req = httpMock.expectOne(`${BASE}/c1/start`);
    expect(req.request.method).toBe('POST');
    req.flush({ sessionId: 's1', campaignId: 'c1', questions: [], faceEnrollRequired: false });
  });

  it('reportFlag() POSTs {signalType, note} to /{campaignId}/sessions/{sessionId}/flags', () => {
    api.reportFlag('c1', 's1', 'tab_switch', 'chuyển tab 2 lần').subscribe();

    const req = httpMock.expectOne(`${BASE}/c1/sessions/s1/flags`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ signalType: 'tab_switch', note: 'chuyển tab 2 lần' });
    req.flush({});
  });

  it('faceEnroll()/faceCheck() POST multipart FormData with a `file` part', () => {
    const img = new Blob(['img-bytes'], { type: 'image/jpeg' });

    api.faceEnroll('c1', 's1', img).subscribe();
    const enroll = httpMock.expectOne(`${BASE}/c1/sessions/s1/face-enroll`);
    expect(enroll.request.method).toBe('POST');
    const enrollBody = enroll.request.body as FormData;
    expect(enrollBody).toBeInstanceOf(FormData);
    expect((enrollBody.get('file') as File).name).toBe('face.jpg');
    enroll.flush({});

    api.faceCheck('c1', 's1', img, 'shot.png').subscribe();
    const check = httpMock.expectOne(`${BASE}/c1/sessions/s1/face-check`);
    const checkBody = check.request.body as FormData;
    expect((checkBody.get('file') as File).name).toBe('shot.png');
    check.flush({ match: true, faceCount: 1, signals: [] });
  });
});
