import { JobCategory, LessonStatus, MilestoneStatus, RoadmapLevel, RoadmapStatus } from './enums';
import { CriterionScore } from './practice.models';

export interface CreateRoadmapRequest {
  jobCategory: JobCategory;
  level: RoadmapLevel;
  cvId?: string | null;
}

export interface LessonResponse {
  id: string;
  orderNo: number;
  title: string;
  theoryContent?: string | null;
  sessionId?: string | null;
  status: LessonStatus;
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
