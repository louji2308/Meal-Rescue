import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/AppText';
import { Pressable } from '../components/motion/Pressable';
import { TextInput } from '../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
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
  yellow: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, backgroundColor: '#FBBC05' },
  green: { position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, backgroundColor: '#34A853' },
  blue: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, backgroundColor: '#4285F4' },
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

type EmailStep = 'email' | 'password';

export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [step, setStep] = useState<EmailStep>('email');
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  function openEmailModal() {
    setStep('email');
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
      setStep('password');
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
        const tokens = await registerAccount({ email: email.trim(), password });
        setSession(tokens.accessToken, tokens.user);
      } else {
        const tokens = await loginWithCredentials({ email: email.trim(), password });
        setSession(tokens.accessToken, tokens.user);
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/continue-with-google-page.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.bottomOverlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.bottomSection}>
            <Text style={styles.headline}>
              Rescue your meals.{'\n'}Love your food.
            </Text>
            <Text style={styles.subtitle}>
              Transform leftovers into something{'\n'}beautiful and delicious.
            </Text>

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

            <Pressable
              style={styles.emailButton}
              onPress={openEmailModal}
              scaleTo={0.97}
            >
              <Text style={styles.emailButtonText}>Use Email</Text>
            </Pressable>

            <Text style={styles.terms}>
              By continuing, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
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
              <Pressable
                onPress={closeEmailModal}
                style={styles.modalCloseBtn}
                scaleTo={1}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>
                {step === 'email' ? 'Get Started' : isNewUser ? 'Create Account' : 'Welcome Back'}
              </Text>
              <View style={styles.modalCloseBtn} />
            </View>

            <View style={styles.modalBody}>
              <ErrorBanner error={error} />

              <View style={styles.modalMascotWrap}>
                <Image
                  source={require('../../assets/mascot.png')}
                  style={styles.modalMascot}
                  resizeMode="contain"
                />
              </View>

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
                    {isNewUser
                      ? `Creating account for ${email}`
                      : `Signing in as ${email}`}
                  </Text>

                  <TextInput
                    accessibilityLabel="Password"
                    style={styles.input}
                    placeholder={isNewUser ? 'Create a password (8+ chars)' : 'Enter your password'}
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    autoComplete={isNewUser ? 'new-password' : 'password'}
                    value={password}
                    onChangeText={setPassword}
                    autoFocus
                  />

                  {isNewUser && (
                    <Text style={styles.passwordHint}>
                      At least 8 characters with a letter and a number.
                    </Text>
                  )}

                  <PrimaryButton
                    label={isNewUser ? 'Create account' : 'Sign in'}
                    onPress={() => void handlePasswordSubmit()}
                    busy={busy}
                    disabled={
                      isNewUser
                        ? password.length < 8
                        : password.length === 0
                    }
                    style={styles.submit}
                  />

                  <Pressable
                    onPress={() => {
                      setStep('email');
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
    width: 100,
    height: 100,
  },
  emailHint: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
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
  passwordHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: -spacing.sm,
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
