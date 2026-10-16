import { roleGuard } from './role-guard';

export const adminGuard = roleGuard('SYSTEM_OWNER_ADMIN');
