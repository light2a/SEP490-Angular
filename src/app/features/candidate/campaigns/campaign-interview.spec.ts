import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { NotifyService } from '../../../core/notify.service';
import { StartInterviewResult } from '../../../core/models';
import { CampaignInterview } from './campaign-interview';

const START: StartInterviewResult = {
  sessionId: 's1',
  campaignId: 'c1',
  faceEnrollRequired: true,
  questions: [
    { id: 'q1', orderNo: 1, content: 'Câu hỏi số một?', timeLimitSec: 60 },
    { id: 'q2', orderNo: 2, content: 'Câu hỏi số hai?', timeLimitSec: 90 },
  ],
};

/** Shape tối thiểu GET /interview/practice/sessions/{id} mà component dùng (status + questions.answer). */
function practiceSession(answeredIds: string[] = [], status = 'InProgress') {
  return {
    id: 's1',
    status,
    jobCategory: 'BE',
    createdAt: new Date().toISOString(),
    questions: START.questions.map((q) => ({
      ...q,
      answer: answeredIds.includes(q.id)
        ? { id: `a-${q.id}`, status: 'Uploaded', durationSec: 10, needsReview: false, scores: [] }
        : null,
    })),
  };
}

describe('CampaignInterview (smoke)', () => {
  let campaignApi: { start: ReturnType<typeof vi.fn> };
  let practiceApi: {
    get: ReturnType<typeof vi.fn>;
    uploadAnswer: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  };
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    campaignApi = { start: vi.fn().mockReturnValue(of(START)) };
    practiceApi = {
      get: vi.fn().mockReturnValue(of(practiceSession())),
      uploadAnswer: vi.fn(),
      submit: vi.fn(),
    };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CampaignInterview],
      providers: [
        provideRouter([]),
        { provide: CampaignApi, useValue: campaignApi },
        { provide: PracticeApi, useValue: practiceApi },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(CampaignInterview);
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges(); // chạy ngOnInit → start (of() sync) → hydrate
    return fixture;
  }

  it('starts the interview, renders the first question and exposes faceEnrollRequired', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(campaignApi.start).toHaveBeenCalledWith('c1');
    expect(text).toContain('Câu hỏi số một?');
    expect(text).toContain('Câu 1/2');
    // Hợp đồng cho agent proctoring:
    expect(cmp.faceEnrollRequired()).toBe(true);
    expect(cmp.sessionId()).toBe('s1');
    fixture.destroy();
  });

  it('resumes at the first unanswered question (q1 already answered → shows q2)', () => {
    practiceApi.get.mockReturnValue(of(practiceSession(['q1'])));
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Câu hỏi số hai?');
    expect(fixture.componentInstance.answeredCount()).toBe(1);
    fixture.destroy();
  });

  it('shows the submitted screen when the backend session is already Completed', () => {
    practiceApi.get.mockReturnValue(of(practiceSession(['q1', 'q2'], 'Completed')));
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(fixture.componentInstance.submitted()).toBe(true);
    expect(text).toContain('Đã nộp bài phỏng vấn');
    fixture.destroy();
  });

  it('shows a friendly full-page message on 402 (org out of credit)', () => {
    campaignApi.start.mockReturnValue(throwError(() => ({ status: 402, error: null })));
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('hết lượt phỏng vấn');
    fixture.destroy();
  });
});
