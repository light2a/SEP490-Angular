import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { CvVsAnswerReport } from '../../../core/models';

/**
 * BC8 — đối chiếu CV ↔ câu trả lời.
 *
 * BE dựng read-time bằng cách giao "tiêu chí cần cải thiện của buổi này" với "điểm mạnh ghi trong
 * CV" (so khớp TỪ KHOÁ, không dùng AI). Vì thế câu chữ phải nói rõ đây là so với chính CV người
 * dùng khai, không phải một chuẩn bên ngoài: khớp từ khoá có thể trùng nhầm, mà "bạn yếu ở X"
 * nghe nặng hơn hẳn "CV khai X nhưng phần trả lời chưa thể hiện được".
 *
 * Tách component riêng theo tiền lệ `DeliveryMetricsPanel` — khối tự chứa, và style của trang
 * luyện vốn đã sát trần ngân sách.
 */
@Component({
  selector: 'app-cv-vs-answer-panel',
  imports: [DecimalPipe, MatIconModule, MatChipsModule],
  template: `
    @if (report(); as cva) {
      <div class="wrap" data-testid="cv-vs-answer">
        <h3>CV nói gì so với câu trả lời</h3>
        <p class="note">
          <mat-icon>info</mat-icon>
          Đối chiếu với chính CV bạn đính kèm buổi này (so khớp từ khoá, không phải AI).
        </p>

        @if (cva.gaps.length) {
          <h4>CV có nhắc, nhưng phần trả lời chưa thể hiện được</h4>
          @for (g of cva.gaps; track g.criterionId) {
            <div class="gap">
              <div class="gap-top">
                <span>{{ g.criterionName }}</span>
                <b>{{ g.percentage | number: '1.0-0' }}%</b>
              </div>
              @if (g.cvEvidence.length) {
                <ul class="quotes">
                  @for (ev of g.cvEvidence; track ev) {
                    <li>“{{ ev }}”</li>
                  }
                </ul>
              } @else {
                <p class="muted">Không trích được đoạn CV tương ứng.</p>
              }
            </div>
          }
        } @else {
          <p class="ok">
            <mat-icon>check_circle</mat-icon>
            Không có điểm mạnh nào trong CV bị hụt ở buổi này.
          </p>
        }

        @if (cva.cvStrengths.length) {
          <h4>Điểm mạnh đọc được từ CV</h4>
          <mat-chip-set>
            @for (s of cva.cvStrengths; track s) {
              <mat-chip>{{ s }}</mat-chip>
            }
          </mat-chip-set>
        }
      </div>
    }
  `,
  styles: [
    `
      .wrap {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .note,
      .ok {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
        margin: 0 0 10px;
      }
      .ok {
        font-size: 14px;
        align-items: center;
      }
      .note mat-icon,
      .ok mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .gap {
        margin: 8px 0;
      }
      .gap-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .quotes {
        margin: 2px 0 0;
        padding-left: 1.1rem;
      }
      .quotes,
      .muted {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .muted {
        margin: 4px 0 0;
      }
    `,
  ],
})
export class CvVsAnswerPanel {
  /** Nguồn thô từ `result.cvVsAnswer`; `null` khi buổi không gắn CV. */
  readonly source = input<CvVsAnswerReport | null>(null);

  /**
   * `null` khi KHÔNG có gì để nói (không có CV, hoặc cả hai mảng đều rỗng) ⇒ cả khối biến mất.
   * Bày một mục trống thì người đọc phải tự đoán vì sao nó trống.
   */
  readonly report = computed(() => {
    const cva = this.source();
    if (!cva) return null;
    const gaps = cva.gaps ?? [];
    const cvStrengths = cva.cvStrengths ?? [];
    if (!gaps.length && !cvStrengths.length) return null;
    return { gaps, cvStrengths };
  });
}
