import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Trang PayOS redirect về: /employer/payment/success | /employer/payment/cancel */
@Component({
  selector: 'app-employer-payment-return',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-icon [class.ok]="success()" [class.no]="!success()">
        {{ success() ? 'check_circle' : 'cancel' }}
      </mat-icon>
      <h1>{{ success() ? 'Thanh toán thành công' : 'Thanh toán đã huỷ' }}</h1>
      <p>
        {{
          success()
            ? 'Credit sẽ được cộng vào tổ chức sau khi hệ thống xác nhận từ PayOS. Bấm "Kiểm tra" ở danh sách đơn nếu chưa thấy.'
            : 'Bạn có thể thử lại bất cứ lúc nào.'
        }}
      </p>
      <button mat-flat-button color="primary" routerLink="/employer/credits">
        <mat-icon>arrow_back</mat-icon> Về trang Credit
      </button>
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 420px;
        margin: 48px auto;
        text-align: center;
      }
      mat-icon {
        font-size: 64px;
        height: 64px;
        width: 64px;
      }
      mat-icon.ok {
        color: #2e7d32;
      }
      mat-icon.no {
        color: var(--mat-sys-error);
      }
      p {
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class EmployerPaymentReturn {
  readonly result = input<string>('success');
  readonly success = computed(() => this.result() === 'success');
}
