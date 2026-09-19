import { api } from './api';

export type NotificationKind = 'spoiler_alert';

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
