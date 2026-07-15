import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot } from '@angular/router';
import { authGuard, roleGuard } from './guards';
import { AuthStore } from '../auth/auth.store';

interface FakeAuthStore {
  isAuthenticated: () => boolean;
  hasRole: (...r: string[]) => boolean;
}

function configure(store: FakeAuthStore) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: store }],
  });
}

const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = { url: '/candidate/dashboard' } as RouterStateSnapshot;

describe('authGuard', () => {
  it('redirects to /auth/login (UrlTree) when unauthenticated', () => {
    configure({ isAuthenticated: () => false, hasRole: () => false });
    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.parseUrl('/auth/login'));
    expect(String(result)).toBe('/auth/login');
  });

  it('returns true when authenticated', () => {
    configure({ isAuthenticated: () => true, hasRole: () => false });
    const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, STATE));
    expect(result).toBe(true);
  });
});

describe("roleGuard('Candidate')", () => {
  it('allows (true) when authenticated with the role', () => {
    configure({ isAuthenticated: () => true, hasRole: (...r) => r.includes('Candidate') });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(result).toBe(true);
  });

  it('denies (UrlTree /) when authenticated without the role', () => {
    configure({ isAuthenticated: () => true, hasRole: () => false });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/');
  });

  it('redirects to /auth/login when unauthenticated', () => {
    configure({ isAuthenticated: () => false, hasRole: () => true });
    const guard = roleGuard('Candidate');
    const result = TestBed.runInInjectionContext(() => guard(ROUTE, STATE));
    expect(String(result)).toBe('/auth/login');
  });
});
