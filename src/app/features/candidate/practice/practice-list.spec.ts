import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { FilesApi } from '../../../core/api/files.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { JD_TEXT_MAX_CHARS, PracticeSessionOptions } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { PracticeList } from './practice-list';

/**
 * JD nhập TEXT ở màn tạo buổi luyện — quy ước C11 "text ưu tiên file".
 * Khoá hợp đồng gửi lên BE: có jdText → jdId phải là null (không để BE tự đoán).
 */
/** SC3 — options mặc định cho test: trần 20, thích ứng bật, 3 tiêu chí nội dung. */
const options = (over: Partial<PracticeSessionOptions> = {}): PracticeSessionOptions => ({
  adaptiveEnabled: true,
  maxDeepPerQuestion: 3,
  contentCriteriaCount: 3,
  questionCountMin: 1,
  questionCountMax: 20,
  defaultQuestionCount: 5,
  presets: [
    { key: 'short', questionCount: 6, seedCount: 2, coversAllCriteria: false },
    { key: 'medium', questionCount: 12, seedCount: 3, coversAllCriteria: true },
    { key: 'long', questionCount: 20, seedCount: 5, coversAllCriteria: true },
  ],
  preview: [
    { questionCount: 5, seedCount: 2 },
    { questionCount: 6, seedCount: 2 },
    { questionCount: 12, seedCount: 3 },
    { questionCount: 20, seedCount: 5 },
  ],
  ...over,
});

describe('PracticeList — JD dạng text', () => {
  let practiceApi: {
    create: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
    sessionOptions: ReturnType<typeof vi.fn>;
  };
  let filesApi: { list: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    practiceApi = {
      create: vi.fn().mockReturnValue(of({ id: 's-1', status: 'Ready', jobCategory: 'BE' })),
      history: vi.fn().mockReturnValue(of([])),
      sessionOptions: vi.fn().mockReturnValue(of(options())),
    };
    filesApi = {
      list: vi.fn().mockReturnValue(
        of([{ id: 'jd-1', fileType: 'jd', originalName: 'jd.pdf' }]),
      ),
    };

    TestBed.configureTestingModule({
      imports: [PracticeList],
      providers: [
        // Stub Router: tạo xong session là component điều hướng — route thật không có trong test
        // (lịch sử rỗng nên không RouterLink nào được dựng).
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PracticeApi, useValue: practiceApi },
        { provide: FilesApi, useValue: filesApi },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PracticeList);
    fixture.detectChanges();
    return fixture;
  }

  it('gửi jdText (đã trim) và BỎ jdId khi người dùng dán JD tay', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.patchValue({ jobCategory: 'BE', jdId: 'jd-1', jdText: '  Tuyển BE Java  ' });
    cmp.create();

    expect(practiceApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ jdText: 'Tuyển BE Java', jdId: null }),
    );
    // Dán text → dropdown file bị khoá để người dùng thấy file sẽ không được dùng.
    expect(cmp.usingJdText()).toBe(true);
    expect(cmp.form.controls.jdId.disabled).toBe(true);
    fixture.destroy();
  });

  it('giữ nguyên luồng file cũ khi không dán text (jdText → null)', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.patchValue({ jobCategory: 'BE', jdId: 'jd-1', jdText: '   ' });
    cmp.create();

    expect(practiceApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ jdText: null, jdId: 'jd-1' }),
    );
    expect(cmp.usingJdText()).toBe(false);
    expect(cmp.form.controls.jdId.enabled).toBe(true);
    fixture.destroy();
  });

  // Cap độ dài JD: người dùng phải THẤY giới hạn trước khi gửi (BE mới enforce thật → 400).
  it('textarea JD có maxlength + bộ đếm khớp hằng số dùng chung với BE', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector(
      'textarea[formControlName="jdText"]',
    );
    expect(textarea.getAttribute('maxlength')).toBe(String(JD_TEXT_MAX_CHARS));

    cmp.form.patchValue({ jdText: 'abc' });
    fixture.detectChanges();
    expect(cmp.jdTextLength()).toBe(3);
    expect(fixture.nativeElement.textContent).toContain(`3 / ${JD_TEXT_MAX_CHARS}`);

    // Vượt ngưỡng → form invalid ngay ở FE (khỏi gửi request chắc chắn bị BE trả 400).
    cmp.form.patchValue({ jdText: 'x'.repeat(JD_TEXT_MAX_CHARS + 1) });
    expect(cmp.form.controls.jdText.hasError('maxlength')).toBe(true);

    // Sát ngưỡng → vẫn hợp lệ ("tối đa", không phải "nhỏ hơn").
    cmp.form.patchValue({ jdText: 'x'.repeat(JD_TEXT_MAX_CHARS) });
    expect(cmp.form.controls.jdText.valid).toBe(true);

    fixture.destroy();
  });

  // F2 + F2b — lựa chọn thời lượng/số câu phải THỰC SỰ đi lên BE, không chỉ nằm trên form.
  it('gửi kèm timeLimitSec và questionCount đã chọn', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.patchValue({ jobCategory: 'BE', timeLimitSec: 240, questionCount: 8 });
    cmp.create();

    expect(practiceApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeLimitSec: 240, questionCount: 8 }),
    );
    fixture.destroy();
  });

  it('mặc định 2 phút / 5 câu (giữ hành vi cũ cho người không đụng tới)', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.patchValue({ jobCategory: 'BE' });
    cmp.create();

    expect(practiceApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeLimitSec: 120, questionCount: 5 }),
    );
    fixture.destroy();
  });

  it('số câu ngoài 1..20 → form invalid, KHÔNG gọi API', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    for (const bad of [0, 21, -1]) {
      practiceApi.create.mockClear();
      cmp.form.patchValue({ jobCategory: 'BE', questionCount: bad });

      expect(cmp.form.controls.questionCount.valid).toBe(false);
      cmp.create();
      expect(practiceApi.create).not.toHaveBeenCalled();
    }

    // Đúng biên → hợp lệ (trần là "tối đa 20", không phải "dưới 20").
    cmp.form.patchValue({ questionCount: 20 });
    expect(cmp.form.controls.questionCount.valid).toBe(true);
    cmp.form.patchValue({ questionCount: 1 });
    expect(cmp.form.controls.questionCount.valid).toBe(true);

    fixture.destroy();
  });
});

