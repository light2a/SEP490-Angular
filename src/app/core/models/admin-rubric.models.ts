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
  /**
   * 3 câu hỏi gợi ý để chấm thử, đúng nghề + ngôn ngữ đang xem. **Backend là nguồn DUY NHẤT** —
   * giữ một bản sao trong client thì sửa câu ở backend mà màn vẫn hiện câu cũ, và không gì báo.
   *
   * Rỗng / vắng (deploy backend cũ hơn) là trạng thái hợp lệ: admin vẫn tự gõ câu được.
   */
  sampleQuestions?: SampleQuestion[];
}

/**
 * 1 câu hỏi mẫu. `id` là thứ gửi lên (`sampleQuestionId`), `text` chỉ để hiển thị.
 *
 * CỐ Ý không rút từ `practice_questions` thật: câu B2C sinh từ CV/JD của người dùng nên chứa tên
 * công ty / dự án của họ — hiện cho admin là rò rỉ dữ liệu.
 */
export interface SampleQuestion {
  id: string;
  text: string;
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
 * POST preview — chọn 1 câu mẫu (`sampleQuestionId`, lấy từ `SystemRubricResponse.sampleQuestions`)
 * **HOẶC** tự gõ (`question`).
 *
 * ⚠ **Đúng một trong hai**, không bao giờ cả hai: gửi kèm nhau là để backend tự chọn hộ, mà lựa
 * chọn đó quyết định bài mẫu được viết cho câu nào. Id lạ → **400 kèm danh sách id hợp lệ**, không
 * im lặng rơi về câu mặc định.
 */
export interface RunAdminRubricPreviewRequest {
  question?: string;
  sampleQuestionId?: string;
}
