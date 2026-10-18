// Compare pages: one static page per unordered pairing, slug <a>-vs-<b> with a < b by code.
// Every verdict is computed from the two numbers, never opinion.
import { dossiers, h2h, live, matchups, ratings, swiss, teamSlug, type Dossier, type Player } from './data';

export type Fmt = 'pct1' | 'pct0' | 'int' | 'signed' | 'min' | 'num1' | 'text';
/** `bar` carries the numbers behind a text row (Lanes: KDA) so it still gets bars and a leading side. */
export type Row = { label: string; left: number | string | null; right: number | string | null; fmt: Fmt; higherIsBetter: boolean | null; verdict: string; bar?: [number | null, number | null] };
export type Group = { title: string; rows: Row[]; shared?: string[]; note?: string };

const codes = () => ratings().map((r) => r.code).sort();
export const slugOf = (x: string, y: string) => [x, y].sort().map(teamSlug).join('-vs-');

export function pairs(): { a: string; b: string; slug: string }[] {
  const cs = codes();
  return cs.flatMap((a, i) => cs.slice(i + 1).map((b) => ({ a, b, slug: slugOf(a, b) })));
}

const isPct = (f: Fmt) => f === 'pct1' || f === 'pct0';

/** Display a row value. Percentages are stored in points (68.1 means 68.1%). */
export function show(v: number | string | null | undefined, fmt: Fmt): string {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return 'UNKNOWN';
  if (typeof v === 'string') return v;
  if (fmt === 'pct1') return `${v.toFixed(1)}%`;
  if (fmt === 'pct0') return `${v.toFixed(0)}%`;
  if (fmt === 'signed') return `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)}`;
  if (fmt === 'min') return `${v.toFixed(1)} min`;
  if (fmt === 'num1') return v.toFixed(1);
  return String(Math.round(v));
}

/** "about the same" when the gap is under 1% of the larger value, or under 0.5 points for percentages. */
export function verdict(a: string, b: string, l: number | null | undefined, r: number | null | undefined, fmt: Fmt, hib: boolean | null, label = ''): string {
  if (l == null || r == null) return 'UNKNOWN for one side';
  const d = l - r;
  const gap = Math.abs(d);
  if (gap === 0 || gap < 0.01 * Math.max(Math.abs(l), Math.abs(r)) || (isPct(fmt) && gap < 0.5)) return 'about the same';
  if (hib === false) return `${d < 0 ? a : b} ${gap} place${gap === 1 ? '' : 's'} higher`;
  const lead = d > 0 ? a : b;
  if (isPct(fmt)) return `${lead} +${gap.toFixed(1)} points`;
  if (fmt === 'signed') return `${lead} +${Math.round(gap)} gold`;
  if (fmt === 'min') return `${lead} games ${gap.toFixed(1)} min longer`;
  if (fmt === 'num1') return `${lead} +${gap.toFixed(1)}${label}`;
  return `${lead} +${Math.round(gap)}`;
}

const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
const p100 = (x: number | null | undefined) => (x == null ? null : x * 100);
const one = (x: number | null | undefined, dp = 1) => (x == null ? 'UNKNOWN' : x.toFixed(dp));

// A team missing from the live odds once they exist has been knocked out: its live odds are 0, shown as "Out".
const knockedOut = (code: string) => live().length > 0 && !live().some((x) => x.team === code);
function liveRow(label: string, a: string, b: string, key: 'p_advance' | 'p_champion'): Row {
  const v = (c: string) => (knockedOut(c) ? 0 : p100(live().find((x) => x.team === c)?.[key]));
  const [l, r] = [v(a), v(b)];
  const verdict_ = knockedOut(a) && knockedOut(b) ? 'both knocked out' : verdict(a, b, l, r, 'pct1', true);
  return { label, left: knockedOut(a) ? 'Out' : l, right: knockedOut(b) ? 'Out' : r, fmt: 'pct1', higherIsBetter: true, verdict: verdict_, bar: [l, r] };
}

function laneText(p: Player | undefined): string | null {
  if (!p) return null;
  return `${p.player} · KDA ${one(p.kda)} · GD@15 ${show(p.gd15, 'signed')} · KP ${p.kp == null ? 'UNKNOWN' : `${one(p.kp)}%`}`;
}

/** Head to head rows from h2h.json, scores oriented so `a` is on the left. */
export function headToHead(a: string, b: string) {
  return h2h()
    .filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))
    .map((r) => (r.a === a ? { ...r } : { ...r, a, b, sa: r.sb, sb: r.sa }));
}

