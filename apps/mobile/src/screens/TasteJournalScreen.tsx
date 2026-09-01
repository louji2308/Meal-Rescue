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
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { getTasteBundle } from '../services/taste.api';
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

const ORDER: JournalSection[] = ['preference', 'culture', 'learned'];

function groupBySections(entries: TasteJournalEntry[]): [JournalSection, TasteJournalEntry[]][] {
  const sections = new Map<JournalSection, TasteJournalEntry[]>();
  for (const entry of entries) {
    const key: JournalSection = ORDER.includes(entry.kind as JournalSection)
      ? (entry.kind as JournalSection)
      : 'learned';
    const list = sections.get(key) ?? [];
    list.push(entry);
    sections.set(key, list);
  }
  return ORDER.filter((key) => (sections.get(key)?.length ?? 0) > 0).map((key) => [
    key,
    sections.get(key)!,
  ]);
}

export function TasteJournalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [journal, setJournal] = useState<TasteJournalEntry[]>([]);
  const [personality, setPersonality] = useState<FoodPersonality | null>(null);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getTasteBundle()
        .then((bundle) => {
          if (!active) return;
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

  const sections = useMemo(() => groupBySections(journal), [journal]);

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
          <Text style={styles.backText}>Profile</Text>
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
    [journal.length, navigation, personality],
  );

  if (sections.length === 0) {
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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={([key]) => key}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const [key, entries] = item;
          const meta = SECTION_META[key];
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
                  style={[styles.entry, key === 'preference' && styles.entryPreference]}
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
        }}
      />
      <ErrorBanner error={error} />
    </SafeAreaView>
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
});
