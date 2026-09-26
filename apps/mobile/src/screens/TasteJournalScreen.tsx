import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  TasteBoundaryGroup,
  TasteJournal,
  TasteJournalInsight,
} from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { BookIcon } from '../components/icons';
import { FadeInView } from '../components/motion/FadeInView';
import { JournalChapter } from '../components/taste-journal/JournalChapter';
import type { JournalEntryHandlers } from '../components/taste-journal/JournalEntry';
import { JournalMasthead } from '../components/taste-journal/JournalMasthead';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import {
  correctInsight,
  dismissInsight,
  forgetInsight,
  getJournal,
  getJournalEvidence,
} from '../services/taste-journal.api';
import { colors, fonts, spacing, typography } from '../theme';

const BOUNDARY_ORDER: TasteBoundaryGroup['group'][] = ['USUALLY_WORKS', 'DEPENDS', 'USUALLY_AVOID'];

type ChapterShape = {
  key: string;
  numeral: string;
  title: string;
  hint: string;
  entries?: TasteJournalInsight[];
  groups?: TasteBoundaryGroup[];
};

const CHAPTERS: Omit<ChapterShape, 'entries'>[] = [
  { key: 'patterns', numeral: 'I', title: 'Patterns', hint: 'What you reliably love — and avoid' },
  {
    key: 'depends',
    numeral: 'II',
    title: 'It depends',
    hint: 'When the context decides the outcome',
  },
  {
    key: 'boundaries',
    numeral: 'III',
    title: 'Your boundaries',
    hint: 'The edges of what you will happily eat',
  },
  {
    key: 'discoveries',
    numeral: 'IV',
    title: 'Recently discovered',
    hint: 'Freshly spotted, still settling',
  },
  {
    key: 'stillLearning',
    numeral: 'V',
    title: 'Still learning',
    hint: 'Thin or conflicting — we are watching',
  },
  {
    key: 'progress',
    numeral: 'VI',
    title: 'In progress',
    hint: 'Emerging strands, not yet a confident read',
  },
];

/** Removes an insight from every journal array (optimistic update helper). */
function withoutInsight(journal: TasteJournal, insight: TasteJournalInsight): TasteJournal {
  return {
    ...journal,
    patterns: journal.patterns.filter((i) => i.id !== insight.id),
    dependentPatterns: journal.dependentPatterns.filter((i) => i.id !== insight.id),
    discoveries: journal.discoveries.filter((i) => i.id !== insight.id),
    stillLearning: journal.stillLearning.filter((i) => i.id !== insight.id),
    progress: journal.progress.filter((i) => i.id !== insight.id),
    boundaries: journal.boundaries.map((b) => ({
      ...b,
      items: b.items.filter((i) => i.id !== insight.id),
    })),
  };
}

function journalIsEmpty(journal: TasteJournal): boolean {
  return (
    journal.summary.totalSignals === 0 &&
    journal.patterns.length === 0 &&
    journal.dependentPatterns.length === 0 &&
    journal.discoveries.length === 0 &&
    journal.stillLearning.length === 0 &&
    journal.progress.length === 0 &&
    journal.boundaries.every((b) => b.items.length === 0)
  );
}

/**
 * Taste Journal - an evidence-backed, editorial read of what Meal Rescue
 * has learned about how you eat. Everything is grounded in real signals:
 * expanding an entry shows the live evidence trail behind the claim, and
 * every action (correct / hide / forget) writes back to the journal.
 */
