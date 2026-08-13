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
const RESULTS = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/results`;

/**
 * Nhãn PHIÊN BẢN THƯỚC ĐO trên bảng xếp hạng.
 *
 * Vì sao cần: sửa mốc điểm giữa chừng làm điểm của hai nhóm **không so sánh trực tiếp được** — đúng
 * lý do `scoring_scope_version` từng ra đời. Nhưng 95% chiến dịch chỉ có một phiên bản, nên cột
 * này chỉ được xuất hiện khi bảng thật sự trộn, không thì là nhiễu.
 *
 * Và `rubricVersion = null` nghĩa là **KHÔNG BIẾT** (buổi chấm trước khi có versioning) — vẽ nó
 * thành "v1" là suy "biết" từ "không biết", đúng lỗi BK23.
 */
describe('CampaignResults — nhãn phiên bản thước đo', () => {
  let httpMock: HttpTestingController;

  function row(partial: Partial<CampaignResultRow> = {}): CampaignResultRow {
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
      ...partial,
    };
  }

  function setup(rows: CampaignResultRow[], currentRubricVersion?: number | null) {
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
    const body: CampaignResultsResponse = {
      campaignId: CAMPAIGN_ID,
      passScorePct: 50,
      totalCandidates: rows.length,
      results: rows,
      currentRubricVersion,
    };
    httpMock.expectOne((r) => r.url === RESULTS).flush(body);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('mọi dòng cùng một phiên bản → KHÔNG render cột, KHÔNG có băng cảnh báo', () => {
    const fixture = setup([
      row({ sessionId: 's1', rubricVersion: 2 }),
      row({ sessionId: 's2', rank: 2, rubricVersion: 2 }),
    ]);

    expect(fixture.componentInstance.mixedVersions()).toBe(false);
    expect(fixture.componentInstance.cols()).not.toContain('ruler');
    expect(fixture.nativeElement.querySelector('[data-testid="mixed-ruler-banner"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Thước đo');
  });

  it('backend cũ không gửi rubricVersion → im lặng như trước, không có cột nào', () => {
    const fixture = setup([row({ sessionId: 's1' }), row({ sessionId: 's2', rank: 2 })]);
    expect(fixture.componentInstance.mixedVersions()).toBe(false);
    expect(fixture.componentInstance.cols()).not.toContain('ruler');
  });

  it('hai phiên bản → có cột + băng cảnh báo "không so sánh trực tiếp được"', () => {
    const fixture = setup(
      [
        row({ sessionId: 's1', rubricVersion: 1 }),
        row({ sessionId: 's2', rank: 2, rubricVersion: 2 }),
      ],
      2,
    );

    expect(fixture.componentInstance.mixedVersions()).toBe(true);
    expect(fixture.componentInstance.cols()).toContain('ruler');
    const banner = fixture.nativeElement.querySelector('[data-testid="mixed-ruler-banner"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('không so sánh trực tiếp được');
  });

  it('rubricVersion null → chip "?" chứ KHÔNG BAO GIỜ là v1', () => {
    const fixture = setup([
      row({ sessionId: 's1', rubricVersion: 2 }),
      row({ sessionId: 's2', rank: 2, rubricVersion: null }),
    ]);

    const host = fixture.nativeElement as HTMLElement;
    const cells = Array.from(host.querySelectorAll('.chip-ruler')).map((e) =>
      e.textContent?.trim(),
    );
    expect(cells).toContain('?');
    expect(cells).not.toContain('v1');
  });

  it('dòng KHÔNG BIẾT là một nhóm riêng, không nhập vào v1', () => {
    const cmp = setup([
      row({ sessionId: 's1', rubricVersion: 1 }),
      row({ sessionId: 's2', rank: 2, rubricVersion: null }),
    ]).componentInstance;

    expect(cmp.versions()).toEqual([1, 'unknown']);
  });

  it('lọc theo phiên bản → chỉ còn ứng viên chấm bằng cùng một thước', () => {
    const cmp = setup([
      row({ sessionId: 's1', rubricVersion: 1 }),
      row({ sessionId: 's2', rank: 2, rubricVersion: 2 }),
      row({ sessionId: 's3', rank: 3, rubricVersion: 2 }),
    ]).componentInstance;

    cmp.versionFilter = 2;
    expect(cmp.rows().map((r) => r.sessionId)).toEqual(['s2', 's3']);

    cmp.versionFilter = 'all';
    expect(cmp.rows()).toHaveLength(3);
  });

  it('bảng một phiên bản: bộ lọc không được cắt mất dòng nào', () => {
    const cmp = setup([row({ sessionId: 's1', rubricVersion: 1 })]).componentInstance;
    cmp.versionFilter = 99 as number;
    expect(cmp.rows()).toHaveLength(1);
  });
});
