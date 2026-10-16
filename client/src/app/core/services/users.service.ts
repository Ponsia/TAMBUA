import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { UserRole } from '../models/auth.model';
import { Graphql } from './graphql';

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  station: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  station: string | null;
}

export interface UpdateUserInput {
  fullName: string;
  role: UserRole;
  station: string;
}

const USER_FIELDS = 'id email fullName role station isActive createdAt';

/** System-owner administration of officer accounts. */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly graphql = inject(Graphql);

  private page(offset: number, limit = 100): Observable<{ items: ManagedUser[]; totalCount: number }> {
    return this.graphql
      .request<{ users: { items: ManagedUser[]; totalCount: number } }>(
        `query Users($limit: Int!, $offset: Int!) {
          users(limit: $limit, offset: $offset) { items { ${USER_FIELDS} } totalCount }
        }`,
        { limit, offset },
      )
      .pipe(map((data) => data.users));
  }

  all(): Observable<ManagedUser[]> {
    return this.page(0).pipe(
      map((page) => ({ ...page, next: page.items.length })),
      expand((page) =>
        page.next >= page.totalCount || !page.items.length
          ? EMPTY
          : this.page(page.next).pipe(map((next) => ({ ...next, next: page.next + next.items.length }))),
      ),
      reduce((users, page) => [...users, ...page.items], [] as ManagedUser[]),
    );
  }

  create(input: CreateUserInput): Observable<ManagedUser> {
    return this.mutate('createUser', 'mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { FIELDS } }', { input });
  }

  update(id: string, input: UpdateUserInput): Observable<ManagedUser> {
    return this.mutate('updateUser', 'mutation UpdateUser($id: ID!, $input: UpdateUserInput!) { updateUser(id: $id, input: $input) { FIELDS } }', { id, input });
  }

  setActive(id: string, active: boolean): Observable<ManagedUser> {
    const field = active ? 'activateUser' : 'deactivateUser';
    return this.mutate(field, `mutation SetActive($id: ID!) { ${field}(id: $id) { FIELDS } }`, { id });
  }

  resetPassword(id: string, newPassword: string): Observable<ManagedUser> {
    return this.mutate(
      'resetUserPassword',
      'mutation ResetPassword($id: ID!, $newPassword: String!) { resetUserPassword(id: $id, newPassword: $newPassword) { FIELDS } }',
      { id, newPassword },
    );
  }

  private mutate(field: string, query: string, variables: Record<string, unknown>): Observable<ManagedUser> {
    return this.graphql
      .request<Record<string, ManagedUser>>(query.replace('FIELDS', USER_FIELDS), variables)
      .pipe(
        map((data) => {
          const user = data[field];
          if (!user?.id) throw new Error('The server did not confirm the change.');
          return user;
        }),
      );
  }
}
