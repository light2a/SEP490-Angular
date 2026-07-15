import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-spinner',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="wrap">
      <mat-spinner [diameter]="diameter()" />
      @if (message()) {
        <p>{{ message() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 32px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class Spinner {
  diameter = input(40);
  message = input<string | null>(null);
}
