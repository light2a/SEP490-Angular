/**
 * Vận hành nền tảng — analytics FR18 (4 service) + quản lý prompt F21 (InterviewService).
 *
 * Tách khỏi `payment.models.ts` / `auth.models.ts` có chủ đích: 4 endpoint analytics nằm ở 4
 * service khác nhau nhưng dùng CHUNG một hình dạng kỳ (`[from, to)` nửa mở + `granularity` +
 * `buckets`) do `Isas.Shared.Analytics.AnalyticsPeriod` quy định. Gom một chỗ thì sự đồng dạng
 * đó nhìn thấy được; rải theo service thì lần sau ai đó sẽ khai lệch một field.
 */

// ── Analytics FR18 ────────────────────────────────────────────────────────────

/** `day` | `month` — bộ 3 analytics nghiệp vụ (Auth · Interview · Campaign). */
export type AnalyticsGranularity = 'day' | 'month';

/** `hour` | `day` — RIÊNG traffic gateway; gửi `month` vào đây backend trả 400. */
export type TrafficGranularity = 'hour' | 'day';

/**
 * Kỳ mà backend đã CHỐT, echo lại trong mọi response analytics.
 *
 * Luôn là mốc UTC. Bắt buộc render kèm quy chiếu `'UTC'` tường minh (DatePipe tham số thứ 3) —
 * để mặc định là giờ máy người xem, tức hiện một con số KHÁC con số backend đã dùng để gom
 * bucket. Đó đúng là kiểu "hiển thị cho có" khiến người đọc yên tâm nhầm.
 */
export interface AnalyticsPeriodEcho {
  /** Mốc đầu kỳ (UTC, tính vào kỳ). */
  from: string;
  /** Mốc cuối kỳ (UTC, KHÔNG tính vào kỳ — kỳ nửa mở). */
  to: string;
  granularity: string;
}

// ── Auth: đăng nhập / người dùng hoạt động ────────────────────────────────────

export interface RoleCount {
  role: string;
  count: number;
}

export interface AuthAnalyticsTotals {
  totalUsers: number;
  newUsers: number;
  bannedUsers: number;
  totalOrganizations: number;
  byRole: RoleCount[];
}

/**
 * `last7Days`/`last30Days` là cửa sổ TRƯỢT tính tới hiện tại, KHÔNG cắt theo `[from, to)` —
 * nên hai con số này không đổi khi admin đổi bộ lọc ngày. Đừng đặt chúng cạnh bảng theo kỳ mà
 * không nói rõ, người đọc sẽ tưởng chúng thuộc kỳ đang xem.
 */
export interface AuthActiveUsers {
  last7Days: number;
  last30Days: number;
}

export interface AuthAnalyticsBucket {
  periodStart: string;
  newUsers: number;
  logins: number;
  distinctUsers: number;
}

export interface AuthAnalyticsResponse extends AnalyticsPeriodEcho {
  totals: AuthAnalyticsTotals;
  activeUsers: AuthActiveUsers;
  buckets: AuthAnalyticsBucket[];
}

// ── Interview: buổi phỏng vấn / câu trả lời ───────────────────────────────────

export interface JobCategoryCount {
  jobCategory: string;
  count: number;
}

/** Ảnh chụp TỨC THỜI số buổi đang chạy — không thuộc kỳ `[from, to)`. */
export interface InterviewActiveSessions {
  b2c: number;
  b2b: number;
}

export interface InterviewAnalyticsTotals {
  answersUploaded: number;
  answersNeedsReview: number;
  byJobCategory: JobCategoryCount[];
}

export interface InterviewAnalyticsBucket {
  periodStart: string;
  created: number;
  scored: number;
  failed: number;
  abandoned: number;
}

export interface InterviewAnalyticsResponse extends AnalyticsPeriodEcho {
  activeSessions: InterviewActiveSessions;
  totals: InterviewAnalyticsTotals;
  buckets: InterviewAnalyticsBucket[];
}

// ── Campaign: funnel B2B ──────────────────────────────────────────────────────

export interface CampaignStatusCount {
  status: string;
  count: number;
}

export interface FlagSignalCount {
  signalType: string;
  count: number;
}

export interface CampaignAnalyticsTotals {
  byStatus: CampaignStatusCount[];
  invitationsSent: number;
  invitationsUnsent: number;
  flagsBySignal: FlagSignalCount[];
}

export interface CampaignAnalyticsBucket {
  periodStart: string;
  campaignsCreated: number;
  invitationsCreated: number;
  joins: number;
  interviewsStarted: number;
}

export interface CampaignAnalyticsResponse extends AnalyticsPeriodEcho {
  totals: CampaignAnalyticsTotals;
  buckets: CampaignAnalyticsBucket[];
}

// ── Payment: traffic gateway ──────────────────────────────────────────────────

/** `avgDurationMs`/`maxDurationMs` null khi kỳ không có request nào — KHÔNG phải 0ms. */
export interface TrafficSummary {
  requests: number;
  errors4xx: number;
  errors5xx: number;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
}

