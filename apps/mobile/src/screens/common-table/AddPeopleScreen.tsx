import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '../../components/AppText';
import { TextInput } from '../../components/AppTextInput';

import type { DietaryRestriction, HouseholdAgeGroup } from '@meal-rescue/shared-types';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ErrorBanner } from '../../components/ErrorBanner';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import { loadPeoplePhotos, savePeoplePhoto } from '../../services/people-photos';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';

const AGE_GROUPS: { key: HouseholdAgeGroup; label: string; emoji: string }[] = [
  { key: 'baby', label: 'Baby', emoji: '•' },
  { key: 'child', label: 'Child', emoji: '•' },
  { key: 'adult', label: 'Adult', emoji: '•' },
];

const DIET_OPTIONS: DietaryRestriction[] = ['vegetarian', 'vegan', 'halal', 'keto'];

/**
 * Add People — a friendly, human form for the people you cook for.
 * Photo stays on-device (local only); the age group guides portion + ideas.
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
  const [avoid, setAvoid] = useState('');
  const [diets, setDiets] = useState<DietaryRestriction[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useEffect(() => {
    if (target) {
      setDisplayName(target.displayName);
      setAgeGroup(target.ageGroup ?? 'adult');
      setAvoid([...target.constraints.allergies, ...target.constraints.avoidIngredients].join(', '));
      setDiets([...target.constraints.dietaryRestrictions]);
      setNote(target.preferences.note ?? '');
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

  function toggleDiet(diet: DietaryRestriction) {
    setDiets((d) => (d.includes(diet) ? d.filter((x) => x !== diet) : [...d, diet]));
  }

  async function handleSave() {
    const name = displayName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        displayName: name,
        ageGroup,
        constraints: {
          avoidIngredients: avoid
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          dietaryRestrictions: diets,
        },
        preferences: {
          likes: [],
          dislikes: [],
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      };
      const saved = target ? await updateMember(target.id, payload) : await addMember(payload);
      if (photoUri) {
        await savePeoplePhoto(saved.id, photoUri);
      }
      navigation.goBack();
    } catch (err) {
      setError(toApiError(err));
    } finally {
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
        <ErrorBanner error={error} />

        <View style={styles.photoArea}>
          <TouchableOpacity
            style={styles.avatar}
            activeOpacity={0.8}
            onPress={() => void handlePhoto()}
            accessibilityRole="button"
            accessibilityLabel="Add a profile photo"
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.surface} />
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tap to add a photo (optional)</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Name (Maya, Dad…)"
          placeholderTextColor={colors.textSecondary}
          value={displayName}
          onChangeText={setDisplayName}
          autoFocus={!target}
        />

        <Text style={styles.label}>Who are they?</Text>
        <View style={styles.chipRow}>
          {AGE_GROUPS.map((opt) => {
            const active = ageGroup === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                activeOpacity={0.8}
                onPress={() => setAgeGroup(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Anything to avoid?</Text>
        <TextInput
          style={styles.input}
          placeholder="Allergies or dislikes (peanuts, shellfish, onions)"
          placeholderTextColor={colors.textSecondary}
          value={avoid}
          onChangeText={setAvoid}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Diets (optional)</Text>
        <View style={styles.chipRow}>
          {DIET_OPTIONS.map((d) => {
            const active = diets.includes(d);
            return (
              <TouchableOpacity
                key={d}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                activeOpacity={0.8}
                onPress={() => toggleDiet(d)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Help me suggest better (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. loves salmon, mild spice"
          placeholderTextColor={colors.textSecondary}
          value={note}
          onChangeText={setNote}
          autoCapitalize="none"
        />

        <Text style={styles.safetyNote}>
          Avoid items are treated as hard rules and are never relaxed.
        </Text>

        <PrimaryButton
          label={target ? 'Save changes' : 'Add person'}
          onPress={() => void handleSave()}
          busy={saving}
          disabled={!displayName.trim()}
          style={styles.saveButton}
        />
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  choiceTextActive: {
    color: colors.surface,
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