#!/usr/bin/env python3
"""Flatten model outputs into row-JSON files for the dashboard (data/dash/*.json)."""
import json, os, re, glob, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
os.makedirs("data/dash", exist_ok=True)
import sys as _sys, math as _math
_sys.path.insert(0, os.path.join(ROOT, "model"))
import ratings_v4 as _R, golgg_games as _GG, pools as _PL  # noqa: E402
J = lambda p: json.load(open(p))
teams = {t["code"]: t for t in J("data/teams.json")}
rat = J("data/ratings.json")
sim = J("data/sim_baseline.json")
base = J("data/predictions_baseline.json")
staged = {os.path.basename(p)[12:-5]: J(p) for p in sorted(glob.glob("data/predictions_*.json")) if "baseline" not in p}
adj = {a["code"]: a for a in J("data/adjustments.json")}


def w(name, rows):
    json.dump(rows, open(f"data/dash/{name}.json", "w"), indent=0, ensure_ascii=False)
    print(name, len(rows), os.path.getsize(f"data/dash/{name}.json"))


# ratings
rows = []
for r in rat["teams"]:
    t = teams[r["code"]]; s = sim["teams"][r["code"]]
    rows.append(dict(rank=r["rank"], code=r["code"], name=t["name"], region=r["region"], seed=t.get("seed"),
                     tier=r["tier"], elo=r["elo"], elo_base=r["elo_base"], sd=r["sd"], p_vs_avg=r["p_vs_avg"],
                     adj_logit=(adj.get(r["code"]) or {}).get("delta_logit", 0.0),
                     adj_reason=(adj.get(r["code"]) or {}).get("reason", ""),
                     adj_source=(adj.get(r["code"]) or {}).get("source", ""),
                     p_playin=s.get("p_playin_win"), p_advance=s["p_advance"], p_semis=s["p_semis"],
                     p_final=s["p_final"], p_champion=s["p_champion"],
                     trend=(t.get("form_6w") or {}).get("trend"), headline=t.get("headline")))
w("ratings", rows)

# dossiers
def split_identity(s):
    s = s or ""
    m = re.split(r"(?i)\b(?:loses|how they lose)\b[:\s]*", s, maxsplit=1)
    wins = re.sub(r"(?i)^(wins|how they win)[:\s]*", "", m[0]).strip(" -;.")
    return wins, (m[1].strip() if len(m) > 1 else "")


_intl = J("data/results_2026.json")
def intl_from_results(code):
    """Fallback when a dossier has no international summary: list the team's 2026 series by event."""
    by = {}
    for r in _intl:
        if r.get("event_group") == "supplementary" or code not in (r["team_a"], r["team_b"]):
            continue
        me_a = r["team_a"] == code
        opp = r["team_b"] if me_a else r["team_a"]
        ws, ls = (r["score_a"], r["score_b"]) if me_a else (r["score_b"], r["score_a"])
        by.setdefault(r["event"], []).append(f"{'W' if ws > ls else 'L'} {ws}-{ls} {opp} ({r['stage']})")
    return " | ".join(f"{ev}: " + ", ".join(v) for ev, v in by.items())

CHAMP_FIX = {"KSante": "K'Sante", "Kaisa": "Kai'Sa", "Chogath": "Cho'Gath", "Khazix": "Kha'Zix", "Velkoz": "Vel'Koz", "Belveth": "Bel'Veth", "Reksai": "Rek'Sai", "Leblanc": "LeBlanc", "MonkeyKing": "Wukong", "JarvanIV": "Jarvan IV", "LeeSin": "Lee Sin", "TahmKench": "Tahm Kench", "TwistedFate": "Twisted Fate", "XinZhao": "Xin Zhao", "MissFortune": "Miss Fortune", "RenataGlasc": "Renata Glasc"}

GG_PLAYERS = json.load(open("data/golgg_players_2026.json")) if os.path.exists("data/golgg_players_2026.json") else {"teams": {}, "source": {}}
GG_SUMMER = json.load(open("data/golgg_players_summer_2026.json")) if os.path.exists("data/golgg_players_summer_2026.json") else {"teams": {}, "source": {}}
GG_TEAMS = json.load(open("data/golgg_teams_2026.json")) if os.path.exists("data/golgg_teams_2026.json") else {"teams": {}, "source": {}}
PATCH_STATE = json.load(open("data/patch_state.json")) if os.path.exists("data/patch_state.json") else {"patches": [], "champion_state": {}}
RULES = json.load(open("data/rules_2026.json")) if os.path.exists("data/rules_2026.json") else {}
ACC = GG_PLAYERS.get("source", {}).get("accessed", "15/10/2026")


