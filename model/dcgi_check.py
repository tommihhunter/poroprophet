#!/usr/bin/env python3
"""
Walk-forward check of the v4 rating model on the 2026 Demacia Cup Global Invitational (DCGI, 03/10 to 17/10/2026).

The fit uses only series dated before 03/10/2026 (as_of 03/10/2026), so nothing from the event leaks in. DCGI rows
come from the hand-compiled data/results_2026.json (event_group "supplementary", never in the model fit).
Predictions follow model/backtest_v5.py exactly: d_pair (temperature + uncertainty shrink, no adjustments) and
series_ll; the pick, tier and modal score come from ratings_v4.series_summary.
Baselines: the naive region rule (team from the stronger fitted region wins with 0.70, same region 0.5) and a coin flip.

Run: python -X utf8 model/dcgi_check.py  -> data/dash/dcgi.json (flat rows for the site) and a report on stdout
"""
import json, math, os, sys, datetime as dt
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import ratings_v4 as R, backtest_v5 as BT  # noqa: E402

EVENT = "Demacia Cup Global Invitational 2026"
CUT = dt.date(2026, 10, 3)
ALIAS = {"DPLUS": "DK", "MIBR.LOS": "LOS", "Sentinels": "SEN", "GIANTX": "GX"}   # as in build_games.py / load_series
ALIAS.update({name: v["code"] for name, v in R.TEAM_MAP.items()})                   # full names -> codes
OUT = os.path.join(R.ROOT, "data", "dash", "dcgi.json")


def code(name):
    return ALIAS.get(name, name)


def ll(p):
    return -math.log(max(p, 1e-9))


