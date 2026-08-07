import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import { RepoAnalysisResponse } from '../../../core/models';
import { RepoAnalysis } from './repo-analysis';

const URL = `${environment.apiBase}/interview/practice/repo-analysis`;

function row(partial: Partial<RepoAnalysisResponse> = {}): RepoAnalysisResponse {
  return {
    id: 'r1',
    repoUrl: 'https://github.com/owner/repo',
    repoOwner: 'owner',
    repoName: 'repo',
    jobCategory: 'BE',
    primaryLanguage: 'C#',
    stars: 12,
    languages: { 'C#': 8000, TypeScript: 2000 },
    summary: 'Repo API .NET',
    techStack: ['.NET', 'EF Core'],
    strengths: ['Có test'],
    weaknesses: ['Thiếu CI'],
    suggestions: ['Thêm CI'],
    interviewTalkingPoints: ['Nói về cách chia layer'],
    jdMatch: null,
    commitSha: 'abcdef1234567',
    createdAt: '2026-08-07T00:00:00Z',
    ...partial,
  };
}

describe('RepoAnalysis (BC18 — trang phân tích repo GitHub của ứng viên)', () => {
  let httpMock: HttpTestingController;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  function setup(initial: RepoAnalysisResponse[] = [], headers?: Record<string, string>) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RepoAnalysis);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === URL).flush(initial, { headers });
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('nạp lịch sử lúc mở trang và đọc con trỏ trang kế từ header X-Next-Cursor', () => {
    const cmp = setup([row()], { 'X-Next-Cursor': 'CUR2' }).componentInstance;
    expect(cmp.analyses().length).toBe(1);
    expect(cmp.nextCursor()).toBe('CUR2');
    expect(cmp.loading()).toBe(false);
  });

  it('loadMore() gọi trang kế theo cursor và NỐI vào danh sách (không thay cả list)', () => {
    const cmp = setup([row({ id: 'r1' })], { 'X-Next-Cursor': 'CUR2' }).componentInstance;

    cmp.loadMore();
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('cursor')).toBe('CUR2');
    req.flush([row({ id: 'r2' })]);

    expect(cmp.analyses().map((a) => a.id)).toEqual(['r1', 'r2']);
    expect(cmp.nextCursor()).toBeNull();
  });

  it('form trống → KHÔNG gọi API (đỡ một round-trip 400)', () => {
    const cmp = setup().componentInstance;
    cmp.submit();
    httpMock.expectNone((r) => r.method === 'POST');
    expect(cmp.form.controls.repoUrl.touched).toBe(true);
  });

  it('URL không phải https github.com → chặn tại form, KHÔNG gọi API', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'http://gitlab.com/o/r', jobCategory: 'BE' });
    cmp.submit();
    httpMock.expectNone((r) => r.method === 'POST');
  });

  /**
   * URL dán kèm khoảng trắng là ca THƯỜNG GẶP (copy từ thanh địa chỉ / chat). `Validators.pattern`
   * neo cả chuỗi nên nếu không chuẩn hoá trước khi validate thì form báo "sai định dạng" trên một
   * URL trông hoàn toàn đúng — người dùng không có cách nào đoán ra là do khoảng trắng vô hình.
   */
  it('submit hợp lệ → POST đúng body (trim URL dán kèm khoảng trắng, jobCategory CHUỖI, jdText null, không có jdId)', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: '  https://github.com/owner/repo  ', jobCategory: 'FE' });
    cmp.submit();

    const req = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
    expect(req.request.body).toEqual({
      repoUrl: 'https://github.com/owner/repo', // đã trim
      jobCategory: 'FE',
      jdText: null,
    });
    expect('jdId' in req.request.body).toBe(false);
    req.flush(row({ id: 'new' }));

    // Kết quả mới lên ĐẦU danh sách và mở sẵn panel — khỏi phải đi tìm.
    expect(cmp.analyses()[0].id).toBe('new');
    expect(cmp.expandedId()).toBe('new');
    expect(notify.success).toHaveBeenCalled();
  });

  it('có JD dán tay → gửi jdText (BE gate jdMatch theo "có nội dung JD")', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({
      repoUrl: 'https://github.com/owner/repo',
      jobCategory: 'BA',
      jdText: '  Cần biết BPMN  ',
    });
    cmp.submit();
    const req = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
    expect(req.request.body.jdText).toBe('Cần biết BPMN');
    req.flush(row());
  });

  /**
   * 402 = hết credit. `errorInterceptor` toàn cục đã toast + điều hướng sang trang mua credit, nên
   * component KHÔNG toast lần hai (hai popup chồng nhau nói cùng một việc), nhưng PHẢI để lại thông
   * điệp inline nói rõ mất 1 credit/lần + phải nạp thêm.
   */
  it('402 → thông điệp riêng về credit, KHÔNG toast lần hai (interceptor đã toast + điều hướng)', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'https://github.com/owner/repo', jobCategory: 'BE' });
    cmp.submit();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush({ error: 'Không đủ credit' }, { status: 402, statusText: 'Payment Required' });

    expect(cmp.error()).toContain('credit');
    expect(cmp.error()).toContain('nạp thêm');
    expect(cmp.error()).not.toContain('GitHub');
    expect(notify.error).not.toHaveBeenCalled();
    expect(cmp.submitting()).toBe(false);
  });

  /**
   * 429 = GitHub rate limit. Interceptor toàn cục KHÔNG xử mã này ⇒ nếu component im lặng thì người
   * dùng không biết vì sao thất bại. Phải khác hẳn thông điệp 402 (nạp credit không giải quyết được).
   */
  it('429 → nói rõ GitHub rate limit + mốc thử lại từ header Retry-After, và có toast', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'https://github.com/owner/repo', jobCategory: 'BE' });
    cmp.submit();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush(
        { error: 'rate limited' },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
      );

    expect(cmp.error()).toContain('GitHub');
    expect(cmp.error()).toContain('2 phút');
    expect(cmp.error()).not.toContain('nạp thêm');
    expect(notify.error).toHaveBeenCalled();
  });

  it('429 không có Retry-After → không bịa mốc thời gian', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'https://github.com/owner/repo', jobCategory: 'BE' });
    cmp.submit();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush({ error: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.error()).toContain('GitHub');
    expect(cmp.error()).not.toContain('thử lại sau khoảng');
  });

  it('502 → nói credit không bị trừ, KHÔNG toast lần hai (interceptor đã toast)', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'https://github.com/owner/repo', jobCategory: 'BE' });
    cmp.submit();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush({ error: 'ai down' }, { status: 502, statusText: 'Bad Gateway' });

    expect(cmp.error()).toContain('KHÔNG bị trừ');
    expect(notify.error).not.toHaveBeenCalled();
  });

  // 403 có HAI nghĩa (gói không bao gồm / không phải chủ) → phải dùng message của server,
  // không dán nhãn chung "không có quyền" như interceptor toàn cục.
  it('403 → dùng nguyên thông điệp server (ca gói dịch vụ không bao gồm)', () => {
    const cmp = setup().componentInstance;
    cmp.form.patchValue({ repoUrl: 'https://github.com/owner/repo', jobCategory: 'BE' });
    cmp.submit();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush(
        { error: 'Gói hiện tại không bao gồm phân tích repository.' },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(cmp.error()).toBe('Gói hiện tại không bao gồm phân tích repository.');
  });

  it('languageShares() đổi BYTES thành % và cắt còn tối đa 6 ngôn ngữ', () => {
    const cmp = setup().componentInstance;
    const shares = cmp.languageShares(row({ languages: { 'C#': 7500, TypeScript: 2500 } }));
    expect(shares).toEqual([
      { name: 'C#', pct: 75 },
      { name: 'TypeScript', pct: 25 },
    ]);

    const many: Record<string, number> = {};
    for (let i = 0; i < 10; i++) many[`L${i}`] = 100 - i;
    expect(cmp.languageShares(row({ languages: many })).length).toBe(6);
    // languages rỗng → không chia cho 0
    expect(cmp.languageShares(row({ languages: {} }))).toEqual([]);
  });
});
