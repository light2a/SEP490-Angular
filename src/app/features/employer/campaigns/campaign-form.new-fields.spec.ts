import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { CampaignForm } from './campaign-form';

function campaign(partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 'c-1',
    orgId: 'o-1',
    title: 'Tuyển BE',
    domain: 'BE',
    seniority: 'Senior',
    status: 'Draft',
    maxCandidates: null,
    timeLimitMinutes: 30,
    maxConcurrentInterviews: 5,
    antiCheatEnabled: false,
    faceVerifyEnabled: false,
    passScorePct: null,
    adaptiveEnabled: false,
    maxFollowUps: null,
    maxQuestions: null,
    startsAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-30T00:00:00Z',
    jdText: 'JD',
    criteriaText: 'Ưu tiên kinh nghiệm hệ phân tán',
    criteria: [],
    jobNeeds: [],
    questions: [{ id: 'q-1', questionText: 'Câu 1', source: 'CustomHr', isRequired: true }],
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...partial,
  } as CampaignResponse;
}

/**
 * Ba field backend đã nhận từ lâu mà FE chưa có ô nhập: `seniority`, `criteriaText`,
 * `maxConcurrentInterviews`. Mỗi cái có một cách hỏng riêng phải khoá lại.
 */
describe('CampaignForm — cấp độ, mô tả tiêu chí, trần thi đồng thời', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getCampaign: vi.fn().mockReturnValue(of(campaign())),
      updateCampaign: vi.fn().mockReturnValue(of(campaign())),
      updateQuestions: vi.fn().mockReturnValue(of(campaign())),
      createCampaign: vi.fn().mockReturnValue(of(campaign())),
      // Biểu mẫu nay nhúng panel chấm thử — nó đọc lịch sử ngay lúc mở, nên mock phải có.
      getRubricPreviewRuns: vi.fn().mockReturnValue(of([])),
    };
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CampaignForm],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(true) }) },
        },
      ],
    });
  });

  function renderNew() {
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.detectChanges();
    return fixture;
  }

  function renderEditing(c: CampaignResponse = campaign()) {
    api['getCampaign'].mockReturnValue(of(c));
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.componentRef.setInput('campaignId', 'c-1');
    fixture.detectChanges();
    return fixture;
  }

  // ── seniority ───────────────────────────────────────────────────────────────
  it('tạo mới: mặc định Junior và ĐƯỢC GỬI LÊN (không để backend đoán)', () => {
    const cmp = renderNew().componentInstance;
    cmp.form.patchValue({ title: 'T' });
    cmp.questions.at(0).patchValue({ questionText: 'Q' });

    cmp.submit();

    expect(api['createCampaign'].mock.calls[0][0].seniority).toBe('Junior');
  });

  it('sửa: mức đã lưu được nạp lại và gửi đi nguyên vẹn', () => {
    const cmp = renderEditing().componentInstance;
    expect(cmp.form.controls.seniority.value).toBe('Senior');

    cmp.submit();

    expect(api['updateCampaign'].mock.calls[0][1].seniority).toBe('Senior');
  });

  /**
   * Ca then chốt: backend CỐ Ý trả 400 với chuỗi rỗng vì trước đó `''` âm thầm hạ mức đã chọn
   * về Junior. Có HAI lớp chặn và cả hai đều phải đứng — lớp dưới là thứ còn lại nếu ai đó gỡ
   * `Validators.required` khỏi ô chọn.
   */
  it('lớp 1 — ô cấp độ rỗng làm form invalid, KHÔNG gửi request nào', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.seniority.setValue('' as never);

    cmp.submit();

    expect(api['updateCampaign']).not.toHaveBeenCalled();
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('lớp 2 — dù lọt qua validator, payload BỎ HẲN field chứ không mang chuỗi rỗng', () => {
    const cmp = renderEditing().componentInstance;
    // Mô phỏng đúng ca mà lớp 2 sinh ra để đỡ: control giữ '' mà vẫn hợp lệ.
    cmp.form.controls.seniority.setValue('' as never);
    cmp.form.controls.seniority.clearValidators();
    cmp.form.controls.seniority.updateValueAndValidity();

    cmp.submit();

    const body = api['updateCampaign'].mock.calls[0][1];
    expect(body.seniority).toBeUndefined();
    expect(body.seniority).not.toBe('');
    expect('seniority' in body ? body.seniority : undefined).not.toBe('');
  });

  it('chiến dịch cũ không có seniority → về Junior, không để ô trống', () => {
    const cmp = renderEditing(campaign({ seniority: null })).componentInstance;
    expect(cmp.form.controls.seniority.value).toBe('Junior');
  });

  it('ô chọn cấp độ hiện đủ 4 mức trên màn', () => {
    const fixture = renderNew();
    expect(fixture.componentInstance.seniorityOptions.map((o) => o.value)).toEqual([
      'Fresher',
      'Junior',
      'Middle',
      'Senior',
    ]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cấp độ ứng viên');
  });

  // ── criteriaText ────────────────────────────────────────────────────────────
  it('mô tả tiêu chí được nạp lại khi sửa và gửi đi', () => {
    const cmp = renderEditing().componentInstance;
    expect(cmp.form.controls.criteriaText.value).toBe('Ưu tiên kinh nghiệm hệ phân tán');

    cmp.submit();

    expect(api['updateCampaign'].mock.calls[0][1].criteriaText).toBe(
      'Ưu tiên kinh nghiệm hệ phân tán',
    );
  });

  it('mô tả tiêu chí để trống → gửi null (không phải chuỗi rỗng)', () => {
    const cmp = renderEditing(campaign({ criteriaText: null })).componentInstance;
    cmp.submit();
    expect(api['updateCampaign'].mock.calls[0][1].criteriaText).toBeNull();
  });

  it('vượt 20.000 ký tự → form invalid, chặn trước khi gửi', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.criteriaText.setValue('x'.repeat(20_001));

    cmp.submit();

    expect(api['updateCampaign']).not.toHaveBeenCalled();
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('bộ đếm ký tự bám theo nội dung đang gõ', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.criteriaText.setValue('abcde');
    expect(cmp.criteriaTextLength()).toBe(5);
  });

  // ── maxConcurrentInterviews ─────────────────────────────────────────────────
  /**
   * 0 hợp lệ về kiểu nhưng làm guard backend `running >= max` đúng ngay từ ứng viên ĐẦU TIÊN
   * ⇒ mọi lượt Start trả 429 = khoá chiến dịch vĩnh viễn. Không lỗi nào khác bắt được ca này.
   */
  it('trần thi đồng thời = 0 → chặn, KHÔNG gửi request', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.maxConcurrentInterviews.setValue(0);

    cmp.submit();

    expect(api['updateCampaign']).not.toHaveBeenCalled();
    expect(notify['warn']).toHaveBeenCalledWith(expect.stringContaining('1 trở lên'));
  });

  it('trần âm → chặn, KHÔNG gửi request', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.maxConcurrentInterviews.setValue(-3);

    cmp.submit();

    expect(api['updateCampaign']).not.toHaveBeenCalled();
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('trần = 1 (biên hợp lệ) → gửi được', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.maxConcurrentInterviews.setValue(1);

    cmp.submit();

    expect(api['updateCampaign'].mock.calls[0][1].maxConcurrentInterviews).toBe(1);
  });

  it('để trống = không giới hạn → gửi null, không phải 0', () => {
    const cmp = renderEditing(campaign({ maxConcurrentInterviews: null })).componentInstance;

    cmp.submit();

    const body = api['updateCampaign'].mock.calls[0][1];
    expect(body.maxConcurrentInterviews).toBeNull();
    expect(body.maxConcurrentInterviews).not.toBe(0);
  });

  it('trần đã lưu được nạp lại khi sửa', () => {
    const cmp = renderEditing().componentInstance;
    expect(cmp.form.controls.maxConcurrentInterviews.value).toBe(5);
  });
  // ── language ────────────────────────────────────────────────────────────────
  /**
   * `language` mang ĐÚNG bẫy của `seniority` (BK35): backend coi `null` là "không khai" và mặc
   * định 'vi', nhưng trả **400** với chuỗi rỗng — trước đó `''` âm thầm hạ campaign 'en' về 'vi'.
   * Vì thế khoá cả hai lớp giống hệt seniority.
   */
  it('mặc định gửi vi khi HR không đổi gì', () => {
    const cmp = renderNew().componentInstance;
    cmp.form.patchValue({ title: 'T' });
    cmp.questions.at(0).patchValue({ questionText: 'Q' });

    cmp.submit();

    expect(api['createCampaign'].mock.calls[0][0].language).toBe('vi');
  });

  it('ngôn ngữ đã lưu được nạp lại khi sửa', () => {
    const cmp = renderEditing(campaign({ language: 'en' })).componentInstance;
    expect(cmp.form.controls.language.value).toBe('en');
  });

  it('lớp 1 — ô ngôn ngữ rỗng làm form invalid, KHÔNG gửi request nào', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.language.setValue('' as never);

    cmp.submit();

    expect(api['updateCampaign']).not.toHaveBeenCalled();
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('lớp 2 — dù lọt qua validator, payload BỎ HẲN field chứ không mang chuỗi rỗng', () => {
    const cmp = renderEditing().componentInstance;
    cmp.form.controls.language.setValue('' as never);
    cmp.form.controls.language.clearValidators();
    cmp.form.controls.language.updateValueAndValidity();

    cmp.submit();

    const body = api['updateCampaign'].mock.calls[0][1];
    expect(body.language).toBeUndefined();
    expect(body.language).not.toBe('');
  });
});
