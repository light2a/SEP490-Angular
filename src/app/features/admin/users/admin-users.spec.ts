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
});
