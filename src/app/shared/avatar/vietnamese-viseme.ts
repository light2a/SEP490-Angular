/**
 * Sinh chuỗi khẩu hình (viseme) từ CHỮ tiếng Việt, để avatar nhép miệng đúng hình theo từng âm.
 *
 * TẠI SAO phải tự sinh: không nhà cung cấp TTS nào trả viseme cho tiếng Việt. Azure Speech có
 * viseme event nhưng `redlips_front` chỉ hỗ trợ `en-US`, `FacialExpression` chỉ `en-US`/`zh-CN`;
 * Gemini TTS (đang dùng) không trả timing âm vị. Đổi nhà cung cấp sẽ tốn tiền mà vẫn không có gì.
 *
 * VÌ SAO LÀM ĐƯỢC: tiếng Việt là ngôn ngữ chính tả gần như phiên âm một-một — nhìn chữ suy ra âm
 * rất đều — và viết RỜI từng âm tiết. Nên phân tích [phụ âm đầu][âm đệm][âm chính][phụ âm cuối]
 * bằng bảng quy tắc cho kết quả sát, khác hẳn tiếng Anh vốn phải tra từ điển phát âm.
 *
 * File này là hàm THUẦN: không đụng Three.js, không đụng DOM, không đọc thời gian thật. Nó chỉ trả
 * TRỌNG SỐ tương đối; phía phát giọng nhân với thời lượng thật của file audio. Nhờ vậy nó không
 * phụ thuộc tốc độ đọc của giọng TTS, và test được bằng vitest mà không cần trình duyệt.
 *
 * ⚠ Chuỗi này chỉ quyết định HÌNH miệng. ĐỘ MỞ do biên độ audio thật quyết định (xem
 * `avatar-speech.ts`). Đó là chủ ý: timing suy từ chữ luôn là ước lượng, còn biên độ đo từ chính
 * luồng âm thanh đang phát thì luôn đúng — ghép lại thì lệch vài chục ms cũng không lộ, và khoảng
 * lặng đầu/cuối file MP3 tự xử lý (biên độ 0 ⇒ miệng đóng).
 */

/** 15 khẩu hình chuẩn Oculus — đúng tên morph target mà model xuất ra. */
export const VISEMES = [
  'viseme_sil',
  'viseme_PP',
  'viseme_FF',
  'viseme_TH',
  'viseme_DD',
  'viseme_kk',
  'viseme_CH',
  'viseme_SS',
  'viseme_nn',
  'viseme_RR',
  'viseme_aa',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
] as const;

export type Viseme = (typeof VISEMES)[number];

/** Một khẩu hình + thời lượng TƯƠNG ĐỐI của nó (chưa phải giây). */
export interface VisemeCue {
  viseme: Viseme;
  weight: number;
  /**
   * `true` = suy đoán từ chữ KHÔNG đáng tin ở đoạn này (từ tiếng Anh lẫn vào).
   *
   * Câu hỏi phỏng vấn IT gần như luôn trộn hai thứ tiếng ("giải thích về REST API"), mà bảng quy
   * tắc ở đây chỉ đúng cho âm tiết tiếng Việt. Tệ hơn: TTS có thể đọc từ đó theo giọng Anh, lúc ấy
   * suy từ mặt chữ sai hẳn. Đánh dấu ra để phía phát giọng chuyển sang đọc khẩu hình TỪ CHÍNH ÂM
   * THANH ở đúng những đoạn này — xem `AvatarSpeech.spectralViseme()`.
   */
  uncertain?: boolean;
}

/** Một khẩu hình đã gắn mốc thời gian thật, tính từ lúc audio bắt đầu. */
export interface VisemeFrame {
  /** Giây kể từ đầu audio. */
  at: number;
  viseme: Viseme;
  /** Xem `VisemeCue.uncertain`. */
  uncertain?: boolean;
}

// ---------------------------------------------------------------------------
// Trọng số thời lượng
//
// Nguyên âm là phần NGÂN của âm tiết nên dài hơn hẳn phụ âm — đây là lý do chính khiến chia đều
// theo số ký tự trông sai: "nghiêng" (7 chữ) và "a" (1 chữ) đọc gần bằng nhau về thời lượng.
// ---------------------------------------------------------------------------

