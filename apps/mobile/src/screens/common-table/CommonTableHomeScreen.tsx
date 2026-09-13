import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '../../components/AppText';

import { ErrorBanner } from '../../components/ErrorBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import {
  getSharedMeal,
  startCooking as startCookingApi,
} from '../../services/common-table.api';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing, typography } from '../../theme';

/**
 * Common Table home — the dashboard for the household meal session.
 * Person selection happens inline here ("Who's eating?"), so the flow is
 * home → ingredients → cook → how did it go.
 */
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

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await hydrate();
      await loadHousehold();
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ErrorBanner error={error} />

      {busy ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Finding your table…</Text>
        </View>
      ) : (
        <>
          {/* Table card */}
          <TouchableOpacity
            style={styles.homeCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Household')}
          >
            <View style={styles.homeCardHeader}>
              <View style={styles.homeCardIcon}>
                <Ionicons name="people" size={22} color={colors.softViolet} />
              </View>
              <View style={styles.homeCardText}>
                <Text style={styles.homeCardTitle}>
                  {household ? household.name : 'Set up your table'}
                </Text>
                <Text style={styles.homeCardSubtitle}>
                  {household
                    ? `${activeMembers.length} at the table`
                    : 'Add the people you cook for'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.softViolet} />
            </View>
          </TouchableOpacity>

          {/* Resume card */}
          {activeId && (activeStatus === 'cooking' || activeStatus === 'split') ? (
            <TouchableOpacity
              style={[styles.homeCard, styles.resumeCard]}
              activeOpacity={0.8}
              disabled={resumeBusy}
              onPress={() => void handleResume()}
            >
              <View style={styles.homeCardHeader}>
                <View style={[styles.homeCardIcon, styles.resumeIcon]}>
                  {resumeBusy ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Ionicons name="restaurant" size={22} color={colors.surface} />
                  )}
                </View>
                <View style={styles.homeCardText}>
                  <Text style={styles.resumeTitle}>A meal is in progress</Text>
                  <Text style={styles.resumeSubtitle}>
                    {activeStatus === 'split' ? 'Branch time — continue' : 'Pick up where you left off'}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.surface} />
              </View>
            </TouchableOpacity>
          ) : null}

          {/* CTA */}
          <PrimaryButton
            label={members.length > 0 ? "Find a meal for tonight's table" : 'Set up your table first'}
            onPress={() =>
              members.length > 0
                ? navigation.navigate('Ingredients', { memberIds: selected })
                : navigation.navigate('Household')
            }
            disabled={members.length > 0 && selected.length === 0}
            style={styles.cta}
          />

          {/* Who's eating — tap to select, tap again to unselect */}
          {members.length > 0 && (
            <>
              <Text style={[typography.heading, styles.sectionTitle]}>Who's eating?</Text>
              <View style={styles.memberList}>
                {activeMembers.map((member) => {
                  const isSelected = selected.includes(member.id);
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[styles.memberRow, isSelected && styles.memberRowSelected]}
                      activeOpacity={0.8}
                      onPress={() => toggleSelected(member.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                        <Text style={styles.avatarText}>{member.initials}</Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        <Text style={styles.memberMeta}>
                          {member.ageGroup}
                          {member.isOwner ? ' · you' : ''}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? colors.softGreen : colors.border}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* At the table */}
          <Text style={[typography.heading, styles.sectionTitle]}>The people you cook for</Text>
          {activeMembers.length === 0 ? (
            <View style={styles.emptyMembers}>
              <Ionicons name="person-add-outline" size={32} color={colors.softViolet} />
              <Text style={styles.emptyMembersText}>
                Add people (and the things to avoid) so we can plan one meal that works for
                everyone.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Household')}
              >
                <Text style={styles.emptyMembersLink}>Add someone →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.memberList}>
              {activeMembers.map((member) => {
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{member.initials}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.displayName}</Text>
                      <Text style={styles.memberMeta}>{member.ageGroup ?? 'adult'}</Text>
                    </View>
                    {member.isOwner && (
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeText}>You</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
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
  homeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  homeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  homeCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCardText: {
    flex: 1,
  },
  homeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  homeCardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  resumeCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  resumeIcon: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  resumeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.surface,
  },
  resumeSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  cta: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyMembers: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyMembersText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyMembersLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  memberRowSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight + '44',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    backgroundColor: colors.primaryLight,
  },
  avatarText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  memberMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  ownerBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ownerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
  },
});