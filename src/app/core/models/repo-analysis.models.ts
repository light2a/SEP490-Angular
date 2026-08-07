import { JdMatch } from './cv-analysis.models';
import { JobCategory } from './enums';

/**
 * BC18 — phân tích repository GitHub public.
 *
 * Gateway: `/api/v1/interview/practice/repo-analysis` (`[Authorize(Roles="Candidate")]`).
 * ⚠ Mỗi lần phân tích **trừ 1 credit** ví User (`Billing:RepoAnalysisCredits`, mặc định 1) —
 * cùng pool với suất dùng thử F7. Vì thế UI phải nói rõ chi phí TRƯỚC khi người dùng bấm.
 */

/**
 * POST `/` — body.
 *
 * ⚠ KHÔNG khai `jdId`: BE có nhận field đó trong DTO nhưng **chưa dùng đến** (`RepoAnalysisService`
 * chỉ đọc `JdText`) ⇒ gửi lên là nói dối người dùng rằng file JD đã được tính vào độ khớp.
 * Muốn chấm khớp JD thì dán text vào `jdText`.
 */
export interface RepoAnalysisRequest {
  /** Bắt buộc URL **HTTPS github.com** dạng `https://github.com/{owner}/{repo}` (BE reject → 400). */
  repoUrl: string;
  /** Bắt buộc — thiếu → 400 (`[Required] JobCategory?` phía BE). Interview serialize enum dạng CHUỖI. */
  jobCategory: JobCategory;
  /** JD dán thẳng dạng text (tuỳ chọn). Có nội dung → response mới có `jdMatch`. ≤ JD_TEXT_MAX_CHARS. */
  jdText?: string | null;
}

/**
 * Response của cả POST (201), GET `/{id}` và từng phần tử của GET `/` (list).
 *
 * ⚠ `jobCategory` phía BE là `string` trong response nhưng `enum` trong request — trên dây thì cả
 * hai đều là chuỗi `'BA'|'BE'|'FE'` nên FE dùng chung `JobCategory` (đúng tiền lệ `CvAnalysisResponse`).
 */
export interface RepoAnalysisResponse {
  id: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  jobCategory: JobCategory;
  primaryLanguage?: string | null;
  stars: number;
  /** Bytes theo từng ngôn ngữ (`IReadOnlyDictionary<string,long>`), không phải phần trăm. */
  languages: Record<string, number>;
  summary: string;
  techStack: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  /** Gợi ý cách kể về repo này khi đi phỏng vấn — giá trị riêng của BC18 so với phân tích CV. */
  interviewTalkingPoints: string[];
  /** Chỉ có khi request gửi `jdText` không rỗng — cùng shape `JdMatchResponse` của phân tích CV. */
  jdMatch?: JdMatch | null;
  /** Commit được phân tích — mốc để biết kết quả này ứng với trạng thái nào của repo. */
  commitSha?: string | null;
  createdAt: string;
}

/** 1 trang danh sách + con trỏ trang kế (header `X-Next-Cursor`; null = hết). Mẫu keyset DB8. */
export interface RepoAnalysisPage {
  items: RepoAnalysisResponse[];
  nextCursor: string | null;
}
