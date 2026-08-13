import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import {
  AdminRubricPreviewRun,
  JobCategory,
  RubricLanguage,
  SampleQuestion,
} from '../../../core/models';
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
    [sampleQuestions]="samples()"
    [dirty]="dirty()"
  />`,
})
class Host {
  readonly job = signal<JobCategory>('BE');
  readonly lang = signal<RubricLanguage>('vi');
  readonly version = signal<number | null>(2);
  readonly dirty = signal(false);
  readonly samples = signal<SampleQuestion[]>(VI_SAMPLES);
}

const VI_SAMPLES: SampleQuestion[] = [
  { id: 'sq-vi-1', text: 'Bạn thiết kế API cho chức năng đặt hàng như thế nào?' },
  { id: 'sq-vi-2', text: 'Truy vấn chậm dần theo thời gian, bạn tìm nguyên nhân ra sao?' },
  { id: 'sq-vi-3', text: 'Hai request cùng sửa một bản ghi thì xử lý thế nào?' },
];

const EN_SAMPLES: SampleQuestion[] = [
  { id: 'sq-en-1', text: 'How would you design an API for placing an order?' },
  { id: 'sq-en-2', text: 'A query gets slower over time. What do you check first?' },
];

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

  function setup(history: AdminRubricPreviewRun[] = [], samples: SampleQuestion[] = VI_SAMPLES) {
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
    fixture.componentInstance.samples.set(samples);
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
    p.typeQuestion('Câu hỏi thử');

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
    p.typeQuestion('Câu hỏi thử');
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

  /** Câu gợi ý theo đúng (nghề, ngôn ngữ) đang xem — do cha nạp lại từ backend, không phải bảng cố định. */
  it('đổi ô → nạp lại lịch sử của ô mới, đổi bộ câu gợi ý và bỏ lựa chọn cũ', () => {
    const fixture = setup([run()]);
    const p = panel(fixture);
    p.pickSample('sq-vi-2');

    fixture.componentInstance.lang.set('en');
    fixture.componentInstance.samples.set(EN_SAMPLES);
    fixture.detectChanges();
    httpMock
      .expectOne(
        (r) =>
          r.url === `${BASE}/BE/preview` &&
          r.method === 'GET' &&
          r.params.get('language') === 'en',
      )
      .flush([]);

    expect(p.sampleQuestions().map((q) => q.id)).toEqual(['sq-en-1', 'sq-en-2']);
    // Câu mẫu của ngôn ngữ cũ KHÔNG được gửi kèm sang ô mới (id đó thuộc danh sách khác ⇒ 400).
    expect(p.selectedSampleId()).toBeNull();
    // Kết quả của ô cũ cũng không nằm lại trên màn ô mới.
    expect(p.current()).toBeNull();
  });

  /**
   * Câu mẫu đến TỪ BACKEND — dropdown phải hiện đúng những gì API trả, không hơn không kém.
   *
   * ⚠ `mat-option` render trong overlay ở `document.body`, KHÔNG nằm trong `fixture.nativeElement`
   * — đọc `textContent` của fixture sẽ luôn trượt và cho một phép đo vô nghĩa.
   */
  it('GET trả 3 câu → dropdown hiện đúng 3 câu đó', () => {
    const fixture = setup();
    const p = panel(fixture);
    expect(p.sampleQuestions()).toEqual(VI_SAMPLES);

    fixture.debugElement.query(By.directive(MatSelect)).componentInstance.open();
    fixture.detectChanges();

    const options = Array.from(document.querySelectorAll('mat-option'));
    expect(options.length).toBe(3);
    expect(options.map((o) => o.textContent?.trim())).toEqual(VI_SAMPLES.map((q) => q.text));
  });

  /**
   * 🔴 Gửi kèm cả hai trường là đẩy việc chọn hộ sang backend, mà lựa chọn đó quyết định bài mẫu
   * được viết cho câu nào — hai lượt chấm thử "cùng cấu hình" có thể chấm hai câu khác nhau.
   */
  it('chọn câu gợi ý → payload có sampleQuestionId và KHÔNG có question', () => {
    const fixture = setup();
    const p = panel(fixture);

    p.pickSample('sq-vi-2');
    expect(p.buildBody()).toEqual({ sampleQuestionId: 'sq-vi-2' });

    p.run();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'POST');
    expect(req.request.body).toEqual({ sampleQuestionId: 'sq-vi-2' });
    expect(req.request.body.question).toBeUndefined();
    req.flush(run());
    httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'GET').flush([run()]);
  });

  it('tự gõ → payload có question và KHÔNG có sampleQuestionId', () => {
    const fixture = setup();
    const p = panel(fixture);

    p.typeQuestion('  Câu tôi tự nghĩ  ');
    expect(p.buildBody()).toEqual({ question: 'Câu tôi tự nghĩ' });

    p.run();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'POST');
    expect(req.request.body).toEqual({ question: 'Câu tôi tự nghĩ' });
    expect(req.request.body.sampleQuestionId).toBeUndefined();
    req.flush(run());
    httpMock.expectOne((r) => r.url === `${BASE}/BE/preview` && r.method === 'GET').flush([run()]);
  });

  /** Loại trừ nhau về CẤU TRÚC: chọn thì xoá ô gõ, gõ thì bỏ chọn — cả hai chiều. */
  it('chọn rồi gõ, và gõ rồi chọn → luôn chỉ còn MỘT trường', () => {
    const fixture = setup();
    const p = panel(fixture);

    p.pickSample('sq-vi-1');
    p.typeQuestion('Tôi đổi ý');
    expect(p.selectedSampleId()).toBeNull();
    expect(p.buildBody()).toEqual({ question: 'Tôi đổi ý' });

    p.pickSample('sq-vi-3');
    expect(p.question()).toBe('');
    expect(p.buildBody()).toEqual({ sampleQuestionId: 'sq-vi-3' });
  });

  /**
   * Backend cũ (hoặc nghề chưa có câu mẫu) trả rỗng ⇒ **KHÔNG** có bản dự phòng phía client: bản
   * sao thứ hai chính là thứ vừa gỡ đi. Admin vẫn tự gõ được nên không ai bị chặn.
   */
  it('API không trả câu mẫu → không có dropdown, KHÔNG có câu dự phòng nào, vẫn tự gõ được', () => {
    const fixture = setup([], []);
    const p = panel(fixture);

    expect(p.sampleQuestions()).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="sample-select"]'),
    ).toBeNull();

    p.typeQuestion('Tự gõ vẫn chạy');
    expect(p.canRun()).toBe(true);
    expect(p.buildBody()).toEqual({ question: 'Tự gõ vẫn chạy' });
  });
});