/**
 * SC3 — độ dài buổi luyện lấy từ SERVER.
 *
 * Lý do tính năng này tồn tại: ô "số câu" gửi lên BE là TỔNG, nhưng người dùng gõ "5" thì nghĩ là
 * "5 câu chính". Với phỏng vấn thích ứng tổng bị chia cho chiều sâu → 5 tổng chỉ còn 2 câu chính.
 * Test khoá đúng chỗ đó: số câu gốc phải TRA từ `preview` của server, không được FE tự tính.
 */
describe('PracticeList — preset số câu (SC3) + ngôn ngữ phỏng vấn', () => {
  let practiceApi: {
    create: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
    sessionOptions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    practiceApi = {
      create: vi.fn().mockReturnValue(of({ id: 's-1', status: 'Ready', jobCategory: 'BE' })),
      history: vi.fn().mockReturnValue(of([])),
      sessionOptions: vi.fn().mockReturnValue(of(options())),
    };

    TestBed.configureTestingModule({
      imports: [PracticeList],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PracticeApi, useValue: practiceApi },
        { provide: FilesApi, useValue: { list: vi.fn().mockReturnValue(of([])) } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PracticeList);
    fixture.detectChanges();
    return fixture;
  }

  it('hỏi server preset theo ĐÚNG nhóm nghề + ngôn ngữ đang chọn', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    expect(practiceApi.sessionOptions).toHaveBeenCalledWith('BA', 'vi');

    // Đổi ngôn ngữ phải hỏi LẠI: số tiêu chí nội dung đọc từ rubric theo ngôn ngữ, giữ preset cũ
    // là preview dựng trên bộ rubric khác bộ rubric của buổi thật.
    cmp.form.controls.language.setValue('en');
    expect(practiceApi.sessionOptions).toHaveBeenCalledWith('BA', 'en');

    cmp.form.controls.jobCategory.setValue('FE');
    expect(practiceApi.sessionOptions).toHaveBeenCalledWith('FE', 'en');

    fixture.destroy();
  });

  it('số câu GỐC tra từ preview của server, không phải FE tự tính', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    // Server nói 12 tổng → 3 gốc. FE phải lấy đúng con số đó.
    cmp.form.controls.questionCount.setValue(12);
    expect(cmp.seedCount()).toBe(3);

    cmp.form.controls.questionCount.setValue(6);
    expect(cmp.seedCount()).toBe(2);

    // Ngoài bảng preview → null (im lặng), KHÔNG đoán bằng công thức.
    cmp.form.controls.questionCount.setValue(7);
    expect(cmp.seedCount()).toBeNull();

    fixture.destroy();
  });

  it('cảnh báo khi số câu gốc không đủ phủ hết tiêu chí nội dung', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    // 6 tổng → 2 gốc, mà rubric có 3 tiêu chí nội dung ⇒ thiếu chỗ.
    cmp.form.controls.questionCount.setValue(6);
    fixture.detectChanges();
    expect(cmp.coversAllCriteria()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="coverage-warn"]'),
    ).toBeTruthy();

    // 12 tổng → 3 gốc = đủ ⇒ hết cảnh báo.
    cmp.form.controls.questionCount.setValue(12);
    fixture.detectChanges();
    expect(cmp.coversAllCriteria()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="coverage-warn"]')).toBeNull();

    fixture.destroy();
  });

  it('bấm preset đặt TỔNG số câu (BE chỉ nhận tổng)', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.applyPreset(20);
    expect(cmp.form.controls.questionCount.value).toBe(20);
    expect(cmp.activePresetKey()).toBe('long');

    fixture.destroy();
  });

  it('áp biên min/max THẬT của server (trần theo gói có thể < 20)', () => {
    practiceApi.sessionOptions.mockReturnValue(
      of(options({ questionCountMax: 8, defaultQuestionCount: 4, preview: [], presets: [] })),
    );
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.controls.questionCount.setValue(12);
    expect(cmp.form.controls.questionCount.valid).toBe(false);
    cmp.form.controls.questionCount.setValue(8);
    expect(cmp.form.controls.questionCount.valid).toBe(true);

    fixture.destroy();
  });

  it('giá trị đang chọn vượt trần mới → kéo về mặc định của server, không để form đỏ vô cớ', () => {
    // 5 (mặc định form) > trần 3 → phải nhảy về defaultQuestionCount.
    practiceApi.sessionOptions.mockReturnValue(
      of(options({ questionCountMax: 3, defaultQuestionCount: 3, preview: [], presets: [] })),
    );
    const fixture = render();
    const cmp = fixture.componentInstance;

    expect(cmp.form.controls.questionCount.value).toBe(3);
    expect(cmp.form.controls.questionCount.valid).toBe(true);

    fixture.destroy();
  });

  it('options lỗi → KHÔNG chặn tạo buổi, chỉ mất phần gợi ý', () => {
    practiceApi.sessionOptions.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'Bilingual chưa bật.' } })),
    );
    const fixture = render();
    const cmp = fixture.componentInstance;

    expect(cmp.options()).toBeNull();
    expect(cmp.optionsError()).toBe('Bilingual chưa bật.');

    cmp.create();
    expect(practiceApi.create).toHaveBeenCalled();

    fixture.destroy();
  });

  it('gửi kèm language đã chọn khi tạo buổi', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.form.patchValue({ jobCategory: 'BE', language: 'en' });
    cmp.create();

    expect(practiceApi.create).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));

    fixture.destroy();
  });

  it('mặc định vi (giữ hành vi cũ cho người không đụng tới)', () => {
    const fixture = render();
    const cmp = fixture.componentInstance;

    cmp.create();
    expect(practiceApi.create).toHaveBeenCalledWith(expect.objectContaining({ language: 'vi' }));

    fixture.destroy();
  });
});
