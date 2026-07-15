import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JobCategory, RubricResponse, UpsertRubricRequest } from '../models';

/** /api/v1/interview/practice/rubrics/{jobCategory} */
@Injectable({ providedIn: 'root' })
export class RubricApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/interview/practice/rubrics`;

  get(jobCategory: JobCategory): Observable<RubricResponse> {
    return this.http.get<RubricResponse>(`${this.base}/${jobCategory}`);
  }
  upsert(jobCategory: JobCategory, body: UpsertRubricRequest): Observable<RubricResponse> {
    return this.http.put<RubricResponse>(`${this.base}/${jobCategory}`, body);
  }
  remove(jobCategory: JobCategory): Observable<unknown> {
    return this.http.delete(`${this.base}/${jobCategory}`);
  }
}
