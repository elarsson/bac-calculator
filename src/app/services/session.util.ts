import { Drink } from '../models/models';

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
