import { JobCategory } from './enums';

/**
 * RAG grounding — kho tri thức nguồn uy tín (Contract 3). Admin quản qua
 * `{apiBase}/interview/admin/knowledge` (`[Authorize(Roles="Admin")]`).
 *
 * ⚠ KHÔNG bao giờ mang API key / secret của Context7 hay bất kỳ credential nào — DTO chỉ chứa
 * metadata nguồn. Key nằm ở server (env `Context7:ApiKey`), FE không thấy.
 */

/**
 * Loại nguồn. Add-form của admin chỉ cho `Manual`/`Url`; `Context7` sinh ra qua tab ingest riêng
 * (server tự đặt `source_type=Context7`), nên vẫn phải khai để render đúng nhãn ở bảng danh sách.
 */
export type KnowledgeSourceType = 'Context7' | 'Url' | 'Manual';

export const KNOWLEDGE_SOURCE_TYPE_LABEL: Record<KnowledgeSourceType, string> = {
  Context7: 'Context7',
  Url: 'Đường dẫn',
  Manual: 'Dán tay',
};

export type KnowledgeSourceStatus = 'Active' | 'Archived';

/** Contract 3 — DTO nguồn tri thức trả về ở list/add. */
export interface KnowledgeSource {
  id: string;
  title: string;
  /** enum nullable — nguồn có thể không gắn nghề cụ thể. */
  jobCategory?: JobCategory | null;
  sourceType: KnowledgeSourceType;
  /** libraryId (Context7) / URL / null (Manual). */
  sourceRef?: string | null;
  /** Điểm uy tín nguồn (chuỗi tuỳ nguồn) — hiển thị nguyên văn, không diễn giải lại. */
  reputation?: string | null;
  status: KnowledgeSourceStatus;
  chunkCount: number;
  createdAt: string;
}

/** 1 trang danh sách nguồn + con trỏ trang kế (header `X-Next-Cursor`; null = hết). Mẫu keyset DB8. */
export interface KnowledgeSourcePage {
  items: KnowledgeSource[];
  nextCursor: string | null;
}

/**
 * POST `/` — ingest nguồn dán tay hoặc URL (Contract 3).
 * `content` chỉ dùng khi `sourceType='Manual'`; `url` chỉ dùng khi `sourceType='Url'`.
 */
export interface AddKnowledgeSourceRequest {
  title: string;
  jobCategory: JobCategory;
  sourceType: 'Manual' | 'Url';
  content?: string | null;
  url?: string | null;
}

/**
 * 1 ứng viên thư viện từ Context7 `/context7/search` (Contract 3).
 *
 * ⚠ Kiểu `reputation`/`snippets` KHÔNG được khoá trong contract (chỉ liệt kê tên field) → bind lỏng
 * để không vỡ khi server trả số hay chuỗi; render nguyên trạng. Xem BÁO CÁO cuối worker.
 */
export interface Context7Candidate {
  id: string;
  title: string;
  reputation?: string | number | null;
  snippets?: string | number | null;
}

/** POST `/context7/ingest` — nạp 1 thư viện Context7 theo các chủ đề (Contract 3). */
export interface Context7IngestRequest {
  libraryId: string;
  topics: string[];
  jobCategory: JobCategory;
}