def cfix(n):
    return CHAMP_FIX.get(n, n)


def sig_rows(players, recency=False):
    out = []
    for p in players:
        out.append(dict(role=p["role"], player=p["player"], games=p.get("games"), kda=p.get("kda"), gd15=p.get("gd15"), kp=p.get("kp"),
                        dmg_pct=p.get("dmg_pct"), n_champs=p.get("n_champs"),
                        season_games=p.get("season_games"), split_share=p.get("split_share"),
                        champs=[dict(champ=cfix(c["champ"]), games=c["games"], wr=c["wr"], kda=c.get("kda")) for c in (p.get("champs") or [])[:5]]))
    return out


def team_block(code, split):
    t = (GG_TEAMS.get("teams", {}).get(code) or {}).get("splits", {}).get(split)
    if not t:
        return None
    d = t.get("draft") or {}; st = t.get("stats") or {}; side = t.get("side") or {}
    return dict(split=split, games=t.get("games"), record=t.get("record"), wr=t.get("wr"), avg_game_min=t.get("avg_game_min"),
                blue_games=side.get("blue", {}).get("games"), blue_wr=side.get("blue", {}).get("wr"),
                red_games=side.get("red", {}).get("games"), red_wr=side.get("red", {}).get("wr"),
                gd15=st.get("gd15"), wr_ahead15=st.get("wr_when_ahead_15_pct"), fb_pct=st.get("first_blood_pct"), ft_pct=st.get("first_tower_pct"),
                drag_share=st.get("dragon_share_pct"), baron_share=st.get("baron_share_pct"), herald_share=st.get("herald_share_pct"),
                kills_pg=st.get("kills_pg"), deaths_pg=st.get("deaths_pg"), gpm=st.get("gpm"), gdm=st.get("gdm"), dpm=st.get("dpm"), vspm=st.get("vspm"),
                role_priority=d.get("role_priority"),
                picks=[dict(champ=cfix(x["champ"]), games=x["games"], wr=x["wr"], avg_pick_no=x.get("avg_pick_no"), n_first_pick=x.get("n_first_pick")) for x in (d.get("picks") or [])[:8]],
                bans_by=[dict(champ=cfix(x["champ"]), n=x["n"], rate=x["rate"], n_first_ban=x.get("n_first_ban")) for x in (d.get("bans_by") or [])[:6]],
                bans_against=[dict(champ=cfix(x["champ"]), n=x["n"], rate=x["rate"]) for x in (d.get("bans_against") or [])[:6]],
                first_picks=[dict(champ=cfix(x["champ"]), n=x.get("n_first_pick")) for x in sorted((d.get("picks") or []), key=lambda x: -(x.get("n_first_pick") or 0))[:3] if x.get("n_first_pick")],
                source=(t.get("urls") or {}).get("stats"))


def player_flags(code):
    flags = []
    for p in GG_SUMMER.get("teams", {}).get(code, []):
        if not p.get("found"):
            continue
        if (p.get("games") or 0) == 0:
            flags.append(f"{p['player']} ({p['role']}) has no 2026 games since the {p.get('last_split_with_games', 'earlier')} split ({p.get('last_split_games')} games then): form data is stale.")
        elif (p.get("split_share") or 1) < 0.25 and (p.get("season_games") or 0) >= 40:
            flags.append(f"{p['player']} ({p['role']}) played only {p['games']} of the team's recent split (of {p['season_games']} games this year).")
    return flags

