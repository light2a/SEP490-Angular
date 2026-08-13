import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { NotifyService } from '../../../core/notify.service';
import { RubricPreviewBand, RubricPreviewRun, RubricPreviewSample } from '../../../core/models';
import { RubricPreviewPanel } from './rubric-preview-panel';
import { actualPointsCollapsed } from './rubric-scale-strip';

/**
 * CHẤM THỬ THƯỚC ĐO — bộ test khoá 4 chỗ mà hỏng thì không có triệu chứng:
 * (a) hạn mức miễn phí đếm cả lượt LỖI ⇒ HR mất lượt vì AI của mình trục trặc;
 * (b) mạng đứt giữa chừng ⇒ vứt luôn kết quả đã chạy xong (và có thể đã trừ credit);
 * (c) ba bài mẫu bị chấm dồn một chỗ ⇒ nhìn bảng số vẫn thấy "có điểm", chỉ HÌNH mới lộ ra;
 * (d) băng cảnh báo về hai giới hạn của bài mẫu bị ẩn đi khi số đẹp.
 */
describe('RubricPreviewPanel — chấm thử thước đo', () => {
  let api: {
    getRubricPreviewRuns: ReturnType<typeof vi.fn>;
    runRubricPreview: ReturnType<typeof vi.fn>;
  };
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: boolean;
  let dialogOpened: number;

  function run(p: Partial<RubricPreviewRun> = {}): RubricPreviewRun {
    return {
      id: 'r-1',
      status: 'Succeeded',
      questionId: 'q-1',
      questionText: 'Giải thích index trong CSDL',
      rubricFingerprint: 'fp-aaa',
      rubricVersion: 1,
      promptVersion: 4,
      deliveryMetricsAvailable: false,
      lengthParityWarning: false,
      billed: false,
      freeRunsRemaining: 2,
      rubric: [
        {
          criterionId: 'c1',
          name: 'Kiến thức chuyên môn',
          weight: 1,
          maxScore: 10,
          levels: [
            { score: 0, descriptor: 'không nêu được khái niệm nào' },
            { score: 6, descriptor: 'nêu đúng khái niệm, thiếu ví dụ' },
            { score: 10, descriptor: 'nêu khái niệm, ví dụ và đánh đổi' },
          ],
        },
      ],
      samples: [
        sample('Weak', 2, 2),
        sample('Good', 6, 6),
        sample('Excellent', 10, 9),
      ],
      errorReason: null,
      createdAt: '2026-08-13T10:00:00Z',
      completedAt: '2026-08-13T10:00:30Z',
      ...p,
    } as RubricPreviewRun;
  }

  function sample(
    band: RubricPreviewBand,
    expected: number,
    actual: number,
  ): RubricPreviewSample {
    return {
      band,
      answerText: `bài ${band}`,
      wordCount: 160,
      expectedWeightedPct: expected * 10,
      actualWeightedPct: actual * 10,
      scores: [
        {
          criterionId: 'c1',
          criterionName: 'Kiến thức chuyên môn',
          maxScore: 10,
          expectedLevel: expected,
          actualScore: actual,
          levelMatched: actual,
          reasoning: 'trích dẫn từ bài',
        },
      ],
    };
  }

  beforeEach(() => {
    dialogResult = true;
    dialogOpened = 0;
    api = {
      getRubricPreviewRuns: vi.fn().mockReturnValue(of([])),
      runRubricPreview: vi.fn().mockReturnValue(of(run())),
    };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: {
            open: () => {
              dialogOpened++;
              return { afterClosed: () => of(dialogResult) };
            },
          },
        },
      ],
    });
  });

  function render(opts: { history?: RubricPreviewRun[]; dirty?: boolean } = {}) {
    api.getRubricPreviewRuns.mockReturnValue(of(opts.history ?? []));
    const fixture = TestBed.createComponent(RubricPreviewPanel);
    fixture.componentRef.setInput('campaignId', 'c-1');
    fixture.componentRef.setInput('questions', [{ id: 'q-1', questionText: 'Câu 1' }]);
    fixture.componentRef.setInput('rubricVersion', 1);
    fixture.componentRef.setInput('formDirty', opts.dirty ?? false);
    fixture.detectChanges();
    return fixture;
  }

  // ── Hạn mức ────────────────────────────────────────────────────────────────
  describe('hạn mức miễn phí', () => {
    it('chỉ đếm lượt Succeeded — lượt Failed/Running KHÔNG ăn hạn mức', () => {
      const cmp = render({
        history: [
          run({ id: 'a', status: 'Succeeded' }),
          run({ id: 'b', status: 'Succeeded' }),
          run({ id: 'c', status: 'Failed' }),
          run({ id: 'd', status: 'Failed' }),
          run({ id: 'e', status: 'Failed' }),
          run({ id: 'f', status: 'Running' }),
        ],
      }).componentInstance;

      expect(cmp.freeLeft()).toBe(1);
      expect(cmp.willBill()).toBe(false);
    });

    it('lượt của phiên bản thước đo KHÁC không ăn hạn mức của phiên bản này', () => {
      const cmp = render({
        history: [
          run({ id: 'a', status: 'Succeeded', rubricVersion: 1 }),
          run({ id: 'b', status: 'Succeeded', rubricVersion: 1 }),
          run({ id: 'c', status: 'Succeeded', rubricVersion: 1 }),
          run({ id: 'd', status: 'Succeeded', rubricVersion: 2 }),
        ],
      }).componentInstance;
      expect(cmp.freeLeft()).toBe(0);

      const cmp2 = TestBed.createComponent(RubricPreviewPanel);
      cmp2.componentRef.setInput('campaignId', 'c-1');
      cmp2.componentRef.setInput('questions', [{ id: 'q-1', questionText: 'Câu 1' }]);
      cmp2.componentRef.setInput('rubricVersion', 2);
      cmp2.detectChanges();
      expect(cmp2.componentInstance.freeLeft()).toBe(2);
    });

    it('hết lượt miễn phí → hiện chip "trừ 1 credit" cạnh nút (không phải toast)', () => {
      const fixture = render({
        history: [
          run({ id: 'a' }),
          run({ id: 'b' }),
          run({ id: 'c' }),
        ],
      });
      const chip = fixture.nativeElement.querySelector('[data-testid="quota-chip"]');
      expect(chip.textContent).toContain('trừ 1 credit');
    });
  });

  // ── Xác nhận trước khi tiêu tiền ───────────────────────────────────────────
  describe('lượt tính phí', () => {
    const spent = [run({ id: 'a' }), run({ id: 'b' }), run({ id: 'c' })];

    it('hết lượt miễn phí → mở hộp thoại xác nhận', () => {
      const cmp = render({ history: spent }).componentInstance;
      cmp.run();
      expect(dialogOpened).toBe(1);
      expect(api.runRubricPreview).toHaveBeenCalledOnce();
    });

    it('HUỶ hộp thoại → KHÔNG gọi API (không tiêu credit)', () => {
      dialogResult = false;
      const cmp = render({ history: spent }).componentInstance;
      cmp.run();
      expect(dialogOpened).toBe(1);
      expect(api.runRubricPreview).not.toHaveBeenCalled();
    });

    it('còn lượt miễn phí → chạy thẳng, không hỏi', () => {
      const cmp = render().componentInstance;
      cmp.run();
      expect(dialogOpened).toBe(0);
      expect(api.runRubricPreview).toHaveBeenCalledOnce();
    });
  });

  // ── Cứu kết quả khi mạng đứt ───────────────────────────────────────────────
  describe('lỗi mạng / hết thời hạn chờ', () => {
    it('lỗi → đọc lại lịch sử MỘT lần; có lượt Succeeded mới → hiện kết quả, KHÔNG báo lỗi', () => {
      const recovered = run({ id: 'moi-toanh' });
      api.runRubricPreview.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 504 })),
      );
      const fixture = render();
      const cmp = fixture.componentInstance;
      api.getRubricPreviewRuns.mockReturnValue(of([recovered]));

      cmp.run();

      expect(api.getRubricPreviewRuns).toHaveBeenCalledTimes(2); // 1 lúc mở panel + 1 lúc cứu
      expect(cmp.current()?.id).toBe('moi-toanh');
      expect(cmp.error()).toBeNull();
      expect(notify['info']).toHaveBeenCalled();
    });

    it('lượt Succeeded CŨ (đã biết từ trước) không được nhận nhầm là kết quả vừa chạy', () => {
      const old = run({ id: 'cu-roi' });
      api.runRubricPreview.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 504 })),
      );
      const cmp = render({ history: [old] }).componentInstance;
      api.getRubricPreviewRuns.mockReturnValue(of([old]));

      cmp.run();

      expect(cmp.error()).toBeTruthy();
    });

    it('402 → nói rõ ví TỔ CHỨC hết credit (không phải lỗi 5xx chung chung)', () => {
      api.runRubricPreview.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 402 })),
      );
      const cmp = render().componentInstance;
      cmp.run();

      expect(cmp.error()).toContain('không đủ credit');
      expect(cmp.showTopUp()).toBe(true);
    });
  });

  // ── Đọc kết quả: hình trước, số sau ────────────────────────────────────────
  describe('hiển thị kết quả', () => {
    it('ba bài chấm dồn một chỗ → cảnh báo "chưa phân biệt được"', () => {
      const flat = run({
        samples: [sample('Weak', 2, 7), sample('Good', 6, 7), sample('Excellent', 10, 7)],
      });
      api.runRubricPreview.mockReturnValue(of(flat));
      const fixture = render();
      fixture.componentInstance.run();
      fixture.detectChanges();

      const warn = fixture.nativeElement.querySelector('[data-testid="scale-collapsed"]');
      expect(warn).toBeTruthy();
      expect(warn.textContent).toContain('chưa phân biệt được');
    });

    it('ba bài trải đều → KHÔNG cảnh báo (dù lệch kỳ vọng)', () => {
      const fixture = render();
      fixture.componentInstance.run();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="scale-collapsed"]')).toBeNull();
    });

    it('băng cảnh báo về giới hạn bài mẫu LUÔN có trong DOM, kể cả khi điểm đẹp', () => {
      const fixture = render();
      fixture.componentInstance.run();
      fixture.detectChanges();

      const caveat = fixture.nativeElement.querySelector('[data-testid="preview-caveat"]');
      expect(caveat).toBeTruthy();
      expect(caveat.textContent).toContain('không có số đo cách nói');
      expect(caveat.textContent).toContain('chính AI chấm điểm');
    });

    it('cùng dấu vân tay + phiên bản + prompt → "cùng thước đo" (điểm lệch là nhiễu mô hình)', () => {
      const cmp = render().componentInstance;
      const a = run({ id: 'a' });
      const b = run({ id: 'b' });
      expect(cmp.sameRuler(a, b)).toBe(true);
      expect(cmp.sameRuler(a, run({ id: 'c', rubricFingerprint: 'fp-bbb' }))).toBe(false);
      expect(cmp.sameRuler(a, run({ id: 'd', promptVersion: 5 }))).toBe(false);
      expect(cmp.sameRuler(a, run({ id: 'e', rubricVersion: 2 }))).toBe(false);
    });

    it('mỗi tiêu chí có đủ chấm thật + vòng kỳ vọng của từng bài mẫu', () => {
      const cmp = render().componentInstance;
      const pts = cmp.pointsFor(run(), 'c1');
      expect(pts.filter((p) => p.kind === 'actual')).toHaveLength(3);
      expect(pts.filter((p) => p.kind === 'expected')).toHaveLength(3);
    });
  });

  // ── Chạy trên bộ ĐÃ LƯU ────────────────────────────────────────────────────
  it('biểu mẫu đang sửa dở → khoá nút, nói rõ vì sao (máy chủ chấm bản đã lưu)', () => {
    const cmp = render({ dirty: true }).componentInstance;
    expect(cmp.canRun()).toBe(false);
    expect(cmp.runBlockedReason()).toContain('Lưu thay đổi');
    cmp.run();
    expect(api.runRubricPreview).not.toHaveBeenCalled();
  });

  it('không có bài thứ 4 → không gửi customAnswer rỗng', () => {
    const cmp = render().componentInstance;
    cmp.run();
    expect(api.runRubricPreview.mock.calls[0][1]).toEqual({ questionId: 'q-1' });
  });
});

describe('actualPointsCollapsed', () => {
  const p = (v: number) => ({ value: v, label: '', kind: 'actual' as const });

  it('ba chấm sát nhau trên thang 10 → coi là chồng nhau', () => {
    expect(actualPointsCollapsed([p(7), p(7), p(7.5)], 10)).toBe(true);
  });

  it('trải từ 2 tới 9 → không chồng', () => {
    expect(actualPointsCollapsed([p(2), p(6), p(9)], 10)).toBe(false);
  });

  it('chỉ 1 chấm → không kết luận gì', () => {
    expect(actualPointsCollapsed([p(5)], 10)).toBe(false);
  });

  it('vòng kỳ vọng KHÔNG tính vào phép đo (chúng do code đặt, luôn trải đều)', () => {
    const expected = [0, 6, 10].map((v) => ({
      value: v,
      label: '',
      kind: 'expected' as const,
    }));
    expect(actualPointsCollapsed([...expected, p(7), p(7)], 10)).toBe(true);
  });
});
