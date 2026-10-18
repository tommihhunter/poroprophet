#!/usr/bin/env python3
"""
Tournament simulation for Worlds 2026, using the ratings from model/ratings.py.

Run:  python3 model/simulate.py [--sims N] [--seed S] [--out data/sim_<tag>.json]
          [--playin-winner CODE]   (condition on a known Play-In winner)
          [--r1 "GEN-CFO,AL-DK,TLAW-IG,G2-PIW,LOS-TES,TSW-T1,HLE-MKOI,BLG-LYON"]  (the real round-1 draw; PIW = Play-In winner)
          [--results data/results_live.json]  (lock in the known Play-In winner and every finished Swiss / knockout series)

* Play-In: exact enumeration of the 4-team double-elimination Bo5 bracket
  (R1: KC-C9, FURIA-MVK; winners' match; elimination match; lower final; final).
* Swiss: Monte Carlo. Round 1 draw = Tier1 v Tier4 and Tier2 v Tier3, no same-region
  pairs (rejection sampling over all legal draws, since the draw is published
  only on 18/10). Later rounds: random pairing inside each W-L pool with no
  rematches. Bo3 when the match can qualify or eliminate a team (either team on
  2 wins or 2 losses), otherwise Bo1. 3 wins advances, 3 losses eliminates.
* Knockouts: QF draw per the Riot primer: the two 3-0 teams each meet a random
  3-2 team, on opposite halves; the remaining four are paired at random. Bo5 all
  the way, final 14/11.
Outputs per team: P(each Swiss record), P(advance), P(reach SF/F), P(champion).
"""
import json, math, random, sys, os, argparse, itertools
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ratings as R  # noqa: E402

TIERS = {1: ["GEN", "AL", "TLAW", "G2"], 2: ["LOS", "TSW", "HLE", "BLG"],
         3: ["LYON", "MKOI", "T1", "TES"], 4: ["CFO", "IG", "DK", "PIW"]}
PLAYIN = ["KC", "C9", "FURIA", "MVK"]
RECORDS = ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"]


class SeriesTable:
    def __init__(self, model):
        self.m = model
        self.cache = {}

    def p_series(self, a, b, bo):
        k = (a, b, bo)
        if k not in self.cache:
            sc = R.series_probs_mixed(self.m.d_game(a, b, bo), bo)
            need = bo // 2 + 1
            self.cache[k] = sum(v for s, v in sc.items() if int(s.split("-")[0]) == need)
        return self.cache[k]

    def play(self, a, b, bo, rng):
        return a if rng.random() < self.p_series(a, b, bo) else b


# ---------------- Play-In (exact) ----------------
def playin_exact(st):
    """Return P(team wins Play-In) by full enumeration of the bracket."""
    win = defaultdict(float)
    paths = []
    m1, m2 = ("KC", "C9"), ("FURIA", "MVK")
    for w1 in m1:
        l1 = m1[1] if w1 == m1[0] else m1[0]
        p1 = st.p_series(w1, l1, 5)
        for w2 in m2:
            l2 = m2[1] if w2 == m2[0] else m2[0]
            p2 = st.p_series(w2, l2, 5)
            for wm in (w1, w2):           # winners' match
                lm = w2 if wm == w1 else w1
                pwm = st.p_series(wm, lm, 5)
                for em in (l1, l2):       # elimination match
                    le = l2 if em == l1 else l1
                    pem = st.p_series(em, le, 5)
                    for lf in (lm, em):   # lower final
                        llf = em if lf == lm else lm
                        plf = st.p_series(lf, llf, 5)
                        for gf in (wm, lf):
                            pgf = st.p_series(gf, lf if gf == wm else wm, 5)
                            pr = p1 * p2 * pwm * pem * plf * pgf
                            win[gf] += pr
    return dict(win)


