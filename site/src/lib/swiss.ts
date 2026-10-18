// Swiss stage state from results(): rounds by record, qualified and eliminated, seed pools.
// Format from research/format.md and model/simulate.py (accessed 19/10/2026): 16 teams paired by record, no rematches,
// Bo3 when either team is on 2 wins or 2 losses, else Bo1; 3 wins advance, 3 losses are out.
import { matchups, results } from './data';

/*
 * Seed pools: model/simulate.py TIERS, from the Riot Worlds 2026 format primer (research/format.md, accessed 15/10/2026).
 * Round 1 = pool 1 v pool 4 and pool 2 v pool 3, no same-region pairings. Pool 4's last slot is the Play-In winner:
 * the Play-In final result, else the Play-In team in the round 1 draw (the draw comes after the final), else unnamed.
 */
const playInWinner = (): string => {
  const rs = results();
  const gf = rs.find((r) => r.id === 'PI-GF' && r.winner)?.winner;
  if (gf) return gf;
  const pi = new Set(rs.filter((r) => r.phase === 'Play-In').flatMap((r) => [r.team_a, r.team_b]));
  return rs.filter((r) => r.phase === 'Swiss' && r.kind === 'series' && Number((r as { round?: number }).round) === 1)
    .flatMap((r) => [r.team_a, r.team_b]).find((t) => t && pi.has(t)) ?? 'Play-In winner';
};
export const SWISS_POOLS = (): string[][] => [
  ['GEN', 'AL', 'TLAW', 'G2'],
  ['HLE', 'BLG', 'TSW', 'LOS'],
  ['T1', 'TES', 'LYON', 'MKOI'],
  ['DK', 'IG', 'CFO', playInWinner()],
];

/** Chance that `a` beats `b` (Bo1 = one game, Bo3, Bo5) from matchups, either orientation; null when the pair is missing. */
export function pairChance(a: string, b: string, bo: number): number | null {
  const m = matchups().find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!m) return null;
  const p = bo === 1 ? m.p_game : bo === 3 ? m.p_bo3 : m.p_bo5;
  return m.a === a ? p : 1 - p;
}

export type SwissMatch = { a: string; b: string; bo: number; winner: string | null; score: string | null; pa: number | null; drawn: boolean };
/** One record group of a round: its drawn matches, plus (while not fully drawn) the teams known to be on that record. */
export type SwissGroup = { record: string; bo: number; games: number; matches: SwissMatch[]; teams: string[]; drawn: boolean };
export type SwissRound = { round: number; groups: SwissGroup[]; drawn: boolean };
export type SwissState = { rounds: SwissRound[]; qualified: { team: string; record: string }[]; eliminated: { team: string; record: string }[] };

// record groups per round and their game counts, in display order
const SHAPE: [string, number][][] = [
  [['0-0', 8]],
  [['1-0', 4], ['0-1', 4]],
  [['2-0', 2], ['1-1', 4], ['0-2', 2]],
  [['2-1', 3], ['1-2', 3]],
  [['2-2', 3]],
];
const boFor = (rec: string) => (rec.split('-').some((x) => x === '2') ? 3 : 1);

export function swissState(): SwissState {
  type Row = ReturnType<typeof results>[number] & { round?: number };
  const rows = (results() as Row[]).filter((r) => r.phase === 'Swiss' && r.kind === 'series' && r.team_a && r.team_b && r.round)
    .sort((x, y) => Number(x.round) - Number(y.round));
  const wl = new Map<string, [number, number]>(); // record after the rows processed so far
  const rec = (t: string) => (wl.get(t) ?? [0, 0]).join('-');
  const qualified: SwissState['qualified'] = [], eliminated: SwissState['eliminated'] = [];
  const rounds: SwissRound[] = SHAPE.map((shape, i) => {
    const round = i + 1;
    const mine = rows.filter((r) => Number(r.round) === round);
    // a team's record going into this round is only certain once it has played every earlier round
    const before = new Map([...wl].filter(([, [w, l]]) => w + l === i).map(([t]) => [t, rec(t)]));
    const playing = new Set(mine.flatMap((r) => [r.team_a!, r.team_b!]));
    const known = round === 1 ? SWISS_POOLS().flat().filter((t) => t !== 'Play-In winner') : [...before.keys()];
    const groups = shape.map(([record, games]) => {
      const matches: SwissMatch[] = mine.filter((r) => (round === 1 ? '0-0' : before.get(r.team_a!) ?? before.get(r.team_b!)) === record).map((r) => {
        const a = r.team_a!, b = r.team_b!, bo = Number(r.bo) || boFor(record);
        const played = !!r.winner && r.score_a != null && r.score_b != null;
        const [hi, lo] = [Math.max(Number(r.score_a), Number(r.score_b)), Math.min(Number(r.score_a), Number(r.score_b))];
        return { a, b, bo, winner: r.winner ?? null, score: played ? `${hi}-${lo}` : null, pa: pairChance(a, b, bo), drawn: true };
      });
      const teams = known.filter((t) => !playing.has(t) && (round === 1 || before.get(t) === record));
      return { record, bo: boFor(record), games, matches, teams: matches.length >= games ? [] : teams, drawn: matches.length >= games };
    });
    // results of this round, in group order, so qualified and eliminated read in the order teams got there
    for (const g of groups) for (const m of g.matches) {
      if (!m.winner) continue;
      for (const t of [m.a, m.b]) {
        const [w, l] = wl.get(t) ?? [0, 0];
        const next: [number, number] = t === m.winner ? [w + 1, l] : [w, l + 1];
        wl.set(t, next);
        if (next[0] === 3) qualified.push({ team: t, record: next.join('-') });
        if (next[1] === 3) eliminated.push({ team: t, record: next.join('-') });
      }
    }
    return { round, groups, drawn: groups.every((g) => g.drawn) };
  });
  // a hand-entered final record (kind swiss_record) counts when no series row got the team there
  for (const r of results()) {
    if (r.kind !== 'swiss_record' || !r.team || !r.record) continue;
    const [w, l] = r.record.split('-').map(Number);
    const list = w === 3 ? qualified : l === 3 ? eliminated : null;
    if (list && !list.some((x) => x.team === r.team)) list.push({ team: r.team, record: r.record });
  }
  return { rounds, qualified, eliminated };
}
