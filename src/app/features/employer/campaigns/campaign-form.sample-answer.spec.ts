import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse, ImportQuestionsResult, QuestionItem } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { CampaignForm } from './campaign-form';

/**
 * Đáp án mẫu + nhập câu hỏi từ file CSV + ngân hàng đề.
 *
 * Hợp đồng quan trọng nhất — và cũng là thứ dễ "dọn cho sạch" nhất rồi hỏng: backend hiểu BA trạng
 * thái cho `sampleAnswer`/`questionGroup`. Không gửi field = GIỮ NGUYÊN; chuỗi rỗng = XOÁ. Nếu form
 * "tối ưu" bằng cách bỏ field khi ô trống thì HR xoá đáp án xong bấm Lưu, đáp án cũ sống lại — mà
 * không có lỗi nào để họ hiểu vì sao.
 */
describe('CampaignForm — đáp án mẫu, nhập CSV, ngân hàng đề', () => {
  let api: {
    getCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    updateQuestions: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    importQuestions: ReturnType<typeof vi.fn>;
    downloadQuestionsTemplate: ReturnType<typeof vi.fn>;
  };
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  const campaign = {
    id: 'c-1',
    orgId: 'o-1',
    title: 'Tuyển BE',
    domain: 'BE',
    status: 'Draft',
    maxCandidates: null,
    timeLimitMinutes: 30,
    antiCheatEnabled: false,
    faceVerifyEnabled: false,
    passScorePct: null,
    adaptiveEnabled: false,
    maxFollowUps: null,
    maxQuestions: null,
    questionsPerSession: 20,
    startsAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-09-30T00:00:00Z',
    jdText: 'JD',
    criteriaText: null,
    criteria: [],
    questions: [
      {
        id: 'q-1',
        questionText: 'Index dùng để làm gì?',
        source: 'CustomHr',
        isRequired: true,
        sampleAnswer: 'Giúp tra cứu nhanh, đánh đổi bằng ghi chậm hơn.',
        questionGroup: 'CSDL',
      },
      {
        id: 'q-2',
        questionText: 'Kể một sự cố bạn từng xử lý.',
        source: 'AiGenerated',
        isRequired: false,
        sampleAnswer: null,
        questionGroup: null,
      },
    ],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  } as unknown as CampaignResponse;

  beforeEach(() => {
    api = {
      getCampaign: vi.fn().mockReturnValue(of(campaign)),
      updateCampaign: vi.fn().mockReturnValue(of(campaign)),
      updateQuestions: vi.fn().mockReturnValue(of(campaign)),
      createCampaign: vi.fn().mockReturnValue(of(campaign)),
      importQuestions: vi.fn(),
      downloadQuestionsTemplate: vi.fn().mockReturnValue(of(new Blob(['x']))),
    };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CampaignForm],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  function renderEditing() {
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.componentRef.setInput('campaignId', 'c-1');
    fixture.detectChanges();
    return fixture;
  }

  function savedQuestions(): QuestionItem[] {
    expect(api.updateQuestions).toHaveBeenCalledOnce();
    return api.updateQuestions.mock.calls[0][1] as QuestionItem[];
  }

  // ───────────────── đáp án mẫu: đọc / ghi / xoá ─────────────────

  it('nạp đáp án mẫu và nhóm từ server vào form', () => {
    const f = renderEditing();

    expect(f.componentInstance.questions.at(0).get('sampleAnswer')!.value).toBe(
      'Giúp tra cứu nhanh, đánh đổi bằng ghi chậm hơn.',
    );
    expect(f.componentInstance.questions.at(0).get('questionGroup')!.value).toBe('CSDL');
    // null từ server → chuỗi rỗng trong form (ô nhập không nhận null).
    expect(f.componentInstance.questions.at(1).get('sampleAnswer')!.value).toBe('');
  });

  it('đọc rồi lưu ngay thì đáp án mẫu KHÔNG bị mất', () => {
    // Vòng đọc→lưu là thao tác thường nhất của HR; mất dữ liệu ở đây thì mất âm thầm.
    const f = renderEditing();
    f.componentInstance.submit();

    const q1 = savedQuestions().find((q) => q.id === 'q-1');
    expect(q1?.sampleAnswer).toBe('Giúp tra cứu nhanh, đánh đổi bằng ghi chậm hơn.');
    expect(q1?.questionGroup).toBe('CSDL');
  });

  it('sửa đáp án mẫu thì gửi bản mới', () => {
    const f = renderEditing();
    f.componentInstance.questions.at(0).get('sampleAnswer')!.setValue('Đáp án đã biên tập');
    f.componentInstance.submit();

    expect(savedQuestions().find((q) => q.id === 'q-1')?.sampleAnswer).toBe('Đáp án đã biên tập');
  });

  it('xoá trắng ô đáp án thì GỬI chuỗi rỗng, không bỏ field', () => {
    // Đây là điểm sống còn của hợp đồng ba trạng thái: bỏ field = "giữ nguyên" ⇒ HR xoá xong bấm
    // Lưu mà đáp án cũ vẫn còn, không hiểu vì sao.
    const f = renderEditing();
    f.componentInstance.questions.at(0).get('sampleAnswer')!.setValue('');
    f.componentInstance.submit();

    const q1 = savedQuestions().find((q) => q.id === 'q-1');
    expect(q1).toHaveProperty('sampleAnswer');
    expect(q1?.sampleAnswer).toBe('');
  });

  it('câu chưa có đáp án vẫn gửi field (rỗng), không phải undefined', () => {
    const f = renderEditing();
    f.componentInstance.submit();

    const q2 = savedQuestions().find((q) => q.id === 'q-2');
    expect(q2?.sampleAnswer).toBe('');
  });

  it('vẫn KHÔNG gửi source — nguồn gốc do backend giữ (F10 không được regress)', () => {
    const f = renderEditing();
    f.componentInstance.submit();

    for (const q of savedQuestions()) expect(q.source).toBeUndefined();
  });

  it('vẫn echo id — câu AI không bị xoá-và-tạo-lại (F10 không được regress)', () => {
    const f = renderEditing();
    f.componentInstance.submit();

    expect(savedQuestions().map((q) => q.id)).toEqual(['q-1', 'q-2']);
  });

  // ───────────────── ngân hàng đề ─────────────────

  it('nạp và gửi lại số câu mỗi buổi', () => {
    const f = renderEditing();
    expect(f.componentInstance.form.controls.questionsPerSession.value).toBe(20);

    f.componentInstance.submit();
    expect(api.updateCampaign.mock.calls[0][1].questionsPerSession).toBe(20);
  });

  it('số câu mỗi buổi = 0 bị chặn ngay ở form', () => {
    // Backend cũng chặn, nhưng để lọt tới đó nghĩa là HR publish xong mới biết chiến dịch không ai
    // bắt đầu được.
    const f = renderEditing();
    f.componentInstance.form.controls.questionsPerSession.setValue(0);

    expect(f.componentInstance.form.controls.questionsPerSession.hasError('min')).toBe(true);
  });

  // ───────────────── nhập từ CSV ─────────────────

  const importResult: ImportQuestionsResult = {
    totalRows: 3,
    questions: [
      { questionText: 'Câu A', isRequired: true, sampleAnswer: 'Đáp A', questionGroup: 'Nhóm 1' },
      { questionText: 'Câu B', isRequired: false, sampleAnswer: '', questionGroup: '' },
    ],
    errors: [{ line: 4, column: 'question_text', message: 'Thiếu nội dung câu hỏi.' }],
  };

  function pick(fixture: ReturnType<typeof renderEditing>) {
    const file = new File(['x'], 'cau-hoi.csv', { type: 'text/csv' });
    fixture.componentInstance.onCsvPicked({ 0: file, length: 1, item: () => file } as unknown as FileList);
  }

  it('nhập file xong CHƯA lưu gì — chỉ hiện xem trước', () => {
    // Hợp đồng cốt lõi: backend chỉ đọc file. Gọi thẳng updateQuestions ở đây là bỏ qua bước xem
    // trước, và file hỏng mã hoá sẽ đi thẳng vào cơ sở dữ liệu.
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();

    pick(f);

    expect(f.componentInstance.importPreview()?.questions.length).toBe(2);
    expect(api.updateQuestions).not.toHaveBeenCalled();
  });

  it('xem trước hiện cả dòng lỗi kèm số dòng trong file', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();

    pick(f);

    expect(f.componentInstance.importPreview()?.errors[0].line).toBe(4);
  });

  it('"Thay toàn bộ" nạp đúng số câu và giữ đáp án mẫu', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();
    pick(f);

    f.componentInstance.applyImport('replace');

    expect(f.componentInstance.questions.length).toBe(2);
    expect(f.componentInstance.questions.at(0).get('sampleAnswer')!.value).toBe('Đáp A');
    expect(f.componentInstance.questions.at(0).get('questionGroup')!.value).toBe('Nhóm 1');
  });

  it('"Thêm vào cuối" giữ nguyên câu đang có', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();
    pick(f);

    f.componentInstance.applyImport('append');

    expect(f.componentInstance.questions.length).toBe(4);   // 2 cũ + 2 mới
    expect(f.componentInstance.questions.at(0).get('questionText')!.value).toBe(
      'Index dùng để làm gì?',
    );
  });

  it('câu nhập từ file KHÔNG mang id (backend hiểu là thêm mới)', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();
    pick(f);
    f.componentInstance.applyImport('replace');
    f.componentInstance.submit();

    for (const q of savedQuestions()) expect(q.id).toBeUndefined();
  });

  it('áp dụng xong thì đóng khung xem trước', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();
    pick(f);

    f.componentInstance.applyImport('replace');

    expect(f.componentInstance.importPreview()).toBeNull();
  });

  it('bấm Huỷ thì bỏ kết quả đọc, câu hỏi không đổi', () => {
    api.importQuestions.mockReturnValue(of(importResult));
    const f = renderEditing();
    pick(f);

    f.componentInstance.cancelImport();

    expect(f.componentInstance.importPreview()).toBeNull();
    expect(f.componentInstance.questions.length).toBe(2);
  });

  it('file hỏng thì hiện ĐÚNG thông báo của backend, không phải câu chung chung', () => {
    // Backend nói rõ sai gì và sửa thế nào ("lưu lại dạng CSV UTF-8") — nuốt mất là HR không biết
    // phải làm gì tiếp.
    api.importQuestions.mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 400,
        error: 'File không phải mã hoá UTF-8. Trong Excel chọn File → Save As → "CSV UTF-8".',
      })),
    );
    const f = renderEditing();

    pick(f);

    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('UTF-8'));
    expect(f.componentInstance.importPreview()).toBeNull();
  });

  it('không đọc được câu nào thì cảnh báo', () => {
    api.importQuestions.mockReturnValue(of({ totalRows: 2, questions: [], errors: [] }));
    const f = renderEditing();

    pick(f);

    expect(notify.warn).toHaveBeenCalled();
  });

  it('không chọn file thì không gọi API', () => {
    const f = renderEditing();

    f.componentInstance.onCsvPicked(null);

    expect(api.importQuestions).not.toHaveBeenCalled();
  });
});
