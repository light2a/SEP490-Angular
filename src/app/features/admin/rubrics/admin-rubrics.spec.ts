import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import {
  CriterionLevelItem,
  JobCategory,
  RubricLanguage,
  SystemRubricCriterion,
  SystemRubricMatrixCell,
  SystemRubricResponse,
} from '../../../core/models';
import { AdminRubrics, looksUntranslated } from './admin-rubrics';

const BASE = `${environment.apiBase}/interview/admin/rubrics`;

function levels(): CriterionLevelItem[] {
  return [
    { score: 0, descriptor: 'CÓ: không nêu được khái niệm nào liên quan tới câu hỏi được hỏi' },
    { score: 5, descriptor: 'CÓ: nêu đúng khái niệm. CÒN THIẾU: chưa có ví dụ cụ thể nào' },
    { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi khi áp dụng vào thực tế' },
  ];
}

function crit(p: Partial<SystemRubricCriterion> = {}): SystemRubricCriterion {
  return {
    id: 'cr-1',
    name: 'Chiều sâu kỹ thuật',
    description: 'mô tả',
    weight: 0.5,
    maxScore: 10,
    scoringScope: 'WhenTargeted',
    levels: [],
    ...p,
  };
}

function rubric(p: Partial<SystemRubricResponse> = {}): SystemRubricResponse {
  return {
    jobCategory: 'BA',
    language: 'vi',
    version: 3,
    criteria: [crit(), crit({ id: 'cr-2', name: 'Giao tiếp', scoringScope: 'Always' })],
    ...p,
  };
}

function cell(p: Partial<SystemRubricMatrixCell> = {}): SystemRubricMatrixCell {
  return { jobCategory: 'BA', language: 'vi', version: 1, criteriaWithLevels: 0, total: 7, ...p };
}

/**
 * BỘ CHUẨN HỆ THỐNG — màn admin.
 *
 * Vì sao bộ test này tồn tại: cả ba kiểu hỏng nặng nhất ở đây đều **không sinh lỗi nào**.
 * - Ma trận đếm nhầm ⇒ ô chưa khai mốc trông như đã xong ⇒ 5/6 tổ hợp mãi mãi chấm bằng dải rỗng
 *   nghĩa, và không có gì trên màn nói ra.
 * - Lưu mà không nói rõ hệ quả ⇒ admin đổi thước đo của toàn hệ thống mà tưởng chỉ sửa vài chữ.
 * - Chép mốc VI→EN mà không đánh dấu ⇒ mô tả tiếng Việt nằm im trong bộ tiếng Anh và **vẫn đi vào
 *   prompt chấm nguyên văn**.
 */
describe('AdminRubrics — bộ chuẩn hệ thống', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: unknown;
  let dialogOpens: number;

  function setup(opts: { rubric?: SystemRubricResponse; matrix?: SystemRubricMatrixCell[] } = {}) {
    dialogResult = true;
    dialogOpens = 0;
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: {
            open: () => {
              dialogOpens++;
              return { afterClosed: () => of(dialogResult) };
            },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminRubrics);
    fixture.detectChanges();

    // Ma trận nạp cho CẢ HAI ngôn ngữ (3×2 cần đủ hai cột).
    for (const lang of ['vi', 'en'] as RubricLanguage[]) {
      httpMock
        .expectOne((r) => r.url === BASE && r.method === 'GET' && r.params.get('language') === lang)
        .flush(opts.matrix?.filter((c) => c.language === lang) ?? []);
    }

    // Màn luôn mở ở (BA, vi). Muốn test một ô khác thì phải đi qua đúng thao tác đổi ô của người
    // dùng — giả lập bằng cách nhét thẳng response của ô khác vào lời gọi đầu sẽ dựng một trạng
    // thái mà giao diện thật không bao giờ tới được.
    const target = opts.rubric ?? rubric();
    const startsAtTarget = target.jobCategory === 'BA' && target.language === 'vi';
    flushRubric(startsAtTarget ? target : rubric());
    fixture.detectChanges();

    if (!startsAtTarget) {
      flushPreviewHistory();
      fixture.componentInstance.goTo(target.jobCategory, target.language);
      flushRubric(target);
      fixture.detectChanges();
    }
    return fixture;
  }

  /** Trả lời lời gọi GET bộ chuẩn đang chờ (kèm cả lời gọi chấm thử đi sau nó). */
  function flushRubric(r: SystemRubricResponse) {
    httpMock
      .expectOne(
        (req) =>
          req.url === `${BASE}/${r.jobCategory}` &&
          req.method === 'GET' &&
          req.params.get('language') === r.language,
      )
      .flush(r);
  }

  /** Panel chấm thử nạp lịch sử theo (nghề, ngôn ngữ) — hút ra để `verify()` sạch. */
  function flushPreviewHistory() {
    for (const req of httpMock.match((r) => r.url.endsWith('/preview') && r.method === 'GET')) {
      req.flush([]);
    }
  }

  afterEach(() => {
    flushPreviewHistory();
    httpMock.verify();
  });

  /**
   * Đơn vị thao tác phải TRÙNG đơn vị đánh phiên bản: sửa xuyên nghề thì một nút Lưu bump 6 phiên
   * bản và nhãn phiên bản hết nghĩa.
   */
  it('đổi nghề / đổi ngôn ngữ → nạp đúng ô đó', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    cmp.changeCategory('BE');
    expect(cmp.category()).toBe('BE');
    flushRubric(rubric({ jobCategory: 'BE', language: 'vi', version: 1 }));

    fixture.detectChanges();
    flushPreviewHistory();

    cmp.changeLanguage('en');
    expect(cmp.language()).toBe('en');
    flushRubric(rubric({ jobCategory: 'BE', language: 'en', version: 2 }));
    expect(cmp.rubric()?.version).toBe(2);
  });

  /**
   * Ma trận đếm tiêu chí **ĐÃ CÓ MỐC**, không đếm tổng tiêu chí. Ô nào cũng đủ 7 tiêu chí — thứ
   * thiếu là mốc, nên đếm tổng sẽ báo "xong" cho ô chưa khai một mốc nào.
   */
  it('ma trận hiện n/7 và chỉ coi là xong khi MỌI tiêu chí có mốc', () => {
    const fixture = setup({
      matrix: [
        cell({ jobCategory: 'BA', language: 'vi', criteriaWithLevels: 7, total: 7, version: 4 }),
        cell({ jobCategory: 'BA', language: 'en', criteriaWithLevels: 3, total: 7 }),
        cell({ jobCategory: 'BE', language: 'vi', criteriaWithLevels: 0, total: 7 }),
      ],
    });
    const cmp = fixture.componentInstance;

    expect(cmp.cellText('BA', 'vi')).toBe('7/7 tiêu chí');
    expect(cmp.cellVersionText('BA', 'vi')).toBe('phiên bản 4');
    expect(cmp.isCellComplete('BA', 'vi')).toBe(true);
    expect(cmp.isCellComplete('BA', 'en')).toBe(false);
    expect(cmp.isCellComplete('BE', 'vi')).toBe(false);
    // Ô chưa tải được ≠ ô đã xong.
    expect(cmp.isCellComplete('FE', 'en')).toBe(false);
    expect(cmp.cellText('FE', 'en')).toBe('—');
    expect(cmp.incompleteCount()).toBe(2);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('7/7 tiêu chí');
    expect(text).toContain('3/7 tiêu chí');
  });

  /**
   * Ba điều của hộp xác nhận là **hợp đồng với người dùng**, không phải câu chữ trang trí: phạm vi
   * ảnh hưởng (mọi người luyện), mốc hiệu lực (buổi đang dở giữ thước cũ), và điểm cũ không so
   * được với điểm mới. Thiếu điều nào thì admin đang đổi thước đo toàn hệ thống mà không biết.
   */
  it('Lưu → hộp xác nhận nói ĐỦ BA điều; huỷ thì không gọi API', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    let captured: { bullets?: string[]; message?: string } | null = null;
    const dialog = TestBed.inject(MatDialog);
    dialogResult = false;
    vi.spyOn(dialog, 'open').mockImplementation((_c: unknown, cfg?: { data?: unknown }) => {
      captured = cfg?.data as { bullets?: string[] };
      return { afterClosed: () => of(dialogResult) } as ReturnType<MatDialog['open']>;
    });

    cmp.save();

    const bullets = (captured!.bullets ?? []).join(' ');
    expect(bullets).toContain('MỌI người luyện');
    expect(bullets).toContain('sau thời điểm này');
    expect(bullets).toContain('Buổi đang dở giữ nguyên thước đo cũ');
    expect(bullets).toContain('KHÔNG chấm lại');
    expect(bullets).toContain('hai thước đo khác nhau');

    // Huỷ = KHÔNG chạm server. Không có phép này thì hộp xác nhận chỉ là hình trang trí.
    httpMock.expectNone((r) => r.method === 'PUT');
  });

  /** `changed:false` là câu trả lời ĐÚNG chứ không phải lỗi — nói thẳng thay vì báo "đã lưu". */
  it('Lưu mà nội dung không đổi → nói rõ vẫn ở phiên bản cũ, không báo thành công', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    cmp.save();
    const put = httpMock.expectOne((r) => r.url === `${BASE}/BA` && r.method === 'PUT');
    // Chỉ 3 trường: gửi thừa `name`/`weight` là để backend lặng lẽ bỏ qua, không ai biết.
    expect(Object.keys(put.request.body.criteria[0]).sort()).toEqual([
      'description',
      'id',
      'levels',
    ]);
    put.flush({ changed: false, version: 3 });

    expect(notify['info']).toHaveBeenCalled();
    expect(notify['success']).not.toHaveBeenCalled();
    expect(String(notify['info'].mock.calls[0][0])).toContain('phiên bản 3');

    // Nạp lại sau khi lưu.
    for (const lang of ['vi', 'en'] as RubricLanguage[]) {
      httpMock
        .expectOne((r) => r.url === BASE && r.method === 'GET' && r.params.get('language') === lang)
        .flush([]);
    }
    flushRubric(rubric());
  });

  /**
   * Không có nút chép thì nửa bộ tiếng Anh **không bao giờ được khai** — soạn lại 7 tiêu chí từ
   * trắng là việc không ai làm. Nhưng chép mà không đánh dấu thì mô tả tiếng Việt nằm im trong bộ
   * tiếng Anh và vẫn đi thẳng vào prompt chấm.
   */
  it('chép mốc VI → EN: descriptor được chép nguyên văn và bị đánh dấu cần dịch', () => {
    const fixture = setup({ rubric: rubric({ language: 'en' }) });
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    expect(cmp.levelCount(0)).toBe(0);

    cmp.copyLevelsFromOtherLanguage();
    httpMock
      .expectOne((r) => r.url === `${BASE}/BA` && r.params.get('language') === 'vi')
      .flush(
        rubric({
          language: 'vi',
          criteria: [
            crit({ levels: levels() }),
            crit({ id: 'cr-2', name: 'Giao tiếp', scoringScope: 'Always', levels: levels() }),
          ],
        }),
      );

    expect(cmp.levelCount(0)).toBe(3);
    expect(cmp.levelsOf(0).map((l) => l.descriptor)).toEqual(levels().map((l) => l.descriptor));
    expect(cmp.rowUntranslated(0)).toBe(true);
    expect(cmp.untranslatedCount()).toBe(2);
    expect(notify['info']).toHaveBeenCalled();

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cần dịch');
  });

  /**
   * Chiều NGƯỢC LẠI (EN → VI) là chỗ dấu "cần dịch" thật sự phải làm việc: mô tả tiếng Anh không có
   * ký tự nào đặc trưng nên `looksUntranslated` KHÔNG soi ra được (cố ý — xem hàm đó). Nếu không
   * đánh dấu lúc chép thì mô tả tiếng Anh nằm im trong bộ tiếng Việt và **vẫn đi vào prompt chấm
   * nguyên văn**, không có gì trên màn nói ra.
   */
  it('chép mốc EN → VI: vẫn đánh dấu cần dịch dù nội dung không soi ra được', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    const en: CriterionLevelItem[] = [
      { score: 0, descriptor: 'HAS: names no relevant concept at all for this question' },
      { score: 10, descriptor: 'HAS: names the concept, an example and the trade-offs' },
    ];
    cmp.copyLevelsFromOtherLanguage();
    httpMock
      .expectOne((r) => r.url === `${BASE}/BA` && r.params.get('language') === 'en')
      .flush(
        rubric({
          language: 'en',
          criteria: [
            crit({ levels: en }),
            crit({ id: 'cr-2', name: 'Giao tiếp', scoringScope: 'Always', levels: en }),
          ],
        }),
      );

    // Nội dung không soi ra được…
    expect(looksUntranslated(en[0].descriptor, 'vi')).toBe(false);
    // …nên dấu vết lúc chép là tín hiệu DUY NHẤT còn lại.
    expect(cmp.rowUntranslated(0)).toBe(true);
    expect(cmp.untranslatedCount()).toBe(2);
  });

  /**
   * Hai bộ ghép theo THỨ TỰ (tên hai ngôn ngữ khác nhau nên không khớp theo tên được). Số tiêu chí
   * lệch ⇒ ghép lệch hàng = dán mô tả của tiêu chí này sang tiêu chí khác, im lặng ⇒ phải từ chối.
   */
  it('số tiêu chí hai bộ lệch nhau → TỪ CHỐI chép, không ghép lệch hàng', () => {
    const fixture = setup({ rubric: rubric({ language: 'en' }) });
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    cmp.copyLevelsFromOtherLanguage();
    httpMock
      .expectOne((r) => r.url === `${BASE}/BA` && r.params.get('language') === 'vi')
      .flush(rubric({ language: 'vi', criteria: [crit({ levels: levels() })] }));

    expect(cmp.levelCount(0)).toBe(0);
    expect(notify['error']).toHaveBeenCalled();
    expect(cmp.untranslatedCount()).toBe(0);
  });

  /**
   * Dấu "cần dịch" phải sống lâu hơn phiên sửa: đóng tab rồi mở lại vẫn phải thấy. Vì thế nó suy
   * từ chính NỘI DUNG mô tả, không chỉ từ tập id vừa chép.
   */
  it('mô tả tiếng Việt trong bộ EN bị gắn cờ cần dịch kể cả khi nạp mới (không do vừa chép)', () => {
    const fixture = setup({
      rubric: rubric({
        language: 'en',
        criteria: [crit({ levels: levels() }), crit({ id: 'cr-2', levels: [] })],
      }),
    });
    const cmp = fixture.componentInstance;

    expect(cmp.copiedIds().size).toBe(0);
    expect(cmp.rowUntranslated(0)).toBe(true);
    expect(cmp.rowUntranslated(1)).toBe(false);
  });

  /** Thang méo (thiếu mốc 0) ⇒ bài TRỐNG neo về mốc thấp nhất, không lỗi nào nổ ⇒ chặn từ đây. */
  it('mốc sai luật → không mở hộp xác nhận, nói rõ hàng nào sai', () => {
    const fixture = setup({
      rubric: rubric({
        criteria: [
          crit({
            levels: [
              { score: 4, descriptor: 'CÓ: nêu đúng khái niệm nhưng chưa có ví dụ nào cả' },
              { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi khi áp dụng' },
            ],
          }),
        ],
      }),
    });
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    cmp.save();

    expect(dialogOpens).toBe(0);
    httpMock.expectNone((r) => r.method === 'PUT');
    expect(String(notify['warn'].mock.calls[0][0])).toContain('Thiếu mốc 0');
  });

  /** Đổi ô khi đang sửa dở = mất sửa đổi ⇒ hỏi trước, đừng vứt im lặng. */
  it('đang sửa dở mà đổi ô → hỏi trước; huỷ thì ở nguyên chỗ cũ', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    flushPreviewHistory();

    cmp.criteria.at(0)!.get('description')!.setValue('sửa gì đó');
    cmp.form.markAsDirty();
    dialogResult = false;

    cmp.goTo('FE' as JobCategory, 'vi');

    expect(dialogOpens).toBe(1);
    expect(cmp.category()).toBe('BA');
    httpMock.expectNone((r) => r.url === `${BASE}/FE`);
  });

  /** Tên / trọng số / thang điểm / phạm vi chấm chỉ ĐỌC — không có ô nhập nào cho chúng. */
  it('chỉ hiện ô nhập cho mô tả; tên và phạm vi chấm là nhãn đọc', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    expect(cmp.scopeLabel(0)).toBe('Chấm khi được hỏi');
    expect(cmp.scopeLabel(1)).toBe('Luôn chấm');
    expect(cmp.weightPct(0)).toBe(50);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('input[formControlName="name"]').length).toBe(0);
    expect(el.querySelectorAll('input[formControlName="weight"]').length).toBe(0);
    expect(el.textContent).toContain('Chiều sâu kỹ thuật');
    expect(el.textContent).toContain('Luôn chấm');
  });
});

