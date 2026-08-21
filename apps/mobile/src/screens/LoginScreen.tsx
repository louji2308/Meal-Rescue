import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import { loginWithCredentials, registerAccount } from '../services/auth.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

/**
 * Sign in / create account - one screen, one toggle. Email+password only;
 * social providers arrive when the Firebase project is provisioned.
 */
export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const isRegister = mode === 'register';

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      const tokens = isRegister
        ? await registerAccount({ email: email.trim(), password })
        : await loginWithCredentials({ email: email.trim(), password });
      setSession(tokens.accessToken, tokens.user);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={[typography.title, styles.title]}>Meal Rescue</Text>
        <Text style={[typography.body, styles.subtitle]}>
          The smallest change that makes your meal better.
        </Text>

        <ErrorBanner error={error} />

        <TextInput
          accessibilityLabel="Email"
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          accessibilityLabel="Password"
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          autoComplete={isRegister ? 'new-password' : 'password'}
          value={password}
          onChangeText={setPassword}
        />

        <PrimaryButton
          label={isRegister ? 'Create account' : 'Sign in'}
          onPress={() => void handleSubmit()}
          busy={busy}
          disabled={!email.includes('@') || password.length < 8}
          style={styles.submit}
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setMode(isRegister ? 'login' : 'register');
            setError(null);
          }}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>
            {isRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Text>
        </TouchableOpacity>
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
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  toggle: {
    alignItems: 'center',
    padding: spacing.md,
  },
  toggleText: {
    color: colors.primary,
    fontSize: 14,
  },
});
