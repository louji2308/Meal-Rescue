import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  FoodPersonality,
  TasteJournalEntry,
  TasteJournalKind,
  TasteV2Response,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { getTasteBundle, getTasteV2 } from '../services/taste.api';
import { colors, spacing, typography } from '../theme';

type JournalSection = TasteJournalKind;

const SECTION_META: Record<
  JournalSection,
  { title: string; icon: keyof typeof Ionicons.glyphMap; accent: string; hint: string }
> = {
  preference: {
    title: 'From your finish-a-meal picks',
    icon: 'sparkles',
    accent: '#000000',
    hint: 'The little additions you reached for as you set up your taste.',
  },
  culture: {
    title: 'Your food world',
    icon: 'compass',
    accent: '#6B6B6B',
    hint: 'How you lean between home-style and a twist.',
  },
  learned: {
    title: 'From your rescues',
    icon: 'restaurant',
    accent: '#999999',
    hint: 'What you leaned into — or away from — after saving meals.',
  },
  personality_shift: {
    title: 'Shifts',
    icon: 'trending-up',
    accent: '#6B6B6B',
    hint: 'Moments your taste changed.',
  },
  milestone: {
    title: 'Milestones',
    icon: 'flag',
    accent: '#000000',
    hint: 'Little wins worth remembering.',
  },
  corrected: {
    title: 'Corrections',
    icon: 'refresh',
    accent: '#999999',
    hint: 'Times we got it wrong and you told us.',
  },
};

const V1_ORDER: JournalSection[] = ['preference', 'culture', 'learned'];

function groupBySections(entries: TasteJournalEntry[]): [JournalSection, TasteJournalEntry[]][] {
  const sections = new Map<JournalSection, TasteJournalEntry[]>();
  for (const entry of entries) {
    const key: JournalSection = V1_ORDER.includes(entry.kind as JournalSection)
      ? (entry.kind as JournalSection)
      : 'learned';
    const list = sections.get(key) ?? [];
    list.push(entry);
    sections.set(key, list);
  }
  return V1_ORDER.filter((key) => (sections.get(key)?.length ?? 0) > 0).map((key) => [
    key,
    sections.get(key)!,
  ]);
}

function getTopPrefs(
  sensory: Record<string, { dimension: string; preference: string; strength: number; sampleCount: number }[]>,
  limit = 5,
): { liked: string[]; disliked: string[] } {
  const liked: { id: string; strength: number }[] = [];
  const disliked: { id: string; strength: number }[] = [];

  for (const [ingredient, beliefs] of Object.entries(sensory)) {
    for (const b of beliefs) {
      if (b.preference === 'love' || b.preference === 'like') {
        liked.push({ id: ingredient, strength: b.strength });
      } else if (b.preference === 'dislike' || b.preference === 'hate') {
        disliked.push({ id: ingredient, strength: b.strength });
      }
    }
  }

  liked.sort((a, b) => b.strength - a.strength);
  disliked.sort((a, b) => b.strength - a.strength);

  return {
    liked: [...new Set(liked.map((l) => l.id))].slice(0, limit),
    disliked: [...new Set(disliked.map((d) => d.id))].slice(0, limit),
  };
}

function getEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    EXPLICIT_LIKE: 'Liked',
    EXPLICIT_DISLIKE: 'Disliked',
    CURRENT_WANT: 'Wants',
    RESCUE_ACCEPTED: 'Accepted rescue',
    RESCUE_REJECTED: 'Rejected rescue',
    RESCUE_SWAPPED: 'Swapped rescue',
    MEAL_COMPLETED: 'Finished meal',
    SATISFACTION_NAILED: 'Nailed it',
    SATISFACTION_ALMOST: 'Almost right',
    SATISFACTION_NOT_FOR_ME: 'Not for me',
  };
  return map[eventType] ?? eventType;
}

