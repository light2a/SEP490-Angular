import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthStore } from '../../../core/auth/auth.store';
import { homeRouteFor } from '../../../core/auth/home-route';

/** Thông báo tiếng Việt theo mã lỗi backend trả trong `#error=`. */
const ERROR_MESSAGES: Record<string, string> = {
  remote_error: 'Google đã từ chối yêu cầu đăng nhập. Vui lòng thử lại.',
  no_login_info: 'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.',
  login_failed: 'Không tạo được phiên đăng nhập. Vui lòng thử lại sau.',
};

const FALLBACK_MESSAGE = 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.';

/**
 * Đích quay về sau khi đăng nhập Google. Backend 302 tới đây kèm token ở **fragment**
 * (`#accessToken=…&refreshToken=…&expiresAt=…`) chứ không phải query — fragment không được
 * trình duyệt gửi lên server nên token không lọt vào access log hay header `Referer`.
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
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // Đọc xong là xoá fragment NGAY, kể cả khi lỗi: token không được nằm lại trong
    // lịch sử trình duyệt (back/forward, khôi phục tab, chia sẻ URL).
    this.stripFragment();

    const errorCode = params.get('error');
    if (errorCode) {
      this.error.set(ERROR_MESSAGES[errorCode] ?? FALLBACK_MESSAGE);
      return;
    }

    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    if (!accessToken || !refreshToken) {
      this.error.set(FALLBACK_MESSAGE);
      return;
    }

    this.auth.setSessionFromRedirect({
      accessToken,
      refreshToken,
      expiresAt: params.get('expiresAt') ?? '',
    });

    // Token hỏng/không đọc được role → guard sẽ đá ra ngay, báo lỗi tại đây rõ hơn.
    const role = this.auth.primaryRole();
    if (!role) {
      this.auth.clearSession();
      this.error.set(FALLBACK_MESSAGE);
      return;
    }

    this.auth.loadProfile();
    // returnUrl (nếu có) đã được backend lọc chỉ-đường-dẫn-tương-đối trước khi ghép vào fragment.
    this.router.navigateByUrl(params.get('returnUrl') || homeRouteFor(role));
  }

  private stripFragment(): void {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
