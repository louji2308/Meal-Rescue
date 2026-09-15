import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/motion/Pressable';

import { AppImage } from '../../components/AppImage';
import { Text } from '../../components/AppText';
import { TextInput } from '../../components/AppTextInput';

import type {
  DietaryRestriction,
  HouseholdAgeGroup,
  HouseholdRelationship,
} from '@meal-rescue/shared-types';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ErrorBanner } from '../../components/ErrorBanner';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import { loadPeoplePhotos, savePeoplePhoto } from '../../services/people-photos';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

const AGE_GROUPS: { key: HouseholdAgeGroup; label: string; emoji: string }[] = [
  { key: 'baby', label: 'Baby', emoji: '•' },
  { key: 'child', label: 'Child', emoji: '•' },
  { key: 'adult', label: 'Adult', emoji: '•' },
];

/** 'self' is never offered — the owner member is created automatically. */
const RELATIONSHIP_OPTIONS: HouseholdRelationship[] = [
  'partner',
  'child',
  'family',
  'roommate',
  'friend',
  'other',
];

/** Add People — a friendly, human form for the people you cook for.
 * Allergies are HARD rules captured separately so they keep their fail-closed
 * classification; the avoid list is soft-but-still-ratified. Relationship and
 * age group guide portions + who gets which finish. Photo stays on-device.
 */
export function AddPeopleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const route = useRoute<RouteProp<CommonTableStackParamList, 'AddPeople'>>();
  const memberId = route.params?.memberId;
  const members = useCommonTableStore((s) => s.members);
  const addMember = useCommonTableStore((s) => s.addMember);
  const updateMember = useCommonTableStore((s) => s.updateMember);

  const target = memberId ? members.find((m) => m.id === memberId) : undefined;

  const [displayName, setDisplayName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<HouseholdAgeGroup>('adult');
  const [relationship, setRelationship] = useState<HouseholdRelationship>('partner');
  const [allergies, setAllergies] = useState('');
  const [everythingElse, setEverythingElse] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useEffect(() => {
    if (target) {
      setDisplayName(target.displayName);
      setAgeGroup(target.ageGroup ?? 'adult');
      setRelationship(target.isOwner ? 'self' : (target.relationship ?? 'partner'));
      setAllergies(target.constraints.allergies.join(', '));
      // Reconstruct the merged "everything else" field from stored parts.
      const dietLabels = target.constraints.dietaryRestrictions.join(', ');
      const avoidLabels = target.constraints.avoidIngredients.join(', ');
      const noteText = target.preferences.note ?? '';
      const parts = [avoidLabels, dietLabels, noteText].filter(Boolean);
      setEverythingElse(parts.join(', '));
      void loadPeoplePhotos().then((photos) => {
        if (target.id in photos) setPhotoUri(photos[target.id]);
      });
    }
  }, [target]);

  async function handlePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos', 'Allow photo access to add a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  function parseEverythingElse(text: string) {
    const items = text.split(',').map((s) => s.trim()).filter(Boolean);
    const DIET_KEYWORDS: string[] = ['vegetarian', 'vegan', 'keto', 'paleo', 'halal', 'kosher'];
    const dietsFound: DietaryRestriction[] = [];
    const avoidFound: string[] = [];
    for (const item of items) {
      const lower = item.toLowerCase();
      if (DIET_KEYWORDS.includes(lower)) {
        dietsFound.push(lower as DietaryRestriction);
      } else {
        avoidFound.push(item);
      }
    }
    return { diets: dietsFound, avoid: avoidFound };
  }

  async function handleSave() {
    if (savingRef.current) return;
    const name = displayName.trim();
    if (!name) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const { diets: parsedDiets, avoid: parsedAvoid } = parseEverythingElse(everythingElse);
    const payload = {
      displayName: name,
      relationship,
      ageGroup,
      constraints: {
        allergies: allergies
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        avoidIngredients: parsedAvoid,
        dietaryRestrictions: parsedDiets,
      },
      preferences: {
        likes: [],
        dislikes: [],
        ...(everythingElse.trim() ? { note: everythingElse.trim() } : {}),
      },
    };
    try {
      const saved = target ? await updateMember(target.id, payload) : await addMember(payload);
      if (photoUri) {
        await savePeoplePhoto(saved.id, photoUri);
      }
      navigation.goBack();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const initials = displayName.trim()
    ? displayName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
    : '?';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FadeInView>
        <ErrorBanner error={error} />

        <View style={styles.photoArea}>
          <Pressable
            style={styles.avatar}
            onPress={() => void handlePhoto()}
            accessibilityRole="button"
            accessibilityLabel="Add a profile photo"
          >
            {photoUri ? (
              <AppImage source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={16} color={colors.surface} />
            </View>
          </Pressable>
          <Text style={styles.photoHint}>Tap to add a photo</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Name (e.g. Maya, Dad, Partner)"
          placeholderTextColor={colors.textSecondary}
          value={displayName}
          onChangeText={setDisplayName}
          autoFocus={!target}
        />

        {!target?.isOwner && (
          <>
            <Text style={styles.label}>Their role at the table</Text>
            <View style={styles.chipRow}>
              {RELATIONSHIP_OPTIONS.map((opt) => {
                const active = relationship === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => setRelationship(opt)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>Age group</Text>
        <View style={styles.chipRow}>
          {AGE_GROUPS.map((opt) => {
            const active = ageGroup === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                onPress={() => setAgeGroup(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Allergies — hard rules</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. peanuts, shellfish, dairy, gluten"
          placeholderTextColor={colors.textSecondary}
          value={allergies}
          onChangeText={setAllergies}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Anything else we should know?</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Foods they won't eat, diets they follow, preferences like 'loves salmon, mild spice'..."
          placeholderTextColor={colors.textSecondary}
          value={everythingElse}
          onChangeText={setEverythingElse}
          autoCapitalize="none"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles.safetyNote}>
          Allergies are treated as hard rules and are never relaxed. Avoids and
          diets guide the planner but still never cross an allergy.
        </Text>

        <PrimaryButton
          label={target ? 'Save changes' : 'Add person'}
          onPress={() => void handleSave()}
          busy={saving}
          disabled={!displayName.trim()}
          style={styles.saveButton}
        />
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  photoArea: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  photoHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  multilineInput: {
    minHeight: 100,
    paddingTop: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  choiceTextActive: {
    color: colors.text,
  },
  safetyNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  saveButton: {
    marginTop: spacing.xl,
  },
});
