import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';

import type { MealAnalysisResponse, RescueGenerateResponse } from '@meal-rescue/shared-types';

import { PawStamp } from '../components/mascot/PawStamp';
import { CaptureScreen } from '../screens/CaptureScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { FridgeNegotiatorScreen } from '../screens/FridgeNegotiatorScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LeftoverAlchemistScreen } from '../screens/LeftoverAlchemistScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PantryScreen } from '../screens/PantryScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { useAuthStore } from '../stores/auth.store';
import { useMonetization } from '../stores/monetization.store';
import { colors } from '../theme';

export type HomeStackParamList = {
  HomeMain: undefined;
  Capture: undefined;
  Review: { analysis: MealAnalysisResponse };
  RescueResult: { result: RescueGenerateResponse };
  Feedback: { rescueId: string; recommendation: string };
};

export type RootTabParamList = {
  Home: undefined;
  FridgeNegotiator: undefined;
  LeftoverAlchemist: undefined;
  Pantry: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<HomeStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

export type RootStackParamList = {
  Tabs: undefined;
  Paywall: undefined;
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'restaurant',
  FridgeNegotiator: 'snow',
  LeftoverAlchemist: 'flask',
  Pantry: 'file-tray-full',
  Profile: 'person',
};

/**
 * 5 tabs for Phase 5: Rescue (core loop), Fridge Negotiator, Leftover Alchemist, Pantry, Profile
 */
function AuthenticatedTabs() {
  const isPro = useMonetization((state) => state.isPro);
  const refreshTier = useMonetization((state) => state.refresh);

  useEffect(() => {
    void refreshTier();
  }, [refreshTier]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Profile' && isPro) {
            return <PawStamp size={size} opacity={focused ? 1 : 0.45} />;
          }
          const iconName = TAB_ICONS[route.name as keyof RootTabParamList] ?? null;
          if (!iconName) {
            return null;
          }
          return <Ionicons name={iconName} size={size} color={focused ? colors.primary : color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ title: 'Rescue' }} />
      <Tab.Screen
        name="FridgeNegotiator"
        component={FridgeNegotiatorScreen}
        options={{ title: 'Fridge' }}
      />
      <Tab.Screen
        name="LeftoverAlchemist"
        component={LeftoverAlchemistScreen}
        options={{ title: 'Leftovers' }}
      />
      <Tab.Screen name="Pantry" component={PantryScreen} options={{ title: 'Pantry' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);
  const hydrated = useAuthStore((state) => state.hydrated);

  if (!hydrated) {
    return null;
  }

  return (
    <NavigationContainer>
      {token ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Tabs" component={AuthenticatedTabs} />
          <RootStack.Screen
            name="Paywall"
            component={PaywallScreen}
            options={{ presentation: 'modal' }}
          />
        </RootStack.Navigator>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
