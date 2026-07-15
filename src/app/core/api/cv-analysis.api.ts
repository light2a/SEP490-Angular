import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CvAnalysisRequest, CvAnalysisResponse } from '../models';

/** /api/v1/interview/practice/cv-analysis */
@Injectable({ providedIn: 'root' })
export class CvAnalysisApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/practice/cv-analysis`;

  create(body: CvAnalysisRequest): Observable<CvAnalysisResponse> {
    return this.http.post<CvAnalysisResponse>(this.base, body);
  }
  list(): Observable<CvAnalysisResponse[]> {
    return this.http.get<CvAnalysisResponse[]>(this.base);
  }
  get(id: string): Observable<CvAnalysisResponse> {
    return this.http.get<CvAnalysisResponse>(`${this.base}/${id}`);
  }
}
