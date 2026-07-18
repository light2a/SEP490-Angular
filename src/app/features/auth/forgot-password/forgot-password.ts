import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthApi } from '../../../core/api/auth.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <h2>Đặt lại mật khẩu</h2>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <p class="hint">
      @switch (step()) {
        @case (1) {
          Nhập email để nhận mã OTP.
        }
        @case (2) {
          Nhập mã OTP đã gửi tới email.
        }
        @case (3) {
          Nhập mật khẩu mới.
        }
      }
    </p>

    <form [formGroup]="form" (ngSubmit)="submit()">
      @if (step() === 1) {
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>
      }
      @if (step() === 2) {
        <mat-form-field appearance="outline">
          <mat-label>Mã OTP (6 số)</mat-label>
          <input matInput formControlName="otp" inputmode="numeric" />
        </mat-form-field>
      }
      @if (step() === 3) {
        <mat-form-field appearance="outline">
          <mat-label>Mật khẩu mới</mat-label>
          <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
        </mat-form-field>
      }

      @if (error()) {
        <p class="err">{{ error() }}</p>
      }

      <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
        {{ step() === 3 ? 'Đổi mật khẩu' : 'Tiếp tục' }}
      </button>
    </form>

    <div class="links"><a routerLink="/auth/login">Về đăng nhập</a></div>
  `,
  styles: [
    `
      h2 {
        margin: 0 0 8px;
        text-align: center;
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
        text-align: center;
        margin: 0 0 12px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      mat-form-field {
        width: 100%;
      }
      .err {
        color: var(--mat-sys-error);
        font-size: 14px;
        margin: 4px 0;
      }
      .links {
        text-align: center;
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
export class ForgotPassword {
  private fb = inject(FormBuilder);
  private authApi = inject(AuthApi);
  private router = inject(Router);
  private notify = inject(NotifyService);

  readonly step = signal<1 | 2 | 3>(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    otp: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    this.error.set(null);
    const { email, otp, newPassword } = this.form.getRawValue();
    if (this.step() === 1) {
      if (this.form.controls.email.invalid) return;
      this.run(this.authApi.forgotPassword({ email }), () => this.step.set(2));
    } else if (this.step() === 2) {
      if (this.form.controls.otp.invalid) return;
      this.run(this.authApi.verifyOtp({ email, otp }), () => this.step.set(3));
    } else {
      if (this.form.controls.newPassword.invalid) return;
      // BE (DB24) bắt buộc gửi LẠI otp ở bước reset, không chỉ ở verify-otp.
      // Form giữ nguyên 1 FormGroup xuyên 3 bước nên otp người dùng nhập ở bước 2
      // vẫn còn nguyên đây — không cần thêm state hay bắt nhập lại.
      this.run(
        this.authApi.resetPassword({ email, otp, newPassword }),
        () => {
          this.notify.success('Đổi mật khẩu thành công. Vui lòng đăng nhập.');
          this.router.navigateByUrl('/auth/login');
        },
        // OTP sống 5 phút nên bước 3 GIỜ có thể fail (trước DB24 bước 3 luôn 500 nên
        // chưa ai chạm tới). Nếu để nguyên ở bước 3 thì người dùng kẹt: chỉ còn ô mật
        // khẩu, không có đường xin mã mới. Mã hỏng/hết hạn → quay về bước 1 xin mã mới
        // (không phải bước 2: mã cũ đã chết, nhập lại nó cũng vô ích).
        () => {
          this.form.controls.otp.reset('');
          this.form.controls.newPassword.reset('');
          this.step.set(1);
        },
      );
    }
  }

  private run(
    obs: import('rxjs').Observable<unknown>,
    onOk: () => void,
    onError?: () => void,
  ): void {
    this.loading.set(true);
    obs.subscribe({
      next: () => {
        this.loading.set(false);
        onOk();
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(e) ?? 'Có lỗi xảy ra.');
        // Chạy SAU khi set error để onError được phép ghi đè thông điệp nếu cần.
        onError?.();
      },
    });
  }
}
