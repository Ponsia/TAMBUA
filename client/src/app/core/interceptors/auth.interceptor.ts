import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from '../services/auth.service';
import { SKIP_AUTH } from '../services/graphql';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(API_CONFIG);
  const url = new URL(request.url, document.baseURI);
  const graphql = new URL(config.graphqlUrl, document.baseURI);
  const exports = new URL(config.exportsUrl, document.baseURI);
  const upload = new URL(config.uploadUrl, document.baseURI);
  const aiEngine = new URL(config.aiEngineUrl, document.baseURI);
  const trusted =
    (url.origin === upload.origin && url.pathname === upload.pathname) ||
    (url.origin === graphql.origin && url.pathname === graphql.pathname) ||
    (url.origin === exports.origin && url.pathname.startsWith(exports.pathname)) ||
    (url.origin === aiEngine.origin && url.pathname.startsWith(aiEngine.pathname));
  if (!trusted || request.context.get(SKIP_AUTH)) return next(request);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.isAuthenticated() ? auth.getToken() : null;
  const authenticatedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;
  const expireSession = () => {
    auth.logout();
    void router.navigateByUrl('/login');
  };

  return next(authenticatedRequest).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.body && typeof event.body === 'object') {
        const body = event.body as { errors?: { extensions?: { code?: string } }[] };
        if (body.errors?.some((error) => error.extensions?.code === 'UNAUTHENTICATED'))
          expireSession();
      }
    }),
    catchError((error) => {
      if (error.status === 401) expireSession();
      return throwError(() => error);
    }),
  );
};
