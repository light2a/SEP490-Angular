import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminOrganizations } from './admin-organizations';
import { NotifyService } from '../../../core/notify.service';
import { environment } from '../../../../environments/environment';

const ORGS = `${environment.apiBase}/auth/admin/organizations`;

/**
 * F24 — bảng admin phải cuộn ngang TRONG khung của nó. Kiểm bằng CẤU TRÚC DOM (bảng nằm trong
 * .tbl-wrap) chứ không đo pixel: jsdom không layout thật nên số đo ở đây là tự lừa mình.
 */
describe('AdminOrganizations — F24 bảng cuộn ngang trong khung', () => {
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
    const fixture = TestBed.createComponent(AdminOrganizations);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === ORGS)
      .flush([{ id: 'o1', name: 'ACME', taxCode: '123', memberCount: 3, createdAt: '2026-08-07T00:00:00Z' }]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const table = host.querySelector('table[mat-table]');
    expect(table).not.toBeNull();
    const wrap = table!.closest('.tbl-wrap');
    expect(wrap).not.toBeNull();

    // Khung bọc phải THẬT SỰ cuộn được — cấu trúc DOM đúng mà thiếu overflow-x thì bảng
    // vẫn tràn ra ngoài. Đây là vế mà phép kiểm cấu trúc một mình không phủ được.
    expect(getComputedStyle(wrap!).overflowX).toBe('auto');
    // Thiếu min-width thì bảng co vừa khung và cột bị bóp thay vì cuộn.
    expect(getComputedStyle(table!).minWidth).toBe('520px');
  });
});
