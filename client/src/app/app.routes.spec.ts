import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';

const workspaces = [
  ['admin', 'SYSTEM_OWNER_ADMIN'],
  ['watchlist-manager', 'WATCHLIST_MANAGER'],
  ['investigator', 'INVESTIGATOR'],
] as const;

describe('Workspace route protection', () => {
  for (const [path, allowedRole] of workspaces) {
    for (const level of ['canActivate', 'canActivateChild'] as const) {
      for (const role of [null, ...workspaces.map(([, role]) => role)]) {
        it(`${path} ${level} restricts access for ${role ?? 'a guest'}`, () => {
          TestBed.configureTestingModule({
            providers: [
              provideRouter([]),
              {
                provide: AuthService,
                useValue: {
                  isAuthenticated: () => role !== null,
                  getRole: () => role,
                  logout: () => {},
                  getRoleRoute: (value: string) =>
                    '/' + workspaces.find(([, role]) => role === value)![0],
                },
              },
            ],
          });
          const guards = routes.find((route) => route.path === path)![level]!;
          expect(guards.length).toBe(2);
          for (const guard of guards) {
            const result = TestBed.runInInjectionContext(() =>
              (guard as CanActivateFn)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
            );
            if (result !== true) {
              const destination =
                role === null ? '/login' : '/' + workspaces.find(([, value]) => value === role)![0];
              expect((result as UrlTree).toString()).toBe(destination);
              expect(role).not.toBe(allowedRole);
              return;
            }
          }
          expect(role).toBe(allowedRole);
        });
      }
    }
  }
});
