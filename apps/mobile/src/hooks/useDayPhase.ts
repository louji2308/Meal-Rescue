import { useEffect, useState } from 'react';

import { colors } from '../theme';

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 5–11, afternoon 11–17, evening 17–21, night otherwise. */
export function resolveDayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export const PHASE_TINTS: Record<DayPhase, string> = {
  morning: colors.background,
  afternoon: colors.background,
  evening: colors.background,
  night: '#17171A',
};

export function useDayPhase(): { phase: DayPhase; tint: string } {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const phase = resolveDayPhase(hour);
  return { phase, tint: PHASE_TINTS[phase] };
}
