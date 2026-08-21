import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { MealAnalysisResponse, RescueGenerateResponse } from '@meal-rescue/shared-types';

import { CaptureScreen } from '../screens/CaptureScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { useAuthStore } from '../stores/auth.store';
import { colors } from '../theme';

export type HomeStackParamList = {
  HomeMain: undefined;
  Capture: undefined;
  Review: { analysis: MealAnalysisResponse };
  RescueResult: { result: RescueGenerateResponse };
};

export type RootTabParamList = {
  Home: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<HomeStackParamList>();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'restaurant',
  Profile: 'person',
};

/**
 * The core loop only. Fridge Negotiator / Leftover Alchemist (Phase 5) and
 * Pantry (Phase 4) stay unregistered until their backends exist - dead tabs
 * are UX noise.
 */
function AuthenticatedTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ focused, color, size }) => {
          const iconName = TAB_ICONS[route.name as keyof RootTabParamList];
          if (!iconName) {
            return null;
          }
          return <Ionicons name={iconName} size={size} color={focused ? colors.primary : color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ title: 'Rescue' }} />
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
    <NavigationContainer>{token ? <AuthenticatedTabs /> : <LoginScreen />}</NavigationContainer>
  );
}
