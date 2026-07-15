import { JobCategory } from './enums';

export interface CvAnalysisRequest {
  cvId: string;
  jdId?: string | null;
  jobCategory: JobCategory; // bắt buộc — thiếu → 400
}

export interface JdMatch {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

export interface CvAnalysisResponse {
  id: string;
  cvId: string;
  jdId?: string | null;
  jobCategory: JobCategory;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  jdMatch?: JdMatch | null; // chỉ khi có jdId
  createdAt: string;
}
