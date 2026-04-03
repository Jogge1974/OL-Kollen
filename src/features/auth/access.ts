import { AccessLevel } from '@/src/types/user';

export const defaultAccessLevel: AccessLevel = 'free';

export function resolveAccessLevel(): AccessLevel {
  return defaultAccessLevel;
}

// TODO: Mirror these concepts in Supabase when app-specific backend data is introduced.
// TODO: Add user_access evaluation for free / premium / admin entitlements.
// TODO: Add protected routes and premium-gated feature toggles once the first paid features exist.
