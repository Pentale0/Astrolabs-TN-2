export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function toIsoUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function utcDayKey(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

export function daysBetweenUtc(earlier: Date | string, later: Date | string): number {
  const d1 = new Date(utcDayKey(earlier) + 'T00:00:00Z').getTime();
  const d2 = new Date(utcDayKey(later) + 'T00:00:00Z').getTime();
  return Math.floor((d2 - d1) / 86_400_000);
}

export function addUtcDays(base: Date, deltaDays: number): Date {
  return new Date(base.getTime() + deltaDays * 86_400_000);
}
