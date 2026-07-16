import { OrgRole } from './enums';

// Quản lý thành viên tổ chức (A6/A6b) — chỉ OrgAdmin. Nguồn: AuthService OrgMemberDtos.

/** POST /auth/org/members — OrgAdmin thêm thành viên (tạo User Employer passwordless + OrgMember). */
export interface AddOrgMemberRequest {
  email: string;
  fullName?: string | null;
  orgRole: OrgRole;
}

/** PATCH /auth/org/members/{userId} — đổi org-role (OrgAdmin ↔ HrMember). */
export interface ChangeOrgMemberRoleRequest {
  orgRole: OrgRole;
}

/** GET /auth/org/members — 1 thành viên. */
export interface OrgMemberResponse {
  userId: string;
  email: string;
  fullName?: string | null;
  orgRole: OrgRole;
  joinedAt: string;
}
