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
  selector: 'app-register-org',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <h2>Đăng ký tổ chức</h2>
    <p class="sub">Tạo tài khoản nhà tuyển dụng — bạn sẽ là quản trị viên (OrgAdmin) của tổ chức.</p>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field appearance="outline">
        <mat-label>Tên tổ chức</mat-label>
        <input matInput formControlName="orgName" autocomplete="organization" />
        @if (form.controls.orgName.touched && form.controls.orgName.invalid) {
          <mat-error>Vui lòng nhập tên tổ chức</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Mã số thuế (tuỳ chọn)</mat-label>
        <input matInput formControlName="taxCode" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Họ tên người đại diện</mat-label>
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

      <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
        Đăng ký tổ chức
      </button>
    </form>

    <div class="links">
      <span>Đã có tài khoản?</span>
      <a routerLink="/auth/login">Đăng nhập</a>
    </div>
  `,
  styles: [
    `
      h2 {
        margin: 0 0 4px;
        text-align: center;
      }
      .sub {
        margin: 0 0 12px;
        text-align: center;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
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
export class RegisterOrg {
  private fb = inject(FormBuilder);
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    orgName: ['', [Validators.required]],
    taxCode: [''],
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
    const v = this.form.getRawValue();
    this.auth
      .registerOrg({
        orgName: v.orgName,
        taxCode: v.taxCode?.trim() ? v.taxCode.trim() : null,
        fullName: v.fullName,
        email: v.email,
        password: v.password,
      })
      .subscribe({
        next: () => {
          this.auth.loadProfile();
          this.router.navigateByUrl(homeRouteFor(this.auth.primaryRole()));
        },
        error: (e: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(extractErrorMessage(e) ?? 'Đăng ký tổ chức thất bại.');
        },
      });
  }
}
