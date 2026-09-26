import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { BanIcon, HeartIcon, XIcon } from '../icons';
import { Pressable } from '../motion/Pressable';

/**
 * EntryMoreSheet - the quiet "... " menu on a journal entry. Every action
 * here writes back to the journal: correct steers the read, hide dismisses
 * the entry, forget wipes the strand until genuinely new evidence arrives.
 */
export function EntryMoreSheet({
  visible,
  title,
  onClose,
  onCorrect,
  onHide,
  onForget,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onCorrect: () => void;
  onHide: () => void;
  onForget: () => void;
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
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>Edit this entry</Text>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.close}
              tintBorderRadius={999}
            >
              <XIcon size={18} color={colors.homeTextQuiet} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onCorrect())}
            style={styles.option}
            tintBorderRadius={14}
          >
            <HeartIcon size={18} color={colors.homeInk} />
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Not quite right</Text>
              <Text style={styles.optionSub}>Tell us the honest direction of this read</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onHide())}
            style={styles.option}
            tintBorderRadius={14}
          >
            <BanIcon size={18} color={colors.homeInk} />
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Hide this entry</Text>
              <Text style={styles.optionSub}>Remove just this one from the journal</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={closeWith(() => onForget())}
            style={styles.option}
            tintBorderRadius={14}
          >
            <XIcon size={18} color={colors.softRed} />
            <View style={styles.optionCopy}>
              <Text style={[styles.optionTitle, styles.forgetTitle]}>Forget this entry</Text>
              <Text style={styles.optionSub}>Erase the strand and everything behind it</Text>
            </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.homeTextTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.homeInk,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  optionCopy: { flex: 1 },
  optionTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.homeInk,
  },
  forgetTitle: { color: colors.softRed },
  optionSub: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
