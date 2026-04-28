import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function canRenderNativeMap() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const envKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const configKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey?.trim();
  const manifestKey =
    (Constants as Record<string, unknown>).manifest2 != null ||
    (Constants as Record<string, unknown>).manifest != null;

  if (envKey) {
    return true;
  }

  if (configKey && !configKey.startsWith('process.env.') && !configKey.startsWith('PLACEHOLDER')) {
    return true;
  }

  // If running a standalone build (not Expo Go) the key is in AndroidManifest.xml
  if (!Constants.appOwnership || Constants.appOwnership === 'standalone') {
    return true;
  }

  return false;
}
