// Stage hubs: texts from research/format.md and data/rules_2026.json (accessed 15/10/2026), and the
// Frozen / Latest rules ported from dashboard/index.html (predictions script: latestSet, bracket, draw).
import { pickems, results, series, swiss, type Series } from './data';
import { nzToday, pickemSlots, resultFor, started } from './grading';
import { matchState } from './live';
import { swissState } from './swiss';

export { resultFor, started };

export type Stage = {
  id: 'play-in' | 'swiss' | 'knockouts';
  phase: 'Play-In' | 'Swiss' | 'Knockouts';
  title: string; venue: string; dates: string; format: string; draft: string; lock: string; note: string;
  pickemsStage: 'Play-In' | 'Swiss' | 'Knockouts';
  setKey: 'playin' | 'swiss' | 'knockouts';
  brackets?: [string, string[]][];
};

export const STAGES: Stage[] = [
  {
    id: 'play-in', phase: 'Play-In', pickemsStage: 'Play-In', setKey: 'playin', title: 'Play-In',
    venue: 'Riot Games Arena, Los Angeles',
    dates: '16 to 19/10/2026 NZDT (15 to 18/10 in Los Angeles)',
    format: 'Four teams, double elimination, every series Bo5, no bracket reset in the final. The final winner goes to Swiss as a Tier 4 team.',
    draft: 'Fearless Draft in all six series.',
    lock: '16/10/2026 07:00 NZDT (15/10 11:00 PDT)',
    note: 'Each slot shows the favourite, its win chance, and the odds of every winning score; the bold score is the single most likely one and is what gets graded.',
    brackets: [['Round 1', ['PI-R1-A', 'PI-R1-B']], ['Round 2', ['PI-WM', 'PI-EM']], ['Lower final', ['PI-LF']], ['Final', ['PI-GF']]],
  },
  {
    id: 'swiss', phase: 'Swiss', pickemsStage: 'Swiss', setKey: 'swiss', title: 'Swiss stage',
    venue: 'CUTX Event Center, Allen, Texas',
    dates: '24/10 to 01/11/2026 NZDT (23 to 31/10 in Allen, no matches on 27/10)',
    format: '16 teams paired by record, no rematches. 3 wins advance, 3 losses are out, 8 advance. Bo1 in rounds 1 and 2 and for 1-1 teams in round 3; Bo3 whenever a result qualifies or eliminates.',
    draft: 'Standard draft in Bo1s, Fearless Draft in Bo3s.',
    lock: '24/10/2026 06:00 NZDT (23/10 10:00 PDT)',
    note: 'Round 1 draw on 18/10 (US time): Tier 1 v Tier 4 and Tier 2 v Tier 3, no same-region pairings in round 1.',
  },
  {
    id: 'knockouts', phase: 'Knockouts', pickemsStage: 'Knockouts', setKey: 'knockouts', title: 'Knockouts',
    venue: 'CUTX Event Center, Allen (quarterfinals, semifinals); Barclays Center, Brooklyn (final)',
    dates: '04/11 to 15/11/2026 NZDT (final 14/11 in Brooklyn)',
    format: 'Eight teams, single elimination, every series Bo5, no third-place match.',
    draft: 'Fearless Draft in every series.',
    lock: '04/11/2026 11:00 NZDT (03/11 14:00 PST)',
    note: 'The quarterfinal draw on 31/10 is random; the baseline assumes no same-region quarterfinals with favourites spread out.',
    brackets: [['Quarterfinals', ['KO-QF1', 'KO-QF2', 'KO-QF3', 'KO-QF4']], ['Semifinals', ['KO-SF1', 'KO-SF2']], ['Final', ['KO-F']]],
  },
];

/** The most advanced staged set (knockouts, swiss, playin), or null when only the baseline exists. */
export const latestSet = (all: Series[] = series()): string | null => ['knockouts', 'swiss', 'playin'].find((o) => all.some((s) => s.set === o)) ?? null;
export const seriesFor = (phase: string, set: string) => series().filter((s) => s.set === set && s.phase === phase);

/** Display name of a prediction set id ('playin' -> 'Play-In run'). */
const SET_LABEL: Record<string, string> = { baseline: 'Frozen baseline', playin: 'Play-In run', swiss: 'Swiss run', knockouts: 'Knockouts run' };
export const setLabel = (set: string) => SET_LABEL[set] ?? set;

