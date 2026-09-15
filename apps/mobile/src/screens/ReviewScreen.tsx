import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../components/motion/Pressable';
import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/PrimaryButton';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, typography } from '../theme';
import { FadeInView } from '../components/motion/FadeInView';

/**
 * REVIEW (plan §33): confirm what was detected before making decisions.
 * The legacy constraint chips moved to the dedicated V2 Reality step
 * (RealityScreen), so this screen stays focused on one job: is the plate right?
 * "Looks good" goes straight into INTENT - one tap.
 */
export function ReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Review'>>();
  const { analysis } = route.params;

  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  const foodNames = analysis.detectedFoods.map((food) => food.name);
  const needsConfirm = analysis.requiresConfirmation;

  const mealSummary =
    foodNames.length > 0
      ? foodNames.length === 1
        ? foodNames[0]
        : foodNames.slice(0, -1).join(', ') + ' and ' + foodNames[foodNames.length - 1]
      : analysis.detectedIngredients.map((i) => i.name).join(', ') || 'your meal';

function handleSaveEdit() {
    // Apply the correction. The corrected text is passed to Intent as an override.
    // A full implementation would re-run meal analysis with the corrected text.
    setEditing(false);
  }

  function navigateToIntent() {
    const params: { analysis: typeof analysis; editedMealText?: string } = { analysis };
    if (editedText.trim() && editedText.trim() !== mealSummary) {
      params.editedMealText = editedText.trim();
    }
    navigation.navigate('Intent', params);
  }

return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView>
        <View style={styles.hero}>
          <Ionicons name="restaurant-outline" size={32} color={colors.rescueAccent} />
          <Text style={[typography.heading, styles.title]}>Here's what I see</Text>
        </View>

        {editing ? (
          <View style={styles.editCard}>
            <TextInput
              style={styles.editInput}
              value={editedText}
              onChangeText={setEditedText}
              autoFocus
              multiline
              placeholder="Type what you're actually eating..."
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditing(false)}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.editSave} onPress={handleSaveEdit}>
                <Text style={styles.editSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.card}
            onPress={() => {
              setEditedText(mealSummary);
              setEditing(true);
            }}
            >
            <Text style={styles.mealText}>{mealSummary}</Text>
            <View style={styles.editHint}>
              <Ionicons name="pencil-outline" size={14} color={colors.rescueAccent} />
              <Text style={styles.editHintText}>Tap to correct</Text>
            </View>
          </Pressable>
        )}

        {needsConfirm && !editing && (
          <View style={styles.confirmBox}>
            <PrimaryButton
              label="Hmm, that's not quite right"
              variant="ghost"
              onPress={() => {
                setEditedText(mealSummary);
                setEditing(true);
              }}
              style={styles.editButton}
            />
          </View>
        )}

<View style={styles.footer}>
<PrimaryButton
              label="Looks good — let's decide"
              onPress={navigateToIntent}
              style={styles.decideButton}
            />
        </View>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  mealText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  editHintText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
editCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  editInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 60,
    textAlign: 'center',
    padding: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  editCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
editSave: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBox: {
    marginBottom: spacing.md,
  },
  editButton: {
    alignItems: 'center',
    paddingHorizontal: 0,
    minHeight: 40,
  },
  footer: {
    marginTop: 'auto',
  },
  decideButton: {
    marginBottom: spacing.sm,
  },
});

