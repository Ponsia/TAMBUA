import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

export function roleGuard(role: UserRole): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    const currentRole = auth.getRole();
    return (
      currentRole === role ||
      router.parseUrl(currentRole ? auth.getRoleRoute(currentRole) : '/login')
    );
  };
}
