import type * as THREE from 'three';

/**
 * Cảnh 3D cho avatar phỏng vấn — bọc Three.js sau một lớp mỏng.
 *
 * TẠI SAO tách khỏi component: toàn bộ Three.js được nạp bằng `await import('three')` trong `init()`,
 * nên nó nằm ở CHUNK RIÊNG. Route practice-session / campaign-interview không bị phình vì thư viện 3D,
 * và máy không có WebGL thì chunk đó không bao giờ được tải về.
 *
 * Có 2 chế độ hiển thị:
 *  - `modelUrl` rỗng (mặc định) → dựng đầu người bằng hình học cơ bản. KHÔNG cần asset ngoài, không
 *    vướng license, không tải file nặng.
 *  - `modelUrl` trỏ tới file .glb (vd Ready Player Me) → nạp bằng GLTFLoader và điều khiển morph target
 *    ARKit chuẩn (`jawOpen` / `mouthOpen`, `eyeBlinkLeft` / `eyeBlinkRight`).
 */

/** Số khung/giây khi avatar đứng im — hạ tải GPU lúc không nói (chỉ còn chớp mắt + lắc đầu nhẹ). */
const IDLE_FPS = 24;
/** Thời lượng một lần chớp mắt (giây). */
const BLINK_DURATION = 0.13;
/** Khoảng cách ngẫu nhiên giữa 2 lần chớp (giây) — người thật chớp ~mỗi 2–6s. */
const BLINK_MIN_GAP = 2.2;
const BLINK_MAX_GAP = 6;
/** Trần devicePixelRatio: retina 3x không đáng để trả giá GPU cho một cái đầu. */
const MAX_PIXEL_RATIO = 1.5;

/** Tên morph target ARKit mà Ready Player Me xuất ra, theo thứ tự ưu tiên. */
const MOUTH_MORPHS = ['jawOpen', 'mouthOpen', 'viseme_aa'];
const BLINK_MORPHS_LEFT = ['eyeBlinkLeft', 'eyesClosed'];
const BLINK_MORPHS_RIGHT = ['eyeBlinkRight', 'eyesClosed'];

/** Độ mở miệng lúc im lặng (scale.y) — dùng chung cho lúc dựng và lúc chạy. */
const MOUTH_CLOSED_SCALE_Y = 0.12;
/** Biên độ mở miệng tối đa cộng thêm khi nói to nhất. */
const MOUTH_OPEN_RANGE = 0.72;

/** Tỉ lệ ellipsoid của hộp sọ (bán kính gốc = 1). */
const SKULL_X = 0.82;
const SKULL_Z = 0.86;

/**
 * Toạ độ z trên bề mặt hộp sọ tại (x, y) — dùng để "dán" mắt/mũi/miệng lên đúng mặt cầu.
 * Đặt z bằng số áng chừng thì các chi tiết chìm vào trong sọ và khuôn mặt trông trống trơn.
 */
function surfaceZ(x: number, y: number): number {
  const k = 1 - (x / SKULL_X) ** 2 - y ** 2;
  return SKULL_Z * Math.sqrt(Math.max(0, k));
}

/** Một morph target đã tra được: mesh nào, chỉ số nào trong `morphTargetInfluences`. */
interface MorphRef {
  mesh: THREE.Mesh;
  index: number;
}

export interface AvatarSceneOptions {
  /** URL file .glb; rỗng/null → dùng đầu dựng sẵn bằng hình học. */
  modelUrl?: string | null;
}

export class AvatarScene {
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private clock?: THREE.Clock;
  private raf?: number;
  private resizeObserver?: ResizeObserver;
  private disposed = false;

  /** Nhóm đầu — dùng để lắc nhẹ (vi chuyển động) cho đỡ giống ma-nơ-canh. */
  private head?: THREE.Object3D;
  /** Mắt của bản dựng sẵn: chớp bằng cách bóp scale.y (không cần morph target). */
  private eyes: THREE.Object3D[] = [];
  /** Miệng bản dựng sẵn: mở bằng scale.y. */
  private mouth?: THREE.Object3D;
  /** Morph target khi dùng model GLB. */
  private mouthMorphs: MorphRef[] = [];
  private blinkMorphs: MorphRef[] = [];