rows = []
for code, t in teams.items():
    wins, loses = split_identity(t.get("identity"))
    ts, ti = t.get("team_stats") or {}, t.get("team_stats_intl") or {}
    rows.append(dict(
        code=code, name=t["name"], region=t["region"], seed=t.get("seed"),
        stage_start="Play-In" if code in ("KC", "C9", "FURIA", "MVK") else "Swiss",
        headline=t.get("headline"),
        roster=" / ".join(f"{p['role']} {p['player']}" for p in t.get("roster", [])),
        coach=t.get("coach"), roster_change=t.get("roster_change_since_final"),
        domestic=" | ".join(f"{d['event']}: {d['placement']}" + (f" ({d['final']})" if d.get("final") else "") for d in t.get("domestic_2026", [])),
        international=intl_from_results(code) if not t.get("international_2026") and intl_from_results(code) else " | ".join(f"{d['event']}: {d['placement']}" + (f" ({d['final']})" if d.get("final") else "") for d in (t.get("international_2026") or [])) or "None in 2026",
        trend=(t.get("form_6w") or {}).get("trend"),
        form=" | ".join(f"{s.get('date')} {s.get('opp')} {s.get('score')}" for s in (t.get("form_6w") or {}).get("series", [])),
        stats_sample=ts.get("sample"), games=ts.get("games"), wr=ts.get("wr"), gd15=ts.get("gd15"),
        fb_pct=ts.get("fb_pct"), ft_pct=ts.get("ft_pct"), drag_pct=ts.get("drag_pct"), baron_pct=ts.get("baron_pct"),
        wr_ahead15=ts.get("wr_ahead15"), avg_len_min=ts.get("avg_len_min"),
        intl_sample=ti.get("sample"), intl_games=ti.get("games"), intl_wr=ti.get("wr"),
        players=" | ".join(f"{p['role']} {p['player']}: KDA {p.get('kda') if p.get('kda') is not None else 'UNKNOWN'}, GD@15 {p.get('gd15') if p.get('gd15') is not None else 'UNKNOWN'}, KP {p.get('kp') if p.get('kp') is not None else 'UNKNOWN'}%" for p in t.get("players", [])),
        strengths=wins, weaknesses=loses, draft=t.get("draft"),
        players_sample=(f"2026 season, all tournaments incl. regular season, playoffs and internationals (gol.gg, accessed {GG_PLAYERS['source']['accessed']}); champion pools show the five most-played with games and win rate"
                        if code in GG_PLAYERS["teams"] else ts.get("sample")),
        signature=([dict(role=p["role"], player=p["player"], games=p.get("games"), kda=p.get("kda"), gd15=p.get("gd15"), kp=p.get("kp"), n_champs=p.get("n_champs"),
                         champs=[dict(champ=CHAMP_FIX.get(c["champ"], c["champ"]), games=c["games"], wr=c["wr"], kda=c.get("kda")) for c in (p.get("champs") or [])[:5]])
                    for p in GG_PLAYERS["teams"][code]] if code in GG_PLAYERS["teams"] else
                   [dict(role=p["role"], player=p["player"], kda=p.get("kda"), gd15=p.get("gd15"), kp=p.get("kp"), champs=[dict(champ=CHAMP_FIX.get(c.get("champ"), c.get("champ")), w=c.get("w"), l=c.get("l")) for c in (p.get("top3") or []) if c.get("champ")]) for p in t.get("players", [])]),
        signature_summer=sig_rows(GG_SUMMER["teams"].get(code, [])) if code in GG_SUMMER.get("teams", {}) else None,
        summer_sample=f"Summer split on gol.gg (final regular split + playoffs of each league; accessed {ACC})" if code in GG_SUMMER.get("teams", {}) else None,
        team_season=team_block(code, "ALL"), team_summer=team_block(code, "Summer"),
        flags=player_flags(code) + ([f"Roster note: {t.get('roster_change_since_final')}"] if t.get("roster_change_since_final") and t.get("roster_change_since_final") != "none" else []),
        sources=" ".join(s["url"] for s in t.get("sources", [])[:8]),
        dossier=f"worlds2026/research/teams/{code}.md"))
_depths = _PL.depths(_GG.load_games())
for _d in rows:
    _d["report"] = dict(who=_d.get("headline") or "UNKNOWN", wins_by=_d.get("strengths") or "UNKNOWN",
                        loses_to=_d.get("weaknesses") or "UNKNOWN", draft=_d.get("draft") or "UNKNOWN")
    _d["pool_depth"] = float(_depths.get(_d["code"], 0.0))
