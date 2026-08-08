import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { PaymentApi } from '../../../core/api/payment.api';
import { PracticeApi } from '../../../core/api/practice.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { Dashboard } from './dashboard';

/**
 * Tổng quan trước đây là 7 thẻ TĨNH, không gọi API nào. Nay nó đọc số liệu thật, nên hai thứ phải
 * được khoá lại: (1) một API chết không được kéo sập cả trang, (2) "không đọc được số dư" không
 * được hiển thị thành "0 credit".
 */
describe('Dashboard — số liệu thật', () => {
  let paymentApi: { myAccount: ReturnType<typeof vi.fn> };
  let practiceApi: { history: ReturnType<typeof vi.fn> };
  let campaignApi: { myCampaigns: ReturnType<typeof vi.fn> };

  const session = (id: string, status = 'Scored') => ({
    id,
    status,
    jobCategory: 'BE',
    createdAt: new Date().toISOString(),
  });

  beforeEach(() => {
    paymentApi = { myAccount: vi.fn().mockReturnValue(of({ remainingCredits: 7 })) };
    practiceApi = { history: vi.fn().mockReturnValue(of([session('s1'), session('s2')])) };
    campaignApi = {
      myCampaigns: vi.fn().mockReturnValue(
        of([
          { campaignId: 'c1', title: 'Tuyển BE', jobTitle: 'BE', interviewStatus: 'NotStarted' },
          { campaignId: 'c2', title: 'Đã xong', jobTitle: 'FE', interviewStatus: 'Completed' },
        ]),
      ),
    };

    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: PaymentApi, useValue: paymentApi },
        { provide: PracticeApi, useValue: practiceApi },
        { provide: CampaignApi, useValue: campaignApi },
        { provide: AuthStore, useValue: { displayName: () => 'Duc' } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    return fixture;
  }

  it('hiện số dư credit thật', () => {
    const fixture = render();
    expect(fixture.componentInstance.credits()).toBe(7);
    expect(fixture.nativeElement.textContent).toContain('7');
    fixture.destroy();
  });

  it('chỉ đếm chiến dịch CHƯA hoàn thành (cái đã xong là lịch sử)', () => {
    const fixture = render();
    const open = fixture.componentInstance.openCampaigns();
    expect(open.length).toBe(1);
    expect(open[0].campaignId).toBe('c1');
    fixture.destroy();
  });

  /**
   * Ca quan trọng nhất: 0 và "không biết" là hai kết luận khác nhau. Hiện 0 cho người vẫn còn
   * credit là đẩy họ đi mua thêm một cách vô ích.
   */
  it('lỗi đọc ví → credits null (KHÔNG phải 0) và không hiện con số 0', () => {
    paymentApi.myAccount.mockReturnValue(throwError(() => new Error('down')));
    const fixture = render();

    expect(fixture.componentInstance.credits()).toBeNull();
    expect(fixture.componentInstance.credits()).not.toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Chưa đọc được số dư');

    fixture.destroy();
  });

  it('ví 0 credit thật → hiện 0 kèm nhắc nạp (khác hẳn ca không đọc được)', () => {
    paymentApi.myAccount.mockReturnValue(of({ remainingCredits: 0 }));
    const fixture = render();

    expect(fixture.componentInstance.credits()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Hết credit');
    expect(fixture.nativeElement.textContent).not.toContain('Chưa đọc được số dư');

    fixture.destroy();
  });

  it('một API chết KHÔNG kéo sập phần còn lại của trang', () => {
    campaignApi.myCampaigns.mockReturnValue(throwError(() => new Error('down')));
    practiceApi.history.mockReturnValue(throwError(() => new Error('down')));
    const fixture = render();

    // Ví vẫn đọc được, lối tắt vẫn còn → trang vẫn dùng được.
    expect(fixture.componentInstance.credits()).toBe(7);
    expect(fixture.componentInstance.campaigns()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Luyện phỏng vấn');

    fixture.destroy();
  });
});