function getSensorySummary(
  sensory: Record<string, { dimension: string; preference: string; strength: number }[]>,
): { dimension: string; count: number; top: string }[] {
  const dimCounts = new Map<string, { count: number; examples: string[] }>();
  for (const beliefs of Object.values(sensory)) {
    for (const b of beliefs) {
      const existing = dimCounts.get(b.dimension) ?? { count: 0, examples: [] };
      existing.count++;
      if (existing.examples.length < 2) existing.examples.push(b.preference);
      dimCounts.set(b.dimension, existing);
    }
  }
  return [...dimCounts.entries()]
    .map(([dimension, { count, examples }]) => ({
      dimension,
      count,
      top: examples.join(', '),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

export function TasteJournalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [v2, setV2] = useState<TasteV2Response | null>(null);
  const [journal, setJournal] = useState<TasteJournalEntry[]>([]);
  const [personality, setPersonality] = useState<FoodPersonality | null>(null);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getTasteV2().catch(() => null), getTasteBundle()])
        .then(([v2Data, bundle]) => {
          if (!active) return;
          if (v2Data) setV2(v2Data);
          setJournal(bundle.journal);
          setPersonality(bundle.personality);
        })
        .catch((err) => {
          if (active) setError(toApiError(err));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const v1Sections = useMemo(() => groupBySections(journal), [journal]);
  const topPrefs = useMemo(() => (v2 ? getTopPrefs(v2.sensory) : null), [v2]);
  const sensorySummary = useMemo(() => (v2 ? getSensorySummary(v2.sensory) : []), [v2]);
  const recentEvents = useMemo(() => v2?.recentEvents?.slice(0, 8) ?? [], [v2]);

  const header = useMemo(
    () => (
      <>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={() => navigation.goBack()}
          style={styles.backRow}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroEmblem}>
            <Ionicons name="book" size={22} color="#FFFFFF" />
          </View>
          <Text style={[typography.title, styles.heroTitle]}>Your Taste Journal</Text>
          <Text style={[typography.body, styles.heroSub]}>
            What Meal Rescue remembers about how you eat —{'\n'}and the small things it learned
            while watching.
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{journal.length}</Text>
              <Text style={styles.heroStatLabel}>memories</Text>
            </View>
            <View style={styles.heroDivider} />
            {personality && personality.traits.length > 0 && (
              <View style={styles.heroTrait}>
                <Text style={styles.heroTraitLabel}>{personality.traits[0]!.label}</Text>
                <Text style={styles.heroTraitSub}>personality</Text>
              </View>
            )}
            {v2 && v2.combinations.length > 0 && (
              <>
                <View style={styles.heroDivider} />
                <View style={styles.heroTrait}>
                  <Text style={styles.heroTraitLabel}>{v2.combinations.length}</Text>
                  <Text style={styles.heroTraitSub}>combinations</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {personality && personality.traits.length > 0 && (
          <View style={styles.traitCard}>
            <Text style={styles.traitCardTitle}>Your Food Personality</Text>
            {personality.traits.map((trait) => (
              <View key={trait.id} style={styles.traitRow}>
                <Text style={styles.traitLabel}>{trait.label}</Text>
                <Text style={styles.traitDesc}>{trait.description}</Text>
              </View>
            ))}
            <Text style={styles.traitBio}>{personality.bio}</Text>
          </View>
        )}
      </>
    ),
    [journal.length, navigation, personality, v2],
  );

  const v2Content = v2 && (v2.combinations.length > 0 || topPrefs || recentEvents.length > 0);

  if (!v2Content && v1Sections.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No memories yet</Text>
            <Text style={styles.emptySub}>
              Rescue a meal or give feedback and we&apos;ll start writing it all down here.
            </Text>
          </View>
          <ErrorBanner error={error} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  type SectionItem = { key: string; render: () => React.ReactElement };
  const sections: SectionItem[] = v2Content
    ? v2Sections(v2, sensorySummary, topPrefs, recentEvents)
    : v1Sections.map(([k, entries]) => ({
        key: k,
        render: () => {
          const meta = SECTION_META[k];
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: meta.accent }]}>
                  <Ionicons name={meta.icon} size={16} color="#FFFFFF" />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>{meta.title}</Text>
                  <Text style={styles.sectionHint}>{meta.hint}</Text>
                </View>
                <View style={[styles.sectionCount, { borderColor: meta.accent }]}>
                  <Text style={[styles.sectionCountText, { color: meta.accent }]}>
                    {entries.length}
                  </Text>
                </View>
              </View>
              {entries.map((entry, i) => (
                <View
                  key={`${entry.id}-${i}`}
                  style={[styles.entry, k === 'preference' && styles.entryPreference]}
                >
                  <View style={[styles.entryAccent, { backgroundColor: meta.accent }]} />
                  <View style={styles.entryBody}>
                    <Text style={styles.entryText}>{entry.text}</Text>
                    <Text style={styles.entryDate}>
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          );
        },
      }));

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => item.render() as React.ReactElement}
      />
      <ErrorBanner error={error} />
    </SafeAreaView>
  );
}

function v2Sections(
  v2: TasteV2Response,
  sensorySummary: { dimension: string; count: number; top: string }[],
  topPrefs: { liked: string[]; disliked: string[] } | null,
  recentEvents: TasteV2Response['recentEvents'],
): { key: string; render: () => React.ReactElement }[] {
  const sections: { key: string; render: () => React.ReactElement }[] = [];

  if (sensorySummary.length > 0) {
    sections.push({
      key: 'sensory-snapshot',
      render: () => (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="flask" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Sensory Snapshot</Text>
              <Text style={styles.sectionHint}>What your palate leans toward</Text>
            </View>
          </View>
          <View style={styles.snapshotGrid}>
            {sensorySummary.map((s) => (
              <View key={s.dimension} style={styles.snapshotCard}>
                <Text style={styles.snapshotDim}>{s.dimension}</Text>
                <Text style={styles.snapshotCount}>{s.count} beliefs</Text>
                <Text style={styles.snapshotTop}>{s.top}</Text>
              </View>
            ))}
          </View>
        </View>
      ),
    });
  }

  if (topPrefs && (topPrefs.liked.length > 0 || topPrefs.disliked.length > 0)) {
    sections.push({
      key: 'love-avoid',
      render: () => (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="heart" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Love &amp; Avoid</Text>
              <Text style={styles.sectionHint}>Ingredients you gravitate toward — and away from</Text>
            </View>
          </View>
          {topPrefs.liked.length > 0 && (
            <View style={styles.pillGroup}>
              <Text style={styles.pillGroupLabel}>Love</Text>
              <View style={styles.pillRow}>
                {topPrefs.liked.map((id) => (
                  <View key={id} style={[styles.pill, styles.pillLove]}>
                    <Text style={styles.pillText}>{id}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {topPrefs.disliked.length > 0 && (
            <View style={styles.pillGroup}>
              <Text style={styles.pillGroupLabel}>Avoid</Text>
              <View style={styles.pillRow}>
                {topPrefs.disliked.map((id) => (
                  <View key={id} style={[styles.pill, styles.pillAvoid]}>
                    <Text style={[styles.pillText, styles.pillTextAvoid]}>{id}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      ),
    });
  }

  if (v2.combinations.length > 0) {
    sections.push({
      key: 'combinations',
      render: () => (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="git-merge" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Combination Memory</Text>
              <Text style={styles.sectionHint}>Pairs and groups that work for you</Text>
            </View>
          </View>
          {v2.combinations.slice(0, 5).map((c, i) => (
            <View key={i} style={styles.comboCard}>
              <Text style={styles.comboMembers}>{c.members.join(' + ')}</Text>
              <View style={styles.comboMeta}>
                <Text style={styles.comboConf}>
                  {Math.round(c.confidence * 100)}% confident
                </Text>
                <Text style={styles.comboObs}>{c.observationCount}x observed</Text>
              </View>
            </View>
          ))}
        </View>
      ),
    });
  }

  if (v2.overexposed.length > 0) {
    sections.push({
      key: 'exposure',
      render: () => (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.textSecondary }]}>
              <Ionicons name="alert-circle" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Exposure Dashboard</Text>
              <Text style={styles.sectionHint}>Getting too much airtime lately</Text>
            </View>
          </View>
          <View style={styles.pillRow}>
            {v2.overexposed.map((id) => (
              <View key={id} style={[styles.pill, styles.pillOverexposed]}>
                <Text style={styles.pillText}>{id}</Text>
              </View>
            ))}
          </View>
        </View>
      ),
    });
  }

  if (recentEvents.length > 0) {
    sections.push({
      key: 'timeline',
      render: () => (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="time" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <Text style={styles.sectionHint}>Your latest taste moments</Text>
            </View>
          </View>
          {recentEvents.map((ev, i) => (
            <View key={ev.id ?? i} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>{getEventLabel(ev.eventType)}</Text>
                <Text style={styles.timelineTarget}>
                  {ev.targetId}
                  {ev.contextKey ? ` · ${ev.contextKey}` : ''}
                </Text>
                <Text style={styles.timelineDate}>
                  {new Date(ev.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ),
    });
  }

  return sections;
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
    backgroundColor: colors.primary,
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
  heroStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  heroStatNum: { fontSize: 28, fontWeight: '800', color: colors.text },
  heroStatLabel: { fontSize: 13, color: colors.textSecondary },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.border },
  heroTrait: { flexShrink: 1 },
  heroTraitLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  heroTraitSub: { fontSize: 12, color: colors.textSecondary },
  traitCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  traitCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  traitRow: { marginBottom: spacing.xs },
  traitLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  traitDesc: { fontSize: 13, color: colors.textSecondary },
  traitBio: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
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
  sectionCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  sectionCountText: { fontSize: 13, fontWeight: '700' },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  entryPreference: { backgroundColor: colors.primaryLight },
  entryAccent: { width: 3, borderRadius: 2, marginRight: spacing.md, alignSelf: 'stretch' },
  entryBody: { flex: 1 },
  entryText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  entryDate: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  snapshotCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '48%',
  },
  snapshotDim: { fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  snapshotCount: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  snapshotTop: { fontSize: 12, color: colors.secondary, marginTop: spacing.xs, fontStyle: 'italic' },
  pillGroup: { marginBottom: spacing.md },
  pillGroupLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillLove: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillAvoid: { backgroundColor: colors.surface, borderColor: colors.border },
  pillOverexposed: { backgroundColor: colors.surface, borderColor: colors.textSecondary },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.surface },
  pillTextAvoid: { color: colors.textSecondary },
  comboCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  comboMembers: { fontSize: 15, fontWeight: '700', color: colors.text },
  comboMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  comboConf: { fontSize: 12, color: colors.textSecondary },
  comboObs: { fontSize: 12, color: colors.textSecondary },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineContent: { flex: 1 },
  timelineLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  timelineTarget: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  timelineDate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
