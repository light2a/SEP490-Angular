import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthStore } from '../../core/auth/auth.store';

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
  readonly opened = signal(true);

  readonly nav: NavItem[] = [
    { path: 'dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: 'files', icon: 'description', label: 'CV / JD' },
    { path: 'practice', icon: 'mic', label: 'Luyện phỏng vấn' },
    { path: 'cv-analysis', icon: 'insights', label: 'Phân tích CV' },
    { path: 'roadmaps', icon: 'map', label: 'Lộ trình ôn' },
    { path: 'rubrics', icon: 'rule', label: 'Tiêu chí (rubric)' },
    { path: 'credits', icon: 'account_balance_wallet', label: 'Credit & Thanh toán' },
  ];

  toggle(): void {
    this.opened.update((v) => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({ error: () => {} });
    this.router.navigate(['/auth/login']);
  }
}
