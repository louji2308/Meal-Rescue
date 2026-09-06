const EXPO_PUBLIC_ADMOB_ANDROID_APP_ID = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const EXPO_PUBLIC_ADMOB_IOS_APP_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;

const admobAppId = (id) => (id && id.length > 0 ? id : undefined);

module.exports = {
  expo: {
    name: 'Meal Rescue',
    slug: 'meal-rescue',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
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
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
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
    ],
  },
};