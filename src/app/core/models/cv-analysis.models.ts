import { JobCategory } from './enums';

export interface CvAnalysisRequest {
  cvId: string;
  jdId?: string | null;
  jobCategory: JobCategory; // bắt buộc — thiếu → 400
  /**
   * JD dán thẳng dạng text — khỏi phải upload PDF trước (quy ước C11 của B2B).
   * Gửi cả jdText lẫn jdId → BE dùng TEXT, bỏ file (và không lưu jdId).
   */
  jdText?: string | null;
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
  // Chỉ khi request có JD — jdId HOẶC jdText. ⚠ JD nhập tay → jdId=null nhưng jdMatch VẪN có
  // (BE gate theo "có nội dung JD") → đừng suy ra "không có jdMatch" từ jdId=null.
  jdMatch?: JdMatch | null;
  createdAt: string;
}