w("dossiers", rows)

# champion patch state (26.18-26.20) for chip flags
w("patch_state", [dict(name=n, kind="champion", direction=v["direction"], patch=v["latest_patch"], summary=v["summary"],
                       history=" | ".join(f"{h['patch']} {h['direction']}: {h['summary']}" for h in v.get("history", [])))
                  for n, v in sorted(PATCH_STATE.get("champion_state", {}).items())])

# meta champions (parse the presence table in meta.md)
meta = open("research/meta.md").read()
rows = []
for line in meta.splitlines():
    m = re.match(r"\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.]+)%\s*\|\s*([\d.]+)%[^|]*\|\s*([\d.]+)%\s*\|\s*([\d.]+)%", line)
    if m:
        rows.append(dict(rank=int(m[1]), champion=m[2], roles=m[3], picks=int(m[4]), bans=int(m[5]),
                         presence=float(m[6]), pick_wr=float(m[7]), presence_ex_lcp=float(m[8]), msi_presence=float(m[9])))
patch = {"Cassiopeia": "Nerfed 26.20", "Lucian": "Buffed 26.20", "Vi": "Nerfed 26.19", "Nocturne": "Nerfed 26.19",
         "Poppy": "Nerfed 26.19", "Ashe": "Nerfed 26.20"}
for r in rows:
    r["patch_note"] = patch.get(r["champion"], "")
w("meta_champs", rows)

fit = []
sec = meta.split("**Teams/players noted as suiting or hurt by it", 1)[1].split("## 4.", 1)[0]
for line in sec.splitlines():
    c = [x.strip() for x in line.strip().strip("|").split("|")]
    if len(c) == 3 and not c[0].startswith("---") and c[0] != "Team / player":
        fit.append(dict(subject=c[0], note=c[1], source=c[2]))
w("meta_fit", fit)


# patch 26.20 changes (from research/meta.md, official notes)
PATCH = [
 ("champion", "Ambessa", "nerf", "Passive damage 5-30 (+25% bonus AD) → 5-25 (+20% bonus AD)"),
 ("champion", "Ashe", "nerf", "AD per level 3.5 → 3"),
 ("champion", "Cassiopeia", "nerf", "Base health 630 → 610; base mana 480 → 450"),
 ("champion", "K'Sante", "nerf", "W mana cost 40-60 → 45-65; W damage reduction 30/75% → 25/70%"),
 ("champion", "Yunara", "nerf", "Q on-hit damage 5-25 → 3-23 (+20% AP); W slow no longer stacks with other slows"),
 ("champion", "Diana", "buff", "W shield bonus health ratio 11% → 14%"),
 ("champion", "Kennen", "buff", "E bonus attack speed 40-80% → 50-90%"),
 ("champion", "Kindred", "buff", "W monster damage 150% → 165%; E slow 1s → 1.5s (no longer targets small monsters)"),
 ("champion", "Lillia", "buff", "R sleep 2.5s → 2.5/2.75/3s"),
 ("champion", "Lucian", "buff", "AD per level 2.5 → 2.9"),
 ("champion", "Mordekaiser", "buff", "Q level scaling +5 → +7 per level; R cooldown 140/120/100s → 120/110/100s"),
 ("champion", "Neeko", "buff", "E damage 70-210 → 80-220 (+65% AP); empowered root 1.8-3s → 2-3s"),
 ("champion", "Smolder", "buff", "Passive Super Scorcher bonus magic damage 25-55% → 25-60%; R self-heal 100/135/170 (+50% bonus AD) → 100/175/250 (+75% bonus AD)"),
 ("champion", "Swain", "buff", "W damage 70-210 → 70-250, cooldown 22-18s → 20-16s; base MR 31 → 34 (base armour 25 → 23)"),
 ("champion", "Tahm Kench", "buff", "Q base healing 10-25 → 10-50"),
 ("champion", "Vayne", "buff", "Q mana cost 46-30 → 30 at all ranks; health regen 4 (+0.5/level) → 5.5 (+0.4/level) per 5s"),
 ("item", "Hextech Rocketbelt", "rework", "Ability haste 20 → 10; active damage 100 (+10% AP) → 135 (+15% AP): an all-in tool rather than an escape"),
 ("item", "Runaan's Hurricane", "nerf", "Bolt damage 65% → 60% of AD"),
 ("item", "Experimental Hexplate", "nerf", "Ranged users get 50% of the stats, down from 70% (25% attack speed, 10% move speed)"),
]
if PATCH_STATE.get("patches"):
    pc = []
    for pt in PATCH_STATE["patches"]:
        for c in pt["changes"]:
            if c["kind"] == "system" and "scoreboard" in c["summary"].lower():
                continue   # UI only
            pc.append(dict(kind=c["kind"], name=c["name"], change=("rework" if c["name"] == "Hextech Rocketbelt" else c["direction"]), detail=re.sub(r"(?<=[\d%s)]) to (?=[\d(])", " → ", c["summary"]),
                           patch=pt["patch"], date=pt.get("date"), label=c.get("label_source"), source=pt["url"]))
    w("patch_changes", pc)