// Knockout start times from research/format.md (Riot primer, accessed 15/10/2026): quarterfinals and semifinals
// 11:00 NZDT (14:00 PST), the final 08:00 NZDT (11:00 PST). The frozen baseline and runs copied from it still carry
// the old 09:00 and 05:00 slots, so until a knockouts staged run exists the published stage start is shown instead.
const KO_START: Record<string, string> = { QF: '11:00', SF: '11:00', F: '08:00' };
/** The series' NZDT start "dd/mm/yyyy HH:MM NZDT" as shown on the site (time_nz, corrected for pre-draw knockout rows). */
export function startNz(s: Pick<Series, 'phase' | 'set' | 'id' | 'time_nz'>): string {
  const t = s.time_nz || '';
  const k = /^KO-(QF|SF|F)/.exec(s.id)?.[1];
  return s.phase === 'Knockouts' && s.set !== 'knockouts' && k ? t.replace(/\b\d\d:\d\d\b/, KO_START[k]) : t;
}

/** Has the Swiss round 1 draw (a US date in STAGES[1].note) surely happened? True from the NZ day after it. */
export function drawPassed(): { draw: string | null; passed: boolean } {
  const draw = /draw on (\d\d\/\d\d)/.exec(STAGES[1].note)?.[1] ?? null;
  const year = /\d{4}/.exec(STAGES[1].dates)?.[0];
  if (!draw || !year) return { draw, passed: false };
  const [d, m] = draw.split('/').map(Number);
  const nextDay = new Date(Date.UTC(+year, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
  return { draw, passed: nzToday().split('/').reverse().join('') >= nextDay };
}

const ZONE: Record<string, number> = { PDT: -7, PST: -8, CDT: -5, CST: -6, EDT: -4, EST: -5 };
/** Venue start time as an ISO UTC string, from the zone in `time_venue` ("14/11/2026 11:00 EST (Brooklyn)"). */
export function toUtc(s: Series): string | null {
  const m = /(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d) ([A-Z]{3})\b/.exec(s.time_venue || '');
  if (!m || !(m[6] in ZONE)) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - ZONE[m[6]], +m[5])).toISOString();
}
export const bySchedule = (a: Series, b: Series) => (toUtc(a) ?? '9').localeCompare(toUtc(b) ?? '9');

/*
 * Play-In slots the results already settle: winners' match = the round 1 winners, elimination = the round 1 losers,
 * lower final = the winners'-match loser v the elimination winner, final = the winners'-match winner v the lower-final
 * winner. When the settled pair differs from the model's assumed pair, the row takes the conditional prediction for
 * that pair (playin_conditional, made before the event) and drops the write-up, which was written for other teams.
 */
const PI_FEED: Record<string, [string, 'w' | 'l', string, 'w' | 'l']> = {
  'PI-WM': ['PI-R1-A', 'w', 'PI-R1-B', 'w'], 'PI-EM': ['PI-R1-A', 'l', 'PI-R1-B', 'l'],
  'PI-LF': ['PI-WM', 'l', 'PI-EM', 'w'], 'PI-GF': ['PI-WM', 'w', 'PI-LF', 'w'],
};
const pairOf = (a: string, b: string) => [a, b].sort().join('|');
export function settlePlayIn(rows: Series[]): Series[] {
  const res = new Map(results().filter((r) => r.phase === 'Play-In' && r.winner && r.id).map((r) => [r.id, r]));
  const side = (id: string, k: 'w' | 'l') => {
    const r = res.get(id);
    if (!r?.winner) return null;
    return k === 'w' ? r.winner : r.winner === r.team_a ? r.team_b ?? null : r.team_a ?? null;
  };
  const cond = (x: string, y: string) => series().find((c) => c.set.endsWith('_conditional') && c.phase === 'Play-In' && pairOf(c.team_a, c.team_b) === pairOf(x, y));
  /** Chance team t beats u in a Bo5, from the conditional prediction for that pair. */
  const beats = (t: string, u: string) => { const c = cond(t, u); return c?.p_series_a == null ? null : c.team_a === t ? c.p_series_a : 1 - c.p_series_a; };
  const done = new Map<string, Series>(); // slots settled so far, in bracket order (a later slot reads its feeder)
  const writeup = { key_matchup: '', draft_angle: '', what_flips: '', form_context: '', note: '' };
  return rows.map((s) => {
    const f = PI_FEED[s.id];
    if (!f) { done.set(s.id, s); return s; }
    const a = side(f[0], f[1]), b = side(f[2], f[3]);
    const stage = s.stage.replace(/\s*\(predicted pairing\)/i, '');
    let out: Series = s;
    if (a && b) {
      if (pairOf(a, b) === pairOf(s.team_a, s.team_b)) out = { ...s, stage, settled: true };
      else {
        const c = cond(a, b);
        const blank = { ...writeup, stage, settled: true };
        if (!c) out = { ...s, ...blank, team_a: a, team_b: b, winner: '', loser: '', score: '', p_score: null, p_winner: null, p_series_a: null, tier: '' };
        else {
          // p_score: the chance of the called score, read from the conditional row's exact-score table (team A's view)
          const key = c.winner === c.team_a ? c.score : c.score.split('-').reverse().join('-');
          const hit = (c.exact || '').split(/\s+/).map((t) => t.split(':')).find(([k]) => k === key);
          out = {
            ...s, ...blank, team_a: c.team_a, team_b: c.team_b, winner: c.winner, loser: c.loser, score: c.score,
            p_score: hit ? parseFloat(hit[1]) / 100 : null, p_winner: c.p_winner, p_series_a: c.p_series_a, p_game_a: c.p_game_a,
            tier: c.tier, exact: c.exact, pw30: c.pw30, pw31: c.pw31, pw32: c.pw32, p_upset: c.p_upset,
          };
        }
      }
    } else if (a || b) {
      // half settled: one team is through, the other comes from a feeder whose pair is known but not yet played.
      // The known team's chance = its chance against each possible opponent, weighted by how likely each one comes through.
      const known = (a ?? b)!;
      const feeder = done.get(a ? f[2] : f[0]);
      const k = a ? f[3] : f[1];
      if (feeder?.settled && feeder.p_series_a != null && k === 'w') {
        const pa = feeder.p_series_a;
        const opts = [{ t: feeder.team_a, p: pa }, { t: feeder.team_b, p: 1 - pa }];
        const parts = opts.map((o) => ({ ...o, win: beats(known, o.t) }));
        const pKnown = parts.every((x) => x.win != null) ? parts.reduce((t, x) => t + x.p * (x.win as number), 0) : null;
        out = {
          ...s, ...writeup, stage, team_a: known, team_b: 'TBD', tbd: `${feeder.team_a} or ${feeder.team_b}`,
          tbd_note: `Waits for the ${feeder.stage.replace(/^Play-In /, '').toLowerCase()}, ${feeder.team_a} v ${feeder.team_b}.`,
          winner: pKnown == null ? '' : pKnown >= 0.5 ? known : 'TBD', loser: '', score: '', p_score: null,
          p_winner: pKnown == null ? null : Math.max(pKnown, 1 - pKnown), p_series_a: pKnown, tier: '', exact: '',
          pw30: undefined, pw31: undefined, pw32: undefined,
        };
      }
    }
    done.set(s.id, out);
    return out;
  });
}

