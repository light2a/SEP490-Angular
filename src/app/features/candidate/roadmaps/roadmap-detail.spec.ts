import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RoadmapApi } from '../../../core/api/roadmap.api';
import { RoadmapReport, RoadmapResponse } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { RadarChart } from '../../../shared/charts/radar-chart';
import { RoadmapDetail } from './roadmap-detail';

/**
 * Trang báo cáo lộ trình. Hai thứ được khoá ở đây:
 *  1. Radar vẽ ĐỦ trục (F3) — trước đây là dãy thanh ngang, không đọc được hình dạng năng lực.
 *  2. Lý thuyết bài học hiện Markdown ĐÃ RENDER (F6b) — trước đây `#`/`**` lọt ra màn hình.
 */
describe('RoadmapDetail', () => {
  let api: {
    get: ReturnType<typeof vi.fn>;
    report: ReturnType<typeof vi.fn>;
    lesson: ReturnType<typeof vi.fn>;
    startLesson: ReturnType<typeof vi.fn>;
  };

  const roadmap = (): RoadmapResponse =>
    ({
      id: 'r1',
      jobCategory: 'BE',
      level: 'Junior',
      status: 'Active',
      milestones: [
        {
          id: 'm1',
          orderNo: 1,
          title: 'Nền tảng',
          status: 'Pending',
          focusCriteria: ['Kiến thức'],
          lessons: [{ id: 'l1', orderNo: 1, title: 'Bài 1', status: 'Theory', theoryContent: null }],
        },
      ],
    }) as unknown as RoadmapResponse;

  const report = (over: Partial<RoadmapReport> = {}): RoadmapReport => ({
    radar: [
      { criterionId: 'c1', name: 'Kiến thức', averageScore: 7, maxScore: 10, percentage: 70, weight: 0.5 },
      { criterionId: 'c2', name: 'Giao tiếp', averageScore: 5, maxScore: 10, percentage: 50, weight: 0.3 },
      { criterionId: 'c3', name: 'Tư duy', averageScore: 9, maxScore: 10, percentage: 90, weight: 0.2 },
    ],
    levelEvaluation: [
      { criterionName: 'Kiến thức', percentage: 70, levelThreshold: 60, passed: true },
      { criterionName: 'Giao tiếp', percentage: 50, levelThreshold: 60, passed: false },
    ],
    strengths: [],
    weaknesses: [],
    improvements: [],
    overallComment: null,
    ...over,
  });

  beforeEach(() => {
    api = {
      get: vi.fn().mockReturnValue(of(roadmap())),
      report: vi.fn().mockReturnValue(of(report())),
      lesson: vi.fn().mockReturnValue(of({ id: 'l1', theoryContent: null })),
      startLesson: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [RoadmapDetail],
      providers: [
        provideRouter([]),
        { provide: RoadmapApi, useValue: api },
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(RoadmapDetail);
    fixture.componentRef.setInput('id', 'r1');
    fixture.detectChanges();
    return fixture;
  }

  /**
   * ECharts nạp bằng `await import(...)` nên biểu đồ xuất hiện SAU vài trăm ms (vitest phải
   * biên dịch chunk lazy lúc chạy). Đợi cứng bằng `setTimeout` là mầm test lúc xanh lúc đỏ →
   * poll cho tới khi SVG có mặt, có trần thời gian.
   */
  async function renderAndWaitSvg(timeoutMs = 8000) {
    const fixture = render();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
      if (fixture.nativeElement.querySelector('app-radar-chart svg')) break;
    }
    return fixture;
  }

  describe('F3 — radar', () => {
    it('vẽ SVG với đủ nhãn của mọi tiêu chí', async () => {
      const fixture = await renderAndWaitSvg();

      const svg = fixture.nativeElement.querySelector('app-radar-chart svg') as SVGElement | null;
      expect(svg).not.toBeNull();

      const labels = [...svg!.querySelectorAll('text')].map((t) => t.textContent?.trim());
      for (const name of ['Kiến thức', 'Giao tiếp', 'Tư duy']) {
        expect(labels).toContain(name);
      }
    }, 15000);

    it('N tiêu chí → radar nhận đúng N trục, ngưỡng khớp theo tên', () => {
      const fixture = render();

      const points = fixture.componentInstance.radarPoints();
      expect(points.length).toBe(3);
      expect(points.map((p) => p.name)).toEqual(['Kiến thức', 'Giao tiếp', 'Tư duy']);
      expect(points.map((p) => p.threshold)).toEqual([60, 60, null]);
    });

    it('radar rỗng → KHÔNG render biểu đồ', () => {
      api.report.mockReturnValue(of(report({ radar: [], levelEvaluation: [] })));

      const fixture = render();

      expect(fixture.nativeElement.querySelector('app-radar-chart')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Năng lực theo tiêu chí');
    });

    it('nạp thư viện hỏng → rơi về thanh ngang, không để trang trắng', () => {
      const fixture = render();

      // Mô phỏng lazy-import thất bại (chunk 404 / mạng hỏng).
      fixture.debugElement.query(By.directive(RadarChart)).componentInstance.failed.set(true);
      fixture.detectChanges();

      const bars = fixture.nativeElement.querySelectorAll('app-radar-chart .fallback .crit');
      expect(bars.length).toBe(3);
      expect(fixture.nativeElement.textContent).toContain('Kiến thức');
    });
  });

});
