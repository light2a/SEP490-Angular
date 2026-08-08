import { AdaptiveAction, AnswerStatus, JobCategory, QuestionKind, SessionStatus } from './enums';

export interface CreatePracticeSessionRequest {
  cvId?: string | null;
  jdId?: string | null;
  jobCategory: JobCategory;
  /**
   * JD dán thẳng dạng text — khỏi phải upload PDF trước (quy ước C11 của B2B).
   * Gửi cả jdText lẫn jdId → BE dùng TEXT, bỏ file (và không lưu jdId).
   */
  jdText?: string | null;
  /** F2 — thời lượng mỗi câu (giây). BE chỉ nhận 60/120/240; bỏ trống = 120. */
  timeLimitSec?: number | null;
  /**
   * F2b — **TỔNG số câu của buổi**, 1..20 (KHÔNG phải số câu gốc). Bỏ trống = mặc định BE.
   *
   * ⚠ Đây là chỗ dễ hiểu nhầm nhất của cả luồng: với phỏng vấn thích ứng (INT-17b), ngân sách này
   * bị chia cho chiều sâu — gõ `5` với trần đào sâu 3 chỉ còn `ceil(5/4)` = **2 câu gốc**. Đừng tự
   * suy số câu gốc ở FE: hỏi `GET /practice/session-options` (SC3), server tính bằng ĐÚNG luật tạo
   * session nên hai bên không thể lệch.
   */
  questionCount?: number | null;
  /**
   * Ngôn ngữ của BÀI PHỎNG VẤN (`'vi' | 'en'`) — câu hỏi, nhận xét, câu trả lời mẫu đều theo đây.
   *
   * ⚠ KHÔNG phải ngôn ngữ giao diện: người Việt luyện phỏng vấn tiếng Anh mà vẫn dùng UI tiếng Việt
   * là ca bình thường. Đừng gộp field này với locale i18n sau này.
   *
   * Bỏ trống = `'vi'`. Gửi `'en'` khi BE chưa bật cờ `Interview:Bilingual:Enabled` → **400**, và
   * `'en'` mà nhóm nghề chưa có rubric tiếng Anh cũng **400**.
   */
  language?: string | null;
}

/** SC3 — 1 preset số câu do SERVER tính (không phải hằng số FE). */
export interface PracticeSessionPreset {
  /** `'short' | 'medium' | 'long'` — BE có thể gộp/bỏ preset khi trần gói hẹp, đừng giả định đủ 3. */
  key: string;
  /** Tổng số câu của buổi (giá trị sẽ gửi vào `questionCount`). */
  questionCount: number;
  /** Số câu GỐC suy ra từ tổng — con số người dùng thực sự quan tâm. */
  seedCount: number;
  /**
   * `seedCount >= contentCriteriaCount`. Là điều kiện CẦN, không đủ: đủ khe không bảo đảm AI rải
   * mỗi câu gốc vào một tiêu chí khác nhau (SC1). Nhãn UI phải nói "đủ chỗ để phủ", đừng hứa "phủ".
   */
  coversAllCriteria: boolean;
}

/** SC3 — bảng tra tổng-câu → số-câu-gốc cho MỌI giá trị trong `[min..max]`. */
export interface PracticeSessionPreview {
  questionCount: number;
  seedCount: number;
}

/**
 * SC3 — `GET /interview/practice/session-options?jobCategory=&language=`.
 *
 * ⚠ `language` truyền vào PHẢI trùng ngôn ngữ sẽ dùng lúc tạo buổi: số tiêu chí nội dung
 * (`contentCriteriaCount`) đọc từ rubric theo ngôn ngữ, lệch ngôn ngữ là preview dựng trên bộ
 * rubric khác bộ rubric của buổi thật.
 */
