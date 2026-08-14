import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { NotifyService } from '../../../core/notify.service';
import { PracticeSession as SessionData, SessionResult } from '../../../core/models';
import { PracticeSession } from './practice-session';

const URL = `${environment.apiBase}/interview/practice/sessions/s-1`;

function result(p: Partial<SessionResult> = {}): SessionResult {
  return {
    overallScore: 72.5,
    answeredCount: 3,
    totalQuestions: 3,
    criteriaScores: [],
    needsImprovement: [],
    ...p,
  };
}

function session(r: SessionResult | null): SessionData {
  return {
    id: 's-1',
    status: 'Scored',
    jobCategory: 'BA',
    createdAt: '2026-08-01T00:00:00Z',
    questions: [],
    result: r,
  } as unknown as SessionData;
}

/**
 * NHÃN THƯỚC ĐO trên màn kết quả.
 *
 * Vì sao cần: người luyện sửa rubric riêng cho lệch, điểm tụt, và **không một chữ nào** nói rằng
 * họ đang bị chấm bằng thước do chính họ đặt ⇒ họ kết luận hệ thống chấm sai.
 */
describe('PracticeSession — nhãn thước đo ở màn kết quả', () => {
  let httpMock: HttpTestingController;

  function setup(r: SessionResult | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PracticeSession);
    fixture.componentRef.setInput('sessionId', 's-1');
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === URL && req.method === 'GET').flush(session(r));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.match(() => true).forEach((r) => r.flush(session(null)));
    httpMock.verify();
  });

  it('rubric riêng có phiên bản → nói rõ nguồn KÈM số bản', () => {
    const fixture = setup(result({ rubricSource: 'Custom', rubricVersion: 3 }));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="ruler-note"]')?.textContent).toContain(
      'Chấm bằng rubric riêng của bạn (bản 3)',
    );
  });

  it('bộ chuẩn hệ thống → nói rõ là bộ chuẩn, không phải rubric riêng', () => {
    const fixture = setup(result({ rubricSource: 'SystemDefault', rubricVersion: 2 }));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="ruler-note"]')
        ?.textContent,
    ).toContain('Chấm bằng bộ chuẩn hệ thống (bản 2)');
  });

  /**
   * 🔴 `rubricVersion = null` nghĩa là **buổi cũ, chưa có con dấu**. Vẽ nó thành "bản 1" là bịa ra
   * một con số trông y hệt một dữ kiện, rồi người dùng đem so với các bản thật.
   */
  it('không có phiên bản → chỉ nói nguồn, TUYỆT ĐỐI không vẽ thành "bản 1"', () => {
    const fixture = setup(result({ rubricSource: 'Custom', rubricVersion: null }));
    const text =
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="ruler-note"]')
        ?.textContent ?? '';

    expect(text).toContain('Chấm bằng rubric riêng của bạn');
    expect(text).not.toContain('bản 1');
    expect(text).not.toContain('(bản');
  });

  /** Buổi trước khi có tính năng này không có `rubricSource` ⇒ không hiện gì, còn hơn đoán. */
  it('buổi cũ không có nguồn thước đo → không hiện dòng nào', () => {
    const fixture = setup(result());
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="ruler-note"]'),
    ).toBeNull();
    expect(fixture.componentInstance.rulerLabel(result())).toBeNull();
  });

  it('giá trị lạ từ backend → im lặng thay vì hiện một nhãn vô nghĩa', () => {
    const fixture = setup(result());
    const cmp = fixture.componentInstance;
    expect(cmp.rulerLabel(result({ rubricSource: 'Whatever' as never, rubricVersion: 9 }))).toBeNull();
  });
});