const W_ONSET = 1;
/** Âm đệm /w/ trong "hoa", "quy" — lướt rất nhanh. */
const W_GLIDE = 0.6;
const W_NUCLEUS = 2.5;
/** Yếu tố thứ hai của nguyên âm đôi ("iê", "uô", "ươ") — ngắn hơn yếu tố đầu. */
const W_NUCLEUS_2 = 1.5;
const W_CODA = 0.8;
/** Ngắt giữa câu (phẩy, chấm phẩy, hai chấm). */
const W_PAUSE_SHORT = 1.5;
/** Ngắt cuối câu (chấm, hỏi, chấm than). */
const W_PAUSE_LONG = 3;

// ---------------------------------------------------------------------------
// Bảng ánh xạ chữ → khẩu hình
// ---------------------------------------------------------------------------

/**
 * Phụ âm đầu. Phải khớp CHUỖI DÀI TRƯỚC: "ngh" trước "ng" trước "n", nếu không "nghiêng" sẽ bị
 * đọc thành "n" + "ghiêng" và ra sai hoàn toàn.
 */
const ONSETS: ReadonlyArray<readonly [string, Viseme]> = [
  // 3 ký tự
  ['ngh', 'viseme_kk'],
  // 2 ký tự
  ['ng', 'viseme_kk'],
  ['nh', 'viseme_nn'],
  ['ch', 'viseme_CH'],
  ['tr', 'viseme_CH'],
  ['gi', 'viseme_CH'],
  ['gh', 'viseme_kk'],
  ['kh', 'viseme_kk'],
  ['ph', 'viseme_FF'],
  ['th', 'viseme_DD'],
  ['qu', 'viseme_kk'], // /kw/ — phần /w/ được thêm làm âm đệm, xem parseSyllable
  // 1 ký tự
  ['b', 'viseme_PP'],
  ['m', 'viseme_PP'],
  ['p', 'viseme_PP'],
  ['v', 'viseme_FF'],
  ['t', 'viseme_DD'],
  ['đ', 'viseme_DD'],
  ['d', 'viseme_DD'],
  ['c', 'viseme_kk'],
  ['k', 'viseme_kk'],
  ['q', 'viseme_kk'],
  ['g', 'viseme_kk'],
  ['h', 'viseme_kk'],
  ['s', 'viseme_SS'],
  ['x', 'viseme_SS'],
  ['n', 'viseme_nn'],
  ['l', 'viseme_nn'],
  ['r', 'viseme_RR'],
];

/** Phụ âm cuối. Cũng phải khớp chuỗi dài trước ("ng" trước "n"). */
const CODAS: ReadonlyArray<readonly [string, Viseme]> = [
  ['ngh', 'viseme_kk'],
  ['ng', 'viseme_kk'],
  ['nh', 'viseme_CH'],
  ['ch', 'viseme_CH'],
  ['m', 'viseme_PP'],
  ['p', 'viseme_PP'],
  ['n', 'viseme_DD'],
  ['t', 'viseme_DD'],
  ['c', 'viseme_kk'],
];

/** Nguyên âm đơn → khẩu hình. */
const VOWELS: Readonly<Record<string, Viseme>> = {
  a: 'viseme_aa',
  ă: 'viseme_aa',
  â: 'viseme_aa',
  e: 'viseme_E',
  ê: 'viseme_E',
  i: 'viseme_I',
  y: 'viseme_I',
  o: 'viseme_O',
  ô: 'viseme_O',
  ơ: 'viseme_O',
  u: 'viseme_U',
  ư: 'viseme_U',
};

/**
 * Nguyên âm đôi/ba — khớp TRƯỚC nguyên âm đơn.
 *
 * Đây là chỗ dễ sai nhất: "người" mà tách thành n + g + ư + ơ + i thì miệng chạy 3 khẩu hình rời
 * trong khi người ta đọc liền một hơi. Gom lại thành chuỗi 2 khẩu hình mới đúng nhịp.
 */
const DIPHTHONGS: ReadonlyArray<readonly [string, readonly Viseme[]]> = [
  ['iê', ['viseme_I', 'viseme_E']],
  ['yê', ['viseme_I', 'viseme_E']],
  ['ia', ['viseme_I', 'viseme_aa']],
  ['ya', ['viseme_I', 'viseme_aa']],
  ['uô', ['viseme_U', 'viseme_O']],
  ['ua', ['viseme_U', 'viseme_aa']],
  ['ươ', ['viseme_U', 'viseme_O']],
  ['ưa', ['viseme_U', 'viseme_aa']],
  ['ai', ['viseme_aa', 'viseme_I']],
  ['ao', ['viseme_aa', 'viseme_O']],
  ['au', ['viseme_aa', 'viseme_U']],
  ['ay', ['viseme_aa', 'viseme_I']],
  ['âu', ['viseme_aa', 'viseme_U']],
  ['ây', ['viseme_aa', 'viseme_I']],
  ['eo', ['viseme_E', 'viseme_O']],
  ['êu', ['viseme_E', 'viseme_U']],
  ['iu', ['viseme_I', 'viseme_U']],
  ['oi', ['viseme_O', 'viseme_I']],
  ['ôi', ['viseme_O', 'viseme_I']],
  ['ơi', ['viseme_O', 'viseme_I']],
  ['ui', ['viseme_U', 'viseme_I']],
  ['ưi', ['viseme_U', 'viseme_I']],
  ['ưu', ['viseme_U', 'viseme_U']],
  ['oa', ['viseme_O', 'viseme_aa']],
  ['oe', ['viseme_O', 'viseme_E']],
  ['uê', ['viseme_U', 'viseme_E']],
  ['uy', ['viseme_U', 'viseme_I']],
];

