import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  TasteBoundaryGroup,
  TasteBoundaryGroupKind,
  TasteJournal,
  TasteJournalInsight,
  TasteSignalSource,
} from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import {
  BookIcon,
  ChevronLeftIcon,
  CompassIcon,
  FlaskIcon,
  GitCompareIcon,
  HeartIcon,
  LeafIcon,
  SparkIcon,
  TrendingIcon,
} from '../components/icons';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import {
  correctInsight,
  dismissInsight,
  forgetInsight,
  getJournal,
} from '../services/taste-journal.api';
import { colors, fonts, spacing, typography } from '../theme';

const SOURCE_LABELS: Record<TasteSignalSource, string> = {
  ONBOARDING: 'your setup',
  BEHAVIOR: 'your rescues',
  EXPLICIT_FEEDBACK: 'your ratings',
  SYSTEM_INFERENCE: 'our reading',
};

const SECTION_META: Record<
  string,
  { title: string; icon: React.ReactNode; accent: string; hint: string }
> = {
  patterns: {
    title: 'Your patterns',
    icon: <SparkIcon size={12} color="#FFFFFF" />,
    accent: colors.softFresh,
    hint: 'What you reliably love - and avoid',
  },
  depends: {
    title: 'It depends',
    icon: <GitCompareIcon size={12} color="#FFFFFF" />,
    accent: colors.softWarm,
    hint: 'When the context decides the outcome',
  },
  discoveries: {
    title: 'Recently discovered',
    icon: <TrendingIcon size={12} color="#FFFFFF" />,
    accent: colors.softCool,
    hint: 'Freshly spotted, still settling',
  },
  stillLearning: {
    title: 'Still learning',
    icon: <FlaskIcon size={12} color="#FFFFFF" />,
    accent: colors.softAccent,
    hint: 'Thin or conflicting - we are watching',
  },
};

interface InsightHandlers {
  busyId: string | null;
  onDismiss: (insight: TasteJournalInsight) => Promise<void>;
  onForget: (insight: TasteJournalInsight) => void;
  onCorrect: (insight: TasteJournalInsight, polarity: 'positive' | 'negative') => Promise<void>;
}

