#!/usr/bin/env python3
"""
Headless check of the v2 site: serve site/dist under $W26_BASE (default /, the custom domain root), open every page in PAGES at
1280, 768 and 390 px, and fail on page errors, console errors, any 404 response, root-absolute links that skip the
base path, content wider than the viewport at 768 and 390 px (outside .scroll wrappers), a page without exactly one
h1, and em or en dashes in page text. Also clicks a Play-In card and opens and closes the phone More sheet.
Pages not built yet are skipped.
Screenshots go to site/shots/<page>-<width>.png (outside dist, so they are never published).
Run: python -X utf8 model/export_site_assets.py && (cd site && npm run build) && python -X utf8 tests/check_site.py
"""
import functools, http.server, json, os, re, shutil, sys, tempfile, threading
from playwright.sync_api import sync_playwright

PAGES = ["", "scorecard/", "meta/", "play-in/", "swiss/", "knockouts/", "demacia-cup/", "teams/", "teams/gen/",
         "teams/mvk/", "teams/compare/", "teams/compare/gen-vs-hle/", "players/", "players/chovy/", "playground/"]
WIDTHS = [1280, 768, 390]
BASE = os.environ.get("W26_BASE", "/").strip("/")  # same env as site/astro.config.mjs
PREFIX = f"/{BASE}" if BASE else ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "site", "dist")
BAD_LINK = re.compile(rf'(?:href|src)="/(?!{BASE}/)[^"]*"') if BASE else None  # base "/": every root link is fine


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


# Elements wider than the viewport. html and body clip overflow-x, so scrollWidth alone cannot see it; content inside a
# .scroll wrapper or another clipping box is allowed to be wider.
OVERFLOW = """(() => {
  const clips = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    if (a.classList.contains('scroll') || /hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) return true; } return false; };
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > innerWidth + 1 && !clips(el)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right ${Math.round(r.right)}`);
  }
  return out.slice(0, 3);
})()"""


def check_play_in(page, tag, problems):
    """Play-In: clicking a card shows exactly its detail panel and marks only that card pressed."""
    cards = page.locator("[data-show]")
    target = cards.nth(cards.count() - 1)
    want = target.get_attribute("data-show")
    target.click()
    shown = page.evaluate("[...document.querySelectorAll('[data-detail]')].filter(d => !d.hidden).map(d => d.id)")
    pressed = page.evaluate("[...document.querySelectorAll('[data-show][aria-pressed=true]')].map(c => c.dataset.show)")
    print(f"{tag}: clicked {want}, shown {shown}, pressed {pressed}")
    if shown != [want] or pressed != [want]:
        problems.append(f"{tag}: Play-In click on {want} shows {shown}, pressed {pressed}")


def check_more_sheet(page, tag, problems):
    """Phone More sheet: opens from the tab, closes on Escape and gives focus back to the tab."""
    page.click(".bbar summary")
    opened = page.evaluate("document.querySelector('.bbar details').open")
    page.keyboard.press("Escape")
    closed = not page.evaluate("document.querySelector('.bbar details').open")
    focus = page.evaluate("document.activeElement && document.activeElement.tagName")
    print(f"{tag}: More sheet opened {opened}, closed on Escape {closed}, focus {focus}")
    if not (opened and closed and focus == "SUMMARY"):
        problems.append(f"{tag}: More sheet opened {opened}, closed {closed}, focus {focus}")


VISIBLE_CARDS = "[...document.querySelectorAll('#teams-grid > a')].filter(c => c.offsetParent !== null)"


def check_teams_chips(page, tag, problems):
    """Teams grid: the LCK chip leaves only LCK cards, still in rank order, and writes the hash."""
    page.click(".chip[data-region='LCK']")
    regions = page.evaluate(f"{VISIBLE_CARDS}.map(c => c.dataset.region)")
    ranks = page.evaluate(f"{VISIBLE_CARDS}.map(c => Number(c.dataset.rank))")
    print(f"{tag}: LCK chip shows {regions}, ranks {ranks}, hash {page.evaluate('location.hash')}")
    if not regions or set(regions) != {"LCK"}:
        problems.append(f"{tag}: LCK chip shows {regions}")
    if ranks != sorted(ranks):
        problems.append(f"{tag}: LCK cards out of rank order: {ranks}")
    if page.evaluate("location.hash") != "#region=LCK":
        problems.append(f"{tag}: hash not written: {page.evaluate('location.hash')}")
    if page.get_attribute(".chip[data-region='LCK']", "aria-pressed") != "true":
        problems.append(f"{tag}: LCK chip not pressed")


