/** Icônes SVG internes (couleurs pleines, sans identifiants pour éviter les collisions). */

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" focusable="false">${body}</svg>`;

export const Icons = {
  coin: svg(
    '<circle cx="12" cy="12" r="10" fill="#ffc531" stroke="#b77900" stroke-width="1.6"/><circle cx="12" cy="12" r="7" fill="none" stroke="#e29a10" stroke-width="1.2"/><path d="M12 6.8l1.5 3.1 3.4.4-2.5 2.3.7 3.3-3.1-1.7-3.1 1.7.7-3.3-2.5-2.3 3.4-.4z" fill="#fff3c2"/>',
  ),
  cash: svg(
    '<rect x="2" y="5.5" width="20" height="13" rx="2.5" fill="#43a047" stroke="#1b5e20" stroke-width="1.5"/><rect x="4.5" y="8" width="15" height="8" rx="1.5" fill="none" stroke="#a5d6a7" stroke-width="1.2"/><circle cx="12" cy="12" r="2.8" fill="#c8e6c9"/>',
  ),
  energy: svg(
    '<path d="M13.5 2L4.5 13.5h6l-1.5 8.5 10-12.5h-6.2z" fill="#ffd54f" stroke="#e08700" stroke-width="1.5" stroke-linejoin="round"/>',
  ),
  xp: svg(
    '<path d="M12 2.2l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 16.8 6.2 20l1.2-6.5L2.6 9l6.5-.8z" fill="#4fc3f7" stroke="#0277bd" stroke-width="1.5" stroke-linejoin="round"/>',
  ),
  goods: svg(
    '<rect x="3" y="4" width="18" height="16" rx="2" fill="#c8873f" stroke="#6d4220" stroke-width="1.5"/><path d="M5 6l14 12M19 6L5 18" stroke="#8a5527" stroke-width="2"/><rect x="5" y="6" width="14" height="12" fill="none" stroke="#e8b06a" stroke-width="1"/>',
  ),
  population: svg(
    '<circle cx="8.5" cy="7.5" r="3.3" fill="#5c9ded" stroke="#1e4f8c" stroke-width="1.3"/><path d="M2.5 19c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="#5c9ded" stroke="#1e4f8c" stroke-width="1.3"/><circle cx="16.5" cy="8.5" r="2.8" fill="#f48fb1" stroke="#ad1457" stroke-width="1.3"/><path d="M12.5 19c.2-3 2-5 4.5-5s4.5 2 4.5 5z" fill="#f48fb1" stroke="#ad1457" stroke-width="1.3"/>',
  ),
  build: svg(
    '<path d="M3 11.5L12 4l9 7.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10v9.5h13V10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 11.5v6M9 14.5h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  move: svg(
    '<path d="M12 2.5v19M2.5 12h19" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M9 5.5l3-3 3 3M9 18.5l3 3 3-3M5.5 9l-3 3 3 3M18.5 9l3 3-3 3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  shop: svg(
    '<path d="M4 8h16l-1.3 12.5H5.3z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M8.5 10V6.5a3.5 3.5 0 017 0V10" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
  ),
  settings: svg(
    '<path d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z" fill="none" stroke="#fff" stroke-width="2.1"/><path d="M19.4 13.5l1.7 1.3-1.8 3.1-2-.8a7.6 7.6 0 01-1.9 1.1L15 20.4h-3.6l-.4-2.2a7.6 7.6 0 01-1.9-1.1l-2 .8-1.8-3.1 1.7-1.3a7.8 7.8 0 010-2.2L5.3 9.9l1.8-3.1 2 .8A7.6 7.6 0 0111 6.5l.4-2.2H15l.4 2.2a7.6 7.6 0 011.9 1.1l2-.8 1.8 3.1-1.7 1.3a7.8 7.8 0 010 2.3z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  check: svg(
    '<path d="M4.5 12.5l4.5 4.5 10-10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'),
  clock: svg(
    '<circle cx="12" cy="12" r="9" fill="#fff" stroke="#546e7a" stroke-width="2"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>',
  ),
  lock: svg(
    '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="#78909c" stroke="#37474f" stroke-width="1.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="#37474f" stroke-width="2"/>',
  ),
  expand: svg(
    '<rect x="3" y="3" width="18" height="18" rx="3" fill="#8bc34a" stroke="#33691e" stroke-width="1.5"/><path d="M8 12h8M12 8v8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  ),
  trophy: svg(
    '<path d="M7 3h10v5a5 5 0 01-10 0z" fill="#ffc531" stroke="#b77900" stroke-width="1.5"/><path d="M7 5H3.5a3.5 3.5 0 003.8 4M17 5h3.5a3.5 3.5 0 01-3.8 4" fill="none" stroke="#b77900" stroke-width="1.5"/><path d="M10 13h4l.6 4h-5.2z" fill="#ffc531" stroke="#b77900" stroke-width="1.5"/><rect x="7.5" y="17" width="9" height="3.5" rx="1" fill="#8d6e63" stroke="#4e342e" stroke-width="1.3"/>',
  ),
  calendar: svg(
    '<rect x="3" y="5" width="18" height="16" rx="3" fill="#fff" stroke="#c62828" stroke-width="1.6"/><path d="M3 9.5h18V8a3 3 0 00-3-3H6a3 3 0 00-3 3z" fill="#e53935"/><path d="M8 3v4M16 3v4" stroke="#7f0000" stroke-width="2" stroke-linecap="round"/><path d="M8.2 15.2l2.4 2.3 5-5" fill="none" stroke="#43a047" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  bell: svg(
    '<path d="M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6z" fill="#ffc531" stroke="#b77900" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 18.5a2.5 2.5 0 005 0" fill="#ffc531" stroke="#b77900" stroke-width="1.6"/>',
  ),
  chat: svg(
    '<path d="M4 5h16a2 2 0 012 2v9a2 2 0 01-2 2h-9l-5 4v-4H4a2 2 0 01-2-2V7a2 2 0 012-2z" fill="#fff" stroke="#1565c0" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8" cy="11.5" r="1.4" fill="#1565c0"/><circle cx="12" cy="11.5" r="1.4" fill="#1565c0"/><circle cx="16" cy="11.5" r="1.4" fill="#1565c0"/>',
  ),
  send: svg(
    '<path d="M3 11.5L21 3l-6.5 18-3-7.5z" fill="currentColor"/><path d="M11.5 13.5L21 3" stroke="#fff" stroke-width="1.4"/>',
  ),
  globe: svg(
    '<circle cx="12" cy="12" r="9" fill="#e3f2fd" stroke="#1565c0" stroke-width="1.6"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" fill="none" stroke="#1565c0" stroke-width="1.4"/>',
  ),
  shield: svg(
    '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#ffc531" stroke="#b77900" stroke-width="1.5"/><path d="M8.5 12l2.4 2.4 4.6-4.8" fill="none" stroke="#7a4f00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  megaphone: svg(
    '<path d="M3 10v4h3l9 5V5L6 10z" fill="#ff7043" stroke="#bf360c" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 14l1.5 5h2.5l-1-4.5" fill="#ffab91" stroke="#bf360c" stroke-width="1.3"/><path d="M18 9.5a3.5 3.5 0 010 5" fill="none" stroke="#bf360c" stroke-width="1.8" stroke-linecap="round"/>',
  ),
  boat: svg(
    '<path d="M3 14h18l-3 5H6z" fill="#1e88e5" stroke="#0d47a1" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v11M12 4l6 8h-6z" fill="#fff" stroke="#455a64" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  train: svg(
    '<rect x="5" y="3" width="14" height="14" rx="3" fill="#e53935" stroke="#8e1b1b" stroke-width="1.5"/><rect x="7.5" y="5.5" width="9" height="5" rx="1" fill="#bbdefb"/><circle cx="8.5" cy="14" r="1.3" fill="#fff59d"/><circle cx="15.5" cy="14" r="1.3" fill="#fff59d"/><path d="M8 17l-3 4M16 17l3 4M6.5 19.5h11" stroke="#455a64" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  worker: svg(
    '<path d="M4 15a8 8 0 0116 0z" fill="#ffc107" stroke="#b77900" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 7.5h4V15h-4z" fill="#ffd54f" stroke="#b77900" stroke-width="1.2"/><rect x="2.5" y="15" width="19" height="3.5" rx="1.5" fill="#ffb300" stroke="#b77900" stroke-width="1.5"/>',
  ),
  road: svg(
    '<path d="M12 2.5l9.5 17h-19z" fill="#ffca28" stroke="#c62828" stroke-width="2" stroke-linejoin="round"/><path d="M10.5 17.5l.8-9h1.4l.8 9z" fill="#424242"/><path d="M12 9.5v1.5M12 13v1.5" stroke="#fff" stroke-width="0.9"/>',
  ),
};

/** Portrait de Léa, l'adjointe au maire (personnage original). */
export const LEA_AVATAR = svg(
  `<circle cx="32" cy="32" r="31" fill="#bfe3ff"/>
   <path d="M15 28c0-12 7-19 17-19s17 7 17 19v14H15z" fill="#6b3d1f"/>
   <path d="M10 64c1-12 9-18 22-18s21 6 22 18z" fill="#24406e"/>
   <path d="M27 46l5 7 5-7z" fill="#fff"/>
   <rect x="28" y="38" width="8" height="9" rx="3" fill="#f0bf9b"/>
   <ellipse cx="32" cy="29" rx="12.5" ry="13.5" fill="#f6cfaf"/>
   <path d="M19.5 27c2-8 7-12 12.5-12s11 4 12.5 12c-5-1-10-4-12.5-8-2.5 4-7.5 7-12.5 8z" fill="#7a4524"/>
   <ellipse cx="27" cy="30" rx="1.7" ry="2.2" fill="#3e2723"/>
   <ellipse cx="37" cy="30" rx="1.7" ry="2.2" fill="#3e2723"/>
   <circle cx="24.5" cy="34.5" r="2.2" fill="#f48fb1" opacity=".6"/>
   <circle cx="39.5" cy="34.5" r="2.2" fill="#f48fb1" opacity=".6"/>
   <path d="M28 36.5c2.5 2.5 5.5 2.5 8 0" fill="none" stroke="#a0522d" stroke-width="1.6" stroke-linecap="round"/>`,
  '0 0 64 64',
);
