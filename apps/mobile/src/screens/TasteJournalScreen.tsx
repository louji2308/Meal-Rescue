import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FoodPersonality, TasteJournalEntry } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { getTasteBundle } from '../services/taste.api';
import { colors, spacing, typography } from '../theme';

/**
 * Taste Journal - the app's running memory of what it has learned about
 * you, plus your evolving Food Personality. Refreshed on focus so new
 * learnings appear as soon as you come back.
 */
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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={journal}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        ListHeaderComponent={
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

            <Text style={[typography.title, styles.title]}>Taste Journal</Text>
            <Text style={[typography.body, styles.subtitle]}>
              What Meal Rescue remembers about how you eat.
            </Text>

            {personality && personality.traits.length > 0 && (
              <View style={styles.personalityCard}>
                <Text style={styles.personalityTitle}>Your Food Personality</Text>
                {personality.traits.map((trait) => (
                  <View key={trait.id} style={styles.traitRow}>
                    <Text style={styles.traitLabel}>{trait.label}</Text>
                    <Text style={styles.traitDesc}>{trait.description}</Text>
                  </View>
                ))}
                <Text style={styles.personalityBio}>{personality.bio}</Text>
              </View>
            )}

            <Text style={styles.sectionHeader}>Entries</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={[styles.entry, item.kind === 'culture' ? styles.cultureEntry : null]}>
            <Text style={styles.entryText}>{item.text}</Text>
            <Text style={styles.entryDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No memories yet</Text>
            <Text style={styles.emptySub}>
              Rescue meals and give feedback to start your Taste Journal.
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
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
  title: { marginBottom: spacing.xs },
  subtitle: { color: colors.textSecondary, marginBottom: spacing.lg },
  personalityCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  personalityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  traitRow: { marginBottom: spacing.xs },
  traitLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  traitDesc: { fontSize: 13, color: colors.textSecondary },
  personalityBio: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  sectionHeader: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cultureEntry: { borderColor: colors.secondary, backgroundColor: colors.primaryLight },
  entryText: { fontSize: 14, color: colors.text, marginBottom: spacing.xs },
  entryDate: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
