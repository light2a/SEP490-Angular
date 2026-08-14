import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignDetail } from './campaign-detail';
import { NotifyService } from '../../../core/notify.service';
import { CampaignResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const DETAIL = `${environment.apiBase}/campaign/${CAMPAIGN_ID}`;
const JOB_NEEDS = `${DETAIL}/job-needs`;

function campaign(partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: CAMPAIGN_ID,
    orgId: 'o1',
    title: 'Tuyển BE',
    domain: 'BE',
    language: 'vi',
    seniority: 'Junior',
    status: 'Draft',
    antiCheatEnabled: true,
    faceVerifyEnabled: false,
    adaptiveEnabled: false,
    groundingEnabled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    questions: [],
    criteria: [],
    jobNeeds: [],
    ...partial,
  } as unknown as CampaignResponse;
}

/**
 * NHU CẦU CÔNG VIỆC — thước đo dùng để SÀNG CV (khác "tiêu chí đánh giá" = thước chấm buổi phỏng
 * vấn). Chốt một lần cho cả chiến dịch để mọi ứng viên được đo bằng cùng một thước.
 */
describe('CampaignDetail — nhu cầu công việc (thước sàng CV)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(c: CampaignResponse) {
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignDetail);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne(DETAIL).flush(c);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('chưa chốt nhu cầu → nói rõ là CHƯA SÀNG CV ĐƯỢC, không im lặng hiện danh sách rỗng', () => {
    const fixture = setup(campaign({ jobNeeds: [] }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('chưa sàng CV được');
  });

  it('có nhu cầu → hiện kèm nhãn nhóm tiếng Việt', () => {
    const fixture = setup(
      campaign({
        jobNeeds: [
          { needId: 'n1', category: 'Technical', text: 'Thạo .NET', source: 'AiSuggested' },
          { needId: 'n2', category: 'Communication', text: 'Làm việc với khách', source: 'HrEdited' },
        ],
      }),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Thạo .NET');
    expect(text).toContain('Kỹ thuật');
    expect(text).toContain('Giao tiếp');
  });

  /**
   * 🔴 Sửa được chỉ khi Draft — CAMP-2. Đổi thước giữa chừng thì ứng viên sàng trước và sàng sau
   * không so sánh được với nhau nữa. Backend trả 409, nên FE phải ẩn hẳn lối vào thay vì để HR
   * bấm rồi ăn lỗi.
   */
  it('ngoài Draft → KHÔNG có nút sửa', () => {
    const fixture = setup(campaign({ status: 'Active' }));
    const btn = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="edit-job-needs"]');
    expect(btn).toBeNull();
  });

  it('Draft → có nút sửa', () => {
    const fixture = setup(campaign({ status: 'Draft' }));
    const btn = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="edit-job-needs"]');
    expect(btn).not.toBeNull();
  });

  /**
   * 🔴 Bản nháp phải CHÉP LẠI `needId`. Gửi lên id đang có thì kết quả sàng đã lưu còn trỏ đúng
   * dòng; đánh rơi id thì mỗi lần Lưu là thay id mới ⇒ mọi đánh giá đã chấm mất chỗ neo mà không
   * có gì báo lỗi (đúng lớp bug F10 đã bịt cho id câu hỏi chiến dịch).
   */
  it('sửa rồi lưu → GỬI LẠI needId đang có, không cấp id mới', () => {
    const fixture = setup(
      campaign({
        jobNeeds: [
          { needId: 'n1', category: 'Technical', text: 'Thạo .NET', source: 'AiSuggested' },
        ],
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.startEditNeeds(cmp.campaign()!);
    cmp.saveNeeds();

    const req = httpMock.expectOne(JOB_NEEDS);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual([
      { needId: 'n1', category: 'Technical', text: 'Thạo .NET' },
    ]);
    req.flush(campaign());
  });

  /**
   * 🔴 KHÔNG gửi `source`. Nguồn gốc là sự thật do server sở hữu — cho client khai thì HR tự dán
   * nhãn "AI đề xuất" cho dòng mình gõ tay (lỗ F10). Server bỏ qua giá trị client, nhưng FE cũng
   * không được gửi để hợp đồng nói đúng một điều.
   */
  it('payload lưu KHÔNG mang `source`', () => {
    const fixture = setup(
      campaign({
        jobNeeds: [
          { needId: 'n1', category: 'Technical', text: 'Thạo .NET', source: 'AiSuggested' },
        ],
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.startEditNeeds(cmp.campaign()!);
    cmp.saveNeeds();

    const req = httpMock.expectOne(JOB_NEEDS);
    for (const row of req.request.body as Record<string, unknown>[]) {
      expect(row['source']).toBeUndefined();
    }
    req.flush(campaign());
  });

  it('dòng để trống bị bỏ, không gửi lên server', () => {
    const fixture = setup(campaign());
    const cmp = fixture.componentInstance;
    cmp.startEditNeeds(cmp.campaign()!);
    cmp.addNeed();
    cmp.addNeed();
    cmp.needDrafts()[0].text = '  Thạo Kafka  ';
    cmp.needDrafts()[1].text = '   ';
    cmp.saveNeeds();

    const req = httpMock.expectOne(JOB_NEEDS);
    expect(req.request.body).toEqual([{ category: 'Technical', text: 'Thạo Kafka' }]);
    req.flush(campaign());
  });
});
