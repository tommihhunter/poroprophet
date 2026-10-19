// Ported from dashboard/index.html: the `grading`, `calibration`, `pickems_points` and `scorecard_rows` calcs,
// plus the home script's next-up rules. Same matching order and formulas; keep them in step with that file until cutover.
import { pickems, results, series, type Result, type Series } from './data';

type Pair = { team_a?: string; team_b?: string };
/** "dd/mm/yyyy HH:MM" to a sortable "yyyymmddHHMM", null when unparseable. */
export const stamp = (s?: string | null) => { const m = /(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)/.exec(s || ''); return m ? m[3] + m[2] + m[1] + m[4] + m[5] : null; };
const pair = (s: Pair) => [s.team_a, s.team_b].sort().join('|');
const pairKey = (x: Pair & { id: string }) => `${x.id}|${pair(x)}`;
/** Graded results: finished series (a winner entered), not Swiss records. */
const done = () => results().filter((r) => r.kind !== 'swiss_record' && r.winner);
/** Prediction sets in order of first appearance, `_conditional` folded into its parent. */
const sets = () => [...new Set(series().map((s) => s.set.replace('_conditional', '')))];

/** The pre-start prediction for result r in a set: by id and pair, then phase and pair, then the conditional set by pair. */
function match(r: Result, set: string): Series | undefined {
  const pool = series().filter((s) => (s.set === set || s.set === `${set}_conditional`) && !s.actual && s.p_series_a != null);
  const key = pair(r);
  return (
    pool.find((s) => s.id === r.id && pair(s) === key && s.set === set) ||
    pool.find((s) => s.phase === r.phase && pair(s) === key && s.set === set) ||
    pool.find((s) => pair(s) === key && s.set === `${set}_conditional`)
  );
}

export type Grade = { set: string; n: number; correct: number; exact: number; brier: number | null; logloss: number | null; byTier: Record<string, { n: number; hit: number; stated: number }> };

/** Per set: graded n, winners right, exact scores right (counts), mean Brier and log loss; byTier.stated is the mean stated p_winner. */
export function grade(): Grade[] {
  return sets().map((set) => {
    let n = 0, correct = 0, exact = 0, brier = 0, ll = 0;
    const byTier: Grade['byTier'] = {};
    for (const r of done()) {
      const s = match(r, set);
      if (!s) continue;
      // no look-ahead (model/grade.py): a call made at or after the start is INVALID - post-start and not graded
      const made = stamp(s.created_nz), start = stamp(r.start_nz);
      if (made && start && made >= start) continue;
      const pa = s.p_series_a as number;
      const pWin = r.winner === s.team_a ? pa : 1 - pa;
      const hit = s.winner === r.winner ? 1 : 0;
      const sa = Number(r.score_a), sb = Number(r.score_b);
      const sc = `${Math.max(sa, sb)}-${Math.min(sa, sb)}`;
      n += 1; correct += hit; exact += hit && sc === s.score ? 1 : 0;
      brier += (1 - pWin) ** 2; ll += -Math.log(Math.max(1e-9, pWin));
      const t = (byTier[s.tier] ??= { n: 0, hit: 0, stated: 0 });
      t.n += 1; t.hit += hit; t.stated += s.p_winner ?? 0;
    }
    for (const t of Object.values(byTier)) t.stated /= t.n;
    return { set, n, correct, exact, brier: n ? brier / n : null, logloss: n ? ll / n : null, byTier };
  });
}

export type PickemSlot = { stage: string; slot_id: string; slot: string; pick: string; points: number | null; actual: string | null; earned: number | null };

/** Each Pick'Ems slot scored against the result with the same slot id. */
export const pickemSlots = (): PickemSlot[] =>
  pickems().map((p) => {
    const r = results().find((x) => x.id === p.slot_id && x.winner);
    return { stage: p.stage, slot_id: p.slot_id, slot: p.slot, pick: p.pick, points: p.points ?? null, actual: r?.winner ?? null, earned: r && p.points != null ? (r.winner === p.pick ? p.points : 0) : null };
  });

