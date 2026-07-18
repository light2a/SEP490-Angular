/**
 * Lưu token ở localStorage (đơn giản cho capstone).
 * Tradeoff: localStorage đọc được bởi JS → rủi ro XSS. Bù lại: bền qua reload, dễ dùng.
 * Nâng cấp sau: refreshToken httpOnly cookie + accessToken in-memory (cần backend hỗ trợ).
 */
const AT_KEY = 'isas.accessToken';
const RT_KEY = 'isas.refreshToken';

/**
 * Tên key lộ ra ngoài để AuthStore lọc sự kiện `storage` (đồng bộ phiên giữa các tab) — chỉ quan tâm
 * hai key này, bỏ qua mọi key khác mà app/thư viện khác ghi vào localStorage.
 */
export const TOKEN_STORAGE_KEYS = { access: AT_KEY, refresh: RT_KEY } as const;

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
  /** Phiên chỉ có accessToken (join campaign B2B qua magic-link — backend không trả refreshToken). */
  setAccessOnly(access: string): void {
    localStorage.setItem(AT_KEY, access);
    localStorage.removeItem(RT_KEY);
  },
  clear(): void {
    localStorage.removeItem(AT_KEY);
    localStorage.removeItem(RT_KEY);
  },
};
