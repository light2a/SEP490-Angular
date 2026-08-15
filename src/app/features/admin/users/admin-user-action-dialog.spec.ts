import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  AdminUserActionData,
  AdminUserActionDialog,
} from './admin-user-action-dialog';

function setup(data: AdminUserActionData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(AdminUserActionDialog);
  fixture.detectChanges();
  return { cmp: fixture.componentInstance, close, fixture };
}

describe('AdminUserActionDialog — chế độ đổi vai trò', () => {
  it('mặc định chọn đúng vai trò hiện tại', () => {
    const { cmp } = setup({ mode: 'role', email: 'a@b.c', currentRole: 'Employer' });
    expect(cmp.role).toBe('Employer');
  });

  // "No role" (server trả khi user chưa có role nào) không nằm trong allowlist → chọn bừa nó
  // sẽ tạo một select có giá trị mà server chắc chắn trả 400.
  it('vai trò hiện tại lạ → lùi về Candidate thay vì giữ giá trị không gửi được', () => {
    const { cmp } = setup({ mode: 'role', email: 'a@b.c', currentRole: 'No role' });
    expect(cmp.role).toBe('Candidate');
  });

  it('chọn trùng vai trò hiện tại → báo lỗi, KHÔNG đóng hộp thoại', () => {
    const { cmp, close } = setup({ mode: 'role', email: 'a@b.c', currentRole: 'Admin' });
    cmp.role = 'Admin';

    cmp.confirmRole();

    // Server coi đây là no-op vô hại; để lọt thì admin nhận thông báo "đã đổi" trong khi
    // chẳng có gì đổi.
    expect(close).not.toHaveBeenCalled();
    expect(cmp.error()).toBeTruthy();
  });

  it('chọn vai trò khác → đóng với tên gốc (không phải nhãn tiếng Việt)', () => {
    const { cmp, close } = setup({ mode: 'role', email: 'a@b.c', currentRole: 'Candidate' });
    cmp.role = 'Employer';

    cmp.confirmRole();

    expect(close).toHaveBeenCalledWith({ role: 'Employer' });
    expect(cmp.error()).toBeNull();
  });

  it('nhãn hiển thị là tiếng Việt nhưng giá trị vẫn là 3 tên của AUTH-3', () => {
    const { cmp } = setup({ mode: 'role', email: 'a@b.c', currentRole: 'Candidate' });
    expect(cmp.roles).toEqual(['Candidate', 'Employer', 'Admin']);
    expect(cmp.roleLabel['Employer']).toBe('Nhà tuyển dụng');
  });
});
