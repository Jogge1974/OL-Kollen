const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

export function buildEventorUrl(path: string) {
  return `${EVENTOR_BASE_URL}${path}`;
}

export function getEventorApiKey() {
  const apiKey = process.env.EXPO_PUBLIC_EVENTOR_API_KEY;

  if (!apiKey) {
    throw new Error('Saknar Eventor API-nyckel. Lägg in EXPO_PUBLIC_EVENTOR_API_KEY i lokal .env.');
  }

  return apiKey;
}

export function getSupabaseConfig() {
  return {
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  };
}
