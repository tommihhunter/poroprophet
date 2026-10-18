import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DASH = process.env.W26_DASH ?? resolve(process.cwd(), '..', 'data', 'dash');
const cache = new Map<string, unknown[]>();

/** Rows of data/dash/<name>.json, or [] when the file does not exist yet. */
export function load<T = Record<string, unknown>>(name: string): T[] {
  if (!cache.has(name)) {
    const p = resolve(DASH, `${name}.json`);
    cache.set(name, existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T[]) : []);
  }
  return cache.get(name) as T[];
}

export type Rating = { rank: number; code: string; name: string; region: string; seed: number; tier: string; elo: number; elo_base: number; sd: number; p_vs_avg: number; adj_logit: number; adj_reason: string; adj_source: string; p_playin: number | null; p_advance: number; p_semis: number; p_final: number; p_champion: number; trend: string; headline: string };
export type Live = { team: string; region: string; p_playin_win: number | null; p_advance: number; p_semis: number; p_final: number; p_champion: number; as_of: string; generated_nz: string; model: string; known: string };
export type Series = { set: string; created_nz: string; id: string; phase: string; stage: string; team_a: string; team_b: string; bo: number; winner: string; loser: string; score: string; p_score: number | null; score_note: string; pw30?: number; pw31?: number; pw32?: number; pw20?: number; pw21?: number; p_upset?: number; p_winner: number | null; p_series_a: number | null; p_game_a: number | null; tier: string; actual?: boolean; exact: string; time_nz: string; time_venue: string; key_matchup: string; draft_angle: string; form_context: string; what_flips: string; note: string; sources: string; settled?: boolean; tbd?: string; tbd_note?: string };
export type Result = { id: string; phase: string; kind: string; stage?: string; start_nz?: string | null; team_a?: string; team_b?: string; score_a?: number | null; score_b?: number | null; winner?: string | null; team?: string; record?: string; date?: string; bo?: number };
export type Player = { role: string; player: string; games: number | null; kda: number | null; gd15: number | null; kp: number | null; n_champs: number | null; champs: { champ: string; games?: number; wr?: number; kda?: number }[]; season_games?: number };
export type TeamBlock = { split: string; games: number; record: string; wr: number; avg_game_min: number; blue_games: number; blue_wr: number; red_games: number; red_wr: number; gd15: number; wr_ahead15: number; fb_pct: number; ft_pct: number; drag_share: number; baron_share: number; herald_share: number; kills_pg: number; deaths_pg: number; gpm: number; gdm: number; dpm: number; vspm: number; role_priority: Record<string, number>; picks: { champ: string; games: number; wr: number }[]; bans_by: { champ: string; n: number; rate: number }[]; bans_against: { champ: string; n: number; rate: number }[]; first_picks: { champ: string; n: number }[]; source: string };
export type Dossier = { code: string; name: string; region: string; seed: number; stage_start: string; headline: string; roster: string; coach: string; roster_change: string; domestic: string; international: string; trend: string; form: string; strengths: string; weaknesses: string; draft: string; signature: Player[]; signature_summer: Player[] | null; team_season: TeamBlock | null; team_summer: TeamBlock | null; flags: unknown; sources: string; report: { who: string; wins_by: string; loses_to: string; draft: string }; pool_depth: number };
export type H2H = { a: string; b: string; date: string; tournament: string; stage: string; sa: number; sb: number; bo: number; patch: string | null; year: number };
export type Matchup = { a: string; b: string; p_game: number; p_bo3: number; p_bo5: number };
/** data/dash/schedule.json (model/live_state.py): Riot's state and game wins per Worlds match, as of the last publish. */
export type Sched = { start_utc: string; start_nz: string; block: string; state: 'unstarted' | 'inProgress' | 'completed' | string; bo: number | null; team_a: string; team_b: string; wins_a: number; wins_b: number; fetched_nz: string };

export const ratings = () => load<Rating>('ratings');
export const live = () => load<Live>('live');
export const series = () => load<Series>('series');
export const results = () => load<Result>('results');
export const dossiers = () => load<Dossier>('dossiers');
export const swiss = () => load<{ set: string; team: string; predicted_record: string; p_record: number; p_advance: number; p30: number; p31: number; p32: number; p23: number; p13: number; p03: number; qualifies: boolean }>('swiss');
export const pickems = () => load<{ stage: string; order: number; slot: string; slot_id: string; pick: string; p_correct: number; ev_points: number; points: number; alternatives: string; status: string }>('pickems');
export const crystal = () => load<{ q: number; question: string; answer: string; confidence: string; reason: string }>('crystal');
export const regions = () => load<{ region: string; elo: number; rating: number; sd: number }>('regions');
export const patchChanges = () => load<{ kind: string; name: string; change: string; detail: string; patch: string; date: string; label: string; source: string }>('patch_changes');
export const metaChamps = () => load<{ rank: number; champion: string; roles: string; picks: number; bans: number; presence: number; pick_wr: number; presence_ex_lcp: number; msi_presence: number; patch_note: string }>('meta_champs');

export const h2h = () => load<H2H>('h2h');
export const matchups = () => load<Matchup>('matchups');
export const schedule = () => load<Sched>('schedule');
export const dcgi = () => load<Record<string, unknown>>('dcgi');
export const overview = (): Record<string, string> => Object.fromEntries(load<{ key: string; value: string }>('overview').map((r) => [r.key, String(r.value)]));

const byCode = () => new Map(ratings().map((r) => [r.code, r]));
/** Team name for display: the data's trailing alternates in brackets are dropped ("LOS (LØS / Los Grandes)" -> "LOS"). */
export const displayName = (name: string) => name.replace(/\s*\([^()]*\)$/, '') || name;
export const teamName = (code: string) => displayName(byCode().get(code)?.name ?? code);
export const regionOf = (code: string) => byCode().get(code)?.region ?? 'UNKNOWN';
export const teamSlug = (code: string) => code.toLowerCase();
export const codeFromSlug = (slug: string) => ratings().find((r) => r.code.toLowerCase() === slug)?.code ?? slug.toUpperCase();

