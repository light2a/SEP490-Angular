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

/** GET /auth/org — thông tin tổ chức của caller. */
export interface OrganizationResponse {
  id: string;
  name: string;
  taxCode?: string | null;
  createdAt: string;
  memberCount: number;
}

/** PUT /auth/org — OrgAdmin sửa tên/mã số thuế. */
export interface UpdateOrgRequest {
  name?: string | null;
  taxCode?: string | null;
}

/** GET /auth/admin/users — Admin oversight: 1 user cross-org. */
export interface AdminUserResponse {
  id: string;
  email?: string | null;
  fullName?: string | null;
  role: string;
  orgId?: string | null;
  orgName?: string | null;
  orgRole?: string | null;
  createdAt: string;
}
