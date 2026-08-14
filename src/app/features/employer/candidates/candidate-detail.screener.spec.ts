import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CandidateDetail } from './candidate-detail';
import { NotifyService } from '../../../core/notify.service';
import { CandidateDetailResponse, NO_EVIDENCE } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const CANDIDATE_ID = 'cand-1';
const DETAIL = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/candidates/${CANDIDATE_ID}`;

function candidate(partial: Partial<CandidateDetailResponse> = {}): CandidateDetailResponse {
  return {
    id: CANDIDATE_ID,
    fullName: 'Nguyễn Văn A',
    email: 'a@example.com',
    status: 'Analyzed',
    overallMatchScore: 75,
    skills: [],
    yearsExperience: 3,
    summary: null,
    rejectReason: null,
    cvFileUrl: null,
    screeningVersion: 2,
    fitSummary: 'Hợp phần backend.',
    strengths: [],
    gaps: [],
    bonusSignals: [],
    verifyQuestions: [],
    ...partial,
  } as CandidateDetailResponse;
}

/**
 * Màn kết quả sàng CV — HR technical screener. Điều HR cần không phải một con số mà là:
 * đáp ứng ở đâu (kèm TRÍCH DẪN từ CV), chưa thấy bằng chứng ở đâu, và có gì đáng nghi.
 */
describe('CandidateDetail — kết quả HR technical screener', () => {
  let httpMock: HttpTestingController;

  function setup(c: CandidateDetailResponse) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CandidateDetail);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentRef.setInput('candidateId', CANDIDATE_ID);
    fixture.detectChanges();
    httpMock.expectOne(DETAIL).flush(c);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? '';
  }

  it('đáp ứng nhu cầu hiện kèm TRÍCH DẪN từ CV — đó là thứ HR dùng để giải trình', () => {
    const fixture = setup(
      candidate({
        strengths: [
          {
            needId: 'n1',
            area: 'Backend .NET',
            level: 'Strong',
            evidence: '3 năm phát triển API .NET tại Cty X',
          },
        ],
      }),
    );
    expect(text(fixture)).toContain('Backend .NET');
    expect(text(fixture)).toContain('3 năm phát triển API .NET tại Cty X');
  });

  /**
   * 🔴 "Chưa thấy bằng chứng" KHÔNG được đọc thành "ứng viên không có". CV không nhắc tới là
   * chuyện thường — nhóm này chính là danh sách việc cần hỏi ở vòng phỏng vấn.
   */
  it('nhóm chưa thấy bằng chứng nói rõ đây là chỗ NÊN HỎI, không phải kết luận ứng viên yếu', () => {
    const fixture = setup(
      candidate({
        gaps: [{ needId: 'n2', area: 'Kafka', level: 'Weak', evidence: NO_EVIDENCE }],
      }),
    );
    expect(text(fixture)).toContain('Kafka');
    expect(text(fixture)).toContain(NO_EVIDENCE);
    expect(text(fixture)).toContain('nên hỏi khi phỏng vấn');
  });

  /**
   * 🔴 verificationRisk là cờ ĐỨNG CẠNH điểm, không nằm TRONG điểm. Điểm phải giữ nguyên khi rủi
   * ro cao — gộp hai thứ khác bản chất vào một con số là làm mất khả năng giải thích nó.
   */
  it('rủi ro cao → cảnh báo riêng, KHÔNG đụng vào điểm hiển thị', () => {
    const fixture = setup(candidate({ overallMatchScore: 90, verificationRisk: 'High' }));
    const t = text(fixture);
    expect(t).toContain('90');
    expect(t).toContain('thiếu dự án chống lưng');
  });

  it('rủi ro thấp → không hiện cảnh báo', () => {
    const fixture = setup(candidate({ verificationRisk: 'Low' }));
    expect(text(fixture)).not.toContain('thiếu dự án chống lưng');
  });

  /**
   * 🔴 Điểm chấm bằng thang CŨ (screeningVersion != 2) do mô hình tự phán trên thước buổi phỏng
   * vấn. Hai thang không so sánh được — để HR xếp chung một bảng mà không biết chính là cái lỗi
   * `scoring_scope_version`/BK23 sinh ra để chặn.
   */
  it('điểm thang cũ → nói rõ không so sánh trực tiếp được', () => {
    const fixture = setup(candidate({ overallMatchScore: 88, screeningVersion: 1 }));
    expect(text(fixture)).toContain('chấm bằng cách cũ');
  });

  it('điểm thang mới → KHÔNG hiện cảnh báo thang cũ', () => {
    const fixture = setup(candidate({ overallMatchScore: 88, screeningVersion: 2 }));
    expect(text(fixture)).not.toContain('chấm bằng cách cũ');
  });

  /**
   * Câu hỏi xác minh là gợi ý RIÊNG cho hồ sơ này. Phải nói rõ nó không vào bộ câu hỏi chung —
   * bộ chung là thứ khiến bảng xếp hạng so sánh được giữa các ứng viên (CAMP-10).
   */
  it('câu hỏi xác minh nói rõ không nằm trong bộ câu hỏi chung', () => {
    const fixture = setup(
      candidate({ verifyQuestions: ['Vai trò cụ thể trong dự án X?'] }),
    );
    const t = text(fixture);
    expect(t).toContain('Vai trò cụ thể trong dự án X?');
    expect(t).toContain('không nằm trong bộ câu hỏi chung');
  });
});
