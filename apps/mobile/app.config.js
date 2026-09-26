const EXPO_PUBLIC_ADMOB_ANDROID_APP_ID = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const EXPO_PUBLIC_ADMOB_IOS_APP_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;
const EXPO_PUBLIC_ONESIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;

const admobAppId = (id) => (id && id.length > 0 ? id : undefined);
const optionalPlugin = (plugin, config) => (config ? [plugin, config] : plugin);

module.exports = {
  expo: {
    name: 'Meal Rescue',
    slug: 'meal-rescue',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/logo-square.png',
    splash: {
      image: './assets/logo.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    userInterfaceStyle: 'automatic',
    scheme: 'mealrescue',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.mealrescue.app',
      config: {
        usesNonExemptEncryption: false,
      },
      // Required for Apple Search Ads attribution
      admobAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID,
      // Privacy manifest for App Store compliance
      privacyManifests: {
        privacyTracking: false,
        privacyTrackingDomains: [],
        privacyCollectedDataTypes: [],
        privacyAccessedAPITypes: [
          {
            privacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            privacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            privacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            privacyAccessedAPITypeReasons: ['35F9.1'],
          },
        ],
      },
    },
    android: {
      package: 'com.mealrescue.app',
      googleServicesFile: './google-services.json',
      // Release signing — set via EAS build or env vars for production builds.
      // For local `expo run:android` debug builds, this is not needed.
      ...(process.env.EAS_BUILD_PROFILE === 'production' && process.env.ANDROID_KEYSTORE_PATH
        ? {
            signingConfig: {
              keystorePath: process.env.ANDROID_KEYSTORE_PATH,
              keystorePassword: process.env.ANDROID_KEYSTORE_PASSWORD,
              keyAlias: process.env.ANDROID_KEY_ALIAS,
              keyPassword: process.env.ANDROID_KEY_PASSWORD,
            },
          }
        : {}),
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/logo-square.png',
      },
      statusBar: {
        barStyle: 'dark-content',
        backgroundColor: '#FFFFFF',
      },
      intentFilters: [
        {
          action: 'android.intent.action.VIEW',
          category: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
          data: {
            scheme: 'mealrescue',
            pathPrefix: '/expo-auth-session',
          },
        },
      ],
      predictiveBackGestureEnabled: false,
      permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-camera',
      'expo-image-picker',
      'expo-speech-recognition',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: admobAppId(EXPO_PUBLIC_ADMOB_ANDROID_APP_ID),
          iosAppId: admobAppId(EXPO_PUBLIC_ADMOB_IOS_APP_ID),
          optimizeInitialization: true,
          optimizeAdLoading: true,
        },
      ],
      optionalPlugin('onesignal-expo-plugin', EXPO_PUBLIC_ONESIGNAL_APP_ID ? { mode: 'production' } : undefined),
      ['./plugins/with-meal-rescue-notification-icon', { logo: './assets/notification-logo.png' }],
    ],
  },
};