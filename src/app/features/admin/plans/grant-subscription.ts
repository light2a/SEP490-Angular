import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  OwnerType,
  PlanAudience,
  PlanResponse,
  SubscriptionResponse,
} from '../../../core/models';

/**
 * Cấp tay một kỳ hạn thuê bao cho ví bất kỳ (Admin).
 *
 * Chống cấp trùng có HAI lớp, giống {@link GrantCredits} (F20/Q14):
 * 1. khoá nút khi đang gửi — chặn double-click trong cùng một lần bấm;
 * 2. `idempotencyKey` gửi kèm — backend khớp `(ownerType, ownerId, key)` và **trả lại kỳ hạn CŨ**
 *    nếu trùng, nên bấm lại sau lỗi mạng không cấp thêm kỳ hạn thứ hai.
 *
 * ⚠ Khác `grantCredits` ở một điểm quan trọng: ở đây khoá là **BẮT BUỘC** (backend khai
 * non-nullable, rỗng → 400) — không có chế độ "không idempotent".
 *
 * ⚠ Backend khớp khoá mà KHÔNG xét `planId`/`durationDays`: giữ khoá cũ sau khi đổi gói hoặc đổi
 * số ngày sẽ khiến nó replay kỳ hạn cũ và bỏ qua nội dung mới **trong im lặng**. Vì thế khoá được
 * neo vào nội dung form (xem {@link GrantSubscription.idempotencyKeyFor}).
 */
