import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import type { MealAnalysisResponse, RescueGenerateResponse } from '@meal-rescue/shared-types';

import {
  SatisfactionCheckinParams,
  SatisfactionCheckinScreen,
} from '../components/aftercare/SatisfactionCheckinScreen';
import { navigationRef } from '../components/aftercare/navigation';
import { SATISFACTION_ROUTE } from '../components/aftercare/slots';
import { PawStamp } from '../components/mascot/PawStamp';
import { CommonTableNavigator } from './CommonTableNavigator';
import { CaptureScreen } from '../screens/CaptureScreen';
import { AiRescueScreen } from '../screens/AiRescueScreen';
import { CravingScreen } from '../screens/CravingScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { IntentScreen } from '../screens/IntentScreen';
import { KitchenScreen } from '../screens/KitchenScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MealPlanScreen } from '../screens/MealPlanScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RealityScreen } from '../screens/RealityScreen';
import { RescueLoadingScreen } from '../screens/RescueLoadingScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { TasteJournalScreen } from '../screens/TasteJournalScreen';
import { syncSubscription } from '../services/ads.api';
import { useAuthStore } from '../stores/auth.store';
import { useMonetization } from '../stores/monetization.store';
import { colors, fonts } from '../theme';

export type HomeStackParamList = {
  HomeMain: undefined;
  Capture: undefined;
  AiRescue: { foods: string[]; ingredients?: string[] };
  Review: { analysis: MealAnalysisResponse };
  Intent: { analysis: MealAnalysisResponse };
  Reality: { intentLabel: string; mealId: string; foods: string[] };
  Craving: { mealId: string; foods: string[] };
  RescueLoading: { mealId: string; foods: string[] };
  RescueResult: { result: RescueGenerateResponse; rescueId?: string };
  Feedback: { rescueId: string; recommendation: string };
  [SATISFACTION_ROUTE]: SatisfactionCheckinParams;
};

export type RootTabParamList = {
  Home: undefined;
  Kitchen: undefined;
  MealPlan: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<HomeStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

export type RootStackParamList = {
  Tabs: undefined;
  Onboarding: undefined;
  Paywall: undefined;
  TasteJournal: undefined;
  CommonTableStack: undefined;
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="AiRescue" component={AiRescueScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="Intent" component={IntentScreen} />
      <Stack.Screen name="Reality" component={RealityScreen} />
      <Stack.Screen name="Craving" component={CravingScreen} />
      <Stack.Screen name="RescueLoading" component={RescueLoadingScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name={SATISFACTION_ROUTE} component={SatisfactionCheckinScreen} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'restaurant',
  Kitchen: 'file-tray-full',
  MealPlan: 'calendar',
  Profile: 'person',
};

const TAB_ACTIVE_COLORS: Record<keyof RootTabParamList, string> = {
  Home: colors.softRed,
  Kitchen: colors.softGreen,
  MealPlan: colors.softPurple,
  Profile: colors.softCyan,
};

/**
 * 3 tabs: Rescue (core loop), Kitchen, Profile
 */
function AuthenticatedTabs() {
  const isPro = useMonetization((state) => state.isPro);
  const refreshTier = useMonetization((state) => state.refresh);

  useEffect(() => {
    // Sync RevenueCat entitlement → backend on every app start / foreground
    // so the DB stays in sync even if webhooks are slow or missed.
    void syncSubscription().catch(() => {});
    void refreshTier();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncSubscription().catch(() => {});
        void refreshTier();
      }
    });
    return () => sub.remove();
  }, [refreshTier]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const activeColor =
          TAB_ACTIVE_COLORS[route.name as keyof RootTabParamList] ?? colors.primary;
        return {
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
          tabBarIcon: ({ focused, size }) => {
            if (route.name === 'Profile' && isPro) {
              return <PawStamp size={size} opacity={focused ? 1 : 0.45} />;
            }
            const iconName = TAB_ICONS[route.name as keyof RootTabParamList] ?? null;
            if (!iconName) {
              return null;
            }
            return (
              <Ionicons name={iconName} size={size} color={focused ? activeColor : colors.textSecondary} />
            );
          },
        };
      }}
    >
      <Tab.Screen name="Home" options={{ title: 'Rescue' }}>
        {() => <HomeStack />}
      </Tab.Screen>
      <Tab.Screen name="Kitchen" component={KitchenScreen} options={{ title: 'Kitchen' }} />
      <Tab.Screen name="MealPlan" component={MealPlanScreen} options={{ title: 'Meal Plan' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);

  if (!hydrated) {
    return null;
  }

  const needsOnboarding = Boolean(token && user && !user.onboardingCompleted);

  return (
    <NavigationContainer ref={navigationRef}>
      {token ? (
        <RootStack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName={needsOnboarding ? 'Onboarding' : 'Tabs'}
        >
          <RootStack.Screen name="Tabs">{() => <AuthenticatedTabs />}</RootStack.Screen>
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
          <RootStack.Screen
            name="Paywall"
            component={PaywallScreen}
            options={{ presentation: 'modal' }}
          />
          <RootStack.Screen name="TasteJournal" component={TasteJournalScreen} />
          <RootStack.Screen name="CommonTableStack" component={CommonTableNavigator} />
        </RootStack.Navigator>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
