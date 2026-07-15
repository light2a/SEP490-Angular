import { AnswerStatus, JobCategory, SessionStatus } from './enums';

export interface CreatePracticeSessionRequest {
  cvId?: string | null;
  jdId?: string | null;
  jobCategory: JobCategory;
}

export interface AnswerScore {
  criterionId: string;
  score: number;
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
}

export interface QuestionResponse {
  id: string;
  orderNo: number;
  content: string;
  timeLimitSec: number;
  answer?: AnswerResponse | null;
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

/** POST .../answers (multipart) */
export interface UploadAnswerResult {
  answerId: string;
  questionId: string;
  status: AnswerStatus;
}
