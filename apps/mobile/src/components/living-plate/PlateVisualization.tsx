import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { colors, spacing } from '../../theme';
import { spring } from '../../theme/motion';
import { aftercareColors } from '../aftercare/tokens';
import { BASE_BLOB_PATH, PLATE_GEOMETRY } from './assets';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

interface PlateVisualizationProps {
  active: boolean;
  glyph: string;
  badged?: boolean;
}

/**
 * Top-view before/after plate drawn entirely with inline SVG.
 *
 * BEFORE: a single soft mound on a monochrome plate.
 * AFTER (active): the mound lifts, a second highlight layer appears, and the
 * tapped addition badge rises into place. The motion answers "what changed?"
 * (plan §37) instead of being decorative.
 */
export function PlateVisualization({ active, glyph, badged = true }: PlateVisualizationProps) {
  const { plateRadius, bowlRadius } = PLATE_GEOMETRY;

  const progress = useSharedValue(0);
  const running = useSharedValue(0);

  React.useEffect(() => {
    running.value = active ? 1 : 0;
    progress.value = withSpring(active ? 1 : 0, spring.gentle);
  }, [active, progress, running]);

  const highlightOpacity = useDerivedValue(() => progress.value * 0.85);
  const highlightCy = useDerivedValue(() => 118 - progress.value * 14);
  const highlightR = useDerivedValue(() => 40 + progress.value * 8);

  const badgeOpacity = useDerivedValue(() => progress.value);
  const badgeCy = useDerivedValue(() => 120 - progress.value * 22);

  const animHighlight = useAnimatedProps(() => ({
    opacity: highlightOpacity.value,
    cy: highlightCy.value,
    rx: highlightR.value,
    ry: highlightR.value * 0.62,
  }));

  const animBadge = useAnimatedProps(() => ({
    opacity: badgeOpacity.value,
    cy: badgeCy.value,
  }));

  const animGlyph = useAnimatedProps(() => ({
    opacity: badgeOpacity.value,
    y: badgeCy.value + 5.5,
  }));

  return (
    <View style={styles.wrap}>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={plateRadius} fill={colors.surface} stroke={colors.border} />
        <Circle cx={100} cy={100} r={bowlRadius} fill="#F4F3F0" />
        <AnimatedPath
          d={BASE_BLOB_PATH}
          fill={colors.primaryLight}
          stroke={colors.border}
          strokeWidth={1}
        />
        <AnimatedCircle
          animatedProps={animHighlight}
          cx={100}
          cy={130}
          r={0}
          fill={aftercareColors.accentSoft}
          stroke={aftercareColors.accent}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {badged && (
          <>
            <AnimatedCircle
              animatedProps={animBadge}
              cx={128}
              cy={130}
              r={16}
              fill={aftercareColors.accent}
            />
            <AnimatedSvgText
              animatedProps={animGlyph}
              x={128}
              y={0}
              fontSize={14}
              fontWeight="800"
              fill={colors.surface}
              textAnchor="middle"
            >
              {glyph}
            </AnimatedSvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});
