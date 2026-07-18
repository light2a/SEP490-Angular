import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { NotifyService } from '../../../core/notify.service';
import { StartInterviewResult } from '../../../core/models';
import { CampaignInterview } from './campaign-interview';

const START: StartInterviewResult = {
  sessionId: 's1',
  campaignId: 'c1',
  antiCheatEnabled: true,
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
  let campaignApi: {
    start: ReturnType<typeof vi.fn>;
    reportFlag: ReturnType<typeof vi.fn>;
    faceEnroll: ReturnType<typeof vi.fn>;
    faceCheck: ReturnType<typeof vi.fn>;
  };
  let practiceApi: {
    get: ReturnType<typeof vi.fn>;
    uploadAnswer: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    speech: ReturnType<typeof vi.fn>;
  };
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  // Kết quả consent dialog — mặc định KHÔNG emit (of()) để smoke test không bật proctoring.
  let consent$: Observable<boolean | undefined>;

  beforeEach(() => {
    campaignApi = {
      start: vi.fn().mockReturnValue(of(START)),
      reportFlag: vi.fn().mockReturnValue(of({})),
      faceEnroll: vi.fn().mockReturnValue(of({})),
      faceCheck: vi.fn().mockReturnValue(of({ match: true, faceCount: 1, signals: [] })),
    };
    practiceApi = {
      get: vi.fn().mockReturnValue(of(practiceSession())),
      uploadAnswer: vi.fn(),
      submit: vi.fn(),
      // Avatar đọc đề gọi endpoint này; trả lỗi để test rơi vào nhánh degrade (không phát tiếng).
      speech: vi.fn().mockReturnValue(throwError(() => new Error('no tts in test'))),
    };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    consent$ = of();
    dialogOpen = vi.fn().mockReturnValue({ afterClosed: () => consent$ });

    // WebcamCapture (khi mount) gọi getUserMedia — stub để rơi vào nhánh denied, không chặn.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no camera in test')) },
    });

    TestBed.configureTestingModule({
      imports: [CampaignInterview],
      providers: [
        provideRouter([]),
        { provide: CampaignApi, useValue: campaignApi },
        { provide: PracticeApi, useValue: practiceApi },
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: { open: dialogOpen } },
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

  // ---- Anti-cheat proctoring wiring ----

  it('opens the consent dialog when anti-cheat is on; accepting wires proctoring + webcam', () => {
    consent$ = of(true); // ứng viên đồng ý giám sát
    const fixture = render();
    const cmp = fixture.componentInstance;

    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(cmp.webcamEnabled()).toBe(true);
    expect(cmp.proctor.active()).toBe(true);
    // Webcam mounted trong DOM (nhánh câu hỏi đang mở).
    expect((fixture.nativeElement as HTMLElement).querySelector('app-webcam-capture')).toBeTruthy();

    // Proctor listener hoạt động: rời cửa sổ → reportFlag focus_lost.
    window.dispatchEvent(new Event('blur'));
    expect(campaignApi.reportFlag).toHaveBeenCalledWith(
      'c1',
      's1',
      'focus_lost',
      expect.any(String),
    );

    fixture.destroy();
  });

  it('declining consent navigates back to the campaign detail and does not wire proctoring', () => {
    consent$ = of(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = render();
    const cmp = fixture.componentInstance;

    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(cmp.webcamEnabled()).toBe(false);
    expect(cmp.proctor.active()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/candidate/campaigns', 'c1']);
    expect(notify['warn']).toHaveBeenCalled();

    fixture.destroy();
  });

  it('does NOT open the consent dialog when anti-cheat is off (antiCheatEnabled=false, faceEnrollRequired=false)', () => {
    campaignApi.start.mockReturnValue(
      of({ ...START, antiCheatEnabled: false, faceEnrollRequired: false }),
    );
    const fixture = render();

    expect(dialogOpen).not.toHaveBeenCalled();
    expect(fixture.componentInstance.webcamEnabled()).toBe(false);
    fixture.destroy();
  });

  // ---- Phỏng vấn THÍCH ỨNG (INT-17) ----

  it('appends the adaptive question returned by upload and advances to it (not review stage)', () => {
    practiceApi.get.mockReturnValue(of(practiceSession(['q1']))); // resume ở q2 (seed cuối)
    practiceApi.uploadAnswer.mockReturnValue(
      of({
        answerId: 'a-q2',
        questionId: 'q2',
        status: 'Scoring',
        nextAction: 'follow_up',
        nextQuestion: {
          id: 'q3',
          orderNo: 3,
          content: 'Câu hỏi thích ứng?',
          timeLimitSec: 60,
          kind: 'FollowUp',
        },
        interviewComplete: false,
      }),
    );
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.onRecorded({ blob: new Blob(['x']), durationSec: 5 });
    cmp.upload();
    fixture.detectChanges();

    // Câu thích ứng được chèn + trở thành câu hiện tại (KHÔNG rơi vào màn tổng kết).
    expect(cmp.questions().length).toBe(3);
    expect(cmp.current()?.id).toBe('q3');
    expect(cmp.reviewStage()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Câu hỏi thích ứng?');
    expect(text).toContain('AI hỏi sâu'); // badge kind=FollowUp
    fixture.destroy();
  });

  it('goes to review stage when upload signals interviewComplete (no next question)', () => {
    practiceApi.get.mockReturnValue(of(practiceSession(['q1']))); // resume ở q2 (seed cuối)
    practiceApi.uploadAnswer.mockReturnValue(
      of({
        answerId: 'a-q2',
        questionId: 'q2',
        status: 'Scoring',
        nextAction: 'end',
        nextQuestion: null,
        interviewComplete: true,
      }),
    );
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.onRecorded({ blob: new Blob(['x']), durationSec: 5 });
    cmp.upload();
    fixture.detectChanges();

    expect(cmp.questions().length).toBe(2); // không thêm câu
    expect(cmp.reviewStage()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain(
      'Hoàn tất phần trả lời',
    );
    fixture.destroy();
  });
});