else:
    w("patch_changes", [dict(kind=k, name=n, change=c, detail=d, patch="26.20", source="https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/") for k, n, c, d in PATCH])

# series (baseline + staged)

def score_call(s):
    """Plain-English note tying the predicted score to the series odds (checklist: a sweep
    called in a coin-flip series must be explained)."""
    w = s["winner"]; l = s["team_b"] if w == s["team_a"] else s["team_a"]
    need = s["bo"] // 2 + 1
    ex = s["exact"]
    wk = (lambda k: k) if w == s["team_a"] else (lambda k: "-".join(reversed(k.split("-"))))
    wins = [(f"{need}-{k}", ex[wk(f"{need}-{k}")]) for k in range(need)]
    best = max(wins, key=lambda x: x[1])
    spread = ", ".join(f"{sc} {p:.0%}" for sc, p in wins)
    txt = (f"{w} {best[0]} is the single most likely of the {2 * need} possible scores ({best[1]:.0%}). "
           f"{w} win by any score {s['p_winner']:.0%} ({spread}); {l} win {1 - s['p_winner']:.0%}.")
    if s["tier"] == "COIN FLIP":
        txt += (f" The tier rates who wins, and that is close to even; the score is a separate call.")
    if best[0].startswith("3-0") or best[0].startswith("2-0"):
        txt += (f" A sweep is the likeliest single score (2026 Bo5s ended 3-0 45% of the time, international ones 66%),"
                f" but across the whole bracket the model expects most series not to be sweeps; see the expected mix on the bracket card.")
    return txt

def winner_split(s):
    """P(3-0), P(3-1), P(3-2) (or 2-0, 2-1 for a Bo3) for the predicted winner."""
    need = s["bo"] // 2 + 1
    wk = (lambda k: k) if s["winner"] == s["team_a"] else (lambda k: "-".join(reversed(k.split("-"))))
    out = {f"pw{need}{k}": round(s["exact"][wk(f"{need}-{k}")], 4) for k in range(need)}
    out["p_upset"] = round(1 - s["p_winner"], 4)
    return out


def flat_series(set_name, P, created):
    out = []
    groups = [("Play-In", P["playin"]["series"])]
    if P.get("swiss", {}).get("series"):
        groups += [("Swiss", P["swiss"]["series"])]
    if P.get("knockouts"):
        groups += [("Knockouts", P["knockouts"]["qf"] + P["knockouts"]["sf"] + [P["knockouts"]["final"]])]
    for g, ss in groups:
        for s in ss:
            if s.get("actual"):
                # a series already played when this run was made: carried for the bracket, not a prediction (the Scorecard skips it)
                out.append(dict(set=set_name, created_nz=created, id=s["id"], phase=g, stage=s["stage"], team_a=s["team_a"], team_b=s["team_b"],
                                bo=s["bo"], winner=s["winner"], loser=s["team_b"] if s["winner"] == s["team_a"] else s["team_a"], score=s["score"],
                                p_score=None, score_note="", p_winner=None, p_series_a=None, p_game_a=None, tier="ACTUAL", actual=True, exact="",
                                time_nz=(s.get("time") or {}).get("nz") or "", time_venue=(s.get("time") or {}).get("venue") or "",
                                key_matchup="", draft_angle="", form_context="", what_flips="", note=s.get("note") or "", sources=""))
                continue
            out.append(dict(set=set_name, created_nz=created, id=s["id"], phase=g, stage=s["stage"],
                            team_a=s["team_a"], team_b=s["team_b"], bo=s["bo"], winner=s["winner"],
                            loser=s["team_b"] if s["winner"] == s["team_a"] else s["team_a"],
                            score=s["score"], p_score=s.get("p_score"), score_note=score_call(s), **winner_split(s), p_winner=s["p_winner"], p_series_a=s["p_series_a"],
                            p_game_a=s["p_game_a"], tier=s["tier"],
                            exact=" ".join(f"{k}:{v:.1%}" for k, v in s["exact"].items()),
                            time_nz=(s.get("time") or {}).get("nz") or "", time_venue=(s.get("time") or {}).get("venue") or "",
                            key_matchup=s.get("key_matchup", ""), draft_angle=s.get("draft_angle", ""),
                            form_context=s.get("form_context", ""), what_flips=s.get("what_flips", ""),
                            note=s.get("note") or "",
                            sources=" ".join(l["url"] for l in s["sources"]["links"][:6])))
    return out

