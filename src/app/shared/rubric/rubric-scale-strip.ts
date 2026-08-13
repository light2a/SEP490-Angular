import { Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CriterionLevelItem } from '../../core/models';

/** 1 điểm vẽ trên thang. `actual` = điểm AI chấm thật; `expected` = mức code chọn trước khi sinh bài. */
export interface ScalePoint {
  value: number;
  /** Nhãn tooltip (thường là tên nhóm bài mẫu). */
  label: string;
  kind: 'actual' | 'expected';
  /** Nhóm bài mẫu — quyết định màu, để đối chiếu được với cột bên dưới. */
  band?: string;
}

/**
 * Hai chấm coi như CHỒNG NHAU khi cách nhau dưới ngần này (theo tỉ lệ của thang). 8% của thang
 * 10 điểm ≈ 0.8 điểm — dưới mức đó thì thước đo không tách được hai bài khác hẳn nhau về chất.
 */
const COLLAPSE_RATIO = 0.08;

/**
 * Ba bài mẫu có bị chấm dồn vào một chỗ không.
 *
 * Đây là **phát hiện quan trọng nhất** của cả màn chấm thử, và nó là chuyện của HÌNH chứ không
 * phải của số: `Δ` (thật − kỳ vọng) bằng 0 mà ba chấm chồng nhau là hỏng NẶNG (thước đo không
 * phân biệt được ai với ai), còn `Δ = ±1` mà ba chấm trải đều lại là khoẻ.
 */
export function actualPointsCollapsed(points: ScalePoint[], maxScore: number): boolean {
  const vals = points.filter((p) => p.kind === 'actual').map((p) => p.value);
  if (vals.length < 2 || !Number.isFinite(maxScore) || maxScore <= 0) return false;
  return Math.max(...vals) - Math.min(...vals) <= maxScore * COLLAPSE_RATIO;
}

/**
 * Thang điểm một tiêu chí: các mốc HR đã khai + (tuỳ chọn) vị trí điểm của các bài mẫu.
 *
 * Dùng lại ở hai chỗ: chi tiết chiến dịch (chỉ mốc, không có chấm nào) và bảng chấm thử (mốc +
 * chấm đặc = điểm thật + vòng rỗng = mức kỳ vọng).
 */
@Component({
  selector: 'app-rubric-scale-strip',
  imports: [MatTooltipModule],
  template: `
    <div class="wrap" [attr.data-testid]="'scale-' + criterionName()">
      @if (criterionName()) {
        <div class="cap">
          <span class="nm">{{ criterionName() }}</span>
          @if (weight() != null) {
            <span class="w">{{ (weight()! * 100).toFixed(0) }}%</span>
          }
        </div>
      }

      @if (levels().length === 0) {
        <p class="no-levels">
          Chưa có mốc điểm — bộ chấm dùng dải mặc định 0–{{ maxScore() }} và không có mô tả nào để
          bám vào.
        </p>
      }

      <svg viewBox="0 0 400 62" class="axis" role="img" [attr.aria-label]="ariaLabel()">
        <!-- trục -->
        <line x1="20" y1="38" x2="380" y2="38" class="rail" />

        @for (l of levels(); track l.score) {
          <line [attr.x1]="x(l.score)" y1="32" [attr.x2]="x(l.score)" y2="44" class="tick" />
          <text [attr.x]="x(l.score)" y="57" class="tick-lbl">{{ l.score }}</text>
        }

        @for (p of points(); track $index) {
          @if (p.kind === 'expected') {
            <circle
              [attr.cx]="x(p.value)"
              cy="20"
              r="5"
              [class]="'pt expected band-' + (p.band ?? 'none')"
            />
          } @else {
            <circle
              [attr.cx]="x(p.value)"
              cy="20"
              r="5"
              [class]="'pt actual band-' + (p.band ?? 'none')"
            />
          }
        }
      </svg>

      @if (collapsed()) {
        <p class="collapse-warn" data-testid="scale-collapsed">
          Ba bài mẫu khác hẳn nhau về chất nhưng nhận điểm gần như bằng nhau ở tiêu chí này —
          <strong>thước đo chưa phân biệt được</strong>. Mô tả các mốc đang quá giống nhau.
        </p>
      }
    </div>
  `,
  styles: [
    `
      .wrap {
        margin-bottom: 10px;
      }
      .cap {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        margin-bottom: 2px;
      }
      .nm {
        font-weight: 600;
      }
      .w {
        color: var(--mat-sys-on-surface-variant);
      }
      .axis {
        width: 100%;
        height: 62px;
        overflow: visible;
      }
      .rail {
        stroke: var(--mat-sys-outline-variant);
        stroke-width: 2;
      }
      .tick {
        stroke: var(--mat-sys-outline);
        stroke-width: 1.5;
      }
      .tick-lbl {
        font-size: 11px;
        text-anchor: middle;
        fill: var(--mat-sys-on-surface-variant);
      }
      .pt {
        stroke-width: 2;
      }
      .pt.expected {
        fill: none;
      }
      .band-Weak {
        stroke: #b26a00;
        fill: #b26a00;
      }
      .band-Good {
        stroke: #1565c0;
        fill: #1565c0;
      }
      .band-Excellent {
        stroke: #2e7d32;
        fill: #2e7d32;
      }
      .band-Custom {
        stroke: #6a1b9a;
        fill: #6a1b9a;
      }
      .pt.expected.band-Weak,
      .pt.expected.band-Good,
      .pt.expected.band-Excellent,
      .pt.expected.band-Custom {
        fill: none;
      }
      .no-levels,
      .collapse-warn {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .collapse-warn {
        padding: 6px 10px;
        border-radius: 6px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class RubricScaleStrip {
  readonly criterionName = input<string>('');
  readonly weight = input<number | null>(null);
  readonly maxScore = input.required<number>();
  readonly levels = input<CriterionLevelItem[]>([]);
  readonly points = input<ScalePoint[]>([]);

  /** Toạ độ x của một điểm trên trục (kẹp trong dải để điểm ngoài thang vẫn vẽ được, không bay mất). */
  x(score: number): number {
    const max = this.maxScore();
    if (!Number.isFinite(max) || max <= 0) return 20;
    const ratio = Math.min(1, Math.max(0, Number(score) / max));
    return 20 + ratio * 360;
  }

  collapsed(): boolean {
    return actualPointsCollapsed(this.points(), this.maxScore());
  }

  ariaLabel(): string {
    const marks = this.levels()
      .map((l) => l.score)
      .join(', ');
    return `Thang điểm ${this.criterionName()}: mốc ${marks || 'chưa đặt'}, tối đa ${this.maxScore()}`;
  }
}
