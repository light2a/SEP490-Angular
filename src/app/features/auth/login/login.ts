import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { AuthStore } from '../../../core/auth/auth.store';
import { homeRouteFor } from '../../../core/auth/home-route';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <h2>Đăng nhập</h2>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field appearance="outline">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="username" />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <mat-error>Email không hợp lệ</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Mật khẩu</mat-label>
        <input
          matInput
          type="password"
          formControlName="password"
          autocomplete="current-password"
        />
        @if (form.controls.password.touched && form.controls.password.invalid) {
          <mat-error>Vui lòng nhập mật khẩu</mat-error>
        }
      </mat-form-field>

      @if (error()) {
        <p class="err">{{ error() }}</p>
      }

      <button mat-flat-button color="primary" type="submit" [disabled]="loading()">Đăng nhập</button>
    </form>

    <div class="sep"><span>hoặc</span></div>

    <button mat-stroked-button type="button" class="google" (click)="loginWithGoogle()">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.5.8 6.9 2.5 9.9l7.3-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
        />
      </svg>
      Đăng nhập với Google
    </button>

    <div class="links">
      <a routerLink="/auth/forgot-password">Quên mật khẩu?</a>
      <a routerLink="/auth/register">Tạo tài khoản</a>
    </div>
  `,
  styles: [
    `
      h2 {
        margin: 0 0 16px;
        text-align: center;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 12px;
      }
      mat-form-field {
        width: 100%;
      }
      button {
        margin-top: 8px;
      }
      .err {
        color: var(--mat-sys-error);
        margin: 4px 0;
        font-size: 14px;
      }
      .sep {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 20px 0 12px;
        color: var(--mat-sys-outline);
        font-size: 13px;
      }
      .sep::before,
      .sep::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--mat-sys-outline-variant);
      }
      .google {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .google svg {
        width: 18px;
        height: 18px;
      }
      .links {
        display: flex;
        justify-content: space-between;
        margin-top: 16px;
        font-size: 14px;
      }
      a {
        color: var(--mat-sys-primary);
        text-decoration: none;
      }
    `,
  ],
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /**
   * OAuth Google là điều hướng CẢ TRANG (rời app sang accounts.google.com rồi quay lại), không
   * phải XHR — nên phải đổi location chứ không gọi HttpClient. Backend sẽ 302 về
   * /auth/google/callback kèm MÃ dùng-một-lần (token không đi qua URL; trang callback đổi mã lấy phiên).
   */
  loginWithGoogle(): void {
    window.location.href = `${environment.apiBase}/auth/login-google`;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.auth.loadProfile();
        this.router.navigateByUrl(homeRouteFor(this.auth.primaryRole()));
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Đăng nhập thất bại. Kiểm tra email/mật khẩu.');
      },
    });
  }
}
