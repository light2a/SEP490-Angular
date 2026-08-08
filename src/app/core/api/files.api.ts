import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FileRecord, UploadFileResponse, UploadFileType } from '../models';

/** /api/v1/interview/files/* — CV & JD (PDF). */
@Injectable({ providedIn: 'root' })
export class FilesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/files`;

  upload(file: File, fileType: UploadFileType): Observable<UploadFileResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UploadFileResponse>(`${this.base}/upload`, form, {
      params: { fileType },
    });
  }

  /**
   * PUT .../files/{id} — THAY nội dung file đã tải lên (giữ nguyên id, loại cv/jd, và mọi tham
   * chiếu tới nó). Dùng khi CV có bản mới: sửa tại chỗ thay vì xoá-rồi-tải-lại (xoá là mất id,
   * kéo theo các buổi luyện/phân tích cũ trỏ vào một file không còn).
   *
   * ⚠ Tên field multipart là **`newFile`**, KHÔNG phải `file` như lúc upload — sai tên thì BE
   * đọc ra null và trả 400 "Không có file.".
   * ⚠ Cũng KHÔNG có tham số `fileType`: loại kế thừa từ bản ghi cũ (không đổi cv ↔ jd được).
   *
   * 200 `{ message, parsedCv }` (parsedCv chỉ có với CV) · 400 (không phải PDF) · 403 · 404.
   */
  replace(id: string, newFile: File): Observable<{ message: string; parsedCv?: unknown }> {
    const form = new FormData();
    form.append('newFile', newFile, newFile.name);
    return this.http.put<{ message: string; parsedCv?: unknown }>(`${this.base}/${id}`, form);
  }

  /** GET .../files/files (đúng path lặp theo spec). */
  list(): Observable<FileRecord[]> {
    return this.http.get<FileRecord[]>(`${this.base}/files`);
  }
  get(id: string): Observable<FileRecord> {
    return this.http.get<FileRecord>(`${this.base}/${id}`);
  }
  parsedText(id: string): Observable<{ parsedText: string }> {
    return this.http.get<{ parsedText: string }>(`${this.base}/${id}/parsed-text`);
  }
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, { responseType: 'blob' });
  }
  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
