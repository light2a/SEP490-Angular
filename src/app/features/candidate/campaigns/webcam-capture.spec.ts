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

  // ── Ảnh mốc phải có NỘI DUNG mới được gửi ────────────────────────────────────
  //
  // Prod 2026-08-08: `video.play()` resolve xong FE chụp mốc ngay, webcam chưa phơi sáng → ảnh
  // đen (sáng 0.0/255) → InsightFace không thấy mặt → mọi lượt đối chiếu sau đó gắn
  // `face_mismatch` ("không đúng người") cho ứng viên trung thực, mỗi 30 giây suốt buổi thi.
  //
  // `beforeEach` stub `getContext` trả đúng `{ drawImage }` — KHÔNG có `getImageData` — nên các
  // test cũ chạy qua nhánh fallback "không đọc được pixel thì coi là hợp lệ". Các test dưới đây
  // thay stub đó để điều khiển được nội dung khung hình.

  /** Khung hình giả: `black` = toàn 0 · `flatGray` = xám đồng nhất · `real` = có biến thiên. */
  function stubFramePixels(kind: 'black' | 'flatGray' | 'real' | 'throws') {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        if (kind === 'throws') throw new DOMException('tainted', 'SecurityError');
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
          const v = kind === 'black' ? 0 : kind === 'flatGray' ? 128 : (i / 4) % 256;
          data[i] = data[i + 1] = data[i + 2] = v;
          data[i + 3] = 255;
        }
        return { data };
      },
    })) as unknown as HTMLCanvasElement['getContext'];
  }

  async function startWithCamera(enrollRequired = true) {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream);
    const cmp = make(enrollRequired);
    await cmp.start();
    return cmp;
  }

  it('KHÔNG gửi ảnh mốc khi khung hình còn đen, và nhắc ứng viên bật đèn', async () => {
    stubFramePixels('black');
    const cmp = await startWithCamera();

    expect(campaignApi.faceEnroll).not.toHaveBeenCalled();
    expect(cmp.needsBetterLighting()).toBe(true);
    cmp.stop();
  });

  it('KHÔNG gửi ảnh mốc khi khung xám đồng nhất (đủ sáng nhưng không có hình)', async () => {
    // Prod có 2 ảnh mốc `sáng=128` — sáng "vừa đẹp" mà không mặt nào. Chỉ đo độ sáng thì lọt;
    // đây là ca duy nhất chứng minh phép đo độ lệch chuẩn thật sự có tác dụng.
    stubFramePixels('flatGray');
    const cmp = await startWithCamera();

    expect(campaignApi.faceEnroll).not.toHaveBeenCalled();
    expect(cmp.needsBetterLighting()).toBe(true);
    cmp.stop();
  });

  it('gửi ảnh mốc khi khung hình đã có nội dung, không hiện nhắc nhở', async () => {
    stubFramePixels('real');
    const cmp = await startWithCamera();

    expect(campaignApi.faceEnroll).toHaveBeenCalledTimes(1);
    expect(cmp.needsBetterLighting()).toBe(false);
    cmp.stop();
  });

  it('thử lại ảnh mốc ở nhịp sau khi camera đã sáng — và chỉ gửi MỘT lần', async () => {
    // Gọi thẳng runCheck thay vì chờ interval 30s: chỗ đấu dây interval→runCheck không đổi
    // trong bản vá này, còn dùng fake timer cho một hàm async lồng nhau thì giòn hơn nhiều.
    stubFramePixels('black');
    const cmp = await startWithCamera();
    expect(campaignApi.faceEnroll).not.toHaveBeenCalled();

    stubFramePixels('real');
    const runCheck = (cmp as unknown as { runCheck: () => Promise<void> }).runCheck.bind(cmp);
    await runCheck();

    expect(campaignApi.faceEnroll).toHaveBeenCalledTimes(1);
    expect(cmp.needsBetterLighting()).toBe(false);
    // Nhịp vừa rồi dành cho enroll → không bắn thêm face-check cùng lúc.
    expect(campaignApi.faceCheck).not.toHaveBeenCalled();

    await runCheck();
    expect(campaignApi.faceEnroll).toHaveBeenCalledTimes(1); // không gửi mốc lần hai
    expect(campaignApi.faceCheck).toHaveBeenCalledTimes(1); // nhịp sau quay lại giám sát
    cmp.stop();
  });

  it('vẫn gửi ảnh mốc khi KHÔNG đọc được pixel (fallback an toàn)', async () => {
    // Phép kiểm khung hình là phụ trợ. Nếu nó tự hỏng mà lại chặn enroll thì ứng viên mất
    // giám sát danh tính cả buổi — hỏng nặng hơn chính bug đang sửa.
    stubFramePixels('throws');
    const cmp = await startWithCamera();

    expect(campaignApi.faceEnroll).toHaveBeenCalledTimes(1);
    expect(cmp.needsBetterLighting()).toBe(false);
    cmp.stop();
  });

  it('ảnh live KHÔNG bị lọc theo độ sáng — khung tối là tín hiệu thật cho HR', async () => {
    // Khác ảnh mốc: ứng viên che camera / rời chỗ phải tới được HR dưới dạng `no_face`.
    stubFramePixels('real');
    const cmp = await startWithCamera();
    stubFramePixels('black');

    await (cmp as unknown as { runCheck: () => Promise<void> }).runCheck.bind(cmp)();

    expect(campaignApi.faceCheck).toHaveBeenCalledTimes(1);
    cmp.stop();
  });
});
