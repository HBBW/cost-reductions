import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        const router = inject(Router);
        const url = router.url;
        if (!url.startsWith('/login')) {
          router.navigate(['/login'], { queryParams: { returnUrl: url } });
        }
      }
      return throwError(() => err);
    })
  );
};
