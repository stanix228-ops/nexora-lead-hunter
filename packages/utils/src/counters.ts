import type { CounterGranularity } from '@nexora/types';

export interface DateRange {
  start: Date;
  end: Date;
}

export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

/** Returns the inclusive range for a granularity bucket. */
export function granularityRange(
  granularity: CounterGranularity,
  now: Date = new Date(),
): DateRange {
  const end = now;
  switch (granularity) {
    case 'TODAY':
      return { start: startOfToday(now), end };
    case 'SEVEN_DAYS':
      return { start: subtractDays(startOfToday(now), 6), end };
    case 'THIRTY_DAYS':
      return { start: subtractDays(startOfToday(now), 29), end };
    case 'ALL_TIME':
    default:
      return { start: new Date(0), end };
  }
}

export function countInRange(
  events: Array<{ at?: Date | string | number }>,
  granularity: CounterGranularity,
  now: Date = new Date(),
): number {
  const { start, end } = granularityRange(granularity, now);
  return events.filter((event) => {
    const at = new Date(event.at ?? 0);
    return at >= start && at <= end;
  }).length;
}

export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}