/** Kết quả upload CV/JD: POST /interview/files/upload */
export interface UploadFileResponse {
  fileId: string;
  fileType: string; // 'cv' | 'jd'
  originalName: string;
  mimeType: string;
  fileSize: number;
  parsedStatus: string; // 'completed' | 'failed'
  createdAt: string;
}

/**
 * Metadata file: `GET /interview/files/{id}` · `GET /interview/files/files`.
 *
 * ⚠ HAI endpoint này trả SHAPE KHÁC NHAU. Danh sách đã được làm gọn có chủ đích (trước đó nó trả
 * `parsed_text` = toàn văn MỌI CV/JD của người dùng trong mỗi lần mở danh sách — vừa phình payload
 * vừa là hở dữ liệu), nên `parsedText`/`storagePath`/`storageBucket` chỉ có ở đường chi tiết.
 * Vì thế cả ba đều OPTIONAL: khai bắt buộc là nói dối về những gì danh sách thật sự trả về.
 * Toàn văn nên lấy qua `GET /files/{id}/parsed-text` (endpoint riêng) thay vì trông vào field này.
 */
export interface FileRecord {
  id: string;
  userId: string;
  fileType: string;
  originalName: string;
  storagePath?: string | null;
  storageBucket?: string | null;
  mimeType: string;
  fileSize: number;
  parsedText?: string | null;
  parseStatus: string;
  createdAt: string;
  updatedAt: string;
}

export type UploadFileType = 'cv' | 'jd';
