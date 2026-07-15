import { HttpErrorResponse } from '@angular/common/http';

/** Rút message lỗi từ body backend ({ message } | { error } | chuỗi | mảng identity error). */
export function extractErrorMessage(err: HttpErrorResponse): string | null {
  const e = err.error;
  if (!e) return null;
  if (typeof e === 'string') {
    // đôi khi là JSON string
    try {
      const parsed = JSON.parse(e);
      return pickMessage(parsed);
    } catch {
      return e;
    }
  }
  return pickMessage(e);
}

function pickMessage(e: unknown): string | null {
  if (e == null) return null;
  if (typeof e === 'string') return e;
  if (Array.isArray(e)) {
    const first = e[0] as { description?: string } | string | undefined;
    if (typeof first === 'string') return first;
    return first?.description ?? null;
  }
  const obj = e as { message?: string; error?: string; title?: string };
  return obj.message ?? obj.error ?? obj.title ?? null;
}

/** Endpoint auth công khai (component tự hiển thị lỗi, interceptor không nuốt/redirect). */
export function isPublicAuthUrl(url: string): boolean {
  return /\/auth\/(login|register|register-org|refresh|forgot-password|verify-otp|reset-password|login-google)/.test(
    url,
  );
}