rows = flat_series("baseline", base, base["created_nz"])
for k, P in staged.items():
    rows += flat_series(k, P, P["created_nz"])
    # conditional Play-In pairings, for grading any pairing that happens
    for key, s in P["playin"]["all_pairings"].items():
        rows.append(dict(set=k + "_conditional", created_nz=P["created_nz"], id="PI-ANY-" + key, phase="Play-In",
                         stage="Any Play-In Bo5 between these teams", team_a=s["team_a"], team_b=s["team_b"], bo=5,
                         winner=s["winner"], loser=s["team_b"] if s["winner"] == s["team_a"] else s["team_a"],
                         score=s["score"], p_winner=s["p_winner"], p_series_a=s["p_series_a"], p_game_a=s["p_game_a"],
                         tier=s["tier"], exact=" ".join(f"{kk}:{v:.1%}" for kk, v in s["exact"].items()), **winner_split(s),
                         time_nz="", time_venue="", key_matchup="", draft_angle="", form_context="", what_flips="",
                         note="Conditional prediction for whichever Play-In round this pairing happens in.", sources=""))
w("series", rows)

# swiss
rows = []
for set_name, P in [("baseline", base)] + list(staged.items()):
    if not P.get("swiss"):
        continue
    for x in P["swiss"]["predicted"]:
        d = x["dist"]
        rows.append(dict(set=set_name, team=x["team"], predicted_record=x["predicted_record"], p_record=x["p_record"],
                         p_advance=x["p_advance"], p30=d["3-0"], p31=d["3-1"], p32=d["3-2"], p23=d["2-3"], p13=d["1-3"], p03=d["0-3"],
                         qualifies=x["predicted_record"] in ("3-0", "3-1", "3-2")))
w("swiss", rows)

# pick'ems
rows = []
# Each stage's picks come from the run made for that stage: Play-In from pickems_playin.json (locked 16/10), Swiss from
# pickems_swiss.json once the staged Swiss run exists, else the preliminary Swiss block of the Play-In run. Every
# pickems_<stage>.json carries both blocks, so reading them all would list each pick twice.
PK = {s: J(f"data/pickems_{s}.json") for s in ("playin", "swiss") if os.path.exists(f"data/pickems_{s}.json")}
if PK.get("playin"):
    P = PK["playin"]
    slot_ids = {"R1: KC vs C9": "PI-R1-A", "R1: FURIA vs MVK": "PI-R1-B", "Winners' match": "PI-WM",
                "Elimination match": "PI-EM", "Lower final": "PI-LF", "Final (Play-In winner)": "PI-GF"}
    for i, k in enumerate(P["playin"]["picks"]):
        rows.append(dict(stage="Play-In", order=i + 1, slot=k["slot"], slot_id=slot_ids[k["slot"]], pick=k["pick"],
                         p_correct=k["p_correct"], ev_points=k["ev_points"],
                         points=10 if "Final" in k["slot"] else 5,
                         alternatives=", ".join(f"{t} {v:.0%}" for t, v in k["alternatives"].items()),
                         status="FINAL - lock 16/10/2026 07:00 NZDT"))
