import { Ionicons } from '@expo/vector-icons';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  LeftoverAlchemistResponse as AlchemistResponse,
  Transformation,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import { alchemizeLeftovers } from '../services/leftover.api';
import { colors, spacing, typography } from '../theme';

/**
 * Leftover Alchemist - "Photograph leftovers → Transform what exists"
 * Photo + description → up to 3 transformations (bowl, wrap, skillet, salad, soup, bake)
 * Product rule: MAX 3 transformations, ranked by effort (low first)
 */
export function LeftoverAlchemistScreen() {
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [results, setResults] = useState<AlchemistResponse | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function pickPhoto() {
    setError(null);
    const permission = await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(toApiError(new Error('Photo library access needed')));
      return;
    }
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? 'leftover.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function takePhoto() {
    setError(null);
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(toApiError(new Error('Camera access is needed to snap your leftovers.')));
      return;
    }
    const result = await launchCameraAsync({
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? 'leftover.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function handleSubmit() {
    if (!description.trim() && !image) return;

    setError(null);
    setBusy(true);
    try {
      const response = await alchemizeLeftovers({
        image: image ?? undefined,
        description: description.trim() || undefined,
      });
      setResults(response);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const effortColor = (effort: string) => {
    switch (effort) {
      case 'low':
        return colors.primary;
      case 'medium':
        return colors.secondary;
      case 'high':
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  if (results) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity
            style={styles.closeButton}
            activeOpacity={0.8}
            onPress={() => setResults(null)}
            accessibilityRole="button"
            accessibilityLabel="Close results"
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={[typography.heading, styles.title]}>Transformations</Text>
          <Text style={styles.subtitle}>Pick a format</Text>

          <View style={styles.identified}>
            <Text style={styles.identifiedLabel}>Identified:</Text>
            <View style={styles.chips}>
              {results.identifiedComponents.map((c, i) => (
                <Text key={i} style={styles.chip}>
                  {c.name} {c.state ? `(${c.state})` : ''}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.results}>
            {results.transformations.map((t: Transformation, idx) => (
              <TouchableOpacity
                key={`${t.name}-${idx}`}
                style={styles.transformCard}
                activeOpacity={0.8}
                onPress={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              >
                <View style={styles.transformHeader}>
                  <Text style={styles.transformName}>{t.name}</Text>
                  <View style={[styles.effortBadge, { backgroundColor: effortColor(t.effort) }]}>
                    <Text style={styles.effortText}>{t.effort}</Text>
                  </View>
                </View>
                <Text style={styles.transformDescription}>{t.description}</Text>
                <Text style={styles.transformMeta}>
                  {t.estimatedTimeMinutes} min · {t.effort} effort · {t.format}
                </Text>
                <Text style={styles.transformIngredients}>
                  {t.ingredients.slice(0, 4).join(', ')}
                  {t.ingredients.length > 4 ? '...' : ''}
                </Text>
                {expandedIdx === idx && (
                  <View style={styles.detail}>
                    <Text style={styles.sectionLabel}>You need</Text>
                    {t.ingredients.map((ing, i) => (
                      <Text key={`ing-${i}`} style={styles.listItem}>
                        • {ing}
                      </Text>
                    ))}
                    <Text style={styles.sectionLabel}>Steps</Text>
                    {t.instructions.map((step, i) => (
                      <Text key={`step-${i}`} style={styles.listItem}>
                        {i + 1}. {step}
                      </Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setResults(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Try different leftovers</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.heading, styles.title]}>Leftover Alchemist</Text>
          <Text style={[typography.body, styles.subtitle]}>
            Photograph or describe leftovers → I'll suggest transformations
          </Text>

          <ErrorBanner error={error} />

          {image ? (
            <TouchableOpacity
              style={styles.photoBoxFilled}
              activeOpacity={0.8}
              onPress={() => void pickPhoto()}
              accessibilityRole="button"
              accessibilityLabel="Change leftover photo"
            >
              <Image source={{ uri: image.uri }} style={styles.preview} />
            </TouchableOpacity>
          ) : (
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.photoAction}
                activeOpacity={0.8}
                onPress={() => void takePhoto()}
                accessibilityRole="button"
                accessibilityLabel="Take a photo of leftovers"
              >
                <Ionicons name="camera" size={28} color={colors.primary} />
                <Text style={styles.photoActionText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoAction}
                activeOpacity={0.8}
                onPress={() => void pickPhoto()}
                accessibilityRole="button"
                accessibilityLabel="Choose a photo from library"
              >
                <Ionicons name="images" size={28} color={colors.primary} />
                <Text style={styles.photoActionText}>Choose photo</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.or}>or</Text>

          <TextInput
            style={styles.textArea}
            placeholder="Describe your leftovers - 'rice, chicken, broccoli'"
            placeholderTextColor={colors.textSecondary}
            multiline
            value={description}
            onChangeText={setDescription}
          />

          {(description.trim() || image) && !busy && (
            <PrimaryButton label="Transform leftovers" onPress={() => void handleSubmit()} />
          )}
          {busy && (
            <View style={styles.analyzing}>
              <Text style={styles.analyzingText}>Analyzing leftovers…</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  closeButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  photoAction: {
    flex: 1,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  photoBoxFilled: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  or: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.md,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  analyzing: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  analyzingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  identified: {
    marginBottom: spacing.lg,
  },
  identifiedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  results: {
    gap: spacing.md,
  },
  transformCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  transformHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  transformName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  effortBadge: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  effortText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.surface,
  },
  transformDescription: {
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  transformMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  transformIngredients: {
    fontSize: 12,
    color: colors.text,
  },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  listItem: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  retryButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
