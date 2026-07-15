/**
 * Lưu token ở localStorage (đơn giản cho capstone).
 * Tradeoff: localStorage đọc được bởi JS → rủi ro XSS. Bù lại: bền qua reload, dễ dùng.
 * Nâng cấp sau: refreshToken httpOnly cookie + accessToken in-memory (cần backend hỗ trợ).
 */
const AT_KEY = 'isas.accessToken';
const RT_KEY = 'isas.refreshToken';

export const tokenStorage = {
  get access(): string | null {
    return localStorage.getItem(AT_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(RT_KEY);
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(AT_KEY, access);
    localStorage.setItem(RT_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(AT_KEY);
    localStorage.removeItem(RT_KEY);
  },
};