  /** Độ mở miệng mong muốn (0..1) do biên độ audio đẩy vào. */
  private mouthTarget = 0;
  /** Độ mở miệng đang hiển thị — bám theo target có quán tính nên không giật. */
  private mouthCurrent = 0;
  private nextBlinkAt = BLINK_MIN_GAP;
  private blinkElapsed = -1;
  private elapsed = 0;
  private sinceLastFrame = 0;
  private speaking = false;

  /**
   * Máy có WebGL không. Gọi TRƯỚC `init()` để quyết định có mount avatar hay không —
   * máy yếu / trình duyệt tắt WebGL thì ẩn hẳn avatar chứ không được làm vỡ trang phỏng vấn.
   */
  static isWebGLAvailable(): boolean {
    try {
      if (typeof document === 'undefined') return false;
      // Chặn sớm ở môi trường không có WebGL (jsdom, SSR): tránh gọi getContext() rồi ăn lỗi.
      const g = globalThis as {
        WebGL2RenderingContext?: unknown;
        WebGLRenderingContext?: unknown;
      };
      if (!g.WebGL2RenderingContext && !g.WebGLRenderingContext) return false;
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl');
      return !!gl;
    } catch {
      // Một số trình duyệt ném lỗi thay vì trả null khi WebGL bị chặn.
      return false;
    }
  }

  /**
   * Dựng cảnh vào `canvas`. Ném lỗi nếu Three.js không nạp được / WebGL context tạo hụt —
   * caller phải bắt và ẩn avatar (degrade), KHÔNG để lỗi nổi lên chặn bài phỏng vấn.
   */
  async init(canvas: HTMLCanvasElement, opts: AvatarSceneOptions = {}): Promise<void> {
    const three = await import('three');
    if (this.disposed) return; // component đã destroy trong lúc chờ import

    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer = renderer;

    const scene = new three.Scene();
    this.scene = scene;

    // Camera đặt ngang tầm mắt và nhìn thẳng vào mặt: đây chính là "avatar nhìn vào bạn" —
    // nhân vật hướng mặt về +Z, camera đứng ở +Z, nên ánh mắt luôn rơi vào người xem.
    const camera = new three.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.02, 5);
    camera.lookAt(0, 0.02, 0);
    this.camera = camera;

    scene.add(new three.HemisphereLight(0xffffff, 0x445566, 2.1));
    const key = new three.DirectionalLight(0xffffff, 1.5);
    key.position.set(1.4, 2, 3);
    scene.add(key);
    const fill = new three.DirectionalLight(0xbfd4ff, 0.5);
    fill.position.set(-2, 0.5, 1.5);
    scene.add(fill);

    if (opts.modelUrl) {
      await this.loadGlb(three, opts.modelUrl);
    } else {
      this.buildProceduralHead(three);
    }

