import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateRoadmapRequest,
  LessonResponse,
  PracticeSession,
  RoadmapReport,
  RoadmapResponse,
} from '../models';

/** /api/v1/interview/practice/roadmaps/* */
@Injectable({ providedIn: 'root' })
export class RoadmapApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/practice/roadmaps`;

  create(body: CreateRoadmapRequest): Observable<RoadmapResponse> {
    return this.http.post<RoadmapResponse>(this.base, body);
  }
  list(): Observable<RoadmapResponse[]> {
    return this.http.get<RoadmapResponse[]>(this.base);
  }
  get(id: string): Observable<RoadmapResponse> {
    return this.http.get<RoadmapResponse>(`${this.base}/${id}`);
  }
  lesson(id: string, lessonId: string): Observable<LessonResponse> {
    return this.http.get<LessonResponse>(`${this.base}/${id}/lessons/${lessonId}`);
  }
  /** 409 trả { error, sessionId } → dùng sessionId để resume. */
  startLesson(id: string, lessonId: string): Observable<PracticeSession> {
    return this.http.post<PracticeSession>(`${this.base}/${id}/lessons/${lessonId}/start`, {});
  }
  report(id: string): Observable<RoadmapReport> {
    return this.http.get<RoadmapReport>(`${this.base}/${id}/report`);
  }
}
