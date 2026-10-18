# Home rework and Riot live state (19/10/2026)

Owner approved ("yep", 19/10/2026). Same ground rules and verification as `docs/superpowers/plans/2026-10-19-worldssim-ideas.md`
(read its "Ground rules" section first). Builds on the worldssim commits and the header commits (More dropdown, centred nav,
no lock chip, desktop at 90% via CSS zoom).

## Why
Home led with a stale "Live now KC v MVK" (the clock said live, the final had ended; gol.gg posts results hours later), a
half-width card with empty space beside it, a frozen 15/10 headline number next to a near-identical live one (33.6% v 33.8%),
stale Quick picks ("Play-In winner KC 49%") and no sign of the model's record.

## Task H1: Riot live state in the pipeline (`model/live_state.py` new, `.github/workflows/update.yml`, `tests/test_v5.py`)
- Fetch `https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-GB&leagueId=98767975604431411` (Worlds) with
  header `x-api-key` = the `LOLESPORTS_KEY` constant already in `model/fetch_art.py` (import or reuse it, do not copy a second
  literal) and the project User-Agent. Follow `pages.older` at most 2 pages if needed to cover 15/10 onwards.
- Write `data/dash/schedule.json`: one row per Worlds match from 15/10/2026 on: `{start_utc, start_nz ("dd/mm/yyyy HH:MM"),
  block ("Play-Ins" | "Swiss" | "Quarterfinals" | ...), state ("unstarted" | "inProgress" | "completed"), bo, team_a, team_b,
  wins_a, wins_b, fetched_nz}`. Teams as our codes: map Riot codes and names to ours via `data/team_map.json` names plus a
  small alias table (Riot "FUR" -> FURIA, "TL" -> TLAW, check every Worlds team resolves; unknown codes stay as Riot gives them
  and are logged; "TBD" stays "TBD"). Sorted by start. A network failure leaves the previous file untouched and exits 0 with a
  log line (the update run must never fail because Riot is down).
- update.yml: run `python -X utf8 model/live_state.py` at the start of "Pull results and refresh data" (every run). Publish
  also when `data/dash/schedule.json` changed in a way that matters: a row's state, wins_a/wins_b or teams changed (ignore
  `fetched_nz`). Simplest: compare the file without fetched_nz against the committed one (git show HEAD:...) in a small
  python one-liner; if different, run export and set publish=yes. Keep the existing results path unchanged. Keep "bot commits
  data/ only".
- One offline test in tests/test_v5.py: feed a small fixture dict shaped like the API response (one completed, one
  inProgress, one TBD v TBD) to the parsing function and assert the rows, the code mapping (FUR -> FURIA, TL -> TLAW) and NZ
  time conversion.
- Run it once locally if the network allows (it may not on the office network: then rely on the test) and commit the
  resulting data/dash/schedule.json only if it fetched.

## Task H2: live state on the site (`site/src/lib/data.ts`, `site/src/lib/live.ts` new, `site/src/components/LiveNow.astro`)
- `schedule()` loader (missing file = empty list). `matchState(series)` finds the schedule row with the same two teams (order
  free) and the nearest start to the series' start (within 12 hours); returns `{state, wins_a, wins_b}` oriented to the
  series' team_a, or null.
- LiveNow: a series whose Riot state is `completed` is not "live": show it as a result line "KC won 3-0" (winner first,
  from Riot's game wins) with a small "official stats to follow" note until our results row exists; `inProgress` shows
  "Live now" in green with the running game score (e.g. 2-0); `unstarted` or no Riot row keeps today's clock behaviour
  (countdown, then live; the 5-hour "Result pending" fallback stays for when Riot data is missing). The build-time state is
  what Riot said at the last publish; the client clock must not turn a completed match back into "Live".
- Keep the result wording elsewhere unchanged ("Called it", "Picked X, wrong").

## Task H3: Home (`site/src/pages/index.astro`, new `site/src/components/TodayBand.astro`, reuse `TitleRace.astro`, `PickemsPanel.astro`)
Reading order (desktop and phone):
1. Today band, full width, the lead: "Today, dd/mm" with every Worlds series whose NZDT start date is today (from the
   latest staged series + Riot schedule): both logos, both chances (favourite --fg, other --muted), Bo, start time; live in
   green with the game score; finished winner-first with our call ("Called it" / "Picked X, wrong"). If today has no games:
   "Next up, dd/mm" with that day's games. Desktop: cards in a row (wrap to 2 rows for 8 Swiss games; equal widths, no empty
   half-width gaps). Phone: stacked compact rows. This replaces the LiveNow strip and the "Latest result" line on Home only
   (LiveNow stays on the stage pages). Build-time "today" uses NZDT; the bot publishes at least once per NZDT day.
2. The prophecy on live odds: eyebrow "The prophecy for Worlds 2026", the existing headline/tagline logic but fed from
   `live()` (fallback `ratings()`), ONE gold number (the favourite's live title chance) with "x% at the seal, 15/10" muted
   beside it (from ratings(), the frozen baseline). Then the TitleRace bars (top 8, show all). Then one muted line:
   "Likeliest final GEN v HLE, Brooklyn 15/11/2026 NZDT". Remove the old final/spoiler box and the duplicate big number.
3. The model so far: a compact panel, winners called by stage (from `grade()` / `resultRows()`: e.g. "Play-In 4 of 6
   winners") and Pick'Ems points (`pickemPoints()`: "10 of 35 points"), link to the Scorecard.
4. Pick'Ems for the next lock (existing compact PickemsPanel), then the "Where the orb is clouded" callout.
5. A links row: Playground ("What if: pick the winners"), Teams, Players (cards with icon, title, one line).
Dropped from Home: Quick picks, the "Latest result" line, the final/spoiler box.
Layout: Today full width; below it two columns (left wider: prophecy + title race; right: model so far, Pick'Ems, callout);
links row full width. Gold only for the one key number (the live title chance) and the brand; teal/risk only for status.
tests/check_site.py: Home has the Today band (or Next up) with at least one game card, one gold hero number, no "Quick
picks" text, and the model-so-far panel. Screenshots at 390 and 1440 (and 1100), looked at, reading order checked.