export type View = { set: string; rows: Series[]; note: string; stageNote: string; swissSet: string };
/**
 * The rows one block of a hub shows. set = 'baseline' or the latest staged set; series rows fall back to the
 * baseline when the set has none for this phase. Swiss rows count as re-run only from a Swiss or Knockouts
 * staged run (a Play-In run carries the pre-draw Swiss projection), otherwise the baseline with the note.
 */
export function view(st: Stage, which: 'baseline' | 'latest'): View {
  const set = which === 'baseline' ? 'baseline' : (latestSet() ?? 'baseline');
  const created = series().find((s) => s.set === set)?.created_nz ?? 'UNKNOWN';
  const note = set === 'baseline' ? `Frozen baseline, predicted ${created} and never edited since.` : `Latest staged run (${setLabel(set)}), predicted ${created}. Stages not yet re-run show the frozen baseline.`;
  let rows = seriesFor(st.phase, set);
  let stageNote = '';
  if (!rows.length && set !== 'baseline') { rows = seriesFor(st.phase, 'baseline'); stageNote = 'Not re-run yet; showing the frozen baseline.'; }
  if (st.phase === 'Play-In') rows = settlePlayIn(rows);
  const own = ['swiss', 'knockouts'].includes(set) && swiss().some((x) => x.set === set);
  const swissSet = own ? set : 'baseline';
  if (st.phase === 'Swiss') stageNote = own ? '' : set !== 'baseline' ? 'Not re-run yet (due after the 18/10 US-time draw, before the 24/10 06:00 NZDT lock); showing the frozen baseline.' : 'The round 1 draw is on 18/10 (US time). Until then records are averaged over every legal draw.';
  return { set, rows, note, stageNote, swissSet };
}

/** Live Swiss W-L per team: an entered `swiss_record` wins, else counted from finished Swiss series. */
export function swissRecords(): Map<string, string> {
  const wl: Record<string, [number, number]> = {};
  for (const r of results()) {
    if (r.phase !== 'Swiss' || r.kind === 'swiss_record' || !r.winner) continue;
    for (const t of [r.team_a, r.team_b]) if (t) (wl[t] ??= [0, 0])[t === r.winner ? 0 : 1] += 1;
  }
  const m = new Map(Object.entries(wl).map(([t, [w, l]]) => [t, `${w}-${l}`]));
  for (const r of results()) if (r.kind === 'swiss_record' && r.team && r.record) m.set(r.team, r.record);
  return m;
}

