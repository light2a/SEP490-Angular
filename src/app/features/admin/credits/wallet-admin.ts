import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CREDIT_REASON_LABEL,
  CreditAccountResponse,
  CreditTransactionResponse,
  OwnerType,
  PaymentMode,
  StrandedCreditsConflictBody,
} from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Tra cứu ví BẤT KỲ + duyệt chế độ thanh toán (Admin).
 *
 * Hai việc đứng chung một màn vì chúng là một quy trình: muốn duyệt Postpaid cho một tổ chức thì
 * phải nhìn số dư và sổ cái của chính ví đó trước. Trước khi có màn này, bật Postpaid **chỉ làm
 * được bằng `UPDATE` SQL tay** — tức bỏ qua bước PlatformAdmin duyệt mà PAY-3 yêu cầu.
 *
 * ⚠ Ví chưa tồn tại trả 200 với toàn số 0 (không phải 404) — "chưa có ví" là sự thật hợp lệ về chủ
 * ví đó. Nhưng đổi chế độ thanh toán trên ví chưa tồn tại thì backend trả 404: endpoint duyệt cố ý
 * KHÔNG tự tạo ví.
 */
@Component({
  selector: 'app-wallet-admin',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Ví &amp; chế độ thanh toán</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="form" (ngSubmit)="load()">
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

            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              <mat-icon>search</mat-icon>
              Tra cứu
            </button>
          </form>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tra cứu ví..." />
          } @else if (account(); as a) {
            <div class="balances">
              <div class="bal">
                <span class="lbl">Còn lại</span>
                <strong>{{ a.remainingCredits }}</strong>
              </div>
              <div class="bal">
                <span class="lbl">Đang giữ</span>
                <strong>{{ a.reservedCredits }}</strong>
              </div>
              <div class="bal">
                <span class="lbl">Chế độ</span>
                <strong>{{ a.paymentMode === PaymentMode.Postpaid ? 'Trả sau' : 'Trả trước' }}</strong>
              </div>
              @if (a.creditLimit != null) {
                <div class="bal">
                  <span class="lbl">Hạn mức</span>
                  <strong>{{ a.creditLimit }}</strong>
                </div>
              }
              @if (a.periodUsage != null) {
                <div class="bal">
                  <span class="lbl">Dùng trong kỳ</span>
                  <strong>{{ a.periodUsage }}</strong>
                </div>
              }
              <div class="bal">
                <span class="lbl">Đã tặng</span>
                <strong>{{ a.freeCreditsGranted }}</strong>
              </div>
            </div>

            @if (isEmptyWallet(a)) {
              <p class="warn">
                <mat-icon inline>info</mat-icon>
                Chủ ví này <strong>chưa có ví</strong> (máy chủ trả ví rỗng thay vì báo lỗi). Chưa
                đổi được chế độ thanh toán và chưa cấp được thuê bao cho tới khi ví được tạo.
              </p>
            }

            <!-- ── Duyệt chế độ thanh toán ─────────────────────────────────── -->
            <h3 class="sec">Đổi chế độ thanh toán</h3>
            @if (ownerType === OwnerType.User) {
              <p class="warn">
                <mat-icon inline>lock</mat-icon>
                Ví cá nhân (B2C) <strong>luôn trả trước</strong> — không có đường đổi (D15).
              </p>
            } @else {
              <form class="form" (ngSubmit)="applyMode()">
                <mat-form-field appearance="outline" class="f-owner">
                  <mat-label>Chế độ</mat-label>
                  <mat-select [(ngModel)]="mode" name="mode">
                    <mat-option [value]="PaymentMode.Prepaid">Trả trước</mat-option>
                    <mat-option [value]="PaymentMode.Postpaid">Trả sau</mat-option>
                  </mat-select>
                </mat-form-field>

                @if (mode === PaymentMode.Postpaid) {
                  <mat-form-field appearance="outline" class="f-limit">
                    <mat-label>Hạn mức *</mat-label>
                    <input matInput type="number" min="1" max="100000" [(ngModel)]="creditLimit" name="creditLimit" />
                    <mat-hint>Bắt buộc &gt; 0 với trả sau.</mat-hint>
                  </mat-form-field>
                }

                <mat-form-field appearance="outline" class="f-note">
                  <mat-label>Lý do duyệt *</mat-label>
                  <input
                    matInput
                    maxlength="500"
                    [(ngModel)]="note"
                    name="note"
                    placeholder="Ví dụ: hợp đồng trả sau ký ngày 01/08"
                  />
                </mat-form-field>

                <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
                  @if (saving()) {
                    <mat-icon class="spin">progress_activity</mat-icon>
                  } @else {
                    <mat-icon>swap_horiz</mat-icon>
                  }
                  {{ saving() ? 'Đang lưu...' : 'Áp dụng' }}
                </button>
              </form>
            }

            <!-- ── Sổ cái ví ───────────────────────────────────────────────── -->
            <h3 class="sec">Sổ biến động credit</h3>
            @if (txLoading()) {
              <app-spinner [diameter]="28" message="Đang tải sổ cái..." />
            } @else if (!tx().length) {
              <app-empty-state icon="receipt" message="Ví này chưa có biến động nào." />
            } @else {
              <div class="tbl-wrap">
                <table mat-table [dataSource]="tx()" class="tbl">
                  <ng-container matColumnDef="createdAt">
                    <th mat-header-cell *matHeaderCellDef>Thời điểm</th>
                    <td mat-cell *matCellDef="let t">{{ t.createdAt | date: 'short' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="delta">
                    <th mat-header-cell *matHeaderCellDef>Thay đổi</th>
                    <td mat-cell *matCellDef="let t">
                      <strong [class.plus]="t.delta > 0" [class.minus]="t.delta < 0">
                        {{ t.delta > 0 ? '+' : '' }}{{ t.delta }}
                      </strong>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="reason">
                    <th mat-header-cell *matHeaderCellDef>Lý do</th>
                    <td mat-cell *matCellDef="let t">{{ reasonLabel(t.reason) }}</td>
                  </ng-container>
                  <ng-container matColumnDef="grantedBy">
                    <th mat-header-cell *matHeaderCellDef>Người cấp</th>
                    <td mat-cell *matCellDef="let t">
                      <code class="muted">{{ t.grantedBy ? short(t.grantedBy) : '—' }}</code>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="note">
                    <th mat-header-cell *matHeaderCellDef>Ghi chú</th>
                    <td mat-cell *matCellDef="let t">{{ t.note || '—' }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="txCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: txCols"></tr>
                </table>
              </div>
              @if (nextCursor()) {
                <button mat-stroked-button class="more" (click)="loadMore()" [disabled]="txLoading()">
                  <mat-icon>expand_more</mat-icon>
                  Tải thêm
                </button>
              }
            }
          } @else {
            <app-empty-state
              icon="account_balance_wallet"
              message="Nhập id chủ ví rồi bấm Tra cứu."
            />
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
      .form {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .f-owner {
        width: 140px;
      }
      .f-id {
        width: 320px;
      }
      .f-limit {
        width: 160px;
      }
      .f-note {
        width: 340px;
      }
      .sec {
        margin: 20px 0 8px;
        font-size: 15px;
        font-weight: 500;
      }
      .balances {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 8px 0;
      }
      .bal {
        display: flex;
        flex-direction: column;
        min-width: 110px;
        padding: 8px 14px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .bal .lbl {
        font-size: 12px;
      }
      .bal strong {
        font-size: 18px;
      }
      .warn {
        margin: 8px 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .tbl-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .tbl {
        width: 100%;
        min-width: 720px;
      }
      code {
        font-size: 12px;
      }
      code.muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .plus {
        color: var(--mat-sys-primary);
      }
      .minus {
        color: var(--mat-sys-error);
      }
      .more {
        margin-top: 10px;
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
export class WalletAdmin {
  private api = inject(AdminApi);
  private notify = inject(NotifyService);

  protected readonly OwnerType = OwnerType;
  protected readonly PaymentMode = PaymentMode;

  readonly txCols = ['createdAt', 'delta', 'reason', 'grantedBy', 'note'];

  readonly account = signal<CreditAccountResponse | null>(null);
  readonly tx = signal<CreditTransactionResponse[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly txLoading = signal(false);
  readonly saving = signal(false);

  ownerType: OwnerType = OwnerType.Org;
  ownerId = '';

  mode: PaymentMode = PaymentMode.Prepaid;
  creditLimit: number | null = null;
  note = '';

  /** Ví đang hiển thị — chốt lại lúc tra cứu để thao tác sau không bám vào ô nhập đang bị sửa dở. */
  private loaded: { ownerType: OwnerType; ownerId: string } | null = null;

  reasonLabel(r: number): string {
    return CREDIT_REASON_LABEL[r] ?? String(r);
  }

  short(id: string): string {
    return id ? id.slice(0, 8) : '—';
  }

  /**
   * Ví chưa tồn tại — backend trả 200 toàn số 0 thay vì 404, nên phải suy ra. `updatedAt` rỗng là
   * dấu hiệu chắc hơn số dư 0 (ví thật tiêu hết credit cũng có số dư 0).
   */
  isEmptyWallet(a: CreditAccountResponse): boolean {
    return !a.updatedAt;
  }

  load(): void {
    const ownerId = this.ownerId.trim();
    if (!ownerId) {
      this.notify.warn('Hãy nhập id chủ ví.');
      return;
    }
    const ownerType = this.ownerType;
    this.loading.set(true);
    this.api.walletAccount(ownerType, ownerId).subscribe({
      next: (a) => {
        this.loading.set(false);
        this.account.set(a);
        this.loaded = { ownerType, ownerId };
        // Form đổi chế độ khởi tạo theo trạng thái THẬT của ví, để "áp dụng" không vô tình
        // đổi mode chỉ vì ô select đang giữ giá trị mặc định cũ.
        this.mode = a.paymentMode;
        this.creditLimit = a.creditLimit ?? null;
        this.loadTransactions(true);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.account.set(null);
        this.loaded = null;
        this.notify.error(extractErrorMessage(e) ?? 'Không tra cứu được ví.');
      },
    });
  }

  loadMore(): void {
    this.loadTransactions(false);
  }

  private loadTransactions(reset: boolean): void {
    if (!this.loaded) return;
    const { ownerType, ownerId } = this.loaded;
    if (reset) {
      this.tx.set([]);
      this.nextCursor.set(null);
    }
    this.txLoading.set(true);
    this.api
      .walletTransactions(ownerType, ownerId, { cursor: reset ? null : this.nextCursor() })
      .subscribe({
        next: (page) => {
          this.txLoading.set(false);
          this.tx.update((cur) => (reset ? page.items : [...cur, ...page.items]));
          this.nextCursor.set(page.nextCursor);
        },
        error: (e: HttpErrorResponse) => {
          this.txLoading.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không tải được sổ cái ví.');
        },
      });
  }

  /**
   * Duyệt/đổi chế độ thanh toán.
   *
   * ⚠ Mọi guard của backend đều trả `message` nói rõ vì sao (ví User · hạn mức sai combo · tier
   * không đủ điều kiện · chưa có ví · credit sẽ mắc kẹt · còn nợ · vừa bị đổi). Ta HIỆN NGUYÊN
   * message đó — thay bằng câu chung chung là xoá đúng thông tin admin cần để xử lý.
   *
   * Riêng 409 "credit sẽ mắc kẹt" là câu hỏi chứ không phải lỗi: nhận ra bằng SỰ CÓ MẶT của hai
   * con số (409 còn dùng cho ca khác vốn chỉ có `message`), rồi hỏi lại để admin xác nhận lần hai
   * bằng `allowStrandedCredits` — mẫu `allowPartialClawback` của F18.
   */
  applyMode(allowStranded = false): void {
    if (this.saving()) return;
    if (!this.loaded) return;

    const note = this.note.trim();
    if (note.length < 3) {
      this.notify.warn('Lý do duyệt phải có ít nhất 3 ký tự (lưu vào sổ kiểm toán).');
      return;
    }
    if (this.mode === PaymentMode.Postpaid && (this.creditLimit == null || this.creditLimit < 1)) {
      this.notify.warn('Trả sau bắt buộc hạn mức lớn hơn 0.');
      return;
    }

    this.saving.set(true);
    this.api
      .setPaymentMode({
        ownerType: this.loaded.ownerType,
        ownerId: this.loaded.ownerId,
        paymentMode: this.mode,
        // Prepaid mà gửi kèm hạn mức → 400: phải bỏ trống, không phải gửi 0.
        creditLimit: this.mode === PaymentMode.Postpaid ? this.creditLimit : null,
        note,
        allowStrandedCredits: allowStranded,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.notify.success(
            r.paymentMode === PaymentMode.Postpaid
              ? `Đã chuyển sang trả sau (hạn mức ${r.creditLimit}).`
              : 'Đã chuyển sang trả trước.',
          );
          this.note = '';
          this.load();
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          const body = e.error as StrandedCreditsConflictBody | undefined;
          if (e.status === 409 && typeof body?.remainingCredits === 'number' && !allowStranded) {
            const remaining = body.remainingCredits ?? 0;
            const reserved = body.reservedCredits ?? 0;
            if (
              confirm(
                `Ví còn ${remaining} credit khả dụng và ${reserved} credit đang giữ. ` +
                  'Sau khi chuyển sang trả sau, số credit này sẽ KHÔNG dùng được nữa. Vẫn tiếp tục?',
              )
            ) {
              this.applyMode(true);
            }
            return;
          }
          this.notify.error(extractErrorMessage(e) ?? 'Không đổi được chế độ thanh toán.');
        },
      });
  }
}
