import { Component, computed, inject } from '@angular/core';
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

  /** F24 — sidenav overlay + đóng mặc định khi màn hẹp; màn rộng giữ nguyên "side" + mở. */
  private readonly sidenav = createShellSidenav();
  readonly opened = this.sidenav.opened;
  readonly sidenavMode = this.sidenav.mode;

  private readonly isOrgAdmin = computed(() => this.auth.orgRole() === 'OrgAdmin');

  private readonly allNav: NavItem[] = [
    { path: 'dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: 'campaigns', icon: 'work', label: 'Chiến dịch' },
    { path: 'members', icon: 'group', label: 'Thành viên', orgAdminOnly: true },
    { path: 'api-keys', icon: 'vpn_key', label: 'API key', orgAdminOnly: true },
    { path: 'plans', icon: 'workspace_premium', label: 'Gói dịch vụ', orgAdminOnly: true },
    { path: 'credits', icon: 'account_balance_wallet', label: 'Credit & Thanh toán', orgAdminOnly: true },
    { path: 'invoices', icon: 'receipt_long', label: 'Hoá đơn', orgAdminOnly: true },
    { path: 'subscription', icon: 'card_membership', label: 'Gói của tổ chức', orgAdminOnly: true },
  ];

  readonly nav = computed(() =>
    this.allNav.filter((n) => !n.orgAdminOnly || this.isOrgAdmin()),
  );

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
