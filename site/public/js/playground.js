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
  const STAGE = { QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' };

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
    if (s && s.sig === SIG && Array.isArray(s.rounds) && s.rounds.length) st = { rounds: s.rounds, hist: s.hist || [] };
  } catch (e) { /* storage blocked or bad JSON: start from the real results */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ sig: SIG, ...st })); } catch (e) { /* not kept */ } };

  // ---------- rendering ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const logo = (t, s) => (D.logos[t] ? `<img class="logo" src="${D.logos[t]}" alt="" width="${s}" height="${s}" style="--s:${s}px">` : `<span class="disc" style="--s:${s}px">${esc(t.slice(0, 3))}</span>`);
  const pct = (p) => (p == null ? 'UNKNOWN' : `${Math.round(p * 100)}%`);
  const pct1 = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
  const cur = () => st.rounds.at(-1);
  const title = (r) => (r.stage === 'Swiss' ? `Swiss round ${r.n}` : STAGE[r.stage]);

  function teamBtn(m, i, t, p) {
    const fav = p != null && p >= 0.5;
    return `<button type="button" class="pg-t" data-m="${i}" data-team="${esc(t)}" aria-pressed="${m.w === t}"${m.real ? ' disabled' : ''}>`
      + `${logo(t, 24)}<span class="code">${esc(t)}</span><span class="v${fav ? ' fav' : ''}">${pct(p)}</span></button>`;
  }
  function renderRound() {
    const r = cur(), groups = [];
    r.ms.forEach((m, i) => {
      const g = r.stage === 'Swiss' ? m.rec : ''; // knockout rounds: the h2 already names the round
      let grp = groups.find((x) => x.g === g);
      if (!grp) groups.push((grp = { g, bo: m.bo, items: [] }));
      grp.items.push([m, i]);
    });
    $('#pg-round').innerHTML = groups.map((g) => `<div class="pg-group"><p class="pg-gh">${g.g ? `<span class="code">${esc(g.g)}</span>` : ''}<span>Bo${g.bo}</span></p><div class="pg-ms">`
      + g.items.map(([m, i]) => {
        const p = chance(m.a, m.b, m.bo);
        return `<div class="pg-m${m.w ? ' picked' : ''}" role="group" aria-label="${esc(`${m.a} v ${m.b}, Bo${m.bo}`)}">`
          + teamBtn(m, i, m.a, p) + teamBtn(m, i, m.b, p == null ? null : 1 - p)
          + (m.real ? '<span class="pg-real">Result</span>' : '') + '</div>';
      }).join('') + '</div></div>').join('');
    const open = r.ms.filter((m) => !m.w).length, done = r.ms.length - open, final = r.stage === 'F' && !open;
    $('#pg-stage').textContent = title(r);
    $('#pg-progress').textContent = final ? 'Bracket complete' : `${done} of ${r.ms.length} picked${open ? '' : ', lock in for the next round'}`;
    const champ = $('#pg-champ');
    champ.hidden = !final;
    if (final) champ.innerHTML = `${logo(r.ms[0].w, 56)}<div><p class="caption">Your champion</p><p class="code">${esc(r.ms[0].w)}</p></div>`;
    // Model picks and Roll work on open games and on games they filled before (not hand picks), so Roll can be pressed again
    const redo = r.ms.some((m) => !m.real && (!m.w || m.auto));
    for (const b of root.querySelectorAll('[data-act="model"], [data-act="roll"]')) b.disabled = !redo;
    root.querySelector('[data-act="lock"]').disabled = !!open || r.stage === 'F';
    root.querySelector('[data-act="undo"]').disabled = !st.hist.length;
  }
  function renderStandings() {
    const rec = records(st.rounds);
    const keys = [...new Set(D.teams.map((t) => rec[t].join('-')))].sort((x, y) => {
      const [a, b] = x.split('-').map(Number), [c, d] = y.split('-').map(Number);
      return (c - d) - (a - b) || c - a;
    });
    $('#pg-standings').innerHTML = keys.map((k) => {
      const [w, l] = k.split('-').map(Number), tone = w === 3 ? ' class="teal"' : l === 3 ? ' class="risk"' : '';
      const ts = D.teams.filter((t) => rec[t].join('-') === k);
      return `<div class="pg-rec"><h3${tone}>${k}${w === 3 ? ', through' : l === 3 ? ', out' : ''}</h3><div class="pg-chips">`
        + ts.map((t) => `<span class="pg-chip">${logo(t, 18)}<span class="code">${esc(t)}</span></span>`).join('') + '</div></div>';
    }).join('');
  }
  let runs = 0;
  const stale = () => { $('#pg-odds').classList.add('stale'); $('#pg-odds-status').textContent = 'Your picks changed: run again.'; };
  const render = () => { renderRound(); renderStandings(); save(); if (runs) stale(); };

  // ---------- actions ----------
  const fill = (how) => { for (const m of cur().ms) if (!m.real && (!m.w || m.auto)) { m.w = how(m); m.auto = true; } render(); };
  const ACT = {
    model: () => fill((m) => ((chance(m.a, m.b, m.bo) ?? 0.5) >= 0.5 ? m.a : m.b)),
    roll: () => fill((m) => sample(m, Math.random)),
    lock: () => {
      const nx = cur().ms.every((m) => m.w) && nextRound(st.rounds, Math.random);
      if (!nx) return;
      st.hist.push(JSON.stringify(st.rounds));
      st.rounds.push(nx);
      render();
      $('#pg-stage').focus({ preventScroll: true });
    },
    undo: () => { if (st.hist.length) { st.rounds = JSON.parse(st.hist.pop()); render(); } },
    reset: () => { st = { rounds: initial(), hist: [] }; render(); },
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.pg-t');
    if (t && !t.disabled) {
      const m = cur().ms[Number(t.dataset.m)];
      m.w = m.w === t.dataset.team ? null : t.dataset.team;
      m.auto = false; // a hand pick: Roll and Model picks leave it alone
      render();
      root.querySelector(`.pg-t[data-m="${t.dataset.m}"][data-team="${t.dataset.team}"]`)?.focus();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled) ACT[a.dataset.act]();
    const r = e.target.closest('[data-run]');
    if (r && !r.disabled) run(Number(r.dataset.run));
  });

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
})();
