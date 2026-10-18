// Riot's live state (data/dash/schedule.json, written by model/live_state.py each bot run) matched to our series.
import { schedule, type Series } from './data';
import { startNz } from './stage';

/** "17/10/2026 12:00" (NZDT, UTC+13) -> epoch ms, or null. */
export const nzMs = (nz: string) => {
  const m = /(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)/.exec(nz || '');
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 13, +m[5]) : null;
};

export type MatchState = { state: string; wins_a: number; wins_b: number };

/** Riot's row for this series: same two teams (either order), nearest start within 12 hours, oriented to the series' team_a. */
export function matchState(s: Pick<Series, 'phase' | 'set' | 'id' | 'time_nz' | 'team_a' | 'team_b'>): MatchState | null {
  const at = nzMs(startNz(s));
  if (at == null) return null;
  const best = schedule()
    .filter((r) => (r.team_a === s.team_a && r.team_b === s.team_b) || (r.team_a === s.team_b && r.team_b === s.team_a))
    .map((r) => ({ r, d: Math.abs(Date.parse(r.start_utc) - at) }))
    .filter(({ d }) => d <= 12 * 3600e3)
    .sort((x, y) => x.d - y.d)[0]?.r;
  if (!best) return null;
  const flip = best.team_a !== s.team_a;
  return { state: best.state, wins_a: flip ? best.wins_b : best.wins_a, wins_b: flip ? best.wins_a : best.wins_b };
}