export interface PracticeSessionOptions {
  /** Tắt → không có khái niệm "câu gốc", `seedCount` luôn bằng `questionCount`. */
  adaptiveEnabled: boolean;
  maxDeepPerQuestion: number;
  /** Số tiêu chí NỘI DUNG của rubric — sàn để một buổi có cơ hội phủ hết (INT-18). */
  contentCriteriaCount: number;
  questionCountMin: number;
  /** Trần hiệu lực = min(trần hệ thống 20, trần theo gói) → có thể NHỎ HƠN 20. */
  questionCountMax: number;
  defaultQuestionCount: number;
  presets: PracticeSessionPreset[];
  preview: PracticeSessionPreview[];
}

export interface AnswerScore {
  criterionId: string;
  /** BE trả kèm từ 2026-07-18; buổi chấm TRƯỚC đó không có → lùi về tra `result.criteriaScores`. */
  criterionName?: string | null;
  score: number;
  maxScore?: number | null;
  reasoning?: string | null;
  rubricVersion: number;
  levelMatched?: number | null;
}

/**
 * F11 (FR06) — chỉ số CÁCH NÓI đo từ mốc thời gian Whisper (AIService `app/fluency.py`).
 *
 * ⚠ **Chỉ khai 6 field, và đó là cố ý.** DTO phía BE (`DeliveryMetricsDto`) có 9 field, nhưng DB
 * chỉ lưu 6 cột. Đường đọc của màn kết quả (`GET /sessions/{id}` → `DeliveryMetricsMapper.Read()`)
 * dựng lại DTO từ 6 cột đó và **không gán** `audioSec` / `speechSec` / `wordCount` /
 * `fillerPer100Words` ⇒ về client chúng **luôn luôn là 0**. Chúng chỉ có giá trị thật ở đường
 * prompt chấm (đo xong dùng ngay). Hiện chúng lên màn hình là bày một con số bịa với vẻ chính
 * xác — đừng "bổ sung cho đủ 9 field".
 *
 * ⚠ Cả cụm `= null` nghĩa là **CHƯA ĐO ĐƯỢC** (answer có trước F11 · audio rỗng · đường degrade),
 * KHÁC HẲN "đo ra 0". BE gộp null của TỪNG field về 0 (`?? 0`) và chỉ trả null khi cả 5 số cùng
 * null ⇒ FE chỉ phân biệt được khuyết ở **mức cả cụm**.
 */
export interface DeliveryMetrics {
  /**
   * ÂM TIẾT/phút — tiếng Việt đơn âm tiết nên đây là nhịp nói, KHÔNG so trực tiếp được với
   * "words per minute" của tiếng Anh. Tên field giữ nguyên `...Wpm` theo hợp đồng BE.
   */
  speechRateWpm: number;
  longestPauseSec: number;
  /** Số lần dừng vượt ngưỡng 0.7s (`PAUSE_THRESHOLD_SEC` của AIService). */
  pauseCount: number;
  /** 0–1. 0 = nói liên tục. */
  silenceRatio: number;
  /**
   * ⚠ Mức **TỐI THIỂU**, không phải số thật: Whisper học trên transcript đã làm sạch nên thường
   * nuốt bớt từ đệm. `0` KHÔNG phải lời khen — nó chỉ nghĩa là bộ nhận dạng không ghi lại từ
   * đệm nào.
   */
  fillerCount: number;
  /** Từ đệm nào × mấy lần. Rỗng là bình thường (xem cảnh báo ở `fillerCount`). */
  fillerBreakdown: Record<string, number>;
}