/** Pick'Ems rows for a stage with the pick's chance, the actual winner and points earned. */
export const stagePickems = (stage: string) => {
  const p = pickems();
  return pickemSlots().map((x, i) => ({ ...x, p: p[i].p_correct, status: p[i].status })).filter((x) => x.stage === stage);
};


// ---------- stage state: before, during, after (docs/superpowers/plans/2026-10-19-adaptive-stages.md) ----------
export type StageState = 'before' | 'during' | 'after';
/** A finished series: winner, loser, score "3-1" (null when not entered) and riot = only Riot's state has it so far. */
export type Outcome = { winner: string; loser: string; score: string | null; riot: boolean };
const scoreOf = (a?: number | null, b?: number | null) => (a == null || b == null ? null : `${Math.max(a, b)}-${Math.min(a, b)}`);
/** Riot completed with a winner counts as a result ("official stats to follow"); never for a half-settled slot. */
function riotOutcome(s: Series): Outcome | null {
  const m = s.team_b === 'TBD' ? null : matchState(s);
  if (m?.state !== 'completed' || m.wins_a === m.wins_b) return null;
  const aWon = m.wins_a > m.wins_b;
  return { winner: aWon ? s.team_a : s.team_b, loser: aWon ? s.team_b : s.team_a, score: scoreOf(m.wins_a, m.wins_b), riot: true };
}
/** The result of slot `id`: our results row (gol.gg) by id, else Riot's completed state for the stage row. */
function slotOutcome(id: string, rows: Series[]): Outcome | null {
  const r = results().find((x) => x.id === id && x.winner);
  if (r) return { winner: r.winner!, loser: (r.winner === r.team_a ? r.team_b : r.team_a) ?? 'UNKNOWN', score: scoreOf(r.score_a, r.score_b), riot: false };
  const s = rows.find((x) => x.id === id);
  return s ? riotOutcome(s) : null;
}
const stageRows = (id: Stage['id']) => view(STAGES.find((x) => x.id === id)!, 'latest').rows;
const begun = (s: Series) => !!resultFor(s) || started(s) || ['inProgress', 'completed'].includes(matchState(s)?.state ?? '');

/** Play-In outcome once the final has a result: standings 1 final winner, 2 final loser, 3 lower-final loser, 4 elimination loser. */
export function playInOutcome(): (Outcome & { standings: string[] }) | null {
  const rows = stageRows('play-in');
  const f = slotOutcome('PI-GF', rows);
  return f && { ...f, standings: [f.winner, f.loser, slotOutcome('PI-LF', rows)?.loser ?? 'UNKNOWN', slotOutcome('PI-EM', rows)?.loser ?? 'UNKNOWN'] };
}
/** Knockouts outcome once the final has a result: champion (winner), finalist (loser), the two semifinal losers. */
export function knockoutsOutcome(): (Outcome & { semifinalists: string[] }) | null {
  const rows = stageRows('knockouts');
  const f = slotOutcome('KO-F', rows);
  return f && { ...f, semifinalists: ['KO-SF1', 'KO-SF2'].map((id) => slotOutcome(id, rows)?.loser ?? 'UNKNOWN') };
}

export function stageState(id: Stage['id']): StageState {
  const rows = stageRows(id);
  const phase = STAGES.find((x) => x.id === id)!.phase;
  if (id === 'play-in' ? playInOutcome() : id === 'knockouts' ? knockoutsOutcome() : (() => { const x = swissState(); return x.qualified.length >= 8 && x.eliminated.length >= 8; })()) return 'after';
  return rows.some(begun) || results().some((r) => r.phase === phase && r.winner) ? 'during' : 'before';
}

/** What we had at the lock for the stage's headline slot: the Play-In or Knockouts final Pick'Ems pick and its chance. */
export function lockPick(stage: 'Play-In' | 'Knockouts'): { pick: string; p: number | null } | null {
  const p = pickems().find((x) => x.stage === stage && x.slot_id === (stage === 'Play-In' ? 'PI-GF' : 'KO-F'));
  return p ? { pick: p.pick, p: p.p_correct ?? null } : null;
}
/** Swiss Pick'Ems picks (3-0, 0-3, advance) with hit = true / false once the team finished, null before. */
export function swissLockPicks() {
  const st = swissState();
  const rec = new Map([...st.qualified, ...st.eliminated].map((x) => [x.team, x.record]));
  return pickems().filter((x) => x.stage === 'Swiss').map((x) => {
    const r = rec.get(x.pick);
    const hit = r == null ? null : x.slot_id === 'SW-3-0' ? r === '3-0' : x.slot_id === 'SW-0-3' ? r === '0-3' : r === '3-1' || r === '3-2';
    return { slot: x.slot, slot_id: x.slot_id, pick: x.pick, p: x.p_correct, hit };
  });
}
