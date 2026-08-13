import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import { AdminRubricPreviewRun, JobCategory, RubricLanguage } from '../../../core/models';
import { AdminRubricPreview, DEFAULT_FREE_RUNS } from './admin-rubric-preview';

const BASE = `${environment.apiBase}/interview/admin/rubrics`;

function run(p: Partial<AdminRubricPreviewRun> = {}): AdminRubricPreviewRun {
  return {
    id: 'r-1',
    status: 'Succeeded',
    jobCategory: 'BE',
    language: 'vi',
    questionText: 'Câu hỏi',
    rubricFingerprint: 'abcdef1234',
    rubricVersion: 2,
    promptVersion: 1,
    deliveryMetricsAvailable: false,
    lengthParityWarning: false,
    freeRunsRemaining: 4,
    rubric: [
      {
        criterionId: 'cr-1',
        name: 'Chiều sâu kỹ thuật',
        weight: 1,
        maxScore: 10,
        levels: [
          { score: 0, descriptor: 'CÓ: không nêu được khái niệm nào liên quan' },
          { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi thực tế' },
        ],
      },
    ],
    samples: [
      {
        band: 'Weak',
        answerText: 'bài yếu',
        wordCount: 150,
        expectedWeightedPct: 25,
        actualWeightedPct: 30,
        scores: [
          {
            criterionId: 'cr-1',
            criterionName: 'Chiều sâu kỹ thuật',
            maxScore: 10,
            expectedLevel: 2,
            actualScore: 3,
            reasoning: 'vì thế này',
          },
        ],
      },
    ],
    createdAt: '2026-08-13T00:00:00Z',
    ...p,
  };
}

/** Vỏ để đổi được input như cha thật (đổi ô nghề/ngôn ngữ phải nạp lại lịch sử của ô mới). */
@Component({
  imports: [AdminRubricPreview],
  template: `<app-admin-rubric-preview
    [jobCategory]="job()"
    [language]="lang()"
    [rubricVersion]="version()"
    [dirty]="dirty()"
  />`,
})
class Host {
  readonly job = signal<JobCategory>('BE');
  readonly lang = signal<RubricLanguage>('vi');
  readonly version = signal<number | null>(2);
  readonly dirty = signal(false);
}

/**
 * CHẤM THỬ BỘ CHUẨN của admin.
 *
 * Hai chỗ dễ hỏng mà không sinh lỗi nào:
 * - Gộp 429 vào câu lỗi chung ⇒ admin bấm lại mãi, không bao giờ biết đường thoát ra là "sửa mốc
 *   rồi lưu".
 * - Giấu băng cảnh báo khi số đẹp ⇒ admin kết luận thước đo tốt trong khi bài mẫu là văn bản
 *   (không có số đo cách nói) và do chính bộ chấm viết ra.
 */
describe('AdminRubricPreview — chấm thử bộ chuẩn', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(history: AdminRubricPreviewRun[] = []) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'GET')
      .flush(history);
    fixture.detectChanges();
    return fixture;
  }

  function panel(fixture: ReturnType<typeof setup>): AdminRubricPreview {
    return fixture.debugElement.children[0].componentInstance as AdminRubricPreview;
  }

  afterEach(() => httpMock.verify());

  /**
   * 429 KHÔNG phải lỗi hệ thống mà là hạn mức, và cách thoát ra là **sửa mốc rồi lưu** (phiên bản
   * mới được cấp lượt mới). Nói "thử lại sau ít phút" ở đây là chỉ sai đường.
   */
  it('429 → nói rõ hết lượt của phiên bản này, KHÔNG phải lỗi chung', () => {
    const fixture = setup();
    const p = panel(fixture);
    p.question = 'Câu hỏi thử';

    p.run();
    httpMock
      .expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'POST')
      .flush({ message: 'quota' }, { status: 429, statusText: 'Too Many Requests' });

    expect(p.error()).toContain('hết lượt');
    expect(p.error()).toContain('sửa mốc rồi lưu');
    expect(p.error()).not.toContain('thử lại sau');
    // Hết trần rồi thì nút phải khoá luôn, đừng để bấm tiếp cho ăn thêm 429.
    expect(p.outOfQuota()).toBe(true);
    expect(p.canRun()).toBe(false);
  });

  /** Hạn mức thật do backend giữ; đếm ở client sẽ lệch ngay khi lượt hỏng không bị tính. */
  it('lượt còn lại đọc từ backend, không tự đếm số dòng lịch sử', () => {
    const fixture = setup([run({ freeRunsRemaining: 1, rubricVersion: 2 })]);
    const p = panel(fixture);
    expect(p.freeLeft()).toBe(1);
    expect(p.outOfQuota()).toBe(false);
  });

  /** Chưa có lượt nào của phiên bản này → trần mặc định, KHÔNG phải 0 (0 sẽ khoá oan nút Chấm thử). */
  it('chưa có lượt nào → dùng trần mặc định thay vì 0', () => {
    expect(panel(setup([])).freeLeft()).toBe(DEFAULT_FREE_RUNS);
  });

  /** Backend chấm trên bộ ĐÃ LƯU ⇒ chạy khi đang sửa dở là kiểm chứng một thước đo khác. */
  it('đang sửa dở → chặn chạy và nói lý do', () => {
    const fixture = setup();
    const p = panel(fixture);
    p.question = 'Câu hỏi thử';
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();

    expect(p.canRun()).toBe(false);
    expect(p.blockedReason()).toContain('Lưu bộ chuẩn trước');

    p.run();
    httpMock.expectNone((r) => r.method === 'POST');
    expect(notify['warn']).toHaveBeenCalled();
  });

  /** Hai giới hạn này không giấu được, kể cả khi số đẹp. */
  it('có kết quả → băng cảnh báo LUÔN hiện, kèm dải phân biệt của từng tiêu chí', () => {
    const fixture = setup([run()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const caveat = el.querySelector('[data-testid="admin-preview-caveat"]');
    expect(caveat?.textContent).toContain('văn bản');
    expect(caveat?.textContent).toContain('chính AI chấm điểm');
    expect(el.querySelectorAll('app-rubric-scale-strip').length).toBe(1);
  });

  /** Chấm đặc = điểm thật, vòng rỗng = mức kỳ vọng — hai nguồn KHÁC nhau, không được lấy một. */
  it('vẽ cả điểm thật lẫn mức kỳ vọng cho mỗi bài mẫu', () => {
    const fixture = setup([run()]);
    const pts = panel(fixture).pointsFor(run(), 'cr-1');

    expect(pts.filter((x) => x.kind === 'expected').map((x) => x.value)).toEqual([2]);
    expect(pts.filter((x) => x.kind === 'actual').map((x) => x.value)).toEqual([3]);
  });

  /** Câu gợi ý phải theo đúng (nghề, ngôn ngữ) đang xem, không phải một danh sách cố định. */
  it('đổi ô → nạp lại lịch sử của ô mới và đổi bộ câu gợi ý', () => {
    const fixture = setup([run()]);
    const p = panel(fixture);
    const viFirst = p.sampleQuestions()[0];

    fixture.componentInstance.lang.set('en');
    fixture.detectChanges();
    httpMock
      .expectOne(
        (r) =>
          r.url === `${BASE}/BE/preview` &&
          r.method === 'GET' &&
          r.params.get('language') === 'en',
      )
      .flush([]);

    expect(p.sampleQuestions()[0]).not.toBe(viFirst);
    // Kết quả của ô cũ không được nằm lại trên màn ô mới.
    expect(p.current()).toBeNull();
  });

  /** Hợp đồng không có đường liệt kê câu mẫu ⇒ nút gợi ý chỉ điền chữ, gửi qua `question`. */
  it('chọn câu gợi ý → điền vào ô và gửi kèm `question`', () => {
    const fixture = setup();
    const p = panel(fixture);
    const q = p.sampleQuestions()[1];

    p.useSample(q);
    expect(p.question).toBe(q);

    p.run();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'POST');
    expect(req.request.body).toEqual({ question: q });
    req.flush(run());
    httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'GET').flush([run()]);
  });
});
