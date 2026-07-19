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
          lessons: [
            { id: 'l1', orderNo: 1, title: 'Bài 1', status: 'Theory', theoryContent: null, resources: [] },
          ],
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
      lesson: vi.fn().mockReturnValue(of({ id: 'l1', theoryContent: null, resources: [] })),
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

  describe('F6b — markdown lý thuyết', () => {
    /** Mở panel bài học = nạp lý thuyết; trước đây chuỗi Markdown bị đổ thô vào một thẻ <p>. */
    function openLesson(theoryContent: string) {
      api.lesson.mockReturnValue(of({ id: 'l1', theoryContent, resources: [] }));
      const fixture = render();
      fixture.componentInstance.loadTheory({ id: 'l1' } as never);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('app-markdown-view') as HTMLElement;
    }

    it('Markdown thành thẻ thật, không còn lộ ký tự cú pháp ra màn hình', () => {
      const view = openLesson('# Tiêu đề\n\n- Ý một\n- Ý hai\n\nCần **kiên trì** với `git`.');

      expect(view.querySelector('.md-h')?.textContent?.trim()).toBe('Tiêu đề');
      expect(view.querySelectorAll('ul li').length).toBe(2);
      expect(view.querySelector('strong')?.textContent).toBe('kiên trì');
      expect(view.querySelector('code')?.textContent).toBe('git');
      // Dấu cú pháp đã bị nuốt vào cấu trúc — đây chính là bug F6b đi sửa.
      expect(view.textContent).not.toContain('#');
      expect(view.textContent).not.toContain('**');
    });

    // 🔴 RÀNG BUỘC BẢO MẬT: nội dung do LLM sinh không được biến thành thẻ HTML.
    it('thẻ HTML trong lý thuyết hiện thành CHỮ, không thành phần tử', () => {
      const view = openLesson('Ví dụ <script>alert(1)</script> và a < b && c');

      expect(view.querySelector('script')).toBeNull();
      expect(view.textContent).toContain('<script>alert(1)</script>');
      expect(view.textContent).toContain('a < b && c');
    });
  });
  describe('F15 — tài liệu học gợi ý', () => {
    /** Mở panel bài học với danh sách tài liệu cho sẵn. */
    function openWithResources(resources: unknown[]) {
      api.lesson.mockReturnValue(of({ id: 'l1', theoryContent: '# Bài', resources }));
      const fixture = render();
      fixture.componentInstance.loadTheory({ id: 'l1' } as never);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('hiện tên + link cho tài liệu có url', () => {
      const el = openWithResources([
        { title: 'MDN: Event loop', type: 'Doc', publisher: 'Mozilla', url: 'https://developer.mozilla.org/x' },
      ]);

      const link = el.querySelector('[data-testid="lesson-resources"] a') as HTMLAnchorElement;
      expect(link.textContent).toContain('MDN: Event loop');
      expect(link.getAttribute('href')).toBe('https://developer.mozilla.org/x');
      expect(el.textContent).toContain('Mozilla');
    });

    // 🔴 Link do AI gợi ý: người dùng PHẢI thấy nó chưa được kiểm chứng TRƯỚC khi bấm.
    it('luôn kèm cảnh báo "chưa được kiểm chứng" khi có link', () => {
      const el = openWithResources([
        { title: 'MDN', type: 'Doc', publisher: null, url: 'https://developer.mozilla.org/' },
      ]);

      expect(el.querySelector('[data-testid="lesson-resources"]')?.textContent)
        .toContain('chưa được kiểm chứng');
    });

    // 🔑 url null KHÔNG phải dữ liệu hỏng — đó là kết quả bình thường khi BE loại link ngoài
    //    allowlist tên miền. Mục vẫn phải hiện (chỉ tên), không được biến mất.
    it('tài liệu không có url vẫn hiện tên, không render thẻ <a>', () => {
      const el = openWithResources([
        { title: 'Designing Data-Intensive Applications', type: 'Book', publisher: "O'Reilly", url: null },
      ]);

      const box = el.querySelector('[data-testid="lesson-resources"]') as HTMLElement;
      expect(box.textContent).toContain('Designing Data-Intensive Applications');
      expect(box.querySelector('a')).toBeNull();
    });

    it('mở link ở tab mới với rel=noopener (chặn với tới window.opener)', () => {
      const el = openWithResources([
        { title: 'MDN', type: 'Doc', publisher: null, url: 'https://developer.mozilla.org/' },
      ]);

      const link = el.querySelector('[data-testid="lesson-resources"] a') as HTMLAnchorElement;
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('không có tài liệu nào → không hiện mục "Tài liệu tham khảo" trống', () => {
      const el = openWithResources([]);

      expect(el.querySelector('[data-testid="lesson-resources"]')).toBeNull();
      expect(el.textContent).not.toContain('Tài liệu tham khảo');
    });
  });
});