export interface AnswerResponse {
  id: string;
  status: AnswerStatus;
  durationSec: number;
  transcript?: string | null;
  needsReview: boolean;
  scores: AnswerScore[];
  /**
   * F13 (FR07) — câu trả lời mẫu mức tối đa cho ĐÚNG câu hỏi này, AI sinh cùng lượt chấm.
   * Optional: buổi chấm TRƯỚC F13 (và ca AI không trả) không có → chỉ không hiện mục gợi ý.
   */
  sampleAnswer?: string | null;
  /** F11 (FR06) — null = chưa đo được, KHÁC "đo ra 0". Xem `DeliveryMetrics`. */
  deliveryMetrics?: DeliveryMetrics | null;
  /**
   * Đường nghe lại bản ghi âm của chính mình — BE dựng sẵn path GATEWAY đầy đủ
   * (`/api/v1/interview/practice/sessions/{sid}/answers/{aid}/audio`); `null` = không còn file.
   *
   * ⚠ ĐỪNG gán thẳng vào `<audio src>`: endpoint đòi JWT mà thẻ `<audio>` không đính header
   * Authorization ⇒ 401 và trình phát chỉ hiện "không phát được" (đúng bẫy đã ghi ở
   * `PracticeApi.speech`). Phải tải blob qua HttpClient rồi tạo object URL.
   */
  audioUrl?: string | null;
}

/**
 * Evidence-Driven Interviewer — trạng thái thu thập dẫn chứng theo từng tiêu chí của cả BUỔI.
 *
 * ⚠ Nằm ở **cấp session** (`PracticeSession.criterionEvidence`), KHÔNG phải trong từng answer —
 * đây là trạng thái cộng dồn qua các lượt, không phải điểm của một câu.
 */
export interface CriterionEvidence {
  criterionId: string;
  criterionName: string;
  /** `UNKNOWN` (chưa hỏi tới) · `PARTIAL` · `SATISFIED` · `FAILED` — CHECK phía DB. */
  state: string;
  /** Dẫn chứng AI ghi nhận được từ câu trả lời. */
  evidenceFound: string[];
  /** Thứ còn thiếu để kết luận tiêu chí này. */
  missingEvidence: string[];
  /** Đã đào sâu bao nhiêu lượt cho tiêu chí này. */
  deepCount: number;
  updatedAt: string;
}

/**
 * Nhãn trạng thái dẫn chứng. Khai ở đây chứ không ở `enums.ts` vì đây là hợp đồng riêng của
 * Interview và `state` là chuỗi tự do phía BE (chỉ ràng bằng CHECK) — tra không trúng thì hiện
 * nguyên giá trị thô còn hơn hiện rỗng.
 */
export const CRITERION_EVIDENCE_STATE_LABEL: Record<string, string> = {
  UNKNOWN: 'Chưa hỏi tới',
  PARTIAL: 'Có một phần',
  SATISFIED: 'Đã đủ dẫn chứng',
  FAILED: 'Chưa đạt',
};

/**
 * RAG grounding (Contract 2/CITATION) — 1 nguồn uy tín mà câu hỏi được sinh dựa trên.
 * `chunkId` map ở InterviewService sang `{sourceUrl, sourceTitle}` (payload Qdrant).
 *
 * ⚠ Nhãn luôn là "DỰA TRÊN nguồn" (model tự khai), KHÔNG phải "được nguồn chứng minh" — mức mạnh đó
 * là con số faithfulness đo ở Phase 2, không hứa per-request. `sourceUrl` có thể chưa kiểm chứng.
 */
