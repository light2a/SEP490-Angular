import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { BILLING_CYCLE_LABEL, SubscriptionResponse } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * "Gói của tôi" — kỳ hạn thuê bao của chính người đăng nhập (F8), dùng chung cho **cả Candidate
 * và Employer**: backend suy chủ thuê bao từ JWT (`org_id` → thuê bao Org, không → cá nhân) nên
 * một màn phục vụ được cả hai; chỉ đường dẫn "mua gói" là khác nhau và được suy từ URL.
 *
 * ⚠ Vị trí file: vòng này worker chỉ được sửa `features/*/credits/**`, nên component dùng chung
 * tạm nằm ở đây thay vì `shared/`. Dời sang `shared/` khi gộp là an toàn (không phụ thuộc gì
 * riêng của khu vực Candidate).
 *
 * Hai điểm dễ hiểu sai của hợp đồng backend, đã xử ở đây:
 *  1. **Chưa mua gói = 200 với `active:false`**, không phải 404 ⇒ không bắt lỗi để suy trạng thái.
 *  2. **Huỷ có hiệu lực CUỐI KỲ** nhưng ngay sau khi huỷ, `GET /me/subscription` đã trả
 *     `active:false` (backend lọc `Status == Active`) ⇒ ngày hết hiệu lực **biến mất khỏi API**.
 *     Vì thế màn này giữ lại `expiresAt` đọc được TRƯỚC lúc huỷ và hiện nó trong thông báo sau
 *     khi huỷ — nếu không, người vừa huỷ sẽ tưởng mình mất quyền lợi ngay lập tức.
 */
@Component({
  selector: 'app-my-subscription',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    Spinner,
    EmptyState,
  ],
  template: `
    <h1>Gói của tôi</h1>
    <p class="sub">
      Gói định kỳ mở quyền dùng theo kỳ hạn. Credit mua lẻ vẫn dùng song song và không bị ảnh
      hưởng khi gói hết hạn.
    </p>

    @if (loading()) {
      <app-spinner message="Đang tải thông tin gói…" />
    } @else if (justCancelled()) {
      <!-- API không đọc lại được gói vừa huỷ (xem chú thích đầu file) → hiện lại mốc đã giữ. -->
      <mat-card class="cancelled">
        <mat-icon class="ico">event_busy</mat-icon>
        <div>
          <h2 class="title">Đã huỷ gia hạn</h2>
          @if (cancelledUntil(); as until) {
            <p class="text">
              Gói vẫn còn hiệu lực đến {{ until | date: 'dd/MM/yyyy HH:mm' }} — bạn không bị cắt
              quyền ngay. Sau mốc đó gói sẽ không tự gia hạn.
            </p>
          } @else {
            <p class="text">Gói sẽ không tự gia hạn ở kỳ kế tiếp.</p>
          }
          <a mat-flat-button color="primary" [routerLink]="buyLink()">
            <mat-icon>shopping_cart</mat-icon> Xem các gói
          </a>
        </div>
      </mat-card>
    } @else if (sub()?.active) {
      <mat-card class="plan">
        <div class="head">
          <span class="badge">Đang hoạt động</span>
          @if (cycleLabel(); as c) {
            <span class="cycle">{{ c }}</span>
          }
        </div>

        @if (sub()?.startedAt; as started) {
          <div class="row">
            <span class="label">Bắt đầu</span>
            <span>{{ started | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>
        }
        @if (sub()?.expiresAt; as expires) {
          <div class="row">
            <span class="label">Hết hạn</span>
            <span>{{ expires | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>
        }
        @if (daysLeft(); as d) {
          <div class="row">
            <span class="label">Còn lại</span>
            <span class="strong">{{ d }}</span>
          </div>
        }

        <div class="actions">
          <button mat-stroked-button color="warn" (click)="cancel()" [disabled]="cancelling()">
            <mat-icon>cancel</mat-icon> Huỷ gia hạn
          </button>
          <a mat-button [routerLink]="buyLink()">Xem các gói</a>
        </div>
      </mat-card>
    } @else {
      <app-empty-state icon="card_membership" message="Bạn chưa có gói định kỳ nào đang chạy." />
      <div class="cta">
        <a mat-flat-button color="primary" [routerLink]="buyLink()">
          <mat-icon>shopping_cart</mat-icon> Xem các gói
        </a>
      </div>
    }
  `,
  styles: [
    `
      h1 {
        margin: 0 0 4px;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 20px;
      }
      .plan,
      .cancelled {
        padding: 20px;
        max-width: 520px;
      }
      .cancelled {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 16px;
      }
      .cancelled .ico {
        flex: none;
        color: var(--mat-sys-primary);
      }
      .cancelled .title {
        margin: 0 0 4px;
        font-size: 18px;
      }
      .cancelled .text {
        margin: 0 0 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .badge {
        font-size: 12px;
        font-weight: 600;
        padding: 2px 10px;
        border-radius: 12px;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .cycle {
        font-weight: 600;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 0;
      }
      .label {
        color: var(--mat-sys-on-surface-variant);
      }
      .strong {
        font-weight: 600;
      }
      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 16px;
      }
      .cta {
        margin-top: 16px;
      }
    `,
  ],
})
export class MySubscription {
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  readonly sub = signal<SubscriptionResponse | null>(null);
  readonly loading = signal(true);
  readonly cancelling = signal(false);
  /** Vừa huỷ xong trong phiên này — API không còn trả gói đó nữa nên phải tự nhớ. */
  readonly justCancelled = signal(false);
  readonly cancelledUntil = signal<string | null>(null);