// ---------------------------------------------------------------------------
// Chuẩn hoá chữ
// ---------------------------------------------------------------------------

/**
 * Bỏ DẤU THANH (sắc huyền hỏi ngã nặng) nhưng GIỮ dấu tạo chữ (ă â ê ô ơ ư).
 *
 * Không dùng cách bỏ hết dấu quen thuộc: "ơ" mà thành "o" thì "cơm" và "com" ra cùng khẩu hình,
 * mà hai chữ đó tròn môi khác hẳn nhau. Thanh điệu thì ngược lại — nó đổi cao độ chứ không đổi
 * hình miệng, nên bỏ đi là đúng.
 */
function stripToneMarks(text: string): string {
  // Viết bằng mã Unicode chứ không dán ký tự tổ hợp trực tiếp: dấu tổ hợp không hiện rõ trong
  // editor, sửa nhầm một cái là hỏng âm thầm mà nhìn code không thấy gì bất thường.
  // U+0300 huyền · U+0301 sắc · U+0303 ngã · U+0309 hỏi · U+0323 nặng.
  // KHÔNG đụng U+0302 (â ê ô), U+0306 (ă), U+031B (ơ ư) — chúng tạo CHỮ KHÁC, không phải thanh.
  const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;
  return text.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');
}

/** Chữ số → chữ đọc, để nhịp khẩu hình khớp với thứ mà TTS thật sự đọc ra. */
const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/**
 * Đọc số nguyên thành chữ tiếng Việt.
 *
 * VÌ SAO CẦN: TTS đọc "5" thành "năm" (1 âm tiết) còn ký tự "5" thì không suy ra khẩu hình nào.
 * Bỏ qua thì mọi âm tiết PHÍA SAU bị lệch nhịp dồn — sai số tích luỹ chứ không phải sai một chỗ.
 * Chỉ cần đúng SỐ ÂM TIẾT và hình gần đúng, nên bản rút gọn tới hàng triệu là đủ cho câu hỏi
 * phỏng vấn ("3 năm kinh nghiệm", "10 dự án").
 */
function numberToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 10) return DIGIT_WORDS[n];

  if (n < 100) {
    const tens = Math.floor(n / 10);
    const units = n % 10;
    const head = tens === 1 ? 'mười' : `${DIGIT_WORDS[tens]} mươi`;
    if (units === 0) return head;
    // Biến âm bắt buộc: "hai mươi mốt" chứ không phải "hai mươi một"; "lăm" chứ không "năm".
    if (units === 1 && tens > 1) return `${head} mốt`;
    if (units === 5) return `${head} lăm`;
    return `${head} ${DIGIT_WORDS[units]}`;
  }

  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const head = `${DIGIT_WORDS[hundreds]} trăm`;
    if (rest === 0) return head;
    // "một trăm lẻ năm" — thiếu "lẻ" là hụt mất một âm tiết.
    if (rest < 10) return `${head} lẻ ${DIGIT_WORDS[rest]}`;
    return `${head} ${numberToWords(rest)}`;
  }

  for (const [limit, unit] of [
    [1_000_000_000, 'tỷ'],
    [1_000_000, 'triệu'],
    [1000, 'nghìn'],
  ] as const) {
    if (n >= limit) {
      const head = `${numberToWords(Math.floor(n / limit))} ${unit}`;
      const rest = n % limit;
      return rest === 0 ? head : `${head} ${numberToWords(rest)}`;
    }
  }
  return '';
}

/** Ký tự được coi là chữ cái tiếng Việt (đã bỏ dấu thanh). */
const VN_LETTER = /[a-zăâêôơưđ]/;

