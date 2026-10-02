# Design Award Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Meal Rescue a winnable RevenueCat Design Award submission: a signature "smallest change" reveal, a magical AI-scan loading moment, system-wide haptics/motion physics, a day-phase living palette, the Scraps mascot, and designed reward/paywall surfaces.

**Architecture:** Pure client-side work in `apps/mobile`. Two new libraries (`react-native-reanimated` v4, `expo-haptics`, plus `react-native-svg`) installed via `npx expo install` for SDK-matched versions. All motion is Reanimated shared-value driven (UI-thread, 60fps). No backend changes except none. Each task ships independently behind normal commits.

**Tech Stack:** Expo SDK 57 / RN 0.86 (New Architecture), react-native-reanimated, expo-haptics, react-native-svg, existing zustand/react-query stack.

## Global Constraints

- Never edit files via PowerShell `Get-Content | Set-Content` pipelines (truncation history) — use Edit tool only.
- Jest exists ONLY in the backend workspace; mobile verification = `npx tsc --noEmit` + `npx eslint src --max-warnings 0` inside `apps/mobile`.
- Long-running processes (Metro :8081) are already detached; never start blocking watchers in shell steps.
- Keep all new files under `apps/mobile/src/{theme,services,hooks,components}` following existing kebab/TitleCase conventions.
- Accessibility: every interactive element keeps `accessibilityRole` + `accessibilityLabel`; animations must not remove labels.
- No comments in code unless explaining non-obvious physics/choreography timing (repo convention allows sparse doc comments).
- Commit after each task; husky runs eslint+prettier automatically.

---

### Task 1: Motion foundation — deps, tokens, haptics service, press physics on Chip & PrimaryButton

**Files:**
- Create: `apps/mobile/src/theme/motion.ts`
- Create: `apps/mobile/src/services/haptics.ts`
- Modify: `apps/mobile/package.json` (via expo install)
- Modify: `apps/mobile/src/components/Chip.tsx`
- Modify: `apps/mobile/src/components/PrimaryButton.tsx`

**Interfaces:**
- Produces: `motion.durations.fast|base|slow|reveal`, `motion.spring.gentle|snappy|bouncy` (Reanimated spring configs), `haptics.light()`, `haptics.medium()`, `haptics.success()`, `haptics.warning()` — all fire-and-forget void, safe on any thread.

- [ ] **Step 1: Install SDK-matched dependencies**

```bash
cd apps/mobile && npx expo install react-native-reanimated expo-haptics
```

Expected: package.json gains both deps at Expo-compatible versions. babel-preset-expo auto-registers the Reanimated plugin (SDK ≥50) — no babel edit needed.

- [ ] **Step 2: Create motion tokens**

Create `apps/mobile/src/theme/motion.ts`:

```ts
import { Easing } from 'react-native-reanimated';

export const durations = {
  fast: 120,
  base: 220,
  slow: 420,
  reveal: 900,
} as const;

export const easing = {
  outCubic: Easing.out(Easing.cubic),
  inOutQuad: Easing.inOut(Easing.quad),
} as const;

export const spring = {
  gentle: { damping: 16, stiffness: 140, mass: 1 },
  snappy: { damping: 20, stiffness: 260, mass: 0.9 },
  bouncy: { damping: 11, stiffness: 180, mass: 0.8 },
} as const;
```

- [ ] **Step 3: Create haptics service**

Create `apps/mobile/src/services/haptics.ts`:

```ts
import * as Haptics from 'expo-haptics';

function safe(run: () => Promise<void>): void {
  void run().catch(() => {});
}

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
```

- [ ] **Step 4: Chip — springy selection**

Replace body of `src/components/Chip.tsx` with:

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, spacing } from '../theme';
import { spring } from '../theme/motion';

interface ChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  style?: ViewStyle;
}

/**
 * Tappable constraint shortcut - skippable by design; the system infers
 * the rest. Selection pops with a spring and a light tap.
 */