/** Per stage: points earned, points decided so far, points available in total (null when any slot's points are UNKNOWN). */
export function pickemPoints(): { stage: string; earned: number; possible: number; max: number | null }[] {
  const slots = pickemSlots();
  return [...new Set(slots.map((s) => s.stage))].map((stage) => {
    const st = slots.filter((s) => s.stage === stage);
    return { stage, earned: st.reduce((a, s) => a + (s.earned ?? 0), 0), possible: st.reduce((a, s) => a + (s.actual ? (s.points ?? 0) : 0), 0), max: st.some((s) => s.points == null) ? null : st.reduce((a, s) => a + (s.points ?? 0), 0) };
  });
}

export type Pick = { set: string; pick: string; pick_score: string; p: number | null; tier: string; hit: boolean };
export type ResultRow = { id: string; phase: string; stage: string; team_a: string; team_b: string; winner: string; score: string; pick: string | null; pick_score: string | null; p: number | null; tier: string | null; hit: boolean | null; staged: Pick | null };

/** Each finished series beside the frozen baseline pick and the latest staged pick made before it: the most advanced run
 *  up to the series' own stage (a later stage's run is written after it, so its rows there are ACTUAL or post-start),
 *  matched as grade() does, and never a call made at or after a known start. */
const RUNS = ['playin', 'swiss', 'knockouts'], RUN_OF: Record<string, number> = { 'Play-In': 0, Swiss: 1, Knockouts: 2 };
export function resultRows(): ResultRow[] {
  const find = (r: Result, set: string) => {
    const s = match(r, set), made = stamp(s?.created_nz), start = stamp(r.start_nz);
    return s && !(made && start && made >= start) ? s : undefined;
  };
  const stagedPick = (r: Result) => {
    for (const set of RUNS.slice(0, (RUN_OF[r.phase] ?? 2) + 1).reverse()) { const s = find(r, set); if (s) return asPick(s, r, set); }
    return null;
  };
  const asPick = (s: Series | undefined, r: Result, set: string): Pick | null => (s ? { set, pick: s.winner, pick_score: s.score, p: s.p_winner, tier: s.tier, hit: s.winner === r.winner } : null);
  return done().map((r) => {
    const b = asPick(find(r, 'baseline'), r, 'baseline');
    return {
      id: r.id, phase: r.phase, stage: r.stage ?? '', team_a: r.team_a ?? '', team_b: r.team_b ?? '', winner: r.winner as string, score: `${r.score_a}-${r.score_b}`,
      pick: b?.pick ?? null, pick_score: b?.pick_score ?? null, p: b?.p ?? null, tier: b?.tier ?? null, hit: b ? b.hit : null,
      staged: stagedPick(r),
    };
  });
}

// ---------- schedule (home script rules) ----------
const TIME = /(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)/;
/** Has the series' NZDT start time (UTC+13) passed? Evaluated at build time. */
export const started = (s: Series, now = Date.now()) => { const m = TIME.exec(s.time_nz || ''); return !!m && now >= Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 13, +m[5]); };
const sortKey = (s: Series) => { const m = TIME.exec(s.time_nz || ''); return m ? m[3] + m[2] + m[1] + m[4] + m[5] : '9'; };
const playedResult = (s: Series) => results().find((r) => r.winner && pairKey(r) === pairKey(s));
const predicted = (s: Series) => !s.actual && s.p_winner != null;
const open = (s: Series) => predicted(s) && !playedResult(s);
/** The live set: the most advanced staged set that still has an open series. */
export const liveSet = () => ['knockouts', 'swiss', 'playin', 'baseline'].find((st) => series().some((s) => s.set === st && open(s)));
const bySchedule = (a: Series, b: Series) => sortKey(a).localeCompare(sortKey(b));

/** Today's date in NZDT (UTC+13) as dd/mm/yyyy. */
export const nzToday = (now = Date.now()) => new Date(now + 13 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/');
/** Series of the live set dated today in NZDT, played or not. */
export const today = () => { const d = nzToday(); return series().filter((s) => s.set === liveSet() && predicted(s) && (s.time_nz || '').startsWith(d)).sort(bySchedule); };
/** The entered result for a series (same id and pair), if it has finished. */
export const resultFor = playedResult;
