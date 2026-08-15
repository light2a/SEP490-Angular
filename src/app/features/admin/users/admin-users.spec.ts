import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdminUsers } from './admin-users';
import { NotifyService } from '../../../core/notify.service';
import { AdminUserResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const USERS = `${environment.apiBase}/auth/admin/users`;

function user(partial: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'u1',
    email: 'a@b.c',
    fullName: 'A B',
    role: 'Candidate',
    createdAt: '2026-01-01T00:00:00Z',
    bannedAt: null,
    banReason: null,
    ...partial,
  };
}

describe('AdminUsers — cấm / gỡ cấm / đặt lại mật khẩu (F20)', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialogResult: unknown;

  function setup(users: AdminUserResponse[] = [user()]) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotifyService, useValue: notify },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminUsers);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === USERS).flush(users);
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('POST .../ban kèm lý do và cập nhật dòng tại chỗ', () => {
    dialogResult = { reason: '  gian lận  ' };
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.ban(cmp.items()[0]);

    const req = httpMock.expectOne(`${USERS}/u1/ban`);
    expect(req.request.method).toBe('POST');
    // Lý do được trim; chuỗi rỗng phải thành null chứ không phải '' (BE nhận reason?: string|null).
    expect(req.request.body).toEqual({ reason: 'gian lận' });
    req.flush(user({ bannedAt: '2026-07-19T00:00:00Z', banReason: 'gian lận' }));

    expect(cmp.items()[0].bannedAt).toBeTruthy();
    expect(cmp.busy()).toBeNull();
  });

  it('lý do để trống → gửi null (không gửi chuỗi rỗng)', () => {
    dialogResult = { reason: null };
    const fixture = setup();
    fixture.componentInstance.ban(fixture.componentInstance.items()[0]);

    const req = httpMock.expectOne(`${USERS}/u1/ban`);
    expect(req.request.body).toEqual({ reason: null });
    req.flush(user({ bannedAt: '2026-07-19T00:00:00Z' }));
  });

  // Ban là hành động khó đảo → đóng hộp thoại mà không xác nhận PHẢI không gọi API.
  it('huỷ hộp thoại → KHÔNG gọi API cấm', () => {
    dialogResult = undefined;
    const fixture = setup();
    fixture.componentInstance.ban(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${USERS}/u1/ban`);
  });

  it('gỡ cấm gọi POST .../unban và cập nhật dòng', () => {
    dialogResult = true;
    const fixture = setup([user({ bannedAt: '2026-07-01T00:00:00Z', banReason: 'x' })]);
    const cmp = fixture.componentInstance;

    cmp.unban(cmp.items()[0]);
    const req = httpMock.expectOne(`${USERS}/u1/unban`);
    expect(req.request.method).toBe('POST');
    req.flush(user({ bannedAt: null, banReason: null }));

    expect(cmp.items()[0].bannedAt).toBeNull();
  });

  it('huỷ xác nhận gỡ cấm → KHÔNG gọi API', () => {
    dialogResult = false;
    const fixture = setup([user({ bannedAt: '2026-07-01T00:00:00Z' })]);
    fixture.componentInstance.unban(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${USERS}/u1/unban`);
  });

  it('đặt lại mật khẩu POST đúng body và xử lý được 204 (không có body trả về)', () => {
    dialogResult = { newPassword: 'Secret@123' };
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.resetPassword(cmp.items()[0]);
    const req = httpMock.expectOne(`${USERS}/u1/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ newPassword: 'Secret@123' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(notify['success']).toHaveBeenCalled();
    expect(cmp.busy()).toBeNull();
  });

  // Kết quả hộp thoại của hành động KHÁC không được lọt sang nhánh này: cả hai đều
  // trả object, chỉ khác tên trường — nếu chỉ kiểm tra "có kết quả" thì sẽ gửi
  // { newPassword: undefined } lên server.
  it('kết quả hộp thoại sai kiểu → không gọi API', () => {
    dialogResult = { reason: 'nhầm nhánh' };
    const fixture = setup();
    fixture.componentInstance.resetPassword(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${USERS}/u1/reset-password`);
  });

  it('lỗi từ server → báo lỗi và mở khoá nút (không kẹt busy)', () => {
    dialogResult = { reason: null };
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.ban(cmp.items()[0]);
    httpMock
      .expectOne(`${USERS}/u1/ban`)
      .flush({ error: 'Cannot ban the last active platform Admin' }, {
        status: 409,
        statusText: 'Conflict',
      });

    expect(notify['error']).toHaveBeenCalledWith('Cannot ban the last active platform Admin');
    expect(cmp.busy()).toBeNull();
  });

  // ── Đổi platform-role (AUTH-3) ───────────────────────────────────────────────
  it('POST .../role gửi đúng vai trò và cập nhật dòng tại chỗ', () => {
    dialogResult = { role: 'Employer' };
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.changeRole(cmp.items()[0]);

    const req = httpMock.expectOne(`${USERS}/u1/role`);
    expect(req.request.method).toBe('POST');
    // Tên gốc, KHÔNG phải nhãn tiếng Việt: server phân biệt hoa thường và chỉ nhận 3 chuỗi này.
    expect(req.request.body).toEqual({ role: 'Employer' });
    req.flush(user({ role: 'Employer' }));

    expect(cmp.items()[0].role).toBe('Employer');
    expect(cmp.busy()).toBeNull();
    expect(notify['success']).toHaveBeenCalled();
  });

  it('huỷ hộp thoại đổi vai trò → KHÔNG gọi API', () => {
    dialogResult = undefined;
    const fixture = setup();
    fixture.componentInstance.changeRole(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${USERS}/u1/role`);
  });

  // Cùng bẫy với reset-password ở trên: ba hành động đều trả object, chỉ khác tên trường.
  // Chỉ kiểm "có kết quả" thì sẽ gửi { role: undefined } lên server.
  it('kết quả hộp thoại của hành động khác → không gọi API đổi vai trò', () => {
    dialogResult = { newPassword: 'nhầm nhánh' };
    const fixture = setup();
    fixture.componentInstance.changeRole(fixture.componentInstance.items()[0]);
    httpMock.expectNone(`${USERS}/u1/role`);
  });

  it('409 khi còn thuộc tổ chức → hiện đúng lời server, không kẹt busy', () => {
    dialogResult = { role: 'Candidate' };
    const fixture = setup([user({ role: 'Employer', orgName: 'Acme' })]);
    const cmp = fixture.componentInstance;

    cmp.changeRole(cmp.items()[0]);
    httpMock.expectOne(`${USERS}/u1/role`).flush(
      { error: 'User is still a member of an organization — remove them from the organization first' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(notify['error']).toHaveBeenCalledWith(
      'User is still a member of an organization — remove them from the organization first',
    );
    expect(cmp.items()[0].role).toBe('Employer'); // dòng KHÔNG được đổi lạc quan
    expect(cmp.busy()).toBeNull();
  });

  /**
   * F24 — bảng 8 cột phải cuộn ngang TRONG khung của nó (không để cả trang cuộn ngang trên
   * mobile). Kiểm bằng CẤU TRÚC DOM chứ không đo pixel: jsdom không layout thật.
   */
  it('F24 — bảng nằm trong khung .tbl-wrap', () => {
    dialogResult = undefined;
    const fixture = setup();
    fixture.detectChanges();

    const table = (fixture.nativeElement as HTMLElement).querySelector('table[mat-table]');
    expect(table).not.toBeNull();
    const wrap = table!.closest('.tbl-wrap');
    expect(wrap).not.toBeNull();

    // Mặc định của overflowX là "visible", nên "auto" chứng minh style component đã áp thật.
    expect(getComputedStyle(wrap!).overflowX).toBe('auto');
    expect(getComputedStyle(table!).minWidth).toBe('880px');
  });
});
