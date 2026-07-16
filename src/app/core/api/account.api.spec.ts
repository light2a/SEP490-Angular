import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthApi } from './auth.api';
import { OrgApi } from './org.api';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiBase}/auth`;

describe('Account API (change-password + org)', () => {
  let auth: AuthApi;
  let org: OrgApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthApi);
    org = TestBed.inject(OrgApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('changePassword() POSTs {oldPassword,newPassword} to /auth/change-password', () => {
    auth.changePassword({ oldPassword: 'old1', newPassword: 'new123' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/change-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ oldPassword: 'old1', newPassword: 'new123' });
    req.flush(null);
  });

  it('org() GETs /auth/org', () => {
    org.org().subscribe();
    const req = httpMock.expectOne(`${BASE}/org`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'o1', name: 'Acme', createdAt: '', memberCount: 2 });
  });

  it('updateOrg() PUTs {name,taxCode} to /auth/org', () => {
    org.updateOrg({ name: 'New', taxCode: '999' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/org`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'New', taxCode: '999' });
    req.flush({ id: 'o1', name: 'New', taxCode: '999', createdAt: '', memberCount: 2 });
  });

  it('org() and members() hit different URLs (org vs org/members)', () => {
    org.members().subscribe();
    const req = httpMock.expectOne(`${BASE}/org/members`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
