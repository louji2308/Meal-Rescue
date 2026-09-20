import { api } from './api';

export type NotificationKind = 'spoiler_alert' | 'rescue_window';

/**
 * Snooze closes the push loop (backend /api/v1/notifications/snooze).
 * The push ledger then holds further notifications of that kind until the
 * deadline (max 72h - anti-fatigue cap).
 */
export async function requestNotificationSnooze(
  kind: NotificationKind,
  hours: number,
): Promise<string> {
  const res = await api.post<{ suppressedUntil: string }>('/api/v1/notifications/snooze', {
    kind,
    hours,
  });
  return res.data.suppressedUntil;
}

/** Convenience wrapper — snoozes all notifications for the rest of the day (24 h). */
export async function dismissTonight(): Promise<string> {
  return requestNotificationSnooze('spoiler_alert', 24);
}

export type AftercareFeedback = 'loved_it' | 'was_ok' | 'not_great';

const AFTERCARE_SATISFACTION: Record<AftercareFeedback, 'better' | 'same' | 'not_for_me'> = {
  loved_it: 'better',
  was_ok: 'same',
  not_great: 'not_for_me',
};

/**
 * Records the post-rescue satisfaction picked from an aftercare push
 * button (backend POST /api/v1/rescue/:id/feedback). Drives preference
 * learning so future recommendations tune toward what the user liked.
 */
export async function submitAftercareFeedback(
  rescueId: string,
  feedback: AftercareFeedback,
): Promise<void> {
  await api.post(`/api/v1/rescue/${rescueId}/feedback`, {
    satisfaction: AFTERCARE_SATISFACTION[feedback],
  });
}
