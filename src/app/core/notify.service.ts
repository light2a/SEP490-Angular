import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Bọc MatSnackBar cho thông báo toàn app. */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private sb = inject(MatSnackBar);

  private open(message: string, panelClass: string): void {
    this.sb.open(message, 'Đóng', {
      duration: 4500,
      panelClass: [panelClass],
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }

  success(m: string): void {
    this.open(m, 'snack-success');
  }
  error(m: string): void {
    this.open(m, 'snack-error');
  }
  warn(m: string): void {
    this.open(m, 'snack-warn');
  }
  info(m: string): void {
    this.open(m, 'snack-info');
  }
}
