import { overview, patchChanges } from './data';
export type NavItem = { id: string; label: string; path: string; group: 'event' | 'reference' | 'home'; desc: string };

/** Newest patch in the patch-change dataset, e.g. "26.20"; UNKNOWN when the dataset has none. */
const patch = patchChanges().map((r) => r.patch).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop() ?? 'UNKNOWN';

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', path: '', group: 'home', desc: 'The prophecy, title odds and your next Pick\'Ems' },
  { id: 'play-in', label: 'Play-In', path: 'play-in/', group: 'event', desc: 'Four teams, one Swiss spot' },
  { id: 'swiss', label: 'Swiss', path: 'swiss/', group: 'event', desc: 'Pick\'Ems and every team\'s likely record' },
  { id: 'knockouts', label: 'Knockouts', path: 'knockouts/', group: 'event', desc: 'Assumed bracket and how far each team goes' },
  { id: 'playground', label: 'Playground', path: 'playground/', group: 'event', desc: 'What if: pick the winners, see the odds' },
  { id: 'demacia-cup', label: 'Demacia Cup', path: 'demacia-cup/', group: 'event', desc: 'The warm-up test' },
  { id: 'teams', label: 'Teams', path: 'teams/', group: 'reference', desc: 'Every team at Worlds and its dossier' },
  { id: 'players', label: 'Players', path: 'players/', group: 'reference', desc: 'Every starter: stats, rankings and champions' },
  { id: 'scorecard', label: 'Scorecard', path: 'scorecard/', group: 'reference', desc: 'How the predictions are doing' },
  { id: 'meta', label: 'Meta', path: 'meta/', group: 'reference', desc: `Patch ${patch}, champions, Pick'Ems points` },
];

/** Stage in play, from the next Pick'Ems lock the pipeline exports (data/rules_2026.json dates). */
export function liveStage(): string {
  const lock = overview().next_lock ?? '';
  if (lock.includes('24/10/2026')) return 'play-in';
  if (lock.includes('04/11/2026')) return 'swiss';
  return 'knockouts';
}

/** Stage whose Pick'Ems lock comes next: 'swiss' (24/10), 'knockouts' (04/11), or null once both have passed. */
export function lockStage(): 'swiss' | 'knockouts' | null {
  const lock = overview().next_lock ?? '';
  if (lock.includes('24/10/2026')) return 'swiss';
  if (lock.includes('04/11/2026')) return 'knockouts';
  return null;
}

/**
 * The next lock split into parts, from "Swiss Pick'Ems lock 24/10/2026 06:00 NZDT (draw 18/10)".
 * stage "Swiss", day "24/10", date "24/10/2026", time "06:00". null when there is no parseable lock.
 */
export function nextLock(): { stage: string; day: string; date: string; time: string } | null {
  const m = (overview().next_lock ?? '').match(/^(.+?) Pick'Ems lock ((\d{2}\/\d{2})\/\d{4}) (\d{2}:\d{2})/);
  return m ? { stage: m[1], date: m[2], day: m[3], time: m[4] } : null;
}

const LINE: Record<string, string> = {
  'play-in': 'Play-In under way, Swiss next',
  swiss: 'Swiss under way, Knockouts next',
  knockouts: 'Knockouts under way',
};
/** Masthead stage text, e.g. "Worlds 2026: Play-In under way, Swiss next". */
export const stageLine = () => `Worlds 2026: ${LINE[liveStage()]}`;
