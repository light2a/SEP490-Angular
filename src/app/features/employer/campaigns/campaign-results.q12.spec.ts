import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { CampaignResults } from './campaign-results';
import { NotifyService } from '../../../core/notify.service';
import { CampaignResultRow, CampaignResultsResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const SESSION_ID = 's1';
const RESULTS = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/results`;
const OVERRIDE = `${RESULTS}/${SESSION_ID}/override`;

function row(partial: Partial<CampaignResultRow> = {}): CampaignResultRow {
  return {
    rank: 1,
    candidateId: 'cand-1',
    fullName: 'Nguyen Van A',
    email: 'a@example.com',
    sessionId: SESSION_ID,
    totalScore: 72,
    result: 'Pass',
    scoredAt: '2026-08-07T10:00:00Z',
    flags: [],
    aiScore: 72,
    ...partial,
  };
}

function results(partial: Partial<CampaignResultsResponse> = {}): CampaignResultsResponse {
  return {
    campaignId: CAMPAIGN_ID,
    passScorePct: 50,
    totalCandidates: 1,
    results: [row()],
    ...partial,
  };
}

/**
 * Q12 — điểm HR chốt tay là **phần trăm 0–100**. Backend so trực tiếp với `pass_score_pct` và
 * CỐ Ý không quy đổi hộ (heuristic "score<=10 thì ×10" sẽ âm thầm biến điểm 8% thật thành 80%
 * Đạt), nên vế FE phải: (a) nói rõ thang đo tại chỗ nhập, (b) chặn số ngoài dải trước khi gửi.
 */
describe('CampaignResults — Q12 điểm HR chốt theo thang phần trăm', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(data: CampaignResultsResponse = results()) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Template có routerLink ("Quay lại") → cần Router thật, stub sẽ vỡ DI.
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => {} }) }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignResults);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === RESULTS).flush(data);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // ── Vế quyết định của task: điểm ngoài dải KHÔNG được rời khỏi client ────────
  it('điểm 150 (ngoài dải) → chặn tại client, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(row());
    cmp.editScore = 150;
    cmp.editNote = 'HR chốt lại';

    cmp.saveOverride(SESSION_ID);

    httpMock.expectNone(OVERRIDE);
    expect(notify['warn']).toHaveBeenCalledWith(expect.stringContaining('0–100'));
    // Form phải còn mở để HR sửa, không bị đóng như khi lưu thành công.
    expect(cmp.editing()).toBe(SESSION_ID);
    expect(cmp.saving()).toBe(false);
  });

  it('điểm âm → chặn tại client, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(row());
    cmp.editScore = -1;
    cmp.editNote = 'HR chốt lại';

    cmp.saveOverride(SESSION_ID);

    httpMock.expectNone(OVERRIDE);
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('điểm 80 (hợp lệ) → gửi PUT override đúng payload', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(row());
    cmp.editScore = 80;
    cmp.editNote = 'phỏng vấn tay tốt hơn AI chấm';

    cmp.saveOverride(SESSION_ID);

    const req = httpMock.expectOne(OVERRIDE);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      score: 80,
      result: null,
      note: 'phỏng vấn tay tốt hơn AI chấm',
    });
    req.flush({});
    httpMock.expectOne((r) => r.url === RESULTS).flush(results());
    expect(notify['success']).toHaveBeenCalled();
  });

  // Biên phải LỌT, không bị chặn cùng với số ngoài dải.
  it('biên 0 và 100 đều hợp lệ', () => {
    for (const score of [0, 100]) {
      const cmp = setup().componentInstance;
      cmp.startEdit(row());
      cmp.editScore = score;
      cmp.editNote = 'biên';

      cmp.saveOverride(SESSION_ID);

      const req = httpMock.expectOne(OVERRIDE);
      expect(req.request.body.score).toBe(score);
      req.flush({});
      httpMock.expectOne((r) => r.url === RESULTS).flush(results());
      TestBed.resetTestingModule();
    }
  });

  // Bỏ trống điểm là hợp lệ: HR chỉ chốt Đạt/Không đạt mà không sửa điểm.
  it('điểm để trống + chỉ chốt kết quả → vẫn gửi được', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(row());
    cmp.editScore = null;
    cmp.editResult = 'Pass';
    cmp.editNote = 'HR quyết đạt';

    cmp.saveOverride(SESSION_ID);

    const req = httpMock.expectOne(OVERRIDE);
    expect(req.request.body).toEqual({ score: null, result: 'Pass', note: 'HR quyết đạt' });
    req.flush({});
    httpMock.expectOne((r) => r.url === RESULTS).flush(results());
    expect(notify['warn']).not.toHaveBeenCalled();
  });

  it('"Về AI" không bị chặn bởi kiểm dải (score luôn null)', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(row());
    cmp.editScore = 999; // giá trị rác còn sót trong form
    cmp.editNote = '';

    cmp.clearOverride(SESSION_ID);

    const req = httpMock.expectOne(OVERRIDE);
    expect(req.request.body).toEqual({ score: null, result: null, note: 'Huỷ điều chỉnh' });
    req.flush({});
    httpMock.expectOne((r) => r.url === RESULTS).flush(results());
    expect(notify['warn']).not.toHaveBeenCalled();
  });

  // ── Nhắc thang đo phải hiện ra, không chỉ nằm trong code ─────────────────────
  it('form điều chỉnh nêu rõ thang phần trăm + ví dụ quy đổi 8/10 → 80', () => {
    const fixture = setup();
    fixture.componentInstance.startEdit(row());
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0–100');
    expect(text).toContain('80');
    expect(text).toContain('Điểm mới (%)');
  });

  it('hiện ngưỡng đạt của chiến dịch cạnh ô nhập khi campaign có đặt', () => {
    const fixture = setup(results({ passScorePct: 65 }));
    fixture.componentInstance.startEdit(row());
    fixture.detectChanges();

    const note = (fixture.nativeElement as HTMLElement).querySelector('.scale-note');
    expect(note?.textContent).toContain('65%');
  });

  it('campaign chưa đặt ngưỡng → nói rõ HR phải chọn kết quả tay, KHÔNG hiện "null%"', () => {
    const fixture = setup(results({ passScorePct: null }));
    fixture.componentInstance.startEdit(row());
    fixture.detectChanges();

    const note = (fixture.nativeElement as HTMLElement).querySelector('.scale-note');
    expect(note?.textContent).toContain('chưa đặt ngưỡng');
    expect(note?.textContent).not.toContain('null');
  });

  // Ô nhập phải mang min/max để trình duyệt cũng chặn, không chỉ dựa vào code TS.
  it('ô nhập điểm có min=0 max=100', () => {
    const fixture = setup();
    fixture.componentInstance.startEdit(row());
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="number"]',
    ) as HTMLInputElement | null;
    expect(input?.getAttribute('min')).toBe('0');
    expect(input?.getAttribute('max')).toBe('100');
  });
});
