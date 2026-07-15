import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage, isPublicAuthUrl } from './http-utils';
import { environment } from '../../../environments/environment';

function errWith(error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ error, status: 400, statusText: 'Bad Request' });
}

describe('extractErrorMessage', () => {
  it('reads { message }', () => {
    expect(extractErrorMessage(errWith({ message: 'msg-field' }))).toBe('msg-field');
  });
  it('reads { error } then { title } as fallbacks', () => {
    expect(extractErrorMessage(errWith({ error: 'error-field' }))).toBe('error-field');
    expect(extractErrorMessage(errWith({ title: 'title-field' }))).toBe('title-field');
  });
  it('reads a plain string body', () => {
    expect(extractErrorMessage(errWith('plain text'))).toBe('plain text');
  });
  it('parses a JSON-string body', () => {
    expect(extractErrorMessage(errWith('{"message":"from-json"}'))).toBe('from-json');
  });
  it('reads an array of Identity errors [{ description }]', () => {
    expect(extractErrorMessage(errWith([{ description: 'Passwords must be at least 8.' }]))).toBe(
      'Passwords must be at least 8.',
    );
  });
  it('reads an array of strings', () => {
    expect(extractErrorMessage(errWith(['first-error', 'second']))).toBe('first-error');
  });
  it('returns null when there is no error body', () => {
    expect(extractErrorMessage(errWith(null))).toBeNull();
  });
});

describe('isPublicAuthUrl', () => {
  const base = environment.apiBase;
  it('is true for public auth endpoints', () => {
    for (const p of [
      'login',
      'register',
      'register-org',
      'refresh',
      'forgot-password',
      'verify-otp',
      'reset-password',
      'login-google',
    ]) {
      expect(isPublicAuthUrl(`${base}/auth/${p}`)).toBe(true);
    }
  });
  it('is false for authenticated / non-auth endpoints', () => {
    expect(isPublicAuthUrl(`${base}/auth/me`)).toBe(false);
    expect(isPublicAuthUrl(`${base}/interview/practice/sessions`)).toBe(false);
  });
});
