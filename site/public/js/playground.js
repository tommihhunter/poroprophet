// Playground (pages/playground.astro): play the Swiss and knockouts forward from the real results.
// Format as in model/simulate.py: pair by record, no rematches, Bo3 when either team is on 2 wins or 2 losses, else
// Bo1; 3 wins advance, 3 losses out. QF A = a 3-0 v a 3-2, QF C = the other 3-0 v another 3-2, QF B and D from the
// 3-1s and the last 3-2s at random; SF1 = W(A) v W(B), SF2 = W(C) v W(D), then the final; all Bo5.
// A round: { stage: 'Swiss' | 'QF' | 'SF' | 'F', n (Swiss round), ms: [{ a, b, bo, w, real, rec }] }.
(() => {
  const root = document.getElementById('pg');
  if (!root) return;
  const D = JSON.parse(document.getElementById('pg-data').textContent);
  const $ = (s) => root.querySelector(s);
  const KEY = 'pg-v1', SIG = JSON.stringify([D.swiss, D.ko]);
  const STAGE = { QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' }, STAGES = ['Swiss', 'QF', 'SF', 'F'];

  const chance = (a, b, bo) => {
    const i = bo === 1 ? 0 : bo === 3 ? 1 : 2, x = D.pairs[`${a}|${b}`], y = D.pairs[`${b}|${a}`];
    return x ? x[i] : y ? 1 - y[i] : null;
  };
  const shuffle = (xs, rnd) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const records = (rounds) => {
    const r = Object.fromEntries(D.teams.map((t) => [t, [0, 0]]));
    for (const rd of rounds) if (rd.stage === 'Swiss') for (const m of rd.ms) if (m.w) { r[m.w][0]++; r[m.w === m.a ? m.b : m.a][1]++; }
    return r;
  };
  const realW = (stage, a, b) => (D.ko.find((k) => k.stage === stage && ((k.a === a && k.b === b) || (k.a === b && k.b === a))) || {}).w || null;
  const mk = (a, b, bo, w, rec) => ({ a, b, bo, w: w || null, real: !!w, rec });

  // the round after the last one in `rounds`, or null after the final
  function nextRound(rounds, rnd) {
    const last = rounds[rounds.length - 1];
    if (last.stage === 'Swiss') {
      const rec = records(rounds), key = (t) => rec[t].join('-');
      const alive = D.teams.filter((t) => rec[t][0] < 3 && rec[t][1] < 3);
      if (alive.length) {
        const n = last.n + 1, bo = (t) => (rec[t].includes(2) ? 3 : 1);
        const played = new Set(rounds.flatMap((rd) => rd.ms.map((m) => [m.a, m.b].sort().join('|'))));
        const ms = D.swiss.filter((r) => r.round === n).map((r) => mk(r.a, r.b, r.bo, r.w, key(r.a)));
        const used = new Set(ms.flatMap((m) => [m.a, m.b]));
        const pools = {};
        for (const t of alive) if (!used.has(t)) (pools[key(t)] = pools[key(t)] || []).push(t);
        for (const k of Object.keys(pools).sort((x, y) => y.localeCompare(x))) {
          let pool = pools[k];
          for (let i = 0; i < 200; i++) { // no rematches; ponytail: gives up after 200 shuffles like simulate.py's pair_pool
            shuffle(pool, rnd);
            if (pool.every((t, j) => j % 2 || !played.has([t, pool[j + 1]].sort().join('|')))) break;
          }
          for (let j = 0; j < pool.length; j += 2) ms.push(mk(pool[j], pool[j + 1], Math.max(bo(pool[j]), bo(pool[j + 1])), null, k));
        }
        ms.sort((x, y) => y.rec.localeCompare(x.rec));
        return { stage: 'Swiss', n, ms };
      }
      const real = D.ko.filter((k) => k.stage === 'QF');
      let qf;
      if (real.length === 4) qf = real.map((k) => [k.a, k.b]);
      else {
        const of = (r) => shuffle(D.teams.filter((t) => key(t) === r), rnd);
        const r30 = of('3-0'), r32 = of('3-2'), rest = shuffle([...of('3-1'), ...r32.slice(2)], rnd);
        qf = [[r30[0], r32[0]], [rest[0], rest[1]], [r30[1], r32[1]], [rest[2], rest[3]]];
      }
      return { stage: 'QF', ms: qf.map(([a, b]) => mk(a, b, 5, realW('QF', a, b))) };
    }
    if (last.stage === 'F') return null;
    const w = last.ms.map((m) => m.w), stage = last.stage === 'QF' ? 'SF' : 'F';
    const real = D.ko.filter((k) => k.stage === stage), n = stage === 'SF' ? 2 : 1; // the real draw once it is all in
    const ps = real.length === n ? real.map((k) => [k.a, k.b]) : stage === 'SF' ? [[w[0], w[1]], [w[2], w[3]]] : [[w[0], w[1]]];
    return { stage, ms: ps.map(([a, b]) => mk(a, b, 5, realW(stage, a, b))) };
  }
  const sample = (m, rnd) => (rnd() < (chance(m.a, m.b, m.bo) ?? 0.5) ? m.a : m.b);
  const clone = (rounds) => rounds.map((r) => ({ ...r, ms: r.ms.map((m) => ({ ...m })) }));

  // the real results: round 1 as drawn, then every later round that has a real result in it
  function initial() {
    const rs = [{ stage: 'Swiss', n: 1, ms: D.swiss.filter((r) => r.round === 1).map((r) => mk(r.a, r.b, r.bo, r.w, '0-0')) }];
    for (let nx; rs.at(-1).ms.every((m) => m.w) && (nx = nextRound(rs, Math.random)) && nx.ms.some((m) => m.real);) rs.push(nx);
    return rs;
  }

  let st = { rounds: initial(), hist: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    const ok = s && s.sig === SIG && Array.isArray(s.rounds) && s.rounds.length && s.rounds.every((r) => r && STAGES.includes(r.stage) && Array.isArray(r.ms));
    if (ok) st = { rounds: s.rounds, hist: Array.isArray(s.hist) ? s.hist : [] };
  } catch (e) { /* storage blocked or bad JSON: start from the real results */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ sig: SIG, ...st })); } catch (e) { /* not kept */ } };

  // ---------- rendering: the whole road, played rounds static, the current round tappable, later rounds dashed ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const logo = (t, s) => (D.logos[t] ? `<img class="logo" src="${D.logos[t]}" alt="" width="${s}" height="${s}" style="--s:${s}px">` : `<span class="disc" style="--s:${s}px">${esc(t.slice(0, 3))}</span>`);
  const pct = (p) => (p == null ? 'UNKNOWN' : `${Math.round(p * 100)}%`);
  const pct1 = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
  const cur = () => st.rounds.at(-1);
  const title = (r) => (r.stage === 'Swiss' ? `Swiss round ${r.n}` : STAGE[r.stage]);
  // record groups per Swiss round in display order (lib/swiss.ts SHAPE)
  const SHAPE = [[['0-0', 8]], [['1-0', 4], ['0-1', 4]], [['2-0', 2], ['1-1', 4], ['0-2', 2]], [['2-1', 3], ['1-2', 3]], [['2-2', 3]]];
  const KO_PEND = { QF: ['3-0 v 3-2', '3-1 or 3-2 pair', '3-0 v 3-2', '3-1 or 3-2 pair'], SF: ['QF 1 and 2 winners', 'QF 3 and 4 winners'], F: ['Semifinal winners'] };
  const KO_AFTER = { QF: 'Drawn after round 5', SF: 'After the quarterfinals', F: 'After the semifinals' };
  const phone = matchMedia('(max-width: 640px)');
  const unfolded = new Set(); // played rounds opened on the phone

  function teamBtn(m, i, t, p) {
    const fav = p != null && p >= 0.5;
    return `<button type="button" class="pg-t${m.w === t ? ' win' : ''}" data-m="${i}" data-team="${esc(t)}" aria-pressed="${m.w === t}"${m.real ? ' disabled' : ''}>`
      + `${logo(t, 22)}<span class="code">${esc(t)}</span><span class="v${fav ? ' fav' : ''}">${pct(p)}</span></button>`;
  }
  // the current round: both teams as buttons in drawn order with their chances; played: winner first, plain rows
  function card(m, i, live) {
    const tag = m.real ? '<span class="pg-real">Result</span>' : '';
    if (live) {
      const p = chance(m.a, m.b, m.bo);
      return `<div class="pg-m${m.w ? ' picked' : ''}" role="group" aria-label="${esc(`${m.a} v ${m.b}, Bo${m.bo}`)}">`
        + teamBtn(m, i, m.a, p) + teamBtn(m, i, m.b, p == null ? null : 1 - p) + tag + '</div>';
    }
    const l = m.w === m.a ? m.b : m.a;
    return `<div class="pg-m" aria-label="${esc(`${m.w} beat ${l}`)}"><div class="pg-t win">${logo(m.w, 22)}<span class="code">${esc(m.w)}</span></div>`
      + `<div class="pg-t">${logo(l, 22)}<span class="code">${esc(l)}</span></div>${tag}</div>`;
  }
  const chip = (t, v) => `<span class="pg-chip">${logo(t, 18)}<span class="code">${esc(t)}</span>${v ? `<span class="v">${esc(v)}</span>` : ''}</span>`;
  // one column; a played round is a <details>, open on desktop, folded to its summary line on the phone
  function col(k, h, sub, body, state, sum, cls = '') {
    const head = `<div class="rd-head"><h3>${esc(h)}</h3><p>${esc(sub)}</p></div>`;
    if (state === 'played') {
      const open = !phone.matches || unfolded.has(k);
      return `<details class="rd played ${cls}" data-k="${k}"${open ? ' open' : ''}><summary>${sum}</summary>${head}${body}</details>`;
    }
    return `<section class="rd ${state} ${cls}" data-k="${k}" aria-label="${esc(h)}">${head}${body}</section>`;
  }
  // Swiss: records going into each round, the 3-win and 3-loss teams in the order they got there
  function swissRun() {
    const rec = Object.fromEntries(D.teams.map((t) => [t, [0, 0]])), into = [], through = [], out = [];
    for (const rd of st.rounds.filter((r) => r.stage === 'Swiss')) {
      into[rd.n] = Object.fromEntries(D.teams.map((t) => [t, rec[t].join('-')]));
      for (const m of rd.ms) if (m.w) for (const t of [m.a, m.b]) {
        rec[t][t === m.w ? 0 : 1]++;
        if (rec[t][0] === 3 && t === m.w) through.push([t, rec[t].join('-')]);
        if (rec[t][1] === 3 && t !== m.w) out.push([t, rec[t].join('-')]);
      }
    }
    return { rec, into, through, out };
  }
  function renderRoad() {
    const r = cur(), ci = st.rounds.length - 1, sw = swissRun(), won = (rd) => rd.ms.map((m) => m.w).join(', ');
    const state = (j) => (j < ci ? 'played' : j === ci ? 'cur' : 'next');
    let html = '';
    for (let n = 1; n <= 5; n++) {
      const j = st.rounds.findIndex((x) => x.stage === 'Swiss' && x.n === n), rd = st.rounds[j], s = j < 0 ? 'next' : state(j);
      // a later round lists the teams on each record once the round before it is fully picked
      const known = s === 'next' && r.stage === 'Swiss' && n === r.n + 1 && r.ms.every((m) => m.w);
      const body = SHAPE[n - 1].map(([rec, games]) => {
        const head = `<p class="pg-gh"><span class="code">${rec}</span><span>Bo${rec.includes('2') ? 3 : 1}</span></p>`;
        if (rd) {
          const ms = rd.ms.map((m, i) => [m, i]).filter(([m]) => m.rec === rec);
          return `<div class="pg-group">${head}<div class="pg-ms">${ms.map(([m, i]) => card(m, i, s === 'cur')).join('')}</div></div>`;
        }
        const ts = known ? D.teams.filter((t) => sw.rec[t].join('-') === rec) : [];
        return `<div class="pg-group">${head}<div class="pg-pend"><span class="caption">${games} ${games === 1 ? 'game' : 'games'}</span>`
          + (ts.length ? `<span class="pg-chips">${ts.map((t) => chip(t)).join('')}</span>` : '') + '</div></div>';
      }).join('');
      const sub = s === 'cur' ? 'Your pick' : s === 'played' ? 'Locked in' : `Drawn after round ${n - 1}`;
      html += col(`S${n}`, `Round ${n}`, sub, body, s, rd ? `<b>Round ${n}</b> ${esc(won(rd))} won` : '');
    }
    const list = (xs) => (xs.length ? `<div class="pg-list">${xs.map(([t, v]) => chip(t, v)).join('')}</div>` : '<p class="caption">None yet</p>');
    html += `<section class="rd ends" aria-label="Through and out">`
      + `<div class="rd-head"><h3 class="teal">Through</h3><p>${sw.through.length} of 8</p></div>${list(sw.through)}`
      + `<div class="rd-head"><h3 class="risk">Out</h3><p>${sw.out.length} of 8</p></div>${list(sw.out)}</section>`;

    let ko = '';
    ['QF', 'SF', 'F'].forEach((stage, x) => {
      const j = st.rounds.findIndex((y) => y.stage === stage), rd = st.rounds[j], s = j < 0 ? 'next' : state(j);
      const slots = rd ? rd.ms.map((m, i) => card(m, i, s === 'cur')) : KO_PEND[stage].map((t) => `<div class="pg-pend"><span class="caption">${t}</span></div>`);
      const sub = s === 'cur' ? 'Your pick, Bo5' : s === 'played' ? 'Bo5, locked in' : KO_AFTER[stage];
      ko += col(stage, STAGE[stage], sub, `<div class="ko-slots">${slots.map((h) => `<div class="ko-slot">${h}</div>`).join('')}</div>`, s,
        rd ? `<b>${STAGE[stage]}</b> ${esc(won(rd))} won` : '', ['ko-l', 'ko-l ko-r', 'ko-r ko-fin'][x]);
    });
    // the champion and the road there, e.g. "GEN: 3-0 in Swiss, beat G2, T1, HLE"
    const f = r.stage === 'F' && r.ms[0].w ? r.ms[0].w : null;
    const beat = f ? st.rounds.filter((y) => y.stage !== 'Swiss').map((y) => y.ms.find((m) => m.a === f || m.b === f)).map((m) => (m.a === f ? m.b : m.a)) : [];
    const champ = f
      ? `<div id="pg-champ" class="pg-champ"><p class="caption">Your champion</p><p class="who">${logo(f, 48)}<span class="code">${esc(f)}</span></p>`
        + `<p class="path">${esc(`${f}: ${sw.rec[f].join('-')} in Swiss, beat ${beat.join(', ')}`)}</p></div>`
      : '<div class="pg-pend"><span class="caption">Pick the final</span></div>';
    ko += `<section class="rd" aria-label="Champion"><div class="rd-head"><h3>Champion</h3><p>${f ? 'Your pick' : 'After the final'}</p></div>`
      + `<div class="ko-slots"><div class="ko-slot">${champ}</div></div></section>`;
    $('#pg-road').innerHTML = html + `<div class="ko">${ko}</div>`;

    const open = r.ms.filter((m) => !m.w).length, done = r.ms.length - open, final = r.stage === 'F' && !open;
    $('#pg-stage').textContent = title(r);
    $('#pg-progress').textContent = final ? 'Bracket complete' : `${done} of ${r.ms.length} picked${open ? '' : ', lock in for the next round'}`;
    // Model picks and Roll work on open games and on games they filled before (not hand picks), so Roll can be pressed again
    const redo = r.ms.some((m) => !m.real && (!m.w || m.auto));
    for (const b of root.querySelectorAll('[data-act="model"], [data-act="roll"]')) b.disabled = !redo;
    root.querySelector('[data-act="lock"]').disabled = !!open || r.stage === 'F';
    root.querySelector('[data-act="end"]').disabled = final;
    root.querySelector('[data-act="undo"]').disabled = !st.hist.length;
  }
  // bring the current round into view: sideways inside the road on desktop, down the stack on the phone
  function showCurrent(smooth) {
    const c = root.querySelector('.rd.cur'), sc = $('.pg-sc');
    if (!c) return;
    const behavior = smooth ? 'smooth' : 'auto';
    if (phone.matches) { if (smooth) c.scrollIntoView({ block: 'start', behavior }); return; }
    const box = c.closest('.ko') || c, left = box.offsetLeft - Math.max(0, (sc.clientWidth - box.offsetWidth) / 2);
    sc.scrollTo({ left, behavior });
  }
  let runs = 0;
  const stale = () => { $('#pg-odds').classList.add('stale'); $('#pg-odds-status').textContent = 'Your picks changed: run again.'; };
  const render = () => { renderRoad(); save(); if (runs) stale(); };

  // ---------- actions ----------
  const fill = (how) => { for (const m of cur().ms) if (!m.real && (!m.w || m.auto)) { m.w = how(m); m.auto = true; } render(); };
  const advance = () => { const nx = cur().ms.every((m) => m.w) && nextRound(st.rounds, Math.random); if (nx) st.rounds.push(nx); return !!nx; };
  const moved = () => { render(); showCurrent(true); $('#pg-stage').focus({ preventScroll: true }); };
  const ACT = {
    model: () => fill((m) => ((chance(m.a, m.b, m.bo) ?? 0.5) >= 0.5 ? m.a : m.b)),
    roll: () => fill((m) => sample(m, Math.random)),
    lock: () => {
      const before = JSON.stringify(st.rounds);
      if (advance()) { st.hist.push(before); moved(); }
    },
    // every open game rolled and every round locked through the final, as one Undo step
    end: () => {
      st.hist.push(JSON.stringify(st.rounds));
      do { for (const m of cur().ms) if (!m.w) { m.w = sample(m, Math.random); m.auto = true; } } while (advance());
      moved();
    },
    undo: () => { if (st.hist.length) { st.rounds = JSON.parse(st.hist.pop()); moved(); } },
    reset: () => { st = { rounds: initial(), hist: [] }; moved(); },
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.pg-t');
    if (t && t.tagName === 'BUTTON' && !t.disabled) {
      const m = cur().ms[Number(t.dataset.m)];
      m.w = m.w === t.dataset.team ? null : t.dataset.team;
      m.auto = false; // a hand pick: Roll and Model picks leave it alone
      render();
      root.querySelector(`.rd.cur .pg-t[data-m="${t.dataset.m}"][data-team="${t.dataset.team}"]`)?.focus();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled) ACT[a.dataset.act]();
    const r = e.target.closest('[data-run]');
    if (r && !r.disabled) run(Number(r.dataset.run));
  });
  // remember which played rounds are unfolded on the phone across re-renders
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details.rd') && phone.matches) { if (d.open) unfolded.add(d.dataset.k); else unfolded.delete(d.dataset.k); }
  }, true);
  phone.addEventListener('change', () => { renderRoad(); showCurrent(false); });

  // ---------- odds from here: N runs of everything not picked, in chunks so the page never freezes ----------
  function run(n) {
    const btns = root.querySelectorAll('[data-run]'), status = $('#pg-odds-status');
    btns.forEach((b) => { b.disabled = true; });
    const base = JSON.stringify(st.rounds), cnt = Object.fromEntries(D.teams.map((t) => [t, [0, 0, 0, 0]]));
    let done = 0;
    const step = () => {
      for (const end = Math.min(n, done + 500); done < end; done++) {
        const rs = JSON.parse(base);
        for (const m of rs.at(-1).ms) if (!m.w) m.w = sample(m, Math.random);
        for (let nx; (nx = nextRound(rs, Math.random));) { for (const m of nx.ms) if (!m.w) m.w = sample(m, Math.random); rs.push(nx); }
        const ko = rs.filter((r) => r.stage !== 'Swiss');
        ko.forEach((r, k) => { for (const m of r.ms) { cnt[m.a][k]++; cnt[m.b][k]++; } });
        cnt[ko[2].ms[0].w][3]++;
      }
      status.textContent = `Running, ${done.toLocaleString('en-NZ')} of ${n.toLocaleString('en-NZ')}`;
      if (done < n) return setTimeout(step, 0);
      runs++;
      btns.forEach((b) => { b.disabled = false; });
      showOdds(cnt, n);
      // picks, lock-ins, undo or reset during the run: these odds are from the old picks
      if (JSON.stringify(st.rounds) !== base) stale(); else status.textContent = `${n.toLocaleString('en-NZ')} runs from your picks.`;
    };
    setTimeout(step, 0);
  }
  function showOdds(cnt, n) {
    const LEG = ['Knockouts', 'Semis', 'Final', 'Champion'];
    const rows = D.teams.map((t) => ({ t, p: cnt[t].map((c) => c / n), l: D.live[t] || null }))
      .sort((x, y) => y.p[3] - x.p[3] || y.p[0] - x.p[0] || x.t.localeCompare(y.t));
    const el = $('#pg-odds');
    el.classList.remove('stale');
    root.querySelector('.pg-leg').hidden = false;
    el.innerHTML = rows.map((r, i) => {
      // change only when it beats the run's noise (2 standard errors of the champion share), else "~0"
      const raw = r.l ? r.p[3] - r.l[3] : null, noise = 2 * Math.sqrt(Math.max(r.p[3] * (1 - r.p[3]), r.l ? r.l[3] * (1 - r.l[3]) : 0) / n);
      const d = raw == null ? null : Math.abs(raw) > noise ? Math.round(raw * 1000) / 10 : 0;
      const ds = d == null ? 'UNKNOWN' : d === 0 ? '~0' : `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(1)}`;
      const tip = LEG.map((k, j) => `${k} ${pct1(r.p[j])}${r.l ? ` (live ${pct1(r.l[j])})` : ''}`).join(', ');
      return `<li class="pg-row${r.p[0] === 0 ? ' out' : ''}" data-team="${esc(r.t)}" title="${esc(tip)}"><span class="rk">${i + 1}</span>`
        + `<span class="code">${logo(r.t, 24)}${esc(r.t)}</span>`
        + `<span class="bar4" role="img" aria-label="${esc(tip)}">${r.p.map((p, k) => `<i class="s${k}" style="width:${(p * 100).toFixed(1)}%"></i>`).join('')}</span>`
        + `<span class="p">${pct1(r.p[3])}</span><span class="d${d > 0 ? ' up' : d < 0 ? ' down' : ''}">${ds}</span></li>`;
    }).join('');
  }

  $('#pg-stage').tabIndex = -1;
  render();
  showCurrent(false);
})();