/**
 * Nhận diện mô tả chưa dịch — hàm thuần, không cần dựng màn.
 *
 * Chỉ soi được MỘT chiều và đó là quyết định có chủ đích: tiếng Việt có ký tự riêng nên nhận ra
 * bằng cấu trúc, còn "câu tiếng Anh lọt vào bộ tiếng Việt" thì trông y hệt một câu tiếng Việt gõ
 * thiếu dấu ⇒ đoán bừa sẽ gắn cờ sai và admin học cách phớt lờ cái cờ.
 */
describe('looksUntranslated — mô tả còn nguyên tiếng Việt trong bộ tiếng Anh', () => {
  it('bắt mô tả tiếng Việt nằm trong bộ EN', () => {
    expect(looksUntranslated('CÓ: nêu đúng khái niệm và cho ví dụ', 'en')).toBe(true);
    expect(looksUntranslated('Ứng viên mô tả được đánh đổi', 'en')).toBe(true);
  });

  it('không bắt nhầm mô tả tiếng Anh thật', () => {
    expect(looksUntranslated('HAS: names the concept and gives an example', 'en')).toBe(false);
    expect(looksUntranslated('', 'en')).toBe(false);
  });

  it('KHÔNG gắn cờ gì cho bộ tiếng Việt — kể cả khi mô tả là tiếng Anh', () => {
    expect(looksUntranslated('HAS: names the concept and gives an example', 'vi')).toBe(false);
    expect(looksUntranslated('CÓ: nêu đúng khái niệm', 'vi')).toBe(false);
  });
});
