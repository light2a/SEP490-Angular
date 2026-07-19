import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { WebcamCapture } from './webcam-capture';

describe('WebcamCapture', () => {
  const getUserMedia = vi.fn();
  const trackStop = vi.fn();
  let campaignApi: {
    faceEnroll: ReturnType<typeof vi.fn>;
    faceCheck: ReturnType<typeof vi.fn>;
  };
  let origGetContext: unknown;
  let origToBlob: unknown;

  beforeEach(() => {
    getUserMedia.mockReset();
    trackStop.mockReset();
    campaignApi = {
      faceEnroll: vi.fn().mockReturnValue(of({})),
      faceCheck: vi.fn().mockReturnValue(of({ match: true, faceCount: 1, signals: [] })),
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    // jsdom không cài srcObject/play → stub để đường thành công không văng.
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get: () => null,
      set: () => {},
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    origGetContext = HTMLCanvasElement.prototype.getContext;
    origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
    })) as unknown as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
    };

    TestBed.configureTestingModule({
      imports: [WebcamCapture],
      providers: [{ provide: CampaignApi, useValue: campaignApi }],
    });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.toBlob = origToBlob as HTMLCanvasElement['toBlob'];
    vi.restoreAllMocks();
  });

  function make(enrollRequired = false) {
    const fixture = TestBed.createComponent(WebcamCapture);
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('enrollRequired', enrollRequired);
    return fixture.componentInstance; // không detectChanges → không auto ngOnInit
  }

  it('capture() draws a frame and resolves an image/jpeg Blob', async () => {
    const cmp = make();
    // Giả video sẵn sàng (bỏ qua getUserMedia).
    (cmp as unknown as { videoEl: unknown }).videoEl = { videoWidth: 640, videoHeight: 480 };

    const blob = await cmp.capture();

    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('image/jpeg');
  });

  it('capture() returns null when the camera is not ready', async () => {
    const cmp = make();
    expect(await cmp.capture()).toBeNull();
  });

  it('start() sets denied (and never throws) when permission is refused', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const cmp = make();

    await cmp.start();

    expect(cmp.denied()).toBe(true);
    expect(cmp.active()).toBe(false);
    expect(campaignApi.faceEnroll).not.toHaveBeenCalled();
  });

  // ── F4 — camera bị chặn phải PHÁT SỰ KIỆN, không nuốt lỗi ────────────────────

  it('start() emits cameraBlocked with the DOMException name when permission is refused', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const cmp = make();
    const seen: string[] = [];
    cmp.cameraBlocked.subscribe((r) => seen.push(r));

    await cmp.start();

    expect(seen).toEqual(['NotAllowedError']);
  });

  // 🔴 Report-once: debounce 1200ms của ProctorService KHÔNG đỡ được ca này — camera-denied là
  // sự kiện một-lần-mỗi-buổi, mà start() có thể được gọi lại cách nhau > 1200ms.
  it('start() emits cameraBlocked only ONCE across repeated failing retries', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const cmp = make();
    const seen: string[] = [];
    cmp.cameraBlocked.subscribe((r) => seen.push(r));

    await cmp.start();
    await cmp.start();
    await cmp.start();

    expect(seen).toHaveLength(1);
  });

  // Chặn → mở được → bị chặn LẠI = sự kiện MỚI, phải báo lại (cờ chỉ reset khi camera chạy thật).
  it('start() emits again after a successful start resets the once-flag', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const cmp = make();
    const seen: string[] = [];
    cmp.cameraBlocked.subscribe((r) => seen.push(r));

    await cmp.start();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream);
    await cmp.start();
    cmp.stop();
    getUserMedia.mockRejectedValue(new DOMException('gone', 'NotFoundError'));
    await cmp.start();

    expect(seen).toEqual(['NotAllowedError', 'NotFoundError']);
  });

  it('start() with enrollRequired captures once and calls faceEnroll', async () => {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream);
    const cmp = make(true);

    await cmp.start();

    expect(cmp.active()).toBe(true);
    expect(campaignApi.faceEnroll).toHaveBeenCalledTimes(1);
    const [campaignId, sessionId, blob] = campaignApi.faceEnroll.mock.calls[0];
    expect(campaignId).toBe('c1');
    expect(sessionId).toBe('s1');
    expect(blob).toBeInstanceOf(Blob);

    cmp.stop(); // clear the periodic interval
    expect(trackStop).toHaveBeenCalled();
  });
});
