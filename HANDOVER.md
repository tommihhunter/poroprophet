# Handover: Worlds 2026 Predictor

Written 16/10/2026 08:40 NZDT. This replaces HANDOVER_v4.md (kept for history). Read CLAUDE.md for the rules, README.md for the file map, MODEL_REVIEW.md for the model's reasoning and validation.

## What this is
A personal League of Legends Worlds 2026 prediction tool: cited research on the 19 teams, a hierarchical Bradley-Terry rating fitted at series level on every 2026 series (gol.gg), a Monte Carlo of the Play-In / Swiss / knockouts, Pick'Ems and Crystal Ball picks, and a dashboard that grades itself as results come in. Two front ends exist: an online dashboard (claude.ai Dashboard artifact, colour team badges, datasets uploaded as JSON) and a local standalone file (`python3 model/build_local.py` -> `worlds2026_predictor.html`, 1.06 MB, embeds real team logos and Riot Data Dragon art). A Claude Design canvas (`design/`) holds four artboards for a public-site look that has NOT been ported to either front end yet.

## Website
Site v2 (16/10/2026): a static Astro site in `site/`, built from `data/dash/*.json`. Live at https://poroprophet.lol (GitHub Pages with a custom domain; repo tommihhunter/poroprophet).
- Build locally (Node 24, Python as below):
  ```
  python -X utf8 model/export_dashboard.py && python -X utf8 model/export_site_assets.py && cd site && npm ci && npm run build
  python -X utf8 tests/check_site.py               # from the repo root: serves site/dist, opens 12 pages at 1280 and 390 px
  ```
  `model/export_site_assets.py` copies `dashboard/logos`, `dashboard/extras` and the champion and item art in `dashboard/ddragon_cache` into `site/public/art/` and writes `site/src/lib/art.json`. `site/public/art/` is committed; the bot never touches it.
