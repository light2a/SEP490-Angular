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
      .cam-denied {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
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
    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8),
    );
  }

  private async enroll(): Promise<void> {
    const blob = await this.capture();
    if (!blob) return;
    // Best-effort: enroll lỗi không chặn thi (HR duyệt sau — SEC-5).
    this.campaignApi
      .faceEnroll(this.campaignId(), this.sessionId(), blob)
      .subscribe({ error: () => {} });
  }

  private async runCheck(): Promise<void> {
    const blob = await this.capture();
    if (!blob) return;
    this.checks.update((n) => n + 1);
    // Fire-and-forget: kết quả chỉ là cờ cho HR, KHÔNG chặn bài (D13).
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
