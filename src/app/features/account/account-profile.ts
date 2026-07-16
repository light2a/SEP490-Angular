import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthApi } from '../../core/api/auth.api';
import { OrgApi } from '../../core/api/org.api';
import { extractErrorMessage } from '../../core/api/http-utils';
import { AuthStore } from '../../core/auth/auth.store';
import { NotifyService } from '../../core/notify.service';
import { OrganizationResponse, UserProfile } from '../../core/models';
import { Spinner } from '../../shared/ui/spinner';

interface QuickLink {
  path: string;
  icon: string;
  label: string;
}

/**
 * Trang cá nhân + quản lý tài khoản dùng CHUNG cho 3 role (candidate/employer/admin).
 * Phần "tổ chức" + panel link hiện theo `AuthStore.primaryRole()`/`orgRole()`.
 * Không route-param (fetch trong ngOnInit), không MatTable → tránh NG0950/NG0901.
 */
@Component({
  selector: 'app-account-profile',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    Spinner,
  ],
  template: `
    <div class="head">
      <h1>Tài khoản</h1>
      <p class="sub">Thông tin cá nhân, bảo mật và tính năng theo vai trò.</p>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải hồ sơ..." />
    } @else if (profile(); as p) {
      <div class="grid">
        <!-- Hồ sơ -->
        <mat-card class="card">
          <h2><mat-icon>badge</mat-icon> Hồ sơ</h2>
          <div class="ro">
            <div><span class="k">Email</span><span class="v">{{ p.email }}</span></div>
            <div><span class="k">Vai trò</span><span class="v">{{ roleLabel() }}</span></div>
            <div><span class="k">Tham gia</span><span class="v">{{ p.createdAt | date: 'dd/MM/yyyy' }}</span></div>
          </div>
          <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
            <mat-form-field appearance="outline">
              <mat-label>Họ tên</mat-label>
              <input matInput formControlName="fullName" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Chức danh</mat-label>
              <input matInput formControlName="title" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Địa điểm</mat-label>
              <input matInput formControlName="location" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="savingProfile()">
              Lưu hồ sơ
            </button>
          </form>
        </mat-card>

        <!-- Đổi mật khẩu -->
        <mat-card class="card">
          <h2><mat-icon>lock</mat-icon> Đổi mật khẩu</h2>
          <form [formGroup]="pwForm" (ngSubmit)="changePassword()">
            <mat-form-field appearance="outline">
              <mat-label>Mật khẩu hiện tại</mat-label>
              <input matInput type="password" formControlName="oldPassword" autocomplete="current-password" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Mật khẩu mới (≥ 6 ký tự)</mat-label>
              <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Nhập lại mật khẩu mới</mat-label>
              <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
              @if (pwForm.hasError('mismatch') && pwForm.controls.confirm.touched) {
                <mat-error>Mật khẩu nhập lại không khớp</mat-error>
              }
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="savingPassword()">
              Đổi mật khẩu
            </button>
          </form>
        </mat-card>

        <!-- Tổ chức (Employer) -->
        @if (isEmployer()) {
          <mat-card class="card">
            <h2><mat-icon>domain</mat-icon> Tổ chức</h2>
            @if (org(); as o) {
              <div class="ro">
                <div><span class="k">Vai trò org</span><span class="v">{{ orgRole() ?? '—' }}</span></div>
                <div><span class="k">Thành viên</span><span class="v">{{ o.memberCount }}</span></div>
                <div><span class="k">Tạo lúc</span><span class="v">{{ o.createdAt | date: 'dd/MM/yyyy' }}</span></div>
              </div>
              @if (isOrgAdmin()) {
                <form [formGroup]="orgForm" (ngSubmit)="saveOrg()">
                  <mat-form-field appearance="outline">
                    <mat-label>Tên tổ chức</mat-label>
                    <input matInput formControlName="name" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Mã số thuế</mat-label>
                    <input matInput formControlName="taxCode" />
                  </mat-form-field>
                  <div class="row">
                    <button mat-flat-button color="primary" type="submit" [disabled]="savingOrg()">
                      Lưu tổ chức
                    </button>
                    <a mat-stroked-button routerLink="/employer/members">
                      <mat-icon>group</mat-icon> Quản lý thành viên
                    </a>
                  </div>
                </form>
              } @else {
                <div class="ro">
                  <div><span class="k">Tên tổ chức</span><span class="v">{{ o.name }}</span></div>
                  <div><span class="k">Mã số thuế</span><span class="v">{{ o.taxCode ?? '—' }}</span></div>
                </div>
                <p class="note">Chỉ OrgAdmin được sửa thông tin tổ chức.</p>
              }
            } @else {
              <p class="note">Không tải được thông tin tổ chức.</p>
            }
          </mat-card>
        }

        <!-- Tính năng theo vai trò -->
        <mat-card class="card">
          <h2><mat-icon>apps</mat-icon> Tính năng của bạn</h2>
          <div class="links">
            @for (l of quickLinks(); track l.path) {
              <a mat-stroked-button [routerLink]="l.path">
                <mat-icon>{{ l.icon }}</mat-icon> {{ l.label }}
              </a>
            }
          </div>
        </mat-card>
      </div>
    } @else {
      <p class="note">Không tải được hồ sơ.</p>
    }
  `,
  styles: [
    `
      .head {
        margin-bottom: 20px;
      }
      h1 {
        margin: 0 0 4px;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 16px;
        align-items: start;
      }
      .card {
        padding: 20px;
      }
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 16px;
        font-size: 18px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      mat-form-field {
        width: 100%;
      }
      button[type='submit'] {
        margin-top: 4px;
        align-self: flex-start;
      }
      .ro {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .ro > div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
      }
      .k {
        color: var(--mat-sys-on-surface-variant);
      }
      .v {
        font-weight: 500;
        text-align: right;
      }
      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .note {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin: 8px 0 0;
      }
    `,
  ],
})
export class AccountProfile implements OnInit {
  private fb = inject(FormBuilder);
  private authApi = inject(AuthApi);
  private orgApi = inject(OrgApi);
  private auth = inject(AuthStore);
  private notify = inject(NotifyService);

