import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { HeartIcon, LeafIcon } from '../icons';
import { Pressable } from '../motion/Pressable';

/**
 * CorrectSheet - "this isn't quite right". Lets the user steer a read in
 * the honest direction (like / avoid) or quietly hide just that entry.
 */
export function CorrectSheet({
  visible,
  onClose,
  onCorrect,
  onDismiss,
}: {
  visible: boolean;
  onClose: () => void;
  onCorrect: (polarity: 'positive' | 'negative') => void;
  onDismiss: () => void;
}) {
  const closeWith = (fn: () => void) => () => {
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.backdrop}
          onPress={onClose}
          disableHaptics
        >
          <View />
        </Pressable>
        <View style={styles.sheet}>
          <Text style={styles.title}>Not quite right</Text>
          <Text style={styles.subtitle}>How would you put it?</Text>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onCorrect('positive'))}
            style={styles.option}
            tintBorderRadius={14}
          >
            <HeartIcon size={18} color={colors.homeInk} />
            <Text style={styles.optionText}>Actually, I like this</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onCorrect('negative'))}
            style={[styles.option, styles.optionAvoid]}
            tintBorderRadius={14}
          >
            <LeafIcon size={18} color={colors.homeInk} />
            <Text style={styles.optionText}>Actually, I avoid this</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onDismiss())}
            style={styles.cancel}
            tintBorderRadius={14}
          >
            <Text style={styles.cancelText}>Just hide this one</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.homeInk,
    letterSpacing: -0.2,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionAvoid: { backgroundColor: colors.accentSoft },
  optionText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.homeInk,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
