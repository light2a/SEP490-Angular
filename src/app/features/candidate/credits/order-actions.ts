import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { OrderResponse } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { OrderDetailDialog, OrderDetailDialogData } from './order-detail-dialog';
import { VndPipe } from '../../../shared/pipes';

/**
 * Hành động dùng chung trên một đơn (xem chi tiết / xác nhận huỷ), cho **cả hai** danh sách đơn
 * Candidate và Employer.
 *
 * Có mặt để lời cảnh báo lúc huỷ đơn chỉ được viết MỘT chỗ — hai màn tự viết hai hộp thoại thì
 * chúng sẽ lệch nhau, mà đây đúng là chỗ không được lệch (huỷ đơn là hành động không đảo được:
 * trạng thái terminal của đơn là bất biến, PAY-10).
 *
 * ⚠ Vị trí file: vòng này worker chỉ được sửa `features/*/credits/**` nên helper dùng chung tạm
 * nằm ở đây; dời sang `shared/` khi gộp là an toàn.
 */
@Injectable({ providedIn: 'root' })
export class OrderActions {
  private dialog = inject(MatDialog);
  private vnd = new VndPipe();

  /** Mở hộp thoại chi tiết đơn (tự gọi `GET /payment/order/{id}`). */
  openDetail(orderId: string): void {
    this.dialog.open(OrderDetailDialog, {
      data: { orderId } satisfies OrderDetailDialogData,
      width: '460px',
    });
  }

  /** Hỏi xác nhận trước khi huỷ đơn. Phát `true` khi người dùng đồng ý. */
  confirmCancel(order: OrderResponse): Observable<boolean> {
    const data: ConfirmDialogData = {
      title: 'Huỷ đơn này?',
      message: `Đơn ${this.vnd.transform(order.amountVnd)} đang chờ thanh toán sẽ bị huỷ.`,
      bullets: [
        'Link thanh toán PayOS của đơn sẽ không dùng được nữa.',
        'Đơn đã huỷ không mở lại được — muốn mua tiếp thì tạo đơn mới.',
        'Nếu bạn ĐÃ chuyển tiền cho đơn này, hãy bấm "Kiểm tra" trước thay vì huỷ.',
      ],
      confirmLabel: 'Huỷ đơn',
      cancelLabel: 'Giữ đơn',
      danger: true,
    };
    return this.dialog
      .open(ConfirmDialog, { data, width: '460px' })
      .afterClosed()
      .pipe(map((ok) => ok === true));
  }
}
