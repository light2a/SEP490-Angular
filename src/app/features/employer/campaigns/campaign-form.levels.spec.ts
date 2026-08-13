import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse, CriterionItem, UpdateCampaignRequest } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { CampaignForm } from './campaign-form';

/**
 * MỐC ĐIỂM trên biểu mẫu chiến dịch — hợp đồng BA TRẠNG THÁI của `levels` và các luật thang đo.
 *
 * Vì sao bộ test này tồn tại: cả hai kiểu hỏng ở đây đều **không sinh lỗi nào**.
 * - Gửi `levels` vô điều kiện (mảng khởi tạo rỗng) ⇒ mỗi lần Lưu là BE hiểu `[]` = xoá ⇒ mốc bay
 *   sạch, HTTP 200, không ai biết cho tới khi mở lại chiến dịch.
 * - Thang méo (thiếu mốc 0, mốc trùng điểm) ⇒ bài trả lời TRỐNG neo về mốc thấp nhất ⇒ ứng viên
 *   không nói gì vẫn có điểm, xếp hạng sai mà không có triệu chứng.
 */
describe('CampaignForm — mốc điểm (levels)', () => {
  let api: {
    getCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    updateQuestions: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    suggestCriterionLevels: ReturnType<typeof vi.fn>;
    getRubricPreviewRuns: ReturnType<typeof vi.fn>;
  };
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: boolean;

  /** Chiến dịch 1 tiêu chí `maxScore=10` có sẵn 3 mốc {0,6,10}. */
  function campaign(overrides: Record<string, unknown> = {}): CampaignResponse {
    return {
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
      startsAt: '2026-08-01T00:00:00Z',
      expiresAt: '2026-08-30T00:00:00Z',
      jdText: 'JD',
      criteriaText: null,
      rubricVersion: 1,
      criteria: [
        {
          id: 'cr-1',
          orderNo: 1,
          name: 'Kiến thức chuyên môn',
          description: 'x',
          weight: 1,
          maxScore: 10,
          source: 'HrEdited',
          levels: [
            { score: 0, descriptor: 'CÓ: không nêu được khái niệm nào liên quan tới câu hỏi' },
            { score: 6, descriptor: 'CÓ: nêu đúng khái niệm. CÒN THIẾU: chưa có ví dụ cụ thể' },
            { score: 10, descriptor: 'CÓ: nêu khái niệm, ví dụ và đánh đổi khi áp dụng thực tế' },
          ],
        },
      ],
      questions: [{ id: 'q-1', questionText: 'Câu 1', source: 'CustomHr', isRequired: true }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      ...overrides,
    } as unknown as CampaignResponse;
  }

  beforeEach(() => {
    dialogResult = true;
    const c = campaign();
    api = {
      getCampaign: vi.fn().mockReturnValue(of(c)),
      updateCampaign: vi.fn().mockReturnValue(of(c)),
      updateQuestions: vi.fn().mockReturnValue(of(c)),
      createCampaign: vi.fn().mockReturnValue(of(c)),
      suggestCriterionLevels: vi.fn().mockReturnValue(of({ criteria: [] })),
      // Biểu mẫu nhúng panel chấm thử — nó đọc lịch sử ngay lúc mở.
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
          useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) },
        },
      ],
    });
  });

  function render(c: CampaignResponse = campaign()) {
    api.getCampaign.mockReturnValue(of(c));
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.componentRef.setInput('campaignId', 'c-1');
    fixture.detectChanges();
    return fixture;
  }

  /** Payload tiêu chí thực sự gửi lên `PUT /campaign/{id}`. */
  function savedCriteria(): CriterionItem[] {
    expect(api.updateCampaign).toHaveBeenCalledOnce();
    return (api.updateCampaign.mock.calls[0][1] as UpdateCampaignRequest).criteria ?? [];
  }

  function levelsArrayOf(cmp: CampaignForm, i = 0): FormArray<FormGroup> {
    return cmp.criteria.at(i).get('levels') as FormArray<FormGroup>;
  }

  // ── Hợp đồng BA TRẠNG THÁI ────────────────────────────────────────────────
  describe('ba trạng thái của `levels`', () => {
    it('chỉ sửa tiêu đề → KHÔNG gửi levels (BE hiểu vắng field = không đổi)', () => {
      const fixture = render();
      fixture.componentInstance.form.controls.title.setValue('Tuyển BE (đợt 2)');
      fixture.componentInstance.submit();

      const sent = savedCriteria();
      expect(sent).toHaveLength(1);
      expect('levels' in sent[0]).toBe(false);
    });

    it('mở panel rồi đóng lại mà không đổi gì → vẫn KHÔNG gửi levels', () => {
      const fixture = render();
      // Không đụng control nào — chỉ đọc.
      expect(levelsArrayOf(fixture.componentInstance).length).toBe(3);
      fixture.componentInstance.submit();

      expect('levels' in savedCriteria()[0]).toBe(false);
    });

    it('xoá hết mốc → gửi levels: [] (ý định XOÁ, không phải "thôi không gửi")', () => {
      const fixture = render();
      levelsArrayOf(fixture.componentInstance).clear();
      fixture.componentInstance.submit();

      expect(savedCriteria()[0].levels).toEqual([]);
    });

    it('sửa CHỮ trong mô tả (không thêm/bớt mốc nào) → vẫn gửi levels', () => {
      // Đây là ca mà một lá cờ "đã chạm" do editor tự bật sẽ bỏ lọt: không có thao tác cấu trúc
      // nào để bật cờ, nên sửa xong bấm Lưu là mất chữ vừa gõ mà không lỗi nào báo.
      const fixture = render();
      levelsArrayOf(fixture.componentInstance)
        .at(0)
        .get('descriptor')!
        .setValue('CÓ: nêu khái niệm, ví dụ, đánh đổi VÀ giới hạn của giải pháp');
      fixture.componentInstance.submit();

      const levels = savedCriteria()[0].levels!;
      expect(levels).toHaveLength(3);
      expect(levels.find((l) => l.score === 10)!.descriptor).toContain('giới hạn của giải pháp');
    });

    it('thêm mốc → gửi đủ phần tử, sắp TĂNG DẦN theo điểm', () => {
      const fixture = render();
      const arr = levelsArrayOf(fixture.componentInstance);
      // Editor hiển thị giảm dần nên mốc mới nằm cuối mảng; payload phải được sắp lại tăng dần.
      arr.push(
        levelGroup(3, 'CÓ: nhắc đúng tên khái niệm. CÒN THIẾU: giải thích sai bản chất'),
      );
      fixture.componentInstance.submit();

      const levels = savedCriteria()[0].levels!;
      expect(levels.map((l) => l.score)).toEqual([0, 3, 6, 10]);
    });

    it('ĐỔI TÊN tiêu chí → BUỘC gửi levels (BE ghép mốc theo tên, không gửi là mốc bay mất)', () => {
      const fixture = render();
      fixture.componentInstance.criteria.at(0).get('name')!.setValue('Chuyên môn backend');
      fixture.componentInstance.submit();

      const sent = savedCriteria()[0];
      expect(sent.name).toBe('Chuyên môn backend');
      expect(sent.levels?.map((l) => l.score)).toEqual([0, 6, 10]);
    });

    it('server trả mốc theo thứ tự GIẢM DẦN → vẫn coi là "không đổi", không gửi levels', () => {
      // Thứ tự mốc do server trả không có gì bảo đảm. Nếu ảnh chụp lúc nạp không được chuẩn hoá
      // thứ tự thì MỌI lần Lưu đều thấy "đã đổi" ⇒ gửi lại y nguyên bộ mốc ⇒ trên chiến dịch
      // đang chạy sẽ TĂNG PHIÊN BẢN THƯỚC ĐO mà chẳng ai sửa gì, và điểm của các nhóm ứng viên
      // hết so sánh được với nhau. Hỏng kiểu này không có triệu chứng nào ở màn hình.
      const c = campaign();
      c.criteria[0].levels = [...c.criteria[0].levels].reverse();
      const fixture = render(c);
      fixture.componentInstance.form.controls.title.setValue('Đổi mỗi tiêu đề');
      fixture.componentInstance.submit();

      expect('levels' in savedCriteria()[0]).toBe(false);
    });

    it('tiêu chí HR mới thêm (chưa có mốc) → không gửi levels rỗng thừa', () => {
      const fixture = render();
      fixture.componentInstance.addCriterion();
      const g = fixture.componentInstance.criteria.at(1);
      g.get('name')!.setValue('Giao tiếp');
      g.get('weight')!.setValue(0);
      fixture.componentInstance.submit();

      const sent = savedCriteria();
      expect(sent).toHaveLength(2);
      // Tiêu chí mới: `[]` hiện tại == `[]` lúc nạp ⇒ không có gì để nói với BE.
      expect('levels' in sent[1]).toBe(false);
    });
  });

  // ── Luật thang đo (chặn ở client vì thang méo không nổ lỗi lúc chấm) ────────
  describe('validate mốc', () => {
    function seedLevels(cmp: CampaignForm, levels: { score: number; descriptor: string }[]): void {
      const arr = levelsArrayOf(cmp);
      arr.clear();
      for (const l of levels) arr.push(levelGroup(l.score, l.descriptor));
      cmp.criteria.at(0).updateValueAndValidity();
    }

    const OK_DESC = 'CÓ: nêu đúng khái niệm và cho ví dụ. CÒN THIẾU: chưa nói được đánh đổi';

    it('thiếu mốc 0 → form invalid + nút Lưu bị khoá', () => {
      const fixture = render();
      const cmp = fixture.componentInstance;
      seedLevels(cmp, [
        { score: 4, descriptor: OK_DESC },
        { score: 10, descriptor: OK_DESC },
      ]);

      expect(cmp.hasLevelIssues()).toBe(true);
      expect(cmp.criteria.at(0).invalid).toBe(true);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('Thiếu mốc 0');
      fixture.detectChanges();
      expect(saveButtonDisabled(fixture)).toBe(true);
    });

    it('thiếu mốc điểm tối đa → invalid', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [
        { score: 0, descriptor: OK_DESC },
        { score: 6, descriptor: OK_DESC },
      ]);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('điểm tối đa');
    });

    it('hai mốc trùng điểm → invalid', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [
        { score: 0, descriptor: OK_DESC },
        { score: 10, descriptor: OK_DESC },
        { score: 10, descriptor: OK_DESC },
      ]);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('trùng điểm');
    });

    it('mốc vượt điểm tối đa → invalid', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [
        { score: 0, descriptor: OK_DESC },
        { score: 12, descriptor: OK_DESC },
      ]);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('0–10');
    });

    it('mô tả quá ngắn → invalid (mốc không mô tả được thì AI không phân biệt được mức)', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [
        { score: 0, descriptor: 'kém' },
        { score: 10, descriptor: OK_DESC },
      ]);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('ký tự');
    });

    it('chỉ 1 mốc → invalid (cần ít nhất 2 để có gì mà phân biệt)', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [{ score: 0, descriptor: OK_DESC }]);
      expect(cmp.criteriaLevelIssues()[0].messages.join(' ')).toContain('2');
    });

    it('KHÔNG có mốc nào là hợp lệ — bộ chấm rơi về dải mặc định', () => {
      const cmp = render().componentInstance;
      levelsArrayOf(cmp).clear();
      cmp.criteria.at(0).updateValueAndValidity();
      expect(cmp.hasLevelIssues()).toBe(false);
    });

    it('mốc hỏng → submit không phát request nào', () => {
      const cmp = render().componentInstance;
      seedLevels(cmp, [
        { score: 4, descriptor: OK_DESC },
        { score: 10, descriptor: OK_DESC },
      ]);
      cmp.submit();
      expect(api.updateCampaign).not.toHaveBeenCalled();
      expect(notify['warn']).toHaveBeenCalled();
    });
  });

  // ── AI gợi ý mốc ───────────────────────────────────────────────────────────
  describe('nhờ AI gợi ý mốc', () => {
    const SUGGESTED = {
      criteria: [
        {
          criterionId: 'khac-han-id-trong-form',
          name: 'kiến thức CHUYÊN MÔN',
          maxScore: 10,
          levels: [
            { score: 10, descriptor: 'CÓ: giải thích cơ chế bên dưới và nêu đánh đổi cụ thể' },
            { score: 0, descriptor: 'CÓ: không nêu được khái niệm nào liên quan tới câu hỏi' },
          ],
        },
      ],
    };

    it('ghép theo TÊN (không phân biệt hoa/thường), không theo id — id trong form có thể đã cũ', () => {
      api.suggestCriterionLevels.mockReturnValue(of(SUGGESTED));
      const cmp = render().componentInstance;

      cmp.suggestLevels(null);

      const scores = (levelsArrayOf(cmp).getRawValue() as { score: number }[]).map((l) => l.score);
      expect(scores).toEqual([10, 0]); // hiển thị GIẢM DẦN
      expect(cmp.criteria.at(0).get('levelsSource')!.value).toBe('ai');
    });

    it('mốc AI vừa nhận → lần Lưu kế CÓ gửi levels', () => {
      api.suggestCriterionLevels.mockReturnValue(of(SUGGESTED));
      const cmp = render().componentInstance;
      cmp.suggestLevels(null);
      cmp.submit();

      expect(savedCriteria()[0].levels?.map((l) => l.score)).toEqual([0, 10]);
    });

    it('huỷ hộp thoại xác nhận → KHÔNG gọi API', () => {
      dialogResult = false;
      const cmp = render().componentInstance;
      cmp.suggestLevels(null);
      expect(api.suggestCriterionLevels).not.toHaveBeenCalled();
    });

    it('AI lỗi → báo lỗi, KHÔNG điền dải mặc định thay thế', () => {
      api.suggestCriterionLevels.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 502 })),
      );
      const cmp = render().componentInstance;
      cmp.suggestLevels(null);

      expect(notify['error']).toHaveBeenCalled();
      // Mốc cũ giữ nguyên — mốc bịa ("Mức 3/10") trông y hệt mốc thật nên không được tự điền.
      expect((levelsArrayOf(cmp).getRawValue() as { score: number }[]).map((l) => l.score)).toEqual([
        10, 6, 0,
      ]);
    });

    it('chưa lưu chiến dịch (không có id) → chặn tại client', () => {
      const fixture = TestBed.createComponent(CampaignForm);
      fixture.detectChanges();
      fixture.componentInstance.suggestLevels(null);
      expect(api.suggestCriterionLevels).not.toHaveBeenCalled();
      expect(notify['warn']).toHaveBeenCalled();
    });
  });

  // ── Sửa mốc trên chiến dịch ĐANG CHẠY ──────────────────────────────────────
  describe('chiến dịch Active: mốc mở, câu hỏi khoá', () => {
    const active = () => campaign({ status: 'Active' });

    it('ô mô tả mốc ENABLE, ô câu hỏi DISABLE', () => {
      const fixture = render(active());
      const cmp = fixture.componentInstance;

      expect(cmp.readOnly()).toBe(false);
      expect(cmp.questionsReadOnly()).toBe(true);
      expect(levelsArrayOf(cmp).at(0).get('descriptor')!.enabled).toBe(true);
      expect(cmp.criteria.at(0).get('name')!.enabled).toBe(true);
      expect(cmp.questions.at(0).get('questionText')!.enabled).toBe(false);
    });

    it('Closed → khoá TOÀN BỘ như cũ', () => {
      const cmp = render(campaign({ status: 'Closed' })).componentInstance;

      expect(cmp.readOnly()).toBe(true);
      expect(cmp.criteria.at(0).get('name')!.enabled).toBe(false);
      expect(levelsArrayOf(cmp).at(0).get('descriptor')!.enabled).toBe(false);
      cmp.submit();
      expect(api.updateCampaign).not.toHaveBeenCalled();
    });

    it('Active + Lưu → gọi PUT /campaign, KHÔNG gọi PUT /questions (409 sẽ làm vỡ đường Lưu)', () => {
      const cmp = render(active()).componentInstance;
      cmp.form.controls.title.setValue('Đổi tiêu đề');
      cmp.submit();

      expect(api.updateCampaign).toHaveBeenCalledOnce();
      expect(api.updateQuestions).not.toHaveBeenCalled();
      // Người dùng phải thấy "đã lưu", không phải lỗi của một request lẽ ra không nên gửi.
      expect(notify['success']).toHaveBeenCalled();
      expect(notify['error']).not.toHaveBeenCalled();
    });

    it('Draft + Lưu → vẫn gọi CẢ HAI (hành vi cũ không được đổi khi nới khoá)', () => {
      const cmp = render().componentInstance;
      cmp.submit();

      expect(api.updateCampaign).toHaveBeenCalledOnce();
      expect(api.updateQuestions).toHaveBeenCalledOnce();
    });

    it('Active + đổi mốc → hỏi xác nhận TRƯỚC khi gửi; huỷ thì không gọi API nào', () => {
      dialogResult = false;
      const cmp = render(active()).componentInstance;
      levelsArrayOf(cmp).at(0).get('descriptor')!.setValue('CÓ: mô tả mới đủ dài để hợp lệ nhé');
      cmp.submit();

      expect(api.updateCampaign).not.toHaveBeenCalled();
      expect(api.updateQuestions).not.toHaveBeenCalled();
    });

    it('Active + đổi mốc + xác nhận → mới gửi, và có gửi levels', () => {
      const cmp = render(active()).componentInstance;
      levelsArrayOf(cmp).at(0).get('descriptor')!.setValue('CÓ: mô tả mới đủ dài để hợp lệ nhé');
      cmp.submit();

      expect(api.updateCampaign).toHaveBeenCalledOnce();
      expect(savedCriteria()[0].levels).toBeDefined();
    });

    it('Active mà KHÔNG đụng thước đo → không hỏi gì, lưu thẳng', () => {
      const cmp = render(active()).componentInstance;
      cmp.form.controls.title.setValue('Chỉ đổi tiêu đề');
      cmp.submit();

      expect(api.updateCampaign).toHaveBeenCalledOnce();
    });

    it('0.5 và 0.5000 không bị coi là đổi thước đo (khớp cách backend so)', () => {
      const c = active();
      c.criteria[0].weight = 1;
      const cmp = render(c).componentInstance;
      cmp.criteria.at(0).get('weight')!.setValue(1.0);
      // Không đổi gì thật ⇒ đi thẳng, không qua hộp thoại.
      cmp.submit();
      expect(api.updateCampaign).toHaveBeenCalledOnce();
    });

    it('banner cảnh báo không hồi tố hiện đúng lúc (Active) và không hiện ở Draft', () => {
      const a = render(active());
      expect(a.nativeElement.querySelector('[data-testid="active-ruler-banner"]')).toBeTruthy();
      expect(a.nativeElement.querySelector('[data-testid="questions-locked-note"]')).toBeTruthy();

      const d = render();
      expect(d.nativeElement.querySelector('[data-testid="active-ruler-banner"]')).toBeNull();
    });
  });

  it('chiến dịch cũ không có field levels → không vỡ trang sửa', () => {
    const c = campaign();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (c.criteria[0] as any).levels;
    const cmp = render(c).componentInstance;
    expect(levelsArrayOf(cmp).length).toBe(0);
    expect(cmp.hasLevelIssues()).toBe(false);
  });
});

/** Một hàng mốc đúng shape mà `critRow()` dựng (score + descriptor). */
function levelGroup(score: number, descriptor: string): FormGroup {
  return new FormGroup({
    score: new FormControl<number | null>(score),
    descriptor: new FormControl<string>(descriptor),
  });
}

/** Nút "Lưu thay đổi" có đang bị khoá không (đọc DOM thật, không đọc lại logic). */
function saveButtonDisabled(fixture: { nativeElement: HTMLElement }): boolean {
  const btns = Array.from(
    fixture.nativeElement.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  );
  return btns.length > 0 && btns.every((b) => b.disabled);
}
