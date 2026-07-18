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
  /**
   * BẮT BUỘC (BE task DB24). Phải gửi LẠI đúng OTP đã nhập ở bước verify-otp:
   * cờ "đã verify" phía server chỉ khoá theo email nên tự nó không chứng minh
   * người gọi đang cầm OTP. Thiếu trường này → 400.
   */
  otp: string;
  newPassword: string;
}

/** POST /auth/change-password — đổi mật khẩu khi đã đăng nhập (verify mật khẩu cũ). */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string; // >= 6
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
