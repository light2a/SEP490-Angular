import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private auth = inject(AuthStore);

  constructor() {
    // Nạp tên người dùng nếu đã đăng nhập (best-effort).
    if (this.auth.isAuthenticated()) this.auth.loadProfile();
  }
}
