import fs from 'fs';
import path from 'path';
import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Write Firebase config files from EAS secrets if they don't exist on disk.
 * This runs during the EAS "Read app config" phase — before the native build.
 * Locally the files are already present (in .gitignore); on EAS they're absent
 * and must be reconstructed from base64-encoded secrets:
 *   GOOGLE_SERVICES_JSON       → google-services.json   (Android)
 *   GOOGLE_SERVICES_INFO_PLIST → GoogleService-Info.plist (iOS)
 */
function ensureFirebaseFiles(): void {
  const dir = __dirname;

  const gsJsonPath = path.join(dir, 'google-services.json');
  if (!fs.existsSync(gsJsonPath) && process.env.GOOGLE_SERVICES_JSON) {
    const content = Buffer.from(process.env.GOOGLE_SERVICES_JSON, 'base64').toString('utf-8');
    fs.writeFileSync(gsJsonPath, content, 'utf-8');
  }

  const plistPath = path.join(dir, 'GoogleService-Info.plist');
  if (!fs.existsSync(plistPath) && process.env.GOOGLE_SERVICES_INFO_PLIST) {
    const content = Buffer.from(process.env.GOOGLE_SERVICES_INFO_PLIST, 'base64').toString('utf-8');
    fs.writeFileSync(plistPath, content, 'utf-8');
  }
}

ensureFirebaseFiles();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'BetIntel',
  slug: 'betintel',
  version: '1.0.0',
  icon: './assets/icon.png',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'betintel',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0D0D0D',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.betintel.app',
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ['betintel'],
        },
      ],
    },
  },
  android: {
    package: 'com.betintel.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0D0D0D',
    },
    googleServicesFile: './google-services.json',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'betintel' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    '@react-native-firebase/app',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          'com.googleusercontent.apps.235418572919-i7ivkgcqcaim1vk7g6nm8iboner0r17i',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '15339993-8b61-4c94-bbb4-9a640f0f870a',
    },
    router: {
      origin: false,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  autolinking: {
    searchPaths: ['../../node_modules'],
  },
  owner: 'jaosuza',
});
