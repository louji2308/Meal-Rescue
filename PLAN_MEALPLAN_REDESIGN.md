# Meal Plan Tab Redesign Plan

## Overview
Redesign the Meal Plan tab to match the reference carousel UI with mountain-style sizing effect, remove clutter, and show the selected date's plan directly.

## Changes Required

### 1. Month Carousel (Mountain Effect)
**File:** `MealPlanScreen.tsx` (lines 337-356)
- Replace the static month header with a horizontally swipeable carousel
- Center month is large/bold, adjacent months progressively smaller and faded
- Keep the arrow navigation (shiftWeek -4/+4)
- Use Animated scroll position to calculate size/opacity of each month
- Show ~5 months visible: current ± 2, with center one dominant

### 2. Day Carousel (Mountain Effect)
**File:** `MealPlanScreen.tsx` (lines 358-413)
- Replace the static week-strip with a horizontally swipeable carousel
- Center day is large/bold with rounded card, adjacent days smaller and faded
- Swipe gestures to navigate between days (shift selected day, and load new week when needed)
- Keep arrow navigation for week shifting
- Show 5-7 days visible with center dominant (like the reference image)

### 3. Today's Dot Color Change
**File:** `MealPlanScreen.tsx` (lines 392-399, style: dotToday)
- Change today's dot from `colors.primary` (red #EA0F55) to grey (`colors.secondary` #8E8E93)
- Also update in WeeklyOverview.tsx if keeping it (but we're removing it)

### 4. Local Date Format
**File:** `MealPlanScreen.tsx`
- Use `toLocaleDateString()` with user's locale for all date labels
- Month carousel: use locale month names
- Day carousel: use locale weekday abbreviations
- The `prettyDate`, `monthLabel`, and `WEEKDAY_LETTERS` should use locale formatting

### 5. Remove WeeklyOverview
**File:** `MealPlanScreen.tsx` (lines 435-448)
- Remove the `<WeeklyOverview>` component render entirely
- Remove the import of WeeklyOverview
- Remove unused styles related to it

### 6. Remove "Plan this week" Button
**File:** `MealPlanScreen.tsx` (lines 453-461)
- Remove the entire `<View style={styles.toolbarRow}>` block with PrimaryButton
- Remove the import of PrimaryButton (still used for answer button, keep)
- Remove unused styles: toolbarRow, planButton, strategyRow, strategyChip, etc.

### 7. Remove "No plan yet" Empty State
**File:** `MealPlanScreen.tsx` (lines 578-586)
- Remove the entire empty state block with Ionicons calendar icon and text
- Remove unused styles: emptyState, emptyTitle, emptySubtitle

### 8. Show Selected Date's Plan
**File:** `MealPlanScreen.tsx` (lines 464-576)
- Keep the existing `selectedDay` card rendering (dayCard with 4 slots)
- For empty slots (no meal planned): show with grey/light transparent styling
- When entire day is empty: show slots with light grey placeholder text
- The slot open state already shows "Open" in italic - update style to be more visible with light grey background

### 9. AI Chat Placeholder Update
**File:** `MealPlanScreen.tsx` (line 635)
- Change placeholder from `"Ask about your meals…"` to `"Help me to plan for tomorrow..."`
- Increase input field size (font size, padding)
- Increase line height/spacing

### 10. Increase Sizes & Spacing
**File:** `MealPlanScreen.tsx` (styles section)
- Since we removed WeeklyOverview, Plan button, and empty state, the content area is less crowded
- Increase day card padding
- Increase slot row padding/spacing
- Increase calendar cell sizes
- Increase AI input bar size
- Bump font sizes slightly for day numbers, slot labels

## Implementation Strategy
1. Use `Animated.Value` from react-native-reanimated for scroll-based sizing
2. Use `ScrollView` with `pagingEnabled` or `onScroll` for the carousels
3. Calculate item scale/opacity based on distance from center
4. Keep all existing data flow (store, API) unchanged
5. Only modify the UI rendering in MealPlanScreen.tsx

## Files to Modify
- `apps/mobile/src/screens/MealPlanScreen.tsx` - Main changes
- `apps/mobile/src/components/meal-plan/WeeklyOverview.tsx` - No longer imported (can leave as is)
