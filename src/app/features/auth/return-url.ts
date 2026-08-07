/**
 * `returnUrl` cho phép trang mời B2B (/invite/:token) đưa người dùng đi đăng nhập/đăng ký rồi quay
 * lại đúng chỗ. Giá trị đến từ query string ⇒ do NGƯỜI NGOÀI kiểm soát, phải lọc trước khi đem
 * `navigateByUrl`.
 *
 * Chỉ nhận đường dẫn NỘI BỘ. Không lọc thì đây là lỗ mở-redirect: kẻ tấn công gửi
 * `/auth/login?returnUrl=//evil.com`, người dùng đăng nhập thật rồi bị đẩy sang host lạ dựng giống
 * ISAS — phiên vừa tạo bị lừa nhập lại ngay ở trang trông y như trang mình vừa qua.
 *
 * Chặn cả `//host` LẪN `/\host`: trình duyệt coi `/\evil.com` tương đương `//evil.com`
 * (protocol-relative), nên kiểm mỗi `//` là còn hở.
 */
export function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * Query param để CHUYỂN TIẾP returnUrl khi nhảy giữa login ↔ register. Thiếu vế này thì người dùng
 * bấm "Tạo tài khoản" từ trang login là mất đích quay lại, và lời mời B2B lại đứt lần nữa.
 * Trả `{}` (không phải `{returnUrl: null}`) khi không có — RouterLink sẽ serialize `null` thành
 * chuỗi "null" chứ không bỏ qua.
 */
export function returnUrlQuery(raw: unknown): Record<string, string> {
  const url = safeReturnUrl(raw);
  return url ? { returnUrl: url } : {};
}
