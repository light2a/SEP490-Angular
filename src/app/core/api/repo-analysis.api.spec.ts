import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RepoAnalysisRequest } from '../models';
import { RepoAnalysisApi } from './repo-analysis.api';

const BASE = `${environment.apiBase}/interview/practice/repo-analysis`;

describe('RepoAnalysisApi (BC18 — phân tích repo GitHub)', () => {
  let api: RepoAnalysisApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(RepoAnalysisApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * 🔴 Test QUAN TRỌNG NHẤT file này. Controller khai `[Route("api/practice/repo-analysis")]` nhưng
   * gateway thêm segment `interview` ⇒ đường thật là `/api/v1/interview/practice/repo-analysis`.
   * Gọi thiếu `interview` ra 404, và 404 đó rất dễ bị đọc thành "backend chưa làm xong" — đã có
   * cả một vòng e2e mất thời gian vì đúng kiểu nhầm này. Khoá cứng chuỗi URL tại đây.
   */
  it('mọi endpoint đi qua prefix gateway /interview/practice/repo-analysis', () => {
    api.list().subscribe();
    expect(httpMock.expectOne((r) => r.url === BASE).request.url).toContain(
      '/interview/practice/repo-analysis',
    );
    httpMock.expectNone((r) => r.url.includes('/practice/repo-analysis/api'));
    httpMock.verify();

    api.create({ repoUrl: 'https://github.com/o/r', jobCategory: 'BE' }).subscribe();
    expect(httpMock.expectOne(BASE).request.url).toBe(BASE);
    httpMock.verify();

    api.get('a1').subscribe();
    expect(httpMock.expectOne(`${BASE}/a1`).request.url).toBe(`${BASE}/a1`);
  });

  it('create() POST body gửi jobCategory dạng CHUỖI (quy ước enum Interview)', () => {
    const body: RepoAnalysisRequest = {
      repoUrl: 'https://github.com/angular/angular',
      jobCategory: 'FE',
      jdText: null,
    };
    api.create(body).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    // Chuỗi, không phải số — Payment mới serialize enum thành số, Interview thì CHUỖI.
    expect(req.request.body.jobCategory).toBe('FE');
    expect(typeof req.request.body.jobCategory).toBe('string');
    req.flush({});
  });

  /**
   * BE khai `JdId` trong DTO nhưng `RepoAnalysisService` KHÔNG đọc nó. Gửi lên thì người dùng tưởng
   * file JD đã được tính vào độ khớp, trong khi thực tế bị bỏ ⇒ hợp đồng cấm gửi.
   */
  it('create() KHÔNG gửi jdId (BE khai nhưng chưa dùng)', () => {
    api.create({ repoUrl: 'https://github.com/o/r', jobCategory: 'BA', jdText: 'JD' }).subscribe();
    const req = httpMock.expectOne(BASE);
    expect('jdId' in req.request.body).toBe(false);
    req.flush({});
  });

  it('list() đọc con trỏ trang kế từ header X-Next-Cursor (keyset DB8)', () => {
    let page: { items: unknown[]; nextCursor: string | null } | undefined;
    api.list().subscribe((p) => (page = p));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'r1' }], { headers: { 'X-Next-Cursor': 'cur-2' } });

    expect(page!.items.length).toBe(1);
    expect(page!.nextCursor).toBe('cur-2');
  });

  it('list() không có header X-Next-Cursor → nextCursor null (hết trang)', () => {
    let page: { nextCursor: string | null } | undefined;
    api.list().subscribe((p) => (page = p));
    httpMock.expectOne(BASE).flush([]);
    expect(page!.nextCursor).toBeNull();
  });

  it('list({cursor,limit}) gửi cursor + limit dạng query param (opt-in)', () => {
    api.list({ cursor: 'c9', limit: 20 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('cursor')).toBe('c9');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush([]);
  });

  it('list() không truyền gì → KHÔNG gửi cursor/limit (giữ hành vi mặc định của BE)', () => {
    api.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('cursor')).toBe(false);
    expect(req.request.params.has('limit')).toBe(false);
    req.flush([]);
  });
});
