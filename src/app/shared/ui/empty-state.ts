import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="empty">
      <mat-icon>{{ icon() }}</mat-icon>
      <p>{{ message() }}</p>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;
      }
      mat-icon {
        font-size: 48px;
        height: 48px;
        width: 48px;
        opacity: 0.5;
      }
    `,
  ],
})
export class EmptyState {
  icon = input('inbox');
  message = input('Chưa có dữ liệu');
}
