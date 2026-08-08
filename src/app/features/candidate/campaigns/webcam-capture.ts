import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CampaignApi } from '../../../core/api/campaign.api';

/** Chu kỳ đối chiếu khuôn mặt trong lúc thi (SEC-3: giám sát ~mỗi 30s). */
const FACE_CHECK_INTERVAL_MS = 30_000;

/**
 * Ngưỡng coi một khung hình là ĐÃ CÓ NỘI DUNG, đủ dùng làm ảnh MỐC (0–255).
 *
 * Vì sao cần cả hai: `getUserMedia` + `video.play()` resolve xong KHÔNG có nghĩa đã có khung
 * hình dùng được — webcam thật cần vài trăm ms phơi sáng, khung đầu tiên thường đen. Prod
 * 2026-08-08 đã dính: ảnh mốc sáng 0.0/255 ⇒ InsightFace không thấy mặt ⇒ mọi lượt đối chiếu
 * sau đó gắn `face_mismatch` cho ứng viên trung thực, mỗi 30 giây suốt buổi thi.
 *
 * Chỉ đo độ sáng là KHÔNG đủ: prod cũng có ảnh mốc `sáng=128` — xám đồng nhất, sáng "vừa đẹp"
 * mà chẳng có mặt nào. Độ lệch chuẩn ~0 bắt được đúng nhóm đó.
 */
const MIN_FRAME_BRIGHTNESS = 8;
const MIN_FRAME_STDDEV = 5;

/**
 * Camera giám sát cho bài thi B2B — clone pattern từ AudioRecorder (getUserMedia + teardown track).
 *  - Bật webcam → preview nhỏ (Material card) + trạng thái từ chối quyền.
 *  - (a) Nếu `enrollRequired` → chụp 1 ảnh tham chiếu → `faceEnroll`.
 *  - (b) Cứ ~30s chụp 1 khung → `faceCheck` (fire-and-forget).
 * KHÔNG bao giờ chặn bài thi: camera bị từ chối / face-check fail chỉ là cờ cho HR (D13 / SEC-5).
 */
