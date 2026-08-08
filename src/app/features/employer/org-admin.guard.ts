import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

/**
 * Chặn các khu chỉ dành cho OrgAdmin (quản thành viên · API key · billing).
 *
 * `employer-shell` vốn đã lọc các mục này khỏi sidenav, nhưng **lọc menu không phải phân quyền**:
 * HrMember gõ thẳng `/employer/members` hay `/employer/api-keys` vẫn vào được màn hình, thấy bố
 * cục và các nút, rồi mới ăn 403 khi bấm — tức FE hiện một màn lỗi thay vì chặn từ đầu.
 *
 * Đây là lớp UX, KHÔNG phải lớp bảo mật: quyền thật do backend enforce (A4 — HrMember gọi
 * endpoint billing → 403). Guard này chỉ đảm bảo cái người dùng thấy khớp với cái họ làm được.
 *
 * Sai quyền → về dashboard khu Employer (họ vẫn là Employer, chỉ không phải OrgAdmin) chứ không
 * về `/`: `/` sẽ đẩy sang khu ứng viên rồi bị guard ở đó đẩy ngược lại — đúng vòng lặp redirect
 * đã từng làm treo tab.
 */
export const orgAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.parseUrl('/auth/login');
  if (auth.orgRole() === 'OrgAdmin') return true;

  return router.parseUrl('/employer/dashboard');
};