P = PK.get("swiss") or PK.get("playin")
if P:
    sp = P["swiss_preliminary"]
    swiss_run = P is PK.get("swiss")
    order = 1
    for cat, teams_ in sp["picks"].items():
        rank = {"3-0": sp["rank_3_0"], "0-3": sp["rank_0_3"]}.get(cat, sp["rank_3_1_or_3_2"])
        pm = dict((t, v) for t, v in rank)
        for tm in teams_:
            rows.append(dict(stage="Swiss", order=order, slot={"3-0": "3-0", "0-3": "0-3"}.get(cat, "Advance (3-1 or 3-2)"), slot_id="SW-" + cat, pick=tm, p_correct=pm.get(tm),
                             ev_points=None, points=None,
                             alternatives=", ".join(f"{t} {v:.0%}" for t, v in rank[:5]),
                             status=("SWISS RUN - after the round 1 draw, lock 24/10/2026 06:00 NZDT" if swiss_run
                                     else "PRELIMINARY - re-run after the 18/10 draw, lock 24/10/2026 06:00 NZDT")))
            order += 1
w("pickems", rows)

# crystal ball (display copy: the long wards.lol citation is shortened; the full one is in the card footer and the frozen baseline)
_W = "wards.lol 2026 stats for the 19 Worlds teams, 1,590 games (https://wards.lol/lol-esports/pick-ems/2026/worlds/, accessed 15/10/2026)"
w("crystal", [dict(c, reason=c["reason"].replace(_W, "wards.lol")) for c in base["crystal_ball"]])

# overview (key/value)
def _next_lock():
    """The next Pick'Ems lock still ahead at export time (the bot exports at least once per NZDT day); '' once both passed.
    Lock times from research/format.md (Riot primer, accessed 15/10/2026). The site reads this for Home's Pick'Ems panel
    and the stage in play (site/src/lib/nav.ts)."""
    nz = dt.timezone(dt.timedelta(hours=13))
    now = dt.datetime.now(nz)
    locks = [("Swiss Pick'Ems lock 24/10/2026 06:00 NZDT (draw 18/10)", dt.datetime(2026, 10, 24, 6, 0, tzinfo=nz)),
             ("Knockouts Pick'Ems lock 04/11/2026 11:00 NZDT (draw 31/10)", dt.datetime(2026, 11, 4, 11, 0, tzinfo=nz))]
    return next((text for text, at in locks if now < at), "")


risk = base["single_biggest_risk"]
bt4 = J("data/backtest_v4.json")["A_international"]
sha = open("data/predictions_baseline.sha256").read().split()[0]
kv = [
    ("champion", base["champion"]), ("champion_p", sim["teams"][base["champion"]]["p_champion"]),
    ("finals_mvp", base["finals_mvp"]["pick"]), ("finals_mvp_reason", base["finals_mvp"]["reason"]),
    ("playin_winner", base["playin"]["predicted_winner"]),
    ("risk_assumption", risk["assumption"]), ("risk_detection", risk["early_detection"]),
    ("baseline_created", base["created_nz"]), ("baseline_sha256", sha), ("baseline_version", "v4"),
    ("latest_staged", max(staged, key=lambda k: staged[k]["created_utc"]) if staged else ""),
    ("ratings_as_of", rat["as_of"]), ("n_series", rat["params"]["n_series"]), ("n_games", rat["params"]["n_games"]),
    ("half_life", rat["params"]["half_life_days"]), ("tau", rat["params"]["tau"]),
    ("model_version", "v4: series-level fit, full 2026 season (gol.gg), 2025 region prior"),
    ("backtest_note", "67 international series, walk-forward: log loss 0.616 (v4) vs 0.622 for 'stronger region wins 70%' and 0.693 for a coin flip"),
    ("region_gap_lck_lpl", f"+{rat['region_gaps']['LCK-LPL']['gap']:.2f} logit, sd {rat['region_gaps']['LCK-LPL']['sd']:.2f}"),
    ("w_regular", rat["params"].get("w_regular")), ("sigma_series", rat["params"].get("sigma_series")),
    ("next_lock", _next_lock()),
    ("draft_modes", "Fearless Draft (champions picked earlier in a series unavailable to both teams) in every Bo3 and Bo5: Play-In, Swiss Bo3s, knockouts. Swiss Bo1s use standard draft. Right of First Selection: holder picks side or pick order (research/rules_2026.md)"),
    ("pickems_points", "Play-In 5/5/5/5/5 + 10 for the final = 35. Swiss 10 per correct advancer (80) + 45 in record bonuses (split UNKNOWN) = 125. Knockouts 10 per QF, 20 per SF, 80 for the final = 160. Crystal Ball points per question UNKNOWN"),
    ("locks_nz", "Play-In + Crystal Ball 16/10/2026 07:00; Swiss 24/10/2026 06:00; Knockouts 04/11/2026 11:00 (all NZDT)"),
    ("exported_nz", dt.datetime.now(dt.timezone(dt.timedelta(hours=13))).strftime("%d/%m/%Y %H:%M NZDT")),
]
w("overview", [dict(key=k, value=v) for k, v in kv])

