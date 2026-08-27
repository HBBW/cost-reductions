import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  return user ? true : router.createUrlTree(['/login']);
};

/** Guard per-halaman: roleGuard('FA','MR') */
export function roleGuard(...roles: string[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = await auth.ensureLoaded();
    if (!user) return router.createUrlTree(['/login']);
    return roles.includes(user.role) ? true : router.createUrlTree(['/dashboard']);
  };
}
