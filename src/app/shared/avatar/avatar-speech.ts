import {
  cuesToTimeline,
  frameAt,
  textToVisemeCues,
  type Viseme,
  type VisemeCue,
  type VisemeFrame,
} from './vietnamese-viseme';

/**
 * Phát giọng đọc câu hỏi và điều khiển miệng bằng BA nguồn tín hiệu, mỗi nguồn dùng đúng chỗ mạnh.
 *
 * 1. **Biên độ** (RMS từ AnalyserNode) → miệng mở BAO NHIÊU. Đo từ chính luồng đang phát nên không
 *    bao giờ sai; nó cũng là thứ tự khép miệng ở khoảng lặng đầu/cuối file mà không cần dò.
 * 2. **Chữ viết** (bảng quy tắc âm tiết, xem `vietnamese-viseme.ts`) → miệng có HÌNH gì. Chi tiết
 *    nhất (phân biệt được cả phụ âm cuối) nhưng CHỈ đúng với âm tiết tiếng Việt.
 * 3. **Phổ tần số** (formant, `spectralViseme`) → hình miệng đọc thẳng từ sóng âm. Thô hơn nguồn 2
 *    nhưng KHÔNG phụ thuộc ngôn ngữ.
 *
 * TẠI SAO phải có nguồn 3: câu hỏi phỏng vấn IT gần như luôn trộn hai thứ tiếng ("giải thích về
 * REST API"), mà mặt chữ tiếng Anh không cho biết TTS sẽ đọc nó thế nào — và ta cũng không kiểm
 * soát được điều đó, nhà cung cấp cập nhật giọng là đổi. `vietnamese-viseme` tự đánh dấu những
 * đoạn nó không chắc; đúng ở đó ta chuyển sang nghe sóng âm.
 *
 * Không nhà cung cấp TTS nào trả timing âm vị cho tiếng Việt (Azure có viseme event nhưng chỉ cho
 * en-US/zh-CN), nên không có đường tắt nào tốt hơn ba nguồn này.
 *
 * Mọi API trình duyệt ở đây (AudioContext, play(), createObjectURL) đều được bọc guard: môi trường test
 * (jsdom) và trình duyệt chặn autoplay đều KHÔNG được phép ném lỗi làm vỡ trang phỏng vấn.
 */

/** Hệ số khuếch đại RMS → độ mở miệng. Giọng nói thường cho RMS ~0.05–0.25. */
const AMPLITUDE_GAIN = 4.2;
/**
 * Kích thước FFT.
 *
 * 1024 (không phải 256 như lúc chỉ đo biên độ): còn phải đọc formant để suy khẩu hình từ sóng âm,
 * mà 256 bin ở 44,1kHz cho mỗi bin ~172Hz — quá thô để tách F1 (~300–800Hz) khỏi F2 (~800–2500Hz).
 * 1024 cho ~43Hz/bin, đủ phân biệt. Chi phí thêm không đáng kể vì mỗi lần phát chỉ một luồng.
 */
const FFT_SIZE = 1024;

/** Dưới ngưỡng này coi như im lặng (tổng năng lượng phổ đã chuẩn hoá 0..1). */
const SILENCE_ENERGY = 0.035;
/** Tỉ lệ năng lượng trên 4kHz vượt ngưỡng ⇒ đang là âm xát (s, x, sh) chứ không phải nguyên âm. */
const FRICATIVE_RATIO = 0.34;

export class AvatarSpeech {
  /** Biên độ hiện tại 0..1 (0 khi không phát). */
  private amplitude = 0;
  private audio?: HTMLAudioElement;
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  // Ràng buộc ArrayBuffer (không phải ArrayBufferLike) để khớp chữ ký getByteTimeDomainData.
  private data?: Uint8Array<ArrayBuffer>;
  /** Phổ tần số, dùng để suy khẩu hình từ sóng âm ở những đoạn chữ viết không đáng tin. */
  private spectrum?: Uint8Array<ArrayBuffer>;
  private raf?: number;
  private objectUrl?: string;
  private disposed = false;
  private playing = false;

  /** Chuỗi khẩu hình của câu đang đọc; rỗng khi caller không truyền text. */
  private cues: VisemeCue[] = [];
  /** Chuỗi trên đã gắn mốc thời gian thật; dựng trễ vì phải đợi biết thời lượng audio. */
  private timeline: VisemeFrame[] = [];

  /** Gọi mỗi khung hình khi đang phát, kèm biên độ 0..1. */
  onAmplitude?: (value: number) => void;
  /** Gọi mỗi khung hình khi đang phát, kèm khẩu hình đang tới. */
  onViseme?: (viseme: Viseme) => void;
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
   *
   * `text` là nội dung câu hỏi để suy ra khẩu hình. Bỏ trống thì vẫn phát tiếng và vẫn nhép theo
   * biên độ, chỉ mất phần tạo hình miệng — nên client cũ không truyền cũng không vỡ.
   */
  async play(blob: Blob, text?: string): Promise<boolean> {
    if (this.disposed) return false;
    this.stop();

    // Dựng chuỗi khẩu hình ngay, nhưng CHƯA gắn mốc thời gian: thời lượng audio lúc này còn là
    // NaN (chưa nạp metadata). Việc gắn mốc để `currentViseme()` làm khi đã biết thời lượng thật.
    this.cues = text ? textToVisemeCues(text) : [];
    this.timeline = [];

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
    this.spectrum = undefined;
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
      this.spectrum = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
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
    if (this.onViseme) this.onViseme(this.currentViseme());
  };