export function TasteJournalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [journal, setJournal] = useState<TasteJournal | null>(null);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const lastLoadedAt = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'initial' && !lastLoadedAt.current) setLoading(true);
    try {
      const data = await getJournal();
      lastLoadedAt.current = Date.now();
      setJournal(data);
      setError(null);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      if (mode !== 'background') {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!lastLoadedAt.current) {
        void load('initial');
      } else if (Date.now() - lastLoadedAt.current > 30_000) {
        void load('background');
      }
    }, [load]),
  );

  const runOptimistic = useCallback(
    async (insight: TasteJournalInsight, action: () => Promise<unknown>) => {
      setBusyId(insight.id);
      const previous = journal;
      setJournal((prev) => (prev ? withoutInsight(prev, insight) : prev));
      try {
        await action();
      } catch (err) {
        if (previous) setJournal(previous);
        setError(toApiError(err));
      } finally {
        setBusyId(null);
      }
    },
    [journal],
  );

  const handleDismiss = useCallback(
    (insight: TasteJournalInsight) => {
      haptics.light();
      void runOptimistic(insight, () => dismissInsight(insight.id));
    },
    [runOptimistic],
  );

  const handleForget = useCallback(
    (insight: TasteJournalInsight) => {
      haptics.warning();
      Alert.alert(
        'Forget this?',
        'This strand and everything behind it will be removed from your journal. A genuinely new signal would bring it back.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Forget',
            style: 'destructive',
            onPress: () => {
              void runOptimistic(insight, () => forgetInsight(insight.id));
            },
          },
        ],
      );
    },
    [runOptimistic],
  );

  const handleCorrect = useCallback(
    (insight: TasteJournalInsight, polarity: 'positive' | 'negative') => {
      haptics.light();
      void runOptimistic(insight, () => correctInsight(insight.id, polarity));
    },
    [runOptimistic],
  );

  const handlers = useMemo<JournalEntryHandlers>(
    () => ({
      busyId,
      onDismiss: handleDismiss,
      onForget: handleForget,
      onCorrect: handleCorrect,
      fetchEvidence: (id) => getJournalEvidence(id),
    }),
    [busyId, handleCorrect, handleDismiss, handleForget],
  );

  const sections = useMemo(() => {
    if (!journal) return [];
    const list: ChapterShape[] = [];
    for (const chapter of CHAPTERS) {
      if (chapter.key === 'boundaries') {
        const groups = BOUNDARY_ORDER.map((kind) =>
          journal.boundaries.find((b) => b.group === kind),
        ).filter((g): g is TasteBoundaryGroup => !!g && g.items.length > 0);
        if (groups.length > 0) list.push({ ...chapter, groups });
        continue;
      }
      const entries =
        chapter.key === 'patterns'
          ? journal.patterns
          : chapter.key === 'depends'
            ? journal.dependentPatterns
            : chapter.key === 'discoveries'
              ? journal.discoveries
              : chapter.key === 'stillLearning'
                ? journal.stillLearning
                : journal.progress;
      if (entries.length > 0) list.push({ ...chapter, entries });
    }
    return list;
  }, [journal]);

  const masthead = useMemo(() => {
    if (!journal) return null;
    return <JournalMasthead summary={journal.summary} onBack={() => navigation.goBack()} />;
  }, [journal, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton.Block width={84} height={14} />
          <View style={styles.skeletonMasthead}>
            <Skeleton.Block width={40} height={40} borderRadius={20} />
            <Skeleton.Block width={210} height={26} />
            <Skeleton.Block width={300} height={14} />
            <Skeleton.Block width={220} height={14} />
          </View>
          <View style={styles.skeletonChapter}>
            <Skeleton.Block width="45%" height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton.Block key={i} width={i === 2 ? '70%' : '100%'} height={72} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!journal || journalIsEmpty(journal)) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {masthead}
          <View style={styles.empty}>
            <FadeInView rise={6}>
              <View style={styles.emptyEmblem}>
                <BookIcon size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.emptyText}>Nothing here yet</Text>
              <Text style={styles.emptySub}>
                Rescue a meal, rate how it went, or finish a pairing and we will start keeping a
                record of your taste.{' '}
                <Text style={styles.emptySubEm}>The moment we have a read, it appears here.</Text>
              </Text>
            </FadeInView>
          </View>
          <ErrorBanner error={error} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FadeInView style={styles.container}>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={masthead}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item }) => (
            <JournalChapter
              numeral={item.numeral}
              title={item.title}
              hint={item.hint}
              entries={item.entries}
              groups={item.groups}
              handlers={handlers}
            />
          )}
        />
        <ErrorBanner error={error} />
      </FadeInView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },

  skeletonMasthead: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  skeletonChapter: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyEmblem: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.homeInk,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyText: {
    fontFamily: fonts.serifDisplay,
    fontSize: 22,
    color: colors.homeInk,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  emptySubEm: {
    fontStyle: 'italic',
    color: colors.homeTextQuiet,
  },
});
