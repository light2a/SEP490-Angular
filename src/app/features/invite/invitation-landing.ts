import { DatePipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthApi } from '../../core/api/auth.api';
import { CampaignApi } from '../../core/api/campaign.api';
import { extractErrorMessage } from '../../core/api/http-utils';
import { AuthStore } from '../../core/auth/auth.store';
import { InvitationInfo } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Spinner } from '../../shared/ui/spinner';

/**
 * Landing lời mời phỏng vấn B2B (public, ngoài shell): /invite/:token.
 *
 * Metadata lời mời đọc được khi CHƯA đăng nhập, nhưng `join` thì KHÔNG: backend gác
 * `[Authorize(Roles="Candidate")]` ngay trên endpoint join và `ProvisionCandidateAsync` nằm BÊN
 * TRONG join ⇒ gọi ẩn danh chỉ nhận 401, không có đường tự lấy token (gà-trứng). Vì thế trang này
 * bắt đăng nhập/đăng ký TRƯỚC, mang `returnUrl` quay lại đây, rồi mới join.
 *
 * Backend còn so email người đăng nhập với email được mời (khác → 403, không tạo membership), mà
 * `GET /campaign/invitations/{token}` KHÔNG trả email được mời ⇒ FE không biết email đó là gì, chỉ
 * nói được ràng buộc dạng chung và hiện email đang dùng để người dùng tự đối chiếu.
 */
@Component({
  selector: 'app-invitation-landing',
  imports: [
    DatePipe,
    PercentPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule,
    Spinner,
  ],
  templateUrl: './invitation-landing.html',
  styleUrl: './invitation-landing.scss',
})
export class InvitationLanding implements OnInit {
  private api = inject(CampaignApi);
  private authApi = inject(AuthApi);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private notify = inject(NotifyService);

  readonly token = input.required<string>();
  readonly invitation = signal<InvitationInfo | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly joining = signal(false);

  /** Đã có phiên (login/register thường) ⇒ mới đủ điều kiện gọi join. */
  readonly isAuthenticated = this.auth.isAuthenticated;
  /** Email đang đăng nhập — chỉ để người dùng tự đối chiếu với email đã nhận lời mời. */
  readonly currentEmail = signal<string | null>(null);
  /** Backend từ chối join vì tài khoản không dùng được lời mời này (403) → cần đổi tài khoản. */
  readonly joinRejected = signal<string | null>(null);

  /** Đích quay lại sau khi đăng nhập/đăng ký. Encode để token có ký tự lạ vẫn dựng đúng URL. */
  readonly returnUrl = computed(() => `/invite/${encodeURIComponent(this.token())}`);

  ngOnInit(): void {
    this.api.invitation(this.token()).subscribe({
      next: (inv) => {
        this.invitation.set(inv);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(
          e.status === 404 || e.status === 410
            ? 'Lời mời không tồn tại, đã bị thu hồi hoặc đã hết hạn.'
            : (extractErrorMessage(e) ?? 'Không tải được lời mời. Vui lòng thử lại sau.'),
        );
      },
    });

    // Best-effort: lỗi thì bỏ qua, không chặn trang mời (metadata mới là nội dung chính).
    if (this.isAuthenticated()) {
      this.authApi.me().subscribe({
        next: (p) => this.currentEmail.set(p.email),
        error: () => {},
      });
    }
  }

  join(): void {
    // Chưa đăng nhập thì KHÔNG gọi join: ẩn danh chắc chắn 401, gọi chỉ để nhận lỗi là vô nghĩa.
    if (!this.isAuthenticated()) return;

    this.joining.set(true);
    this.joinRejected.set(null);
    this.api.join(this.token()).subscribe({
      next: (res) => {
        // CỐ Ý bỏ qua `res.accessToken`. Tới được đây nghĩa là đã có phiên đầy đủ (có refreshToken)
        // và backend đã xác nhận email khớp ⇒ token đang giữ vốn thuộc đúng user này. Ghi đè bằng
        // `setAccessOnlySession` sẽ XOÁ refreshToken → buổi phỏng vấn B2B dài hơn 15' bị đứt giữa
        // chừng, đúng cái mà hướng "đăng nhập trước rồi join" sinh ra để diệt.
        this.notify.success('Đã tham gia chiến dịch phỏng vấn.');
        this.router.navigate(['/candidate/campaigns', res.campaignId]);
      },
      error: (e: HttpErrorResponse) => {
        this.joining.set(false);
        if (e.status === 403) {
          // 403 gộp HAI nguyên nhân mà body không phân biệt được (email không khớp · JWT không
          // phải role Candidate) → nói cả hai thay vì đoán một, lối ra thì giống nhau.
          this.joinRejected.set(
            extractErrorMessage(e) ??
              'Tài khoản đang đăng nhập không dùng được lời mời này (email không khớp email được mời, hoặc không phải tài khoản ứng viên).',
          );
          return;
        }
        this.notify.error(
          extractErrorMessage(e) ?? 'Không tham gia được. Lời mời có thể đã hết hạn.',
        );
      },
    });
  }

  /**
   * Đăng nhập bằng email khác. Dùng `logout()` chứ không `clearSession()`: người dùng đang chủ động
   * rời phiên này, để lại refresh token còn hiệu lực là hở một phiên không ai dùng. `logout()` xoá
   * storage NGAY (đồng bộ) rồi mới gọi API thu hồi, nên điều hướng liền được — API lỗi cũng không
   * kẹt lại phiên cũ.
   */
  switchAccount(): void {
    this.auth.logout().subscribe({ next: () => {}, error: () => {} });
    this.currentEmail.set(null);
    this.joinRejected.set(null);
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.returnUrl() } });
  }
}
