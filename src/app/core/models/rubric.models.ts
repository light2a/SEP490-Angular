import { JobCategory } from './enums';

export interface RubricCriterionItem {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
}

export interface RubricResponse {
  jobCategory: JobCategory;
  isCustom: boolean; // true = rubric riêng, false = seed mặc định
  criteria: RubricCriterionItem[];
}

export interface RubricCriterionInput {
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
}

export interface UpsertRubricRequest {
  criteria: RubricCriterionInput[]; // Σweight ≈ 1
}
