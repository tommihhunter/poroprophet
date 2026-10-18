# Swiss bracket, title race, both-side odds, seed pools, playground (19/10/2026)

Owner asked for all five ideas taken from worldssim.com (studied 19/10/2026, not copied: our model makes the calls, the
lore look stays). Swiss starts 24/10/2026 06:00 NZDT, so tasks 1 to 4 must be solid before then; task 5 is the big one.

## Ground rules for every task (from CLAUDE.md, design.md, owner feedback)
- Repo root: `worlds2026_bundle/worlds2026`. Site in `site/` (Astro 7, static). Data: `data/dash/*.json` via `site/src/lib/data.ts`.
- Dates dd/mm/yyyy, times NZDT, no em dashes in any visible text, unknowns read `UNKNOWN`, never guessed.
- Design system: `site/src/styles/tokens.css` (--fs-*, --space-*, colours --gold, --teal, --risk, --live, --muted, --fg2), `design.md` (lore system + "Polish pass rules": gold only for the brand and the one key number per view; teal and risk for status only). Fonts Beaufort (display, caps) and Spiegel (body). Icons: `site/src/components/Icon.astro`, logos `Logo.astro`.
- Owner judges on reading order and hierarchy: one clear lead per view, then supporting detail. Equal-weight data dumps read as low quality. No coloured one-side outlines (reads as AI-generated).
- Every page works at 390 px (16 px gutters, no horizontal page scroll) and 1440 px. JS is optional except on the playground.
- Verify each task: `cd site && MSYS2_ENV_CONV_EXCL=W26_BASE W26_BASE=/ W26_SITE_URL=https://poroprophet.lol npx astro build`, then from the repo root `MSYS2_ENV_CONV_EXCL=W26_BASE W26_BASE=/ python -X utf8 tests/check_site.py` (must end `site OK`), then playwright screenshots at 390 and 1440 of every page you touched, and LOOK at them. `python -X utf8 tests/test_v5.py` must pass; it rewrites data/dash as a side effect, so run `git checkout -- data` after it.
- Commit locally on the current branch after each task (`git add` only your files). No push. No Co-Authored-By trailer. Never edit `data/predictions_baseline.json`.

## Data facts the tasks rely on
- `results()` (data/dash/results.json = data/results_live.json) holds Swiss rows: `{id: "SW-R<n>-A-B", phase: "Swiss", kind: "series", round, team_a, team_b, bo, winner (null until played), score_a, score_b}`; round 1 is staged now (IG v GEN, TLAW v CFO, AL v KC, G2 v DK, HLE v TES, LOS v T1, LYON v TSW, BLG v MKOI). Rows `{kind: "swiss_record", team, record}` may also appear.
- `matchups()`: `{a, b, p_game, p_bo3, p_bo5}` for all 171 pairs, a < b by code, chances for `a`.
- `live()`: per team `p_advance, p_semis, p_final, p_champion` (knocked-out teams are absent); `ratings()` has the same fields from the frozen baseline.
- Swiss format (research/format.md, model/simulate.py): 16 teams, pair by record each round, no rematches; Bo1 unless the match can qualify or eliminate (either team on 2 wins or 2 losses), then Bo3. 3 wins advance (8 teams), 3 losses out. Round shapes: R1 8 games at 0-0; R2 4 at 1-0 and 4 at 0-1; R3 2 at 2-0, 4 at 1-1, 2 at 0-2; R4 3 at 2-1, 3 at 1-2; R5 3 at 2-2.
- Seed pools (model/simulate.py TIERS; round 1 = pool 1 v pool 4 and pool 2 v pool 3, no same region): Pool 1 GEN, AL, TLAW, G2; Pool 2 HLE, BLG, TSW, LOS; Pool 3 T1, TES, LYON, MKOI; Pool 4 DK, IG, CFO and the Play-In winner (KC).
- Knockouts (simulate.py ko_draw): QF A = a 3-0 team v a 3-2 team, QF C = the other 3-0 v another 3-2; QF B and D from the 3-1 teams and the remaining 3-2s at random; SF1 = W(A) v W(B), SF2 = W(C) v W(D); final. All Bo5.

