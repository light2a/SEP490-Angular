import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthStore } from '../../../core/auth/auth.store';
import { homeRouteFor } from '../../../core/auth/home-route';

/** Thông báo tiếng Việt theo mã lỗi backend trả trong `?error=`. */
const ERROR_MESSAGES: Record<string, string> = {
  remote_error: 'Google đã từ chối yêu cầu đăng nhập. Vui lòng thử lại.',
  no_login_info: 'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.',
  login_failed: 'Không tạo được phiên đăng nhập. Vui lòng thử lại sau.',
};

const FALLBACK_MESSAGE = 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.';
/** Mã hết hạn (chỉ sống ~60s) hoặc đã bị dùng — thường do người dùng mở lại URL callback cũ. */
const EXPIRED_MESSAGE = 'Mã đăng nhập đã hết hạn hoặc đã được sử dụng. Vui lòng đăng nhập lại.';

/**
 * Đích quay về sau khi đăng nhập Google. Backend 302 tới đây kèm **mã dùng-một-lần** (`?code=…`)
 * chứ KHÔNG kèm token: token đặt ở URL — kể cả trong fragment — vẫn đọc được từ phía trình duyệt
 * (`location.hash`, extension). Trang này đổi mã lấy phiên qua `POST /auth/google/exchange`; mã hết
 * hạn nhanh và chết ngay sau lần đổi đầu, nên URL đọc trộm được cũng không dựng lại được phiên.
 */
@Component({
  selector: 'app-google-callback',
  imports: [RouterLink, MatButtonModule, MatProgressBarModule],
  template: `
    @if (error()) {
      <h2>Đăng nhập thất bại</h2>
      <p class="err">{{ error() }}</p>
      <a mat-flat-button color="primary" routerLink="/auth/login">Về trang đăng nhập</a>
    } @else {
      <h2>Đang đăng nhập…</h2>
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: [
    `
      h2 {
        margin: 0 0 16px;
        text-align: center;
      }
      .err {
        color: var(--mat-sys-error);
        margin: 4px 0 16px;
        font-size: 14px;
        text-align: center;
      }
      a {
        display: block;
        margin-top: 8px;
      }
    `,
  ],
})
export class GoogleCallback implements OnInit {
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);

    // Đọc xong là xoá query NGAY, kể cả khi lỗi: mã không được nằm lại trong lịch sử trình duyệt
    // (back/forward, khôi phục tab, chia sẻ URL) — dù đã tiêu thì cũng không để lộ thêm gì.
    this.stripQuery();

    const errorCode = params.get('error');
    if (errorCode) {
      this.error.set(ERROR_MESSAGES[errorCode] ?? FALLBACK_MESSAGE);
      return;
    }

    const code = params.get('code');
    if (!code) {
      this.error.set(FALLBACK_MESSAGE);
      return;
    }

    // returnUrl (nếu có) đã được backend lọc chỉ-đường-dẫn-tương-đối trước khi ghép vào URL.
    const returnUrl = params.get('returnUrl');

    this.auth.loginWithGoogleCode(code).subscribe({
      next: () => this.onSession(returnUrl),
      // Mã sai / hết hạn / đã dùng đều là 400 từ backend.
      error: () => this.error.set(EXPIRED_MESSAGE),
    });
  }

  private onSession(returnUrl: string | null): void {
    // Token hỏng/không đọc được role → guard sẽ đá ra ngay, báo lỗi tại đây rõ hơn.
    const role = this.auth.primaryRole();
    if (!role) {
      this.auth.clearSession();
      this.error.set(FALLBACK_MESSAGE);
      return;
    }

    this.auth.loadProfile();
    this.router.navigateByUrl(returnUrl || homeRouteFor(role));
  }

  private stripQuery(): void {
    history.replaceState(null, '', window.location.pathname);
  }
}
