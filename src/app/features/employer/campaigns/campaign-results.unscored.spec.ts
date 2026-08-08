import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { CampaignResults } from './campaign-results';
import { NotifyService } from '../../../core/notify.service';
import {
  CampaignResultRow,
  CampaignResultsResponse,
  UnscoredFlaggedRow,
} from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const RESULTS = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/results`;

function scoredRow(): CampaignResultRow {
  return {
    rank: 1,
    candidateId: 'cand-1',
    fullName: 'Nguyen Van A',
    email: 'a@example.com',
    sessionId: 's1',
    totalScore: 72,
    result: 'Pass',
    scoredAt: '2026-08-07T10:00:00Z',
    flags: [],
    aiScore: 72,
  };
}

function unscoredRow(partial: Partial<UnscoredFlaggedRow> = {}): UnscoredFlaggedRow {
  return {
    candidateId: 'cand-9',
    sessionId: 's9',
    fullName: 'Tran Thi B',
    email: 'b@example.com',
    flags: [{ type: 'tab_switch', count: 4, note: null }],
    ...partial,
  };
}

/**
 * R7 — ứng viên bỏ ngang KHÔNG BAO GIỜ được chấm, nên bảng xếp hạng (chỉ chứa người đã chấm)
 * giấu mất đúng nhóm hành vi đáng ngờ nhất. Backend đã trả `unscoredFlagged` từ lâu; vế FE là
 * phải hiện nó ra, kể cả khi chưa ai được chấm.
 */
describe('CampaignResults — cờ của ứng viên CHƯA CHẤM', () => {
  let httpMock: HttpTestingController;

  function setup(data: Partial<CampaignResultsResponse>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => {} }) }) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignResults);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === RESULTS).flush({
      campaignId: CAMPAIGN_ID,
      passScorePct: 50,
      totalCandidates: 0,
      results: [],
      ...data,
    });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  /**
   * Ca QUYẾT ĐỊNH: 0 người được chấm nhưng có người bị gắn cờ. Nếu khối này nằm trong nhánh
   * `@else` của "results rỗng" thì HR chỉ thấy "Chưa có ứng viên nào được chấm" và cờ biến mất —
   * đúng cái lỗ mà task sinh ra để bịt.
   */
  it('results RỖNG mà vẫn có cờ → khối cờ vẫn hiện', () => {
    const fixture = setup({ results: [], unscoredFlagged: [unscoredRow()] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(fixture.componentInstance.unscored().length).toBe(1);
    expect(text).toContain('Chưa chấm');
    expect(text).toContain('Tran Thi B');
    expect(text).toContain('Chuyển tab');
  });

  it('có cả người đã chấm lẫn người bị cờ → hiện cả hai bảng', () => {
    const fixture = setup({
      results: [scoredRow()],
      totalCandidates: 1,
      unscoredFlagged: [unscoredRow()],
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Nguyen Van A');
    expect(text).toContain('Tran Thi B');
  });

  it('không ai bị cờ → không hiện khối (không để bảng rỗng gây nhiễu)', () => {
    const fixture = setup({ results: [scoredRow()], totalCandidates: 1, unscoredFlagged: [] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(fixture.componentInstance.unscored().length).toBe(0);
    expect(text).not.toContain('Chưa chấm');
  });

  /**
   * Field là additive: một deploy backend cũ hơn không gửi nó. `mat-table` nổ với `undefined`,
   * nên chỗ đọc phải chuẩn hoá về mảng rỗng.
   */
  it('backend không gửi field → coi như rỗng, KHÔNG vỡ trang', () => {
    const fixture = setup({ results: [scoredRow()], totalCandidates: 1 });
    expect(fixture.componentInstance.unscored()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nguyen Van A');
  });

  // Danh tính có thể null (membership đường-1 cũ) → lùi về id rút gọn, không hiện ô trống.
  it('thiếu tên lẫn email → hiện id rút gọn thay vì ô trống', () => {
    const fixture = setup({
      results: [],
      unscoredFlagged: [unscoredRow({ fullName: null, email: null, candidateId: 'abcdef12-9999' })],
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('abcdef12');
  });

  it('giữ nguyên thứ tự backend trả (đã sắp nhiều-cờ-trước)', () => {
    const fixture = setup({
      results: [],
      unscoredFlagged: [
        unscoredRow({ candidateId: 'c-many', fullName: 'Nhieu Co', flags: [
          { type: 'paste', count: 9, note: null },
          { type: 'focus_lost', count: 2, note: null },
        ] }),
        unscoredRow({ candidateId: 'c-few', fullName: 'It Co' }),
      ],
    });
    const rows = fixture.componentInstance.unscored();
    expect(rows[0].fullName).toBe('Nhieu Co');
    expect(rows[1].fullName).toBe('It Co');
  });
});
