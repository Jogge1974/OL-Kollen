import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kontrollen',
  slug: 'ol-kollen',
  version: '1.6.7',
  orientation: 'portrait',
  icon: './assets/icon1024.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'olkollen',
  splash: {
    image: './assets/icon1024.png',
    resizeMode: 'contain',
    backgroundColor: '#F4F8EE',
  },
  ios: {
    infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          CFBundleDevelopmentRegion: 'sv',
          CFBundleLocalizations: ['sv'],
    },
    bundleIdentifier: 'se.mastol.kontrollen',
    buildNumber: '25',
    supportsTablet: true,
  },
  android: {
    package: 'se.mastol.kontrollen',
    versionCode: 25,
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/icon1024.png',
      backgroundColor: '#F4F8EE',
    },
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
      },
    },
    edgeToEdgeEnabled: true,
  },
  web: {
    favicon: './assets/icon1024.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    '@react-native-community/datetimepicker',
    'expo-notifications',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Kontrollen använder din plats för att centrera kartvyn kring dig.',
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    router: {},
    eas: {
      projectId: '5a642379-a022-46c4-8cd0-9bd25f6c63e3',
    },
  },
});
