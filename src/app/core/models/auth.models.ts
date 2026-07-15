import { OrgRole, PlatformRole } from './enums';

/** Response chung của login/register/register-org/refresh (AuthResponse). */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO datetime
}

export interface RegisterRequest {
  email: string;
  password: string; // >= 6
  fullName: string;
}

export interface RegisterOrgRequest {
  email: string;
  password: string;
  fullName: string;
  orgName: string;
  taxCode?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}
export interface VerifyOtpRequest {
  email: string;
  otp: string;
}
export interface ResetPasswordRequest {
  email: string;
  newPassword: string;
}

/** GET /auth/me */
export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  location: string;
  title: string;
  createdAt: string;
  role: string; // role đầu tiên hoặc "No role"
}

export interface UpdateProfileRequest {
  fullName?: string | null;
  location?: string | null;
  title?: string | null;
}

/** Claim giải mã từ accessToken (JWT). Xem docs/api-spec.md §JWT. */
export interface JwtClaims {
  /** nameid / NameIdentifier = userId (sub) */
  sub: string;
  /** unique_name / Name */
  name?: string;
  role: PlatformRole | PlatformRole[];
  org_id?: string;
  org_role?: OrgRole;
  exp: number; // epoch seconds
  [k: string]: unknown;
}
