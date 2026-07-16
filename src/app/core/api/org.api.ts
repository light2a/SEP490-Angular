import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AddOrgMemberRequest, ChangeOrgMemberRoleRequest, OrgMemberResponse } from '../models';

/**
 * /api/v1/auth/org/members — quản lý thành viên tổ chức (A6/A6b). Chỉ OrgAdmin (Employer + org_role=OrgAdmin).
 * HrMember gọi mutate → 403 (server-enforced).
 */
@Injectable({ providedIn: 'root' })
export class OrgApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/auth/org/members`;

  /** GET — danh sách thành viên org của caller. */
  members(): Observable<OrgMemberResponse[]> {
    return this.http.get<OrgMemberResponse[]>(this.base);
  }

  /** POST — thêm thành viên (tạo User Employer passwordless + OrgMember). Trùng email → 409. */
  addMember(body: AddOrgMemberRequest): Observable<OrgMemberResponse> {
    return this.http.post<OrgMemberResponse>(this.base, body);
  }

  /** PATCH — đổi org-role (hạ cấp OrgAdmin cuối → 409). */
  changeRole(userId: string, body: ChangeOrgMemberRoleRequest): Observable<unknown> {
    return this.http.patch(`${this.base}/${userId}`, body);
  }

  /** DELETE — gỡ thành viên khỏi org (tự-xoá / OrgAdmin cuối → chặn). */
  removeMember(userId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${userId}`);
  }
}