# regions
w("regions", [dict(region=g, elo=v["elo"], rating=v["rating"], sd=v["sd"]) for g, v in
              sorted(rat["regions"].items(), key=lambda x: -x[1]["rating"])])

# results (append-only file maintained by hand / by Claude as the event runs)
if not os.path.exists("data/results_live.json"):
    json.dump([], open("data/results_live.json", "w"))
w("results", J("data/results_live.json"))

# ---- head to head (2026 series between Worlds teams, plus 2025 internationals) ----
WORLDS = [r["code"] for r in rat["teams"]]
tm = J("data/team_map.json"); name2code = {n: v["code"] for n, v in tm.items()}
alias25 = {"Gen.G eSports": "GEN", "Gen.G Esports": "GEN", "Hanwha Life eSports": "HLE", "Anyone's Legend": "AL", "Team Liquid Honda": "TLAW", "FURIA Esports": "FURIA"}
def _code(n): return name2code.get(n) or alias25.get(n)
def _year(d): return int(d.split("/")[2])
h2h = []
for r in J("data/series_2026.json"):
    if r["a"] in WORLDS and r["b"] in WORLDS:
        a, b, sa, sb = (r["a"], r["b"], r["sa"], r["sb"]) if r["a"] < r["b"] else (r["b"], r["a"], r["sb"], r["sa"])
        h2h.append(dict(a=a, b=b, date=r["date"], tournament=r["tournament"], stage=r["stage"], sa=sa, sb=sb, bo=r["bo"], patch=r.get("patch"), year=_year(r["date"])))
for r in J("data/golgg_intl_2025.json"):
    ca, cb = _code(r["team_a"]), _code(r["team_b"])
    if ca in WORLDS and cb in WORLDS:
        a, b, sa, sb = (ca, cb, r["score_a"], r["score_b"]) if ca < cb else (cb, ca, r["score_b"], r["score_a"])
        h2h.append(dict(a=a, b=b, date=r["date"], tournament=r["tournament"], stage=r["stage"], sa=sa, sb=sb, bo=2 * max(sa, sb) - 1, patch=r.get("patch"), year=_year(r["date"])))
h2h.sort(key=lambda r: (r["date"][6:], r["date"][3:5], r["date"][:2]), reverse=True)
w("h2h", h2h)

# ---- matchups: every pairing at Bo1 / Bo3 / Bo5 ----
pg = J("data/matchups.json")["p_game"]
def _pser(p, bo):
    # p is the model's marginal single-game probability (shock integrated out); recover the latent logit d by
    # bisection so the series odds use the same per-series shock mixture as every other series number on the site
    lo, hi = -8.0, 8.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if _R.p_game_marginal(mid) < p else (lo, mid)
    d = (lo + hi) / 2; need = bo // 2 + 1
    return round(sum(v for k, v in _R.series_probs_mixed(d, bo).items() if int(k.split("-")[0]) == need), 4)
mu = []
for i, a in enumerate(sorted(WORLDS)):
    for b in sorted(WORLDS)[i + 1:]:
        p = pg[a][b]
        mu.append(dict(a=a, b=b, p_game=round(p, 4), p_bo3=_pser(p, 3), p_bo5=_pser(p, 5)))
w("matchups", mu)
print("h2h", len(h2h), "matchups", len(mu))
