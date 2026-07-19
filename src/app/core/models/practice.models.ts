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
  /** F2b — số câu hỏi, 1..20. Bỏ trống = mặc định của AIService (5). */
  questionCount?: number | null;
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
}

export interface QuestionResponse {
  id: string;
  orderNo: number;
  content: string;
  timeLimitSec: number;
  answer?: AnswerResponse | null;
  /** Phỏng vấn THÍCH ỨNG (INT-17): Seed | FollowUp | Clarify | NewQuestion. Optional (client cũ). */
  kind?: QuestionKind;
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
  cvId?: string | null;
  jdId?: string | null;
  createdAt: string;
  completedAt?: string | null;
  questions: QuestionResponse[];
  result?: SessionResult | null;
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
