import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthStore } from '../../core/auth/auth.store';
import { createShellSidenav } from '../shell-sidenav';

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-candidate-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './candidate-shell.html',
  styleUrl: './candidate-shell.scss',
})
export class CandidateShell {
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly displayName = this.auth.displayName;

  /** F24 — sidenav overlay + đóng mặc định khi màn hẹp; màn rộng giữ nguyên "side" + mở. */
  private readonly sidenav = createShellSidenav();
  readonly opened = this.sidenav.opened;
  readonly sidenavMode = this.sidenav.mode;

  readonly nav: NavItem[] = [
    { path: 'dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: 'files', icon: 'description', label: 'CV / JD' },
    { path: 'practice', icon: 'mic', label: 'Luyện phỏng vấn' },
    { path: 'campaigns', icon: 'work', label: 'Phỏng vấn tuyển dụng' },
    { path: 'cv-analysis', icon: 'insights', label: 'Phân tích CV' },
    { path: 'repo-analysis', icon: 'code', label: 'Phân tích repo GitHub' },
    { path: 'roadmaps', icon: 'map', label: 'Lộ trình ôn' },
    { path: 'rubrics', icon: 'rule', label: 'Tiêu chí (rubric)' },
    { path: 'credits', icon: 'account_balance_wallet', label: 'Credit & Thanh toán' },
  ];

  toggle(): void {
    this.sidenav.toggle();
  }

  /** Chọn mục nav khi drawer đang overlay → đóng lại (no-op trên màn rộng). */
  onNavigate(): void {
    this.sidenav.closeIfNarrow();
  }

  logout(): void {
    this.auth.logout().subscribe({ error: () => {} });
    this.router.navigate(['/auth/login']);
  }
}