export function Chip({ label, selected, onToggle, style }: ChipProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (selected) {
      scale.value = 0.92;
      scale.value = withSpring(1, spring.snappy);
      haptics.light();
    }
  }, [selected, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.base, selected ? styles.selected : null, style]}
      activeOpacity={0.7}
      onPress={onToggle}
    >
      <Animated.View style={[styles.inner, animated]}>
        <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  selected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  inner: {},
  label: {
    fontSize: 14,
    color: colors.text,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
```

- [ ] **Step 5: PrimaryButton — press-down physics + haptic**

Replace body of `src/components/PrimaryButton.tsx` with:

```tsx
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, spacing } from '../theme';
import { spring } from '../theme/motion';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isGhost = variant === 'ghost';
  const backgroundColor = isGhost ? 'transparent' : colors[variant];
  const textColor = isGhost ? colors.primary : colors.surface;
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressed.value ? 0.97 : 1,
          pressed.value ? spring.snappy : spring.gentle),
      },
    ],
    opacity: withTiming(pressed.value ? 0.9 : 1, { duration: 100 }),
  }));

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      activeOpacity={1}
      disabled={disabled || busy}
      onPressIn={() => {
        if (!disabled && !busy) {
          pressed.value = 1;
          haptics.light();
        }
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.base,
          { backgroundColor },
          disabled || busy ? styles.disabled : null,
          animated,
          style,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

Note: `style` prop moves to the Animated.View so caller-provided margins still apply; touch target unchanged.

- [ ] **Step 6: Verify**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
```

Expected: both clean. If Reanimated type errors appear about `Easing` import path, confirm version via `npx expo install --check`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): motion foundation - reanimated tokens, haptics, press physics"
```

---

### Task 2: Living palette — day-phase backgrounds

**Files:**
- Create: `apps/mobile/src/hooks/useDayPhase.ts`
- Modify: `apps/mobile/src/screens/HomeScreen.tsx` (container bg)
- Modify: `apps/mobile/src/screens/CaptureScreen.tsx` (container bg)
- Modify: `apps/mobile/src/screens/RescueResultScreen.tsx` (container bg)

**Interfaces:**
- Produces: `resolveDayPhase(hour: number): 'morning' | 'afternoon' | 'evening' | 'night'` (pure), `PHASE_TINTS` record, `useDayPhase(): { phase, tint }`.

- [ ] **Step 1: Hook with pure resolver**

Create `apps/mobile/src/hooks/useDayPhase.ts`:

```ts
import { useEffect, useState } from 'react';

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 5–11, afternoon 11–17, evening 17–21, night otherwise. */
export function resolveDayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export const PHASE_TINTS: Record<DayPhase, string> = {
  morning: '#FDF8F2',
  afternoon: '#FAFAFA',
  evening: '#F7F5FA',
  night: '#141A14',
};

export function useDayPhase(): { phase: DayPhase; tint: string } {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const phase = resolveDayPhase(hour);
  return { phase, tint: PHASE_TINTS[phase] };
}
```

- [ ] **Step 2: Apply on the three core screens**

In each of HomeScreen/CaptureScreen/RescueResultScreen add import and swap container background:

```tsx
import { useDayPhase } from '../hooks/useDayPhase';
// inside component:
const { tint } = useDayPhase();
// container style: [styles.container, { backgroundColor: tint }]
```

For CaptureScreen also update its `styles.container.backgroundColor` usage — replace `styles.container` with `[styles.container, { backgroundColor: tint }]` on both SafeAreaView instances.

Night tint `#141A14` is dark: text stays dark-on-light in other phases, so ALSO add to each screen's outermost Text-bearing header no changes — instead, guard: when phase === 'night', keep using standard `colors.background` (night mode full support is out of scope; the tint shift is the delight, not a theme rewrite):

```tsx
const { phase, tint } = useDayPhase();
const background = phase === 'night' ? colors.background : tint;
```

Apply `background` to the container style in all three screens.

- [ ] **Step 3: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): day-phase living palette on core screens"
```

---

### Task 3: The scan — ScanningLoader replaces dead air during analyze

**Files:**
- Create: `apps/mobile/src/components/loading/ScanningLoader.tsx`
- Modify: `apps/mobile/src/screens/CaptureScreen.tsx:200-205` (busy block)

**Interfaces:**
- Consumes: nothing external.
- Produces: `buildScanSteps(mealText: string | null): string[]` pure; `<ScanningLoader mealText={string | null} />`.

- [ ] **Step 1: Component with pure step builder + moving beam + ticking checklist**

Create `apps/mobile/src/components/loading/ScanningLoader.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../../services/haptics';
import { colors, spacing } from '../../theme';

/** Pure so it stays trivially testable and copy lives in one place. */
export function buildScanSteps(mealText: string | null): string[] {
  const subject = mealText?.trim()
    ? `"${mealText.trim().slice(0, 40)}${mealText.length > 40 ? '…' : ''}"`
    : 'your meal';
  return [
    `Reading ${subject}`,
    'Spotting proteins…',
    'Checking fiber & healthy fats…',
    'Finding your smallest change…',
  ];
}

interface ScanStep {
  label: string;
  state: 'done' | 'active' | 'pending';
}

const STEP_MS = 3200;

export function ScanningLoader({ mealText }: { mealText: string | null }) {
  const steps = useMemo(() => buildScanSteps(mealText), [mealText]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const id = setInterval(() => {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, [steps]);

  useEffect(() => {
    if (index > 0) haptics.light();
  }, [index]);

  const beam = useSharedValue(-60);

  useEffect(() => {
    beam.value = -60;
    beam.value = withRepeat(
      withTiming(220, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(beam);
  }, [beam]);

  const beamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: beam.value }] }));

  const rendered: ScanStep[] = steps.map((label, i) => ({
    label,
    state: i < index ? 'done' : i === index ? 'active' : 'pending',
  }));
  const active = rendered[index];

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Analyzing your meal"
    >
      <View style={styles.scanWindow}>
        <Animated.View style={[styles.beam, beamStyle]} />
        {rendered.map((step) => (
          <View key={step.label} style={styles.stepRow}>
            <Text style={[styles.tick, step.state === 'done' ? styles.tickDone : null]}>
              {step.state === 'done' ? '✓' : step.state === 'active' ? '›' : '·'}
            </Text>
            <Text
              style={[
                styles.stepText,
                step.state === 'active' ? styles.stepActive : null,
                step.state === 'pending' ? styles.stepPending : null,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
      {active && active.label.startsWith('Finding') ? (
        <Text style={styles.hint}>This usually takes ~15 seconds</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  scanWindow: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(46,125,50,0.10)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tick: {
    width: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tickDone: {
    color: colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  stepActive: {
    fontWeight: '600',
  },
  stepPending: {
    color: colors.textSecondary,
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
```

- [ ] **Step 2: Integrate into CaptureScreen busy state**

In `CaptureScreen.tsx` replace:

```tsx
{busy && (
  <View style={styles.analyzing}>
    <ActivityIndicator color={colors.primary} />
    <Text style={styles.analyzingText}>Reading your meal…</Text>
  </View>
)}
```

with:

```tsx
{busy && <ScanningLoader mealText={image ? null : text} />}
```

Add import `import { ScanningLoader } from '../components/loading/ScanningLoader';`, delete now-unused `styles.analyzing`/`styles.analyzingText` and drop `ActivityIndicator` from the RN import list if unused elsewhere in the file.

- [ ] **Step 3: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): scanning loader turns AI wait into signature moment"
```

---

### Task 4: Signature moment — PlateDiffReveal + result-screen choreography

**Files:**
- Create: `apps/mobile/src/components/plate/PlateDiffReveal.tsx`
- Modify: `apps/mobile/src/screens/RescueResultScreen.tsx`

**Interfaces:**
- Produces: `PLATE_DIFF_LAND_MS = 1050` (constant siblings sync to), `<PlateDiffReveal foods={string[]} additionLabel={string} />`.
- Consumes: `motion.spring.bouncy`, `haptics.medium()`.

- [ ] **Step 1: Component**

Create `apps/mobile/src/components/plate/PlateDiffReveal.tsx`:

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../../services/haptics';
import { colors, spacing } from '../../theme';
import { spring } from '../../theme/motion';

/** Time until the addition chip lands; siblings delay entrances past this. */
export const PLATE_DIFF_LAND_MS = 1050;

interface PlateDiffRevealProps {
  foods: string[];
  additionLabel: string;
}

/**
 * Visualizes the brand promise: the plate dims, then ONE addition lands
 * with spring physics and a pulse ring - "the smallest change".
 */
export function PlateDiffReveal({ foods, additionLabel }: PlateDiffRevealProps) {
  const dimmed = useSharedValue(0);
  const dropY = useSharedValue(-70);
  const dropScale = useSharedValue(0.8);
  const ring = useSharedValue(0);

  useEffect(() => {
    dimmed.value = withTiming(1, { duration: 380 });
    dropY.value = withDelay(PLATE_DIFF_LAND_MS - 620, withSpring(0, spring.bouncy));
    dropScale.value = withDelay(PLATE_DIFF_LAND_MS - 620, withSpring(1, spring.bouncy));
    ring.value = withDelay(
      PLATE_DIFF_LAND_MS - 40,
      withTiming(1, { duration: 520 }),
    );
    const id = setTimeout(() => haptics.medium(), PLATE_DIFF_LAND_MS - 30);
    return () => clearTimeout(id);
  }, [dimmed, dropY, dropScale, ring]);

  const foodStyle = useAnimatedStyle(() => ({
    opacity: 1 - dimmed.value * 0.55,
  }));

  const dropStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dropY.value }, { scale: dropScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.8 + ring.value * 0.9 }],
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.mealLine}>Your meal</Text>
      <View style={styles.foodsRow}>
        {foods.slice(0, 6).map((food) => (
          <Animated.View key={food} style={[styles.foodChip, foodStyle]}>
            <Text style={styles.foodText}>{food}</Text>
          </Animated.View>
        ))}
        {foods.length > 6 ? (
          <Animated.View style={[styles.foodChip, foodStyle]}>
            <Text style={styles.foodText}>+{foods.length - 6}</Text>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.additionSlot}>
        <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />
        <Animated.View style={[styles.additionChip, dropStyle]}>
          <Text style={styles.additionText}>{additionLabel}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  mealLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  foodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  foodChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  foodText: {
    fontSize: 13,
    color: colors.text,
    textTransform: 'capitalize',
  },
  additionSlot: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.secondary,
    top: -8,
  },
  additionChip: {
    backgroundColor: colors.secondary,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  additionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'capitalize',
  },
});
```

- [ ] **Step 2: Choreograph RescueResultScreen around it**

In `RescueResultScreen.tsx`:

1. Add imports:

```tsx
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PlateDiffReveal, PLATE_DIFF_LAND_MS } from '../components/plate/PlateDiffReveal';
```

2. Derive the addition label near the top of the component (after `chosen` state):

```tsx
function describeAddition(candidate: RescueCandidate): string {
  if (candidate.additions.length > 0) {
    return candidate.additions.map((a) => a.name).join(' + ');
  }
  const sub = candidate.substitutions[0];
  return sub ? `${sub.original.name} → ${sub.replacement.name}` : 'Prep tweak';
}
```

3. Replace the plain `mealLabel` Text + `card` View block with:

```tsx
<PlateDiffReveal
  foods={current.originalMeal.foods}
  additionLabel={`＋ ${describeAddition(chosen.candidate)}`}
/>
<Animated.View entering={FadeInDown.delay(PLATE_DIFF_LAND_MS).duration(320)} style={styles.card}>
  ...existing card children unchanged...
</Animated.View>
```

Keep `StaplesShelf`, actions, alternatives as-is (they sit below and scroll into view naturally).

4. Remove old `styles.mealLabel` usage (leave style object harmless or delete).

- [ ] **Step 3: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): smallest-change plate diff reveal on rescue results"
```

---

### Task 5: Scraps mascot — SVG cat with moods

**Files:**
- Modify: `apps/mobile/package.json` (add react-native-svg via expo install)
- Create: `apps/mobile/src/components/mascot/ScrapsCat.tsx`
- Modify: `apps/mobile/src/screens/HomeScreen.tsx` (idle mascot beside greeting)

**Interfaces:**
- Produces: `<ScrapsCat mood={'idle' | 'scanning' | 'celebrate'} size={number} />`.

- [ ] **Step 1: Install**

```bash
cd apps/mobile && npx expo install react-native-svg
```

- [ ] **Step 2: Component**

Create `apps/mobile/src/components/mascot/ScrapsCat.tsx`:

```tsx
import React, { useEffect } from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spring } from '../../theme/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type ScrapsMood = 'idle' | 'scanning' | 'celebrate';

interface ScrapsCatProps {
  mood?: ScrapsMood;
  size?: number;
}

/**
 * Scraps - the kitchen rescue cat. Idle blinks; scanning flicks pupils;
 * celebrate bounces with happy eyes. Vector-only, zero asset pipeline.
 */
export function ScrapsCat({ mood = 'idle', size = 72 }: ScrapsCatProps) {
  const blink = useSharedValue(0);
  const pupilX = useSharedValue(0);
  const bounceY = useSharedValue(0);

  useEffect(() => {
    if (mood === 'celebrate') {
      bounceY.value = 0;
      bounceY.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: 160, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
      pupilX.value = withSpring(0, spring.snappy);
      blink.value = 0;
    } else if (mood === 'scanning') {
      pupilX.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 500 }),
          withTiming(3, { duration: 900 }),
          withTiming(0, { duration: 400 }),
        ),
        -1,
        false,
      );
      blink.value = 0;
      bounceY.value = 0;
    } else {
      blink.value = withRepeat(
        withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 90 })),
        -1,
        false,
      );
      pupilX.value = 0;
      bounceY.value = 0;
    }
  }, [mood, blink, pupilX, bounceY]);

  useDerivedValue(() => bounceY.value);

  const eyeOpenY = useDerivedValue(() => 1 - blink.value);
  const leftEyeProps = useAnimatedProps(() => ({ scaleY: eyeOpenY.value }));
  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));
  const pupilStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pupilX.value }] }));

  return (
    <Animated.View style={[{ width: size, height: size }, wrapperStyle]}
      accessible
      accessibilityLabel="Scraps the rescue cat"
    >
      <Svg viewBox="0 0 64 64" width={size} height={size}>
        <Ellipse cx="32" cy="42" rx="17" ry="14" fill="#E8A87C" />
        <Circle cx="32" cy="26" r="14" fill="#E8A87C" />
        <Path d="M20 16 L24 5 L29 14 Z" fill="#E8A87C" />
        <Path d="M44 16 L40 5 L35 14 Z" fill="#E8A87C" />
        <Path d="M49 40 Q58 38 56 28" stroke="#D98E5F" strokeWidth="4" fill="none" strokeLinecap="round" />
        {mood === 'celebrate' ? (
          <>
            <Path d="M23 25 Q26 21 29 25" stroke="#3B2F2F" strokeWidth="2" fill="none" strokeLinecap="round" />
            <Path d="M35 25 Q38 21 41 25" stroke="#3B2F2F" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <AnimatedPath
              d="M27 22 L27 28 M31.6 22 L31.6 28"
              stroke="#3B2F2F"
              strokeWidth="2.4"
              strokeLinecap="round"
              animatedProps={leftEyeProps}
              origin="29, 25"
            />
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: size * 0.53, top: size * 0.33 }, pupilStyle]}>
              <Svg width={6} height={6} viewBox="0 0 6 6">
                <Circle cx="3" cy="3" r="1.6" fill="#3B2F2F" />
              </Svg>
            </Animated.View>
          </>
        )}
        <Path d="M30 31 Q32 33 34 31" stroke="#3B2F2F" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Place on HomeScreen greeting row**

Read HomeScreen first; locate the `Hi judge` heading. Wrap the title block in a row:

```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
  <ScrapsCat mood="idle" size={56} />
  <View style={{ flex: 1 }}>
    {/* existing greeting + subtitle Texts */}
  </View>
</View>
```

Import `ScrapsCat` from `../components/mascot/ScrapsCat`.

- [ ] **Step 4: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): Scraps mascot with idle/scanning/celebrate moods"
```

---

### Task 6: Reward moment — countdown progress animation, confetti burst, claim pop

**Files:**
- Create: `apps/mobile/src/components/effects/ConfettiBurst.tsx`
- Modify: `apps/mobile/src/components/ads/SimulatedAdModal.tsx`

**Interfaces:**
- Produces: `<ConfettiBurst trigger={number} />` — increments fire a burst.
- Consumes: `haptics.success()`.

- [ ] **Step 1: ConfettiBurst**

Create `apps/mobile/src/components/effects/ConfettiBurst.tsx`:

```tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { colors } from '../../theme';

const PIECE_COUNT = 18;
const PALETTE = [colors.primary, colors.secondary, '#FFC107', '#4CAF50', '#E91E63'];
const BURST_MS = 750;

interface PieceSpec {
  angle: number;
  distance: number;
  rotate: number;
  size: number;
  color: string;
  delay: number;
}

function makePieces(seedKey: number): PieceSpec[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    angle: (i / PIECE_COUNT) * Math.PI * 2 + ((seedKey % 7) * 0.13),
    distance: 70 + ((i * 37 + seedKey * 11) % 60),
    rotate: ((i * 53 + seedKey * 17) % 360) - 180,
    size: 6 + ((i * 13) % 6),
    color: PALETTE[i % PALETTE.length]!,
    delay: (i % 5) * 24,
  }));
}

function Piece({ spec }: { spec: PieceSpec }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, spec.delay]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(spec.angle) * spec.distance * progress.value },
      { translateY: Math.sin(spec.angle) * spec.distance * progress.value - progress.value * progress.value * 18 },
      { rotate: `${spec.rotate * progress.value}deg` },
    ],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: spec.size, height: spec.size * 0.45, backgroundColor: spec.color },
        style,
      ]}
    />
  );
}

export function ConfettiBurst({ trigger }: { trigger: number }) {
  const lastFired = useRef(-1);
  const pieces = useMemo(
    () => (trigger > 0 ? makePieces(trigger) : []),
    [trigger],
  );
  if (trigger > lastFired.current) lastFired.current = trigger;
  if (pieces.length === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.origin}>
        {pieces.map((spec, i) => (
          <Piece key={`${trigger}-${i}`} spec={spec} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    borderRadius: 2,
  },
  origin: {
    position: 'absolute',
    left: '50%',
    top: '62%',
  },
});
```

- [ ] **Step 2: Wire modal — animated fill, pop-in claim button, confetti + haptic on unlock**

In `SimulatedAdModal.tsx`:

1. Imports add:

```tsx
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';
import { spring } from '../../theme/motion';
import { ConfettiBurst } from '../effects/ConfettiBurst';
```

2. Inside component after `earned`:

```tsx
const burstTrigger = useSharedValue(0);
const [burstKey, setBurstKey] = useState(0);
React.useEffect(() => {
  if (earned) {
    haptics.success();
    burstTrigger.value = withTiming(1, { duration: 1 });
    setBurstKey((k) => k + 1);
  }
}, [earned]);

const claimScale = useSharedValue(0);
React.useEffect(() => {
  claimScale.value = earned ? withSpring(1, spring.bouncy) : withTiming(0, { duration: 120 });
}, [earned, claimScale]);
const claimStyle = useAnimatedStyle(() => ({
  transform: [{ scale: claimScale.value }],
}));
```

3. Progress fill becomes animated width synced to secondsLeft:

```tsx
const fill = useSharedValue(0);
React.useEffect(() => {
  fill.value = withTiming(((AD_DURATION_SECONDS - secondsLeft) / AD_DURATION_SECONDS) * 100, {
    duration: 950,
  });
}, [secondsLeft, fill]);
const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
// replace static fill View with <Animated.View style={[styles.progressFill, fillStyle]} />
```

4. Wrap claim button content: replace `{earned ? (<TouchableOpacity ...>)` block with confetti overlay + animated wrapper:

```tsx
{earned ? (
  <Animated.View style={claimStyle}>
    <TouchableOpacity ...existing props... >
      <Text style={styles.claimText}>Claim reward</Text>
    </TouchableOpacity>
  </Animated.View>
) : ( ...unchanged waiting row... )}
<ConfettiBurst trigger={burstKey} />
```

- [ ] **Step 3: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): crafted reward unlock - animated progress, confetti, claim pop"
```

---

### Task 7: Adaptive paywall nudge from real usage data

**Files:**
- Create: `apps/mobile/src/hooks/usePaywallNudge.ts`
- Modify: `apps/mobile/src/screens/PaywallScreen.tsx`

**Interfaces:**
- Consumes: `getAdEligibility()` from `../services/ads.api` (returns `{ tier, rescuesUsedToday?, dailyLimit? }` — inspect actual response type before coding; field names come from `AdEligibilityResponse` in `@meal-rescue/shared-types`).
- Produces: `usePaywallNudge(): string | null` — one personalized line or null.

- [ ] **Step 1: Read the real eligibility contract first**

Run: `Get-Content ../../packages/shared-types/src/*.ts | Select-String AdEligibilityResponse -Context 0,10` (from apps/mobile). Use EXACT field names found there.

- [ ] **Step 2: Hook**

Create `apps/mobile/src/hooks/usePaywallNudge.ts` (adjust fields per Step 1):

```ts
import { useEffect, useState } from 'react';

import { getAdEligibility } from '../services/ads.api';

/**
 * One personalized paywall line built from live usage. Returns null while
 * loading or when there is nothing personal worth saying.
 */
export function usePaywallNudge(): string | null {
  const [nudge, setNudge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdEligibility()
      .then((eligibility) => {
        if (cancelled) return;
        const used = eligibility.rescuesUsedToday ?? 0;
        if (eligibility.tier !== 'free') {
          setNudge(null);
        } else if (used >= 3) {
          setNudge("You've hit today's limit - unlimited is one tap away.");
        } else if (used > 0) {
          setNudge(`You've rescued ${used} meal${used === 1 ? '' : 's'} today. Members never run out.`);
        } else {
          setNudge(null);
        }
      })
      .catch(() => {
        if (!cancelled) setNudge(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return nudge;
}
```

- [ ] **Step 3: Render under tagline in PaywallScreen**

```tsx
const nudge = usePaywallNudge();
// below tagline Text:
{nudge ? <Text style={styles.nudge}>{nudge}</Text> : null}
// styles: nudge: { textAlign:'center', color: colors.primary, fontWeight:'600', marginBottom: spacing.md, marginTop: -spacing.sm }
```

- [ ] **Step 4: Verify + commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
git add apps/mobile && git commit -m "feat(mobile): adaptive paywall nudge from live rescue usage"
```

---

### Task 8: Final gates + emulator smoke

- [ ] **Step 1: Full workspace gates**

```bash
npm run lint --workspaces --if-present; cd apps/mobile; npx tsc --noEmit; npx eslint src --max-warnings 0
```

Expected: green across mobile.

- [ ] **Step 2: Emulator visual pass (Metro already running)**

Relaunch app on Pixel_7 (`adb shell am start ... mealrescue://...`), then verify via uiautomator dumps:
1. Home shows Scraps next to greeting (`content-desc` contains "rescue cat").
2. Capture → type meal → tap Understand → ScanningLoader steps visible ("Spotting proteins…" text present).
3. After analyze, Review renders normally (chips still labeled).
4. Rescue → Result shows "Your meal" line + dimmed food chips + orange addition chip; card appears after ~1s.
5. Profile → Paywall shows personalized nudge line when free-tier.
6. Trigger ad flow if quota remains: progress bar animates; Claim button pops; confetti fires (visual).

Fix anything broken; re-run gates; commit fixes.

- [ ] **Step 3: Update PROGRESS.md Phase 8 section and commit docs**

```bash
git add PROGRESS.md docs/superpowers/plans/2026-08-24-design-award-polish.md
git commit -m "docs: design award polish plan executed through Task 8"
```
