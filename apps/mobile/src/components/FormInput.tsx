import React, { useState } from 'react';
import { StyleSheet, TextInput as RNTextInput, TextInputProps, View } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';
import { Text } from './AppText';

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string | null;
  containerStyle?: View['props']['style'];
}

/**
 * Self-contained form field: label, focus ring (borderColor), and an inline
 * error state. Offered for future adoption — screens that already render
 * their own field chrome (border/padding via style) should keep TextInput.
 */
export function FormInput({ label, error, containerStyle, style, ...rest }: FormInputProps) {
  const [focused, setFocused] = useState(false);
  const showError = Boolean(error);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <RNTextInput
        {...rest}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.primary}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused ? styles.inputFocused : null,
          showError ? styles.inputError : null,
          style,
        ]}
      />
      {showError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.xs,
  },
});