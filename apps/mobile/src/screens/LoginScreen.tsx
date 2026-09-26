import { Image, ImageBackground } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import { toApiError } from '../services/api';
import { checkEmail, loginWithCredentials, registerAccount } from '../services/auth.api';
import { signInWithGoogle } from '../services/google-auth';
import { useAuthStore } from '../stores/auth.store';
import { colors, fonts, spacing } from '../theme';

function GoogleLogo() {
  return (
    <View style={googleStyles.wrap}>
      <View style={googleStyles.g}>
        <View style={googleStyles.red} />
        <View style={googleStyles.yellow} />
        <View style={googleStyles.green} />
        <View style={googleStyles.blue} />
        <View style={googleStyles.center} />
        <View style={googleStyles.bar} />
      </View>
    </View>
  );
}

const googleStyles = StyleSheet.create({
  wrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  g: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    overflow: 'hidden',
  },
  red: { position: 'absolute', top: 0, left: 0, width: 12, height: 12, backgroundColor: '#EA4335' },
  yellow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: '#FBBC05',
  },
  green: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 12,
    height: 12,
    backgroundColor: '#34A853',
  },
  blue: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: '#4285F4',
  },
  center: {
    position: 'absolute',
    top: 7,
    left: 7,
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  bar: {
    position: 'absolute',
    top: 10,
    right: 0,
    width: 14,
    height: 5,
    backgroundColor: '#FFFFFF',
  },
});

type FlowStep = 'email' | 'password';

const STEP_ORDER: FlowStep[] = ['email', 'password'];

const PRIVACY_URL = 'https://mealrescue.app/privacy';
const TERMS_URL = 'https://mealrescue.app/terms';

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p: string) => /[a-zA-Z]/.test(p), label: 'Contains a letter' },
  { test: (p: string) => /\d/.test(p), label: 'Contains a number' },
] as const;

function AnimatedPasswordRequirements({ password }: { password: string }) {
  return (
    <View style={pwStyles.container}>
      {PASSWORD_RULES.map(({ test, label }, i) => {
        const met = test(password);
        return <PasswordRule key={label} label={label} met={met} index={i} />;
      })}
    </View>
  );
}

function PasswordRule({ label, met, index }: { label: string; met: boolean; index: number }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      index * 40,
      withTiming(met ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) }),
    );
  }, [met]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <View style={pwStyles.row}>
      <Animated.View
        style={[pwStyles.checkWrap, met ? pwStyles.checkWrapMet : null, animatedStyle]}
      >
        <Text style={pwStyles.checkMark}>{met ? '\u2713' : ''}</Text>
      </Animated.View>
      <Text style={[pwStyles.label, met && pwStyles.labelMet]}>{label}</Text>
    </View>
  );
}

const pwStyles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  checkWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkWrapMet: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  checkMark: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.success },
  label: { fontSize: 12, color: colors.textSecondary },
  labelMet: { color: colors.textPrimary },
});

