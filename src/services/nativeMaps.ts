import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function canRenderNativeMap() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const envKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const configKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey?.trim();

  if (envKey) {
    return true;
  }

  if (configKey && !configKey.startsWith('process.env.')) {
    return true;
  }

  return false;
}