def playin_sample(st, rng, known=None):
    """One Play-In bracket. known = {slot id: winner} from results_live.json, taken as fact (by slot, so a
    final that repeats a round-1 pairing keeps its own result)."""
    k = known or {}
    play = lambda sid, x, y: k[sid] if k.get(sid) in (x, y) else st.play(x, y, 5, rng)
    a, b = ("KC", "C9"), ("FURIA", "MVK")
    w1 = play("PI-R1-A", *a); l1 = a[1] if w1 == a[0] else a[0]
    w2 = play("PI-R1-B", *b); l2 = b[1] if w2 == b[0] else b[0]
    wm = play("PI-WM", w1, w2); lm = w2 if wm == w1 else w1
    em = play("PI-EM", l1, l2)
    lf = play("PI-LF", lm, em)
    return play("PI-GF", wm, lf)


# ---------------- Swiss ----------------
def r1_draw(piw, rng):
    reg = lambda t: R.REGION[t]
    t1, t4 = TIERS[1][:], [piw if t == "PIW" else t for t in TIERS[4]]
    t2, t3 = TIERS[2][:], TIERS[3][:]
    for _ in range(10000):
        rng.shuffle(t4); rng.shuffle(t3)
        if all(reg(a) != reg(b) for a, b in zip(t1, t4)) and all(reg(a) != reg(b) for a, b in zip(t2, t3)):
            return list(zip(t1, t4)) + list(zip(t2, t3))
    raise RuntimeError("no legal R1 draw")


def pair_pool(pool, played, rng):
    for _ in range(2000):
        rng.shuffle(pool)
        pairs = [(pool[i], pool[i + 1]) for i in range(0, len(pool), 2)]
        if all(frozenset(p) not in played for p in pairs):
            return pairs
    return [(pool[i], pool[i + 1]) for i in range(0, len(pool), 2)]  # fallback (rare)


def parse_r1(text):
    """'GEN-CFO,AL-DK,...' -> [(a, b), ...]; PIW stands for the Play-In winner."""
    pairs = []
    for part in text.split(","):
        a, b = part.strip().split("-")
        pairs.append((a.strip().upper(), b.strip().upper()))
    assert len(pairs) == 8, "round 1 needs 8 pairs"
    return pairs


def load_known(path):
    """Known facts from data/results_live.json (rows with a winner).
    Returns dict(piw, swiss_pairs {round: [(a,b)]}, swiss_win {frozenset: winner}, qf [(a,b)] or None,
    ko_win {frozenset: winner}). Swiss round comes from the row's 'round' field, else from the id SW-R<n>-."""
    rows = json.load(open(path)) if path and os.path.exists(path) else []
    piw = None; playin = {}; swiss_pairs = defaultdict(list); swiss_win = {}; qf = []; ko_win = {}
    for r in rows:
        if r.get("kind", "series") != "series":
            continue
        a, b, w = r.get("team_a"), r.get("team_b"), r.get("winner")
        if r.get("phase") == "Play-In":
            if w and r.get("id"):
                playin[r["id"]] = w
            if r.get("id") == "PI-GF" and w:
                piw = w
        elif r.get("phase") == "Swiss" and a and b:
            rnd = r.get("round")
            if rnd is None and str(r.get("id", "")).startswith("SW-R"):
                rnd = int(str(r["id"]).split("-")[1][1:])
            if rnd:
                swiss_pairs[int(rnd)].append((a, b))
            if w:
                swiss_win[frozenset((a, b))] = w
        elif r.get("phase") == "Knockouts" and a and b:
            if "QF" in str(r.get("id", "")) or "quarter" in str(r.get("stage", "")).lower():
                qf.append((a, b))
            if w:
                ko_win[frozenset((a, b))] = w
    if piw is None:   # the Swiss draw comes after the Play-In final, so a Play-In team in round 1 is the winner
        pi_teams = {t for r in rows if r.get("phase") == "Play-In" for t in (r.get("team_a"), r.get("team_b"))}
        piw = next((t for pr in swiss_pairs.get(1, []) for t in pr if t in pi_teams), None)
    return dict(piw=piw, playin=playin, swiss_pairs=dict(swiss_pairs), swiss_win=swiss_win, qf=qf if len(qf) == 4 else None, ko_win=ko_win)


