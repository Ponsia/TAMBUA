export type UserRole = 'SYSTEM_OWNER_ADMIN' | 'WATCHLIST_MANAGER' | 'INVESTIGATOR';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  station: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}
