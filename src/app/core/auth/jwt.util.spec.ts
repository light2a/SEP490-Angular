import { decodeJwt, isExpired } from './jwt.util';

/** Dựng JWT hợp lệ về cấu trúc (header.payload.sig) — sig giả, chỉ cần payload base64url đọc được. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

const NAMEID_URI = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

describe('decodeJwt', () => {
  it('reads short claim keys (sub, role)', () => {
    const d = decodeJwt(makeJwt({ sub: 'user-1', role: 'Candidate' }));
    expect(d).not.toBeNull();
    expect(d!.userId).toBe('user-1');
    expect(d!.roles).toEqual(['Candidate']);
  });

  it('reads long .NET URI claim keys (nameidentifier, role)', () => {
    const d = decodeJwt(makeJwt({ [NAMEID_URI]: 'user-2', [ROLE_URI]: 'Admin' }));
    expect(d!.userId).toBe('user-2');
    expect(d!.roles).toEqual(['Admin']);
  });

  it('normalizes array roles to string[]', () => {
    const d = decodeJwt(makeJwt({ sub: 'u', role: ['Candidate', 'Employer'] }));
    expect(d!.roles).toEqual(['Candidate', 'Employer']);
  });

  it('reads org_id and org_role', () => {
    const d = decodeJwt(makeJwt({ sub: 'u', org_id: 'org-9', org_role: 'OrgAdmin' }));
    expect(d!.orgId).toBe('org-9');
    expect(d!.orgRole).toBe('OrgAdmin');
  });

  it('defaults missing claims to null / empty', () => {
    const d = decodeJwt(makeJwt({ foo: 'bar' }));
    expect(d!.userId).toBeNull();
    expect(d!.name).toBeNull();
    expect(d!.roles).toEqual([]);
    expect(d!.orgId).toBeNull();
    expect(d!.orgRole).toBeNull();
    expect(d!.exp).toBeNull();
  });

  it('returns null for null token or malformed token (< 2 parts)', () => {
    expect(decodeJwt(null)).toBeNull();
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true when exp is in the past', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(isExpired(decodeJwt(makeJwt({ sub: 'u', exp: past })))).toBe(true);
  });

  it('is false when exp is safely in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isExpired(decodeJwt(makeJwt({ sub: 'u', exp: future })))).toBe(false);
  });

  it('is false when there is no exp claim or decoded is null', () => {
    expect(isExpired(decodeJwt(makeJwt({ sub: 'u' })))).toBe(false);
    expect(isExpired(null)).toBe(false);
  });
});
