import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { PracticeApi } from '../../core/api/practice.api';
import { AvatarScene } from './avatar-scene';
import { InterviewAvatar } from './interview-avatar';

/**
 * Trọng tâm của bộ test này KHÔNG phải hình ảnh 3D (mắt người mới kiểm được) mà là các bất biến
 * đúng-sai: avatar nói thì KHÔNG được ghi âm, TTS hỏng thì vẫn phỏng vấn được, và không có WebGL
 * thì trang không vỡ.
 */
describe('InterviewAvatar', () => {
  let api: { speech: ReturnType<typeof vi.fn> };

  /** Blob giả cho giọng đọc — nội dung không quan trọng, chỉ cần đi qua được đường phát. */
  const mp3 = () => new Blob(['fake-mp3'], { type: 'audio/mpeg' });

  beforeEach(() => {
    api = { speech: vi.fn().mockReturnValue(of(mp3())) };

    // jsdom không có Web Audio / object URL / play() → stub để đường thành công không văng lỗi.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [InterviewAvatar],
      providers: [{ provide: PracticeApi, useValue: api }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function make(questionId: string | null = 'q1', locked = false) {
    const fixture = TestBed.createComponent(InterviewAvatar);
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('questionId', questionId);
    fixture.componentRef.setInput('locked', locked);
    return fixture;
  }

  it('tải giọng đọc câu hỏi qua API (blob, không dùng <audio src> vì endpoint đòi JWT)', () => {
    const fixture = make('q1');
    fixture.detectChanges();

    expect(api.speech).toHaveBeenCalledWith('s1', 'q1');
  });

  // ---- RÀNG BUỘC CỨNG: không bao giờ vừa phát tiếng vừa ghi âm ----

  it('speaking() bật NGAY khi bắt đầu tải giọng đọc (khoá ghi âm trước cả lúc có tiếng)', () => {
    const pending = new Subject<Blob>();
    api.speech.mockReturnValue(pending);

    const fixture = make('q1');
    fixture.detectChanges();

    // Vẫn đang tải, chưa phát tiếng — nhưng nút ghi âm phải bị khoá rồi.
    expect(fixture.componentInstance.speaking()).toBe(true);
  });

  it('speaking() vẫn bật trong lúc đang phát và tắt khi audio kết thúc', async () => {
    const fixture = make('q1');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    await Promise.resolve();

    expect(cmp.speaking()).toBe(true);

    // Audio phát xong → mở khoá ghi âm.
    (cmp as unknown as { speech: { onEnded?: () => void } }).speech.onEnded?.();
    expect(cmp.speaking()).toBe(false);
  });

  it('stopSpeaking() dừng phát ngay và mở khoá ghi âm (ứng viên bấm ghi âm sớm)', async () => {
    const fixture = make('q1');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    await Promise.resolve();

    cmp.stopSpeaking();

    expect(cmp.speaking()).toBe(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('locked=true (đang ghi âm) → KHÔNG phát giọng đọc và cấm nghe lại', () => {
    const fixture = make('q1', true);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    expect(cmp.speaking()).toBe(false);
    expect(cmp.canReplay()).toBe(false);
    expect(api.speech).not.toHaveBeenCalled();
  });

  it('giọng đọc về ĐÚNG lúc ứng viên đã bắt đầu ghi âm → không phát nữa', async () => {
    const pending = new Subject<Blob>();
    api.speech.mockReturnValue(pending);
    const fixture = make('q1');
    fixture.detectChanges();

    // Ứng viên bấm ghi âm trong lúc chờ tải.
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    pending.next(mp3());

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(fixture.componentInstance.speaking()).toBe(false);
  });

  // ---- Degrade: hỏng gì cũng KHÔNG được chặn phỏng vấn ----

  it('TTS trả 502 → ẩn nhân vật, mở khoá ghi âm, không ném lỗi (vẫn phỏng vấn được)', () => {
    api.speech.mockReturnValue(throwError(() => ({ status: 502 })));

    const fixture = make('q1');
    expect(() => fixture.detectChanges()).not.toThrow();

    const cmp = fixture.componentInstance;
    expect(cmp.ttsFailed()).toBe(true);
    expect(cmp.speaking()).toBe(false); // KHÔNG kẹt khoá ghi âm
    expect(cmp.showCharacter()).toBe(false);
  });

  it('không có WebGL → ẩn canvas 3D, trang không vỡ', () => {
    vi.spyOn(AvatarScene, 'isWebGLAvailable').mockReturnValue(false);

    const fixture = make('q1');
    expect(() => fixture.detectChanges()).not.toThrow();

    expect(fixture.componentInstance.webglAvailable()).toBe(false);
    expect(fixture.componentInstance.showCharacter()).toBe(false);
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('lỗi đồng bộ từ tầng API cũng không làm vỡ trang', () => {
    api.speech.mockImplementation(() => {
      throw new Error('boom');
    });

    const fixture = make('q1');
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance.speaking()).toBe(false);
  });

  // ---- Điều khiển của người dùng ----

  it('tắt tiếng → dừng phát, không gọi TTS cho câu sau', () => {
    const fixture = make('q1');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.toggleMute();
    expect(cmp.muted()).toBe(true);
    expect(cmp.speaking()).toBe(false);

    api.speech.mockClear();
    fixture.componentRef.setInput('questionId', 'q2');
    fixture.detectChanges();
    expect(api.speech).not.toHaveBeenCalled();
  });

  it('nghe lại dùng blob đã cache — không gọi lại TTS (đỡ tốn tiền mỗi lần nghe)', async () => {
    const fixture = make('q1');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    await Promise.resolve();
    (cmp as unknown as { speech: { onEnded?: () => void } }).speech.onEnded?.();
    fixture.detectChanges();

    expect(api.speech).toHaveBeenCalledTimes(1);
    cmp.replay();
    expect(api.speech).toHaveBeenCalledTimes(1);
  });

  it('đổi câu hỏi → đọc câu mới', () => {
    const fixture = make('q1');
    fixture.detectChanges();
    fixture.componentRef.setInput('questionId', 'q2');
    fixture.detectChanges();

    expect(api.speech).toHaveBeenCalledWith('s1', 'q2');
  });
});