def swiss_sample(st, piw, rng, r1=None, known=None):
    """One Swiss stage. r1: fixed round-1 pairs (PIW allowed). known: load_known() output; its pairings are
    used for the rounds they cover and its winners are taken as fact, everything else is simulated."""
    rec = {t: [0, 0] for t in sum((TIERS[k] for k in (1, 2, 3)), []) + [t if t != "PIW" else piw for t in TIERS[4]]}
    played = set()
    kp = (known or {}).get("swiss_pairs", {}); kw = (known or {}).get("swiss_win", {})
    fix = lambda pr: [(piw if a == "PIW" else a, piw if b == "PIW" else b) for a, b in pr]
    pairs = fix(r1 or kp.get(1) or r1_draw(piw, rng))   # the full published draw beats a partly played round 1
    if len(pairs) < 8:   # ponytail: round 1 only partly known and no --r1: the rest are paired at random, ignoring tiers and regions
        left = [t for t in rec if t not in {x for p in pairs for x in p}]
        rng.shuffle(left)
        pairs += [(left[i], left[i + 1]) for i in range(0, len(left), 2)]
    rnd = 1
    while True:
        for a, b in pairs:
            decisive = rec[a][0] == 2 or rec[a][1] == 2 or rec[b][0] == 2 or rec[b][1] == 2
            w = kw.get(frozenset((a, b))) or st.play(a, b, 3 if decisive else 1, rng)
            l = b if w == a else a
            rec[w][0] += 1; rec[l][1] += 1
            played.add(frozenset((a, b)))
        rnd += 1
        alive = [t for t, (w, l) in rec.items() if w < 3 and l < 3]
        if not alive:
            break
        if kp.get(rnd):
            pairs = fix(kp[rnd])
            # teams alive but not in the known draw (round partly published) are paired at random among themselves
            left = [t for t in alive if t not in {x for pr in pairs for x in pr}]
            pools = defaultdict(list)
            for t in left:
                pools[tuple(rec[t])].append(t)
            for k in sorted(pools):
                pairs += pair_pool(pools[k], played, rng)
            continue
        pools = defaultdict(list)
        for t in alive:
            pools[tuple(rec[t])].append(t)
        pairs = []
        for k in sorted(pools):
            pairs += pair_pool(pools[k], played, rng)
    return {t: f"{w}-{l}" for t, (w, l) in rec.items()}


# ---------------- Knockouts ----------------
def ko_draw(records, rng):
    r30 = [t for t, r in records.items() if r == "3-0"]
    r31 = [t for t, r in records.items() if r == "3-1"]
    r32 = [t for t, r in records.items() if r == "3-2"]
    rng.shuffle(r30); rng.shuffle(r32)
    qf_a = (r30[0], r32[0]); qf_c = (r30[1], r32[1])
    rest = r31 + r32[2:]
    rng.shuffle(rest)
    qf_b, qf_d = (rest[0], rest[1]), (rest[2], rest[3])
    return [qf_a, qf_b, qf_c, qf_d]     # SF1 = W(a) v W(b), SF2 = W(c) v W(d)


def ko_sample(st, qfs, rng, kw=None):
    kw = kw or {}
    play = lambda a, b: kw.get(frozenset((a, b))) or st.play(a, b, 5, rng)
    w = [play(a, b) for a, b in qfs]
    s1 = play(w[0], w[1]); s2 = play(w[2], w[3])
    return w, (s1, s2), play(s1, s2)


