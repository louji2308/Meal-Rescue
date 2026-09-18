import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Pressable } from '../../components/motion/Pressable';

import { AppImage, prefetchImages } from '../../components/AppImage';
import { Text } from '../../components/AppText';

import { ErrorBanner } from '../../components/ErrorBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import type { HouseholdMemberProfile } from '@meal-rescue/shared-types';
import { toApiError } from '../../services/api';
import {
  getSharedMeal,
  startCooking as startCookingApi,
} from '../../services/common-table.api';
import { loadPeoplePhotos } from '../../services/people-photos';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, fonts, spacing, typography } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

/**
 * Common Table home — one unified "Your Table" screen.
 *
 * The roster IS the selection: everyone you cook for is listed once. Tapping
 * a person includes them (charcoal border = selected); the ">" opens their
 * editor where allergies and avoid lists live. Finding a meal uses the people
 * you selected.
 *
 * Flow: Your Table (pick who's eating) → Ingredients → Plan & Cook → How did it go.
 */

function MemberRow({
  member,
  photo,
  isSelected,
  onToggle,
}: {
  member: HouseholdMemberProfile;
  photo?: string;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  const tilt = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}deg` }],
  }));

  function handlePress() {
    tilt.value = withSequence(
      withTiming(1.2, { duration: 70 }),
      withTiming(-0.9, { duration: 80 }),
      withSpring(0, { damping: 7, stiffness: 220 }),
    );
    onToggle(member.id);
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[styles.memberCard, isSelected && styles.memberCardSelected]}
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${member.displayName} eating tonight`}
      >
        <View style={[styles.avatar, photo && styles.avatarPhoto]}>
          {photo ? (
            <AppImage source={{ uri: photo }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{member.initials}</Text>
          )}
        </View>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.displayName}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function CommonTableHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const household = useCommonTableStore((s) => s.household);
  const members = useCommonTableStore((s) => s.members);
  const selected = useCommonTableStore((s) => s.selectedMemberIds);
  const toggleSelected = useCommonTableStore((s) => s.toggleSelectedMember);
  const setSelected = useCommonTableStore((s) => s.setSelectedMemberIds);
  const activeId = useCommonTableStore((s) => s.activeSharedMealId);
  const activeStatus = useCommonTableStore((s) => s.activeSharedMealStatus);
  const loadHousehold = useCommonTableStore((s) => s.loadHousehold);
  const hydrate = useCommonTableStore((s) => s.hydrate);
  const setResult = useCommonTableStore((s) => s.setResult);

  const [busy, setBusy] = useState(true);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await hydrate();
      await loadHousehold();
      const loaded = await loadPeoplePhotos();
      setPhotos(loaded);
      prefetchImages(Object.values(loaded));
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }, [hydrate, loadHousehold]);

  useEffect(() => {
    void load();
  }, [load]);

  // Preselect the whole table by default the first time members load.
  useEffect(() => {
    if (members.length > 0 && selected.length === 0) {
      setSelected(members.filter((m) => m.active).map((m) => m.id));
    }
  }, [members, selected.length, setSelected]);

  async function handleResume() {
    if (!activeId) return;
    setResumeBusy(true);
    setError(null);
    try {
      const meal = await getSharedMeal(activeId);
      setResult(meal);
      if (meal.status === 'converged') {
        const started = await startCookingApi(activeId);
        setResult(started);
      }
      navigation.navigate('PlanCook', { sharedMealId: activeId });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setResumeBusy(false);
    }
  }

  const activeMembers = members.filter((m) => m.active);
  const activeSorted = [...activeMembers].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  const hasOneself = activeSorted.some((m) => m.isOwner);
  const hasTable = activeMembers.length > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ErrorBanner error={error} />

      {busy && members.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Setting the table…</Text>
        </View>
      ) : (
        <FadeInView>
          {/* ── Hero: your table ─────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="restaurant" size={24} color={colors.homeInk} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroEyebrow}>YOURTABLE</Text>
                <Text style={styles.heroTitle}>
                  {household ? household.name : 'Your table'}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {hasTable
                    ? `${activeMembers.length} ${activeMembers.length === 1 ? 'person' : 'people'} you cook for`
                    : 'Add the people you cook for'}
                </Text>
              </View>
              {hasTable ? (
                <Pressable
                  style={styles.heroAction}
                  onPress={() => navigation.navigate('Household')}
                  accessibilityRole="button"
                  accessibilityLabel="Manage table"
                  disabled={!hasTable}
                >
                  <Text style={styles.heroActionText}>Manage</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.surface} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Resume in-progress meal ─────────────────────── */}
          {activeId && (activeStatus === 'cooking' || activeStatus === 'split') ? (
            <Pressable
              style={styles.resumeCard}
              disabled={resumeBusy}
              onPress={() => void handleResume()}
            >
              <View style={styles.resumeIcon}>
                {resumeBusy ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Ionicons name="flame" size={20} color={colors.surface} />
                )}
              </View>
              <View style={styles.resumeText}>
                <Text style={styles.resumeTitle}>A meal is in progress</Text>
                <Text style={styles.resumeSubtitle}>
                  {activeStatus === 'split' ? 'Branch time — continue' : 'Pick up where you left off'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.surface} />
            </Pressable>
          ) : null}

          {/* ── Who's eating tonight ────────────────────────── */}
          {hasTable ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Who's eating tonight?</Text>
              </View>

              <View style={styles.memberList}>
                {activeSorted.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    photo={photos[member.id]}
                    isSelected={selected.includes(member.id)}
                    onToggle={toggleSelected}
                  />
                ))}
              </View>

              <Pressable
                onPress={() => navigation.navigate('AddPeople')}
                style={styles.addSomeoneButton}
                accessibilityRole="button"
              >
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={18} color={colors.homeInk} />
                </View>
                <Text style={styles.addSomeoneText}>Add someone</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyMembers}>
              <Ionicons name="people-outline" size={34} color={colors.homeTextTertiary} />
              <Text style={styles.emptyMembersTitle}>Set up your table</Text>
              <Text style={styles.emptyMembersText}>
                Add the people you cook for — their allergies and avoid lists become hard
                rules we never break.
              </Text>
              <PrimaryButton
                label="Add someone"
                onPress={() => navigation.navigate('AddPeople')}
                style={styles.emptyCta}
              />
            </View>
          )}
        </FadeInView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.primaryLight,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loadingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  // ── Hero ────────────────────────────────────────────────
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.smd,
    borderRadius: 10,
    backgroundColor: colors.homeInk,
  },
  heroActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.surface,
  },

  // ── Resume ──────────────────────────────────────────────
  resumeCard: {
    backgroundColor: colors.homeInk,
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeText: {
    flex: 1,
  },
  resumeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
  },
  resumeSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },

  // ── Section header ──────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: fonts.display,
    color: colors.text,
  },

  // ── Member cards ────────────────────────────────────────
  memberList: {
    gap: spacing.sm,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.smd,
    gap: spacing.smd,
  },
  memberCardSelected: {
    borderColor: colors.homeInk,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: {
    backgroundColor: colors.primaryLight,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },

  // ── Add someone ─────────────────────────────────────────
  addSomeoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  addCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSomeoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  // ── Empty state ─────────────────────────────────────────
  emptyMembers: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginTop: spacing.sm,
  },
  emptyMembersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptyMembersText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyCta: {
    marginTop: spacing.sm,
  },
});