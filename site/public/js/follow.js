// Follow a team: hovering or focusing any [data-team] mark inside a [data-follow-scope] lights up every mark of that
// team (.is-follow) and sets data-following on <html> so the rest step back. A tap or click pins the team, tapping it
// again or pressing Escape clears. Without this script the marks are plain text and the page is complete.
(() => {
  const marks = [...document.querySelectorAll('[data-follow-scope] [data-team]')];
  if (!marks.length) return;
  let pinned = null;
  const show = (t) => {
    if (t) document.documentElement.dataset.following = t; else delete document.documentElement.dataset.following;
    for (const m of marks) {
      m.classList.toggle('is-follow', m.dataset.team === t);
      m.setAttribute('aria-pressed', String(m.dataset.team === pinned));
    }
  };
  const markOf = (e) => e.target.closest && e.target.closest('[data-follow-scope] [data-team]');
  for (const m of marks) { m.tabIndex = 0; m.setAttribute('role', 'button'); }
  for (const h of document.querySelectorAll('[data-follow-hint]')) h.hidden = false;
  const toggle = (m) => { pinned = pinned === m.dataset.team ? null : m.dataset.team; show(pinned ?? m.dataset.team); };
  document.addEventListener('mouseover', (e) => { const m = markOf(e); show(m ? m.dataset.team : pinned); });
  document.addEventListener('focusin', (e) => { const m = markOf(e); show(m ? m.dataset.team : pinned); });
  document.addEventListener('click', (e) => { const m = markOf(e); if (m) toggle(m); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { pinned = null; show(null); return; }
    const m = (e.key === 'Enter' || e.key === ' ') && markOf(e);
    if (m) { e.preventDefault(); toggle(m); }
  });
})();
