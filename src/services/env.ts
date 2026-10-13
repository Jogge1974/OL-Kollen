// The Eventor API key no longer lives in the app — all Eventor requests go
// through the server-side eventor-proxy edge function, which holds the key as a
// Supabase secret. See src/services/eventorProxyClient.ts.

export function getSupabaseConfig() {
  return {
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  };
}
