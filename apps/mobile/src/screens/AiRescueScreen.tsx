import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import {
  type AiRescueData,
  generateAiRescue,
  negotiateAiRescue,
} from '../services/ai-rescue.api';
import { useDayPhase } from '../hooks/useDayPhase';
import { colors, spacing, typography } from '../theme';

/**
 * AIRescueScreen — the new rescue experience.
 *
 * One screen. AI thinks first, shows its best guess, user pushes back if needed.
 * No forms, no questionnaires. Just food → AI → conversation → best move.
 */
export function AiRescueScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'AiRescue'>>();
  const { phase } = useDayPhase();

  const { foods, ingredients } = route.params;

  const [result, setResult] = useState<AiRescueData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [negotiating, setNegotiating] = useState(false);

  // Conversation history for negotiation
  const [conversation, setConversation] = useState<
    Array<{ role: 'user' | 'ai'; content: string }>
  >([]);
  const [pushbackText, setPushbackText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Quick pushback chips
  const quickPushbacks = [
    "I don't want to cook",
    'Too much effort',
    "I don't have that",
    'Something simpler',
    'More filling please',
  ];

  useEffect(() => {
    if (result || !busy) return;
    void loadRescue();
  }, []);

  async function loadRescue() {
    setBusy(true);
    setError(null);
    try {
      const data = await generateAiRescue({
        foods,
        ingredients,
        timeOfDay: phase,
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
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  function handleAccept() {
    // Navigate to feedback with the accepted recommendation
    navigation.navigate('Feedback', {
      rescueId: 'ai-rescue',
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
          <Ionicons name="bulb" size={28} color={colors.primary} />
          <Text style={[typography.heading, styles.title]}>Here's what I'd do</Text>
          <Text style={styles.foodTag}>{foodSummary}</Text>
        </View>

        {/* Loading state */}
        {busy && !result && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Thinking about your meal…</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error.message}</Text>
            <TouchableOpacity onPress={() => void loadRescue()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AI Result */}
        {result && (
          <>
            {/* Best Move Card */}
            <View style={styles.bestMoveCard}>
              <Text style={styles.bestMoveLabel}>YOUR BEST MOVE</Text>
              <Text style={styles.bestMoveText}>{result.bestMove}</Text>
              <Text style={styles.reasoning}>{result.reasoning}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
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
                    color={colors.textSecondary}
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
                          <Text style={styles.keptChipText}>{item}</Text>
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
                          <Text style={styles.addedChipText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.doThisBtn}
              activeOpacity={0.8}
              onPress={handleAccept}
            >
              <Text style={styles.doThisText}>Do this</Text>
            </TouchableOpacity>

            {/* Pushback Section */}
            <View style={styles.negotiateSection}>
              <Text style={styles.negotiateTitle}>Not feeling this?</Text>

              {/* Quick pushback chips */}
              <View style={styles.pushbackChips}>
                {quickPushbacks.map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    style={styles.pushbackChip}
                    activeOpacity={0.7}
                    onPress={() => void handleNegotiate(chip)}
                    disabled={negotiating}
                  >
                    <Text style={styles.pushbackChipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>

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
                <TouchableOpacity
                  style={[styles.sendBtn, (!pushbackText.trim() || negotiating) && styles.sendBtnDisabled]}
                  onPress={() => void handleNegotiate(pushbackText)}
                  disabled={!pushbackText.trim() || negotiating}
                >
                  {negotiating ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color={colors.surface} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Alternatives */}
            {result.alternatives.length > 0 && (
              <View style={styles.alternativesSection}>
                <Text style={styles.alternativesTitle}>Other options I considered</Text>
                {result.alternatives.map((alt, idx) => (
                  <TouchableOpacity
                    key={`${alt.name}-${idx}`}
                    style={styles.altCard}
                    activeOpacity={0.7}
                    onPress={() => void handleNegotiate(`Tell me more about: ${alt.name}`)}
                  >
                    <Text style={styles.altName}>{alt.name}</Text>
                    <Text style={styles.altReasoning}>{alt.reasoning}</Text>
                  </TouchableOpacity>
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
                      {msg.content}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const EFFORT_COLORS = { low: colors.success, medium: '#F59E0B', high: colors.error };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  hero: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  title: { textAlign: 'center' },
  foodTag: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingCenter: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.md },
  loadingText: { color: colors.textSecondary, fontSize: 14 },

  // Best Move
  bestMoveCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bestMoveLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  bestMoveText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
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
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  addedChipText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // Do This
  doThisBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  doThisText: { color: colors.surface, fontSize: 17, fontWeight: '700' },

  // Negotiate
  negotiateSection: { marginBottom: spacing.xl },
  negotiateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  pushbackChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  pushbackChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pushbackChipText: { fontSize: 13, color: colors.text },
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
    backgroundColor: colors.primary,
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
  historyUser: { backgroundColor: colors.primaryLight, alignSelf: 'flex-end' },
  historyAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  historyText: { fontSize: 14, lineHeight: 20 },
  historyTextUser: { color: colors.primary },
  historyTextAi: { color: colors.text },

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
  retryText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
