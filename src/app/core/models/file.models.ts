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

/** Metadata file: GET /interview/files/{id} , GET /interview/files/files */
export interface FileRecord {
  id: string;
  userId: string;
  fileType: string;
  originalName: string;
  storagePath: string;
  storageBucket: string;
  mimeType: string;
  fileSize: number;
  parsedText?: string | null;
  parseStatus: string;
  createdAt: string;
  updatedAt: string;
}

export type UploadFileType = 'cv' | 'jd';
