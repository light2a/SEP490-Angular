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
 * Q14 — chống cấp trùng có HAI lớp:
 * 1. Khoá nút khi đang gửi (chặn double-click trong cùng một lần bấm).
 * 2. `idempotencyKey` gửi kèm request — backend khớp theo `(ownerType, ownerId, key)` và replay
 *    đúng response lần cấp đầu, nên retry sau lỗi mạng/5xx KHÔNG cấp thêm lần nữa.
 *
 * ⚠ Khoá phải sinh MỘT LẦN cho mỗi khoản cấp và GIỮ QUA RETRY — sinh khoá mới mỗi lần bấm là vô
 * hiệu hoá đúng cái vừa xây. Ngược lại, backend KHÔNG xét `credits`/`note` khi khớp khoá, nên dùng
 * lại khoá cũ sau khi admin sửa số credit sẽ khiến backend replay khoản CŨ và bỏ qua số mới trong
 * im lặng. Vì thế khoá được neo vào nội dung form (xem {@link GrantCredits.idempotencyKeyFor}).
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
            Máy chủ chống cấp trùng cho <strong>cùng một khoản</strong>: bấm lại sau lỗi mạng sẽ
            không cấp thêm lần nữa. Nhưng cấp cho <strong>sai ví</strong> thì không có cách hoàn tự
            động — hãy kiểm tra kỹ id ví trước khi bấm.
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

  /** Khoá idempotency của LẦN CẤP đang thực hiện; null = chưa có lần cấp nào đang dở. */
  private attemptKey: string | null = null;
  /** Nội dung form mà `attemptKey` được sinh ra cho — đổi nội dung ⇒ phải sinh khoá mới. */
  private attemptFor: string | null = null;

  /**
   * Trả khoá idempotency cho khoản cấp đang mô tả bởi `fingerprint`.
   *
   * Giữ NGUYÊN khoá khi admin bấm lại đúng khoản đó (retry sau lỗi ⇒ backend replay, không cấp
   * thêm); sinh khoá MỚI khi nội dung đổi (nếu không, backend replay khoản cũ và bỏ qua số credit
   * mới trong im lặng vì nó chỉ khớp theo ví + khoá).
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

    // Neo khoá vào các giá trị THẬT SỰ được gửi (đã trim) — sửa khoảng trắng không đổi request
    // nên cũng không được đổi khoá, còn đổi ví/số credit/ghi chú thì phải là một khoản cấp khác.
    const idempotencyKey = this.idempotencyKeyFor(
      `${this.ownerType}|${ownerId}|${this.credits}|${note}`,
    );

    this.submitting.set(true);
    this.api
      .grantCredits({
        ownerType: this.ownerType,
        ownerId,
        credits: this.credits,
        note,
        idempotencyKey,
      })
      .subscribe({
        next: (r) => {
          this.submitting.set(false);
          this.last.set(r);
          this.notify.success(`Đã cấp ${r.creditsGranted} credit.`);
          // Khoản này đã xong → khoá cũ hết vai trò. Giữ lại sẽ khiến lần cấp kế cho CÙNG ví với
          // cùng nội dung bị backend replay thành khoản cũ (admin tưởng đã cấp hai lần).
          this.attemptKey = null;
          this.attemptFor = null;
          // Xoá id + ghi chú để lần cấp kế không vô tình lặp lại đúng khoản vừa cấp.
          this.ownerId = '';
          this.note = '';
          this.credits = null;
        },
        error: (e: HttpErrorResponse) => {
          this.submitting.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không cấp được credit.');
          // CỐ Ý giữ `attemptKey`: lỗi mạng/5xx không cho biết backend đã commit hay chưa, nên lần
          // bấm lại phải mang ĐÚNG khoá cũ để backend replay thay vì cấp thêm. Xoá khoá ở đây là
          // mở lại đúng cửa cấp-hai-lần mà Q14 bịt. Form cũng cố ý không bị xoá.
        },
      });
  }
}
