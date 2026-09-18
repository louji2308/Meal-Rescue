import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../components/motion/Pressable';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  TasteBoundaryGroup,
  TasteBoundaryGroupKind,
  TasteJournal,
  TasteJournalEvidenceDetail,
  TasteJournalInsight,
  TasteSignalPolarity,
  TasteSignalSource,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { FadeInView } from '../components/motion/FadeInView';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import {
  correctInsight,
  dismissInsight,
  forgetInsight,
  getJournal,
  getJournalEvidence,
} from '../services/taste-journal.api';
import { colors, spacing, typography } from '../theme';

const SOURCE_LABELS: Record<TasteSignalSource, string> = {
  ONBOARDING: 'your setup',
  BEHAVIOR: 'your rescues',
  EXPLICIT_FEEDBACK: 'your ratings',
  SYSTEM_INFERENCE: 'our reading',
};

const POLARITY_LABELS: Record<TasteSignalPolarity, string> = {
  positive: 'Liked',
  negative: 'Steered clear',
  mixed: 'Mixed',
  neutral: 'Noted',
};

const SECTION_META: Record<
  string,
  { title: string; name: keyof typeof Ionicons.glyphMap; accent: string; hint: string }
> = {
  patterns: {
    title: 'Your patterns',
    name: 'sparkles',
    accent: colors.softFresh,
    hint: 'What you reliably love - and avoid',
  },
  depends: {
    title: 'It depends',
    name: 'git-compare',
    accent: colors.softWarm,
    hint: 'When the context decides the outcome',
  },
  discoveries: {
    title: 'Recently discovered',
    name: 'trending-up',
    accent: colors.softCool,
    hint: 'Freshly spotted, still settling',
  },
  stillLearning: {
    title: 'Still learning',
    name: 'flask',
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

  const afterMutation = useCallback(async () => {
    try {
      const data = await getJournal();
      setJournal(data);
      setError(null);
    } catch (err) {
      setError(toApiError(err));
    }
  }, []);

  const handleDismiss = useCallback(
    async (insight: TasteJournalInsight) => {
      setBusyId(insight.id);
      try {
        await dismissInsight(insight.id);
        await afterMutation();
      } catch (err) {
        setError(toApiError(err));
      } finally {
        setBusyId(null);
      }
    },
    [afterMutation],
  );

  const handleForget = useCallback(
    (insight: TasteJournalInsight) => {
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
                try {
                  await forgetInsight(insight.id);
                  await afterMutation();
                } catch (err) {
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
    [afterMutation],
  );

  const handleCorrect = useCallback(
    async (insight: TasteJournalInsight, polarity: 'positive' | 'negative') => {
      setBusyId(insight.id);
      try {
        await correctInsight(insight.id, polarity);
        await afterMutation();
      } catch (err) {
        setError(toApiError(err));
      } finally {
        setBusyId(null);
      }
    },
    [afterMutation],
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
          <Ionicons name="arrow-back" size={20} color={colors.softAlert} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroEmblem}>
            <Ionicons name="book" size={22} color="#FFFFFF" />
          </View>
          <Text style={[typography.title, styles.heroTitle]}>Your Taste Journal</Text>
          <Text style={[typography.body, styles.heroSub]}>
            What Meal Rescue says about how you eat - every line grounded in something you have
            told us or shown us.
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
              <Ionicons name="book" size={22} color="#FFFFFF" />
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
            <Ionicons name="book-outline" size={44} color={colors.softAlert} />
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
          <View style={[styles.sectionIcon, { backgroundColor: meta.accent }]}>
            <Ionicons name={meta.name} size={16} color="#FFFFFF" />
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{meta.title}</Text>
            <Text style={styles.sectionHint}>{meta.hint}</Text>
          </View>
        </View>
        <View style={styles.sectionBody}>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} handlers={handlers} />
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
          <Ionicons name="compass" size={16} color="#FFFFFF" />
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
                {match.items.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} handlers={handlers} />
                ))}
              </View>
            </View>,
          ];
        })}
      </View>
    </View>
  );
}