## Task 1: Swiss state library (`site/src/lib/swiss.ts`, new) and pools constant
- `SWISS_POOLS` (the four pools above, Play-In winner resolved from the Play-In final result or the round 1 draw, else 'Play-In winner') with a source comment.
- `swissState()`: from `results()` Swiss series rows, return rounds 1 to 5; each round = record groups (`'1-0'` etc.) in the fixed order above, each group = its matches `{a, b, bo, winner|null, score|null, pa (chance for a from matchups: p_game for Bo1, p_bo3 for Bo3), drawn: boolean}`; for rounds not drawn yet, the group lists the teams on that record when known (from earlier results) and the expected number of games, with `drawn: false`. Also `qualified` (team, record) and `eliminated` (team, record) in the order teams got there.
- `pairChance(a, b, bo)` helper reading matchups (orientation handled).
- Keep it pure and small; one runnable check: extend `tests/check_site.py` only where a page shows it (Task 2).

## Task 2: Swiss bracket by record, seed pools, follow a team (`site/src/components/SwissBracket.astro`, `site/src/components/SwissPools.astro`, `site/public/js/follow.js`, `site/src/pages/swiss.astro`)
- Bracket: five round columns (Round 1 0-0, Round 2 1-0 / 0-1, ...), then Qualified and Eliminated columns. Each match card: both logos and codes, both chances (e.g. 62% / 38%) before it is played, the score once played (winner first, winner reads --fg, loser --muted), Bo3 marked. Undrawn groups show the teams on that record (or the count of games) and "Drawn after round N". Desktop: columns side by side (horizontal scroll inside the panel if needed, never the page). Phone: rounds stacked, each round a section with its groups.
- Follow a team: every team mark carries `data-team`; `follow.js` highlights all marks of a team on hover/focus and toggles a pinned team on tap/click (Escape clears). Without JS the page is complete.
- Seed pools: a compact four-column panel (pools with logos, the Play-In winner in pool 4) with one line on the round 1 rule. Place it near the bracket, lower in the hierarchy than the bracket.
- Swiss page reading order: intro, LiveNow, bracket (the lead once round 1 is drawn), Pick'Ems, record table, pools. Update the intro lede so it no longer says the draw is pending when round 1 rows exist.
- tests/check_site.py: assert the Swiss page shows the 8 round 1 games (e.g. 8 elements matching `.sb-match` in round 1) and that the follow script highlights a team on hover at 1440.

## Task 3: How far teams go (`site/src/components/TitleRace.astro`, `site/src/pages/index.astro`)
- One row per team: logo, code, a single nested bar (Knockouts lightest, Semis, Final, Champion darkest, each segment from 0 so the bar reads as nested chances), champion % as the row's number, a small legend once. Source: `live()` when it has rows (label "live"), else `ratings()` (label "frozen baseline"); knocked-out teams omitted. Top 10 with a "show all" disclosure (details/summary) for the rest.
- On Home it replaces the current title odds list (the hero prophecy above stays on the frozen baseline as now). Keep Home's two-stack layout intact; check phone.

## Task 4: Both sides' odds on match cards (`site/src/components/SeriesCard.astro`, `site/src/components/LiveNow.astro`)
- Phone line of SeriesCard: before a result show `84% · 16%` style (favourite's chance --fg, other --muted), after a result keep the score. LiveNow cards: show both teams' chances, not only "Our pick". Do not change result wording ("Picked X, wrong", "Called it").

## Task 5: Playground (`site/src/pages/playground.astro`, `site/public/js/playground.js`, nav)
- Page: "What if" Swiss and knockouts. State starts from the real results (staged round 1, any played games locked). The user taps a winner for each open game of the current round (or "Model picks" fills the round with the favourites, "Roll" samples by the model's chances); "Lock in" draws the next round by record with no rematches (Bo3 rule as above); then the knockout draw (rules above) and picks to a champion. Undo (one round back), Reset (back to the real results).
- "Odds from here": runs N simulations (1,000 / 10,000) of everything not yet picked from the current state, client side, with the model's pair chances from matchups (embed only the 16 Swiss teams' pairs as JSON in the page). Shows the TitleRace-style nested bars per team plus the change against the live odds (`live()`), e.g. "+3.1". Run in chunks (setTimeout or a Worker) so the page never freezes.
- Say plainly on the page that the playground uses fixed pair chances, so its numbers can differ slightly from the live odds, and that it does not change our predictions.
- Per-viewer state may be kept in localStorage (wrap every access in try/catch, page works without it).
- Nav: add Playground where it fits without breaking the header (check 1280, 1440, 1600; current header breakpoints in `site/src/components/Header.astro`), and in the phone bottom bar's More menu; link it from the Swiss page.
- tests/check_site.py: add `playground/` to PAGES; a check that picking all 8 round 1 winners and locking in shows round 2 with 4 + 4 games, and that "Odds from here" renders 16 rows.
