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
  selector: 'app-admin-shell',
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
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly displayName = this.auth.displayName;
  readonly opened = signal(true);

  readonly nav: NavItem[] = [
    { path: 'dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: 'organizations', icon: 'domain', label: 'Tổ chức' },
    { path: 'users', icon: 'group', label: 'Người dùng' },
    { path: 'campaigns', icon: 'work', label: 'Chiến dịch' },
    { path: 'orders', icon: 'receipt_long', label: 'Đơn hàng' },
    { path: 'packages', icon: 'inventory_2', label: 'Gói credit' },
    { path: 'billing', icon: 'event_repeat', label: 'Chốt kỳ postpaid' },
  ];

  toggle(): void {
    this.opened.update((v) => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({ error: () => {} });
    this.router.navigate(['/auth/login']);
  }
}
