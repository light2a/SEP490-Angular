import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import { CriterionLevelItem, RubricResponse } from '../../../core/models';
import { Rubrics } from './rubrics';

const URL = `${environment.apiBase}/interview/practice/rubrics/BA`;

function levels(): CriterionLevelItem[] {
  return [
    { score: 0, descriptor: 'CÓ: không nêu được khái niệm nào liên quan tới câu hỏi' },
    { score: 5, descriptor: 'CÓ: nêu đúng khái niệm. CÒN THIẾU: chưa có ví dụ cụ thể' },
    { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi khi áp dụng thực tế' },
  ];
}

function seed(overrides: Partial<RubricResponse> = {}): RubricResponse {
  return {
    jobCategory: 'BA',
    isCustom: false,
    criteria: [
      {
        id: 'c1',
        name: 'Chiều sâu kỹ thuật',
        description: 'mô tả',
        weight: 1,
        maxScore: 10,
        levels: levels(),
      },
    ],
    ...overrides,
  };
}

/**
 * RUBRIC RIÊNG của người luyện — nay khai được MỐC ĐIỂM.
 *
 * Vì sao bộ test này tồn tại: nếu thiếu, chính đợt này tạo ra một nghịch lý im lặng — quản trị
 * viên soạn mốc cho bộ chuẩn, nhưng rubric riêng không có chỗ khai mốc ⇒ *dùng bộ mặc định thì
 * được thang có mô tả, tự tuỳ chỉnh thì bị thang rỗng nghĩa*. Tức **tự tuỳ chỉnh làm chất lượng
 * chấm tệ đi**, và người dùng không có cách nào biết.
 */
describe('Rubrics (B2C) — mốc điểm cho rubric riêng', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(r: RubricResponse = seed()) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Rubrics);
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === URL && req.method === 'GET').flush(r);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  /**
   * 🔴 Vế xoá bỏ nghịch lý: xem bộ mặc định thì mốc của quản trị viên **đã có sẵn trong form**, nên
   * bấm sửa không phải bắt đầu từ trang trắng.
   */
  it('đang xem bộ mặc định → mốc của quản trị viên đã nằm sẵn trong form', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    expect(cmp.rubric()?.isCustom).toBe(false);
    expect(cmp.levelsOf(0)).toEqual(levels());
    expect(cmp.hasNoLevels(0)).toBe(false);

    // Và mốc hiện ra trên màn (dải chip của editor dùng chung).
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="levels-strip"]').length,
    ).toBe(1);
  });

  /** Nút "AI gợi ý" của editor dùng chung phải ẩn: rubric riêng không có đường gọi AI nào. */
  it('KHÔNG hiện nút AI gợi ý mốc', () => {
    const fixture = setup();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="levels-ai-btn"]'),
    ).toBeNull();
  });

  /**
   * Tiêu chí tự thêm rơi về dải mặc định — trạng thái HỢP LỆ, nhưng phải hiện ra để người dùng
   * biết mình đang đánh đổi cái gì.
   */
  it('thêm tiêu chí mới → gắn nhãn chưa có mốc và đếm vào lời nhắc', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.addRow();
    fixture.detectChanges();

    expect(cmp.hasNoLevels(1)).toBe(true);
    expect(cmp.noLevelsCount()).toBe(1);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="no-levels-note"]')?.textContent).toContain(
      'chưa có mốc điểm',
    );
    // Badge của chính hàng đó (editor dùng chung).
    expect(el.textContent).toContain('Chưa có mốc');
  });

  /** Lưu phải mang theo `levels`; thiếu là mỗi lần Lưu xoá sạch mốc mà không lỗi nào báo. */
  it('Lưu gửi kèm levels của từng tiêu chí, sắp tăng dần theo điểm', () => {
    const fixture = setup();
    fixture.componentInstance.save();

    const req = httpMock.expectOne((r) => r.url === URL && r.method === 'PUT');
    expect(req.request.body.criteria[0].levels).toEqual(levels());
    req.flush(seed({ isCustom: true }));
    expect(notify['success']).toHaveBeenCalled();
  });

  /** Tiêu chí không mốc gửi `[]` — hợp lệ, KHÔNG phải lỗi. */
  it('tiêu chí chưa khai mốc gửi mảng rỗng chứ không bị bỏ qua', () => {
    const fixture = setup(
      seed({ criteria: [{ id: 'c1', name: 'X', description: null, weight: 1, maxScore: 10 }] }),
    );
    fixture.componentInstance.save();

    const req = httpMock.expectOne((r) => r.url === URL && r.method === 'PUT');
    expect(req.request.body.criteria[0].levels).toEqual([]);
    req.flush(seed({ isCustom: true }));
  });

  /**
   * Thang méo phải bị chặn ở đây, bằng CÙNG luật với phía chiến dịch: thiếu mốc 0 thì bài trả lời
   * TRỐNG neo về mốc thấp nhất ⇒ không nói gì vẫn có điểm, không lỗi nào nổ.
   */
  it('thiếu mốc 0 → chặn Lưu và nói rõ hàng nào sai', () => {
    const fixture = setup(
      seed({
        criteria: [
          {
            id: 'c1',
            name: 'Chiều sâu kỹ thuật',
            description: null,
            weight: 1,
            maxScore: 10,
            levels: [
              { score: 4, descriptor: 'CÓ: nêu đúng khái niệm nhưng chưa có ví dụ nào' },
              { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi khi áp dụng' },
            ],
          },
        ],
      }),
    );

    fixture.componentInstance.save();

    httpMock.expectNone((r) => r.method === 'PUT');
    expect(String(notify['warn'].mock.calls[0][0])).toContain('Thiếu mốc 0');
    expect(String(notify['warn'].mock.calls[0][0])).toContain('Chiều sâu kỹ thuật');
  });

  /** Backend cũ không trả `levels` ⇒ `undefined.sort()` sẽ làm trắng cả trang. */
  it('backend cũ không trả levels → vẫn nạp được, coi như chưa có mốc', () => {
    const fixture = setup(
      seed({ criteria: [{ id: 'c1', name: 'X', description: null, weight: 1, maxScore: 10 }] }),
    );
    expect(fixture.componentInstance.levelsOf(0)).toEqual([]);
    expect(fixture.componentInstance.hasNoLevels(0)).toBe(true);
  });
});
