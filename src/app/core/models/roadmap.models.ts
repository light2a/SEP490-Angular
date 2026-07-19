import { JobCategory, LessonStatus, MilestoneStatus, RoadmapLevel, RoadmapStatus } from './enums';
import { CriterionScore } from './practice.models';

export interface CreateRoadmapRequest {
  jobCategory: JobCategory;
  level: RoadmapLevel;
  cvId?: string | null;
}

/**
 * F15 — 1 tài liệu học gợi ý cho bài học.
 *
 * `url` CÓ THỂ NULL VÌ CÓ CHỦ ĐÍCH, không phải dữ liệu thiếu: link do AI sinh chỉ được BE giữ
 * lại khi tên miền nằm trong allowlist nguồn chính chủ. Host lạ → BE bỏ url nhưng GIỮ tên tài
 * liệu. Vì vậy UI phải render được CẢ HAI dạng (có link / chỉ tên), và khi có link thì PHẢI nói
 * rõ là link do AI gợi ý, chưa được kiểm chứng — allowlist bảo đảm đúng tên miền, KHÔNG bảo đảm
 * đường dẫn tồn tại.
 */
export interface LessonResource {
  title: string;
  type: string;          // Doc | Course | Book | Video | Article
  publisher?: string | null;
  url?: string | null;
}

export interface LessonResponse {
  id: string;
  orderNo: number;
  title: string;
  theoryContent?: string | null;
  sessionId?: string | null;
  status: LessonStatus;
  resources: LessonResource[];   // F15 — luôn là mảng (BE trả [] khi chưa mở / AI không gợi ý được)
}

export interface MilestoneImprovement {
  criterionName: string;
  deltaPct: number;
}

export interface MilestoneResponse {
  id: string;
  orderNo: number;
  title: string;
  focusCriteria: string[];
  status: MilestoneStatus;
  improvement?: MilestoneImprovement[] | null;
  lessons: LessonResponse[];
}

export interface RoadmapResponse {
  id: string;
  jobCategory: JobCategory;
  level: RoadmapLevel;
  cvId?: string | null;
  status: RoadmapStatus;
  createdAt: string;
  completedAt?: string | null;
  milestones: MilestoneResponse[];
}

export interface LevelEvaluationItem {
  criterionName: string;
  percentage: number;
  levelThreshold: number;
  passed: boolean;
}

export interface RoadmapReport {
  radar: CriterionScore[];
  levelEvaluation: LevelEvaluationItem[];
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  overallComment?: string | null;
}