  /**
   * Khẩu hình tại vị trí phát hiện tại — chọn nguồn theo chỗ nào đáng tin hơn.
   *
   * Âm tiết tiếng Việt: tin bảng quy tắc suy từ chữ (chi tiết hơn, phân biệt được cả phụ âm cuối).
   * Từ tiếng Anh lẫn vào ("REST API", "framework"): chữ viết KHÔNG cho biết TTS sẽ đọc thế nào, nên
   * chuyển sang đọc thẳng từ sóng âm. Không có text thì dùng sóng âm cho toàn bộ.
   *
   * Mốc thời gian được gắn TRỄ, ngay lần gọi đầu tiên có thời lượng hợp lệ: `audio.duration` là
   * `NaN` cho tới khi trình duyệt nạp xong metadata, mà chia cho `NaN` thì mọi mốc thành `NaN` và
   * miệng đứng im cả câu — hỏng im lặng, không báo lỗi gì.
   */
  private currentViseme(): Viseme {
    const audio = this.audio;
    if (!audio) return 'viseme_sil';
    if (this.cues.length === 0) return this.spectralViseme();

    if (this.timeline.length === 0) {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return 'viseme_sil';
      this.timeline = cuesToTimeline(this.cues, duration);
    }

    const frame = frameAt(this.timeline, audio.currentTime);
    if (!frame) return 'viseme_sil';
    // Đoạn chữ viết không đáng tin → nhường cho sóng âm. Nếu sóng âm cũng không kết luận được
    // (im lặng) thì giữ lại phỏng đoán từ chữ, vẫn hơn là đứng hình.
    if (frame.uncertain) {
      const fromAudio = this.spectralViseme();
      return fromAudio === 'viseme_sil' ? frame.viseme : fromAudio;
    }
    return frame.viseme;
  }

  /**
   * Suy khẩu hình từ PHỔ TẦN SỐ của tiếng đang phát — không phụ thuộc ngôn ngữ.
   *
   * Nguyên lý: hình miệng quyết định khoang cộng hưởng, khoang cộng hưởng quyết định hai đỉnh
   * formant F1/F2. Nên đọc ngược lại được: F1 cao ⇒ hàm mở ("a"); F2 cao ⇒ lưỡi trước, môi dẹt
   * ("i", "e"); F2 thấp ⇒ môi tròn ("u", "o"). Âm xát (s/x) thì năng lượng dồn lên trên 4kHz và
   * không có formant rõ, tách riêng bằng tỉ lệ năng lượng cao tần.
   *
   * ⚠ Đây là ƯỚC LƯỢNG THÔ, cố ý chỉ phân 6 nhóm dễ thấy bằng mắt thay vì cố đoán đủ 15 khẩu hình:
   * phân loại càng mịn thì càng hay nhảy lung tung giữa các khung hình, mà miệng giật còn lộ hơn
   * miệng chung chung. Phụ âm tắc (p/b/t/k) không tách được ở đây — chúng quá ngắn và đặc trưng
   * nằm ở khoảng lặng trước tiếng bật, thứ mà cửa sổ FFT này không thấy.
   */
  private spectralViseme(): Viseme {
    const analyser = this.analyser;
    const spectrum = this.spectrum;
    const ctx = this.ctx;
    if (!analyser || !spectrum || !ctx) return 'viseme_sil';

    analyser.getByteFrequencyData(spectrum);
    const binHz = ctx.sampleRate / analyser.fftSize;

    let total = 0;
    let high = 0;
    for (let i = 0; i < spectrum.length; i++) {
      total += spectrum[i];
      if (i * binHz > 4000) high += spectrum[i];
    }
    // Chuẩn hoá về 0..1 để ngưỡng không phụ thuộc số bin.
    if (total / (spectrum.length * 255) < SILENCE_ENERGY) return 'viseme_sil';
    if (total > 0 && high / total > FRICATIVE_RATIO) return 'viseme_SS';

    // F1 dò từ 280Hz chứ không phải từ 200: dưới mốc đó là cao độ giọng nữ (F0 ~200–250Hz) và hài
    // bậc thấp của nó, vốn mạnh hơn formant thật nên hút hết đỉnh về mình. Đo trên một câu tiếng
    // Việt thật, sửa riêng chỗ này đã kéo tỉ lệ nhận đúng "a" từ 16% lên 46% (chữ cho thấy đúng ra
    // phải ~45%).
    const f1 = this.peakHz(spectrum, binHz, 280, 1100);
    const f2 = this.peakHz(spectrum, binHz, 900, 3000);

    // 420Hz nằm giữa F1 của nguyên âm ĐÓNG (i, u: ~300–370) và nguyên âm MỞ (a: ~730–850), nên
    // tách được cả giọng nam lẫn nữ chứ không phải con số khớp riêng một giọng.
    if (f1 > 420) return 'viseme_aa';
    if (f2 > 1700) return f1 < 420 ? 'viseme_I' : 'viseme_E';
    if (f2 < 1050) return f1 < 420 ? 'viseme_U' : 'viseme_O';
    return 'viseme_E';
  }

  /** Tần số của đỉnh mạnh nhất trong dải [loHz, hiHz]. */
  private peakHz(spectrum: Uint8Array, binHz: number, loHz: number, hiHz: number): number {
    const lo = Math.max(1, Math.floor(loHz / binHz));
    const hi = Math.min(spectrum.length - 1, Math.ceil(hiHz / binHz));
    let bestBin = lo;
    let bestVal = -1;
    for (let i = lo; i <= hi; i++) {
      if (spectrum[i] > bestVal) {
        bestVal = spectrum[i];
        bestBin = i;
      }
    }
    return bestBin * binHz;
  }

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
    this.timeline = [];
    this.onAmplitude?.(0);
    // Trả miệng về trạng thái nghỉ, nếu không khẩu hình cuối cùng đọng lại trên mặt sau khi hết tiếng.
    this.onViseme?.('viseme_sil');
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