@Component({
  selector: 'app-webcam-capture',
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card class="cam">
      @if (denied()) {
        <div class="cam-denied">
          <mat-icon>videocam_off</mat-icon>
          <span
            >Không truy cập được camera — phần giám sát khuôn mặt được bỏ qua (không ảnh hưởng bài
            thi).</span
          >
        </div>
      } @else {
        <div class="cam-head">
          <mat-icon [class.on]="active()">videocam</mat-icon>
          <span>{{ active() ? 'Camera giám sát đang bật' : 'Đang bật camera giám sát…' }}</span>
        </div>
        @if (needsBetterLighting()) {
          <div class="cam-warn">
            <mat-icon>lightbulb</mat-icon>
            <span
              >Chưa thấy rõ khuôn mặt — hãy bật thêm đèn và ngồi vào giữa khung hình. Hệ thống sẽ
              tự thử lại, bạn cứ tiếp tục trả lời.</span
            >
          </div>
        }
        <div #preview class="cam-preview"></div>
      }
    </mat-card>
  `,
  styles: [
    `
      .cam {
        padding: 12px;
        margin-bottom: 12px;
      }
      .cam-head,
      .cam-denied,
      .cam-warn {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .cam-warn {
        margin-top: 8px;
        color: var(--mat-sys-error);
      }
      .cam-head mat-icon.on {
        color: var(--mat-sys-error);
      }
      .cam-preview {
        margin-top: 8px;
      }
      .cam-preview video {
        width: 160px;
        max-width: 100%;
        border-radius: 8px;
        display: block;
      }
    `,
  ],
})
export class WebcamCapture implements OnInit {
  private campaignApi = inject(CampaignApi);
  private destroyRef = inject(DestroyRef);

  readonly campaignId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly enrollRequired = input(false);

  /**
   * F4 — camera không bật được (OS/trình duyệt từ chối, không có thiết bị…).
   * Component này CỐ Ý thuần I/O: KHÔNG inject ProctorService, chỉ phát sự kiện để component cha
   * (`campaign-interview`) quyết định gửi cờ ⇒ test được độc lập, không cần dựng cả pipeline proctor.
   * Payload = tên lỗi DOMException (`NotAllowedError`/`NotFoundError`…) để HR có ngữ cảnh.
   */
  readonly cameraBlocked = output<string>();

  readonly active = signal(false);
  readonly denied = signal(false);
  /** Số lần đối chiếu khuôn mặt đã gửi — surface cho UI nếu cần. */
  readonly checks = signal(0);

  /**
   * Chưa lấy được khung hình đủ dùng làm ảnh mốc → nhắc ứng viên bật đèn / vào giữa khung.
   * CẢNH BÁO, KHÔNG CHẶN (SEC-5/D13): ứng viên vẫn trả lời bình thường, hệ thống tự thử lại.
   */
  readonly needsBetterLighting = signal(false);

  /** Đã gửi được ảnh mốc chưa. Chưa xong → mỗi nhịp 30s thử lại thay vì chịu chết cả buổi. */
  private enrolled = false;

  /**
   * Cờ báo-một-lần cho `cameraBlocked`. KHÔNG dựa được vào debounce 1200ms của ProctorService:
   * camera-denied là sự kiện MỘT-LẦN-MỖI-BUỔI, nhưng `start()` có thể được gọi lại cách nhau
   * hơn 1200ms (retry / remount) ⇒ debounce sẽ cho lọt cờ trùng. Reset trong `start()`.
   */
  private blockedReported = false;

  private previewHost = viewChild<ElementRef<HTMLDivElement>>('preview');
  private stream?: MediaStream;
  private videoEl?: HTMLVideoElement;
  private interval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stop());
    void this.start();
  }

  /** Bật camera; lỗi/từ chối quyền → `denied` (không throw ra ngoài, không chặn thi). */
  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.stream = stream;
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.videoEl = video;
      this.previewHost()?.nativeElement.appendChild(video);
      try {
        await video.play();
      } catch {
        // Autoplay có thể bị chặn — vẫn chụp được frame từ stream.
      }
      this.active.set(true);
      // Camera đã chạy → mở lại cửa cho lần chặn SAU (nếu người dùng rút quyền giữa buổi thì đó là
      // một sự kiện MỚI, đáng gửi cờ mới). Reset ở đây chứ KHÔNG ở đầu start(): start() có thể được
      // gọi lại khi vẫn đang bị chặn, reset đầu hàm sẽ làm cờ bắn trùng — đúng cái debounce không đỡ được.
      this.blockedReported = false;
      this.denied.set(false);

      if (this.enrollRequired()) await this.enroll();
      this.interval = setInterval(() => void this.runCheck(), FACE_CHECK_INTERVAL_MS);
    } catch (err: unknown) {
      this.denied.set(true);
      // F4 — KHÔNG nuốt lỗi nữa: báo lên cha để ghi cờ `camera_blocked` cho HR.
      if (!this.blockedReported) {
        this.blockedReported = true;
        // Duck-type thay vì `instanceof Error`: DOMException KHÔNG kế thừa Error trên mọi môi trường
        // (jsdom là một ví dụ) → instanceof sẽ nuốt mất tên lỗi thật, HR nhận cờ vô nghĩa.
        const name = (err as { name?: unknown } | null)?.name;
        this.cameraBlocked.emit(typeof name === 'string' && name ? name : 'CameraError');
      }
    }
  }

  /** Chụp 1 khung hình hiện tại → JPEG Blob (null nếu chưa sẵn sàng). */
  async capture(): Promise<Blob | null> {
    return (await this.captureFrame())?.blob ?? null;
  }

  /**
   * Chụp khung hình kèm kết luận khung đó đã có nội dung hay chưa.
   * `usable=false` = khung đen/đồng nhất (camera chưa phơi sáng, phòng tối, ống kính bị che).
   */
  private async captureFrame(): Promise<{ blob: Blob; usable: boolean } | null> {
    const video = this.videoEl;
    if (!video) return null;
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const usable = WebcamCapture.frameHasContent(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
    );
    return blob ? { blob, usable } : null;
  }

  /**
   * Khung hình đã có nội dung chưa? Đo độ sáng trung bình + độ lệch chuẩn trên mẫu thưa.
   *
   * KHÔNG đọc được pixel (jsdom không cài canvas, hoặc trình duyệt chặn `getImageData`) →
   * coi như HỢP LỆ. Đây là phép kiểm phụ; để nó chặn được enroll khi bản thân nó không chạy
   * được thì ứng viên mất giám sát danh tính cả buổi mà không ai biết — hỏng nặng hơn bug đang sửa.
   */
  private static frameHasContent(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return true;
    }
    if (!data?.length) return true;

    // Mẫu thưa mỗi 16 pixel: 640×480 là ~307k pixel và hàm này chạy mỗi 30s trên máy ứng viên;
    // để phân biệt "đen" với "có hình" thì không cần duyệt hết.
    const STEP = 16 * 4;
    let n = 0;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i + 2 < data.length; i += STEP) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += v;
      sumSq += v * v;
      n++;
    }
    if (n === 0) return true;
    const mean = sum / n;
    const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    return mean >= MIN_FRAME_BRIGHTNESS && stddev >= MIN_FRAME_STDDEV;
  }

  /** Gửi ảnh mốc. Trả về `true` nếu đã gửi (khung dùng được), `false` nếu cần thử lại nhịp sau. */
  private async enroll(): Promise<boolean> {
    const frame = await this.captureFrame();
    if (!frame) return false;

    // Khung chưa có nội dung → KHÔNG upload. Ảnh mốc hỏng còn tệ hơn không có ảnh mốc: nó biến
    // mọi lượt đối chiếu về sau thành `face_mismatch` — cờ "không đúng người" — cho một ứng
    // viên trung thực. Nhắc họ mở sáng rồi thử lại ở nhịp kế.
    if (!frame.usable) {
      this.needsBetterLighting.set(true);
      return false;
    }

    this.needsBetterLighting.set(false);
    this.enrolled = true;
    // Best-effort: enroll lỗi không chặn thi (HR duyệt sau — SEC-5). Lỗi mạng → mở lại cờ để
    // nhịp sau gửi lại, thay vì buổi thi trôi đi mà không có mốc nào.
    this.campaignApi.faceEnroll(this.campaignId(), this.sessionId(), frame.blob).subscribe({
      error: () => {
        this.enrolled = false;
      },
    });
    return true;
  }

  private async runCheck(): Promise<void> {
    // Ảnh mốc lần đầu trúng khung chưa phơi sáng → ưu tiên thử lại; camera lúc này đã ổn định.
    if (this.enrollRequired() && !this.enrolled && (await this.enroll())) return;

    const blob = await this.capture();
    if (!blob) return;
    this.checks.update((n) => n + 1);
    // Ảnh live CỐ Ý không lọc theo `usable`: khung tối ở đây là TÍN HIỆU THẬT (ứng viên rời chỗ,
    // che camera) và phải tới được HR dưới dạng `no_face` — khác hẳn ảnh mốc, nơi khung tối chỉ là
    // hỏng kỹ thuật. Fire-and-forget: kết quả chỉ là cờ, KHÔNG chặn bài (D13).
    this.campaignApi
      .faceCheck(this.campaignId(), this.sessionId(), blob)
      .subscribe({ error: () => {} });
  }

  /** Dừng giám sát: clear interval + stop track camera + gỡ video. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl.remove();
      this.videoEl = undefined;
    }
    this.active.set(false);
  }
}
