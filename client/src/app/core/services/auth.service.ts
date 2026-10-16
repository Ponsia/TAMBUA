import { Router } from '@angular/router';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { AuthPayload, User, UserRole } from '../models/auth.model';
import { Graphql } from './graphql';

const ROLES: UserRole[] = ['SYSTEM_OWNER_ADMIN', 'WATCHLIST_MANAGER', 'INVESTIGATOR'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly graphql = inject(Graphql);
  private readonly tokenKey = 'tambua_token';
  private readonly userKey = 'tambua_user';
  private readonly currentUserSubject = new BehaviorSubject<User | null>(this.loadStoredUser());
  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.scheduleExpiry();
    this.destroyRef.onDestroy(() => clearTimeout(this.expiryTimer));
  }

  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const token = this.getToken();
    if (!token || !this.getCurrentUser()) return;
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
      if (typeof payload.exp !== 'number') return;
      this.expiryTimer = setTimeout(
        () => {
          this.logout();
          void this.router.navigateByUrl('/login');
        },
        Math.max(0, Math.min(payload.exp * 1000 - Date.now(), 2147483647)),
      );
    } catch {
      this.logout();
    }
  }

  login(email: string, password: string): Observable<AuthPayload> {
    return this.graphql
      .request<{ login: AuthPayload | null }>(
        `
          mutation Login($email: String!, $password: String!) {
            login(email: $email, password: $password) {
              token
              user { id email fullName role station }
            }
          }
        `,
        { email: email.trim(), password },
        true,
      )
      .pipe(
        map(({ login }) => {
          if (!login?.token || !this.isUser(login.user) || this.isTokenExpired(login.token)) {
            throw new Error('The server returned an invalid login session.');
          }
          try {
            sessionStorage.setItem(this.tokenKey, login.token);
            sessionStorage.setItem(this.userKey, JSON.stringify(login.user));
          } catch {
            this.logout();
            throw new Error('Browser session storage is unavailable. Enable it to sign in.');
          }
          this.currentUserSubject.next(login.user);
          this.scheduleExpiry();
          return login;
        }),
      );
  }

  /** Saves the signed-in officer's display name on the server. */
  updateProfile(fullName: string): Observable<User> {
    return this.graphql
      .request<{ updateMyProfile: User }>(
        `mutation UpdateMyProfile($fullName: String!) {
          updateMyProfile(fullName: $fullName) { id email fullName role station }
        }`,
        { fullName },
      )
      .pipe(
        map(({ updateMyProfile }) => {
          if (!this.isUser(updateMyProfile)) throw new Error('The server did not confirm the change.');
          try {
            sessionStorage.setItem(this.userKey, JSON.stringify(updateMyProfile));
          } catch {
            /* The in-memory session still reflects the change. */
          }
          this.currentUserSubject.next(updateMyProfile);
          return updateMyProfile;
        }),
      );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<boolean> {
    return this.graphql
      .request<{ changePassword: boolean }>(
        `mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
          changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
        }`,
        { currentPassword, newPassword },
      )
      .pipe(map((data) => data.changePassword === true));
  }

  logout(): void {
    clearTimeout(this.expiryTimer);
    try {
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem(this.userKey);
    } catch {
      this.currentUserSubject.next(null);
      return;
    }
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    try {
      return sessionStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getRole(): UserRole | null {
    return this.getCurrentUser()?.role ?? null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token || !this.getCurrentUser() || this.isTokenExpired(token)) {
      this.logout();
      return false;
    }
    return true;
  }

  getRoleRoute(role: UserRole): string {
    switch (role) {
      case 'SYSTEM_OWNER_ADMIN':
        return '/admin';
      case 'WATCHLIST_MANAGER':
        return '/watchlist-manager';
      case 'INVESTIGATOR':
        return '/investigator';
      default:
        return '/login';
    }
  }

  private loadStoredUser(): User | null {
    try {
      const token = this.getToken();
      const storedUser = sessionStorage.getItem(this.userKey);
      if (!token || this.isTokenExpired(token) || !storedUser) return null;
      const user: unknown = JSON.parse(storedUser);
      return this.isUser(user) ? user : null;
    } catch {
      return null;
    }
  }

  private isUser(value: unknown): value is User {
    if (!value || typeof value !== 'object') return false;
    const user = value as Partial<User>;
    return (
      typeof user.id === 'string' &&
      typeof user.email === 'string' &&
      typeof user.fullName === 'string' &&
      ROLES.includes(user.role as UserRole)
    );
  }

  private isTokenExpired(token: string): boolean {
    try {
      if (token.split('.').length !== 3) return true;
      const payloadPart = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(
        atob(payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')),
      );
      return (
        payload.exp !== undefined &&
        (typeof payload.exp !== 'number' ||
          !Number.isFinite(payload.exp) ||
          Date.now() >= payload.exp * 1000)
      );
    } catch {
      return true;
    }
  }
}
