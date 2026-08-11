import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PlanAudience } from '../models';
import { PlanApi } from './plan.api';

const BASE = `${environment.apiBase}/payment/plans`;

describe('PlanApi (S11 — bảng giá gói phân tầng)', () => {
  let api: PlanApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PlanApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('catalog đi qua prefix gateway /payment/plans', () => {
    api.catalog().subscribe();
    expect(httpMock.expectOne(BASE).request.url).toBe(BASE);
  });

  /**
   * Payment giữ enum SỐ theo hợp đồng FE (`enums.ts`) — gửi tên `"B2C"` thì server VẪN bind được, nên
   * lỗi kiểu này không có triệu chứng cho tới khi ai đó đổi thứ tự enum. Khoá cứng giá trị số.
   */
  it('lọc audience gửi giá trị SỐ, không gửi tên', () => {
    api.catalog(PlanAudience.B2B).subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('audience')).toBe('1');

    httpMock.verify();
    api.catalog(PlanAudience.B2C).subscribe();
    expect(httpMock.expectOne((r) => r.url === BASE).request.params.get('audience')).toBe('0');
  });

  it('không truyền audience thì KHÔNG gắn tham số (lấy cả hai dòng)', () => {
    api.catalog().subscribe();
    expect(httpMock.expectOne(BASE).request.params.has('audience')).toBe(false);
  });

  it('mine() gọi /payment/plans/me', () => {
    api.mine().subscribe();
    expect(httpMock.expectOne(`${BASE}/me`).request.url).toBe(`${BASE}/me`);
  });
});
