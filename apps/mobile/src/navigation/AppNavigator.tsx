import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CaptureScreen } from '../screens/CaptureScreen';
import { FridgeNegotiatorScreen } from '../screens/FridgeNegotiatorScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LeftoverAlchemistScreen } from '../screens/LeftoverAlchemistScreen';
import { PantryScreen } from '../screens/PantryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RescueResultScreen } from '../screens/RescueResultScreen';
import { colors } from '../theme';

export type HomeStackParamList = {
  HomeMain: undefined;
  Capture: undefined;
  RescueResult: undefined;
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

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="RescueResult" component={RescueResultScreen} />
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

export function AppNavigator() {
  return (
    <NavigationContainer>
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
            return (
              <Ionicons name={iconName} size={size} color={focused ? colors.primary : color} />
            );
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
    </NavigationContainer>
  );
}
