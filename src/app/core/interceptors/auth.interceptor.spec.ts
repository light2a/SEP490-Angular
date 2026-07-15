import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, Subject, finalize, shareReplay, tap } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

const API = environment.apiBase;

/** Fake AuthStore với refresh$ dedup THẬT (shareReplay in-flight) để chứng minh "refresh 1 lần / N request". */
class FakeAuthStore {
  currentToken: string | null = 'old-token';
  hasRefresh = true;
  refreshInitCount = 0;
  clearSession = vi.fn();
  refreshSubject!: Subject<string>;
  private inFlight?: Observable<string>;

  accessToken = () => this.currentToken;
  refreshToken = () => (this.hasRefresh ? 'rt' : null);

  refresh$(): Observable<string> {
    if (this.inFlight) return this.inFlight;
    this.refreshInitCount++;
    this.refreshSubject = new Subject<string>();
    this.inFlight = this.refreshSubject.asObservable().pipe(
      tap((t) => (this.currentToken = t)),
      finalize(() => (this.inFlight = undefined)),
      shareReplay(1),
    );
    return this.inFlight;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: FakeAuthStore;

  beforeEach(() => {
    store = new FakeAuthStore();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: store },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches Bearer token for apiBase non-public URLs', () => {
    http.get(`${API}/interview/practice/sessions`).subscribe();
    const req = httpMock.expectOne(`${API}/interview/practice/sessions`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
    req.flush({});
  });

  it('does NOT attach Bearer for public auth URLs', () => {
    http.get(`${API}/auth/login`).subscribe();
    const req = httpMock.expectOne(`${API}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does NOT attach Bearer for non-api URLs', () => {
    http.get('https://third-party.example.com/data').subscribe();
    const req = httpMock.expectOne('https://third-party.example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('on 401, refreshes ONCE for N concurrent requests then retries with the new token', () => {
    const done: unknown[] = [];
    http.get(`${API}/interview/a`).subscribe((r) => done.push(r));
    http.get(`${API}/interview/b`).subscribe((r) => done.push(r));

    const initial = httpMock.match(() => true);
    expect(initial.length).toBe(2);
    initial.forEach((r) => {
      expect(r.request.headers.get('Authorization')).toBe('Bearer old-token');
      r.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    });

    // Cả 2 request 401 gọi refresh$ nhưng in-flight dedup → chỉ 1 lần khởi tạo refresh.
    expect(store.refreshInitCount).toBe(1);

    store.refreshSubject.next('new-token');
    store.refreshSubject.complete();

    const retried = httpMock.match(() => true);
    expect(retried.length).toBe(2);
    retried.forEach((r) => {
      expect(r.request.headers.get('Authorization')).toBe('Bearer new-token');
      r.flush({ ok: true });
    });
    expect(done.length).toBe(2);
  });

  it('refresh failure → clearSession() called and error propagates', () => {
    let errored: unknown;
    http.get(`${API}/interview/x`).subscribe({ error: (e) => (errored = e) });
    const req = httpMock.expectOne(`${API}/interview/x`);
    req.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    store.refreshSubject.error(new Error('refresh failed'));

    expect(store.clearSession).toHaveBeenCalledTimes(1);
    expect(errored).toBeTruthy();
  });

  it('does NOT refresh on 401 for public auth URLs', () => {
    let errored: unknown;
    http.get(`${API}/auth/login`).subscribe({ error: (e) => (errored = e) });
    const req = httpMock.expectOne(`${API}/auth/login`);
    req.flush('bad creds', { status: 401, statusText: 'Unauthorized' });

    expect(store.refreshInitCount).toBe(0);
    expect(errored).toBeTruthy();
  });
});
