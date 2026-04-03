import * as SecureStore from 'expo-secure-store';

export async function getStoredJson<T>(key: string): Promise<T | null> {
  const rawValue = await SecureStore.getItemAsync(key);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as T;
}

export async function removeStoredValue(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export async function setStoredJson(key: string, value: unknown) {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}
