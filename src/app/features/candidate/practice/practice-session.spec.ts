import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { PracticeApi } from '../../../core/api/practice.api';
import { PracticeSession as SessionData } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { AudioRecorder } from './audio-recorder';
import { PracticeSession } from './practice-session';

/**
 * Kiểm tra WIRING THẬT giữa avatar và nút ghi âm trên trang luyện B2C — không phải hợp đồng
 * từng component rời. Đây là ràng buộc đúng-sai: nếu mic mở lúc avatar đang đọc thì Whisper bóc
 * cả câu hỏi vào transcript và điểm chấm sai hoàn toàn.
 */
describe('PracticeSession — khoá ghi âm khi avatar đọc câu hỏi', () => {
  let api: {
    get: ReturnType<typeof vi.fn>;
    speech: ReturnType<typeof vi.fn>;
    uploadAnswer: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  };

  const session = (): SessionData => ({
    id: 's1',
    status: 'Ready',
    jobCategory: 'BE',
    createdAt: new Date().toISOString(),
    questions: [
      { id: 'q1', orderNo: 1, content: 'Giới thiệu bản thân?', timeLimitSec: 120, answer: null },
    ],
  });

  beforeEach(() => {
    api = {
      get: vi.fn().mockReturnValue(of(session())),
      // Subject treo = "đang tải giọng đọc": avatar phải khoá mic ngay từ lúc này.
      speech: vi.fn().mockReturnValue(new Subject<Blob>()),
      uploadAnswer: vi.fn(),
      submit: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [PracticeSession],
      providers: [
        provideRouter([]),
        { provide: PracticeApi, useValue: api },
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PracticeSession);
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.detectChanges();
    return fixture;
  }

  /** Nút ghi âm là nút duy nhất mang icon `mic`. */
  function micButton(fixture: ReturnType<typeof render>): HTMLButtonElement | null {
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    return buttons.find((b) => b.textContent?.includes('Ghi âm')) ?? null;
  }

  it('avatar đọc câu chưa trả lời đầu tiên', () => {
    render();
    expect(api.speech).toHaveBeenCalledWith('s1', 'q1');
  });

  it('nút ghi âm bị KHOÁ trong lúc avatar đang đọc', () => {
    const fixture = render();

    expect(fixture.componentInstance.avatarSpeaking()).toBe(true);
    expect(micButton(fixture)?.disabled).toBe(true);
  });

  it('TTS 502 → nút ghi âm MỞ, vẫn luyện tập bình thường', () => {
    api.speech.mockReturnValue(throwError(() => ({ status: 502 })));

    const fixture = render();

    expect(fixture.componentInstance.avatarSpeaking()).toBe(false);
    expect(micButton(fixture)?.disabled).toBe(false);
    // Câu hỏi vẫn hiển thị dạng chữ — ứng viên không bị chặn.
    expect(fixture.nativeElement.textContent).toContain('Giới thiệu bản thân?');
  });

  it('buổi đã chấm xong → không đọc gì nữa', () => {
    api.get.mockReturnValue(of({ ...session(), status: 'Scored' }));

    render();

    expect(api.speech).not.toHaveBeenCalled();
  });

  /**
   * F2 — đồng hồ đếm ngược mỗi câu. Dùng fake timer + `api.speech` lỗi để `avatarSpeaking()` = false
   * (avatar đang đọc thì đồng hồ ĐỨNG YÊN theo thiết kế, sẽ không bao giờ hết giờ).
   */
  describe('hết giờ mỗi câu', () => {
    const twoQuestions = (): SessionData => ({
      ...session(),
      questions: [
        { id: 'q1', orderNo: 1, content: 'Câu một?', timeLimitSec: 60, answer: null },
        { id: 'q2', orderNo: 2, content: 'Câu hai?', timeLimitSec: 60, answer: null },
      ],
    });

    beforeEach(() => {
      vi.useFakeTimers();
      api.speech.mockReturnValue(throwError(() => ({ status: 502 })));
      api.get.mockReturnValue(of(twoQuestions()));
    });
    afterEach(() => vi.useRealTimers());

    /**
     * Ca dễ hỏng nhất: khoá câu làm nó vĩnh viễn `!answer`, nên nếu con trỏ chỉ lọc `!q.answer` thì nó
     * đứng mãi ở câu vừa khoá ⇒ đồng hồ không bao giờ sang câu kế, cả buổi luyện chết đứng.
     */
    it('chưa ghi gì → khoá câu VÀ con trỏ nhảy sang câu kế', () => {
      const fixture = render();
      const c = fixture.componentInstance;
      expect(c.currentQuestionId()).toBe('q1');

      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();

      expect(c.isLocked('q1')).toBe(true);
      expect(c.currentQuestionId()).toBe('q2');
    });

    it('đang ghi âm → gọi stop() chứ KHÔNG upload thẳng (blob chưa sẵn sàng)', () => {
      const fixture = render();
      const recorder = fixture.debugElement.query(By.directive(AudioRecorder))
        .componentInstance as AudioRecorder;
      recorder.recording.set(true);
      const stopSpy = vi.spyOn(recorder, 'stop');

      vi.advanceTimersByTime(60_000);

      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(api.uploadAnswer).not.toHaveBeenCalled();
      // Câu KHÔNG bị khoá — người dùng có ghi, chỉ là đang chờ blob.
      expect(fixture.componentInstance.isLocked('q1')).toBe(false);
    });

    it('chưa hết giờ → không khoá gì cả', () => {
      const fixture = render();

      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();

      expect(fixture.componentInstance.isLocked('q1')).toBe(false);
      expect(fixture.componentInstance.currentQuestionId()).toBe('q1');
    });
  });

  /**
   * F1 — nhận xét của AI (`reasoning`) BE đã trả từ lâu nhưng trước đây chỉ view employer render;
   * người luyện chỉ thấy con số trần, tức là mất hẳn phần dạy được của buổi luyện.
   */
  describe('hiện nhận xét AI dưới mỗi tiêu chí', () => {
    const scoredSession = (
      scores: unknown[],
      needsReview = false,
      sampleAnswer: string | null = null,
    ): SessionData =>
      ({
        ...session(),
        status: 'Scored',
        questions: [
          {
            id: 'q1',
            orderNo: 1,
            content: 'Giới thiệu bản thân?',
            timeLimitSec: 120,
            answer: {
              id: 'a1',
              status: 'Scored',
              durationSec: 30,
              transcript: 'Tôi là ứng viên.',
              needsReview,
              scores,
              sampleAnswer,
            },
          },
        ],
      }) as SessionData;

    it('có reasoning → hiện chữ nhận xét kèm tên tiêu chí', () => {
      api.get.mockReturnValue(
        of(
          scoredSession([
            {
              criterionId: 'c1',
              criterionName: 'Giao tiếp',
              score: 7,
              reasoning: 'Trả lời rõ ràng nhưng thiếu ví dụ cụ thể.',
              rubricVersion: 1,
            },
          ]),
        ),
      );

      const text = render().nativeElement.textContent;

      expect(text).toContain('Giao tiếp');
      expect(text).toContain('Trả lời rõ ràng nhưng thiếu ví dụ cụ thể.');
    });

    it('reasoning null → hiện câu fallback, KHÔNG để trống trơ điểm', () => {
      api.get.mockReturnValue(
        of(
          scoredSession([
            { criterionId: 'c1', criterionName: 'Giao tiếp', score: 7, reasoning: null, rubricVersion: 1 },
          ]),
        ),
      );

      expect(render().nativeElement.textContent).toContain('AI không đưa ra lý do');
    });

    it('answer chưa có scores → không render khối điểm nào', () => {
      api.get.mockReturnValue(of(scoredSession([])));

      const el = render().nativeElement;

      expect(el.querySelectorAll('.score-item').length).toBe(0);
      expect(el.textContent).not.toContain('AI không đưa ra lý do');
    });

    it('needsReview → cảnh báo điểm cần xem lại', () => {
      api.get.mockReturnValue(
        of(
          scoredSession(
            [{ criterionId: 'c1', criterionName: 'Giao tiếp', score: 7, reasoning: 'ok', rubricVersion: 1 }],
            true,
          ),
        ),
      );

      expect(render().nativeElement.textContent).toContain('cần xem lại');
    });

    it('needsReview=false → KHÔNG hiện cảnh báo', () => {
      api.get.mockReturnValue(
        of(
          scoredSession([
            { criterionId: 'c1', criterionName: 'Giao tiếp', score: 7, reasoning: 'ok', rubricVersion: 1 },
          ]),
        ),
      );

      expect(render().nativeElement.textContent).not.toContain('cần xem lại');
    });
  });

  /**
   * F13 (FR07) — gợi ý câu trả lời mẫu. Nội dung do AI sinh cùng lượt chấm; phần FE phải khoá là
   * "chỉ hiện khi CÓ" — buổi chấm trước F13 (và ca AI bỏ field) trả null, mà một khối rỗng có tiêu
   * đề "Gợi ý câu trả lời mẫu" thì tệ hơn là không có gì.
   */
  describe('gợi ý câu trả lời mẫu (F13)', () => {
    const withSample = (sampleAnswer: string | null) =>
      of({
        ...session(),
        status: 'Scored',
        questions: [
          {
            id: 'q1',
            orderNo: 1,
            content: 'Giới thiệu bản thân?',
            timeLimitSec: 120,
            answer: {
              id: 'a1',
              status: 'Scored',
              durationSec: 30,
              transcript: 'Tôi là ứng viên.',
              needsReview: false,
              scores: [
                {
                  criterionId: 'c1',
                  criterionName: 'Giao tiếp',
                  score: 7,
                  reasoning: 'ok',
                  rubricVersion: 1,
                },
              ],
              sampleAnswer,
            },
          },
        ],
      } as SessionData);

    it('có sampleAnswer → hiện nội dung mẫu kèm cảnh báo tham khảo', () => {
      api.get.mockReturnValue(withSample('Theo tôi, DI là kỹ thuật tiêm phụ thuộc...'));

      const el = render().nativeElement;

      expect(el.querySelector('.sample')).toBeTruthy();
      expect(el.textContent).toContain('Theo tôi, DI là kỹ thuật tiêm phụ thuộc...');
      // Không được trình bày như đáp án chuẩn để học thuộc.
      expect(el.textContent).toContain('đừng học thuộc');
    });

    it('sampleAnswer null → KHÔNG render khối gợi ý', () => {
      api.get.mockReturnValue(withSample(null));

      const el = render().nativeElement;

      expect(el.querySelector('.sample')).toBeNull();
      expect(el.textContent).not.toContain('Gợi ý câu trả lời mẫu');
    });
  });
});
