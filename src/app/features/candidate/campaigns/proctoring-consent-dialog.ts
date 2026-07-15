import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

/**
 * Hộp thoại xin đồng ý giám sát (SEC-5) — hiện 1 lần TRƯỚC khi bật webcam/listener.
 * Đóng với `true` (đồng ý) hoặc `false` (từ chối → không thể tiếp tục bài thi giám sát).
 */
@Component({
  selector: 'app-proctoring-consent-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatListModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-ico">shield</mat-icon> Bài phỏng vấn có giám sát
    </h2>
    <mat-dialog-content>
      <p>
        Đây là bài phỏng vấn tuyển dụng có giám sát chống gian lận. Khi bắt đầu, hệ thống sẽ ghi nhận
        các tín hiệu sau và gửi cho nhà tuyển dụng xem xét (chỉ là cảnh báo, không tự động hủy bài):
      </p>
      <mat-list role="list">
        <mat-list-item role="listitem">
          <mat-icon matListItemIcon>videocam</mat-icon>
          <span matListItemTitle>Camera</span>
          <span matListItemLine>Chụp ảnh khuôn mặt để đối chiếu danh tính trong lúc thi.</span>
        </mat-list-item>
        <mat-list-item role="listitem">
          <mat-icon matListItemIcon>tab</mat-icon>
          <span matListItemTitle>Chuyển tab / thoát cửa sổ</span>
          <span matListItemLine>Ghi nhận khi bạn rời khỏi trang thi.</span>
        </mat-list-item>
        <mat-list-item role="listitem">
          <mat-icon matListItemIcon>content_paste</mat-icon>
          <span matListItemTitle>Dán nội dung</span>
          <span matListItemLine>Ghi nhận thao tác dán vào trang thi.</span>
        </mat-list-item>
      </mat-list>
      <p class="muted">
        Nếu bạn từ chối, bạn sẽ không thể tiếp tục bài phỏng vấn giám sát này.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false">Từ chối</button>
      <button matButton="filled" color="primary" [mat-dialog-close]="true">
        <mat-icon>check</mat-icon> Đồng ý & bắt đầu
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
    `,
  ],
})
export class ProctoringConsentDialog {}
