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
    icon: './assets/icon.png',
    splash: {
      image: './assets/mascot.png',
      resizeMode: 'contain',
      backgroundColor: '#F8F8F0',
    },
    userInterfaceStyle: 'automatic',
    scheme: 'mealrescue',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.mealrescue.app',
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.mealrescue.app',
      adaptiveIcon: {
        backgroundColor: '#F8F8F0',
        foregroundImage: './assets/mascot.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/mascot.png',
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
    ],
  },
};