function sourceAttribution(sources: TasteSignalSource[]): string {
  const labels = [...new Set(sources.map((s) => SOURCE_LABELS[s] ?? s))];
  return labels.length > 0 ? `From ${labels.join(', ')}` : '';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

  const handleDismiss = useCallback(
    async (insight: TasteJournalInsight) => {
      haptics.light();
      setBusyId(insight.id);
      const previous = journal;
      setJournal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          patterns: prev.patterns.filter((i) => i.id !== insight.id),
          dependentPatterns: prev.dependentPatterns.filter((i) => i.id !== insight.id),
          discoveries: prev.discoveries.filter((i) => i.id !== insight.id),
          stillLearning: prev.stillLearning.filter((i) => i.id !== insight.id),
          boundaries: prev.boundaries.map((b) => ({
            ...b,
            items: b.items.filter((i) => i.id !== insight.id),
          })),
        };
      });
      try {
        await dismissInsight(insight.id);
      } catch (err) {
        setJournal(previous);
        setError(toApiError(err));
      } finally {
        setBusyId(null);
      }
    },
    [journal],
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
              void (async () => {
                setBusyId(insight.id);
                const previous = journal;
                setJournal((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    patterns: prev.patterns.filter((i) => i.id !== insight.id),
                    dependentPatterns: prev.dependentPatterns.filter((i) => i.id !== insight.id),
                    discoveries: prev.discoveries.filter((i) => i.id !== insight.id),
                    stillLearning: prev.stillLearning.filter((i) => i.id !== insight.id),
                    boundaries: prev.boundaries.map((b) => ({
                      ...b,
                      items: b.items.filter((i) => i.id !== insight.id),
                    })),
                  };
                });
                try {
                  await forgetInsight(insight.id);
                } catch (err) {
                  setJournal(previous);
                  setError(toApiError(err));
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [journal],
  );

  const handleCorrect = useCallback(
    async (insight: TasteJournalInsight, polarity: 'positive' | 'negative') => {
      setBusyId(insight.id);
      const previous = journal;
      setJournal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          patterns: prev.patterns.filter((i) => i.id !== insight.id),
          dependentPatterns: prev.dependentPatterns.filter((i) => i.id !== insight.id),
          discoveries: prev.discoveries.filter((i) => i.id !== insight.id),
          stillLearning: prev.stillLearning.filter((i) => i.id !== insight.id),
          boundaries: prev.boundaries.map((b) => ({
            ...b,
            items: b.items.filter((i) => i.id !== insight.id),
          })),
        };
      });
      try {
        await correctInsight(insight.id, polarity);
      } catch (err) {
        setJournal(previous);
        setError(toApiError(err));
      } finally {
        setBusyId(null);
      }
    },
    [journal],
  );

  const handlers = useMemo<InsightHandlers>(
    () => ({ busyId, onDismiss: handleDismiss, onForget: handleForget, onCorrect: handleCorrect }),
    [busyId, handleCorrect, handleDismiss, handleForget],
  );

  const isEmpty = useMemo(() => {
    if (!journal) return true;
    return (
      journal.summary.totalSignals === 0 &&
      journal.patterns.length === 0 &&
      journal.dependentPatterns.length === 0 &&
      journal.discoveries.length === 0 &&
      journal.stillLearning.length === 0 &&
      journal.boundaries.every((b) => b.items.length === 0)
    );
  }, [journal]);

  type SectionItem = { key: string; render: () => React.ReactElement };
  const sections = useMemo(() => {
    if (!journal) return [];
    const list: SectionItem[] = [];
    if (journal.patterns.length > 0) {
      list.push(renderInsightSection('patterns', journal.patterns, handlers));
    }
    if (journal.dependentPatterns.length > 0) {
      list.push(renderInsightSection('depends', journal.dependentPatterns, handlers));
    }
    if (journal.discoveries.length > 0) {
      list.push(renderInsightSection('discoveries', journal.discoveries, handlers));
    }
    if (journal.stillLearning.length > 0) {
      list.push(renderInsightSection('stillLearning', journal.stillLearning, handlers));
    }
    if (journal.boundaries.some((b) => b.items.length > 0)) {
      list.push({
        key: 'boundaries',
        render: () => renderBoundaries(journal.boundaries, handlers),
      });
    }
    return list;
  }, [handlers, journal]);

  const header = useMemo(() => {
    if (!journal) return null;
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={() => navigation.goBack()}
          style={styles.backRow}
        >
          <ChevronLeftIcon size={18} color={colors.homeTextQuiet} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroEmblem}>
            <BookIcon size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroTitle]}>Your Taste Journal</Text>
          <Text style={[typography.body, styles.heroSub]}>
            What Meal Rescue says about how you eat - every line grounded in something you have told
            us or shown us.
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{journal.summary.establishedCount}</Text>
              <Text style={styles.heroStatLabel}>confident reads</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{journal.summary.patternsCount}</Text>
              <Text style={styles.heroStatLabel}>patterns</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{journal.summary.totalSignals}</Text>
              <Text style={styles.heroStatLabel}>observations</Text>
            </View>
          </View>
          <Text style={styles.heroFreshness}>
            {journal.summary.freshness === 'stale'
              ? 'Based on older observations - they quiet down over time.'
              : 'Everything here comes from what you have told us - never from guessing.'}
          </Text>
        </View>
      </>
    );
  }, [journal, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.heroEmblem}>
              <BookIcon size={20} color="#FFFFFF" />
            </View>
            <Skeleton.Block width={210} height={28} />
            <Skeleton.Block width={280} height={14} />
            <Skeleton.Block width={140} height={14} />
          </View>
          <View style={styles.section}>
            <Skeleton.Block width="40%" height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton.Block key={i} width={i === 2 ? '60%' : '100%'} height={60} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isEmpty || !journal) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={styles.empty}>
            <BookIcon size={36} color={colors.homeTextTertiary} />
            <Text style={styles.emptyText}>Nothing here yet</Text>
            <Text style={styles.emptySub}>
              Rescue a meal, rate how it went, or finish a pairing and we will start keeping a
              record of your taste.
            </Text>
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
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item }) => item.render() as React.ReactElement}
        />
        <ErrorBanner error={error} />
      </FadeInView>
    </SafeAreaView>
  );
}

type SectionItemShape = { key: string; render: () => React.ReactElement };

