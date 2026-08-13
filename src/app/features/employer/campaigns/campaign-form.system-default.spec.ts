import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse } from '../../../core/models';
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
 * Hộp thoại tự nó — ba thứ bắt buộc phải nói ra trước khi HR bấm.
 */
describe('SystemDefaultCriteriaDialog', () => {
  function open(data: Partial<SystemDefaultCriteriaDialogData> = {}) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { currentCount: 0, domain: null, language: null, ...data },
        },
      ],
    });
    const fixture = TestBed.createComponent(SystemDefaultCriteriaDialog);
    fixture.detectChanges();
    return fixture;
  }

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

  /** Chưa chọn nghề thì không có gì để chép — nút phải khoá, không phải gọi rồi nhận 400. */
  it('chưa chọn nghề → không trả lựa chọn nào', () => {
    const cmp = open({ domain: 'Fullstack' }).componentInstance;
    expect(cmp.jobCategory()).toBeNull();
    expect(cmp.choice()).toBeNull();

    cmp.jobCategory.set('FE');
    expect(cmp.choice()).toEqual({ jobCategory: 'FE', language: 'vi' });
  });

  it('domain khớp mã nghề → điền sẵn, ngôn ngữ lấy theo chiến dịch', () => {
    const cmp = open({ domain: 'be', language: 'en' }).componentInstance;
    expect(cmp.jobCategory()).toBe('BE');
    expect(cmp.language()).toBe('en');
  });
});