def check_teams_nojs(browser, target, problems):
    """With JavaScript off every card shows, in rank order."""
    ctx = browser.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(target, wait_until="networkidle")
    ranks = [int(x) for x in page.locator("#teams-grid > a:visible").evaluate_all("cs => cs.map(c => c.dataset.rank)")]
    print(f"teams no-JS: ranks {ranks}")
    if ranks != list(range(1, 20)):
        problems.append(f"teams no-JS: expected ranks 1 to 19 in order, got {ranks}")
    ctx.close()


REPORT_KEYS = ["How they win", "How they lose"]


def check_team_gen(page, tag, problems):
    """GEN team page: the two scouting-report cards and 5 visible player cards (one split shown at a time)."""
    keys = page.locator("#report h3").all_inner_texts()
    rows = page.locator("#players .player-row:visible").count()
    print(f"{tag}: report keys {keys}, player rows {rows}")
    if [k.strip().lower() for k in keys] != [k.lower() for k in REPORT_KEYS]:
        problems.append(f"{tag}: report keys {keys}, expected {REPORT_KEYS}")
    if rows != 5:
        problems.append(f"{tag}: expected 5 player rows, got {rows}")


def check_players_filter(page, tag, problems):
    """Players grid: the Mid chip leaves only the 19 mids visible."""
    page.click(".chip[data-role='MID']")
    roles = page.locator("#players-grid > a:visible").evaluate_all("as => as.map(a => a.dataset.role)")
    print(f"{tag}: Mid chip shows {len(roles)} tiles, roles {sorted(set(roles))}")
    if not roles or set(roles) != {"MID"}:
        problems.append(f"{tag}: Mid chip shows roles {sorted(set(roles))} ({len(roles)} tiles)")


def check_compare_pick(page, tag, problems):
    """Compare pickers: T1 then HLE lands on the canonical hle-vs-t1 page."""
    page.select_option("#compare-pick select[name=a]", "T1")
    page.select_option("#compare-pick select[name=b]", "HLE")
    with page.expect_navigation():
        page.click("#compare-pick button[type=submit]")
    print(f"{tag}: pickers T1, HLE -> {page.url}")
    if not page.url.endswith(f"{PREFIX}/teams/compare/hle-vs-t1/"):
        problems.append(f"{tag}: pickers landed on {page.url}, expected .../teams/compare/hle-vs-t1/")


def check_swiss(browser, target, problems):
    """Swiss at 1440: round 1 shows one .sb-match per round 1 row in data/dash/results.json, and hovering a team in
    the bracket lights up every mark of that team (follow.js) and no other team's."""
    dash = os.environ.get("W26_DASH") or os.path.join(ROOT, "data", "dash")
    with open(os.path.join(dash, "results.json"), encoding="utf-8") as fh:
        want = sum(1 for r in json.load(fh) if r.get("phase") == "Swiss" and r.get("kind") == "series" and r.get("round") == 1)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(target, wait_until="networkidle")
    got = page.locator(".sb-col").first.locator(".sb-match").count()
    print(f"swiss @1440: round 1 shows {got} games, results have {want}")
    if got != want:
        problems.append(f"swiss @1440: round 1 shows {got} games, expected {want}")
    if want:
        team = page.locator(".sb-match [data-team]").first.get_attribute("data-team")
        page.locator(".sb-match [data-team]").first.hover()
        lit = page.evaluate("[...document.querySelectorAll('.is-follow')].map(e => e.dataset.team)")
        total = page.locator(f"[data-follow-scope] [data-team='{team}']").count()
        print(f"swiss @1440: hover {team} lights {len(lit)} of {total} marks")
        if set(lit) != {team} or len(lit) != total or total < 2:
            problems.append(f"swiss @1440: hover {team} lit {lit}, expected all {total} {team} marks")
    page.close()


# what lock-in shows next: from the stage in #pg-stage to the next round's groups, "record games" (knockouts: "KO games")
PG_NEXT = {"Swiss round 1": ("Swiss round 2", ["1-0 4", "0-1 4"]), "Swiss round 2": ("Swiss round 3", ["2-0 2", "1-1 4", "0-2 2"]),
           "Swiss round 3": ("Swiss round 4", ["2-1 3", "1-2 3"]), "Swiss round 4": ("Swiss round 5", ["2-2 3"]),
           "Swiss round 5": ("Quarterfinals", ["KO 4"]), "Quarterfinals": ("Semifinals", ["KO 2"]), "Semifinals": ("Final", ["KO 1"])}


