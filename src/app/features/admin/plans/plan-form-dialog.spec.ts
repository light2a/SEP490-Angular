import {
  InterviewFunding,
  PlanAudience,
  PlanRequest,
  PlanResponse,
} from '../../../core/models';
import { blankPlan, fromPlan } from './plan-form-dialog';

function plan(partial: Partial<PlanResponse> = {}): PlanResponse {
  return {
    id: 'p1',
    audience: PlanAudience.B2C,
    code: 'pro',
    name: 'Pro',
    rank: 2,
    interviewFunding: InterviewFunding.Metered,
    monthlyQuota: 100,
    adaptiveEnabled: true,
    adaptiveMaxQuestions: 20,
    adaptiveMaxFollowups: 5,
    groundingEnabled: true,
    selfConsistencyN: 3,
    cvAnalysisIncluded: true,
    repoAnalysisIncluded: true,
    roadmapEnabled: true,
    maxQuestionsCap: 20,
    maxActiveCampaigns: 4,
    maxCandidatesCap: 200,
    postpaidEligible: true,
    seatCount: 5,
    entitlementsVersion: 2,
    isActive: true,
    ...partial,
  };
}

describe('PlanFormDialog — dựng request cho PUT (REPLACE toàn bộ)', () => {
  /**
   * PUT gán đè MỌI field từ body: field nào không được chép sang sẽ nhận giá trị mặc định của nó
   * và **ghi đè cấu hình thật của gói đang bán**. Nên phép kiểm ở đây không phải "chép vài field
   * quan trọng" mà là "không bỏ sót field nào" — so trên TẬP KHOÁ, để field thêm về sau mà quên
   * chép cũng bị bắt.
   */
  it('chép ĐỦ mọi field của PlanRequest, không bỏ sót', () => {
    const req = fromPlan(plan());
    expect(Object.keys(req).sort()).toEqual(Object.keys(blankPlan()).sort());
  });

  it('giữ nguyên giá trị đang có của gói (không rơi về mặc định)', () => {
    const p = plan();
    const req = fromPlan(p);

    // Nhóm dễ bị đánh rơi nhất: cờ bật/tắt và các trần dạng nullable.
    expect(req).toMatchObject<Partial<PlanRequest>>({
      audience: p.audience,
      code: 'pro',
      name: 'Pro',
      rank: 2,
      interviewFunding: InterviewFunding.Metered,
      monthlyQuota: 100,
      adaptiveEnabled: true,
      adaptiveMaxQuestions: 20,
      adaptiveMaxFollowups: 5,
      groundingEnabled: true,
      selfConsistencyN: 3,
      cvAnalysisIncluded: true,
      repoAnalysisIncluded: true,
      roadmapEnabled: true,
      maxQuestionsCap: 20,
      maxActiveCampaigns: 4,
      maxCandidatesCap: 200,
      postpaidEligible: true,
      seatCount: 5,
      entitlementsVersion: 2,
      isActive: true,
    });
  });

  /** `null` nghĩa là "không đặt trần", khác hẳn `0` = "trần bằng 0" (khoá sạch tính năng). */
  it('trần bỏ trống giữ null, KHÔNG biến thành 0', () => {
    const req = fromPlan(plan({ monthlyQuota: null, maxQuestionsCap: null, seatCount: null }));
    expect(req.monthlyQuota).toBeNull();
    expect(req.maxQuestionsCap).toBeNull();
    expect(req.seatCount).toBeNull();
  });

  it('mặc định gói mới khớp mặc định của backend', () => {
    const b = blankPlan();
    expect(b.selfConsistencyN).toBe(1);
    expect(b.entitlementsJson).toBe('[]');
    expect(b.entitlementsVersion).toBe(1);
    expect(b.isActive).toBe(true);
    expect(b.interviewFunding).toBe(InterviewFunding.Credit);
  });
});
