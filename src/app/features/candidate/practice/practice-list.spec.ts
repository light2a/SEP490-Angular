import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { FilesApi } from '../../../core/api/files.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { JD_TEXT_MAX_CHARS } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { PracticeList } from './practice-list';

/**
 * JD nhập TEXT ở màn tạo buổi luyện — quy ước C11 "text ưu tiên file".
 * Khoá hợp đồng gửi lên BE: có jdText → jdId phải là null (không để BE tự đoán).
 */
describe('PracticeList — JD dạng text', () => {
  let practiceApi: { create: ReturnType<typeof vi.fn>; history: ReturnType<typeof vi.fn> };
  let filesApi: { list: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    practiceApi = {
      create: vi.fn().mockReturnValue(of({ id: 's-1', status: 'Ready', jobCategory: 'BE' })),
      history: vi.fn().mockReturnValue(of([])),
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
});