def main(write=True):
    rows = R.load_series()
    train = [r for r in rows if r["date"] < CUT]
    assert not any(r["event"] == EVENT for r in train)
    f = R.fit(train, as_of=CUT)
    reg_strength = lambda g: f["R"].get(g, R.R_PRIOR.get(g, 0.0))
    created = dt.datetime.now(R.NZ).strftime("%d/%m/%Y %H:%M NZDT")
    common = dict(created_nz=created, fit_cut=CUT.strftime("%d/%m/%Y"))

    src = [h for h in json.load(open(os.path.join(R.ROOT, "data", "results_2026.json"), encoding="utf-8")) if h["event"] == EVENT]
    src.sort(key=lambda h: R.pdate(h["date"]))
    out, skipped, unknown = [], [], set()
    pairs = defaultdict(lambda: dict(n=0, first_wins=0, model_hits=0))
    bo5_pred, bo5_act = defaultdict(float), defaultdict(int)
    for n, h in enumerate(src, 1):
        a, b = code(h["team_a"]), code(h["team_b"])
        sa, sb, bo = int(h["score_a"]), int(h["score_b"]), int(h["bo"])
        sid = f"DCGI-{n}"
        missing = [t for t in (a, b) if t not in f["ti"]]
        if missing:
            unknown.update(missing); skipped.append(f"{sid} {h['team_a']} v {h['team_b']}")
            continue
        ra, rb = R.REGION.get(a, "UNKNOWN"), R.REGION.get(b, "UNKNOWN")
        notes = [h["note"]] if h.get("note") else []
        if (h.get("region_a"), h.get("region_b")) != (ra, rb):
            notes.append(f"file regions {h.get('region_a')}/{h.get('region_b')} differ from team_map {ra}/{rb}")
        d = BT.d_pair(f, a, b)
        s = R.series_summary(a, b, d, bo, f["sigma"])
        sc = R.series_probs_mixed(d, bo, f["sigma"])
        pa = sum(v for k, v in sc.items() if int(k.split("-")[0]) == bo // 2 + 1)
        winner = a if sa > sb else b
        hit = s["winner"] == winner
        model_ll = BT.series_ll(d, dict(bo=bo, sa=sa, sb=sb))
        assert abs(model_ll - ll(pa if winner == a else 1 - pa)) < 1e-9
        if ra == rb:
            p_reg_a = 0.5
        else:
            p_reg_a = 0.7 if reg_strength(ra) > reg_strength(rb) else 0.3
        region_ll = ll(p_reg_a if winner == a else 1 - p_reg_a)
        # region pairing: stronger fitted region first (alphabetical when the same region)
        first, second = sorted((ra, rb), key=lambda g: (-reg_strength(g), g))
        key = f"{first} v {second}"
        pairs[key]["n"] += 1
        pairs[key]["first_wins"] += int(R.REGION.get(winner) == first)
        pairs[key]["model_hits"] += int(hit)
        if bo == 5:
            for k, v in sc.items():
                bo5_pred["-".join(sorted(k.split("-"), reverse=True))] += v
            bo5_act[f"{max(sa, sb)}-{min(sa, sb)}"] += 1
        out.append(dict(id=sid, date=h["date"], stage=h.get("stage", "UNKNOWN"), team_a=a, team_b=b, region_a=ra, region_b=rb,
                        bo=bo, p_series_a=round(pa, 4), pick=s["winner"], p_pick=round(s["p_winner"], 4), tier=s["tier"],
                        score_call=s["score"], actual_winner=winner, actual_score=f"{sa}-{sb}", hit=hit,
                        logloss=round(model_ll, 4), logloss_region_rule=round(region_ll, 4), logloss_coin_flip=round(ll(0.5), 4),
                        note="; ".join(notes), **common))

    m = len(out)
    mean = lambda k: round(sum(r[k] for r in out) / m, 4) if m else None
    summary = dict(kind="summary", id="DCGI-summary", n=m, logloss=mean("logloss"), logloss_region_rule=mean("logloss_region_rule"),
                   logloss_coin_flip=mean("logloss_coin_flip"), hits=sum(r["hit"] for r in out),
                   hit_rate=round(sum(r["hit"] for r in out) / m, 4) if m else None,
                   unknown_teams=", ".join(sorted(unknown)) or "none", skipped_series="; ".join(skipped) or "none",
                   n_bo5=sum(bo5_act.values()),
                   note=f"{m} hand-compiled series, the full event from Swiss round 1 to the final (complete 19/10/2026); "
                        "DCGI teams are those that missed Worlds", **common)
    for key, v in sorted(pairs.items()):
        k = key.replace(" ", "_")
        summary.update({f"pair_{k}_n": v["n"], f"pair_{k}_first_region_wins": v["first_wins"], f"pair_{k}_model_hits": v["model_hits"]})
    for sc_key in ("3-0", "3-1", "3-2"):
        summary[f"bo5_pred_{sc_key}"] = round(bo5_pred[sc_key], 4)
        summary[f"bo5_actual_{sc_key}"] = bo5_act[sc_key]
    out.append(summary)

    if write:
        json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1)
    print(f"DCGI walk-forward check: fit on {len(train)} series before {common['fit_cut']}, created {created}")
    print(f"{'id':<8}{'date':<12}{'match':<14}{'bo':>3}  {'pick':<6}{'p':>7}  {'tier':<10}{'call':<5}{'actual':<12}{'hit':<5}{'ll':>7}")
    for r in out[:-1]:
        print(f"{r['id']:<8}{r['date']:<12}{r['team_a'] + ' v ' + r['team_b']:<14}{r['bo']:>3}  {r['pick']:<6}{r['p_pick']:>7.3f}  "
              f"{r['tier']:<10}{r['score_call']:<5}{r['actual_winner'] + ' ' + r['actual_score']:<12}{'yes' if r['hit'] else 'no':<5}{r['logloss']:>7.4f}")
    print(f"\nn {m} | log loss model {summary['logloss']} | region rule {summary['logloss_region_rule']} | coin flip {summary['logloss_coin_flip']}"
          f" | winners {summary['hits']}/{m} ({summary['hit_rate']})")
    for key, v in sorted(pairs.items()):
        print(f"  {key}: {key.split(' v ')[0]} side won {v['first_wins']}/{v['n']}, model picked {v['model_hits']}/{v['n']}")
    print("  Bo5 score mix (expected v actual): " + ", ".join(f"{k} {summary['bo5_pred_' + k]:.2f} v {summary['bo5_actual_' + k]}" for k in ("3-0", "3-1", "3-2")))
    print(f"  UNKNOWN teams: {summary['unknown_teams']} | skipped: {summary['skipped_series']}")
    return summary


if __name__ == "__main__":
    main()
