# Playground: the full bracket road (19/10/2026)

Owner approved ("yup", 19/10/2026). Ground rules and verification: `docs/superpowers/plans/2026-10-19-worldssim-ideas.md`
("Ground rules" and "Data facts"). Files: `site/src/pages/playground.astro`, `site/public/js/playground.js`, `tests/check_site.py`.

## Why
Each round replaced the last, so by the final the path was gone. Sites like ours show the whole road.

## What to build
- The road, always on screen: Swiss columns R1 to R5 (record groups in the fixed order, same visual language as
  `site/src/components/SwissBracket.astro`: match cards, record group heads with Bo, dashed boxes for undrawn groups
  "drawn after round N"), then Knockouts as a real bracket: QF (4) -> SF (2) -> Final -> Champion card, with connector
  lines on desktop (SF1 = W(QF A) v W(QF B), SF2 = W(QF C) v W(QF D), the order playground.js already uses).
- Played rounds: winner first and --fg, loser --muted; real results tagged "Result" (as now). The current round's column is
  highlighted (a quiet surface change and a "Your pick" label, no coloured one-side outline) and is the ONLY tappable one;
  every other card is static (no buttons, no hover effects). Later rounds dashed.
- Champion card at the end once the final is picked: logo, code, and the path in one line, e.g.
  "GEN: 3-0 in Swiss, beat G2, T1, HLE".
- One control bar, sticky at the top of the road on desktop and at the bottom above the phone bottom bar on phone:
  Model picks, Roll, Lock in, Undo, Reset, Roll to the end. Keep the current re-press rule (Model picks and Roll redo the
  games they filled, never a hand pick). "Roll to the end": from the current state, roll every remaining open game and lock
  every remaining round through the final in one go (one Undo step back to where it started is enough; say so in its
  title). Progress text stays ("5 of 8 picked").
- Odds from here stays, below the road, unchanged in behaviour.
- Desktop: the road scrolls sideways inside its panel if needed (never the page); the current round scrolls into view after
  Lock in. Phone (390): rounds stacked; the current round open; played rounds folded into one-line summaries
  (details/summary, e.g. "Round 1: GEN, TLAW, AL, DK, HLE, T1, LYON, BLG won") that expand to the cards; knockouts as
  stacked rounds, not a wide tree.
- Remove the separate Standings block if the road makes it redundant (records are visible in the road's group heads);
  keep a compact "Through / Out" list next to the knockout bracket instead.
- Earlier rounds change only via Undo (say so in a caption).
- localStorage state keeps working (old saved state without the new fields must still load or reset cleanly).

## Checks
- tests/check_site.py check_playground: keep the existing flow (pick all, lock in, next round shape, odds rows); add: after
  Lock in, the previous round is still on the page with its 8 winners; "Roll to the end" reaches a champion card and the
  road shows QF, SF and Final picks; at 390 no horizontal page scroll.
- Screenshots at 390, 1100 and 1440: start, mid-Swiss, after Roll to the end; looked at for hierarchy and overflow.
