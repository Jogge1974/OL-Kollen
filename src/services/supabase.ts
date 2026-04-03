import { getSupabaseConfig } from '@/src/services/env';

export function getSupabaseRuntimeConfig() {
  return getSupabaseConfig();
}

// TODO: Add Supabase client initialization when app-specific data is introduced.
// TODO: Introduce tables / policies for users, user_access, friends, notification_preferences, and device_push_tokens.
// TODO: Add Sverigelistan sync and push status comparisons through Supabase-backed jobs or edge functions.
