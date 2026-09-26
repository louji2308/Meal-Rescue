import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type {
  TasteJournalEvidenceDetail,
  TasteJournalInsight,
  TasteSignalSource,
} from '@meal-rescue/shared-types';

import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { ChevronDownIcon, EllipsisIcon } from '../icons';
import { Pressable } from '../motion/Pressable';
import { CorrectSheet } from './CorrectSheet';
import { EntryMoreSheet } from './EntryMoreSheet';
import { EvidenceDetail } from './EvidenceDetail';

export interface JournalEntryHandlers {
  busyId: string | null;
  onDismiss: (insight: TasteJournalInsight) => void;
  onForget: (insight: TasteJournalInsight) => void;
  onCorrect: (insight: TasteJournalInsight, polarity: 'positive' | 'negative') => void;
  fetchEvidence: (id: string) => Promise<TasteJournalEvidenceDetail>;
}

const SOURCE_LABELS: Record<TasteSignalSource, string> = {
  ONBOARDING: 'your setup',
  BEHAVIOR: 'your rescues',
  EXPLICIT_FEEDBACK: 'your ratings',
  SYSTEM_INFERENCE: 'our reading',
};

function learnedFrom(sources: TasteSignalSource[]): string {
  const labels = [...new Set(sources.map((s) => SOURCE_LABELS[s] ?? s))];
  return labels.length === 0 ? 'our observations' : labels.join(' and ');
}

function formatMeta(insight: TasteJournalInsight): string {
  const parts: string[] = [];
  parts.push(`Learned from ${learnedFrom(insight.sourceTypes)}`);
  if (insight.lastObservedAt) {
    const d = new Date(insight.lastObservedAt);
    parts.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  parts.push(
    `${insight.evidenceCount} ${insight.evidenceCount === 1 ? 'observation' : 'observations'}`,
  );
  return parts.join(' · ');
}

function pad(num: number): string {
  return String(num).padStart(2, '0');
}

/**
 * JournalEntry - one numbered editorial entry. Tap it to open the live
 * evidence trail behind the claim; the quiet "... " menu handles corrections.
 */
export function JournalEntry({
  insight,
  index,
  handlers,
}: {
  insight: TasteJournalInsight;
  index: number;
  handlers: JournalEntryHandlers;
}) {
  const [expanded, setExpanded] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [correctVisible, setCorrectVisible] = useState(false);
  const chevron = useSharedValue(0);
  const busy = handlers.busyId === insight.id;

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      chevron.value = withTiming(prev ? 0 : 1, { duration: 200 });
      return !prev;
    });
  }, [chevron]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const meta = useMemo(() => formatMeta(insight), [insight]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See why we think: ${insight.title}`}
          onPress={toggle}
          style={styles.main}
          scaleTo={0.99}
          tintBorderRadius={12}
        >
          <Text style={styles.number}>{pad(index)}</Text>
          <View style={styles.copy}>
            <Text style={styles.title}>{insight.title}</Text>
            <Text style={styles.body}>{insight.body}</Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
        </Pressable>

        <View style={styles.controls}>
          {busy ? (
            <View style={styles.busy} accessibilityLabel="Working…">
              <ActivityIndicator size="small" color={colors.homeTextTertiary} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More options for ${insight.title}`}
              onPress={() => setMoreVisible(true)}
              style={styles.more}
              tintBorderRadius={999}
            >
              <EllipsisIcon size={18} color={colors.homeTextQuiet} />
            </Pressable>
          )}
          <Animated.View style={[styles.caret, chevronStyle]}>
            <ChevronDownIcon size={16} color={colors.homeTextTertiary} />
          </Animated.View>
        </View>
      </View>

      {expanded ? (
        <EvidenceDetail insight={insight} fetchEvidence={handlers.fetchEvidence} />
      ) : null}

      <EntryMoreSheet
        visible={moreVisible}
        title={insight.title}
        onClose={() => setMoreVisible(false)}
        onCorrect={() => {
          setMoreVisible(false);
          setCorrectVisible(true);
        }}
        onHide={() => {
          setMoreVisible(false);
          handlers.onDismiss(insight);
        }}
        onForget={() => {
          setMoreVisible(false);
          handlers.onForget(insight);
        }}
      />

      <CorrectSheet
        visible={correctVisible}
        onClose={() => setCorrectVisible(false)}
        onCorrect={(polarity) => {
          setCorrectVisible(false);
          handlers.onCorrect(insight, polarity);
        }}
        onDismiss={() => {
          setCorrectVisible(false);
          handlers.onDismiss(insight);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  number: {
    fontFamily: fonts.serifDisplay,
    fontSize: 15,
    color: colors.homeTextTertiary,
    paddingTop: 2,
    width: 26,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.serifDisplay,
    fontSize: 18,
    color: colors.homeInk,
    lineHeight: 24,
    letterSpacing: -0.1,
    marginBottom: 3,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.sm - 2,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.homeTextTertiary,
    letterSpacing: 0.1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 0,
  },
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginRight: -8,
  },
  busy: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginRight: -8,
  },
  caret: {
    width: 18,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
