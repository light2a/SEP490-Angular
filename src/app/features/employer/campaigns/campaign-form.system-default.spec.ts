import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CampaignApi } from '../../../core/api/campaign.api';
import {
  CampaignResponse,
  JobCategory,
  SystemDefaultPreviewResponse,
} from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { CampaignForm } from './campaign-form';
import {
  SystemDefaultCriteriaChoice,
  SystemDefaultCriteriaDialog,
  SystemDefaultCriteriaDialogData,
  parseJobCategory,
} from './system-default-criteria-dialog';

/**
 * DÙNG BỘ CHUẨN THEO NGHỀ — lối tắt để chiến dịch có thước đo tử tế mà không phải tự nghĩ ra 7
 * tiêu chí rồi tự soạn mốc.
 *
 * Chỗ hỏng nguy hiểm nhất KHÔNG sinh lỗi nào: `domain` là chuỗi TỰ DO (`"Fullstack"`, `"QA"`,
 * `null`) trong khi bộ chuẩn chỉ có ba nghề. Đoán bừa (như sáu chỗ khác đang vá `?? "BE"`) nghĩa
 * là chấm ứng viên Frontend bằng thước đo Backend — HTTP 200, không có gì trên màn nói ra.
 */
describe('CampaignForm — dùng bộ chuẩn theo nghề', () => {
  let api: {
    getCampaign: ReturnType<typeof vi.fn>;
    copyCriteriaFromSystemDefault: ReturnType<typeof vi.fn>;
    getRubricPreviewRuns: ReturnType<typeof vi.fn>;
  };
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogData: SystemDefaultCriteriaDialogData | null;
  let dialogResult: SystemDefaultCriteriaChoice | null;

  function campaign(overrides: Record<string, unknown> = {}): CampaignResponse {
    return {
      id: 'c-1',
      orgId: 'o-1',
      title: 'Tuyển Fullstack',
      domain: 'Fullstack',
      language: 'en',
      status: 'Draft',
      maxCandidates: null,
      timeLimitMinutes: 30,
      antiCheatEnabled: false,
      faceVerifyEnabled: false,
      passScorePct: null,
      adaptiveEnabled: false,
      maxFollowUps: null,
      maxQuestions: null,
      startsAt: '2026-08-01T00:00:00Z',
      expiresAt: '2026-08-30T00:00:00Z',
      jdText: 'JD',
      criteriaText: null,
      rubricVersion: 1,
      criteria: [
        {
          id: 'cr-1',
          orderNo: 1,
          name: 'Tiêu chí HR tự gõ',
          description: '',
          weight: 1,
          maxScore: 10,
          source: 'HrEdited',
          levels: [],
        },
      ],
      questions: [{ id: 'q-1', questionText: 'Câu 1', source: 'CustomHr', isRequired: true }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      ...overrides,
    } as unknown as CampaignResponse;
  }

  function setup(c: CampaignResponse = campaign()) {
    dialogData = null;
    dialogResult = { jobCategory: 'BE', language: 'en' };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    api = {
      getCampaign: vi.fn().mockReturnValue(of(c)),
      copyCriteriaFromSystemDefault: vi.fn().mockReturnValue(of({})),
      getRubricPreviewRuns: vi.fn().mockReturnValue(of([])),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: notify },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: MatDialog,
          useValue: {
            open: (_c: unknown, cfg?: { data?: unknown }) => {
              dialogData = cfg?.data as SystemDefaultCriteriaDialogData;
              return { afterClosed: () => of(dialogResult) };
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.componentRef.setInput('campaignId', c.id);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * 🔴 Đây là phép đo trung tâm của cả tính năng. `domain = "Fullstack"` không khớp nghề nào ⇒ hộp
   * thoại KHÔNG được chọn sẵn gì, và nút xác nhận phải khoá tới khi HR tự chọn.
   */
  it('domain "Fullstack" → hộp thoại KHÔNG chọn sẵn nghề nào', () => {
    const fixture = setup();
    fixture.componentInstance.useSystemDefaultCriteria();

    expect(parseJobCategory(dialogData!.domain)).toBeNull();
    expect(dialogData!.currentCount).toBe(1);
  });

  it('domain khớp chính xác mã nghề mới được điền sẵn; mọi biến thể khác thì không', () => {
    expect(parseJobCategory('BE')).toBe('BE');
    expect(parseJobCategory(' be ')).toBe('BE');
    expect(parseJobCategory('Fullstack')).toBeNull();
    expect(parseJobCategory('QA')).toBeNull();
    expect(parseJobCategory('backend')).toBeNull();
    expect(parseJobCategory(null)).toBeNull();
    expect(parseJobCategory('')).toBeNull();
  });

  /** Ngôn ngữ khác `domain`: đó là giá trị enum CHÍNH XÁC của chính buổi phỏng vấn, không phải đoán. */
  it('ngôn ngữ điền sẵn theo chiến dịch, và gửi đúng lựa chọn của HR', () => {
    const fixture = setup();
    fixture.componentInstance.useSystemDefaultCriteria();

    expect(dialogData!.language).toBe('en');
    expect(api.copyCriteriaFromSystemDefault).toHaveBeenCalledWith('c-1', {
      jobCategory: 'BE',
      language: 'en',
    });
  });

  /** Huỷ = KHÔNG chạm server. Backend GHI thẳng nên không có đường lùi sau khi gọi. */
  it('huỷ hộp thoại → không gọi API', () => {
    const fixture = setup();
    dialogResult = null;
    fixture.componentInstance.useSystemDefaultCriteria();

    expect(api.copyCriteriaFromSystemDefault).not.toHaveBeenCalled();
  });

  /**
   * Backend GHI thẳng DB. Giữ nguyên form cũ thì màn hiện tiêu chí đã bị thay thế, và lần Lưu kế
   * tiếp sẽ ghi đè ngược lại chính bộ vừa chép — mất trắng, không lỗi nào báo.
   */
  it('chép xong → nạp lại chiến dịch từ server', () => {
    const fixture = setup();
    expect(api.getCampaign).toHaveBeenCalledTimes(1);

    fixture.componentInstance.useSystemDefaultCriteria();

    expect(api.getCampaign).toHaveBeenCalledTimes(2);
    expect(notify['success']).toHaveBeenCalled();
  });

  it('lỗi từ server → báo lỗi và mở khoá nút, không nạp lại', () => {
    const fixture = setup();
    api.copyCriteriaFromSystemDefault.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400 })),
    );

    fixture.componentInstance.useSystemDefaultCriteria();

    expect(notify['error']).toHaveBeenCalled();
    expect(api.getCampaign).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.copyingSystemDefault()).toBe(false);
  });

  /** Chưa lưu chiến dịch thì chưa có `{id}` để gọi — nói ra thay vì để nút chết không rõ lý do. */
  it('chiến dịch chưa lưu → không mở hộp thoại, nói rõ phải lưu trước', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignApi, useValue: { getCampaign: vi.fn(), getRubricPreviewRuns: vi.fn() } },
        {
          provide: NotifyService,
          useValue: (notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.detectChanges();

    expect(fixture.componentInstance.canUseSystemDefault()).toBe(false);
    fixture.componentInstance.useSystemDefaultCriteria();
    expect(notify['warn']).toHaveBeenCalled();
    expect(TestBed.inject(MatDialog).open).not.toHaveBeenCalled();
  });
});

