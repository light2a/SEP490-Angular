import { PlatformRole } from '../models';

/** Trang chủ mặc định theo role sau đăng nhập/đăng ký (Admin → console; Employer → khu HR; còn lại → ứng viên). */
export function homeRouteFor(role: PlatformRole | null): string {
  if (role === 'Admin') return '/admin/dashboard';
  if (role === 'Employer') return '/employer/dashboard';
  return '/candidate/dashboard';
}
