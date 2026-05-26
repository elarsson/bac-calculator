import { Drink, Profile } from '../models/models';
import { BacService } from './bac.service';

/** Gap in hours that signals end of a drinking session */
export const SESSION_GAP_HOURS = 8;

export interface DrinkSession {
  id: string;
  drinks: Drink[];
  start: number; // ms
  end: number;   // ms (last drink timestamp)
}

/**
 * Group drinks into sessions. A new session starts whenever the gap from
 * the previous drink exceeds SESSION_GAP_HOURS.
 * Returned newest-session-first.
 */
export function groupIntoSessions(drinks: Drink[]): DrinkSession[] {
  if (drinks.length === 0) return [];
  const sorted = [...drinks].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const sessions: DrinkSession[] = [];
  let current: Drink[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].timestamp).getTime();
    const curr = new Date(sorted[i].timestamp).getTime();
    const gapHours = (curr - prev) / 3_600_000;
    if (gapHours > SESSION_GAP_HOURS) {
      sessions.push(toSession(current));
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  sessions.push(toSession(current));
  return sessions.reverse();
}

function toSession(drinks: Drink[]): DrinkSession {
  const start = new Date(drinks[0].timestamp).getTime();
  const end = new Date(drinks[drinks.length - 1].timestamp).getTime();
  return { id: `s-${start}`, drinks, start, end };
}

/**
 * Returns drinks belonging to the most-recent session, or [] if none.
 */
export function currentSessionDrinks(drinks: Drink[]): Drink[] {
  const sessions = groupIntoSessions(drinks);
  return sessions[0]?.drinks ?? [];
}

const SOBER_THRESHOLD = 0.001; // % BAC considered effectively sober

/**
 * Timestamp (ms) of the first drink in the user's current "binge" — the
 * earliest drink in a continuous run where the BAC never reached 0 between
 * consecutive drinks. Returns null when the user has never had a drink.
 */
export function firstSoberDrinkAt(
  drinks: Drink[],
  bac: BacService,
  profile: Profile,
): number | null {
  if (drinks.length === 0) return null;
  const sorted = [...drinks].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let bingeStart: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const t = new Date(sorted[i].timestamp).getTime();
    if (i === 0) { bingeStart = t; continue; }
    const prior = sorted.slice(0, i);
    const curve = bac.computeCurve(prior, profile, t - 1);
    if (curve.currentBac < SOBER_THRESHOLD) {
      bingeStart = t;
    }
  }
  return bingeStart;
}