export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [step, setStep] = useState<FlowStep>('email');
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function triggerShake() {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(-3, { duration: 50 }),
      withTiming(3, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }

  useEffect(() => {
    if (error) triggerShake();
  }, [error]);

  const goToStep = useCallback(
    (nextStep: FlowStep) => {
      const prevIdx = STEP_ORDER.indexOf(step);
      const nextIdx = STEP_ORDER.indexOf(nextStep);
      void prevIdx;
      void nextIdx;
      setStep(nextStep);
    },
    [step],
  );

  function openEmailModal() {
    goToStep('email');
    setIsNewUser(null);
    setEmail('');
    setPassword('');
    setError(null);
    setEmailModalVisible(true);
  }

  function closeEmailModal() {
    setEmailModalVisible(false);
    setStep('email');
    setIsNewUser(null);
    setEmail('');
    setPassword('');
    setError(null);
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const tokens = await signInWithGoogle();
      if (tokens) {
        setSession(tokens.accessToken, tokens.user);
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailContinue() {
    if (!email.includes('@')) return;
    setError(null);
    setBusy(true);
    try {
      const result = await checkEmail(email.trim());
      setIsNewUser(!result.exists);
      goToStep('password');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit() {
    if (password.length < 4) return;
    setError(null);
    setBusy(true);
    try {
      if (isNewUser) {
        const tokens = await registerAccount({
          email: email.trim(),
          password,
        });
        setSession(tokens.accessToken, tokens.user);
      } else {
        const tokens = await loginWithCredentials({
          email: email.trim(),
          password,
        });
        setSession(tokens.accessToken, { ...tokens.user, onboardingCompleted: true });
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function getStepTitle(): string {
    switch (step) {
      case 'email':
        return 'Get Started';
      case 'password':
        return isNewUser ? 'Create Account' : 'Welcome Back';
      default:
        return 'Get Started';
    }
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/continue-with-google-page.png')}
        style={styles.background}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
      >
        <View style={styles.bottomOverlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.bottomSection}>
            <FadeInView delay={0} duration={400} rise={10}>
              <Text style={styles.headline}>Rescue your meals.{'\n'}Love your food.</Text>
            </FadeInView>

            <FadeInView delay={120} duration={400} rise={10}>
              <Text style={styles.subtitle}>
                Transform leftovers into something{'\n'}beautiful and delicious.
              </Text>
            </FadeInView>

            <FadeInView delay={240} duration={400} rise={10}>
              <Pressable
                style={styles.googleButton}
                onPress={() => void handleGoogleSignIn()}
                disabled={busy}
                scaleTo={0.97}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : (
                  <View style={styles.googleButtonInner}>
                    <GoogleLogo />
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </View>
                )}
              </Pressable>

              <Pressable style={styles.emailButton} onPress={openEmailModal} scaleTo={0.97}>
                <Text style={styles.emailButtonText}>Use Email</Text>
              </Pressable>

              <Text style={styles.terms}>
                By continuing, you agree to our{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  Privacy Policy
                </Text>
              </Text>
            </FadeInView>
          </View>
        </SafeAreaView>
      </ImageBackground>

      <Modal
        visible={emailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEmailModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={styles.modalContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={closeEmailModal} style={styles.modalCloseBtn} scaleTo={1}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{getStepTitle()}</Text>
              <View style={styles.modalCloseBtn} />
            </View>

            <View style={styles.modalBody}>
              <ErrorBanner error={error} />

              <View style={styles.modalMascotWrap}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.modalMascot}
                  contentFit="contain"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              </View>

              <Animated.View key={step} entering={SlideInRight} exiting={FadeOut}>
                <Animated.View style={shakeStyle}>
                  {step === 'email' && (
                    <>
                      <TextInput
                        accessibilityLabel="Email"
                        style={styles.input}
                        placeholder="Enter your email"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                        autoFocus
                      />

                      <PrimaryButton
                        label="Continue"
                        onPress={() => void handleEmailContinue()}
                        busy={busy}
                        disabled={!email.includes('@')}
                        style={styles.submit}
                      />
                    </>
                  )}

                  {step === 'password' && (
                    <>
                      <Text style={styles.emailHint}>
                        {isNewUser ? `Creating account for ${email}` : `Signing in as ${email}`}
                      </Text>

                      <TextInput
                        accessibilityLabel="Password"
                        style={styles.input}
                        placeholder={
                          isNewUser ? 'Create a password (8+ chars)' : 'Enter your password'
                        }
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry
                        autoComplete={isNewUser ? 'new-password' : 'password'}
                        value={password}
                        onChangeText={setPassword}
                        autoFocus
                      />

                      {isNewUser && <AnimatedPasswordRequirements password={password} />}

                      <PrimaryButton
                        label={isNewUser ? 'Create account' : 'Sign in'}
                        onPress={() => void handlePasswordSubmit()}
                        busy={busy}
                        disabled={isNewUser ? password.length < 8 : password.length === 0}
                        style={styles.submit}
                      />

                      <Pressable
                        onPress={() => {
                          goToStep('email');
                          setPassword('');
                          setError(null);
                        }}
                        style={styles.changeEmail}
                        scaleTo={1}
                      >
                        <Text style={styles.changeEmailText}>Use a different email</Text>
                      </Pressable>
                    </>
                  )}
                </Animated.View>
              </Animated.View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  background: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  bottomOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  safe: {
    flex: 1,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 42,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 32,
  },
  googleButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  googleButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#333333',
  },
  emailButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emailButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  terms: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: 'rgba(255, 255, 255, 0.8)',
    textDecorationLine: 'underline',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCloseBtn: {
    width: 60,
  },
  modalCloseText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  modalBody: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  modalMascotWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalMascot: {
    width: 200,
    height: 200,
  },
  emailHint: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  emailBold: {
    color: colors.textPrimary,
    fontFamily: fonts.semiBold,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  changeEmail: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  changeEmailText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
