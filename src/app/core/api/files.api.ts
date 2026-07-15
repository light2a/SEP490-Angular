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
