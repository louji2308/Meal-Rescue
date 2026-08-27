import { useEffect, useState } from 'react';

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 5–11, afternoon 11–17, evening 17–21, night otherwise. */
export function resolveDayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export const PHASE_TINTS: Record<DayPhase, string> = {
  morning: '#FFFFFF',
  afternoon: '#FAFAFA',
  evening: '#F4F4F4',
  night: '#141414',
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
