import { TestBed } from '@angular/core/testing';
import { AudioRecorder, RecordedAudio } from './audio-recorder';

/** MediaRecorder giả: stop() phát ondataavailable (blob khác rỗng) rồi onstop. */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = 'audio/webm';
  state = 'inactive';
  constructor(public stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('AudioRecorder', () => {
  const trackStop = vi.fn();
  const getUserMedia = vi.fn();

  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    trackStop.mockReset();
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:fake');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    TestBed.configureTestingModule({ imports: [AudioRecorder] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('start() requests the mic and enters recording state', async () => {
    // Không detectChanges() → tránh render Material; chỉ dùng logic component.
    const cmp = TestBed.createComponent(AudioRecorder).componentInstance;
    await cmp.start();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(cmp.recording()).toBe(true);
    expect(FakeMediaRecorder.instances.length).toBe(1);
  });

  it('stop() after start() emits recorded { blob, durationSec >= 1 } and leaves recording state', async () => {
    const cmp = TestBed.createComponent(AudioRecorder).componentInstance;
    let emitted: RecordedAudio | undefined;
    cmp.recorded.subscribe((v) => (emitted = v));

    await cmp.start();
    cmp.stop();

    expect(cmp.recording()).toBe(false);
    expect(emitted).toBeDefined();
    expect(emitted!.blob).toBeInstanceOf(Blob);
    expect(emitted!.durationSec).toBeGreaterThanOrEqual(1);
    expect(trackStop).toHaveBeenCalled(); // giải phóng track micro
  });

  // ---- Khoá ghi âm khi avatar đang đọc câu hỏi ----
  // Mic mở lúc loa phát câu hỏi → Whisper bóc cả câu hỏi vào transcript → chấm điểm sai.

  it('disabled=true → start() KHÔNG chạm tới micro', async () => {
    const fixture = TestBed.createComponent(AudioRecorder);
    fixture.componentRef.setInput('disabled', true);
    await fixture.componentInstance.start();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fixture.componentInstance.recording()).toBe(false);
  });

  it('start() báo startRequested TRƯỚC khi mở mic (cha kịp tắt tiếng avatar)', async () => {
    const fixture = TestBed.createComponent(AudioRecorder);
    const cmp = fixture.componentInstance;
    const order: string[] = [];
    cmp.startRequested.subscribe(() => order.push('startRequested'));
    getUserMedia.mockImplementation(async () => {
      order.push('getUserMedia');
      return { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
    });

    await cmp.start();

    expect(order).toEqual(['startRequested', 'getUserMedia']);
  });

  it('recordingChange báo trạng thái mic để cha khoá ngược phía avatar', async () => {
    const cmp = TestBed.createComponent(AudioRecorder).componentInstance;
    const states: boolean[] = [];
    cmp.recordingChange.subscribe((v) => states.push(v));

    await cmp.start();
    cmp.stop();

    expect(states).toEqual([true, false]);
  });
});
