import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { SessionTranscriptResponse } from '../../../core/models';
import { SessionTranscriptDialog } from './session-transcript-dialog';

/**
 * Tên tiêu chí ở màn transcript. Backend đã trả `criterionName` + `maxScore` từ 2026-07-18 nhưng
 * model FE thiếu hai field ⇒ màn này hiện "Tiêu chí a3f81b2c — 3" suốt từ đó.
 *
 * Hai field **nullable**: buổi chấm cũ hơn không có chúng. Bỏ nhánh dự phòng về mã rút gọn là
 * màn transcript của những buổi đó hiện trống — nên nhánh đó có test riêng.
 */
describe('SessionTranscriptDialog — tên tiêu chí', () => {
  let api: { getSessionTranscript: ReturnType<typeof vi.fn> };

  function transcript(scores: Record<string, unknown>[]): SessionTranscriptResponse {
    return {
      sessionId: 's-1',
      questions: [
        {
          questionId: 'q-1',
          orderNo: 1,
          content: 'Giải thích index trong CSDL',
          transcript: 'Index giúp tra cứu nhanh hơn…',
          needsReview: false,
          scores,
        },
      ],
    } as unknown as SessionTranscriptResponse;
  }

  function render(t: SessionTranscriptResponse) {
    api = { getSessionTranscript: vi.fn().mockReturnValue(of(t)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignApi, useValue: api },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { campaignId: 'c-1', sessionId: 's-1', candidateId: 'cand-1' },
        },
      ],
    });
    const fixture = TestBed.createComponent(SessionTranscriptDialog);
    fixture.detectChanges();
    return fixture;
  }

  it('có criterionName → hiện TÊN tiêu chí kèm thang điểm', () => {
    const fixture = render(
      transcript([
        {
          criterionId: 'a3f81b2c-1111-2222-3333-444455556666',
          criterionName: 'Kiến thức chuyên môn',
          score: 3,
          maxScore: 5,
          reasoning: 'ứng viên nói…',
        },
      ]),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Kiến thức chuyên môn');
    expect(text).toContain('3');
    expect(text).toContain('/5');
    // Không còn hiện mã rút gọn khi đã có tên thật.
    expect(text).not.toContain('Tiêu chí a3f81b2c');
  });

  it('buổi chấm CŨ (thiếu criterionName/maxScore) → về mã rút gọn, KHÔNG vỡ, vẫn thấy điểm', () => {
    const fixture = render(
      transcript([
        { criterionId: 'a3f81b2c-1111-2222-3333-444455556666', score: 3, reasoning: 'lý do' },
      ]),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Tiêu chí a3f81b2c');
    expect(text).toContain('3');
    expect(text).toContain('lý do');
  });

  it('không còn dòng ghi chú "backend chưa trả tên tiêu chí" (nay đã sai)', () => {
    const fixture = render(
      transcript([{ criterionId: 'x', criterionName: 'Giao tiếp', score: 4, maxScore: 5 }]),
    );
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Backend chưa trả tên tiêu chí',
    );
  });
});