export function metrics(a: string, b: string): Group[] {
  const rA = ratings().find((x) => x.code === a);
  const rB = ratings().find((x) => x.code === b);
  const sA = swiss().find((x) => x.set === 'baseline' && x.team === a);
  const sB = swiss().find((x) => x.set === 'baseline' && x.team === b);
  const dA: Dossier | undefined = dossiers().find((x) => x.code === a);
  const dB: Dossier | undefined = dossiers().find((x) => x.code === b);
  const tA = dA?.team_season ?? null;
  const tB = dB?.team_season ?? null;

  const num = (label: string, l: number | null | undefined, r: number | null | undefined, fmt: Fmt, hib: boolean | null, extra = ''): Row => ({
    label, left: l ?? null, right: r ?? null, fmt, higherIsBetter: hib, verdict: verdict(a, b, l, r, fmt, hib) + extra,
  });

  const model: Group = {
    title: 'Model',
    rows: [
      num('Rating', rA?.elo, rB?.elo, 'int', true),
      liveRow('Reach knockouts (live)', a, b, 'p_advance'),
      // Play-In teams had no Swiss line in the frozen baseline
      sA && sB ? num('Swiss 3-0 (frozen baseline)', p100(sA.p30), p100(sB.p30), 'pct1', true)
        : { label: 'Swiss 3-0 (frozen baseline)', left: sA ? p100(sA.p30) : 'Play-In', right: sB ? p100(sB.p30) : 'Play-In', fmt: 'pct1', higherIsBetter: true, verdict: 'no baseline line for Play-In teams' },
      liveRow('Title odds (live)', a, b, 'p_champion'),
    ],
  };

  const rec = tA || tB ? ` (${tA?.record ?? 'UNKNOWN'} v ${tB?.record ?? 'UNKNOWN'})` : '';
  const season: Group = {
    title: '2026 season',
    rows: [
      num('Win rate', tA?.wr, tB?.wr, 'pct1', true, rec),
      num('Blue side win rate', tA?.blue_wr, tB?.blue_wr, 'pct1', true),
      num('Red side win rate', tA?.red_wr, tB?.red_wr, 'pct1', true),
      num('Gold diff @15', tA?.gd15, tB?.gd15, 'signed', true),
      num('First blood', tA?.fb_pct, tB?.fb_pct, 'pct1', true),
      num('Dragon share', tA?.drag_share, tB?.drag_share, 'pct1', true),
      num('Baron share', tA?.baron_share, tB?.baron_share, 'pct1', true),
      num('Average game', tA?.avg_game_min, tB?.avg_game_min, 'min', null),
    ],
  };

  const lanes: Group = {
    title: 'Lanes',
    rows: ROLES.map((role) => {
      const pA = dA?.signature?.find((p) => p.role === role);
      const pB = dB?.signature?.find((p) => p.role === role);
      const v = verdict(a, b, pA?.kda, pB?.kda, 'num1', true, ' KDA');
      return { label: role, left: laneText(pA), right: laneText(pB), fmt: 'text', higherIsBetter: true, verdict: v === 'about the same' ? 'about the same KDA' : v, bar: [pA?.kda ?? null, pB?.kda ?? null] };
    }),
  };

  const pickNames = (d: Dossier | undefined) => new Set((d?.team_season?.picks ?? []).map((p) => p.champ));
  const pkB = pickNames(dB);
  const shared = [...pickNames(dA)].filter((c) => pkB.has(c));
  const pool: Group = {
    title: 'Champion pool overlap',
    rows: [num('Pool depth', dA?.pool_depth, dB?.pool_depth, 'num1', true)],
    shared,
    note: 'Fearless note: in a Bo5 every champion picked by either side is gone for the rest of the series, so shared comfort picks are contested early.',
  };

  const hh = headToHead(a, b);
  const wins = (year: number, who: 'a' | 'b') => hh.filter((r) => r.year === year && (who === 'a' ? r.sa > r.sb : r.sb > r.sa)).length;
  const yearLine = (year: number, name: string) => (hh.some((r) => r.year === year) ? `${name}: ${a} ${wins(year, 'a')}, ${b} ${wins(year, 'b')}` : `${name}: did not meet`);
  const head: Group = {
    title: 'Head to head',
    rows: hh.map((r) => ({
      label: `${r.date} · ${r.tournament} ${r.stage}`, left: r.sa, right: r.sb, fmt: 'int', higherIsBetter: true,
      verdict: r.sa === r.sb ? `${r.sa}-${r.sb}` : `${r.sa > r.sb ? a : b} ${Math.max(r.sa, r.sb)}-${Math.min(r.sa, r.sb)}`,
    })),
    note: hh.length ? `${yearLine(2026, '2026')} (series); ${yearLine(2025, '2025 internationals')}` : 'Never met in 2025 or 2026.',
  };

  return [model, season, lanes, pool, head];
}

/** Summary strip per format: win chance from matchups.json for the pair, live title odds, rank. */
export function summary(a: string, b: string): { fmt: string; rows: Row[] }[] {
  const [x, y] = [a, b].sort();
  const m = matchups().find((r) => r.a === x && r.b === y);
  const forA = (p: number | undefined) => (p == null ? null : x === a ? p : 1 - p);
  const rA = ratings().find((r) => r.code === a);
  const rB = ratings().find((r) => r.code === b);
  const win = (p: number | null): Row => ({ label: 'Win chance', left: p100(p), right: p == null ? null : p100(1 - p), fmt: 'pct1', higherIsBetter: true, verdict: verdict(a, b, p100(p), p == null ? null : p100(1 - p), 'pct1', true) });
  const rest: Row[] = [
    liveRow('Title odds (live)', a, b, 'p_champion'),
    { label: 'Rank', left: rA?.rank ?? null, right: rB?.rank ?? null, fmt: 'int', higherIsBetter: false, verdict: verdict(a, b, rA?.rank, rB?.rank, 'int', false) },
  ];
  return [
    { fmt: 'Bo1', rows: [win(forA(m?.p_game)), ...rest] },
    { fmt: 'Bo3', rows: [win(forA(m?.p_bo3)), ...rest] },
    { fmt: 'Bo5', rows: [win(forA(m?.p_bo5)), ...rest] },
  ];
}
