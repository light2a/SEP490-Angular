import { CriterionLevelItem, CampaignLanguage } from './campaign.models';
import { JobCategory } from './enums';

/**
 * BỘ CHUẨN HỆ THỐNG (rubric B2C) do Admin quản — `api/admin/rubrics`.
 *
 * Đây là bộ **duy nhất** áp cho toàn bộ người luyện tập (7 tiêu chí × 3 nghề × 2 ngôn ngữ) và cũng
 * là bộ mặc định mà Employer chép về chiến dịch. Trước đợt này nó nằm chết trong migration: đổi một
 * chữ mô tả = một migration + một lần deploy.
 *
 * ⚠ `CriterionLevelItem` dùng chung với B2B có chủ đích — cùng một ràng buộc (2–10 mốc, phải có mốc
 * 0 và mốc `maxScore`, mô tả 20–500 ký tự) thì phải cùng một kiểu, nếu không guard hai đầu lệch
 * nhau mà không có gì báo.
 */

/** Ngôn ngữ của bộ chuẩn — dùng lại `CampaignLanguage` vì backend nhận đúng hai giá trị đó. */
export type RubricLanguage = CampaignLanguage;

/** 2 ngôn ngữ + nhãn cho tab của màn admin. */
export const RUBRIC_LANGUAGES: ReadonlyArray<{ value: RubricLanguage; label: string }> = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh' },
];

/**
 * Phạm vi chấm của tiêu chí (INT-18/D29). Chỉ ĐỌC ở màn admin: đổi được nó là phá bất biến
 * 4 `Always` / 3 `WhenTargeted` mà backend đang khoá bằng test.
 * - `Always` = tiêu chí CÁCH NÓI, chấm ở mọi câu.
 * - `WhenTargeted` = tiêu chí NỘI DUNG, chỉ chấm khi câu hỏi nhắm tới.
 */
export type CriterionScoringScope = 'Always' | 'WhenTargeted';

/**
 * 1 tiêu chí của bộ chuẩn.
 *
 * ⚠ Chỉ `description` và `levels` sửa được. `name` KHÔNG sửa được vì lộ trình ôn tập và biểu đồ
 * tiến bộ gom nhóm **theo TÊN** ⇒ đổi tên cắt đôi chuỗi thời gian của mọi người dùng, im lặng.
 * `weight`/`maxScore`/`scoringScope` cũng chỉ đọc — xem `UpdateSystemRubricRequest`.
 */
export interface SystemRubricCriterion {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
  scoringScope: CriterionScoringScope;
  /** Mốc điểm, sắp tăng dần theo `score`. Rỗng = **chưa khai mốc** (hợp lệ, bộ chấm về dải mặc định). */
  levels: CriterionLevelItem[];
}

/** GET /admin/rubrics/{jobCategory}?language= — bộ chuẩn đang active của đúng một ô (nghề, ngôn ngữ). */
export interface SystemRubricResponse {
  jobCategory: JobCategory;
  language: RubricLanguage;
  /**
   * Phiên bản của bộ. Buổi luyện đã bắt đầu giữ nguyên bản cũ; sửa xong Lưu chỉ áp cho buổi
   * bắt đầu SAU đó. Là ĐỊNH DANH chứ không phải bộ đếm — được phép có lỗ số.
   */
  version: number;
  criteria: SystemRubricCriterion[];
}

/**
 * GET /admin/rubrics?language= — ma trận trạng thái.
 *
 * `criteriaWithLevels / total` là thứ duy nhất trên màn nói rằng còn tổ hợp nào chưa khai. Rủi ro
 * lớn nhất của màn này không phải "rối" mà là **bỏ sót**: khai xong VI/BE rồi quên 5 ô còn lại.
 */
export interface SystemRubricMatrixCell {
  jobCategory: JobCategory;
  language: RubricLanguage;
  version: number;
  criteriaWithLevels: number;
  total: number;
}

/**
 * PUT /admin/rubrics/{jobCategory}?language= — CHỈ 3 trường.
 *
 * DTO cố ý **không khai** `name`/`weight`/`maxScore`/`scoringScope`: gán nhầm thành lỗi biên dịch
 * thay vì một request bị backend lặng lẽ bỏ qua.
 */
export interface UpdateSystemRubricCriterion {
  id: string;
  description?: string | null;
  levels: CriterionLevelItem[];
}

export interface UpdateSystemRubricRequest {
  criteria: UpdateSystemRubricCriterion[];
}

/**
 * Kết quả Lưu. `changed:false` = nội dung không khác gì bản đang chạy ⇒ backend **KHÔNG** bump
 * version. Thiếu vế này thì nhãn phiên bản mất nghĩa (bấm Lưu 5 lần ra v6 mà thước đo y hệt) và
 * hạn mức chấm thử bị cắt vụn.
 */
export interface UpdateSystemRubricResponse {
  changed: boolean;
  version: number;
}

