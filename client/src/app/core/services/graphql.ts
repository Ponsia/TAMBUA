import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

interface GraphqlResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

export class GraphqlError extends Error {
  constructor(readonly errors: NonNullable<GraphqlResponse<unknown>['errors']>) {
    super(errors.map((error) => error.message).join('\n'));
    this.name = 'GraphqlError';
  }
}

@Injectable({ providedIn: 'root' })
export class Graphql {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    skipAuth = false,
  ): Observable<T> {
    return this.http
      .post<GraphqlResponse<T>>(
        this.config.graphqlUrl,
        {
          query,
          variables,
        },
        { context: new HttpContext().set(SKIP_AUTH, skipAuth) },
      )
      .pipe(
        timeout(30000),
        map((response) => {
          if (response.errors?.length) {
            throw new GraphqlError(response.errors);
          }
          if (response.data == null) {
            throw new Error('The server returned no data.');
          }
          return response.data;
        }),
      );
  }
}