// ---------------------------------------------------------------------------
// Phân tích âm tiết
// ---------------------------------------------------------------------------

function matchPrefix(
  word: string,
  table: ReadonlyArray<readonly [string, Viseme]>,
): readonly [string, Viseme] | null {
  for (const entry of table) {
    if (word.startsWith(entry[0])) return entry;
  }
  return null;
}

function matchSuffix(
  word: string,
  table: ReadonlyArray<readonly [string, Viseme]>,
): readonly [string, Viseme] | null {
  for (const entry of table) {
    if (word.length > entry[0].length && word.endsWith(entry[0])) return entry;
  }
  return null;
}

/**
 * Phân tích một âm tiết tiếng Việt thành chuỗi khẩu hình.
 * Trả `null` khi chuỗi không phải âm tiết tiếng Việt hợp lệ (thường là từ tiếng Anh lẫn vào).
 */
function parseSyllable(raw: string): VisemeCue[] | null {
  let rest = raw;
  const cues: VisemeCue[] = [];

  // 1. Phụ âm đầu
  const onset = matchPrefix(rest, ONSETS);
  if (onset) {
    // Không được ăn hết chữ: "nga" có phụ âm đầu "ng", nhưng "ng" đứng một mình thì không phải
    // âm tiết — phải còn lại phần vần.
    if (onset[0].length < rest.length) {
      cues.push({ viseme: onset[1], weight: W_ONSET });
      rest = rest.slice(onset[0].length);
      // "qu" = /kw/: phần /w/ là âm đệm, lướt nhanh sang nguyên âm.
      if (onset[0] === 'qu') cues.push({ viseme: 'viseme_U', weight: W_GLIDE });
    }
  }

  // 2. Phụ âm cuối (cắt từ đuôi, phần còn lại là âm chính)
  const coda = matchSuffix(rest, CODAS);
  let codaCue: VisemeCue | null = null;
  if (coda) {
    codaCue = { viseme: coda[1], weight: W_CODA };
    rest = rest.slice(0, rest.length - coda[0].length);
  }

  // 3. Âm chính — bắt buộc phải có, nếu không thì đây không phải âm tiết tiếng Việt.
  if (rest.length === 0) return null;

  // Âm đệm "o"/"u" trước nguyên âm khác: "hoa", "tuấn". Chỉ nhận khi phần còn lại vẫn có nguyên âm.
  const diph = DIPHTHONGS.find((d) => d[0] === rest);
  if (diph) {
    cues.push({ viseme: diph[1][0], weight: W_NUCLEUS });
    cues.push({ viseme: diph[1][1], weight: W_NUCLEUS_2 });
  } else if (rest.length === 1 && VOWELS[rest]) {
    cues.push({ viseme: VOWELS[rest], weight: W_NUCLEUS });
  } else {
    // Nguyên âm ba ("uyê" trong "chuyên", "oai" trong "ngoài") hoặc tổ hợp lạ: lấy từng nguyên âm
    // theo đúng thứ tự chữ. Yếu tố đầu ngân dài nhất.
    const vowelChars = [...rest].filter((ch) => VOWELS[ch]);
    if (vowelChars.length === 0 || vowelChars.length !== rest.length) return null;
    vowelChars.forEach((ch, i) => {
      cues.push({ viseme: VOWELS[ch], weight: i === 0 ? W_NUCLEUS : W_NUCLEUS_2 });
    });
  }

  if (codaCue) cues.push(codaCue);
  return cues.length > 0 ? cues : null;
}

/**
 * Từ KHÔNG phải tiếng Việt (chủ yếu là thuật ngữ tiếng Anh: "framework", "database", "REST API").
 *
 * CỐ Ý KHÔNG áp quy tắc âm tiết tiếng Việt lên chúng — làm vậy sẽ tạo hình miệng sai một cách rất
 * tự tin. Chỉ ước lượng NHỊP theo cụm nguyên âm (mỗi cụm ≈ một âm tiết) để chuỗi không bị hụt chỗ,
 * rồi đánh dấu `uncertain` để phía phát giọng đọc khẩu hình từ chính âm thanh ở đoạn này.
 *
 * Vì sao không cố phiên âm cho chuẩn hơn: cách TTS đọc một từ tiếng Anh trong câu tiếng Việt là
 * thứ ta KHÔNG kiểm soát và có thể đổi khi nhà cung cấp cập nhật giọng. Đoán mò ở đây là xây trên
 * một giả định không kiểm chứng được; đọc từ sóng âm thì luôn khớp với thứ đang thật sự phát ra.
 */
