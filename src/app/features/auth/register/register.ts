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

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <h2>Tạo tài khoản ứng viên</h2>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field appearance="outline">
        <mat-label>Họ tên</mat-label>
        <input matInput formControlName="fullName" autocomplete="name" />
        @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
          <mat-error>Vui lòng nhập họ tên</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="username" />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <mat-error>Email không hợp lệ</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Mật khẩu (≥ 6 ký tự)</mat-label>
        <input matInput type="password" formControlName="password" autocomplete="new-password" />
        @if (form.controls.password.touched && form.controls.password.invalid) {
          <mat-error>Mật khẩu tối thiểu 6 ký tự</mat-error>
        }
      </mat-form-field>

      @if (error()) {
        <p class="err">{{ error() }}</p>
      }

      <button mat-flat-button color="primary" type="submit" [disabled]="loading()">Đăng ký</button>
    </form>

    <div class="links">
      <span>Đã có tài khoản?</span>
      <a routerLink="/auth/login">Đăng nhập</a>
    </div>
    <div class="links">
      <span>Bạn là nhà tuyển dụng?</span>
      <a routerLink="/auth/register-org">Đăng ký tổ chức</a>
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
        gap: 8px;
        justify-content: center;
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
export class Register {
  private fb = inject(FormBuilder);
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => {
        this.auth.loadProfile();
        this.router.navigateByUrl(homeRouteFor(this.auth.primaryRole()));
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Đăng ký thất bại.');
      },
    });
  }
}