  /** Khu vực Employer mua gói ở trang credit của tổ chức, Candidate ở trang credit cá nhân. */
  readonly buyLink = computed(() =>
    this.router.url.startsWith('/employer') ? '/employer/credits' : '/candidate/credits',
  );

  readonly cycleLabel = computed(() => {
    const c = this.sub()?.billingCycle;
    return c ? (BILLING_CYCLE_LABEL[c] ?? c) : null;
  });

  /** Số ngày còn lại, làm tròn lên; null khi không có hạn (không bịa "0 ngày"). */
  readonly daysLeft = computed(() => {
    const expires = this.sub()?.expiresAt;
    if (!expires) return null;
    const ms = new Date(expires).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    if (ms <= 0) return 'đã hết hạn';
    return `${Math.ceil(ms / 86_400_000)} ngày`;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.mySubscription().subscribe({
      next: (s) => {
        this.sub.set(s);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được thông tin gói.');
      },
    });
  }

  cancel(): void {
    // Giữ mốc hết hạn TRƯỚC khi gọi huỷ: sau khi huỷ, backend không trả lại gói này nữa.
    const expiresAt = this.sub()?.expiresAt ?? null;

    const data: ConfirmDialogData = {
      title: 'Huỷ gia hạn gói?',
      message: 'Gói sẽ không tự gia hạn ở kỳ kế tiếp.',
      bullets: [
        expiresAt
          ? `Bạn vẫn dùng được đến hết kỳ đã trả tiền (${new Date(expiresAt).toLocaleString('vi-VN')}).`
          : 'Bạn vẫn dùng được đến hết kỳ đã trả tiền.',
        'Không hoàn tiền phần kỳ chưa dùng.',
        'Credit mua lẻ trong ví không bị ảnh hưởng.',
      ],
      confirmLabel: 'Huỷ gia hạn',
      cancelLabel: 'Giữ gói',
      danger: true,
    };

    this.dialog
      .open(ConfirmDialog, { data, width: '460px' })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.cancelling.set(true);
        this.api.cancelMySubscription().subscribe({
          next: (res) => {
            this.cancelling.set(false);
            if (res.cancelled) {
              this.cancelledUntil.set(expiresAt);
              this.justCancelled.set(true);
              this.notify.success('Đã huỷ gia hạn gói.');
            } else {
              // Idempotent: không còn gói nào đang chạy (đã huỷ ở tab khác chẳng hạn).
              this.notify.info('Không có gói nào đang chạy để huỷ.');
              this.load();
            }
          },
          error: (e: HttpErrorResponse) => {
            this.cancelling.set(false);
            this.notify.error(extractErrorMessage(e) ?? 'Không huỷ được gói.');
          },
        });
      });
  }
}
