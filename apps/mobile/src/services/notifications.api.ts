import { api } from './api';

export type NotificationKind = 'rescue_window' | 'spoiler_alert' | 'pick_for_me';

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
    kind: kind === 'pick_for_me' ? 'rescue_window' : kind,
    hours,
  });
  return res.data.suppressedUntil;
}

/**
 * Dismiss a "Pick For Me" recommendation. Records a lightweight negative
 * signal and suppresses another pick_for_me push for the rest of the evening.
 */
export async function dismissTonight(): Promise<void> {
  await api.post('/api/v1/notifications/dismiss', { kind: 'pick_for_me' });
}