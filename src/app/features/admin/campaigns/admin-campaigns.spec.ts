import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminCampaigns } from './admin-campaigns';
import { NotifyService } from '../../../core/notify.service';
import { environment } from '../../../../environments/environment';

const CAMPAIGNS = `${environment.apiBase}/campaign/admin`;

/**
 * F24 — bảng admin phải cuộn ngang TRONG khung của nó. Kiểm bằng CẤU TRÚC DOM (bảng nằm trong
 * .tbl-wrap) chứ không đo pixel: jsdom không layout thật nên số đo ở đây là tự lừa mình.
 */
describe('AdminCampaigns — F24 bảng cuộn ngang trong khung', () => {
  let httpMock: HttpTestingController;

  afterEach(() => httpMock.verify());

  it('bảng nằm trong khung .tbl-wrap', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminCampaigns);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.startsWith(CAMPAIGNS)).flush([
      {
        id: 'c1',
        title: 'BE Junior',
        domain: 'BE',
        status: 'Active',
        orgId: '11111111-1111-1111-1111-111111111111',
        maxCandidates: 10,
        createdAt: '2026-08-07T00:00:00Z',
      },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const table = host.querySelector('table[mat-table]');
    expect(table).not.toBeNull();
    const wrap = table!.closest('.tbl-wrap');
    expect(wrap).not.toBeNull();

    // Khung bọc phải THẬT SỰ cuộn được (mặc định của overflowX là "visible", nên giá trị
    // "auto" ở đây chứng minh style của component đã được áp).
    expect(getComputedStyle(wrap!).overflowX).toBe('auto');
    expect(getComputedStyle(table!).minWidth).toBe('700px');
  });
});
