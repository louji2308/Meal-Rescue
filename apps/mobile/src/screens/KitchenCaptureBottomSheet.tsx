import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput as RNTextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { colors, typography, spacing, radius } from '../theme';
import { captureKitchen } from '../services/kitchen.api';
import type { CaptureResult } from '../services/kitchen.api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: CaptureResult) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function KitchenCaptureBottomSheet({ visible, onClose, onCapture }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handleCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take food photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setLoading(true);
    try {
      const captured = await captureKitchen({
        source: 'CAMERA',
        imageBase64: result.assets[0].base64,
        mimeType: result.assets[0].mimeType ?? 'image/jpeg',
      });
      onCapture(captured);
    } catch (err: any) {
      Alert.alert(
        'Capture failed',
        err?.message ?? 'Could not analyze the photo. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [onCapture]);

  const handlePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to choose food photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setLoading(true);
    try {
      const captured = await captureKitchen({
        source: 'PHOTO',
        imageBase64: result.assets[0].base64,
        mimeType: result.assets[0].mimeType ?? 'image/jpeg',
      });
      onCapture(captured);
    } catch (err: any) {
      Alert.alert(
        'Capture failed',
        err?.message ?? 'Could not analyze the photo. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [onCapture]);

  const handleManualSubmit = useCallback(async () => {
    const text = manualText.trim();
    if (!text) return;

    setLoading(true);
    try {
      const captured = await captureKitchen({ source: 'MANUAL', text });
      onCapture(captured);
      setManualText('');
      setShowManual(false);
    } catch (err: any) {
      Alert.alert(
        'Parse failed',
        err?.message ?? 'Could not parse your items. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [manualText, onCapture]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetContainer}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.title}>Add to Kitchen</Text>
            <Text style={styles.subtitle}>How do you want to add items?</Text>

            {/* Options */}
            <View style={styles.options}>
              <TouchableOpacity
                style={[styles.option, loading && styles.optionDisabled]}
                onPress={handleCamera}
                disabled={loading}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons name="camera-outline" size={24} color={colors.homeInk} />
                </View>
                <Text style={styles.optionLabel}>Take photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, loading && styles.optionDisabled]}
                onPress={handlePhoto}
                disabled={loading}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons name="images-outline" size={24} color={colors.homeInk} />
                </View>
                <Text style={styles.optionLabel}>Choose photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, loading && styles.optionDisabled]}
                onPress={() => setShowManual(!showManual)}
                disabled={loading}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons name="create-outline" size={24} color={colors.homeInk} />
                </View>
                <Text style={styles.optionLabel}>Type it in</Text>
              </TouchableOpacity>
            </View>

            {/* Manual input */}
            {showManual && (
              <View style={styles.manualSection}>
                <RNTextInput
                  style={styles.manualInput}
                  value={manualText}
                  onChangeText={setManualText}
                  placeholder='e.g. "2 eggs, leftover rice, half onion"'
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[
                    styles.manualSubmit,
                    (!manualText.trim() || loading) && styles.manualSubmitDisabled,
                  ]}
                  onPress={handleManualSubmit}
                  disabled={!manualText.trim() || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.manualSubmitText}>Parse items →</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Loading overlay */}
            {loading && showManual === false && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.homeInk} />
                <Text style={styles.loadingText}>Analyzing...</Text>
              </View>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.xl,
    maxWidth: 380,
    width: '100%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary + '40',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  options: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.homeInk + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  manualSection: {
    marginBottom: spacing.md,
  },
  manualInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    marginBottom: spacing.sm,
  },
  manualSubmit: {
    backgroundColor: colors.homeInk,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  manualSubmitDisabled: {
    opacity: 0.5,
  },
  manualSubmitText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  loadingOverlay: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
