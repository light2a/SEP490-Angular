import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreatePracticeSessionRequest,
  PracticeSession,
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
  history(): Observable<PracticeSessionSummary[]> {
    return this.http.get<PracticeSessionSummary[]>(`${this.base}/history`);
  }
  get(sessionId: string): Observable<PracticeSession> {
    return this.http.get<PracticeSession>(`${this.base}/${sessionId}`);
  }
  submit(sessionId: string): Observable<unknown> {
    return this.http.post(`${this.base}/${sessionId}/submit`, {});
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
