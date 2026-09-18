import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { memo, useEffect } from 'react';
import { ActivityIndicator, AppState } from 'react-native';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../services/haptics';

import type { MealAnalysisResponse, RescueGenerateResponse } from '@meal-rescue/shared-types';

import {
  SatisfactionCheckinParams,
  SatisfactionCheckinScreen,
} from '../components/aftercare/SatisfactionCheckinScreen';
import { navigationRef } from '../components/aftercare/navigation';
import { SATISFACTION_ROUTE } from '../components/aftercare/slots';
import { CalendarIcon, FoodIcon, HouseIcon, UserIcon } from '../components/icons';
import { PawStamp } from '../components/mascot/PawStamp';
import { CommonTableNavigator } from './CommonTableNavigator';
import { CaptureScreen } from '../screens/CaptureScreen';
import { AiRescueScreen } from '../screens/AiRescueScreen';
import { CravingScreen } from '../screens/CravingScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { IntentScreen } from '../screens/IntentScreen';
import { KitchenScreen } from '../screens/KitchenScreen';
import { IngredientDetailScreen } from '../screens/IngredientDetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MealPlanScreen } from '../screens/MealPlanScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RealityScreen } from '../screens/RealityScreen';
import { RescueLoadingScreen } from '../screens/RescueLoadingScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { DishDetailScreen } from '../screens/DishDetailScreen';
import { TasteJournalScreen } from '../screens/TasteJournalScreen';
import { syncSubscription } from '../services/ads.api';
import { useAuthStore } from '../stores/auth.store';
import { useMonetization } from '../stores/monetization.store';
import type { KitchenItem } from '../services/kitchen.api';
import { colors, fonts } from '../theme';
import { spring } from '../theme/motion';

const TAB_ICONS: Record<
  keyof RootTabParamList,
  (size: number, color: string) => React.ReactNode
> = {
  Home: (size, color) => <HouseIcon size={size} color={color} strokeWidth={1.8} />,
  Kitchen: (size, color) => <FoodIcon size={size} color={color} />,
  MealPlan: (size, color) => <CalendarIcon size={size} color={color} />,
  Profile: (size, color) => <UserIcon size={size} color={color} />,
};

const PillTabBar = memo(function PillTabBar({
  state,
  descriptors,
  navigation,
  isPro,
}: BottomTabBarProps & { isPro: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBarOuter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const rawLabel = options.tabBarLabel;
          const label =
            typeof rawLabel === 'string'
              ? rawLabel
              : (options.title ?? route.name);
          const isFocused = state.index === index;
          const iconSize = 22;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused) {
              haptics.light();
            }
            if (!event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              style={styles.tabItem}
              onPress={onPress}
              onLongPress={onLongPress}
              accessible
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={label}
            >
              <AnimatedTabIcon
                routeName={route.name}
                isFocused={isFocused}
                size={iconSize}
                isPro={isPro}
              />
              <Text
                style={[
                  styles.label,
                  isFocused ? styles.labelActive : styles.labelInactive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

function AnimatedTabIcon({
  routeName,
  isFocused,
  size,
  isPro,
}: {
  routeName: string;
  isFocused: boolean;
  size: number;
  isPro: boolean;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.88);
  const opacity = useSharedValue(isFocused ? 1 : 0.45);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.12 : 0.88, spring.snappy);
    opacity.value = withTiming(isFocused ? 1 : 0.45, { duration: 180 });
  }, [isFocused, scale, opacity]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const activeColor = colors.homeInk;
  const inactiveColor = colors.homeNavInactive;
  const color = isFocused ? activeColor : inactiveColor;

  let icon: React.ReactNode = null;
  if (routeName === 'Profile' && isPro) {
    icon = <PawStamp size={size} opacity={1} />;
  } else {
    icon = TAB_ICONS[routeName as keyof RootTabParamList]?.(size, color) ?? null;
  }

  return <Animated.View style={animated}>{icon}</Animated.View>;
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    marginHorizontal: 16,
    height: 76,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  label: {
    fontSize: 11,
    marginTop: 3,
  },
  labelActive: {
    fontFamily: fonts.semiBold,
    color: colors.homeInk,
  },
  labelInactive: {
    fontFamily: fonts.medium,
    color: colors.homeNavInactive,
  },
});

export type HomeStackParamList = {
  HomeMain: undefined;
  Capture: undefined;
  DishDetail: {
    eventId: string;
    concept: string;
    mealSlot: string;
    dateKey: string;
    timeMinutes?: number;
    effort?: 'low' | 'medium' | 'high';
    cookingInstructions?: string[];
    ingredients?: string[];
    tips?: string[];
  };
  AiRescue: { foods: string[]; ingredients?: string[] };
  Review: { analysis: MealAnalysisResponse };
  Intent: { analysis: MealAnalysisResponse; editedMealText?: string };
  Reality: { intentLabel: string; mealId: string; foods: string[] };
  Craving: { mealId: string; foods: string[] };
  RescueLoading: { mealId: string; foods: string[] };
  RescueResult: { result: RescueGenerateResponse; rescueId?: string };
  Feedback: { rescueId: string; recommendation: string };
  Notifications: undefined;
  [SATISFACTION_ROUTE]: SatisfactionCheckinParams;
};

export type KitchenStackParamList = {
  KitchenMain: undefined;
  IngredientDetail: { item: KitchenItem };
};

export type RootTabParamList = {
  Home: undefined;
  Kitchen: undefined;
  MealPlan: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<HomeStackParamList>();
const KitchenStackNav = createNativeStackNavigator<KitchenStackParamList>();
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
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="DishDetail" component={DishDetailScreen} />
      <Stack.Screen name="AiRescue" component={AiRescueScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="Intent" component={IntentScreen} />
      <Stack.Screen name="Reality" component={RealityScreen} />
      <Stack.Screen name="Craving" component={CravingScreen} />
      <Stack.Screen name="RescueLoading" component={RescueLoadingScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name={SATISFACTION_ROUTE} component={SatisfactionCheckinScreen} />
    </Stack.Navigator>
  );
}

function KitchenStack() {
  return (
    <KitchenStackNav.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
      }}
    >
      <KitchenStackNav.Screen name="KitchenMain" component={KitchenScreen} />
      <KitchenStackNav.Screen name="IngredientDetail" component={IngredientDetailScreen} />
    </KitchenStackNav.Navigator>
  );
}

const TAB_ACTIVE_COLORS: Record<keyof RootTabParamList, string> = {
  Home: colors.homeInk,
  Kitchen: colors.homeInk,
  MealPlan: colors.homeInk,
  Profile: colors.homeInk,
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
      tabBar={(props) => <PillTabBar {...props} isPro={isPro} />}
      screenOptions={({ route }) => {
        const activeColor =
          TAB_ACTIVE_COLORS[route.name as keyof RootTabParamList] ?? colors.primary;
        return {
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: colors.textSecondary,
          lazy: true,
          animation: 'fade',
          freezeOnBlur: true,
          unmountOnBlur: false,
        };
      }}
    >
      <Tab.Screen
        name="Home"
        options={{ title: 'Rescue' }}
      >
        {() => <HomeStack />}
      </Tab.Screen>
      <Tab.Screen
        name="Kitchen"
        options={{ title: 'Kitchen' }}
      >
        {() => <KitchenStack />}
      </Tab.Screen>
      <Tab.Screen
        name="MealPlan"
        component={MealPlanScreen}
        options={{ title: 'Meal Plan' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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