// ── Chấm thử của Admin ──────────────────────────────────────────────────────
/**
 * 1 lượt chấm thử bộ chuẩn — `admin/rubrics/{jobCategory}/preview?language=`.
 *
 * Cùng hình dạng với lượt chấm thử của Employer (đợt 1) trừ hai chỗ: có `jobCategory`+`language`
 * thay cho `campaignId`, và **không có `billed`** — admin không có ví, hạn mức là trần cứng miễn
 * phí theo (nghề, ngôn ngữ, phiên bản). Hết trần → 429.
 */
export interface AdminRubricPreviewRun {
  id: string;
  status: 'Running' | 'Succeeded' | 'Failed';
  jobCategory: JobCategory;
  language: RubricLanguage;
  questionText: string;
  rubricFingerprint: string;
  rubricVersion: number;
  promptVersion?: number | null;
  /** Bài mẫu là VĂN BẢN nên không có số đo cách nói (F11) — luôn `false` ở v1. */
  deliveryMetricsAvailable: boolean;
  lengthParityWarning: boolean;
  /** Lượt miễn phí còn lại của đúng (nghề, ngôn ngữ, phiên bản) này. */
  freeRunsRemaining: number;
  rubric: AdminRubricPreviewCriterionSnapshot[];
  samples: AdminRubricPreviewSample[];
  errorReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AdminRubricPreviewCriterionSnapshot {
  criterionId: string;
  name: string;
  weight: number;
  maxScore: number;
  levels: CriterionLevelItem[];
}

export interface AdminRubricPreviewCriterionScore {
  criterionId: string;
  criterionName: string;
  maxScore: number;
  /** Mức do CODE chọn trước khi sinh bài — biết trước nên so được, không phải AI tự khai. */
  expectedLevel: number;
  actualScore: number;
  levelMatched?: number | null;
  reasoning?: string | null;
}

export interface AdminRubricPreviewSample {
  band: 'Weak' | 'Good' | 'Excellent' | 'Custom';
  answerText: string;
  wordCount: number;
  expectedWeightedPct: number;
  actualWeightedPct: number;
  scores: AdminRubricPreviewCriterionScore[];
}

/**
 * POST preview — chọn 1 trong 3 câu mẫu cố định (`sampleQuestionId`) HOẶC tự gõ (`question`).
 *
 * ⚠ Hợp đồng KHÔNG có endpoint nào liệt kê câu mẫu, nên giao diện không biết `sampleQuestionId`
 * nào là hợp lệ — bịa id ra là chắc chắn 400. Vì thế các nút chọn nhanh ở màn admin chỉ **điền
 * sẵn chữ** rồi gửi qua `question` (xem `SAMPLE_QUESTIONS`). Trường `sampleQuestionId` giữ trong
 * kiểu để khi backend bổ sung đường liệt kê thì client dùng được ngay, không phải đổi hợp đồng.
 */
export interface RunAdminRubricPreviewRequest {
  question?: string;
  sampleQuestionId?: string;
}

/**
 * Câu hỏi gợi ý cho chấm thử, theo (nghề, ngôn ngữ).
 *
 * CỐ Ý không rút từ `practice_questions` thật: câu B2C sinh từ CV/JD của người dùng nên chứa tên
 * công ty / dự án của họ — hiện cho admin là rò rỉ dữ liệu.
 */
export const SAMPLE_QUESTIONS: Record<JobCategory, Record<RubricLanguage, readonly string[]>> = {
  BA: {
    vi: [
      'Bạn làm thế nào để lấy yêu cầu từ một bên liên quan không rõ mình muốn gì?',
      'Kể một lần bạn phát hiện hai yêu cầu mâu thuẫn nhau. Bạn xử lý ra sao?',
      'Bạn mô tả một quy trình nghiệp vụ cho đội phát triển bằng cách nào?',
    ],
    en: [
      'How do you elicit requirements from a stakeholder who is unsure what they want?',
      'Tell me about a time you found two conflicting requirements. How did you resolve it?',
      'How do you communicate a business process to a development team?',
    ],
  },
  BE: {
    vi: [
      'Bạn thiết kế API cho chức năng đặt hàng như thế nào? Nêu các đánh đổi.',
      'Khi một truy vấn chậm dần theo thời gian, bạn tìm nguyên nhân theo thứ tự nào?',
      'Giải thích cách bạn xử lý khi hai request cùng sửa một bản ghi.',
    ],
    en: [
      'How would you design an API for placing an order? Describe the trade-offs.',
      'A query gets slower over time. In what order do you investigate?',
      'Explain how you handle two requests updating the same record.',
    ],
  },
  FE: {
    vi: [
      'Bạn xử lý trạng thái tải và lỗi của một màn danh sách như thế nào?',
      'Trang của bạn bị chậm khi render danh sách dài. Bạn làm gì trước tiên?',
      'Bạn bảo đảm một thành phần dùng được với bàn phím và trình đọc màn hình ra sao?',
    ],
    en: [
      'How do you handle loading and error states on a list screen?',
      'Your page slows down when rendering a long list. What do you do first?',
      'How do you make a component usable with a keyboard and a screen reader?',
    ],
  },
};
