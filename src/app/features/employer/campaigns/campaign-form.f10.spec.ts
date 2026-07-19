import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { CampaignResponse, QuestionItem } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { CampaignForm } from './campaign-form';

/**
 * F10 — HR sửa câu hỏi qua UI mà KHÔNG làm mất câu do AI sinh (F9).
 *
 * Trước F10, `buildQuestions()` gửi `source:'CustomHr'` cứng và KHÔNG gửi id ⇒ BE `Clear()` rồi
 * tạo lại toàn bộ với Guid mới ⇒ mỗi lần bấm Lưu là mọi câu `AiGenerated` mất nhãn + mất id.
 *
 * Khoá 3 điều: (a) id được echo lại; (b) không gửi `source` (nguồn gốc do BE giữ);
 * (c) câu HR mới thêm KHÔNG có id (để BE biết là thêm, không phải sửa).
 */
describe('CampaignForm — F10 trộn câu hỏi AI + HR', () => {
  let api: {
    getCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    updateQuestions: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
  };

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
    startsAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-30T00:00:00Z',
    jdText: 'JD',
    criteriaText: null,
    criteria: [],
    questions: [
      { id: 'q-ai', questionText: 'Câu AI sinh', source: 'AiGenerated', isRequired: true },
      { id: 'q-hr', questionText: 'Câu HR gõ', source: 'CustomHr', isRequired: true },
    ],
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  } as unknown as CampaignResponse;

  beforeEach(() => {
    api = {
      getCampaign: vi.fn().mockReturnValue(of(campaign)),
      updateCampaign: vi.fn().mockReturnValue(of(campaign)),
      updateQuestions: vi.fn().mockReturnValue(of(campaign)),
      createCampaign: vi.fn().mockReturnValue(of(campaign)),
    };

    TestBed.configureTestingModule({
      imports: [CampaignForm],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } },
      ],
    });
  });

  function renderEditing() {
    const fixture = TestBed.createComponent(CampaignForm);
    fixture.componentRef.setInput('campaignId', 'c-1');
    fixture.detectChanges();
    return fixture;
  }

  /** Payload câu hỏi mà component thực sự gửi lên `PUT /campaign/{id}/questions`. */
  function savedQuestions(): QuestionItem[] {
    expect(api.updateQuestions).toHaveBeenCalledOnce();
    return api.updateQuestions.mock.calls[0][1] as QuestionItem[];
  }

  it('gửi lại id của câu đang có → BE sửa tại chỗ, câu AI không mất nhãn', () => {
    const fixture = renderEditing();
    fixture.componentInstance.submit();

    const sent = savedQuestions();
    expect(sent.map((q) => q.id)).toEqual(['q-ai', 'q-hr']);
  });

  it('KHÔNG gửi source — nguồn gốc câu hỏi do BE giữ', () => {
    const fixture = renderEditing();
    fixture.componentInstance.submit();

    // Đây chính là dòng hardcode cũ (`source:'CustomHr'`) đã xoá sạch provenance của câu AI.
    for (const q of savedQuestions()) expect(q.source).toBeUndefined();
  });

  it('sửa nội dung câu AI vẫn giữ id của nó', () => {
    const fixture = renderEditing();
    fixture.componentInstance.questions.at(0).get('questionText')!.setValue('Câu AI đã biên tập');
    fixture.componentInstance.submit();

    const ai = savedQuestions().find((q) => q.id === 'q-ai');
    expect(ai?.questionText).toBe('Câu AI đã biên tập');
  });

  it('câu HR mới thêm không có id (BE hiểu là thêm mới, không phải sửa)', () => {
    const fixture = renderEditing();
    fixture.componentInstance.addQuestion();
    fixture.componentInstance.questions.at(2).get('questionText')!.setValue('Câu mới');
    fixture.componentInstance.submit();

    const sent = savedQuestions();
    expect(sent).toHaveLength(3);
    expect(sent[2].id).toBeUndefined();
    expect(sent[2].questionText).toBe('Câu mới');
  });

  it('xoá câu trên UI → không gửi id đó nữa (BE xoá theo)', () => {
    const fixture = renderEditing();
    fixture.componentInstance.removeQuestion(1);   // bỏ câu HR
    fixture.componentInstance.submit();

    expect(savedQuestions().map((q) => q.id)).toEqual(['q-ai']);
  });

  it('nhận diện được câu do AI sinh để hiển thị nhãn', () => {
    const fixture = renderEditing();
    expect(fixture.componentInstance.questionSource(0)).toBe('AiGenerated');
    expect(fixture.componentInstance.questionSource(1)).toBe('CustomHr');
  });
});
