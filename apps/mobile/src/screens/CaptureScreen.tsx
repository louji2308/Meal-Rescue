import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useState } from 'react';
import {
  ActivityIndicator,
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

import type { MealAnalysisResponse } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { useDayPhase } from '../hooks/useDayPhase';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { PickedImage, analyzeMeal } from '../services/rescue.api';
import { colors, spacing, typography } from '../theme';

/**
 * Capture = photo OR text OR voice. All feed the same /meal/analyze endpoint.
 * The analyzing state is shown inline; success navigates to Review.
 */
export function CaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { phase, tint } = useDayPhase();
  const background = phase === 'night' ? colors.background : tint;
  const [text, setText] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  // Voice dictation - live transcript fills the same text field.
  const [recording, setRecording] = useState(false);

  useSpeechRecognitionEvent('start', () => setRecording(true));
  useSpeechRecognitionEvent('end', () => setRecording(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) {
      setText(transcript);
      setImage(null);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    setRecording(false);
    if (event.error !== 'not-allowed' && event.error !== 'no-speech') {
      setError(toApiError(new Error(`Voice input failed: ${event.error}`)));
    }
  });

  async function pickPhoto() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(toApiError(new Error('Photo library access is needed to scan your meal.')));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0]!;
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? 'meal.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    setText('');
  }

  async function startDictation() {
    setError(null);
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        setError(toApiError(new Error('Microphone access is needed for voice input.')));
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      setError(toApiError(err));
    }
  }

  function stopDictation() {
    ExpoSpeechRecognitionModule.stop();
  }

  async function handleAnalyze() {
    if (!text.trim() && !image) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let analysis: MealAnalysisResponse;
      if (image) {
        analysis = await analyzeMeal({ image });
      } else {
        analysis = await analyzeMeal({ text: text.trim() });
      }
      navigation.navigate('Review', { analysis });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.heading, styles.title]}>What are you eating?</Text>
          <Text style={[typography.caption, styles.hint]}>
            Take a photo, type it, or tell me - "instant noodles with egg".
          </Text>

          <ErrorBanner error={error} />

          <TouchableOpacity
            style={[styles.photoBox, image ? styles.photoBoxFilled : null]}
            activeOpacity={0.8}
            onPress={() => void pickPhoto()}
            accessibilityRole="button"
            accessibilityLabel="Choose a meal photo"
          >
            {image ? (
              <Image source={{ uri: image.uri }} style={styles.preview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={32} color={colors.textSecondary} />
                <Text style={styles.photoHint}>Choose a photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.or}>or</Text>

          <TextInput
            accessibilityLabel="Describe your meal"
            style={styles.input}
            placeholder='e.g. "toast and jam"'
            placeholderTextColor={colors.textSecondary}
            multiline
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (value.trim()) {
                setImage(null);
              }
            }}
          />

          <Text style={styles.or}>or</Text>

          <TouchableOpacity
            style={[styles.voiceButton, recording && styles.voiceButtonRecording]}
            activeOpacity={0.8}
            onPress={recording ? stopDictation : () => void startDictation()}
            accessibilityRole="button"
            accessibilityLabel={
              recording ? 'Stop voice input' : 'Describe your meal with your voice'
            }
          >
            <Ionicons
              name={recording ? 'mic-off' : 'mic'}
              size={28}
              color={recording ? colors.error : colors.primary}
            />
            <Text style={[styles.voiceButtonText, recording && styles.voiceButtonTextRecording]}>
              {recording ? 'Listening… tap to stop' : 'Tap to speak'}
            </Text>
          </TouchableOpacity>

          {(text.trim() || image) && !busy && (
            <PrimaryButton label="Understand my meal" onPress={() => void handleAnalyze()} />
          )}
          {busy && (
            <View style={styles.analyzing}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.analyzingText}>Reading your meal…</Text>
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
  title: {
    marginBottom: spacing.xs,
  },
  hint: {
    marginBottom: spacing.lg,
  },
  photoBox: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  photoBoxFilled: {
    borderStyle: 'solid',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoHint: {
    color: colors.textSecondary,
    fontSize: 14,
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
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.md,
  },
  voiceButtonRecording: {
    backgroundColor: '#FDECEA',
    borderColor: colors.error,
  },
  voiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  voiceButtonTextRecording: {
    color: colors.error,
  },
  analyzing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  analyzingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
