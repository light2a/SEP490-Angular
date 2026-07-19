import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { CampaignForm } from './campaign-form';
import { CampaignApi } from '../../../core/api/campaign.api';
import { environment } from '../../../../environments/environment';
import { CampaignResponse } from '../../../core/models';

const BASE = `${environment.apiBase}/campaign`;

function campaign(partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 'c1',
    orgId: 'o1',
    title: 'T',
    status: 'Draft',
    antiCheatEnabled: false,
    faceVerifyEnabled: false,
    adaptiveEnabled: false,
    jdText: 'JD nội dung',
    questions: [],
    criteria: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  } as CampaignResponse;
}

/** Hộp thoại xác nhận luôn trả `answer` — để test tách bạch "có hỏi" và "bấm gì". */
function stubDialog(answer: boolean) {
  return { open: () => ({ afterClosed: () => of(answer) }) };
}

describe('CampaignForm — câu hỏi AI (F9/F10)', () => {
  let httpMock: HttpTestingController;

  function setup(dialogAnswer = true) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: stubDialog(dialogAnswer) },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignForm);
    return fixture;
  }

  afterEach(() => httpMock.verify());

  // ── Bảo toàn nguồn gốc câu hỏi ────────────────────────────────────────────────
  // Đây là lỗi âm thầm nguy hiểm nhất: form vẫn lưu thành công, không báo lỗi gì,
  // nhưng dấu vết AiGenerated bị xoá sạch → badge biến mất và lần sinh lại kế tiếp
  // không còn biết câu nào là của AI để thay.
  it('giữ nguyên source AiGenerated khi lưu (không gán cứng CustomHr)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();

    httpMock.expectOne(`${BASE}/c1`).flush(
      campaign({
        questions: [
          { id: 'q1', questionText: 'AI hỏi', source: 'AiGenerated', isRequired: true },
          { id: 'q2', questionText: 'HR hỏi', source: 'CustomHr', isRequired: true },
        ],
      }),
    );

    const sent = cmp['buildQuestions']();
    expect(sent.map((q) => q.source)).toEqual(['AiGenerated', 'CustomHr']);
  });

  it('câu HR tự thêm mới mặc định là CustomHr', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.addQuestion();
    cmp.questions.at(cmp.questions.length - 1).get('questionText')!.setValue('Câu mới');

    const sent = cmp['buildQuestions']();
    expect(sent[sent.length - 1].source).toBe('CustomHr');
  });

  it('isAiQuestion() nhận đúng câu do AI sinh (nguồn của badge)', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();

    httpMock.expectOne(`${BASE}/c1`).flush(
      campaign({
        questions: [
          { id: 'q1', questionText: 'AI', source: 'AiGenerated', isRequired: true },
          { id: 'q2', questionText: 'HR', source: 'CustomHr', isRequired: true },
        ],
      }),
    );

    expect(cmp.isAiQuestion(0)).toBe(true);
    expect(cmp.isAiQuestion(1)).toBe(false);
  });

  // ── Gọi sinh câu hỏi ──────────────────────────────────────────────────────────
  it('gọi POST /questions/generate kèm count và nạp lại danh sách trả về', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign());

    cmp.aiCount.set(5);
    cmp.generateQuestions();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/c1/questions/generate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('count')).toBe('5');
    req.flush(
      campaign({
        questions: [{ id: 'g1', questionText: 'AI sinh', source: 'AiGenerated', isRequired: true }],
      }),
    );

    expect(cmp.questions.length).toBe(1);
    expect(cmp.isAiQuestion(0)).toBe(true);
    expect(cmp.generating()).toBe(false);
  });

  it('ô số câu để trống → KHÔNG gửi param count (để backend tự quyết, không phải 0)', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign());

    cmp.onAiCountInput('');
    expect(cmp.aiCount()).toBeNull();

    cmp.generateQuestions();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/c1/questions/generate`);
    expect(req.request.params.has('count')).toBe(false);
    req.flush(campaign());
  });

  it('bấm Huỷ ở hộp thoại xác nhận → KHÔNG gọi API', () => {
    const fixture = setup(false);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign());

    cmp.generateQuestions();
    httpMock.expectNone((r) => r.url === `${BASE}/c1/questions/generate`);
  });

  // ── Chặn trước những ca backend sẽ từ chối ────────────────────────────────────
  it('JD rỗng → chặn tại chỗ, không bắn request (backend sẽ 400)', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign({ jdText: '' }));

    cmp.generateQuestions();
    httpMock.expectNone((r) => r.url === `${BASE}/c1/questions/generate`);
  });

  it('count ngoài 1..20 → chặn tại chỗ, không bắn request (backend sẽ 400)', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign());

    cmp.aiCount.set(50);
    cmp.generateQuestions();
    httpMock.expectNone((r) => r.url === `${BASE}/c1/questions/generate`);
  });

  it('campaign đã Active (readOnly) → không cho sinh (CAMP-2, backend sẽ 409)', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/c1`).flush(campaign({ status: 'Active' }));

    expect(cmp.readOnly()).toBe(true);
    expect(cmp.canGenerate()).toBe(false);
    cmp.generateQuestions();
    httpMock.expectNone((r) => r.url === `${BASE}/c1/questions/generate`);
  });

  it('chưa lưu chiến dịch (chưa có id) → không cho sinh', () => {
    const fixture = setup(true);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    expect(cmp.canGenerate()).toBe(false);
    cmp.generateQuestions();
    httpMock.expectNone((r) => r.url.includes('/questions/generate'));
  });
});