function InsightCard({ insight, handlers }: { insight: TasteJournalInsight; handlers: InsightHandlers }) {
  const [evidence, setEvidence] = useState<TasteJournalEvidenceDetail | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const busy = handlers.busyId === insight.id;

  const openEvidence = useCallback(async () => {
    setEvidenceOpen(true);
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const detail = await getJournalEvidence(insight.id);
      setEvidence(detail);
    } catch (err) {
      setEvidenceError(toApiError(err).message);
    } finally {
      setEvidenceLoading(false);
    }
  }, [insight.id]);

  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>{insight.title}</Text>
      <Text style={styles.insightBody}>{insight.body}</Text>
      <Text style={styles.insightFooter}>
        {sourceAttribution(insight.sourceTypes)}
        {insight.lastObservedAt ? ` · ${formatDate(insight.lastObservedAt)}` : ''}
        {` · ${insight.evidenceCount} ${insight.evidenceCount === 1 ? 'observation' : 'observations'}`}
      </Text>
      <View style={styles.insightActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Why do you think this?"
          onPress={() => void openEvidence()}
          style={styles.insightAction}
        >
          <Ionicons name="help-circle-outline" size={15} color={colors.primary} />
          <Text style={styles.insightActionText}>Why do you think this?</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="That is not me"
          disabled={busy}
          onPress={() => setCorrectOpen(true)}
          style={styles.insightAction}
        >
          <Ionicons name="close-circle-outline" size={15} color={colors.softAlert} />
          <Text style={styles.insightActionText}>That&apos;s not me</Text>
        </Pressable>
      </View>

      <Modal
        visible={evidenceOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEvidenceOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setEvidenceOpen(false)}
              style={styles.modalClose}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.modalTitle}>Why do you think this?</Text>
            <Text style={styles.modalSubtitle}>{insight.title}</Text>
            {evidenceLoading ? (
              <View style={styles.evidenceLoading}>
                <Skeleton.Block width="100%" height={14} />
                <Skeleton.Block width="80%" height={14} />
                <Skeleton.Block width="90%" height={14} />
              </View>
            ) : evidenceError ? (
              <Text style={styles.evidenceError}>{evidenceError}</Text>
            ) : evidence ? (
              <ScrollView style={styles.evidenceList}>
                {evidence.evidence.map((item, i) => (
                  <View key={i} style={styles.evidenceItem}>
                    <View style={styles.evidenceItemHeader}>
                      <Text style={styles.evidencePolarity}>{POLARITY_LABELS[item.polarity]}</Text>
                      <Text style={styles.evidenceDate}>{formatDate(item.occurredAt)}</Text>
                    </View>
                    <Text style={styles.evidenceSource}>{item.sourceLabel}</Text>
                    {item.context && (
                      <Text style={styles.evidenceContext}>
                        in {item.context.contextValue.replace(/_/g, ' ')}
                      </Text>
                    )}
                  </View>
                ))}
                <Text style={styles.evidenceNote}>
                  Every entry is a real signal we recorded - nothing here is invented.
                </Text>
              </ScrollView>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEvidenceOpen(false);
                  setCorrectOpen(true);
                }}
                style={styles.modalActionButton}
              >
                <Text style={styles.modalActionText}>That&apos;s not me</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEvidenceOpen(false);
                  handlers.onForget(insight);
                }}
                style={[styles.modalActionButton, styles.modalActionDanger]}
              >
                <Text style={styles.modalActionDangerText}>Forget this</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={correctOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCorrectOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.correctCard}>
            <Text style={styles.modalTitle}>That&apos;s not me</Text>
            <Text style={styles.modalSubtitle}>How would you put it?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCorrectOpen(false);
                void handlers.onCorrect(insight, 'positive');
              }}
              style={styles.correctOption}
            >
              <Ionicons name="heart" size={20} color={colors.softAlert} />
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
              <Ionicons name="leaf" size={20} color={colors.softCool} />
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
  backText: { color: colors.primary, fontSize: 15 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroEmblem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { marginBottom: spacing.xs },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  heroStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 },
  heroStatNum: { fontSize: 26, fontWeight: '800', color: colors.text },
  heroStatLabel: { fontSize: 12, color: colors.textSecondary },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.border },
  heroFreshness: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  section: { marginBottom: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sectionBody: { marginTop: spacing.sm },
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  insightTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  insightBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  insightFooter: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textSecondary,
  },
  insightActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  insightAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightActionText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  boundaryGroup: { marginBottom: spacing.lg },
  boundaryTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  boundarySubtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  boundaryItems: { gap: spacing.sm },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptySub: { color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    minHeight: 320,
  },
  modalClose: {
    alignSelf: 'flex-end',
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  evidenceLoading: { gap: spacing.sm, paddingVertical: spacing.md },
  evidenceError: { color: colors.softAlert, fontSize: 14 },
  evidenceList: { maxHeight: 360 },
  evidenceItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
  },
  evidenceItemHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  evidencePolarity: { fontSize: 14, fontWeight: '700', color: colors.text },
  evidenceDate: { fontSize: 12, color: colors.textSecondary },
  evidenceSource: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  evidenceContext: { fontSize: 13, color: colors.secondary, marginTop: 2, fontStyle: 'italic' },
  evidenceNote: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.lg, fontStyle: 'italic' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalActionButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalActionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  modalActionDanger: { borderColor: colors.softAlert },
  modalActionDangerText: { fontSize: 14, fontWeight: '600', color: colors.softAlert },
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
  correctOptionText: { fontSize: 15, fontWeight: '600', color: colors.text },
  correctCancel: { alignItems: 'center', paddingVertical: spacing.sm },
  correctCancelText: { fontSize: 14, color: colors.textSecondary },
});