/**
 * Hộp thoại tự nó — những thứ bắt buộc phải nói ra TRƯỚC khi HR bấm.
 *
 * Thao tác chép GHI THẲNG DB và thay thế toàn bộ tiêu chí đang có, nên "bấm rồi xem" không phải
 * một lựa chọn: phải xem trước được mình sắp chép về cái gì.
 */
describe('SystemDefaultCriteriaDialog', () => {
  let httpMock: HttpTestingController;

  const PREVIEW = `${environment.apiBase}/campaign/criteria/system-default/preview`;

  function preview(over: Partial<SystemDefaultPreviewResponse> = {}): SystemDefaultPreviewResponse {
    return {
      jobCategory: 'BE',
      language: 'vi',
      version: 4,
      criteria: [
        { name: 'Chiều sâu kỹ thuật', description: null, weight: 0.3, maxScore: 10, levelCount: 3 },
        { name: 'Giao tiếp & trình bày', description: null, weight: 0.2, maxScore: 5, levelCount: 4 },
      ],
      ...over,
    };
  }

  function open(data: Partial<SystemDefaultCriteriaDialogData> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { currentCount: 0, domain: null, language: null, ...data },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SystemDefaultCriteriaDialog);
    fixture.detectChanges();
    return fixture;
  }

  /** Trả lời lời gọi xem trước đang chờ, khẳng định luôn tham số gửi lên. */
  function flushPreview(
    job: JobCategory,
    lang: string,
    body: SystemDefaultPreviewResponse | null,
    status = 200,
  ) {
    const req = httpMock.expectOne(
      (r) =>
        r.url === PREVIEW &&
        r.method === 'GET' &&
        r.params.get('jobCategory') === job &&
        r.params.get('language') === lang,
    );
    if (status === 200) req.flush(body);
    else req.flush({ message: 'x' }, { status, statusText: 'Not Found' });
  }

  afterEach(() => httpMock.verify());

  /** Bộ chuẩn sinh ra cho LUYỆN TẬP; ở chiến dịch không có "chỉ chấm khi câu hỏi nhắm tới". */
  it('luôn nói bộ này vốn cho luyện tập và ở chiến dịch mọi tiêu chí đều được chấm', () => {
    const el = open().nativeElement as HTMLElement;
    const note = el.querySelector('[data-testid="sd-scope-note"]')?.textContent ?? '';
    expect(note).toContain('luyện tập');
    expect(note).toContain('mọi tiêu chí đều được chấm ở mọi câu');
  });

  it('đang có tiêu chí → cảnh báo sẽ THAY THẾ đúng số lượng', () => {
    const el = open({ currentCount: 4 }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sd-replace-warn"]')?.textContent).toContain(
      '4 tiêu chí',
    );
  });

  /** Chưa có tiêu chí nào thì không có gì bị mất — đừng doạ suông, cảnh báo sẽ mất trọng lượng. */
  it('chưa có tiêu chí nào → KHÔNG hiện cảnh báo thay thế', () => {
    const el = open({ currentCount: 0 }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sd-replace-warn"]')).toBeNull();
  });

  /** Chưa chọn nghề thì chưa có gì để xem trước — không gọi API, không cho chép. */
  it('chưa chọn nghề → không gọi xem trước, không trả lựa chọn nào', () => {
    const cmp = open({ domain: 'Fullstack' }).componentInstance;
    expect(cmp.jobCategory()).toBeNull();
    expect(cmp.canCopy()).toBe(false);
    expect(cmp.choice()).toBeNull();
    httpMock.expectNone((r) => r.url === PREVIEW);
  });

  /** Chọn nghề ⇒ gọi xem trước đúng tham số và liệt kê TÊN tiêu chí, không chỉ số lượng. */
  it('chọn nghề → gọi xem trước và hiện đủ tên tiêu chí kèm trọng số, số mốc', () => {
    const fixture = open({ language: 'vi' });
    const cmp = fixture.componentInstance;

    cmp.jobCategory.set('BE');
    fixture.detectChanges();
    flushPreview('BE', 'vi', preview());
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector('[data-testid="sd-preview"]')?.textContent ?? '';
    expect(box).toContain('Chiều sâu kỹ thuật');
    expect(box).toContain('Giao tiếp & trình bày');
    expect(box).toContain('30%');
    expect(box).toContain('3 mốc');
    expect(box).toContain('bản 4');
    expect(cmp.canCopy()).toBe(true);
    expect(cmp.choice()).toEqual({ jobCategory: 'BE', language: 'vi' });
  });

  /**
   * 🔴 `levelCount = 0` là trạng thái HỢP LỆ (quản trị viên chưa khai mốc) — tiêu chí đó rơi về dải
   * mặc định và vẫn chấm được. Chặn nút chép vì lý do này là hiểu một trạng thái bình thường thành
   * hỏng, và nghề nào admin mới soạn nửa chừng thì HR không dùng được gì cả.
   */
  it('tiêu chí chưa có mốc → gắn badge nhưng nút chép VẪN BẬT', () => {
    const fixture = open({ language: 'vi' });
    const cmp = fixture.componentInstance;

    cmp.jobCategory.set('BE');
    fixture.detectChanges();
    flushPreview(
      'BE',
      'vi',
      preview({
        criteria: [
          { name: 'Chiều sâu kỹ thuật', description: null, weight: 1, maxScore: 10, levelCount: 0 },
        ],
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sd-nolevels-0"]')?.textContent).toContain('chưa có mốc');
    expect(cmp.canCopy()).toBe(true);
    expect(
      (el.querySelector('[data-testid="sd-confirm"]') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  /**
   * 404 = *quản trị viên chưa soạn bộ này*, KHÁC hẳn một sự cố. Bộ chuẩn có 6 tổ hợp và nhiều khả
   * năng được soạn dần từng cái ⇒ đây là ca thật, phải nói ra được đường đi tiếp.
   */
  it('404 → thông báo riêng và KHOÁ nút chép, không phải lỗi đỏ chung chung', () => {
    const fixture = open({ language: 'vi' });
    const cmp = fixture.componentInstance;

    cmp.jobCategory.set('FE');
    fixture.detectChanges();
    flushPreview('FE', 'vi', null, 404);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sd-unavailable"]')?.textContent).toContain(
      'chưa soạn bộ chuẩn',
    );
    expect(el.querySelector('[data-testid="sd-error"]')).toBeNull();
    expect(cmp.canCopy()).toBe(false);
    expect(cmp.choice()).toBeNull();
    expect((el.querySelector('[data-testid="sd-confirm"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  /** Giữ danh sách cũ trong lúc chờ = để HR đọc tiêu chí của NGHỀ KHÁC rồi bấm chép. */
  it('đổi nghề → gọi lại xem trước, danh sách cũ biến mất ngay', () => {
    const fixture = open({ language: 'vi' });
    const cmp = fixture.componentInstance;

    cmp.jobCategory.set('BE');
    fixture.detectChanges();
    flushPreview('BE', 'vi', preview());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Chiều sâu kỹ thuật');

    cmp.jobCategory.set('BA');
    fixture.detectChanges();

    // Chưa có phản hồi mới: danh sách cũ PHẢI biến mất và nút chép phải khoá.
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Chiều sâu kỹ thuật');
    expect(cmp.canCopy()).toBe(false);

    flushPreview('BA', 'vi', preview({ jobCategory: 'BA', criteria: [] }));
  });

  /** Đổi ngôn ngữ cũng là đổi bộ — cùng một luật. */
  it('đổi ngôn ngữ → gọi lại xem trước với ngôn ngữ mới', () => {
    const fixture = open({ domain: 'BE', language: 'vi' });
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushPreview('BE', 'vi', preview());

    cmp.language.set('en');
    fixture.detectChanges();
    flushPreview('BE', 'en', preview({ language: 'en' }));
    expect(cmp.preview()?.language).toBe('en');
  });

  it('domain khớp mã nghề → điền sẵn và xem trước ngay, ngôn ngữ lấy theo chiến dịch', () => {
    const fixture = open({ domain: 'be', language: 'en' });
    const cmp = fixture.componentInstance;
    expect(cmp.jobCategory()).toBe('BE');
    expect(cmp.language()).toBe('en');
    flushPreview('BE', 'en', preview({ language: 'en' }));
  });
});
