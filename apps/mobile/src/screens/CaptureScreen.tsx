import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { useEffect, useState } from 'react';
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

import type { MealAnalysisResponse } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanningLoader } from '../components/loading/ScanningLoader';
import { useDayPhase } from '../hooks/useDayPhase';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { PickedImage, analyzeMeal } from '../services/rescue.api';
import { colors, spacing, typography } from '../theme';

/**
 * Voice dictation uses expo-speech-recognition, a third-party native module
 * that is NOT bundled inside Expo Go. Lazy-require it (guarded) so the app
 * still boots without a native development build; when it is absent we simply
 * hide the voice input rather than crashing at load.
 */
type SpeechModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: { lang: string; interimResults: boolean; continuous: boolean }) => void;
  stop: () => void;
  addListener: (name: string, listener: (event: unknown) => void) => { remove: () => void };
};

let speechModule: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  speechModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule ?? null;
} catch {
  speechModule = null;
}
const SPEECH_AVAILABLE = speechModule != null && typeof speechModule.addListener === 'function';

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

  useEffect(() => {
    if (!SPEECH_AVAILABLE || !speechModule) return;
    const subs = [
      speechModule.addListener('start', () => setRecording(true)),
      speechModule.addListener('end', () => setRecording(false)),
      speechModule.addListener('result', (event) => {
        const e = event as ExpoSpeechRecognitionResultEvent;
        const transcript = e.results[0]?.transcript ?? '';
        if (transcript) {
          setText(transcript);
          setImage(null);
        }
      }),
      speechModule.addListener('error', (event) => {
        const e = event as ExpoSpeechRecognitionErrorEvent;
        setRecording(false);
        if (e.error !== 'not-allowed' && e.error !== 'no-speech') {
          setError(toApiError(new Error(`Voice input failed: ${e.error}`)));
        }
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);

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

  async function takePhoto() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(toApiError(new Error('Camera access is needed to snap your meal.')));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
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
    if (!SPEECH_AVAILABLE || !speechModule) {
      setError(toApiError(new Error('Voice input is not available in this build.')));
      return;
    }
    setError(null);
    try {
      const perms = await speechModule.requestPermissionsAsync();
      if (!perms.granted) {
        setError(toApiError(new Error('Microphone access is needed for voice input.')));
        return;
      }
      speechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      setError(toApiError(err));
    }
  }

  function stopDictation() {
    if (!SPEECH_AVAILABLE || !speechModule) return;
    speechModule.stop();
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
          <Text style={[typography.heading, styles.title]}>Show Scraps what's on your plate.</Text>
          <Text style={[typography.caption, styles.hint]}>
            Take a photo, type it, or tell Scraps - "instant noodles with egg".
          </Text>

          <ErrorBanner error={error} />

          {image ? (
            <TouchableOpacity
              style={styles.photoBoxFilled}
              activeOpacity={0.8}
              onPress={() => void pickPhoto()}
              accessibilityRole="button"
              accessibilityLabel="Change meal photo"
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
                accessibilityLabel="Take a photo of your meal"
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
            style={[
              styles.voiceButton,
              recording && styles.voiceButtonRecording,
              !SPEECH_AVAILABLE && styles.voiceButtonDisabled,
            ]}
            activeOpacity={0.8}
            disabled={!SPEECH_AVAILABLE}
            onPress={recording ? stopDictation : () => void startDictation()}
            accessibilityRole="button"
            accessibilityLabel={
              recording ? 'Stop voice input' : 'Describe your meal with your voice'
            }
          >
            <Ionicons
              name={recording ? 'mic-off' : 'mic'}
              size={28}
              color={
                recording ? colors.error : SPEECH_AVAILABLE ? colors.primary : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.voiceButtonText,
                recording && styles.voiceButtonTextRecording,
                !SPEECH_AVAILABLE && styles.voiceButtonTextDisabled,
              ]}
            >
              {recording
                ? 'Listening… tap to stop'
                : SPEECH_AVAILABLE
                  ? 'Tap to speak'
                  : 'Voice input unavailable in this build'}
            </Text>
          </TouchableOpacity>

          {(text.trim() || image) && !busy && (
            <PrimaryButton label="Understand my meal" onPress={() => void handleAnalyze()} />
          )}
          {busy && <ScanningLoader mealText={image ? null : text} />}
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
  voiceButtonDisabled: {
    opacity: 0.6,
    borderColor: colors.border,
  },
  voiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  voiceButtonTextRecording: {
    color: colors.error,
  },
  voiceButtonTextDisabled: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
