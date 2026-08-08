import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignDetail } from './campaign-detail';
import { NotifyService } from '../../../core/notify.service';
import { CampaignResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const DETAIL = `${environment.apiBase}/campaign/${CAMPAIGN_ID}`;
const FILES = `${DETAIL}/files`;
const DOWNLOAD = `${FILES}/download`;

function campaign(status = 'Draft', partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: CAMPAIGN_ID,
    orgId: 'o-1',
    title: 'Tuyển BE',
    domain: 'BE',
    seniority: 'Middle',
    status,
    maxCandidates: null,
    timeLimitMinutes: 30,
    maxConcurrentInterviews: 4,
    antiCheatEnabled: false,
    faceVerifyEnabled: false,
    passScorePct: null,
    adaptiveEnabled: false,
    maxFollowUps: null,
    maxQuestions: null,
    startsAt: null,
    expiresAt: null,
    questions: [],
    criteria: [],
    jdText: null,
    criteriaText: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...partial,
  } as CampaignResponse;
}

function pdf(name = 'jd.pdf'): File {
  return new File([new Blob(['%PDF-1.4'])], name, { type: 'application/pdf' });
}

describe('CampaignDetail — tài liệu JD/tiêu chí + field mới', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(status = 'Draft', partial: Partial<CampaignResponse> = {}) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignDetail);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne(DETAIL).flush(campaign(status, partial));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // ── Field mới hiện ra màn ───────────────────────────────────────────────────
  it('hiện cấp độ ứng viên và trần thi đồng thời', () => {
    const text = (setup().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cấp độ ứng viên');
    expect(text).toContain('Middle');
    expect(text).toContain('Thi cùng lúc tối đa');
  });

  it('chưa đặt trần → nói "Không giới hạn", không hiện ô trống', () => {
    const text =
      (setup('Draft', { maxConcurrentInterviews: null }).nativeElement as HTMLElement)
        .textContent ?? '';
    expect(text).toContain('Không giới hạn');
  });

  it('chiến dịch cũ không có seniority → nói rõ là mặc định', () => {
    const cmp = setup().componentInstance;
    expect(cmp.seniorityLabel(null)).toContain('Junior');
    expect(cmp.seniorityLabel(undefined)).toContain('mặc định');
  });

  it('mô tả tiêu chí đã lưu được hiện ra (trước đây 0 template render field này)', () => {
    const text =
      (setup('Draft', { criteriaText: 'Ưu tiên hệ phân tán' }).nativeElement as HTMLElement)
        .textContent ?? '';
    expect(text).toContain('Ưu tiên hệ phân tán');
  });

  // ── Upload ──────────────────────────────────────────────────────────────────
  it('chưa chọn file → chặn, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;

    cmp.uploadFiles(false);

    httpMock.expectNone((r) => r.url === FILES);
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('tải lên → POST multipart chỉ chứa file đã chọn', () => {
    const cmp = setup().componentInstance;
    cmp.pickJd([pdf()] as unknown as FileList);

    cmp.uploadFiles(false);

    const req = httpMock.expectOne(FILES);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('jdFile')).toBeInstanceOf(File);
    // Không append phần rỗng: backend sẽ bind thành IFormFile độ dài 0 thay vì null.
    expect(body.get('criteriaFile')).toBeNull();
    req.flush(campaign());
  });

  it('thay file → PUT (đường riêng, backend chỉ cho khi Draft)', () => {
    const cmp = setup().componentInstance;
    cmp.pickCriteria([pdf('crit.pdf')] as unknown as FileList);

    cmp.uploadFiles(true);

    const req = httpMock.expectOne(FILES);
    expect(req.request.method).toBe('PUT');
    req.flush(campaign());
    expect(notify['success']).toHaveBeenCalled();
  });

  it('409 lúc thay file (không còn Draft) → cảnh báo nêu lý do', () => {
    const cmp = setup().componentInstance;
    cmp.pickJd([pdf()] as unknown as FileList);

    cmp.uploadFiles(true);

    httpMock
      .expectOne(FILES)
      .flush('Cannot edit files when campaign is Active.', {
        status: 409,
        statusText: 'Conflict',
      });

    expect(notify['warn']).toHaveBeenCalled();
    expect(notify['error']).not.toHaveBeenCalled();
  });

  it('nút "Thay file" chỉ hiện khi Draft', () => {
    expect((setup('Draft').nativeElement as HTMLElement).textContent).toContain('Thay file');
    TestBed.resetTestingModule();
    expect((setup('Active').nativeElement as HTMLElement).textContent).not.toContain('Thay file');
  });

  // ── Download ────────────────────────────────────────────────────────────────
  it('tải file → POST kèm fileType ở query', () => {
    const cmp = setup().componentInstance;

    cmp.download('jd');

    const req = httpMock.expectOne((r) => r.url === DOWNLOAD);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('fileType')).toBe('jd');
    req.flush(new Blob(['%PDF']));
  });

  /**
   * 404 = chưa đính kèm file cho mục đó. Đây là trạng thái BÌNH THƯỜNG (nhập JD dạng chữ là đủ,
   * và luật text-ưu-tiên còn khiến file bị bỏ qua có chủ đích) ⇒ không được hiện lỗi đỏ.
   */
  it('404 = chưa có file → cảnh báo nhẹ, KHÔNG phải lỗi đỏ', () => {
    const cmp = setup().componentInstance;

    cmp.download('criteria');

    httpMock
      .expectOne((r) => r.url === DOWNLOAD)
      .flush(null, { status: 404, statusText: 'Not Found' });

    expect(notify['warn']).toHaveBeenCalledWith(expect.stringContaining('tiêu chí'));
    expect(notify['error']).not.toHaveBeenCalled();
    expect(cmp.busy()).toBe(false);
  });

  it('lỗi khác (500) → báo lỗi đỏ', () => {
    const cmp = setup().componentInstance;

    cmp.download('jd');

    httpMock
      .expectOne((r) => r.url === DOWNLOAD)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(notify['error']).toHaveBeenCalled();
  });

  it('nói rõ luật chữ-ưu-tiên-file để HR không tưởng file bị nuốt mất', () => {
    const text = (setup().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ưu tiên');
  });
});
