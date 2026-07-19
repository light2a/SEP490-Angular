import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
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
import { GrantCreditResponse, OwnerType } from '../../../core/models';

/**
 * Cấp credit khuyến mãi vào 1 ví (F20, Admin).
 *
 * ⚠ Backend KHÔNG idempotent: gọi hai lần là cấp hai lần, không có khoá trùng nào. Vì vậy
 * việc chặn bấm trùng nằm hoàn toàn ở đây — nút bị khoá ngay khi bấm và chỉ mở lại khi
 * request kết thúc. Đây là phòng thủ MỎNG (không cứu được ca tải lại trang rồi gửi lại,
 * hay hai admin làm cùng lúc); cần chắc chắn thì backend phải có khoá idempotency.
 */
@Component({
  selector: 'app-grant-credits',
  imports: [
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
          <mat-card-title>Cấp credit khuyến mãi</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="hint">
            Cộng thẳng credit vào ví của một người dùng hoặc một tổ chức. Ghi chú là bắt buộc và
            được lưu vào sổ kiểm toán cùng tên người cấp.
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
              <mat-label>{{ ownerType === OwnerType.Org ? 'Id tổ chức' : 'Id người dùng' }} *</mat-label>
              <input matInput [(ngModel)]="ownerId" name="ownerId" placeholder="GUID" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="f-credits">
              <mat-label>Số credit *</mat-label>
              <input matInput type="number" min="1" max="10000" [(ngModel)]="credits" name="credits" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="f-note">
              <mat-label>Ghi chú *</mat-label>
              <input
                matInput
                maxlength="500"
                [(ngModel)]="note"
                name="note"
                placeholder="Ví dụ: bù cho sự cố chấm điểm ngày 18/07"
              />
            </mat-form-field>

            <button mat-flat-button color="primary" type="submit" [disabled]="submitting()">
              @if (submitting()) {
                <mat-icon class="spin">progress_activity</mat-icon>
              } @else {
                <mat-icon>card_giftcard</mat-icon>
              }
              {{ submitting() ? 'Đang cấp...' : 'Cấp credit' }}
            </button>
          </form>

          <p class="warn">
            <mat-icon inline>warning</mat-icon>
            Thao tác này <strong>không chống trùng ở máy chủ</strong>: gửi hai lần là cấp hai lần
            và không có cách hoàn tự động. Hãy kiểm tra kỹ id ví trước khi bấm.
          </p>

          @if (last(); as r) {
            <div class="result">
              <mat-icon>check_circle</mat-icon>
              <span>
                Đã cấp <strong>{{ r.creditsGranted }}</strong> credit. Số dư ví sau khi cấp:
                <strong>{{ r.remainingCredits }}</strong>. Mã bút toán:
                <code>{{ r.transactionId }}</code>
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
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .f-owner {
        width: 140px;
      }
      .f-id {
        width: 320px;
      }
      .f-credits {
        width: 130px;
      }
      .f-note {
        width: 360px;
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
export class GrantCredits {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  readonly OwnerType = OwnerType;

  readonly submitting = signal(false);
  readonly last = signal<GrantCreditResponse | null>(null);

  ownerType: OwnerType = OwnerType.User;
  ownerId = '';
  credits: number | null = null;
  note = '';

  submit(): void {
    // Chặn bấm trùng: đây là lớp bảo vệ DUY NHẤT vì backend không idempotent.
    if (this.submitting()) return;

    const ownerId = this.ownerId.trim();
    const note = this.note.trim();
    if (!ownerId) {
      this.notify.warn('Hãy nhập id ví cần cấp credit.');
      return;
    }
    if (this.credits == null || this.credits < 1 || this.credits > 10000) {
      this.notify.warn('Số credit phải trong khoảng 1–10000.');
      return;
    }
    if (note.length < 3) {
      this.notify.warn('Ghi chú phải có ít nhất 3 ký tự (lưu vào sổ kiểm toán).');
      return;
    }

    this.submitting.set(true);
    this.api
      .grantCredits({ ownerType: this.ownerType, ownerId, credits: this.credits, note })
      .subscribe({
        next: (r) => {
          this.submitting.set(false);
          this.last.set(r);
          this.notify.success(`Đã cấp ${r.creditsGranted} credit.`);
          // Xoá id + ghi chú để lần cấp kế không vô tình lặp lại đúng khoản vừa cấp.
          this.ownerId = '';
          this.note = '';
          this.credits = null;
        },
        error: (e: HttpErrorResponse) => {
          this.submitting.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không cấp được credit.');
        },
      });
  }
}
