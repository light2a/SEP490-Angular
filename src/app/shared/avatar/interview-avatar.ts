import {
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PracticeApi } from '../../core/api/practice.api';
import { AvatarScene } from './avatar-scene';
import { AvatarSpeech } from './avatar-speech';

/**
 * URL model .glb cho avatar (vd link Ready Player Me của tổ chức).
 * Mặc định `null` → dùng đầu dựng sẵn bằng hình học trong `AvatarScene`, không cần asset ngoài.
 * Muốn đổi: provide token này trong `app.config.ts`.
 */
export const AVATAR_MODEL_URL = new InjectionToken<string | null>('AVATAR_MODEL_URL', {
  providedIn: 'root',
  factory: () => null,
});

/** Khoá nhớ lựa chọn tắt tiếng — hỏi lại mỗi câu thì phiền. */
const MUTE_STORAGE_KEY = 'isas.avatar.muted';

/**
 * Trần thời gian được phép khoá mic để CHỜ TẢI giọng đọc. Quá ngưỡng → mở khoá, ứng viên trả lời
 * bình thường; giọng đọc tới muộn thì chỉ nằm sẵn ở nút nghe lại.
 *
 * Vì sao cần: đo trên production 2026-07-19, câu chưa cache mất ~6,4s tổng hợp (đã cache 0,55s).
 * Nếu vendor chậm bất thường hoặc mạng đứt, ứng viên sẽ bị KHOÁ VĨNH VIỄN — biến trợ năng "nghe câu
 * hỏi" thành lỗi chặn bài thi. Thà mất giọng đọc còn hơn chặn người ta làm bài.
 *
 * ⚠ Chỉ nới nhánh ĐANG CHỜ TẢI. Lúc đang thực sự PHÁT thì mic vẫn phải khoá, nếu không tiếng loa
 * lọt vào bài ghi → Whisper bóc cả câu hỏi lẫn câu trả lời → chấm sai.
 */
const SPEECH_LOAD_TIMEOUT_MS = 9000;

/**
 * Avatar 3D đọc câu hỏi phỏng vấn — DÙNG CHUNG cho B2C (luyện tập) và B2B (campaign).
 *
 * ⚠ RÀNG BUỘC AN TOÀN DỮ LIỆU (không phải tuỳ chọn UX): loa phát câu hỏi trong lúc mic đang ghi thì
 * Whisper sẽ bóc CẢ câu hỏi lẫn câu trả lời vào transcript → chấm điểm sai hoàn toàn. Vì vậy:
 *  - `speaking()` bật từ lúc BẮT ĐẦU TẢI giọng đọc (không phải lúc phát) tới lúc đọc xong; trang cha
 *    dùng nó để KHOÁ nút ghi âm. Khoá sớm như vậy để tránh ca "bấm ghi âm trong lúc đang tải, tiếng
 *    nổ ra giữa bài ghi".
 *  - `locked` (cha truyền vào khi đang ghi âm) → dừng phát NGAY và cấm nghe lại.
 * Hai chốt này khoá lẫn nhau: không bao giờ có mic mở và loa kêu cùng lúc.
 *
 * Degrade: không WebGL / TTS lỗi → ẩn nhân vật, KHÔNG chặn phỏng vấn. Chữ câu hỏi luôn do trang cha
 * hiển thị nên ứng viên vẫn làm bài bình thường (quan trọng với B2B: không ai được trượt vì máy yếu).
 */
