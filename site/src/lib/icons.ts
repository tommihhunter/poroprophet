/** Inline SVG icons for the navigation (24x24 viewBox, stroke icons, currentColor). Keyed by nav id. */
const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  home: wrap('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/>'),
  'play-in': wrap('<path d="M7 4.5v15l12-7.5z"/>'),
  swiss: wrap('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  knockouts: wrap('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4"/><path d="M17 6h2.5a2.5 2.5 0 0 1-2.5 4"/><path d="M12 13v3"/><path d="M8.5 20h7"/><path d="M10 16h4v4h-4z"/>'),
  'demacia-cup': wrap('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-4"/>'),
  teams: wrap('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.8"/>'),
  players: wrap('<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  scorecard: wrap('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3.5h6v2.5H9z"/><path d="M8.5 12.5l2.2 2.2 4.8-5"/><path d="M8.5 17.5h7"/>'),
  meta: wrap('<path d="M12 3c1 4 3 5.5 6 6.5-3 1-5 2.5-6 6.5-1-4-3-5.5-6-6.5 3-1 5-2.5 6-6.5z"/><path d="M19 15.5c.4 1.4 1.1 2.1 2.5 2.5-1.4.4-2.1 1.1-2.5 2.5-.4-1.4-1.1-2.1-2.5-2.5 1.4-.4 2.1-1.1 2.5-2.5z"/>'),
  playground: wrap('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/>'),
  more: wrap('<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
};

export const icon = (id: string) => ICONS[id] ?? ICONS.more;