function renderInsightSection(
  key: string,
  insights: TasteJournalInsight[],
  handlers: InsightHandlers,
): SectionItemShape {
  const meta = SECTION_META[key];
  return {
    key,
    render: () => (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: meta.accent }]}>{meta.icon}</View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{meta.title}</Text>
            <Text style={styles.sectionHint}>{meta.hint}</Text>
          </View>
        </View>
        <View style={styles.sectionBody}>
          {insights.map((insight, i) => (
            <FadeInView key={insight.id} delay={i * 60} rise={6}>
              <InsightCard insight={insight} handlers={handlers} />
            </FadeInView>
          ))}
        </View>
      </View>
    ),
  };
}

function renderBoundaries(
  groups: TasteBoundaryGroup[],
  handlers: InsightHandlers,
): React.ReactElement {
  const ordered: TasteBoundaryGroupKind[] = ['USUALLY_WORKS', 'DEPENDS', 'USUALLY_AVOID'];
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.text }]}>
          <CompassIcon size={12} color="#FFFFFF" />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Your boundaries</Text>
          <Text style={styles.sectionHint}>The edges of what you will happily eat</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>
        {ordered.flatMap((group) => {
          const match = groups.find((g) => g.group === group);
          if (!match || match.items.length === 0) return [];
          return [
            <View key={group} style={styles.boundaryGroup}>
              <Text style={styles.boundaryTitle}>{match.title}</Text>
              <Text style={styles.boundarySubtitle}>{match.subtitle}</Text>
              <View style={styles.boundaryItems}>
                {match.items.map((insight, i) => (
                  <FadeInView key={insight.id} delay={i * 60} rise={6}>
                    <InsightCard insight={insight} handlers={handlers} />
                  </FadeInView>
                ))}
              </View>
            </View>,
          ];
        })}
      </View>
    </View>
  );
}

function InsightCard({
  insight,
  handlers,
}: {
  insight: TasteJournalInsight;
  handlers: InsightHandlers;
}) {
  const [correctOpen, setCorrectOpen] = useState(false);
  const _busy = handlers.busyId === insight.id;

  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>{insight.title}</Text>
      <Text style={styles.insightBody}>{insight.body}</Text>
      <Text style={styles.insightFooter}>
        {sourceAttribution(insight.sourceTypes)}
        {insight.lastObservedAt ? ` · ${formatDate(insight.lastObservedAt)}` : ''}
        {` · ${insight.evidenceCount} ${insight.evidenceCount === 1 ? 'observation' : 'observations'}`}
      </Text>

      <Modal
        visible={correctOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCorrectOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.correctCard}>
            <Text style={styles.modalTitle}>Not quite right</Text>
            <Text style={styles.modalSubtitle}>How would you put it?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCorrectOpen(false);
                void handlers.onCorrect(insight, 'positive');
              }}
              style={styles.correctOption}
            >
              <HeartIcon size={18} color={colors.primary} />
              <Text style={styles.correctOptionText}>Actually, I like this</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCorrectOpen(false);
                void handlers.onCorrect(insight, 'negative');
              }}
              style={[styles.correctOption, styles.correctOptionAvoid]}
            >
              <LeafIcon size={18} color={colors.softCool} />
              <Text style={styles.correctOptionText}>Actually, I avoid this</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCorrectOpen(false);
                void handlers.onDismiss(insight);
              }}
              style={styles.correctCancel}
            >
              <Text style={styles.correctCancelText}>Just hide this one</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  backText: { color: colors.homeTextQuiet, fontFamily: fonts.medium, fontSize: 14 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroEmblem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.homeInk,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '400',
    color: colors.homeInk,
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  heroStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 },
  heroStatNum: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '400',
    color: colors.homeInk,
  },
  heroStatLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.border },
  heroFreshness: {
    marginTop: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  section: { marginBottom: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '400',
    color: colors.homeInk,
    letterSpacing: 0.2,
  },
  sectionHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionBody: { marginTop: spacing.sm },
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm - 2,
  },
  insightTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: '400',
    color: colors.homeInk,
    marginBottom: spacing.xs,
  },
  insightBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  insightFooter: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  insightActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  insightAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightActionText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
  boundaryGroup: { marginBottom: spacing.lg },
  boundaryTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: '400',
    color: colors.homeInk,
  },
  boundarySubtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  boundaryItems: { gap: spacing.sm },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '400',
    color: colors.homeInk,
  },
  modalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  correctCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  correctOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  correctOptionAvoid: { backgroundColor: colors.primaryLight },
  correctOptionText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.homeInk,
  },
  correctCancel: { alignItems: 'center', paddingVertical: spacing.sm },
  correctCancelText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
