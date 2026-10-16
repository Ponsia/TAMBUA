import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/auth.model';
import { roleGuard } from './role-guard';

const routes: Record<UserRole, string> = {
  SYSTEM_OWNER_ADMIN: '/admin',
  WATCHLIST_MANAGER: '/watchlist-manager',
  INVESTIGATOR: '/investigator',
};

describe('Role access', () => {
  for (const allowed of Object.keys(routes) as UserRole[]) {
    for (const current of Object.keys(routes) as UserRole[]) {
      it(`${current} ${current === allowed ? 'can' : 'cannot'} enter ${allowed}`, () => {
        TestBed.configureTestingModule({
          providers: [
            provideRouter([]),
            {
              provide: AuthService,
              useValue: {
                isAuthenticated: () => true,
                getRole: () => current,
                getRoleRoute: (role: UserRole) => routes[role],
              },
            },
          ],
        });
        const result = TestBed.runInInjectionContext(() =>
          roleGuard(allowed)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
        );
        if (allowed === current) expect(result).toBe(true);
        else expect((result as UrlTree).toString()).toBe(routes[current]);
      });
    }
  }
  it('redirects expired sessions to login', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: () => false } },
      ],
    });
    const result = TestBed.runInInjectionContext(() =>
      roleGuard('INVESTIGATOR')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
