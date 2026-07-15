import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Layout cho các trang auth: card căn giữa + logo. */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterOutlet],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand">
          <span class="logo">ISAS</span>
          <span class="tag">Luyện phỏng vấn bằng AI</span>
        </div>
        <router-outlet />
      </div>
    </div>
  `,
  styles: [
    `
      .auth-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--mat-sys-surface-container);
      }
      .auth-card {
        width: 100%;
        max-width: 420px;
        background: var(--mat-sys-surface);
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 6px 28px rgba(0, 0, 0, 0.1);
      }
      .brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 24px;
      }
      .logo {
        font-size: 30px;
        font-weight: 700;
        letter-spacing: 3px;
        color: var(--mat-sys-primary);
      }
      .tag {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
    `,
  ],
})
export class AuthShell {}
