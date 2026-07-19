import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { parseMarkdown } from './mini-markdown';

/**
 * Hiển thị Markdown tối giản.
 *
 * 🔴 RÀNG BUỘC BẢO MẬT: component này KHÔNG dùng `innerHTML` và KHÔNG dùng `DomSanitizer`.
 * Nội dung được parse thành cấu trúc rồi render bằng `@switch` + `{{ }}`, nên Angular escape
 * mọi thứ — `<script>` trong nội dung AI sinh ra sẽ hiện thành chữ, không thành thẻ. Ai định
 * "tối ưu" chỗ này bằng `[innerHTML]` xin đọc `mini-markdown.ts` trước; đã có test khoá lại.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [NgTemplateOutlet],
  template: `
    @for (b of blocks(); track $index) {
      @switch (b.type) {
        @case ('heading') {
          <p [class]="'md-h md-h' + b.level">
            <ng-container [ngTemplateOutlet]="spanTpl" [ngTemplateOutletContext]="{ $implicit: b.spans }" />
          </p>
        }
        @case ('list') {
          @if (b.ordered) {
            <ol class="md-list">
              @for (item of b.items; track $index) {
                <li>
                  <ng-container [ngTemplateOutlet]="spanTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
                </li>
              }
            </ol>
          } @else {
            <ul class="md-list">
              @for (item of b.items; track $index) {
                <li>
                  <ng-container [ngTemplateOutlet]="spanTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
                </li>
              }
            </ul>
          }
        }
        @case ('paragraph') {
          <p class="md-p">
            <ng-container [ngTemplateOutlet]="spanTpl" [ngTemplateOutletContext]="{ $implicit: b.spans }" />
          </p>
        }
      }
    }

    <ng-template #spanTpl let-spans>
      @for (s of spans; track $index) {
        @switch (s.type) {
          @case ('bold') {
            <strong>{{ s.text }}</strong>
          }
          @case ('code') {
            <code>{{ s.text }}</code>
          }
          @default {
            {{ s.text }}
          }
        }
      }
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .md-h {
        margin: 12px 0 6px;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .md-h1 {
        font-size: 18px;
      }
      .md-h2 {
        font-size: 16px;
      }
      .md-h3,
      .md-h4,
      .md-h5,
      .md-h6 {
        font-size: 15px;
      }
      .md-p {
        margin: 8px 0;
      }
      .md-list {
        margin: 8px 0;
        padding-left: 22px;
      }
      .md-list li {
        margin: 4px 0;
      }
      code {
        background: var(--mat-sys-surface-container-high);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.92em;
      }
    `,
  ],
})
export class MarkdownView {
  readonly text = input<string | null>(null);
  readonly blocks = computed(() => parseMarkdown(this.text()));
}