def run(n_sims=100000, seed=2026, piw_fixed=None, r1_fixed=None, known=None):
    known = known or {}
    piw_fixed = piw_fixed or known.get("piw")
    res, model = R.build()
    st = SeriesTable(model)
    rng = random.Random(seed)
    pi_exact = playin_exact(st)
    rec_ct = defaultdict(Counter)
    piw_ct = Counter()
    adv = Counter(); qf = Counter(); sf = Counter(); fin = Counter(); champ = Counter()
    cond_rec = defaultdict(lambda: defaultdict(Counter))   # piw -> team -> record
    n_regions_ko = Counter(); lcs_ko = 0; hle_t1 = Counter()
    PLACE = {"0-3": 0, "1-3": 1, "2-3": 2, "QF": 3, "SF": 4, "F": 5, "W": 6}
    for _ in range(n_sims):
        piw = piw_fixed or playin_sample(st, rng, known.get("playin"))
        piw_ct[piw] += 1
        recs = swiss_sample(st, piw, rng, r1_fixed, known)
        for t, r in recs.items():
            rec_ct[t][r] += 1
            cond_rec[piw][t][r] += 1
            if r in ("3-0", "3-1", "3-2"):
                adv[t] += 1
        qfs = known.get("qf") or ko_draw(recs, rng)
        w, s, c = ko_sample(st, qfs, rng, known.get("ko_win"))
        for t in w: sf[t] += 1
        for t in s: fin[t] += 1
        champ[c] += 1
        ko_teams = [t for q in qfs for t in q]
        n_regions_ko[len({R.REGION[t] for t in ko_teams})] += 1
        lcs_ko += any(R.REGION[t] == "LCS" for t in ko_teams)
        def place(t):
            if t == c: return 6
            if t in s: return 5
            if t in w: return 4
            if t in ko_teams: return 3
            return PLACE[recs[t]]
        pt, ph = place("T1"), place("HLE")
        hle_t1["T1" if pt > ph else "HLE" if ph > pt else "tie"] += 1
    N = n_sims
    teams = sorted(rec_ct, key=lambda t: -champ[t])
    out = dict(
        as_of=res["as_of"], sims=N, seed=seed, playin_winner_fixed=piw_fixed,
        r1_fixed=[list(p) for p in r1_fixed] if r1_fixed else None,
        known_results=dict(swiss_series=len(known.get("swiss_win", {})), swiss_rounds_drawn=sorted(known.get("swiss_pairs", {})),
                           qf_fixed=bool(known.get("qf")), ko_series=len(known.get("ko_win", {}))),
        playin_exact={k: round(v, 4) for k, v in sorted(pi_exact.items(), key=lambda x: -x[1])},
        teams={t: dict(
            p_playin_win=round(piw_ct[t] / N, 4) if t in PLAYIN else None,
            swiss={r: round(rec_ct[t][r] / N, 4) for r in RECORDS},
            p_advance=round(adv[t] / N, 4), p_semis=round(sf[t] / N, 4),
            p_final=round(fin[t] / N, 4), p_champion=round(champ[t] / N, 4)) for t in teams},
        crystal_ball=dict(
            n_regions_in_ko={k: round(v / N, 4) for k, v in sorted(n_regions_ko.items())},
            p_lcs_team_in_ko=round(lcs_ko / N, 4),
            t1_vs_hle_place={k: round(v / N, 4) for k, v in hle_t1.items()}),
        swiss_conditional={piw: {t: {r: round(c[r] / max(1, piw_ct[piw]), 4) for r in RECORDS}
                                 for t, c in d.items()} for piw, d in cond_rec.items()},
    )
    return out, res, model, st


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=100000)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--playin-winner", default=None)
    ap.add_argument("--out", default="data/sim_baseline.json")
    ap.add_argument("--r1", default=None, help='round-1 draw, e.g. "GEN-CFO,AL-DK,...,G2-PIW"')
    ap.add_argument("--results", default=None, help="data/results_live.json: fix the Play-In winner and every finished Swiss/KO series")
    a = ap.parse_args()
    known = load_known(a.results) if a.results else None
    out, res, model, st = run(a.sims, a.seed, a.playin_winner, parse_r1(a.r1) if a.r1 else None, known)
    json.dump(out, open(a.out, "w"), indent=1)
    print("Play-In exact:", out["playin_exact"])
    print(f"{'team':<6} {'adv':>6} {'SF':>6} {'F':>6} {'win':>6}  " + " ".join(f"{r:>6}" for r in RECORDS))
    print(out["crystal_ball"])
    for t, d in out["teams"].items():
        print(f"{t:<6} {d['p_advance']:>6.3f} {d['p_semis']:>6.3f} {d['p_final']:>6.3f} {d['p_champion']:>6.3f}  " +
              " ".join(f"{d['swiss'][r]:>6.3f}" for r in RECORDS))
