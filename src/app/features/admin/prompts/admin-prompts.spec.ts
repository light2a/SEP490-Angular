import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import { PromptTemplateItem, promptKeyLabel } from '../../../core/models/admin-ops.models';
import { AdminPrompts } from './admin-prompts';

const LIST = `${environment.apiBase}/interview/admin/prompts`;

function item(partial: Partial<PromptTemplateItem> = {}): PromptTemplateItem {
  return {
    key: 'questions.guidance',
    version: 0,
    body: null,
    updatedBy: null,
    changeNote: null,
    createdAt: null,
    ...partial,
  };
}

describe('AdminPrompts — quản lý prompt đang chạy (F21)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: unknown;

  function setup(list: PromptTemplateItem[] = [item()]) {
    dialogResult = true;
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminPrompts);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === LIST && r.method === 'GET').flush(list);
    return fixture;
  }

  afterEach(() => httpMock.verify());

  /**
   * Override đang có hiệu lực với MỌI người dùng, nên "mảnh nào đang bị override" phải đọc được
   * ngay từ danh sách chứ không phải mở từng cái ra xem.
   */
  it('đếm đúng số mảnh đang tuỳ biến so với tổng', () => {
    const fixture = setup([
      item({ key: 'questions.guidance', version: 2, body: 'ngắn gọn thôi' }),
      item({ key: 'scoring.persona' }),
      item({ key: 'category.BE.guidance' }),
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.overriddenCount()).toBe(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Đã tuỳ biến · v2');
    expect(text).toContain('Mặc định');
  });

  /**
   * Reset GIỮ lịch sử ⇒ mảnh đã reset vẫn còn `version > 0`. Suy "đang override" từ version sẽ
   * báo sai là còn tuỳ biến trong khi nó đã quay về mặc định — `body` mới là sự thật.
   */
  it('mảnh đã reset (version>0 nhưng body null) tính là ĐANG DÙNG MẶC ĐỊNH', () => {
    const fixture = setup([item({ key: 'roadmap.guidance', version: 5, body: null })]);
    const cmp = fixture.componentInstance;

    expect(cmp.isOverridden(cmp.items()[0])).toBe(false);
    expect(cmp.overriddenCount()).toBe(0);
  });

  /**
   * Ô rỗng KHÔNG có nghĩa "prompt đang trống": bản mặc định nằm ở prompts.py và không hiện được ở
   * đây. Thiếu lời cảnh báo này, admin gõ vài dòng rồi lưu là đã âm thầm THAY THẾ toàn bộ bản mặc
   * định (kèm mọi ràng buộc viết trong đó).
   */
  it('mở mảnh chưa tuỳ biến → nói rõ bản mặc định không hiển thị được và sẽ bị thay thế', () => {
    const fixture = setup([item({ key: 'lesson_theory.guidance' })]);
    const cmp = fixture.componentInstance;

    cmp.edit(cmp.items()[0]);
    fixture.detectChanges();

    expect(cmp.bodyDraft).toBe('');
    const notice = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="default-notice"]',
    );
    expect(notice?.textContent).toContain('chưa ai tuỳ biến');
    expect(notice?.textContent).toContain('thay thế hoàn toàn');
  });

  it('mở mảnh đã tuỳ biến → nạp sẵn nội dung hiện tại, không hiện cảnh báo mặc định', () => {
    const fixture = setup([item({ key: 'questions.intro', version: 1, body: 'xin chào' })]);
    const cmp = fixture.componentInstance;

    cmp.edit(cmp.items()[0]);
    fixture.detectChanges();

    expect(cmp.bodyDraft).toBe('xin chào');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="default-notice"]'),
    ).toBeNull();
  });

  /** Lịch sử không có lý do thì nó chỉ còn là một đống văn bản — đúng lúc cần nhất thì vô dụng. */
  it('bắt buộc có lý do sửa mới cho lưu', () => {
    const fixture = setup([item({ version: 1, body: 'cũ' })]);
    const cmp = fixture.componentInstance;
    cmp.edit(cmp.items()[0]);

    cmp.bodyDraft = 'nội dung mới';
    cmp.changeNote = '   ';
    expect(cmp.canSave()).toBe(false);

    cmp.changeNote = 'rút ngắn câu hỏi';
    expect(cmp.canSave()).toBe(true);
  });

  it('lưu → PUT body đã trim + changeNote, rồi tải lại danh sách', () => {
    const fixture = setup([item({ key: 'questions.guidance', version: 1, body: 'cũ' })]);
    const cmp = fixture.componentInstance;
    cmp.edit(cmp.items()[0]);
    cmp.bodyDraft = '  câu hỏi ngắn 17-20 từ  ';
    cmp.changeNote = '  rút ngắn  ';

    cmp.save();

    const put = httpMock.expectOne(
      (r) => r.url === `${LIST}/questions.guidance` && r.method === 'PUT',
    );
    expect(put.request.body).toEqual({ body: 'câu hỏi ngắn 17-20 từ', changeNote: 'rút ngắn' });
    put.flush(item({ key: 'questions.guidance', version: 2, body: 'câu hỏi ngắn 17-20 từ' }));

    httpMock
      .expectOne((r) => r.url === LIST && r.method === 'GET')
      .flush([item({ key: 'questions.guidance', version: 2, body: 'câu hỏi ngắn 17-20 từ' })]);

    expect(notify['success']).toHaveBeenCalled();
    expect(cmp.overriddenCount()).toBe(1);
  });

  /** Có hiệu lực ngay với mọi người dùng ⇒ phải qua xác nhận; huỷ thì tuyệt đối không gửi gì. */
  it('huỷ ở hộp thoại xác nhận → KHÔNG gửi PUT', () => {
    const fixture = setup([item({ version: 1, body: 'cũ' })]);
    dialogResult = false;
    const cmp = fixture.componentInstance;
    cmp.edit(cmp.items()[0]);
    cmp.bodyDraft = 'mới';
    cmp.changeNote = 'thử';

    cmp.save();

    httpMock.expectNone((r) => r.method === 'PUT');
  });

  it('lỗi 400 từ backend hiện nguyên thông điệp (khoá lạ / delimiter cấm / quá dài)', () => {
    const fixture = setup([item({ version: 1, body: 'cũ' })]);
    const cmp = fixture.componentInstance;
    cmp.edit(cmp.items()[0]);
    cmp.bodyDraft = '---CV chèn bậy';
    cmp.changeNote = 'thử';

    cmp.save();
    httpMock
      .expectOne((r) => r.method === 'PUT')
      .flush(
        { message: "Nội dung prompt không được chứa '---CV'" },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(notify['error']).toHaveBeenCalledWith("Nội dung prompt không được chứa '---CV'");
    expect(cmp.saving()).toBe(false);
  });

  it('reset → DELETE rồi tải lại danh sách; đóng ô soạn thảo của chính khoá đó', () => {
    const fixture = setup([item({ key: 'roadmap.guidance', version: 3, body: 'tuỳ biến' })]);
    const cmp = fixture.componentInstance;
    cmp.edit(cmp.items()[0]);

    cmp.reset(cmp.items()[0]);

    httpMock
      .expectOne((r) => r.url === `${LIST}/roadmap.guidance` && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });

    httpMock
      .expectOne((r) => r.url === LIST && r.method === 'GET')
      .flush([item({ key: 'roadmap.guidance', version: 3, body: null })]);

    expect(cmp.selected()).toBeNull();
    expect(cmp.overriddenCount()).toBe(0);
    expect(notify['success']).toHaveBeenCalled();
  });

  it('xem lịch sử → GET .../history và hiện các version', () => {
    const fixture = setup([item({ key: 'scoring.persona', version: 2, body: 'b2' })]);
    const cmp = fixture.componentInstance;

    cmp.showHistory(cmp.items()[0]);

    httpMock
      .expectOne((r) => r.url === `${LIST}/scoring.persona/history` && r.method === 'GET')
      .flush([
        item({
          key: 'scoring.persona',
          version: 2,
          body: 'b2',
          changeNote: 'lần 2',
          createdAt: '2026-08-01T00:00:00Z',
        }),
        item({ key: 'scoring.persona', version: 1, body: 'b1', changeNote: 'lần 1' }),
      ]);

    fixture.detectChanges();
    expect(cmp.history().length).toBe(2);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('lần 1');
    expect(text).toContain('lần 2');
  });

  it('mảnh chưa từng sửa → lịch sử rỗng, hiện trạng thái trống', () => {
    const fixture = setup([item({ key: 'decide_next.guidance' })]);
    const cmp = fixture.componentInstance;

    cmp.showHistory(cmp.items()[0]);
    httpMock.expectOne((r) => r.url === `${LIST}/decide_next.guidance/history`).flush([]);

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('chưa từng được sửa');
  });

  it('nhãn khoá: khoá cố định có tên tiếng Việt, khoá theo nghề suy ra được, khoá lạ giữ nguyên', () => {
    expect(promptKeyLabel('scoring.persona')).toBe('Chấm điểm — vai giám khảo');
    expect(promptKeyLabel('category.BE.guidance')).toBe('Nghề BE — hướng dẫn riêng');
    expect(promptKeyLabel('category.FE.display_name')).toBe('Nghề FE — tên hiển thị');
    // BE thêm khoá mới mà FE chưa biết → hiện nguyên khoá, KHÔNG vỡ và không bịa tên.
    expect(promptKeyLabel('brand.new.key')).toBe('brand.new.key');
  });
});