  readonly loading = signal(true);
  readonly profile = signal<UserProfile | null>(null);
  readonly org = signal<OrganizationResponse | null>(null);
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly savingOrg = signal(false);

  readonly orgRole = this.auth.orgRole;
  readonly isEmployer = computed(() => this.auth.primaryRole() === 'Employer');
  readonly isOrgAdmin = computed(() => this.auth.orgRole() === 'OrgAdmin');
  readonly roleLabel = computed(() => {
    const r = this.auth.primaryRole();
    const map: Record<string, string> = {
      Candidate: 'Ứng viên',
      Employer: 'Nhà tuyển dụng',
      Admin: 'Quản trị hệ thống',
    };
    return r ? (map[r] ?? r) : '—';
  });

  readonly quickLinks = computed<QuickLink[]>(() => {
    const role = this.auth.primaryRole();
    if (role === 'Admin') {
      return [
        { path: '/admin/packages', icon: 'inventory_2', label: 'Gói credit' },
        { path: '/admin/billing', icon: 'receipt_long', label: 'Chốt kỳ postpaid' },
      ];
    }
    if (role === 'Employer') {
      const links: QuickLink[] = [
        { path: '/employer/campaigns', icon: 'work', label: 'Chiến dịch' },
      ];
      if (this.isOrgAdmin()) {
        links.push(
          { path: '/employer/members', icon: 'group', label: 'Thành viên' },
          { path: '/employer/credits', icon: 'account_balance_wallet', label: 'Credit tổ chức' },
          { path: '/employer/invoices', icon: 'receipt_long', label: 'Hoá đơn' },
        );
      }
      return links;
    }
    // Candidate
    return [
      { path: '/candidate/practice', icon: 'mic', label: 'Luyện phỏng vấn' },
      { path: '/candidate/campaigns', icon: 'work', label: 'Phỏng vấn tuyển dụng' },
      { path: '/candidate/cv-analysis', icon: 'insights', label: 'Phân tích CV' },
      { path: '/candidate/roadmaps', icon: 'map', label: 'Lộ trình ôn' },
      { path: '/candidate/rubrics', icon: 'rule', label: 'Tiêu chí (rubric)' },
      { path: '/candidate/credits', icon: 'account_balance_wallet', label: 'Credit & Thanh toán' },
    ];
  });

  readonly profileForm = this.fb.nonNullable.group({
    fullName: [''],
    title: [''],
    location: [''],
  });

  readonly pwForm = this.fb.nonNullable.group(
    {
      oldPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]],
    },
    { validators: (g) => (g.get('newPassword')!.value === g.get('confirm')!.value ? null : { mismatch: true }) },
  );

  readonly orgForm = this.fb.nonNullable.group({
    name: [''],
    taxCode: [''],
  });

  ngOnInit(): void {
    this.authApi.me().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.profileForm.patchValue({
          fullName: p.fullName ?? '',
          title: p.title ?? '',
          location: p.location ?? '',
        });
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được hồ sơ.');
      },
    });

    if (this.isEmployer()) {
      this.orgApi.org().subscribe({
        next: (o) => {
          this.org.set(o);
          this.orgForm.patchValue({ name: o.name ?? '', taxCode: o.taxCode ?? '' });
        },
        error: () => {},
      });
    }
  }

  saveProfile(): void {
    this.savingProfile.set(true);
    this.authApi.updateMe(this.profileForm.getRawValue()).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.notify.success('Đã lưu hồ sơ.');
        this.auth.loadProfile(); // refresh tên hiển thị ở shell
        this.authApi.me().subscribe({ next: (p) => this.profile.set(p), error: () => {} });
      },
      error: (e: HttpErrorResponse) => {
        this.savingProfile.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu hồ sơ thất bại.');
      },
    });
  }

  changePassword(): void {
    if (this.pwForm.invalid) {
      this.pwForm.markAllAsTouched();
      return;
    }
    const { oldPassword, newPassword } = this.pwForm.getRawValue();
    this.savingPassword.set(true);
    this.authApi.changePassword({ oldPassword, newPassword }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.notify.success('Đổi mật khẩu thành công.');
        this.pwForm.reset();
      },
      error: (e: HttpErrorResponse) => {
        this.savingPassword.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Đổi mật khẩu thất bại (kiểm tra mật khẩu cũ).');
      },
    });
  }

  saveOrg(): void {
    this.savingOrg.set(true);
    this.orgApi.updateOrg(this.orgForm.getRawValue()).subscribe({
      next: (o) => {
        this.savingOrg.set(false);
        this.org.set(o);
        this.notify.success('Đã lưu thông tin tổ chức.');
      },
      error: (e: HttpErrorResponse) => {
        this.savingOrg.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu tổ chức thất bại.');
      },
    });
  }
}