- Pages (199 built): Home `/`, `/scorecard/`, `/meta/`, the event hubs `/play-in/`, `/swiss/`, `/knockouts/` and `/demacia-cup/` (one template, `site/src/components/EventHub.astro`), the Teams grid `/teams/`, a team page per team `/teams/<code>/` (19, lower-case codes), the compare picker `/teams/compare/` and a compare page per pairing `/teams/compare/<a>-vs-<b>/` (171).
- Client scripts in `site/public/js/`, all optional (every page is complete without JavaScript): `teams-grid.js` (region and tier filters and sorting on the Teams grid, state in the URL hash), `compare-pick.js` (the two compare pickers navigate to the static page) and `clock.js` (marks series whose start has passed and dates the Today card from the viewer's NZDT clock, so a day boundary needs no rebuild).
- Compare slug rule: `<a>-vs-<b>` with `a < b` by code (`gen-vs-hle`, never `hle-vs-gen`). Pages cannot redirect, so the pickers always build the canonical order.
- The Demacia Cup hub is a model test, not a prediction: a walk-forward check on the DCGI (03 to 17/10/2026) from `model/dcgi_check.py` -> `data/dash/dcgi.json`. Without that file the hub shows "Check not run yet."
- Base path: `site/astro.config.mjs` reads `W26_SITE_URL` (default https://poroprophet.lol) and `W26_BASE` (default /); `tests/check_site.py` reads `W26_BASE` too. Both workflows set them in a top-level `env:` block, so moving to a custom domain is a change to those two values.
- `.github/workflows/publish.yml`: every push to main (and on demand) runs the model tests, exports the site assets, builds `site/`, runs `tests/check_site.py` and deploys `site/dist`.
- `.github/workflows/update.yml`: every 30 minutes from 16/10 to 16/11/2026 NZDT (and on demand) pulls Worlds results from gol.gg; when there is something new it rescrapes, refreshes live odds, exports, regrades, runs the tests, commits `data/` only (bot commit, agreed 16/10/2026), builds, checks and deploys. With nothing new it still publishes once per NZDT day: when the `exported_nz` stamp in `data/dash/overview.json` is not today's date it re-runs `export_dashboard.py` (which advances the stamp), commits and deploys; otherwise it stops. Pull before working locally: the bot pushes to main.
- Rows the bot adds have no `start_nz` (gol.gg has no start times); grading treats them as valid because every frozen pick was made before its stage began.
- Retired at cutover: `dashboard/index.html`, `dashboard/store/`, `model/build_site.py` and `model/build_local.py` (the old single-page dashboard and the local file). Older notes below that mention them describe the pre-v2 setup.

## State right now (16/10/2026 08:40 NZDT)
- Baseline v4 is frozen: `data/predictions_baseline.json`, created 15/10/2026 17:08:07 NZDT, SHA in `data/predictions_baseline.sha256`. v1 to v3 kept as `predictions_baseline_v*_superseded.json`. Champion GEN 33.6%, then T1 17.2%, HLE 17.0%, BLG 11.7%, DK 9.9%. Play-In: KC 49%, C9 24%, FURIA 24%, MVK 3%. Finals MVP Ruler.
- Play-In Pick'Ems and Crystal Ball LOCKED at 16/10/2026 07:00 NZDT. Entered picks: `data/pickems_playin.json` (KC, FURIA, KC, C9, KC, KC; expected 17.55 of 35). Crystal Ball answers: `data/narratives_baseline.json` `_extra.crystal_ball` (18 answers).
- The first Play-In series (KC v C9, 07:00 NZDT) has started or finished by the time you read this. `data/results_live.json` still holds two unplayed placeholder rows. Nothing has been graded yet.
- Dashboard datasets uploaded on 15/10: series v6, ratings v3, swiss v3, pickems v4, crystal v5, overview v5, regions v2, dossiers v7, patch_changes v3, patch_state v1, results v2, meta_champs v1, meta_fit v1; page files/index.html v18. The store copy of the page is `dashboard/store/files__index.html.json`.
- Project storage on claude.ai is full; the repo on disk (this bundle) is the complete copy. `data/golgg_teams_2026.json` (5.4 MB) was never stored there.

## Next steps, in order
1. Results loop: automatic. The Update workflow (every 30 minutes, 16/10 to 16/11/2026 NZDT) pulls finished series from gol.gg into `data/results_live.json`, rescrapes and refits, writes live odds and grading, commits `data/` and republishes https://poroprophet.lol. By hand only if gol.gg is unreachable from GitHub: append rows to `data/results_live.json` (schema in README.md), run `python -X utf8 model/live.py`, `export_dashboard.py`, `grade.py`, commit and push. Rows the bot adds have no `start_nz`; add it by hand if the post-start rule matters.
2. Sweep calibration check after the six Play-In Bo5s: compare actual 3-0 / 3-1 / 3-2 counts with the expected 1.8 / 1.3 / 0.8. The owner's standing question is whether 3-0 should be the modal score; the decision on 15/10 was to keep sd 1.0 (178 Bo5s walk-forward, 44% sweeps). Only revisit if the Play-In is clearly 3-2 heavy, and then via `model/sweep_check.py`, not by hand.
3. Swiss staged run: after the round-1 draw (18/10 US time, about 19/10 NZDT), before the lock 24/10/2026 06:00 NZDT. Steps: `python3 model/update_results.py` so the Play-In is complete in `data/results_live.json`; `python3 model/scrape_golgg.py && python3 model/build_games.py` (add the two Worlds tournaments to TOURNAMENTS in scrape_golgg.py with league INTL, kind international, so Play-In games enter the fit); re-check rosters (TES: 369 confirmed top but no games since March; ZUIAN third visa interview outcome UNKNOWN, if cleared he must start immediately); `python3 model/ratings.py`; `python3 model/simulate.py --results data/results_live.json --r1 "<the published draw>" --out data/sim_swiss.json`; `python3 model/predict.py --stage swiss --results data/results_live.json --r1 "<same>"`; `python3 model/pickems.py --stage swiss` (10 per correct advancer, 45 in record bonuses with unknown split, so optimise on advancers); write `data/narratives_swiss.json` keyed by pairing (`A|B`, sorted); export, upload datasets, rebuild local file. Fixed on 16/10: predict.py is stage-aware (its clock check uses the stage's first match), simulate.py takes `--r1` and `--results`, pickems.py takes `--sim`; all three tested on a fabricated results file. Follow-up fixes the same day: Swiss first match corrected to 12:00 CDT (= 10:00 PDT = 24/10 06:00 NZDT; the patch had 10:00 CDT, two hours early), knockouts to 16:00 CST (= 14:00 PST = 04/11 11:00 NZDT), Final display time 14:00 EST (= 15/11 08:00 NZDT); grade.py skips ACTUAL rows like the Scorecard does; a full `--r1` draw takes precedence over a partly played round 1 in simulate.py and predict.py, and a partly known round 1 without `--r1` no longer crashes (leftover teams paired at random).
4. Knockout staged run: after the QF draw (31/10 US), before 04/11/2026 11:00 NZDT. Put the four QF pairings into `data/results_live.json` as rows with ids KO-QF1..4 and no winner (update_results.py fills the scores later), then `simulate.py --results ...`, `predict.py --stage knockouts --results ...`, `pickems.py --stage knockouts`; points 10 per QF, 20 per SF, 80 final.
5. Port the design (optional, owner's call): `design/*.dc.html` show the intended public look (dark ground #0B0F14, surface #131A22, line #243040, text #EAF0F6, muted #93A1B3, accent gold #E8B84A, Space Grotesk + IBM Plex Sans). Apply it to `dashboard/index.html` and the local build, then host: GitHub Pages (single `index.html` from `build_local.py`) is the simplest; the file is self-contained apart from Google Fonts.

## Key commands
On Windows the interpreter is `python`, not `python3`; every command below works with either. Set `PYTHONUTF8=1` (or run `python -X utf8 ...`): the scripts open files without an encoding and `export_dashboard.py` fails under the Windows default codepage.
```
pip install -r requirements.txt
python3 model/ratings.py                         # fit v4 -> data/ratings.json, data/matchups.json
python3 model/simulate.py --sims 100000          # -> data/sim_baseline.json
python3 model/simulate.py --results data/results_live.json --r1 "GEN-CFO,AL-DK,TLAW-IG,G2-PIW,LOS-TES,TSW-T1,HLE-MKOI,BLG-LYON" --out data/sim_swiss.json
                                                 # known Play-In winner, finished Swiss/KO series and the real R1 draw are taken as fact (PIW = Play-In winner)
python3 model/predict.py --stage <playin|swiss|knockouts> [--results data/results_live.json] [--r1 "..."] [--playin-winner CODE]
                                                 # each stage checks the clock against its own first match; finished series appear as ACTUAL rows
python3 model/pickems.py --stage swiss [--sim data/sim_swiss.json]   # default: data/sim_<stage>.json if present, else sim_baseline
python3 model/export_dashboard.py                # -> data/dash/*.json
cd site && npm ci && npm run build             # -> site/dist (W26_SITE_URL / W26_BASE override the domain and base path)
python3 model/update_results.py --dry-run        # gol.gg Worlds results -> data/results_live.json
python3 model/grade.py                           # -> data/grading.json
python3 model/live.py [--sims 20000]             # live odds -> data/dash/live.json (refit to today, finished Worlds series as fact)
                                                 # after the Swiss R1 draw, add the 8 pairings to data/results_live.json as phase Swiss, round 1, no winner, so live odds use the real draw
python3 model/backtest_v5.py                     # v5 candidate test -> data/backtest_v5.json (adopted settings drive MODEL=v5)
python3 model/scrape_golgg_players.py [--split Summer --out ...]
python3 model/scrape_golgg_teams.py
python3 model/backtest_v4.py ; python3 model/sweep_check.py
```
`model/ratings.py` is a switch: MODEL=v4 (default) or MODEL=v3.

## Data sources and what feeds the model
Feeds the rating: `data/series_2026.json` (1,075 series from gol.gg incl. regular seasons at weight 0.5, qualifiers 0.6; Americas Cup from the hand file), `data/region_prior_2025.json` (2025 internationals as a shrunk prior mean), `data/adjustments.json` (TES -0.20 visa, T1 +0.10, BLG -0.05, LCS venue +0.05).
Descriptive only (dossiers, bracket detail panels): `data/golgg_players_2026.json` and `_summer_` (95 players, season and Summer split stats and champion pools), `data/golgg_teams_2026.json` (team pages: record, side win rates, objectives, pick/ban tables, draft log), `data/patch_state.json` (every change in 26.18 to 26.20), `data/rules_2026.json` (Fearless in every Bo3/Bo5, Right of First Selection, Pick'Ems points, locks), `research/teams/*.md` (19 dossiers).

## Known limits and open items
- v5 backtest (16/10/2026): no candidate passed that can change a prediction, so v4 stays the model; the side term passed but is recorded only (side is not known pre-match). See MODEL_REVIEW.md "v5 candidates". 369 staleness stays a manual adjustment.
- LCK-over-LPL gap is +0.65 logit with sd 0.60, about one standard error from zero; the top four picks lean on it. Early warning: LPL teams going 2-0 or better against LCK in Swiss Bo1s.
- Pick'Ems: Swiss record-bonus split and 0-3 picks UNKNOWN; whether a wrong QF pick voids later picks UNKNOWN; Crystal Ball points per question UNKNOWN.
- gol.gg is reachable from a normal home connection (checked 16/10 08:50 NZDT: both Worlds pages respond, no scores yet). If `update_results.py` fails with a DNS error the network is blocking gol.gg; run it from another network or paste the series into `data/results_live.json` by hand (schema in README.md).
- gol.gg Play-In labels after ROUND1 are assumed (ROUND2/ROUND3/FINALS); `update_results.py` bracket logic does not depend on them.
- Scorecard / grade.py: in the Swiss and knockout staged sets, Play-In results still match the Play-In all-pairings matrix and show up as `INVALID - post-start` (harmless, they are excluded, but the list is noisy).
- The claude.ai Dashboard artifact and the old single-page dashboard are retired; the website at https://poroprophet.lol is the only front end.
- MVK has no logo in the local file (none in the lootmarket repo).
- Dossier "Key stats" in the local file now come from gol.gg team pages; the older playoff-sample stats are still in `data/teams.json` (team_stats) for provenance.
- Design artboards use real numbers but only one team (GEN) and one series (KC v C9) are laid out; the rest of the pages are implied.

## Verification checklist (run before publishing anything)
- [ ] `python3 -c "import json,glob;[json.load(open(f)) for f in glob.glob('data/*.json')+glob.glob('data/dash/*.json')]"` parses everything.
- [ ] `sha256sum -c data/predictions_baseline.sha256` passes (baseline untouched).
- [ ] `python3 model/predict.py --stage <stage>` was run BEFORE the stage's first match (it asserts the clock); created_nz in the file is before the lock.
- [ ] Every new series row in `data/results_live.json` has team codes from `data/team_map.json`, a winner, scores consistent with `bo`, and `start_nz`.
- [ ] `python3 model/grade.py` runs clean and the Scorecard tab shows the same counts.
- [ ] Website: `python -X utf8 model/export_site_assets.py && (cd site && npm run build) && python -X utf8 tests/check_site.py` prints `site OK`.
- [ ] Online: every dataset doc in `datasets/` points at the asset you just uploaded (`updated.at` bumped), page document version increased by one.
- [ ] No em dashes in prose you added (the page uses the dash glyph only as the empty-value placeholder in data cells; leave those).
- [ ] Dates dd/mm/yyyy, times NZDT (+ venue) in anything user-facing.
- [ ] State the single biggest risk of the change in your summary.