/**
 * `routeId` là **id route của YARP** (vd `payment-route`), KHÔNG phải raw path. Nghĩa là mọi
 * đường dẫn dưới cùng một route gộp chung một dòng — đừng gắn nhãn cột là "Endpoint".
 */
export interface TrafficByRoute {
  routeId: string;
  summary: TrafficSummary;
}

export interface TrafficBucket {
  periodStart: string;
  summary: TrafficSummary;
}

export interface TrafficReportResponse extends AnalyticsPeriodEcho {
  totals: TrafficSummary;
  byRoute: TrafficByRoute[];
  buckets: TrafficBucket[];
}

// ── F21: prompt registry ──────────────────────────────────────────────────────

/**
 * Một mảnh prompt sửa được.
 *
 * `body === null` ⇒ **chưa ai tuỳ biến**, AIService đang dùng bản mặc định trong `prompts.py`.
 * Bản mặc định CỐ Ý không được chép sang .NET (hai nguồn sự thật cho cùng câu chữ sẽ lệch nhau
 * ngay lần sửa đầu), nên FE **không có** cách hiện nội dung mặc định — phải nói thẳng điều đó
 * thay vì để ô soạn thảo rỗng trông như "prompt này đang trống".
 */
export interface PromptTemplateItem {
  key: string;
  /** 0 = chưa có version nào (đang dùng mặc định). Mỗi lần sửa +1. */
  version: number;
  body: string | null;
  /** Guid admin đã sửa. Không có endpoint tra tên → hiện nguyên Guid. */
  updatedBy: string | null;
  changeNote: string | null;
  createdAt: string | null;
}

export interface UpdatePromptTemplateRequest {
  body: string;
  changeNote?: string | null;
}

/**
 * PHẢI khớp `PromptTemplateService.MaxBodyChars` — BE mới là nơi enforce thật (vượt → 400).
 * Bộ đếm ở FE chỉ để admin THẤY giới hạn trước khi bấm lưu.
 *
 * Vì sao có trần: mảnh prompt đi THẲNG vào mỗi lượt gọi Gemini, nên một lần dán nhầm cả quyển
 * tài liệu vào đây làm mọi lượt chấm sau đó đắt hơn và chậm hơn — âm thầm.
 */
export const PROMPT_BODY_MAX_CHARS = 8_000;

/**
 * Delimiter khung dữ liệu — BE từ chối thân prompt chứa chúng (hàng rào chống tự dựng frame giả,
 * AI-4). Danh sách này chỉ để **gợi ý** cho admin; CỐ Ý không chặn ở FE: mirror một luật bảo mật
 * ở hai nơi thì bản FE sẽ lệch, và lúc đó nó chặn nhầm nội dung hợp lệ mà không ai gỡ được.
 * BE là cổng duy nhất.
 */
export const PROMPT_FORBIDDEN_FRAGMENTS: readonly string[] = [
  '---CÂU TRẢ LỜI',
  '---HẾT',
  '---CV',
  '---JD',
];

/**
 * Nhãn tiếng Việt cho khoá prompt. Khoá thật (`scoring.persona`, `category.BE.guidance`) là hợp
 * đồng với BE nên hiện nguyên bản bên cạnh nhãn — admin cần khoá thật khi đọc log/hỏi support.
 */
const PROMPT_KEY_LABELS: Record<string, string> = {
  'scoring.persona': 'Chấm điểm — vai giám khảo',
  'scoring.extra_guidance': 'Chấm điểm — hướng dẫn bổ sung',
  'questions.intro': 'Sinh câu hỏi — mở đầu',
  'questions.guidance': 'Sinh câu hỏi — hướng dẫn',
  'criteria.guidance': 'Gợi ý tiêu chí — hướng dẫn',
  'cv_analysis.guidance': 'Phân tích CV — hướng dẫn',
  'roadmap.guidance': 'Lộ trình ôn tập — hướng dẫn',
  'lesson_theory.guidance': 'Lý thuyết bài học — hướng dẫn',
  'summarize_session.guidance': 'Nhận xét buổi — hướng dẫn',
  'decide_next.guidance': 'Chọn câu hỏi kế — hướng dẫn',
};

const CATEGORY_FIELD_LABELS: Record<string, string> = {
  display_name: 'tên hiển thị',
  description: 'mô tả',
  guidance: 'hướng dẫn riêng',
};

/** Nhãn hiển thị cho một khoá; khoá lạ (BE thêm mới) → trả nguyên khoá, không vỡ. */
export function promptKeyLabel(key: string): string {
  const fixed = PROMPT_KEY_LABELS[key];
  if (fixed) return fixed;

  const parts = key.split('.');
  if (parts.length === 3 && parts[0] === 'category') {
    const field = CATEGORY_FIELD_LABELS[parts[2]] ?? parts[2];
    return `Nghề ${parts[1]} — ${field}`;
  }
  return key;
}

/** Nhóm để xếp bảng: prompt chấm điểm là nhóm nhạy cảm nhất, tách riêng. */
export function promptKeyGroup(key: string): string {
  if (key.startsWith('scoring.')) return 'Chấm điểm';
  if (key.startsWith('category.')) return 'Theo nghề';
  return 'Sinh nội dung';
}
