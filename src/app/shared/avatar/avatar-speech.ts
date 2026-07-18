/**
 * Phát giọng đọc câu hỏi + đo biên độ để nhép miệng.
 *
 * TẠI SAO đo biên độ thay vì viseme: viseme cần phoneme timing từ TTS (backend không trả), còn biên độ
 * lấy được từ chính luồng audio đang phát bằng AnalyserNode. Nhép theo biên độ mà mượt trông tự nhiên
 * hơn hẳn viseme suy đoán bị giật, và không hỏng khi đổi giọng/đổi ngôn ngữ.
 *
 * Mọi API trình duyệt ở đây (AudioContext, play(), createObjectURL) đều được bọc guard: môi trường test
 * (jsdom) và trình duyệt chặn autoplay đều KHÔNG được phép ném lỗi làm vỡ trang phỏng vấn.
 */

/** Hệ số khuếch đại RMS → độ mở miệng. Giọng nói thường cho RMS ~0.05–0.25. */
const AMPLITUDE_GAIN = 4.2;
/** Kích thước FFT nhỏ: chỉ cần biên độ tổng, không cần phổ chi tiết → rẻ hơn. */
const FFT_SIZE = 256;

export class AvatarSpeech {
  /** Biên độ hiện tại 0..1 (0 khi không phát). */
  private amplitude = 0;
  private audio?: HTMLAudioElement;
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  // Ràng buộc ArrayBuffer (không phải ArrayBufferLike) để khớp chữ ký getByteTimeDomainData.
  private data?: Uint8Array<ArrayBuffer>;
  private raf?: number;
  private objectUrl?: string;
  private disposed = false;
  private playing = false;

  /** Gọi mỗi khung hình khi đang phát, kèm biên độ 0..1. */
  onAmplitude?: (value: number) => void;
  /** Gọi khi audio phát xong hoặc bị dừng — dùng để mở khoá nút ghi âm. */
  onEnded?: () => void;

  isPlaying(): boolean {
    return this.playing;
  }

  currentAmplitude(): number {
    return this.amplitude;
  }

  /**
   * Phát một blob audio. Trả về khi audio BẮT ĐẦU phát (không đợi phát xong) —
   * caller theo dõi `onEnded` để biết lúc kết thúc.
   *
   * Trả `false` khi trình duyệt TỪ CHỐI phát (thường là chính sách autoplay: chưa có thao tác nào
   * của người dùng trên trang). Caller dùng cờ này để mời bấm "nghe lại" — bấm nút là một thao tác
   * hợp lệ nên lần đó sẽ phát được.
   */
  async play(blob: Blob): Promise<boolean> {
    if (this.disposed) return false;
    this.stop();

    const audio = this.ensureAudio();
    this.revokeUrl();
    try {
      this.objectUrl = URL.createObjectURL(blob);
      audio.src = this.objectUrl;
    } catch {
      // Không tạo được object URL (môi trường không hỗ trợ) → coi như phát xong ngay.
      this.finish();
      return false;
    }

    this.playing = true;
    this.connectAnalyser();
    // AudioContext dựng trước thao tác người dùng sẽ ở trạng thái suspended → audio câm.
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Vẫn suspended: tiếng có thể câm, nhưng không được ném lỗi ra ngoài.
      }
    }

    let ok = true;
    try {
      // jsdom trả undefined thay vì Promise → optional chaining, không await thẳng.
      await audio.play()?.catch(() => {
        ok = false;
        this.finish();
      });
    } catch {
      // Autoplay bị chặn / codec không hỗ trợ: không được chặn bài phỏng vấn.
      this.finish();
      return false;
    }
    if (this.playing) this.tick();
    return ok && this.playing;
  }

  /** Dừng phát NGAY LẬP TỨC (đồng bộ) — dùng khi ứng viên bắt đầu ghi âm. */
  stop(): void {
    if (!this.audio) {
      this.playing = false;
      return;
    }
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      // jsdom / trạng thái audio lạ: bỏ qua, cờ playing bên dưới mới là thứ quyết định.
    }
    this.finish();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.revokeUrl();
    if (this.audio) {
      this.audio.src = '';
      this.audio = undefined;
    }
    try {
      void this.ctx?.close();
    } catch {
      // AudioContext có thể đã đóng.
    }
    this.ctx = undefined;
    this.analyser = undefined;
  }

  // ---------- nội bộ ----------

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('ended', () => this.finish());
      audio.addEventListener('error', () => this.finish());
      this.audio = audio;
    }
    return this.audio;
  }

  /**
   * Nối audio → AnalyserNode → loa. Chỉ tạo MediaElementSource MỘT lần cho mỗi element
   * (gọi lần hai trên cùng element sẽ ném InvalidStateError).
   */
  private connectAnalyser(): void {
    if (this.analyser || !this.audio) return;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // không có Web Audio → vẫn phát tiếng, chỉ là miệng không nhép

    try {
      const ctx = new Ctor();
      const source = ctx.createMediaElementSource(this.audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      // BẮT BUỘC nối tiếp ra loa, nếu không audio sẽ câm khi đi qua graph.
      analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
      this.data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      // Không dựng được graph → chấp nhận mất phần nhép miệng, tiếng vẫn phát bình thường.
      this.analyser = undefined;
    }
  }

  private tick = (): void => {
    if (!this.playing || this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    this.amplitude = this.measure();
    this.onAmplitude?.(this.amplitude);
  };

  /** RMS quanh mốc 128 của tín hiệu time-domain → 0..1. */
  private measure(): number {
    const analyser = this.analyser;
    const data = this.data;
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.max(0, Math.min(1, rms * AMPLITUDE_GAIN));
  }

  /** Kết thúc một lượt phát: tắt cờ, thu miệng về 0, báo cho caller mở khoá ghi âm. */
  private finish(): void {
    const wasPlaying = this.playing;
    this.playing = false;
    if (this.raf !== undefined) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }
    this.amplitude = 0;
    this.onAmplitude?.(0);
    if (wasPlaying) this.onEnded?.();
  }

  private revokeUrl(): void {
    if (!this.objectUrl) return;
    try {
      URL.revokeObjectURL(this.objectUrl);
    } catch {
      // Không hỗ trợ revoke: bỏ qua.
    }
    this.objectUrl = undefined;
  }
}
