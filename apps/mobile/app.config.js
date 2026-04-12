const fs = require('fs');
const path = require('path');

/**
 * Write Firebase config files from EAS secrets before the native build.
 * This runs during the EAS "Read app config" phase.
 *
 * In bare workflow the android/ folder is committed to git, so Gradle reads
 * android/app/google-services.json directly — not the root google-services.json.
 * The EAS secret always contains the authoritative file (with the correct
 * SHA-1 fingerprints for the EAS signing keystore), so we overwrite BOTH
 * paths whenever the secret is present.
 *
 *   GOOGLE_SERVICES_JSON       → google-services.json + android/app/google-services.json
 *   GOOGLE_SERVICES_INFO_PLIST → GoogleService-Info.plist (+ ios/ if present)
 */
function ensureFirebaseFiles() {
  const dir = __dirname;

  if (process.env.GOOGLE_SERVICES_JSON) {
    const content = Buffer.from(process.env.GOOGLE_SERVICES_JSON, 'base64').toString('utf-8');
    // Root path (used by expo prebuild / local dev)
    fs.writeFileSync(path.join(dir, 'google-services.json'), content, 'utf-8');
    // Bare-workflow path — read directly by Gradle; must be overwritten from the secret
    // because the committed android/app/google-services.json predates EAS keystore SHA-1 changes.
    const androidGsPath = path.join(dir, 'android', 'app', 'google-services.json');
    if (fs.existsSync(path.join(dir, 'android', 'app'))) {
      fs.writeFileSync(androidGsPath, content, 'utf-8');
    }
  } else {
    // Local dev: write root file only if it is missing
    const gsJsonPath = path.join(dir, 'google-services.json');
    if (!fs.existsSync(gsJsonPath)) {
      console.warn('app.config.js: GOOGLE_SERVICES_JSON env var not set and google-services.json missing.');
    }
  }

  if (process.env.GOOGLE_SERVICES_INFO_PLIST) {
    const content = Buffer.from(process.env.GOOGLE_SERVICES_INFO_PLIST, 'base64').toString('utf-8');
    fs.writeFileSync(path.join(dir, 'GoogleService-Info.plist'), content, 'utf-8');
  } else {
    const plistPath = path.join(dir, 'GoogleService-Info.plist');
    if (!fs.existsSync(plistPath)) {
      console.warn('app.config.js: GOOGLE_SERVICES_INFO_PLIST env var not set and GoogleService-Info.plist missing.');
    }
  }
}

ensureFirebaseFiles();

module.exports = ({ config }) => ({
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
    'expo-image-picker',
    '@react-native-firebase/app',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          'com.googleusercontent.apps.235418572919-i7ivkgcqcaim1vk7g6nm8iboner0r17i',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
        },
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
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    releaseApiBaseUrl: process.env.EXPO_PUBLIC_RELEASE_API_BASE_URL,
  },
  experiments: {
    typedRoutes: true,
  },
  autolinking: {
    searchPaths: ['../../node_modules'],
  },
  owner: 'jaosuza',
});
