import { Component, ElementRef, OnDestroy, effect, input, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * Biểu đồ radar (đa giác năng lực) — bọc ECharts sau một lớp mỏng.
 *
 * TẠI SAO lazy-import: toàn bộ ECharts được nạp bằng `await import('echarts/core')` trong
 * `load()`, theo đúng tiền lệ `shared/avatar/avatar-scene.ts` với Three.js. Thư viện nằm ở
 * CHUNK RIÊNG — initial bundle không phình vì một cái biểu đồ chỉ xuất hiện ở trang báo cáo
 * lộ trình, và người không mở trang đó thì không bao giờ tải nó về.
 *
 * TẠI SAO renderer 'svg' (không phải canvas mặc định):
 *  1. jsdom KHÔNG có `canvas.getContext('2d')` (trả `null`) ⇒ mọi thư viện canvas dựng được
 *     đối tượng nhưng không vẽ ra gì, biểu đồ thành thứ không test được. Renderer SVG sinh DOM
 *     thật nên `npm test` kiểm được nhãn/đa giác.
 *  2. SVG nét theo vector, hợp với biểu đồ tĩnh ít điểm dữ liệu như radar.
 *
 * Import lỗi (mạng hỏng / chunk 404) → `failed()` bật → component tự rơi về dãy thanh ngang.
 * Người dùng vẫn đọc được số liệu thay vì nhìn một khoảng trắng.
 */

/** Một trục của radar: tên tiêu chí + phần trăm đạt được + ngưỡng cấp độ (nếu có). */
export interface RadarPoint {
  name: string;
  /** Phần trăm đạt được, thang 0–100. */
  percentage: number;
  /** Ngưỡng cấp độ của tiêu chí này (0–100); null = tiêu chí không có ngưỡng. */
  threshold?: number | null;
}

/** Chiều rộng giả định khi container chưa có kích thước thật (jsdom, hoặc lúc còn ẩn). */
const FALLBACK_WIDTH = 600;

/** Đọc màu từ design token Material; DOM chưa có token (test) → dùng màu dự phòng. */
function token(name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

@Component({
  selector: 'app-radar-chart',
  imports: [DecimalPipe],
  template: `
    @if (points().length) {
      <!--
        Host luôn nằm trong DOM (ECharts cần sẵn phần tử để gắn vào), chỉ ẩn đi khi phải rơi
        về thanh ngang. Nếu bọc trong @if (!failed()) thì lúc init chưa có host → không vẽ được.
      -->
      <div class="radar-host" [class.gone]="failed()" [style.height.px]="height()" #host></div>

      @if (failed()) {
        <div class="fallback">
          @for (p of points(); track p.name) {
            <div class="crit">
              <div class="crit-top">
                <span>{{ p.name }}</span><b>{{ p.percentage | number: '1.0-0' }}%</b>
              </div>
              <div class="bar"><div class="fill" [style.width.%]="p.percentage"></div></div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .radar-host {
        width: 100%;
      }
      .radar-host.gone {
        display: none;
      }
      .crit {
        margin: 10px 0;
      }
      .crit-top {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .bar {
        height: 8px;
        background: var(--mat-sys-surface-container-high);
        border-radius: 4px;
        overflow: hidden;
      }
      .fill {
        height: 100%;
        background: var(--mat-sys-primary);
      }
    `,
  ],
})
export class RadarChart implements OnDestroy {
  readonly points = input.required<RadarPoint[]>();
  readonly height = input(340);
  /** Nhãn của chuỗi dữ liệu chính (hiện ở tooltip). */
  readonly seriesLabel = input('Năng lực');
  /**
   * Nhãn của lớp mốc đối chiếu (đường đứt nét). Mặc định giữ chuỗi cũ để trang báo cáo lộ
   * trình không đổi hành vi.
   *
   * ⚠ Nơi gọi PHẢI truyền đúng nguyên văn nhãn BE trả về. Mốc có thể là trung bình người dùng
   * khác HOẶC ngưỡng đạt nội bộ — hai thứ độ tin cậy rất khác nhau. Tự đặt lại thành một cái
   * tên nghe kêu hơn ("chuẩn ngành") là nói dối người xem về thứ họ đang so mình với.
   */
  readonly thresholdLabel = input('Ngưỡng cấp độ');

  /** Lazy-import hỏng → rơi về thanh ngang. */
  readonly failed = signal(false);

  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  /** Kiểu `unknown` để không kéo type của ECharts vào initial bundle. */
  private chart: { setOption(o: unknown): void; resize(): void; dispose(): void } | null = null;
  private onResize = () => this.chart?.resize();
  /** Chặn nạp chồng: `effect` chạy lại mỗi lần dữ liệu đổi, nhưng chỉ được dựng biểu đồ 1 lần. */
  private loading = false;

  constructor() {
    effect(() => {
      const pts = this.points();
      const el = this.host()?.nativeElement;

      // Biểu đồ đã dựng → chỉ vẽ lại dữ liệu, không dựng lại.
      if (this.chart) {
        this.chart.setOption(this.option(pts));
        return;
      }
      // `#host` chỉ tồn tại khi có dữ liệu (@if trong template) — chờ CD tạo xong rồi mới nạp.
      if (el && pts.length && !this.loading) {
        this.loading = true;
        void this.load(el);
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
    this.chart?.dispose();
    this.chart = null;
  }

  private async load(el: HTMLElement): Promise<void> {
    try {
      const core = await import('echarts/core');
      const { RadarChart: RadarSeries } = await import('echarts/charts');
      const { SVGRenderer } = await import('echarts/renderers');
      const { TooltipComponent, LegendComponent } = await import('echarts/components');
      core.use([RadarSeries, SVGRenderer, TooltipComponent, LegendComponent]);

      this.chart = core.init(el, undefined, {
        renderer: 'svg',
        width: el.clientWidth || FALLBACK_WIDTH,
        height: this.height(),
      });
      this.chart.setOption(this.option(this.points()));
      if (typeof window !== 'undefined') window.addEventListener('resize', this.onResize);
    } catch {
      // Không log ồn: đây là đường suy giảm có chủ ý, người dùng vẫn thấy đủ số liệu.
      this.failed.set(true);
    }
  }

  /** Dựng option ECharts. Tách hàm để `effect` vẽ lại được khi dữ liệu đổi. */
  private option(pts: RadarPoint[]): unknown {
    const primary = token('--mat-sys-primary', '#4f5b92');
    const outline = token('--mat-sys-outline-variant', '#c5c6d0');
    const onSurface = token('--mat-sys-on-surface', '#1b1b21');
    const tertiary = token('--mat-sys-tertiary', '#7c5264');

    const hasThreshold = pts.some((p) => p.threshold != null);

    const series: Record<string, unknown>[] = [
      {
        name: this.seriesLabel(),
        type: 'radar',
        symbolSize: 5,
        lineStyle: { width: 2, color: primary },
        itemStyle: { color: primary },
        areaStyle: { color: primary, opacity: 0.22 },
        data: [{ value: pts.map((p) => Math.round(p.percentage)), name: this.seriesLabel() }],
      },
    ];

    if (hasThreshold) {
      const label = this.thresholdLabel();
      series.push({
        name: label,
        type: 'radar',
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: tertiary },
        itemStyle: { color: tertiary },
        data: [{ value: pts.map((p) => p.threshold ?? 0), name: label }],
      });
    }

    return {
      // Không animation: biểu đồ báo cáo tĩnh, đỡ tốn CPU và đỡ nhấp nháy khi vẽ lại.
      animation: false,
      tooltip: { trigger: 'item' },
      legend: hasThreshold
        ? {
            bottom: 0,
            textStyle: { color: onSurface },
            data: [this.seriesLabel(), this.thresholdLabel()],
          }
        : undefined,
      radar: {
        // max cố định 100: trục là PHẦN TRĂM, để ECharts tự co giãn thì hai lần xem cùng
        // một người lại ra hai hình khác nhau — mất ý nghĩa so sánh.
        indicator: pts.map((p) => ({ name: p.name, max: 100 })),
        radius: '66%',
        axisName: { color: onSurface, fontSize: 12 },
        axisLine: { lineStyle: { color: outline } },
        splitLine: { lineStyle: { color: outline } },
        splitArea: { show: false },
      },
      series,
    };
  }
}
