import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TasteBoundaryGroup, TasteJournalInsight } from '@meal-rescue/shared-types';

import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { FadeInView } from '../motion/FadeInView';
import { JournalEntry, type JournalEntryHandlers } from './JournalEntry';

/**
 * JournalChapter - one editorial chapter of the journal: a roman-numeral
 * header with a hairline rule, then numbered entries (or boundary groups).
 */
export function JournalChapter({
  numeral,
  title,
  hint,
  entries,
  groups,
  handlers,
}: {
  numeral: string;
  title: string;
  hint: string;
  entries?: TasteJournalInsight[];
  groups?: TasteBoundaryGroup[];
  handlers: JournalEntryHandlers;
}) {
  return (
    <View style={styles.chapter}>
      <View style={styles.headerRow}>
        <Text style={styles.numeral}>{numeral}</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.rule} />
      </View>
      <Text style={styles.hint}>{hint}</Text>

      {entries && entries.length > 0 ? (
        <View style={styles.body}>
          {entries.map((entry, i) => (
            <FadeInView key={entry.id} delay={Math.min(i * 50, 250)}>
              <JournalEntry insight={entry} index={i + 1} handlers={handlers} />
            </FadeInView>
          ))}
        </View>
      ) : null}

      {groups && groups.length > 0
        ? groups.map((group) =>
            group.items.length === 0 ? null : (
              <View key={group.group} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.subtitle ? <Text style={styles.groupSubtitle}>{group.subtitle}</Text> : null}
                <View>
                  {group.items.map((entry, i) => (
                    <FadeInView key={entry.id} delay={Math.min(i * 50, 250)}>
                      <JournalEntry insight={entry} index={i + 1} handlers={handlers} />
                    </FadeInView>
                  ))}
                </View>
              </View>
            ),
          )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: {
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  numeral: {
    fontFamily: fonts.serifDisplay,
    fontSize: 15,
    color: colors.homeTextTertiary,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.homeInk,
    letterSpacing: -0.2,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  hint: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  body: {
    marginTop: spacing.xs,
  },

  group: {
    marginTop: spacing.sm,
  },
  groupTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.homeInk,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  groupSubtitle: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