export interface QuestionCitation {
  chunkId: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface QuestionResponse {
  id: string;
  orderNo: number;
  content: string;
  timeLimitSec: number;
  answer?: AnswerResponse | null;
  /** Phỏng vấn THÍCH ỨNG (INT-17): Seed | FollowUp | Clarify | NewQuestion. Optional (client cũ). */
  kind?: QuestionKind;
  /**
   * RAG grounding (Contract 2). Ba trạng thái, PHÂN BIỆT bằng chính field này:
   *  - `undefined`/`null` = BE CHƯA gắn grounding cho câu này → FE không hiện nhãn gì (degrade an toàn).
   *  - `[]` (mảng rỗng) = **ungrounded**: đã thử tìm nguồn nhưng không có → nhãn NỔI BẬT "chưa có nguồn".
   *  - mảng có phần tử = **grounded**: hiện badge "📎 Nguồn: …" bấm được.
   * (Shape FE-facing này do W2/InterviewService map từ `citedChunkIds` — xem BÁO CÁO cuối worker.)
   */
  citations?: QuestionCitation[] | null;
}

export interface CriterionScore {
  criterionId: string;
  name: string;
  averageScore: number;
  maxScore: number;
  percentage: number;
  weight: number;
}

export interface CvVsAnswerGap {
  criterionId: string;
  criterionName: string;
  percentage: number;
  maxScore: number;
  cvEvidence: string[];
}
export interface CvVsAnswerReport {
  cvStrengths: string[];
  gaps: CvVsAnswerGap[];
}

/** Chỉ có khi status=Scored & là session B2C. */
export interface SessionResult {
  overallScore: number;
  answeredCount: number;
  totalQuestions: number;
  criteriaScores: CriterionScore[];
  needsImprovement: string[];
  overallComment?: string | null;
  cvVsAnswer?: CvVsAnswerReport | null;
  /** F14 — mốc đối chiếu (lớp 2 của radar); null khi BE tắt hoặc không dựng được. */
  benchmark?: SessionBenchmark | null;
}

/** F14 — mốc của 1 tiêu chí, thang % để vẽ chung trục với `CriterionScore.percentage`. */
export interface CriterionBenchmark {
  criterionId: string;
  name: string;
  targetPercentage: number;
}

/**
 * F14 (FR08) — mốc đối chiếu.
 *
 * ⚠ `label` là phần quan trọng nhất, KHÔNG phải `criteria`. Hệ thống không có dữ liệu chuẩn
 * ngành; mốc chỉ đến từ trung bình người dùng khác trên chính hệ thống (`PeerAverage`) hoặc
 * ngưỡng đạt nội bộ (`PassThreshold`). Hiển thị `label` đúng nguyên văn BE trả về — đừng đặt
 * lại tên cho nó.
 */
export interface SessionBenchmark {
  source: 'PeerAverage' | 'PassThreshold';
  label: string;
  sampleSize: number;
  criteria: CriterionBenchmark[];
}

export interface PracticeSession {
  id: string;
  status: SessionStatus;
  jobCategory: JobCategory;
  /** Ngôn ngữ BÀI PHỎNG VẤN (`'vi' | 'en'`) — xem `CreatePracticeSessionRequest.language`. */
  language?: string | null;
  /** Mức ứng viên tự khai lúc tạo buổi; BE mặc định `'Junior'` cho client cũ. */
  seniority?: string | null;
  cvId?: string | null;
  jdId?: string | null;
  createdAt: string;
  completedAt?: string | null;
  questions: QuestionResponse[];
  result?: SessionResult | null;
  /** `null` = buổi cũ / B2B chưa bật theo dõi dẫn chứng (KHÁC "đã theo dõi mà rỗng"). */
  criterionEvidence?: CriterionEvidence[] | null;
}

export interface PracticeSessionSummary {
  id: string;
  status: SessionStatus;
  jobCategory: JobCategory;
  createdAt: string;
  completedAt?: string | null;
  overallScore?: number | null;
}

/** Phỏng vấn THÍCH ỨNG (INT-17): câu hỏi kế backend sinh động, trả kèm response upload. */
export interface NextQuestion {
  id: string;
  orderNo: number;
  content: string;
  timeLimitSec: number;
  kind: QuestionKind;
}

/** POST .../answers (multipart). Các field adaptive optional → luồng tĩnh cũ bỏ qua vẫn chạy. */
export interface UploadAnswerResult {
  answerId: string;
  questionId: string;
  status: AnswerStatus;
  /** INT-17 — transcript đồng bộ (có thể hiện ngay). */
  transcript?: string | null;
  /** INT-17 — follow_up | clarify | new_question | end. */
  nextAction?: AdaptiveAction | null;
  /** INT-17 — câu hỏi kế (null khi end / adaptive tắt / chưa tới frontier). */
  nextQuestion?: NextQuestion | null;
  /** INT-17 — AI kết thúc / hết ngân sách → mời nộp bài. */
  interviewComplete?: boolean;
}