def check_playground(browser, target, problems):
    """Playground at 1440: from whatever stage the real results reach, pick a winner in every open series, lock in,
    and the next round has the Swiss (or knockout) shape in PG_NEXT; "Run 1,000" then renders one odds row per Swiss
    team (16). At the final there is nothing to lock in, so only the odds are checked."""
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: problems.append(f"playground: page error: {e}"))
    page.goto(target, wait_until="networkidle")
    start = page.text_content("#pg-stage")
    if start in PG_NEXT:
        for m in page.locator(".pg-m").all():
            if not m.locator(".pg-t[aria-pressed=true]").count():
                m.locator(".pg-t").first.click()
        page.click("[data-act=lock]")
        stage = page.text_content("#pg-stage")
        groups = page.evaluate("[...document.querySelectorAll('.pg-group')].map(g => (g.querySelector('.pg-gh .code')?.textContent || 'KO') + ' ' + g.querySelectorAll('.pg-m').length)")
        print(f"playground @1440: from {start}, lock in shows {stage}: {groups}")
        if (stage, groups) != PG_NEXT[start]:
            problems.append(f"playground @1440: from {start}, lock in shows {stage} {groups}, expected {PG_NEXT[start]}")
    elif start != "Final":
        problems.append(f"playground @1440: starts at unknown stage {start!r}")
    page.click("[data-run='1000']")
    page.wait_for_function("document.querySelectorAll('#pg-odds .pg-row').length > 0 && !document.querySelector('[data-run]').disabled")
    rows = page.locator("#pg-odds .pg-row").count()
    print(f"playground @1440: odds from here shows {rows} rows")
    if rows != 16:
        problems.append(f"playground @1440: odds from here shows {rows} rows, expected 16")
    page.close()


def main():
    if not os.path.exists(os.path.join(DIST, "index.html")):
        sys.exit("build the site first: (cd site && npm run build)")
    problems, checked, skipped = [], [], []
    if not os.path.exists(os.path.join(DIST, "404.html")):  # GitHub Pages serves this for unknown paths
        problems.append("404.html missing from site/dist")

    for dirpath, _, files in (os.walk(DIST) if BAD_LINK else []):
        for f in files:
            if f.endswith(".html"):
                path = os.path.join(dirpath, f)
                with open(path, encoding="utf-8") as fh:
                    for hit in sorted(set(BAD_LINK.findall(fh.read()))):
                        problems.append(f"link without base path in {os.path.relpath(path, DIST)}: {hit}")

    tmp = tempfile.mkdtemp()
    shutil.copytree(DIST, os.path.join(tmp, BASE), ignore=shutil.ignore_patterns("shots"), dirs_exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}{PREFIX}/"
    shots = os.path.join(os.path.dirname(DIST), "shots"); os.makedirs(shots, exist_ok=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for pg in PAGES:
                if not os.path.exists(os.path.join(DIST, pg, "index.html")):
                    skipped.append(pg or "home")
                    print(f"{pg or 'home'}: not built yet, skipped")
                    continue
                name = pg.strip("/").replace("/", "-") or "home"
                checked.append(name)
                for w in WIDTHS:
                    tag = f"{name} @{w}"
                    page = browser.new_page(viewport={"width": w, "height": 900 if w > 600 else 844})
                    page.on("pageerror", lambda e, t=tag: problems.append(f"{t}: page error: {e}"))
                    page.on("console", lambda m, t=tag: problems.append(f"{t}: console error: {m.text} {m.location.get('url', '')}")
                            if m.type == "error" else None)
                    page.on("response", lambda r, t=tag: problems.append(f"{t}: 404 {r.url}") if r.status == 404 else None)
                    page.goto(url + pg, wait_until="networkidle")
                    if w < 1000:
                        wide = page.evaluate(OVERFLOW)
                        if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1") or wide:
                            problems.append(f"{tag}: content wider than the viewport: {wide}")
                    if w == 1280:
                        h1s = page.evaluate("document.querySelectorAll('h1').length")
                        if h1s != 1:
                            problems.append(f"{tag}: {h1s} h1 elements, expected 1")
                        dashes = page.evaluate("(document.body.innerText.match(/[\\u2013\\u2014]/g) || []).length")
                        if dashes:
                            problems.append(f"{tag}: {dashes} em or en dashes in page text")
                    page.screenshot(path=os.path.join(shots, f"{name}-{w}.png"), full_page=True)
                    if pg == "teams/":
                        check_teams_chips(page, tag, problems)
                    if pg == "teams/gen/":
                        check_team_gen(page, tag, problems)
                    if pg == "teams/compare/":
                        check_compare_pick(page, tag, problems)
                    if pg == "players/":
                        check_players_filter(page, tag, problems)
                    if pg == "play-in/" and w == 1280:
                        check_play_in(page, tag, problems)
                    if pg == "" and w == 390:
                        check_more_sheet(page, tag, problems)
                    page.close()
                if pg == "teams/":
                    check_teams_nojs(browser, url + pg, problems)
                if pg == "swiss/":
                    check_swiss(browser, url + pg, problems)
                if pg == "playground/":
                    check_playground(browser, url + pg, problems)
            browser.close()
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)

    print("pages checked:", checked)
    print("pages skipped:", skipped)
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print("site OK")


if __name__ == "__main__":
    main()
