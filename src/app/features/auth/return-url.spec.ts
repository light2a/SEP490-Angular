import { returnUrlQuery, safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('nhận đường dẫn nội bộ', () => {
    expect(safeReturnUrl('/invite/tok-1')).toBe('/invite/tok-1');
    expect(safeReturnUrl('/candidate/campaigns/abc?x=1')).toBe('/candidate/campaigns/abc?x=1');
  });

  it('loại URL tuyệt đối sang host khác (mở-redirect)', () => {
    expect(safeReturnUrl('https://evil.com')).toBeNull();
    expect(safeReturnUrl('http://evil.com/invite/x')).toBeNull();
    // Không bắt đầu bằng '/' ⇒ navigateByUrl coi là đường dẫn tương đối, không phải host ngoài,
    // nhưng vẫn không phải đích ta phát ra → loại cho dứt khoát.
    expect(safeReturnUrl('invite/tok-1')).toBeNull();
  });

  it('loại protocol-relative — CẢ `//host` LẪN `/\\host`', () => {
    expect(safeReturnUrl('//evil.com')).toBeNull();
    expect(safeReturnUrl('//evil.com/invite/x')).toBeNull();
    // Trình duyệt coi `/\` tương đương `//`; kiểm mỗi `//` là còn hở đúng vector này.
    expect(safeReturnUrl('/\\evil.com')).toBeNull();
  });

  it('loại giá trị rỗng / không phải chuỗi', () => {
    expect(safeReturnUrl(null)).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
    expect(safeReturnUrl('')).toBeNull();
    // Query param trùng key → Angular trả mảng; mảng không phải đích điều hướng.
    expect(safeReturnUrl(['/invite/a', '/invite/b'])).toBeNull();
  });
});

describe('returnUrlQuery', () => {
  it('trả object rỗng khi không có returnUrl hợp lệ — KHÔNG phải {returnUrl: null}', () => {
    // RouterLink serialize `null` thành chuỗi "null" chứ không bỏ qua ⇒ phải là object rỗng.
    expect(returnUrlQuery(null)).toEqual({});
    expect(returnUrlQuery('//evil.com')).toEqual({});
  });

  it('chuyển tiếp returnUrl hợp lệ', () => {
    expect(returnUrlQuery('/invite/tok-1')).toEqual({ returnUrl: '/invite/tok-1' });
  });
});
