import { Component, computed, inject, signal } from '@angular/core';
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
  /** Chỉ hiện với OrgAdmin (billing/quản thành viên). */
  orgAdminOnly?: boolean;
}

@Component({
  selector: 'app-employer-shell',
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
  templateUrl: './employer-shell.html',
  styleUrl: './employer-shell.scss',
})
export class EmployerShell {
  private auth = inject(AuthStore);
  private router = inject(Router);

  readonly displayName = this.auth.displayName;
  readonly opened = signal(true);

  private readonly isOrgAdmin = computed(() => this.auth.orgRole() === 'OrgAdmin');

  private readonly allNav: NavItem[] = [
    { path: 'dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: 'campaigns', icon: 'work', label: 'Chiến dịch' },
    { path: 'members', icon: 'group', label: 'Thành viên', orgAdminOnly: true },
    { path: 'credits', icon: 'account_balance_wallet', label: 'Credit & Thanh toán', orgAdminOnly: true },
    { path: 'invoices', icon: 'receipt_long', label: 'Hoá đơn', orgAdminOnly: true },
  ];

  readonly nav = computed(() =>
    this.allNav.filter((n) => !n.orgAdminOnly || this.isOrgAdmin()),
  );

  toggle(): void {
    this.opened.update((v) => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({ error: () => {} });
    this.router.navigate(['/auth/login']);
  }
}