@Component({
  selector: 'app-interview-avatar',
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <mat-card class="avatar-card">
      @if (showCharacter()) {
        <div class="stage" [class.talking]="playing()">
          <canvas #canvas class="stage-canvas"></canvas>
          @if (!sceneReady()) {
            <div class="stage-skeleton" aria-hidden="true"></div>
          }
          @if (loadingSpeech()) {
            <div class="stage-badge">Đang chuẩn bị giọng đọc…</div>
          }
        </div>
      }

      <div class="row">
        <mat-icon class="row-ico" [class.on]="speaking()">
          {{ speaking() ? 'graphic_eq' : 'record_voice_over' }}
        </mat-icon>
        <span class="row-text">{{ statusText() }}</span>

        <span class="spacer"></span>

        <button
          mat-icon-button
          type="button"
          [disabled]="!canReplay()"
          [matTooltip]="replayTooltip()"
          (click)="replay()"
        >
          <mat-icon>{{ autoplayBlocked() ? 'play_arrow' : 'replay' }}</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          [matTooltip]="muted() ? 'Bật giọng đọc' : 'Tắt tiếng'"
          (click)="toggleMute()"
        >
          <mat-icon>{{ muted() ? 'volume_off' : 'volume_up' }}</mat-icon>
        </button>
      </div>

      @if (speaking()) {
        <p class="lock-hint">
          <mat-icon>mic_off</mat-icon>
          Nút ghi âm tạm khoá tới khi đọc xong — tránh lẫn tiếng câu hỏi vào bài ghi.
        </p>
      }
      @if (ttsFailed()) {
        <p class="fail-hint">
          Không tải được giọng đọc — bạn vẫn phỏng vấn bình thường theo nội dung câu hỏi bên dưới.
        </p>
      }
    </mat-card>
  `,
  styles: [
    `
      .avatar-card {
        padding: 12px;
        margin-bottom: 12px;
      }
      .stage {
        position: relative;
        display: flex;
        justify-content: center;
        background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
        border-radius: 12px;
        overflow: hidden;
      }
      /* Khối chờ trong lúc three.js tải lazy + cảnh chưa dựng: nhìn "đang chạy" thay vì ô trống. */
      .stage-skeleton {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          100deg,
          transparent 30%,
          color-mix(in srgb, var(--mat-sys-on-surface) 6%, transparent) 50%,
          transparent 70%
        );
        background-size: 200% 100%;
        animation: stage-shimmer 1.4s ease-in-out infinite;
      }
      @keyframes stage-shimmer {
        from { background-position: 150% 0; }
        to { background-position: -50% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .stage-skeleton { animation: none; }
      }
      .stage-canvas {
        width: 100%;
        max-width: 260px;
        height: 240px;
        display: block;
      }
      .stage.talking {
        box-shadow: inset 0 0 0 2px var(--mat-sys-primary);
      }
      .stage-badge {
        position: absolute;
        bottom: 8px;
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface-variant);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .row-ico.on {
        color: var(--mat-sys-primary);
      }
      .spacer {
        flex: 1;
      }
      .lock-hint,
      .fail-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 6px 0 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .lock-hint mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    `,
  ],
})
export class InterviewAvatar {
  private api = inject(PracticeApi);
  private destroyRef = inject(DestroyRef);
  private modelUrl = inject(AVATAR_MODEL_URL);

  readonly sessionId = input.required<string>();
  /** Câu đang hỏi; đổi id → avatar tự đọc câu mới. `null` = không có gì để đọc. */
  readonly questionId = input<string | null>(null);
  /** Cha đang ghi âm → cấm mọi tiếng động từ avatar (chống lẫn tiếng vào bài ghi). */
  readonly locked = input(false);

  /** Phát ra mỗi khi trạng thái "đang bận nói" đổi — cha dùng để khoá/mở nút ghi âm. */
  readonly speakingChange = output<boolean>();

  /** WebGL dựng được cảnh hay không — quyết định có hiện nhân vật 3D không. */
  readonly webglAvailable = signal(false);
  readonly playing = signal(false);
  readonly loadingSpeech = signal(false);
  readonly ttsFailed = signal(false);
  /** Trình duyệt chặn tự phát (chính sách autoplay) → phải mời người dùng bấm nút. */
  readonly autoplayBlocked = signal(false);
  /** Quá trần chờ tải: đã mở khoá mic, giọng đọc (nếu về) chỉ còn ở nút nghe lại. */
  readonly speechSlow = signal(false);
  /** Cảnh 3D đã dựng xong chưa — chưa xong thì hiện placeholder thay vì canvas trống trơn. */
  readonly sceneReady = signal(false);
  readonly muted = signal(readStoredMute());

  /**
   * "Đang bận nói" = đang TẢI hoặc đang PHÁT. Khoá ghi âm theo cờ này, không theo mỗi `playing`,
   * vì nếu chỉ khoá lúc phát thì ứng viên bấm ghi âm trong lúc tải xong tiếng vẫn nổ ra giữa bài ghi.
   */
  readonly speaking = computed(() => this.loadingSpeech() || this.playing());

  /** Ẩn nhân vật khi máy không chạy được 3D hoặc giọng đọc hỏng — vẫn giữ hàng điều khiển. */
  readonly showCharacter = computed(() => this.webglAvailable() && !this.ttsFailed());
  readonly canReplay = computed(
    () => !!this.questionId() && !this.locked() && !this.speaking() && !this.muted(),
  );

  readonly replayTooltip = computed(() => {
    if (this.locked()) return 'Đang ghi âm — không nghe lại được để tránh lẫn tiếng';
    if (this.muted()) return 'Bật tiếng để nghe lại';
    return 'Nghe lại câu hỏi';
  });

  readonly statusText = computed(() => {
    if (this.locked()) return 'Đang ghi âm — avatar im lặng';
    if (this.muted()) return 'Đã tắt tiếng giọng đọc';
    if (this.loadingSpeech()) return 'Đang tải giọng đọc…';
    if (this.speechSlow()) return 'Giọng đọc tải chậm — bạn cứ trả lời, bấm ↻ để nghe lại';
    if (this.playing()) return 'Avatar đang đọc câu hỏi…';
    if (this.ttsFailed()) return 'Giọng đọc không khả dụng';
    if (this.autoplayBlocked()) return 'Bấm ▶ để nghe avatar đọc câu hỏi';
    return 'Avatar đã đọc xong — mời bạn trả lời';
  });

  private canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private scene?: AvatarScene;
  private speech = new AvatarSpeech();
  private loadTimer?: ReturnType<typeof setTimeout>;
  /** Cache blob theo questionId: nghe lại không tốn thêm một lượt gọi TTS. */
  private cache = new Map<string, Blob>();
  /** Câu đã đọc rồi — tránh đọc lại khi component render lại vì lý do khác. */
  private spokenFor: string | null = null;
  private pendingRequest?: { unsubscribe(): void };

  constructor() {
    this.webglAvailable.set(AvatarScene.isWebGLAvailable());

    this.speech.onAmplitude = (v) => this.scene?.setMouthOpen(v);
    this.speech.onEnded = () => this.setPlaying(false);

    // Dựng cảnh khi canvas đã vào DOM (canvas nằm trong @if nên xuất hiện muộn hơn constructor).
    effect(() => {
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas || this.scene) return;
      const scene = new AvatarScene();
      this.scene = scene;
      // Lỗi WebGL/model → ẩn nhân vật, KHÔNG để lỗi nổi lên chặn bài phỏng vấn.
      scene
        .init(canvas, { modelUrl: this.modelUrl })
        // Cảnh dựng xong mới bỏ placeholder: three.js tải lazy nên có một khoảng canvas còn trống,
        // đúng khoảng đó người dùng nhìn thấy "ô trống" và tưởng hỏng.
        .then(() => this.sceneReady.set(true))
        .catch(() => {
          this.webglAvailable.set(false);
          scene.dispose();
          this.scene = undefined;
        });
    });

    // Đổi câu → đọc câu mới. Đang ghi âm → im ngay lập tức.
    effect(() => {
      const qid = this.questionId();
      const locked = this.locked();
      untracked(() => {
        if (locked) {
          this.stopSpeaking();
          return;
        }
        if (!qid || qid === this.spokenFor || this.muted()) return;
        this.spokenFor = qid;
        this.speak(qid);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.clearLoadTimeout();
      this.pendingRequest?.unsubscribe();
      this.speech.dispose();
      this.scene?.dispose();
    });
  }

  /**
   * Dừng phát tiếng NGAY (đồng bộ). Trang cha gọi hàm này ngay khi ứng viên bấm ghi âm —
   * chạy xong trước cả lúc `getUserMedia` mở được mic, nên không có khung audio nào lọt vào bài ghi.
   */
  stopSpeaking(): void {
    this.clearLoadTimeout();
    this.pendingRequest?.unsubscribe();
    this.pendingRequest = undefined;
    this.loadingSpeech.set(false);
    this.speech.stop();
    this.setPlaying(false);
  }

  replay(): void {
    const qid = this.questionId();
    if (!qid || !this.canReplay()) return;
    this.speak(qid);
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    storeMute(next);
    if (next) this.stopSpeaking();
  }

  // ---------- nội bộ ----------

  private speak(questionId: string): void {
    if (this.locked() || this.muted()) return;
    this.autoplayBlocked.set(false);

    const cached = this.cache.get(questionId);
    if (cached) {
      void this.playBlob(cached);
      return;
    }

    this.ttsFailed.set(false);
    this.speechSlow.set(false);
    this.loadingSpeech.set(true);
    this.emitSpeaking();
    this.armLoadTimeout();
    try {
      this.pendingRequest = this.subscribeSpeech(questionId);
    } catch {
      // Bất kỳ lỗi đồng bộ nào từ tầng API cũng KHÔNG được làm vỡ trang phỏng vấn.
      this.loadingSpeech.set(false);
      this.ttsFailed.set(true);
      this.setPlaying(false);
    }
  }

  private subscribeSpeech(questionId: string): { unsubscribe(): void } {
    return this.api.speech(this.sessionId(), questionId).subscribe({
      next: (blob) => {
        this.pendingRequest = undefined;
        this.clearLoadTimeout();
        this.loadingSpeech.set(false);
        this.cache.set(questionId, blob);
        // Ứng viên có thể đã bấm ghi âm trong lúc chờ tải → tuyệt đối không phát nữa.
        // Quá trần chờ (speechSlow) cũng KHÔNG tự phát: mic đã mở khoá nên tiếng có thể nổ ra đúng
        // lúc người ta vừa bấm ghi âm. Để dành ở nút nghe lại, người dùng chủ động bấm.
        if (this.locked() || this.muted() || this.speechSlow()) {
          this.emitSpeaking();
          return;
        }
        void this.playBlob(blob);
      },
      error: () => {
        // TTS 502 / mạng lỗi: ẩn nhân vật, mở khoá ghi âm, phỏng vấn tiếp tục bình thường.
        this.pendingRequest = undefined;
        this.loadingSpeech.set(false);
        this.ttsFailed.set(true);
        this.setPlaying(false);
      },
    });
  }

  private async playBlob(blob: Blob): Promise<void> {
    this.setPlaying(true);
    this.scene?.setSpeaking(true);
    const started = await this.speech.play(blob);
    // Trình duyệt chặn autoplay (chưa có thao tác nào của người dùng) → mời bấm "nghe lại",
    // đừng để ứng viên ngồi chờ một giọng đọc không bao giờ vang lên.
    this.autoplayBlocked.set(!started);
    if (!this.speech.isPlaying()) this.setPlaying(false);
  }

  private setPlaying(value: boolean): void {
    this.playing.set(value);
    this.scene?.setSpeaking(value);
    this.emitSpeaking();
  }

  /**
   * Hết trần chờ mà giọng đọc chưa về → nhả khoá mic. KHÔNG huỷ request: nó có thể về muộn và nằm
   * sẵn trong cache cho nút nghe lại, đồng thời đã hâm nóng cache phía server cho lần sau.
   */
  private armLoadTimeout(): void {
    this.clearLoadTimeout();
    this.loadTimer = setTimeout(() => {
      this.loadTimer = undefined;
      if (!this.loadingSpeech()) return;
      this.loadingSpeech.set(false);
      this.speechSlow.set(true);
      this.emitSpeaking();   // ← mở khoá nút ghi âm cho trang cha
    }, SPEECH_LOAD_TIMEOUT_MS);
  }

  private clearLoadTimeout(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = undefined;
    }
  }

  private emitSpeaking(): void {
    this.speakingChange.emit(this.speaking());
  }
}

function readStoredMute(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    // Trình duyệt chặn storage (private mode) → mặc định bật tiếng.
    return false;
  }
}

function storeMute(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Không lưu được thì thôi, không ảnh hưởng chức năng.
  }
}
