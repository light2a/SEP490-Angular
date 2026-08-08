import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreatePracticeSessionRequest,
  PracticeSession,
  PracticeSessionOptions,
  PracticeSessionSummary,
  UploadAnswerResult,
} from '../models';

/** /api/v1/interview/practice/sessions/* + upload câu trả lời. */
@Injectable({ providedIn: 'root' })
export class PracticeApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/practice/sessions`;

  create(body: CreatePracticeSessionRequest): Observable<PracticeSession> {
    return this.http.post<PracticeSession>(this.base, body);
  }

  /**
   * SC3 — `GET /interview/practice/session-options` (KHÔNG nằm dưới `/sessions`, nên tự ghép path).
   *
   * Server tính preset bằng đúng luật tạo session ⇒ FE không được tự suy `seedCount` từ
   * `questionCount`; công thức nằm ở BE và đã đổi một lần (INT-17b).
   *
   * `language` phải trùng ngôn ngữ sẽ tạo buổi — lệch thì preview đọc rubric khác.
   * Lỗi: 400 (jobCategory sai · xin `en` khi cờ song ngữ tắt).
   */
  sessionOptions(jobCategory: string, language?: string | null): Observable<PracticeSessionOptions> {
    let params = new HttpParams().set('jobCategory', jobCategory);
    if (language) params = params.set('language', language);
    return this.http.get<PracticeSessionOptions>(
      `${environment.apiBase}/interview/practice/session-options`,
      { params },
    );
  }
  history(): Observable<PracticeSessionSummary[]> {
    return this.http.get<PracticeSessionSummary[]>(`${this.base}/history`);
  }
  get(sessionId: string): Observable<PracticeSession> {
    return this.http.get<PracticeSession>(`${this.base}/${sessionId}`);
  }
  submit(sessionId: string): Observable<unknown> {
    return this.http.post(`${this.base}/${sessionId}/submit`, {});
  }

  /**
   * GET .../{sessionId}/questions/{questionId}/speech — giọng đọc câu hỏi (audio/mpeg).
   * Trả blob chứ không gán thẳng vào `<audio src>` vì endpoint đòi JWT: thẻ `<audio>` không đính
   * Authorization header nên sẽ 401. Tải qua HttpClient (interceptor gắn token) rồi mới tạo object URL.
   */
  speech(sessionId: string, questionId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${sessionId}/questions/${questionId}/speech`, {
      responseType: 'blob',
    });
  }

  /**
   * GET .../{sessionId}/answers/{answerId}/audio — nghe lại bản ghi âm của CHÍNH mình.
   *
   * Trả blob vì cùng lý do với `speech()`: endpoint đòi JWT, mà `<audio src>` không đính
   * Authorization header ⇒ 401 và trình phát chỉ báo "không phát được", rất khó truy.
   * Content-Type do BE quyết theo định dạng lúc thu (webm Chrome · mp4/m4a iPhone…).
   *
   * Lỗi: 403 (không phải chủ buổi) · 404 (chưa có answer / file đã bị dọn khỏi S3).
   */
  answerAudio(sessionId: string, answerId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${sessionId}/answers/${answerId}/audio`, {
      responseType: 'blob',
    });
  }

  /** POST .../{sessionId}/answers (multipart: questionId, file audio, durationSec). */
  uploadAnswer(
    sessionId: string,
    questionId: string,
    audio: Blob,
    durationSec: number,
    filename = 'answer.webm',
  ): Observable<UploadAnswerResult> {
    const form = new FormData();
    form.append('questionId', questionId);
    form.append('file', audio, filename);
    form.append('durationSec', String(Math.round(durationSec)));
    return this.http.post<UploadAnswerResult>(`${this.base}/${sessionId}/answers`, form);
  }
}
