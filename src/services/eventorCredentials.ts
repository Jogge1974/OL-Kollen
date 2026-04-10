import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';

const EVENTOR_CREDENTIALS_STORAGE_KEY = 'olkollen.eventor.credentials';

export type StoredEventorCredentials = {
  password: string;
  storedAt: string;
  username: string;
};

export async function saveStoredEventorCredentials(username: string, password: string) {
  await setStoredJson(EVENTOR_CREDENTIALS_STORAGE_KEY, {
    password,
    storedAt: new Date().toISOString(),
    username,
  } satisfies StoredEventorCredentials);
}

export async function getStoredEventorCredentials() {
  const stored = await getStoredJson<StoredEventorCredentials>(EVENTOR_CREDENTIALS_STORAGE_KEY);
  return stored ?? null;
}

export async function clearStoredEventorCredentials() {
  await removeStoredValue(EVENTOR_CREDENTIALS_STORAGE_KEY);
}
