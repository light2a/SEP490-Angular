import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RefreshTokenRequest,
  RegisterOrgRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UserProfile,
  VerifyOtpRequest,
} from '../models';

/** Gọi thẳng /api/v1/auth/* qua Gateway. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/auth`;

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, body);
  }
  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/register`, body);
  }
  registerOrg(body: RegisterOrgRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/register-org`, body);
  }
  refresh(body: RefreshTokenRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/refresh`, body);
  }
  /**
   * Chặng 2 của đăng nhập Google: đổi mã dùng-một-lần (backend gửi về qua `?code=` trên URL
   * callback) lấy phiên thật. Token KHÔNG bao giờ đi qua URL — mã sống vài chục giây và chết ngay
   * sau lần đổi đầu, nên đọc trộm được URL cũng không dựng lại được phiên.
   */
  exchangeGoogleCode(code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/google/exchange`, { code });
  }
  logout(refreshToken: string): Observable<unknown> {
    return this.http.post(`${this.base}/logout`, { refreshToken });
  }
  me(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/me`);
  }
  // PUT /me trả về chuỗi literal → responseType text.
  updateMe(body: UpdateProfileRequest): Observable<string> {
    return this.http.put(`${this.base}/me`, body, { responseType: 'text' });
  }
  /** Đổi mật khẩu khi đã đăng nhập (204). Sai mật khẩu cũ → 400. */
  changePassword(body: ChangePasswordRequest): Observable<unknown> {
    return this.http.post(`${this.base}/change-password`, body);
  }
  // Các endpoint OTP trả chuỗi thuần → responseType text (tránh JSON parse lỗi).
  forgotPassword(body: ForgotPasswordRequest): Observable<string> {
    return this.http.post(`${this.base}/forgot-password`, body, { responseType: 'text' });
  }
  verifyOtp(body: VerifyOtpRequest): Observable<string> {
    return this.http.post(`${this.base}/verify-otp`, body, { responseType: 'text' });
  }
  resetPassword(body: ResetPasswordRequest): Observable<string> {
    return this.http.post(`${this.base}/reset-password`, body, { responseType: 'text' });
  }
}
