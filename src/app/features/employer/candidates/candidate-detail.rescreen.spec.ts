import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CandidateDetail } from './candidate-detail';
import { NotifyService } from '../../../core/notify.service';
import { CandidateDetailResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const CANDIDATE_ID = 'cand-1';
const DETAIL = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/candidates/${CANDIDATE_ID}`;
const RESCREEN = `${DETAIL}/rescreen`;

function candidate(status: string, partial: Partial<CandidateDetailResponse> = {}) {
  return {
    id: CANDIDATE_ID,
    fullName: null,
    email: 'a@example.com',
    status,
    overallMatchScore: null,
    skills: [],
    yearsExperience: null,
    summary: null,
    rejectReason: null,
    cvFileUrl: 'campaigns/c1/candidates/cand-1.pdf',
    strengths: [],
    gaps: [],
    bonusSignals: [],
    verifyQuestions: [],
    ...partial,
  } as CandidateDetailResponse;
}

/**
 * BK30 — HR đẩy lại sàng CV cho 1 ứng viên (điền tên/điểm còn thiếu, hoặc retry lần chấm hỏng).
 * Trước đó không có đường nào, phải sửa tay trong DB.
 */
describe('CandidateDetail — đẩy lại sàng CV', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(status = 'Analyzed') {
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
    const fixture = TestBed.createComponent(CandidateDetail);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentRef.setInput('candidateId', CANDIDATE_ID);
    fixture.detectChanges();
    httpMock.expectOne(DETAIL).flush(candidate(status));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // ── Cổng trạng thái phải khớp ĐÚNG 3 giá trị backend chấp nhận ──────────────
  it.each(['Filtered', 'Analyzed', 'AnalysisFailed'])('%s → cho phép đẩy lại', (status) => {
    expect(setup(status).componentInstance.canRescreen(status)).toBe(true);
  });

  /**
   * `Invited` bị chặn vì backend bỏ qua kết quả (không lật cái đã chốt) ⇒ chạy tiếp chỉ đốt token
   * Gemini rồi vứt. `Analyzing` bị chặn vì job đang bay — cũng chính là cooldown chống bấm liên tục.
   */
  it.each(['Invited', 'Analyzing', 'Rejected'])('%s → KHÔNG cho đẩy lại', (status) => {
    expect(setup(status).componentInstance.canRescreen(status)).toBe(false);
  });

  it('nút bị khoá phải NÓI LÝ DO, không xám câm', () => {
    const cmp = setup('Invited').componentInstance;
    expect(cmp.rescreenHint('Invited').toLowerCase()).toContain('đã mời');
    expect(cmp.rescreenHint('Analyzing')).toContain('Đang chấm');
    // Trạng thái được phép cũng phải có câu mô tả tác dụng.
    expect(cmp.rescreenHint('Analyzed').length).toBeGreaterThan(0);
  });

  // ── Đường thành công ────────────────────────────────────────────────────────
  it('bấm đẩy lại → POST rescreen rồi nạp lại chi tiết', () => {
    const cmp = setup('Analyzed').componentInstance;

    cmp.rescreen();

    const req = httpMock.expectOne(RESCREEN);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 202, statusText: 'Accepted' });

    // Nạp lại để trạng thái chuyển sang "Đang chấm" ngay trên màn.
    httpMock.expectOne(DETAIL).flush(candidate('Analyzing'));
    expect(notify['success']).toHaveBeenCalled();
    expect(cmp.rescreening()).toBe(false);
  });

  /**
   * 409 ở đây phần lớn là "bấm hai lần" — job đã bay. Đó là cooldown hoạt động đúng, không phải
   * hỏng hóc ⇒ cảnh báo nhẹ + nạp lại để HR thấy trạng thái mới, KHÔNG phải lỗi đỏ.
   */
  it('409 → cảnh báo (không phải error) và nạp lại trạng thái', () => {
    const cmp = setup('Analyzed').componentInstance;

    cmp.rescreen();

    httpMock
      .expectOne(RESCREEN)
      .flush(
        'Chỉ đẩy lại được ứng viên Filtered/Analyzed/AnalysisFailed (hiện: Analyzing).',
        { status: 409, statusText: 'Conflict' },
      );
    httpMock.expectOne(DETAIL).flush(candidate('Analyzing'));

    expect(notify['warn']).toHaveBeenCalled();
    expect(notify['error']).not.toHaveBeenCalled();
    expect(cmp.rescreening()).toBe(false);
  });

  it('lỗi khác (500) → báo lỗi và KHÔNG nạp lại', () => {
    const cmp = setup('Analyzed').componentInstance;

    cmp.rescreen();

    httpMock.expectOne(RESCREEN).flush('boom', { status: 500, statusText: 'Server Error' });

    expect(notify['error']).toHaveBeenCalled();
    expect(cmp.rescreening()).toBe(false);
  });
});
