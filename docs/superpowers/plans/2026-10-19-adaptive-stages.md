# Adaptive stage pages: before, during, after (19/10/2026)

Owner approved ("yes, this adaptive logic should apply to other relevant pages too", 19/10/2026). Ground rules and
verification: `docs/superpowers/plans/2026-10-19-worldssim-ideas.md` ("Ground rules", "Data facts"). Live state: the
Riot schedule (`schedule()` / `matchState()` in `site/src/lib/live.ts`) and results (`results()`); gol.gg results stay the
record, Riot "completed" counts as a finished result with "official stats to follow" where shown.

## Why
The Play-In finished but its page still asked "Who wins the Play-In?" beside a "Result pending" card; its "bracket" was
four equal columns with empty cells and no lines; the series detail led with pre-match score chances and a big empty
area holding one sentence; the Pick'Ems buried the points total. The same will happen to Swiss and Knockouts.

## Task S1: stage state (`site/src/lib/stage.ts`)
- `stageState(stage)`: 'before' (no series of the stage started), 'during', 'after' (the stage's last series has a result:
  Play-In PI-GF; Swiss every team at 3 wins or 3 losses (from results / swiss_record rows); Knockouts KO-F). Riot
  completed with a winner counts as a result. Export the outcome too: Play-In winner + final score + final standings 1-4
  (1 final winner, 2 final loser, 3 lower-final loser, 4 elimination-match loser); Swiss qualified/eliminated with records
  (reuse `swissState()` from `site/src/lib/swiss.ts`); Knockouts champion, finalist, semifinalists.
- "What we had at the lock": the stage's Pick'Ems pick and chance for the headline slot (Play-In winner pick from the
  Play-In Pick'Ems "Final (Play-In winner)" row; Knockouts champion pick; Swiss: our 3-0 / advance picks and how many came
  true).

## Task S2: Play-In page (`site/src/pages/play-in.astro`, `site/src/components/SeriesCard.astro`, `site/src/components/SeriesDetail.astro`, new `site/src/components/PlayInTree.astro`)
- After: the top leads with the outcome: eyebrow "Play-In, 16 to 19/10", h1 "<Winner> win the Play-In", a line "Beat MVK
  3-x in the final" (score UNKNOWN until known, never guessed; with Riot-only data "official stats to follow"), a muted line
  "We had KC at 49% at the lock" (Called it / Picked X, wrong). Beside it, "Final standings" 1 to 4 with logos; the winner's
  row says where they go next: "Swiss, pool 4, v AL on 24/10" (round 1 opponent from the Swiss round 1 rows, date from
  SWISS_ROUND_DAYS); others "Out". Before/during: the current top (live card under the intro, odds panel), unchanged.
- The bracket is a real double-elimination tree (desktop): an Upper row R1-A, R1-B -> Winners' match -> Final, and a
  Lower row Elimination match -> Lower final -> Final, with connector lines (CSS borders or inline SVG) so each card sits
  between its feeders. Same compact card everywhere (winner first and --fg, loser --muted, score; before a result both
  chances; our call as a small tag). Phone: rounds stacked in order (R1, R2, Lower final, Final) with the round label on
  each card, no tree. Cards stay selectable for the detail (public/js/select.js) as now.
- Series detail, played: result first (winner, score, our call: pick + chance, score call v actual); the pre-match score
  chances inside a details/summary "What the model expected" with the actual score's row marked; drop the
  "The matchup write-up is added once both teams are known." sentence when there is no write-up (show nothing). Unplayed:
  as now. Keep SeriesDetail working on the other pages that use it.
- Pick'Ems: lead with the total ("10 of 35 points, 2 of 6 right" as one key line; gold only if it is the view's key number
  and nothing else on the page is gold), rows: slot, our pick, chance at the lock, result (Hit +5 / Miss / Pending); the
  Field column moves into a details/summary under the table.

## Task S3: Swiss and Knockouts after-state (`site/src/pages/swiss.astro`, `site/src/pages/knockouts.astro`)
- Swiss after: the top leads with "Swiss done: 8 through" (the qualified teams with records, 3-0 first), "Out" list, and
  "Our Pick'Ems: N of 8 advancers, 3-0 picks x/2, 0-3 picks y/2". The bracket stays below as the full record. During:
  as now (bracket leads). Before: as now.
- Knockouts after: the top leads with "<Champion> win Worlds 2026", the final score, runner-up, and "We had <pick> at x% at
  the lock". The bracket stays below. Before/during: as now.
- Home: no change needed (the Today band already adapts), but if a stage is 'after' and today has no games, the Today
  band's "Next up" must point at the next stage's first games.

## Checks
- tests/check_site.py: Play-In with the real data (final result may or may not be in `results.json`; build a temp
  W26_DASH where PI-GF has a result) shows the after top ("win the Play-In", 4 standings rows) and the tree (6 series cards,
  upper and lower rows); with PI-GF unplayed the before/during top shows. Swiss and Knockouts after-states checked with
  temp fixture dashes. Screenshots 390, 1100, 1440 of each state, looked at.
