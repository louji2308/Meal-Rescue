import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/motion/Pressable';

import { AppImage, prefetchImages } from '../../components/AppImage';
import { Text } from '../../components/AppText';

import { ErrorBanner } from '../../components/ErrorBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import { loadPeoplePhotos } from '../../services/people-photos';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

/**
 * Household — the people you cook for, shown as a roster.
 * Adding and editing happen on the dedicated Add People page.
 */
export function HouseholdScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const members = useCommonTableStore((s) => s.members);
  const loadHousehold = useCommonTableStore((s) => s.loadHousehold);
  const removeMember = useCommonTableStore((s) => s.removeMember);

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
loadHousehold()
      .catch((err) => setError(toApiError(err)))
      .finally(() => setBusy(false));
    void loadPeoplePhotos().then((loaded) => {
      setPhotos(loaded);
      prefetchImages(Object.values(loaded));
    });
  }, [loadHousehold]);

  function handleDelete(memberId: string, name: string) {
    Alert.alert(
      `Remove ${name}?`,
      'They will no longer be part of your table.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeMember(memberId).catch((err) => setError(toApiError(err)));
          },
        },
      ],
    );
  }

  const sorted = [...members].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <FadeInView>
      <ErrorBanner error={error} />

      <Text style={styles.intro}>
        The people you cook for. Anything to avoid is a hard rule the planner never breaks.
      </Text>

      {busy ? (
        <Text style={styles.loading}>Loading your table…</Text>
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={36} color={colors.softAlert} />
          <Text style={styles.emptyText}>No one at the table yet.</Text>
          <Text style={styles.emptySub}>
            Add the people you cook for — allergies and avoid lists become hard rules the
            planner never breaks.
          </Text>
        </View>
      ) : (
        <View style={styles.memberList}>
          {sorted.map((member) => {
            const photo = photos[member.id];
            const hasConstraints =
              member.constraints.allergies.length > 0 ||
              member.constraints.avoidIngredients.length > 0 ||
              member.constraints.dietaryRestrictions.length > 0;
            return (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, photo && styles.avatarPhoto]}>
{photo ? (
                      <AppImage source={{ uri: photo }} style={styles.photo} />
                    ) : (
                      <Text style={styles.avatarText}>{member.initials}</Text>
                    )}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.displayName}
                      {member.isOwner ? ' (you)' : ''}
                    </Text>
<Text style={styles.memberMeta}>
                      {[member.relationship, member.ageGroup ?? 'adult']
                        .filter(Boolean)
                        .join(' · ')}
                      {member.preferences.note ? ' · ' + member.preferences.note : ''}
                    </Text>
                  </View>
                  <View style={styles.memberActions}>
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => navigation.navigate('AddPeople', { memberId: member.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${member.displayName}`}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.softAlert} />
                    </Pressable>
                    {!member.isOwner && (
                      <Pressable
                        style={styles.iconButton}
                        onPress={() => handleDelete(member.id, member.displayName)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${member.displayName}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.softAlert} />
                      </Pressable>
                    )}
                  </View>
                </View>
                {hasConstraints && (
                  <View style={styles.constraintChips}>
                    {member.constraints.allergies.map((a) => (
                      <View key={`a-${a}`} style={[styles.chip, styles.chipDanger]}>
                        <Text style={styles.chipDangerText}>allergy: {a}</Text>
                      </View>
                    ))}
                    {member.constraints.avoidIngredients.map((a) => (
                      <View key={`v-${a}`} style={styles.chip}>
                        <Text style={styles.chipText}>avoids {a}</Text>
                      </View>
                    ))}
                    {member.constraints.dietaryRestrictions.map((d) => (
                      <View key={`d-${d}`} style={styles.chip}>
                        <Text style={styles.chipText}>{d}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

<PrimaryButton
        label="Add someone"
        onPress={() => navigation.navigate('AddPeople')}
        style={styles.addButton}
        busy={busy}
      />
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  intro: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  loading: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  memberList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  photo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
avatarText: {
    color: colors.text,
    fontSize: 16,
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
  memberActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  constraintChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    color: colors.secondary,
    textTransform: 'capitalize',
  },
  chipDanger: {
    backgroundColor: colors.error + '14',
  },
  chipDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
  },
  addButton: {
    marginTop: spacing.sm,
  },
});
