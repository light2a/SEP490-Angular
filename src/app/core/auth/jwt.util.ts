import { OrgRole } from '../models/enums';

/**
 * Giải mã JWT (KHÔNG verify chữ ký — chỉ đọc claim để biết role/org, việc verify do backend làm).
 * Backend .NET dùng MapInboundClaims=false + ClaimTypes.Role, nên key claim có thể là URI dài.
 * → dò nhiều key cho mỗi loại claim.
 */

const ID_KEYS = [
  'sub',
  'nameid',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
];
const NAME_KEYS = [
  'unique_name',
  'name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
];
const ROLE_KEYS = [
  'role',
  'roles',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
];

export interface DecodedToken {
  raw: Record<string, unknown>;
  userId: string | null;
  name: string | null;
  roles: string[];
  orgId: string | null;
  orgRole: OrgRole | null;
  exp: number | null;
}

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  }
  return undefined;
}

function toStringArray(v: unknown): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

/** Base64URL decode an toàn với ký tự UTF-8. */
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const decoded = atob(b64 + pad);
  try {
    return decodeURIComponent(
      decoded
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return decoded;
  }
}

export function decodeJwt(token: string | null): DecodedToken | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
  const orgRole = pick(raw, ['org_role']);
  const expRaw = raw['exp'];
  return {
    raw,
    userId: (pick(raw, ID_KEYS) as string) ?? null,
    name: (pick(raw, NAME_KEYS) as string) ?? null,
    roles: toStringArray(pick(raw, ROLE_KEYS)),
    orgId: (pick(raw, ['org_id']) as string) ?? null,
    orgRole: (orgRole as OrgRole) ?? null,
    exp: typeof expRaw === 'number' ? expRaw : null,
  };
}

export function isExpired(decoded: DecodedToken | null, skewSeconds = 10): boolean {
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 < Date.now() + skewSeconds * 1000;
}
