import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { PracticeApi } from '../../../core/api/practice.api';
import { PracticeSession as SessionData } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
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
});
