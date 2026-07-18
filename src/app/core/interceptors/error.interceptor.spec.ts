import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor } from './error.interceptor';
import { NotifyService } from '../notify.service';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

const API = environment.apiBase;

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let notify: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
  };

  let auth: { isAuthenticated: () => boolean; primaryRole: () => string | null };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    notify = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), success: vi.fn() };
    // AuthStore GIẢ: store thật đọc localStorage dùng chung giữa các spec → nhánh 401 (nay có hỏi
    // isAuthenticated) sẽ đổi kết quả theo thứ tự chạy. Fake để test tất định.
    auth = { isAuthenticated: () => false, primaryRole: () => null };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: NotifyService, useValue: notify },
        { provide: AuthStore, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function fire(status: number, body: string | object = 'err') {
    let errored: unknown;
    http.get(`${API}/interview/x`).subscribe({ error: (e) => (errored = e) });
    httpMock.expectOne(`${API}/interview/x`).flush(body, { status, statusText: 'S' });
    return () => errored;
  }

  it('402 → navigate to /candidate/credits + warn, and error propagates', () => {
    const err = fire(402);
    expect(router.navigate).toHaveBeenCalledWith(['/candidate/credits']);
    expect(notify.warn).toHaveBeenCalledTimes(1);
    expect(err()).toBeTruthy();
  });

  it('401 + phiên ĐÃ chết → đá về /auth/login', () => {
    auth.isAuthenticated = () => false;
    fire(401);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(notify.warn).toHaveBeenCalledTimes(1);
  });

  // Phiên còn sống mà vẫn 401 = lỗi cục bộ của riêng request đó (vd retry đứt giữa chừng). Trước
  // đây mọi 401 đều điều hướng → mất cả phiên làm việc dở. Xem auth.interceptor.spec cùng bug.
  it('401 nhưng phiên CÒN SỐNG → báo lỗi, KHÔNG điều hướng', () => {
    auth.isAuthenticated = () => true;
    fire(401);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it('409 → warn with extracted message, no navigation', () => {
    fire(409, { message: 'conflict-detail' });
    expect(notify.warn).toHaveBeenCalledWith('conflict-detail');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('403 → error notify, no navigation', () => {
    fire(403);
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('public auth URL → passthrough (no notify, no navigate)', () => {
    let errored: unknown;
    http.get(`${API}/auth/login`).subscribe({ error: (e) => (errored = e) });
    httpMock.expectOne(`${API}/auth/login`).flush('bad', { status: 401, statusText: 'S' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(notify.warn).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
    expect(errored).toBeTruthy();
  });
});
