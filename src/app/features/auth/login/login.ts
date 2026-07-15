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
        this.router.navigateByUrl('/candidate/dashboard');
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Đăng nhập thất bại. Kiểm tra email/mật khẩu.');
      },
    });
  }
}
