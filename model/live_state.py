#!/usr/bin/env python3
"""Riot's live match state for Worlds 2026 (run by the bot every update): lolesports getSchedule ->
data/dash/schedule.json, one row per Worlds match from 15/10/2026 NZDT on, with Riot's state and game wins, teams as our
codes. gol.gg posts results hours after a series ends; this says within minutes that a match is live or finished.
A network or parse failure leaves the previous file untouched and exits 0 (the update run must never fail on Riot).
`--changed` prints yes/no: does the file differ from the committed one in anything but fetched_nz."""
import ast, datetime as dt, json, os, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "dash", "schedule.json")
URL = "https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-GB&leagueId=98767975604431411"   # Worlds
NZ = dt.timedelta(hours=13)                      # NZDT, the whole event runs in daylight time
FROM_NZ = dt.datetime(2026, 10, 15)

# The key and User-Agent live once, in model/fetch_art.py (importing it would run the art fetch, so read the literals)
_CONST = {t.id: ast.literal_eval(n.value) for n in ast.parse(open(os.path.join(ROOT, "model", "fetch_art.py"), encoding="utf-8").read()).body
          if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name) and t.id in ("LOLESPORTS_KEY", "UA")}
HEADERS = {**_CONST["UA"], "x-api-key": _CONST["LOLESPORTS_KEY"]}

ALIAS = {"FUR": "FURIA", "TL": "TLAW"}           # Riot code -> our code where they differ
_alnum = lambda s: "".join(c for c in str(s).lower() if c.isalnum())
_MAP = json.load(open(os.path.join(ROOT, "data", "team_map.json"), encoding="utf-8"))
NAMES = {_alnum(n): v["code"] for n, v in _MAP.items()}
CODES = {v["code"] for v in _MAP.values()}


def code(team, unknown):
    c, n = team.get("code") or "TBD", team.get("name") or ""
    if c == "TBD":
        return c
    ours = ALIAS.get(c) or NAMES.get(_alnum(n)) or (c if c in CODES else None)
    if not ours:
        unknown.add(f"{c} ({n})")
    return ours or c


def parse(events, fetched_nz, unknown=None):
    """getSchedule events -> schedule rows (Worlds matches from 15/10/2026 NZDT, sorted by start)."""
    unknown = set() if unknown is None else unknown
    rows = {}
    for e in events:
        m = e.get("match") or {}
        if e.get("type") != "match" or len(m.get("teams") or []) != 2:
            continue
        utc = dt.datetime.strptime(e["startTime"], "%Y-%m-%dT%H:%M:%SZ")
        if utc + NZ < FROM_NZ:
            continue
        a, b = m["teams"]
        rows[m.get("id") or e["startTime"] + a.get("code", "") + b.get("code", "")] = {
            "start_utc": e["startTime"], "start_nz": (utc + NZ).strftime("%d/%m/%Y %H:%M"),
            "block": e.get("blockName") or "UNKNOWN", "state": e.get("state") or "UNKNOWN",
            "bo": (m.get("strategy") or {}).get("count"),
            "team_a": code(a, unknown), "team_b": code(b, unknown),
            "wins_a": (a.get("result") or {}).get("gameWins") or 0, "wins_b": (b.get("result") or {}).get("gameWins") or 0,
            "fetched_nz": fetched_nz}
    return sorted(rows.values(), key=lambda r: (r["start_utc"], r["team_a"], r["team_b"]))


def fetch():
    """Events from the current page plus at most 2 older pages, until the window reaches 15/10/2026 NZDT."""
    events, token = [], None
    for _ in range(3):
        url = URL + (f"&pageToken={urllib.parse.quote(token)}" if token else "")
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
            sched = json.load(r)["data"]["schedule"]
        events += sched["events"]
        token = (sched.get("pages") or {}).get("older")
        first = min((dt.datetime.strptime(e["startTime"], "%Y-%m-%dT%H:%M:%SZ") for e in events), default=None)
        if not token or (first and first + NZ < FROM_NZ):
            break
        time.sleep(0.4)
    return events


def _strip(rows):
    return [{k: v for k, v in r.items() if k != "fetched_nz"} for r in rows]


def changed():
    if not os.path.exists(OUT):
        return False
    head = subprocess.run(["git", "show", "HEAD:data/dash/schedule.json"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    old = json.loads(head.stdout) if head.returncode == 0 else []
    return _strip(old) != _strip(json.load(open(OUT, encoding="utf-8")))


def main():
    now_nz = (dt.datetime.now(dt.timezone.utc) + NZ).strftime("%d/%m/%Y %H:%M")
    unknown = set()
    try:
        rows = parse(fetch(), now_nz, unknown)
    except Exception as e:  # noqa: BLE001  any failure: keep the last good file
        print(f"live_state: Riot schedule not fetched ({type(e).__name__}: {e}); data/dash/schedule.json left as it was")
        return
    if not rows:
        print("live_state: Riot returned no Worlds matches from 15/10/2026; data/dash/schedule.json left as it was"); return
    if unknown:
        print("live_state: Riot teams not in data/team_map.json, kept as Riot gives them:", ", ".join(sorted(unknown)))
    json.dump(rows, open(OUT, "w", encoding="utf-8"), indent=0, ensure_ascii=False)
    print(f"live_state: {len(rows)} matches, " + ", ".join(f"{s} {sum(r['state'] == s for r in rows)}" for s in ("completed", "inProgress", "unstarted")))


if __name__ == "__main__":
    if "--changed" in sys.argv:
        print("yes" if changed() else "no")
    else:
        main()
