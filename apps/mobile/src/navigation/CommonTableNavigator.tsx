import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { colors, fonts } from '../theme';

import { AddPeopleScreen } from '../screens/common-table/AddPeopleScreen';
import { CommonTableHomeScreen } from '../screens/common-table/CommonTableHomeScreen';
import { HouseholdScreen } from '../screens/common-table/HouseholdScreen';
import { HowDidItGoScreen } from '../screens/common-table/HowDidItGoScreen';
import { IngredientsScreen } from '../screens/common-table/IngredientsScreen';
import { PlanCookScreen } from '../screens/common-table/PlanCookScreen';

export type CommonTableStackParamList = {
  CommonTableHome: undefined;
  Household: undefined;
  AddPeople: { memberId?: string } | undefined;
  Ingredients: { memberIds: string[] };
  PlanCook: { sharedMealId?: string } | undefined;
  HowDidItGo: { sharedMealId?: string } | undefined;
};

const Stack = createNativeStackNavigator<CommonTableStackParamList>();

/**
 * Common Table — one shared meal, everyone's own finish.
 * Three steps: What Do We Have? → Plan & Cook → How Did It Go?
 * A RootStack screen so it can be entered from Kitchen or Rescue.
 */
export function CommonTableNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.semiBold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="CommonTableHome"
        component={CommonTableHomeScreen}
        options={{ title: 'Common Table' }}
      />
      <Stack.Screen
        name="Household"
        component={HouseholdScreen}
        options={{ title: 'Your Table' }}
      />
      <Stack.Screen
        name="AddPeople"
        component={AddPeopleScreen}
        options={{ title: 'Add People' }}
      />
      <Stack.Screen
        name="Ingredients"
        component={IngredientsScreen}
        options={{ title: 'What Do We Have?' }}
      />
      <Stack.Screen
        name="PlanCook"
        component={PlanCookScreen}
        options={{ title: 'Plan & Cook' }}
      />
      <Stack.Screen
        name="HowDidItGo"
        component={HowDidItGoScreen}
        options={{ title: 'How Did It Go?' }}
      />
    </Stack.Navigator>
  );
}