    this.clock = new three.Clock();
    this.observeResize(canvas);
    this.resize(canvas);
    this.loop();
  }

  /** Biên độ giọng nói 0..1 → độ mở miệng. Gọi liên tục từ AnalyserNode. */
  setMouthOpen(value: number): void {
    this.mouthTarget = Math.max(0, Math.min(1, value));
  }

  /** Đang nói hay không — chỉ dùng để chọn tốc độ khung hình (nói thì mượt, im thì tiết kiệm). */
  setSpeaking(value: boolean): void {
    this.speaking = value;
    if (!value) this.mouthTarget = 0;
  }

  /** Dừng vòng lặp + trả GPU resource. An toàn khi gọi nhiều lần / gọi lúc `init` chưa xong. */
  dispose(): void {
    this.disposed = true;
    if (this.raf !== undefined) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.scene?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer = undefined;
    this.scene = undefined;
    this.head = undefined;
    this.eyes = [];
    this.mouth = undefined;
    this.mouthMorphs = [];
    this.blinkMorphs = [];
  }

  // ---------- dựng hình ----------

  /**
   * Đầu người tối giản bằng hình học cơ bản: không tải asset ngoài nên không có rủi ro license,
   * không phụ thuộc CDN, và luôn chạy được kể cả offline.
   */
  private buildProceduralHead(three: typeof THREE): void {
    const scene = this.scene;
    if (!scene) return;

    const skin = new three.MeshStandardMaterial({ color: 0xe7b394, roughness: 0.85 });
    const hairMat = new three.MeshStandardMaterial({ color: 0x2f2621, roughness: 0.95 });
    const scleraMat = new three.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.35 });
    const irisMat = new three.MeshStandardMaterial({ color: 0x3d2b21, roughness: 0.25 });
    const mouthMat = new three.MeshStandardMaterial({ color: 0x7d3336, roughness: 0.6 });
    const shirtMat = new three.MeshStandardMaterial({ color: 0x3f5b9c, roughness: 0.9 });

    const head = new three.Group();
    head.position.y = 0.12;
    this.head = head;
    scene.add(head);

    const skull = new three.Mesh(new three.SphereGeometry(1, 40, 32), skin);
    skull.scale.set(SKULL_X, 1, SKULL_Z);
    head.add(skull);

    // Tóc: chỏm cầu úp lên đỉnh đầu, lùi nhẹ ra sau để chừa trán (che kín thành ra giống đội mũ bảo hiểm).
    const hair = new three.Mesh(
      // 0.40π: chỏm tóc dừng ở khoảng y≈0.32 — thấp hơn nữa là tóc trùm mất lông mày và trán.
      new three.SphereGeometry(1.03, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.4),
      hairMat,
    );
    hair.scale.set(0.86, 1.0, 0.92);
    hair.position.set(0, 0.05, -0.04);
    head.add(hair);

    for (const side of [-1, 1]) {
      const eye = new three.Group();
      // Đặt hốc mắt THEO MẶT CẦU: gán z tuỳ tiện thì con mắt chìm hẳn vào trong sọ (chỉ ló ra một
      // chấm đen). Tính toạ độ bề mặt rồi đẩy thêm ra ngoài mới thấy rõ mắt.
      eye.position.set(side * 0.3, 0.12, surfaceZ(0.3, 0.12) - 0.04);
      head.add(eye);
      this.eyes.push(eye);

      const sclera = new three.Mesh(new three.SphereGeometry(0.15, 24, 16), scleraMat);
      sclera.scale.set(1, 0.78, 0.62);
      eye.add(sclera);

      const iris = new three.Mesh(new three.SphereGeometry(0.072, 20, 14), irisMat);
      iris.position.set(0, 0, 0.08);
      eye.add(iris);

      // y=0.27: nằm gọn giữa mí trên (≈0.24) và chân tóc (≈0.32).
      const brow = new three.Mesh(new three.BoxGeometry(0.3, 0.05, 0.07), hairMat);
      brow.position.set(side * 0.3, 0.27, surfaceZ(0.3, 0.27) - 0.01);
      brow.rotation.z = side * -0.07;
      head.add(brow);
    }

    const nose = new three.Mesh(new three.ConeGeometry(0.085, 0.26, 16), skin);
    nose.position.set(0, -0.08, surfaceZ(0, -0.08));
    nose.rotation.x = Math.PI / 2;
    head.add(nose);

    // Miệng: quả cầu bẹt nhô khỏi mặt; nói = kéo scale.y lên (xem applyMouth).
    const mouth = new three.Mesh(new three.SphereGeometry(0.21, 24, 16), mouthMat);
    mouth.position.set(0, -0.44, surfaceZ(0, -0.44) - 0.02);
    // 0.12 = đúng giá trị applyMouth() dùng khi miệng đóng → không bị nảy một khung lúc khởi động.
    mouth.scale.set(1, MOUTH_CLOSED_SCALE_Y, 0.35);
    head.add(mouth);
    this.mouth = mouth;

    const neck = new three.Mesh(new three.CylinderGeometry(0.26, 0.3, 0.5, 20), skin);
    neck.position.set(0, -1.12, 0);
    this.scene?.add(neck);

    const torso = new three.Mesh(new three.CapsuleGeometry(0.62, 0.5, 8, 20), shirtMat);
    torso.position.set(0, -2.05, -0.05);
    torso.scale.set(1.35, 1, 0.85);
    this.scene?.add(torso);
  }

  /** Nạp model .glb và tra sẵn morph target để khỏi tìm lại mỗi khung hình. */
  private async loadGlb(three: typeof THREE, url: string): Promise<void> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    if (this.disposed) return;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed || !this.scene) return;

    const root = gltf.scene;
    // RPM xuất avatar cao ~1.7m, gốc ở chân → kéo xuống cho khuôn mặt vào khung hình.
    root.position.set(0, -1.55, 0);
    this.scene.add(root);
    this.head = root.getObjectByName('Head') ?? root;

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const dict = mesh.morphTargetDictionary;
      if (!dict || !mesh.morphTargetInfluences) return;
      for (const name of MOUTH_MORPHS) {
        if (dict[name] !== undefined) {
          this.mouthMorphs.push({ mesh, index: dict[name] });
          break;
        }
      }
      for (const name of [...BLINK_MORPHS_LEFT, ...BLINK_MORPHS_RIGHT]) {
        if (dict[name] !== undefined) this.blinkMorphs.push({ mesh, index: dict[name] });
      }
    });
  }

  // ---------- vòng lặp ----------

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const delta = this.clock?.getDelta() ?? 0.016;
    this.sinceLastFrame += delta;

    // Tab ẩn → không vẽ gì cả (rAF vẫn bị trình duyệt bóp, đây là chốt thứ hai).
    // Phải xoá luôn thời gian đã dồn: giữ lại thì lúc quay lại tab sẽ có một bước nhảy vài giây
    // làm đầu avatar giật một cái.
    if (typeof document !== 'undefined' && document.hidden) {
      this.sinceLastFrame = 0;
      return;
    }
    // Đứng im thì vẽ thưa lại; đang nói thì vẽ hết tốc độ để miệng bám kịp giọng.
    if (!this.speaking && this.sinceLastFrame < 1 / IDLE_FPS) return;

    const step = this.sinceLastFrame;
    this.sinceLastFrame = 0;
    this.elapsed += step;

    this.animateIdle(step);
    this.animateBlink(step);
    this.applyMouth(step);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  /** Vi chuyển động: đầu đảo rất nhẹ + thở. Không có cái này nhân vật trông như ảnh chụp. */
  private animateIdle(_step: number): void {
    const head = this.head;
    if (!head) return;
    head.rotation.y = Math.sin(this.elapsed * 0.45) * 0.045;
    head.rotation.x = Math.sin(this.elapsed * 0.31) * 0.025;
    head.rotation.z = Math.sin(this.elapsed * 0.23) * 0.012;
  }

  private animateBlink(step: number): void {
    if (this.blinkElapsed >= 0) {
      this.blinkElapsed += step;
      // Nửa đầu nhắm lại, nửa sau mở ra → tam giác 0→1→0.
      const t = this.blinkElapsed / BLINK_DURATION;
      const amount = t >= 1 ? 0 : t < 0.5 ? t * 2 : (1 - t) * 2;
      this.applyBlink(amount);
      if (t >= 1) {
        this.blinkElapsed = -1;
        this.nextBlinkAt =
          this.elapsed + BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);
      }
      return;
    }
    if (this.elapsed >= this.nextBlinkAt) this.blinkElapsed = 0;
  }

  private applyBlink(amount: number): void {
    for (const eye of this.eyes) eye.scale.y = Math.max(0.04, 1 - amount);
    for (const ref of this.blinkMorphs) {
      const influences = ref.mesh.morphTargetInfluences;
      if (influences) influences[ref.index] = amount;
    }
  }

  /**
   * Miệng bám biên độ nhưng có quán tính: nếu gán thẳng giá trị analyser thì hàm răng giật liên hồi.
   * Bám nhanh khi mở (0.35) và chậm khi đóng (0.18) cho giống cơ hàm thật.
   */
  private applyMouth(step: number): void {
    const rising = this.mouthTarget > this.mouthCurrent;
    const smoothing = rising ? 0.35 : 0.18;
    // Chuẩn hoá theo bước thời gian để tốc độ bám không đổi khi FPS thay đổi.
    const factor = 1 - Math.pow(1 - smoothing, Math.max(1, step * 60));
    this.mouthCurrent += (this.mouthTarget - this.mouthCurrent) * factor;

    if (this.mouth)
      this.mouth.scale.y = MOUTH_CLOSED_SCALE_Y + this.mouthCurrent * MOUTH_OPEN_RANGE;
    for (const ref of this.mouthMorphs) {
      const influences = ref.mesh.morphTargetInfluences;
      if (influences) influences[ref.index] = this.mouthCurrent;
    }
  }

  // ---------- kích thước ----------

  private observeResize(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.resize(canvas));
    this.resizeObserver.observe(canvas);
  }

  private resize(canvas: HTMLCanvasElement): void {
    const width = canvas.clientWidth || 240;
    const height = canvas.clientHeight || 260;
    this.renderer?.setSize(width, height, false);
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }
}
