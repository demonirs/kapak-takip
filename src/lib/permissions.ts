import { getActiveCity } from './supabase';

export const ROLE_LABELS = {
  member: 'Üye', depo: 'Depo Sorumlusu',
  depo_viewer: 'Depo İzleyici', admin: 'Yönetici',
} as const;
export type UserRole = keyof typeof ROLE_LABELS;
export function canViewWarehouse(role?: string | null) {
  return getActiveCity() === 'istanbul' &&
    (role === 'admin' || role === 'depo' || role === 'depo_viewer');
}
export function canManageWarehouse(role?: string | null) {
  return getActiveCity() === 'istanbul' && (role === 'admin' || role === 'depo');
}
export function canWriteCases(role?: string | null) {
  return getActiveCity() === 'ankara' ||
    role === 'admin' || role === 'member' || role === 'depo_viewer';
}