function foreignWordCues(word: string): VisemeCue[] {
  const cues: VisemeCue[] = [];
  let inVowelRun = false;
  for (const ch of word) {
    const v = VOWELS[ch];
    if (v) {
      if (!inVowelRun) cues.push({ viseme: v, weight: W_NUCLEUS, uncertain: true });
      inVowelRun = true;
    } else {
      inVowelRun = false;
    }
  }
  // Từ không có nguyên âm nào ("HTML", "SQL" đọc rời từng chữ cái) — giữ một khẩu hình trung tính
  // theo độ dài, thà chung chung còn hơn tạo hình sai.
  if (cues.length === 0) {
    cues.push({
      viseme: 'viseme_aa',
      weight: W_NUCLEUS * Math.min(3, Math.max(1, word.length / 2)),
      uncertain: true,
    });
  }
  return cues;
}

// ---------------------------------------------------------------------------
// API công khai
// ---------------------------------------------------------------------------

/**
 * Chữ → chuỗi khẩu hình kèm trọng số thời lượng TƯƠNG ĐỐI.
 *
 * Chuỗi luôn mở và đóng bằng `viseme_sil` để miệng khép lại lúc chưa nói và sau khi nói xong.
 */
export function textToVisemeCues(text: string): VisemeCue[] {
  // THỨ TỰ QUAN TRỌNG: đổi số thành chữ TRƯỚC, bỏ dấu thanh SAU.
  // Làm ngược lại thì chữ do numberToWords sinh ra ("mốt", "một", "tư") còn nguyên dấu thanh, tra
  // bảng nguyên âm trượt hết, rồi rơi nhầm sang nhánh xử lý từ ngoại lai — hỏng âm thầm, chỉ lộ ra
  // ở chỗ nhịp miệng lệch dần sau mỗi con số.
  const normalized = stripToneMarks(
    (text ?? '').toLowerCase().replace(/\d+/g, (m) => ` ${numberToWords(Number(m))} `),
  );

  const cues: VisemeCue[] = [{ viseme: 'viseme_sil', weight: W_PAUSE_SHORT }];

  // Tách theo từ và dấu câu. Giữ lại dấu câu vì nó là chỗ ngắt hơi thật.
  const tokens = normalized.match(/[a-zăâêôơưđ]+|[.!?]|[,;:]/g) ?? [];

  for (const token of tokens) {
    if ('.!?'.includes(token)) {
      cues.push({ viseme: 'viseme_sil', weight: W_PAUSE_LONG });
      continue;
    }
    if (',;:'.includes(token)) {
      cues.push({ viseme: 'viseme_sil', weight: W_PAUSE_SHORT });
      continue;
    }
    if (!VN_LETTER.test(token)) continue;

    const parsed = parseSyllable(token);
    cues.push(...(parsed ?? foreignWordCues(token)));
  }

  cues.push({ viseme: 'viseme_sil', weight: W_PAUSE_SHORT });
  return cues;
}

/**
 * Gắn mốc thời gian THẬT cho chuỗi khẩu hình, dựa trên thời lượng audio đo được.
 *
 * Đây là chỗ trọng số tương đối biến thành giây. Nhờ chuẩn hoá theo tổng trọng số, chuỗi tự co
 * giãn theo tốc độ đọc của giọng TTS mà không cần biết trước tốc độ đó.
 */
export function cuesToTimeline(cues: VisemeCue[], durationSec: number): VisemeFrame[] {
  if (cues.length === 0 || !(durationSec > 0)) return [];

  const total = cues.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return [];

  const frames: VisemeFrame[] = [];
  let elapsed = 0;
  for (const cue of cues) {
    frames.push({
      at: (elapsed / total) * durationSec,
      viseme: cue.viseme,
      uncertain: cue.uncertain,
    });
    elapsed += cue.weight;
  }
  return frames;
}

/**
 * Khẩu hình đang có hiệu lực tại thời điểm `t`.
 *
 * Dùng tìm kiếm nhị phân vì hàm này chạy MỖI KHUNG HÌNH trong lúc phát; quét tuyến tính trên câu
 * dài sẽ thành việc thừa lặp 60 lần/giây.
 */
export function frameAt(frames: VisemeFrame[], t: number): VisemeFrame | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].at <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return frames[found];
}

/** Như `frameAt` nhưng chỉ lấy khẩu hình — tiện cho chỗ không quan tâm độ tin cậy. */
export function visemeAt(frames: VisemeFrame[], t: number): Viseme {
  return frameAt(frames, t)?.viseme ?? 'viseme_sil';
}