@Component({
  selector: 'app-grant-subscription',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Cấp thuê bao tay</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="hint">
            Kích hoạt một kỳ hạn thuê bao cho ví mà không qua thanh toán. Mỗi lần cấp tạo một kỳ
            hạn mới (không cộng dồn vào kỳ đang chạy).
          </p>

          <form class="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="f-owner">
              <mat-label>Loại ví</mat-label>
              <mat-select [(ngModel)]="ownerType" name="ownerType">
                <mat-option [value]="OwnerType.User">Cá nhân</mat-option>
                <mat-option [value]="OwnerType.Org">Tổ chức</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="f-id">
              <mat-label>
                {{ ownerType === OwnerType.Org ? 'Id tổ chức' : 'Id người dùng' }} *
              </mat-label>
              <input matInput [(ngModel)]="ownerId" name="ownerId" placeholder="GUID" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="f-plan">
              <mat-label>Gói *</mat-label>
              <mat-select [(ngModel)]="planId" name="planId">
                @for (p of eligiblePlans(); track p.id) {
                  <mat-option [value]="p.id">{{ p.name }} ({{ p.code }})</mat-option>
                }
              </mat-select>
              <mat-hint>
                Chỉ hiện gói đang bán của catalog
                {{ ownerType === OwnerType.Org ? 'B2B' : 'B2C' }} — cấp chéo catalog bị máy chủ từ
                chối.
              </mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="f-days">
              <mat-label>Số ngày *</mat-label>
              <input matInput type="number" min="1" [(ngModel)]="durationDays" name="durationDays" />
            </mat-form-field>

            <button mat-flat-button color="primary" type="submit" [disabled]="submitting()">
              @if (submitting()) {
                <mat-icon class="spin">progress_activity</mat-icon>
              } @else {
                <mat-icon>workspace_premium</mat-icon>
              }
              {{ submitting() ? 'Đang cấp...' : 'Cấp thuê bao' }}
            </button>
          </form>

          <p class="warn">
            <mat-icon inline>warning</mat-icon>
            Chủ ví <strong>phải có ví credit từ trước</strong> — máy chủ từ chối cấp thuê bao cho
            chủ ví chưa có ví. Kiểm tra ở màn <em>Ví &amp; chế độ thanh toán</em> nếu không chắc.
          </p>

          @if (last(); as s) {
            <div class="result">
              <mat-icon>check_circle</mat-icon>
              <span>
                Đã cấp gói <strong>{{ s.tierCode }}</strong> tới
                <strong>{{ s.expiresAt | date: 'short' }}</strong
                >. Mã kỳ hạn: <code>{{ s.id }}</code>
              </span>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .form {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .f-owner {
        width: 140px;
      }
      .f-id {
        width: 320px;
      }
      .f-plan {
        width: 300px;
      }
      .f-days {
        width: 130px;
      }
      .warn {
        margin-top: 4px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .result {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
        font-size: 14px;
      }
      code {
        font-size: 12px;
      }
      .spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class GrantSubscription implements OnInit {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  protected readonly OwnerType = OwnerType;

  readonly submitting = signal(false);
  readonly last = signal<SubscriptionResponse | null>(null);
  readonly plans = signal<PlanResponse[]>([]);

  ownerType: OwnerType = OwnerType.User;
  ownerId = '';
  planId = '';
  durationDays: number | null = 30;

  /**
   * Chỉ gói ĐANG BÁN và ĐÚNG catalog của loại ví: ví cá nhân ↔ B2C, ví tổ chức ↔ B2B. Backend từ
   * chối cấp chéo, nên lọc ở đây là để admin không chọn được thứ chắc chắn hỏng — không phải lớp
   * bảo vệ (lớp đó nằm ở DB).
   *
   * ⚠ CỐ Ý là hàm thường, KHÔNG phải `computed()`: nó phụ thuộc `ownerType` — một field thường do
   * `[(ngModel)]` ghi, không phải signal. `computed()` chỉ vô hiệu hoá cache khi một SIGNAL nó đọc
   * đổi, nên đổi loại ví sẽ không làm nó tính lại: danh sách đứng im ở catalog cũ, admin chọn một
   * gói sai catalog rồi ăn 400 từ máy chủ mà không hiểu vì sao. Danh sách chỉ vài gói nên tính lại
   * mỗi vòng kiểm tra thay đổi là rẻ.
   */
  eligiblePlans(): PlanResponse[] {
    const want = this.ownerType === OwnerType.Org ? PlanAudience.B2B : PlanAudience.B2C;
    return this.plans().filter((p) => p.isActive && p.audience === want);
  }

  private attemptKey: string | null = null;
  private attemptFor: string | null = null;

  ngOnInit(): void {
    this.api.plans().subscribe({
      next: (list) => this.plans.set(list),
      error: (e: HttpErrorResponse) =>
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được catalog gói.'),
    });
  }

  /**
   * Khoá idempotency cho khoản cấp đang mô tả bởi `fingerprint`.
   *
   * Giữ NGUYÊN khoá khi admin bấm lại đúng khoản đó (retry sau lỗi ⇒ backend replay, không cấp
   * thêm kỳ hạn); sinh khoá MỚI khi nội dung đổi — nếu không, backend replay kỳ hạn cũ và bỏ qua
   * gói/số ngày mới trong im lặng vì nó chỉ khớp theo ví + khoá.
   */
  private idempotencyKeyFor(fingerprint: string): string {
    if (this.attemptKey === null || this.attemptFor !== fingerprint) {
      this.attemptKey = crypto.randomUUID();
      this.attemptFor = fingerprint;
    }
    return this.attemptKey;
  }

  submit(): void {
    // Lớp 1: chặn double-click trong cùng một lần bấm (khoá idempotency lo ca retry).
    if (this.submitting()) return;

    const ownerId = this.ownerId.trim();
    if (!ownerId) {
      this.notify.warn('Hãy nhập id ví cần cấp thuê bao.');
      return;
    }
    if (!this.planId) {
      this.notify.warn('Hãy chọn gói thuê bao.');
      return;
    }
    if (this.durationDays == null || this.durationDays < 1) {
      this.notify.warn('Số ngày phải lớn hơn 0.');
      return;
    }

    const idempotencyKey = this.idempotencyKeyFor(
      `${this.ownerType}|${ownerId}|${this.planId}|${this.durationDays}`,
    );

    this.submitting.set(true);
    this.api
      .grantSubscription({
        ownerType: this.ownerType,
        ownerId,
        planId: this.planId,
        durationDays: this.durationDays,
        idempotencyKey,
      })
      .subscribe({
        next: (s) => {
          this.submitting.set(false);
          this.last.set(s);
          this.notify.success(`Đã cấp gói ${s.tierCode}.`);
          // Khoản này xong → khoá cũ hết vai trò. Giữ lại sẽ khiến lần cấp kế cho CÙNG ví với cùng
          // nội dung bị backend replay thành kỳ hạn cũ (admin tưởng đã cấp hai lần).
          this.attemptKey = null;
          this.attemptFor = null;
          this.ownerId = '';
        },
        error: (e: HttpErrorResponse) => {
          this.submitting.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không cấp được thuê bao.');
          // CỐ Ý giữ `attemptKey`: lỗi mạng/5xx không cho biết backend đã commit hay chưa, nên lần
          // bấm lại phải mang ĐÚNG khoá cũ để backend replay thay vì cấp thêm một kỳ hạn nữa.
        },
      });
  }
}
