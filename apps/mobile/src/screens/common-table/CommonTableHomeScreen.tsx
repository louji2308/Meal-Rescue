import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
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
import { colors, spacing, typography } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

/**
 * Common Table home — one unified "Your Table" screen.
 *
 * The roster IS the selection: everyone you cook for is listed once, with a
 * check for "eating tonight?" and a tap-to-edit (constraints live behind the
 * person). Finding a meal uses the people you checked.
 *
 * Flow: Your Table (pick who's eating) → Ingredients → Plan & Cook → How did it go.
 */

function constraintSummary(member: HouseholdMemberProfile): {
  label: string;
  danger: boolean;
} | null {
  const { allergies, avoidIngredients, dietaryRestrictions } = member.constraints;
  if (allergies.length > 0) return { label: `allergy: ${allergies[0]}`, danger: true };
  if (avoidIngredients.length > 0) return { label: `avoids ${avoidIngredients[0]}`, danger: false };
  if (dietaryRestrictions.length > 0)
    return { label: dietaryRestrictions[0], danger: false };
  return null;
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
    <ScrollView contentContainerStyle={styles.content}>
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
                  <Ionicons name="chevron-forward" size={16} color={colors.homeInk} />
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
                  <ActivityIndicator size="small" color={colors.homeInk} />
                ) : (
                  <Ionicons name="flame" size={20} color={colors.homeInk} />
                )}
              </View>
              <View style={styles.resumeText}>
                <Text style={styles.resumeTitle}>A meal is in progress</Text>
                <Text style={styles.resumeSubtitle}>
                  {activeStatus === 'split' ? 'Branch time — continue' : 'Pick up where you left off'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.homeInk} />
            </Pressable>
          ) : null}

          {/* ── Who's eating tonight ────────────────────────── */}
          {hasTable ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Who's eating tonight?</Text>
                <Text style={styles.sectionHint}>Check the box · tap the card to edit</Text>
              </View>

              <View style={styles.memberList}>
                {activeSorted.map((member) => {
                  const isSelected = selected.includes(member.id);
                  const photo = photos[member.id];
                  const constraint = constraintSummary(member);
                  return (
                    <View key={member.id} style={styles.memberCard}>
                      <Pressable
                        style={styles.checkBox}
                        onPress={() => toggleSelected(member.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={`${member.displayName} eating tonight`}
                      >
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                          {isSelected && (
                            <Ionicons name="checkmark" size={14} color={colors.surface} />
                          )}
                        </View>
                      </Pressable>

                      <Pressable
                        style={styles.memberBody}
                        onPress={() => navigation.navigate('AddPeople', { memberId: member.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${member.displayName}`}
                      >
                        <View style={[styles.avatar, photo && styles.avatarPhoto]}>
                          {photo ? (
                            <AppImage source={{ uri: photo }} style={styles.avatarImage} />
                          ) : (
                            <Text style={styles.avatarText}>{member.initials}</Text>
                          )}
                        </View>

                        <View style={styles.memberInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.memberName}>{member.displayName}</Text>
                            {member.isOwner && <View style={styles.youBadge}><Text style={styles.youBadgeText}>YOU</Text></View>}
                          </View>
                          <Text style={styles.memberMeta}>
                            {[member.relationship, member.ageGroup ?? 'adult']
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                          {constraint ? (
                            <View style={[styles.constraintChip, constraint.danger && styles.constraintDanger]}>
                              <Ionicons
                                name={constraint.danger ? 'warning' : 'leaf'}
                                size={11}
                                color={constraint.danger ? colors.error : colors.secondary}
                              />
                              <Text
                                style={[
                                  styles.constraintText,
                                  constraint.danger && styles.constraintTextDanger,
                                ]}
                              >
                                {constraint.label}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>

                      <Pressable
                        style={styles.editBtn}
                        onPress={() => navigation.navigate('AddPeople', { memberId: member.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${member.displayName}`}
                      >
                        <Ionicons name="create-outline" size={17} color={colors.homeTextQuiet} />
                      </Pressable>
                    </View>
                  );
                })}
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
    backgroundColor: colors.homeCardBlush,
    borderRadius: 18,
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
    backgroundColor: 'rgba(22,22,22,0.06)',
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
    color: colors.homeTextTertiary,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.homeInk,
    textTransform: 'capitalize',
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.homeTextSecondary,
    marginTop: 2,
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(22,22,22,0.05)',
  },
  heroActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.homeInk,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.homeInk,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.homeTextTertiary,
  },

  // ── Member cards ────────────────────────────────────────
  memberList: {
    gap: spacing.sm,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    gap: spacing.xs,
  },
  checkBox: {
    padding: spacing.sm,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkCircleOn: {
    backgroundColor: colors.homeInk,
    borderColor: colors.homeInk,
  },
  memberBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.homeTintNeutral,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: {
    backgroundColor: colors.homeTintNeutral,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    color: colors.homeInk,
    fontSize: 15,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.homeInk,
    textTransform: 'capitalize',
  },
  youBadge: {
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.homeTextQuiet,
  },
  memberMeta: {
    fontSize: 12,
    color: colors.homeTextSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  constraintChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 6,
  },
  constraintDanger: {
    backgroundColor: colors.error + '14',
  },
  constraintText: {
    fontSize: 11,
    color: colors.homeTextSecondary,
    textTransform: 'capitalize',
  },
  constraintTextDanger: {
    color: colors.error,
    fontWeight: '600',
  },
  editBtn: {
    padding: spacing.sm,
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
    backgroundColor: colors.homeTintNeutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSomeoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.homeInk,
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
    color: colors.homeInk,
  },
  emptyMembersText: {
    fontSize: 13,
    color: colors.homeTextSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyCta: {
    marginTop: spacing.sm,
  },
});