import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { ClocheIcon } from '../components/icons';
import { ScanningLoader } from '../components/loading/ScanningLoader';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import { useDayPhase } from '../hooks/useDayPhase';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { type AiRescueData, generateAiRescue, negotiateAiRescue } from '../services/ai-rescue.api';
import { toApiError } from '../services/api';
import { type KitchenItem, getKitchenDashboard } from '../services/kitchen.api';
import { useSettingsStore } from '../stores/settings.store';
import { colors, fonts, spacing } from '../theme';

/**
 * AIRescueScreen — the new rescue experience.
 *
 * One screen. AI thinks first, shows its best guess, user pushes back if needed.
 * No forms, no questionnaires. Just food → AI → conversation → best move.
 */

function titleCase(text: string): string {
  if (!text) return text;
  return text.replace(
    /(^|\s+)([a-zA-Z])/g,
    (_m, space: string, ch: string) => space + ch.toUpperCase(),
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/`(.*?)`/g, '$1') // inline code
    .replace(/#{1,6}\s/g, '') // headings
    .replace(/^\s*[-*+]\s/gm, '• ') // list bullets
    .replace(/^\s*\d+\.\s/gm, (m) => m.trim() + ' ') // numbered lists
    .trim();
}

export function AiRescueScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'AiRescue'>>();
  const { phase } = useDayPhase();
  const kitchenImportEnabled = useSettingsStore((s) => s.kitchenImportEnabled);

  const { foods, ingredients, mealId, timeMinutes, cookingAllowed } = route.params;

  const [result, setResult] = useState<AiRescueData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [negotiating, setNegotiating] = useState(false);

  // Conversation history for negotiation
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'ai'; content: string }>>(
    [],
  );
  const [pushbackText, setPushbackText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (result || !busy) return;
    void loadRescue();
  }, []);

  // Auto-scroll when result appears or conversation updates
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }, [result, conversation]);

  function toKitchenItems(
    items: KitchenItem[],
  ): Array<{ name: string; state: string; expiresSoon: boolean }> {
    return items.map((item) => ({
      name: item.dishName ?? item.ingredientName,
      state: item.state,
      expiresSoon: item.isExpiringSoon,
    }));
  }

  async function loadKitchenContext() {
    if (!kitchenImportEnabled) return undefined;
    try {
      const dashboard = await getKitchenDashboard();
      return toKitchenItems(dashboard.items);
    } catch {
      // Kitchen fetch failing shouldn't block the rescue — proceed without it.
      return undefined;
    }
  }

  async function loadRescue() {
    setBusy(true);
    setError(null);
    try {
      const kitchenItems = await loadKitchenContext();
      const data = await generateAiRescue({
        foods,
        ingredients,
        timeOfDay: phase,
        mealId,
        timeMinutes,
        cookingAllowed,
        kitchenItems,
      });
      setResult(data);
      setConversation([{ role: 'ai', content: data.bestMove }]);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleNegotiate(pushback: string) {
    if (!pushback.trim() || negotiating) return;
    setNegotiating(true);
    setPushbackText('');
    setError(null);

    const userMsg = { role: 'user' as const, content: pushback };
    const newConversation = [...conversation, userMsg];
    setConversation(newConversation);

    try {
      const data = await negotiateAiRescue({
        conversation: newConversation,
        originalFoods: foods,
        pushback,
      });
      setResult(data);
      setConversation([...newConversation, { role: 'ai', content: data.bestMove }]);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setNegotiating(false);
    }
  }

  function handleAccept() {
    // Navigate to feedback with the accepted recommendation
    navigation.navigate('Feedback', {
      rescueId: result?.rescueId ?? '',
      recommendation: result?.bestMove ?? '',
    });
  }

  const foodSummary = foods.length > 0 ? foods.join(', ') : 'your meal';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.hero}>
          <ClocheIcon size={32} color={colors.rescueAccent} strokeWidth={2.5} />
          <Text style={styles.title}>Your best rescue</Text>
          <Text style={styles.foodTag}>{foodSummary}</Text>
        </View>

        {/* Loading state */}
        {busy && !result && (
          <View style={styles.loadingCenter}>
            <ScanningLoader />
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error.message}</Text>
            <Pressable onPress={() => void loadRescue()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* AI Result */}
        {result && (
          <FadeInView>
            {/* Best Move Card */}
            <View style={styles.bestMoveCard}>
              <Text style={styles.bestMoveLabel}>YOUR BEST MOVE</Text>
              <Text style={styles.bestMoveText}>{stripMarkdown(result.bestMove)}</Text>
              <Text style={styles.reasoning}>{stripMarkdown(result.reasoning)}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={14} color={colors.rescueAccent} />
                  <Text style={styles.metaText}>~{result.timeMinutes} min</Text>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons
                    name={
                      result.effort === 'low'
                        ? 'flash-outline'
                        : result.effort === 'medium'
                          ? 'flame-outline'
                          : 'fitness-outline'
                    }
                    size={14}
                    color={
                      result.effort === 'low'
                        ? colors.rescueAccent
                        : result.effort === 'medium'
                          ? colors.rescueAccent
                          : colors.rescueAccent
                    }
                  />
                  <Text style={styles.metaText}>{result.effort} effort</Text>
                </View>
              </View>
            </View>

            {/* What I Protected / What I Added */}
            {(result.whatYouKept.length > 0 || result.whatYouAdded.length > 0) && (
              <View style={styles.protectionSection}>
                {result.whatYouKept.length > 0 && (
                  <View style={styles.protectGroup}>
                    <Text style={styles.protectLabel}>I kept</Text>
                    <View style={styles.chipRow}>
                      {result.whatYouKept.map((item) => (
                        <View key={item} style={styles.keptChip}>
                          <Text style={styles.keptChipText}>{titleCase(item)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {result.whatYouAdded.length > 0 && (
                  <View style={styles.protectGroup}>
                    <Text style={styles.protectLabel}>I added</Text>
                    <View style={styles.chipRow}>
                      {result.whatYouAdded.map((item) => (
                        <View key={item} style={styles.addedChip}>
                          <Text style={styles.addedChipText}>{titleCase(item)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Food Safety Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Ionicons name="warning-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.disclaimerText}>
                Always check food for spoilage before consuming. Use your judgment — if it smells
                off, looks unusual, or has been stored too long, discard it. AI suggestions are not
                a substitute for food safety best practices.
              </Text>
            </View>

            {/* Action Buttons */}
            <PrimaryButton label="Do this" onPress={handleAccept} style={styles.doThisGap} />

            {/* Pushback Section */}
            <View style={styles.negotiateSection}>
              <Text style={styles.negotiateTitle}>Not feeling this?</Text>

              {/* Custom pushback input */}
              <View style={styles.pushbackInputRow}>
                <TextInput
                  style={styles.pushbackInput}
                  placeholder="Or tell me what you want instead…"
                  placeholderTextColor={colors.textSecondary}
                  value={pushbackText}
                  onChangeText={setPushbackText}
                  onSubmitEditing={() => void handleNegotiate(pushbackText)}
                  returnKeyType="send"
                />
                <Pressable
                  style={[
                    styles.sendBtn,
                    (!pushbackText.trim() || negotiating) && styles.sendBtnDisabled,
                  ]}
                  onPress={() => void handleNegotiate(pushbackText)}
                  disabled={!pushbackText.trim() || negotiating}
                >
                  {negotiating ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color={colors.surface} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Alternatives */}
            {result.alternatives.length > 0 && (
              <View style={styles.alternativesSection}>
                <Text style={styles.alternativesTitle}>Other options I considered</Text>
                {result.alternatives.map((alt, idx) => (
                  <Pressable
                    key={`${alt.name}-${idx}`}
                    style={styles.altCard}
                    onPress={() => void handleNegotiate(`Tell me more about: ${alt.name}`)}
                  >
                    <Text style={styles.altName}>{alt.name}</Text>
                    <Text style={styles.altReasoning}>{alt.reasoning}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Conversation History */}
            {conversation.length > 1 && (
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Our conversation</Text>
                {conversation.map((msg, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.historyBubble,
                      msg.role === 'user' ? styles.historyUser : styles.historyAi,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyText,
                        msg.role === 'user' ? styles.historyTextUser : styles.historyTextAi,
                      ]}
                    >
                      {msg.role === 'user' ? msg.content : stripMarkdown(msg.content)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </FadeInView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  hero: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  foodTag: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingCenter: { alignItems: 'center', paddingVertical: spacing.xl * 2 },

  // Best Move
  bestMoveCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bestMoveLabel: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  bestMoveText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.rescueAccent,
    lineHeight: 26,
    marginBottom: spacing.sm,
  },
  reasoning: { fontSize: 15, color: colors.text, lineHeight: 21, marginBottom: spacing.md },
  metaRow: { flexDirection: 'row', gap: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  metaText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },

  // Protection
  protectionSection: { marginBottom: spacing.lg, gap: spacing.md },
  protectGroup: {},
  protectLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  keptChip: {
    backgroundColor: colors.success + '15',
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  keptChipText: { fontSize: 13, color: colors.success, fontWeight: '600' },
  addedChip: {
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  addedChipText: { fontSize: 13, color: colors.rescueAccent, fontWeight: '600' },

  // Do This
  doThisGap: {
    marginBottom: spacing.xl + spacing.md, // 48px breathing room before pushback
  },

  // Negotiate
  negotiateSection: { marginBottom: spacing.xl },
  negotiateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  pushbackInputRow: { flexDirection: 'row', gap: spacing.sm },
  pushbackInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },

  // Alternatives
  alternativesSection: { marginBottom: spacing.xl },
  alternativesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  altCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  altName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
  altReasoning: { fontSize: 13, color: colors.textSecondary },

  // History
  historySection: { marginTop: spacing.sm },
  historyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  historyBubble: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xs,
    maxWidth: '85%',
  },
  historyUser: { backgroundColor: colors.homeTintNeutral, alignSelf: 'flex-end' },
  historyAi: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  historyText: { fontSize: 14, lineHeight: 20 },
  historyTextUser: { color: colors.rescueAccent },
  historyTextAi: { color: colors.text },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  // Error
  errorBox: {
    backgroundColor: colors.error + '10',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: { color: colors.error, fontSize: 14, textAlign: 'center' },
  retryText: { color: colors.rescueAccent, fontSize: 14, fontWeight: '600' },
});
