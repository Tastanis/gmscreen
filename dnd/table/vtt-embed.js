/* The VTT inside a table window ("embedded"). The table adds this file to the framed VTT page.
   - One slim strip of map tools on the left, grouped: tools you use on the board, then a View menu, then GM edits.
     Each strip button presses the VTT's own (now hidden) button, so behaviour and menus are unchanged.
   - window.vttEmbed: what the table uses to run table-wide things (dice, chat, combat, scenes, tokens, tests),
     to read live state for its rail, and to take the strip onto its own rail when the map fills the table. */
(function () {
  'use strict';
  if (window.vttEmbed) return;
  const doc = document, $ = (s) => doc.querySelector(s);
  doc.documentElement.classList.add('vtt-embed');
  const gm = !!$('[data-viewer-role="gm"]');

  const I = {
    tokens: '<circle cx="8" cy="8" r="4.5"/><circle cx="16" cy="16" r="4.5"/><path d="M15 4.5h5M17.5 2v5"/>',
    measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    mark: '<path d="M4 20l4-1 9-9-3-3-9 9z"/><circle cx="17" cy="17" r="4" stroke-dasharray="2 2"/>',
    templates: '<circle cx="8" cy="8" r="5"/><rect x="11" y="11" width="10" height="10" rx="1"/>',
    draw: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    damage: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z"/><path d="M8 12h2l1.5-3 2 5 1.5-2H16"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    levels: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
    find: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    first: '<circle cx="12" cy="12" r="3"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/>',
    vision: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>',
    zones: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/>',
    show: '<path d="M4 10v4l11 5V5z"/><path d="M15 9a3 3 0 010 6"/>',
    edits: '<path d="M3 5h18v14H3z"/><path d="M3 10h18M3 15h18M8 5v5M15 5v5M11 10v5M6 15v4M17 15v4"/>',
    walls: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6"/>',
    clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    fog: '<path d="M6 16a4 4 0 01.5-8A5.5 5.5 0 0117 8.5a3.8 3.8 0 01.5 7.5z"/><path d="M5 20h14"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${I[k] || ''}</svg>`;
  const press = (sel) => { const b = typeof sel === 'string' ? $(sel) : sel; if (!b) return false; b.click(); return true; };
  const pressed = (sel) => { const b = $(sel); return !!b && (b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-expanded') === 'true' || b.classList.contains('is-active')); };

  // ---------------------------------------------------------------- the tools (also what the table puts on its rail)
  const TOOLS = [
    { id: 'measure', t: 'Measure', d: 'Ruler. Click again to stop.', sel: '[data-action="measure-distance"]', toggle: true },
    { id: 'mark', t: 'Mark the board', d: 'Templates (circle, rectangle, wall) and the pen.', menu: 'mark', on: () => pressed('[data-action="toggle-draw"]') },
    { id: 'tokens', t: 'Tokens', d: 'The token library: every Monster Creator monster, the heroes and your own pictures. Drag one onto the map; right-click one to change its size, side or picture.', sel: '[data-settings-launch="tokens"]', gm: true },
    { id: 'damage', t: 'Damage / heal', d: 'Set the amount, press Damage or Heal, then click a token.', sel: '#vtt-damage-heal-btn' },
    { sep: true },
    { id: 'view', t: 'View', d: 'Vision, find token, 1st person, zones.', menu: 'view', on: () => pressed('[data-action="sight-test"]') || pressed('[data-action="first-person"]') },
    { id: 'edits', t: 'Map edits', d: 'Walls, stairs, height brush, floors, fog of war.', menu: 'edits', gm: true, on: () => pressed('[data-action="map-edits"]') },
  ].filter((t) => gm || !t.gm);

  // ---------------------------------------------------------------- tip + menus
  const tip = doc.createElement('div'); tip.id = 'te-tip'; doc.body.append(tip);
  function showTip(btn, t) {
    tip.innerHTML = `<b>${t.t}</b>${t.key ? `<kbd>${t.key}</kbd>` : ''}${t.gm ? '<kbd>GM</kbd>' : ''}<i>${t.d}</i>`;
    tip.classList.add('show');
    const r = btn.getBoundingClientRect();
    tip.style.left = r.right + 8 + 'px'; tip.style.top = Math.max(4, Math.min(innerHeight - tip.offsetHeight - 4, r.top + r.height / 2 - tip.offsetHeight / 2)) + 'px';
  }
  const hideTip = () => tip.classList.remove('show');
  let menu = null;
  const TOP_BAR = 106;   // #te-top's height (fallback, two rows): menus open below it
  const topBarBottom = () => { const t = doc.getElementById('te-top'); const b = t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().bottom : 0; return b > 0 ? b : TOP_BAR; };
  let menuTool = '';   // the strip/rail tool whose menu is open: pressing it again closes the menu
  function closeMenu() { menu?.remove(); menu = null; menuTool = ''; }
  doc.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !e.target.closest('.te-btn')) closeMenu(); }, true);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  function openMenu(anchor, html, wire) {
    closeMenu();
    menu = doc.createElement('div'); menu.className = 'te-menu'; menu.innerHTML = html; doc.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.right + 8 + 'px'; menu.style.top = Math.max(topBarBottom() + 6, Math.min(innerHeight - menu.offsetHeight - 6, r.top - 6)) + 'px';
    wire?.(menu);
  }
  const levelName = () => ($('[data-map-level-nav-name]')?.textContent || '').trim();
  function viewMenu(anchor) {
    const rows = [
      ['vision', 'Vision for everyone', '[data-action="sight-test"]'],
      ['vision', () => ($('[data-action="sight-look"]')?.textContent || 'Unseen: Grey').trim() + ' — click to change', '[data-action="sight-look"]', true],
      ['find', gm ? 'Find token' : 'My token', '[data-action="return-token-floor"]'],
      ['first', '1st person', '[data-action="first-person"]'],
    ].filter(([icon]) => gm || icon === 'find' || icon === 'first');   // players: their token and 1st person only, no say over vision (Brandon, October 27, 2026)
    openMenu(anchor, `<h5>View</h5>
      ${'' /* height and Show players live in the top bar, always in sight: not repeated here */}
      ${gm && $('[data-action="terrain-zones"]') ? `<div class="te-row" style="cursor:default">${svg('zones')}Zones${pressed('[data-action="terrain-zones"]') || pressed('[data-action="terrain-zones-players"]') ? '' : ' <span class="te-off">off</span>'}<span class="te-switch"><button class="${pressed('[data-action="terrain-zones"]') ? 'on' : ''}" data-sel='[data-action="terrain-zones"]' title="Zones on your screen">Me</button>${gm && $('[data-action="terrain-zones-players"]') ? `<button class="${pressed('[data-action="terrain-zones-players"]') ? 'on' : ''}" data-sel='[data-action="terrain-zones-players"]' title="Zones on the players' screens">Players</button>` : ''}</span></div>` : ''}
      ${rows.map(([icon, label, sel, sub]) => { const b = $(sel); if (!b || (sub && !$('[data-action="sight-test"][aria-pressed="true"]'))) return ''; const on = pressed(sel); return `<button class="te-row${on ? ' on' : ''}" data-sel='${sel}'>${svg(icon)}${typeof label === 'function' ? label() : label}${on ? '<span class="k">on</span>' : ''}</button>`; }).join('')}`,
    (m) => {
      m.querySelectorAll('[data-sel]').forEach((r) => r.onclick = () => { press(r.dataset.sel); setTimeout(() => { viewMenu(anchor); menuTool = 'view'; }, 60); });
      m.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { press(`[data-action="view-map-level-${b.dataset.l}"]`); setTimeout(() => { const n = m.querySelector('[data-l="name"]'); if (n) n.textContent = levelName(); refresh(); }, 80); });
    });
  }

  function markMenu(anchor) {
    const drawing = pressed('[data-action="toggle-draw"]');
    openMenu(anchor, `<h5>Mark the board</h5>
      <button class="te-row" data-m="templates">${svg('templates')}Template…<span class="k">circle · rectangle · wall</span></button>
      <button class="te-row${drawing ? ' on' : ''}" data-m="draw">${svg('draw')}${drawing ? 'Stop drawing' : 'Pen'}</button>
      <button class="te-row" data-m="clear">${svg('clear')}Clear my drawings</button>`, (m) => {
      m.querySelector('[data-m="templates"]').onclick = () => { closeMenu(); press('[data-action="open-templates"]'); setTimeout(() => besideStrip($('.vtt-template-menu'), anchor), 0); };
      m.querySelector('[data-m="draw"]').onclick = () => { closeMenu(); press('[data-action="toggle-draw"]'); setTimeout(refresh, 60); };
      m.querySelector('[data-m="clear"]').onclick = () => { closeMenu(); press('[data-action="clear-drawings"]'); };
    });
  }
  function editsMenu(anchor) {
    openMenu(anchor, `<h5>Map edits</h5>
      <button class="te-row${pressed('[data-action="map-edits"]') ? ' on' : ''}" data-m="edits">${svg('walls')}Walls, stairs, height, floors</button>
      <button class="te-row" data-m="fog">${svg('fog')}Fog of war</button>`, (m) => {
      m.querySelector('[data-m="edits"]').onclick = () => { closeMenu(); press('[data-action="map-edits"]'); setTimeout(refresh, 60); };
      m.querySelector('[data-m="fog"]').onclick = () => { closeMenu(); press('[data-settings-launch="fog"]'); };
    });
  }
  const key = (k, shift) => doc.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'Key' + k.toUpperCase(), ctrlKey: true, shiftKey: !!shift, bubbles: true, cancelable: true }));

  // The Templates menu places itself under its own (hidden) button: move it beside the strip button instead.
  function besideStrip(menuEl, anchor) {
    if (!menuEl || menuEl.hidden) return;
    const r = anchor.getBoundingClientRect();
    menuEl.style.left = r.right + 8 + 'px'; menuEl.style.top = Math.max(topBarBottom() + 6, Math.min(innerHeight - menuEl.offsetHeight - 6, r.top - 6)) + 'px'; menuEl.style.right = '';
  }

  function run(id, anchor) {
    const t = TOOLS.find((x) => x.id === id);
    if (t?.menu && menu && menuTool === id) { closeMenu(); return true; }   // pressed again: close its menu
    if (t?.menu === 'view') { viewMenu(anchor); menuTool = id; return true; }
    if (t?.menu === 'mark') { markMenu(anchor); menuTool = id; return true; }
    if (t?.menu === 'edits') { editsMenu(anchor); menuTool = id; return true; }
    if (id === 'undo') { key('z'); return true; }
    if (id === 'undoTurn') { key('z', true); return true; }
    if (id === 'endCombat') return status().combat ? press('[data-action="start-combat"]') : false;
    if (id === 'openScene' || id === 'showScene') {
      const sceneId = anchor;
      return press(`[data-action="${id === 'openScene' ? 'activate-scene' : 'show-scene-to-players'}"][data-scene-id="${CSS.escape(sceneId)}"]`);
    }
    if (t?.sel) {
      const ok = press(t.sel);
      if (t.menu === 'own') setTimeout(() => besideStrip($('.vtt-template-menu'), anchor), 0);
      setTimeout(refresh, 60);
      return ok;
    }
    // Table-wide things the table runs from its own rail.
    const table = {
      dice: '#vtt-dice-roller-btn', chat: '#chat-panel-toggle', test: '#vtt-ask-test-btn', scenes: '[data-settings-launch="scenes"]',
      tokens: '[data-settings-launch="tokens"]', startCombat: '[data-action="start-combat"]', endRound: '[data-action="end-round"]', malice: '[data-malice-button]', display: '[data-vtt-theme-settings-toggle]',
    };
    if (id === 'tracker') { const tr = $('.vtt-board__tracker'); tr?.classList.toggle('te-show'); return true; }
    return table[id] ? press(table[id]) : false;
  }

  // ---------------------------------------------------------------- the top bar: height, the fight, the tokens
  const top = doc.createElement('div'); top.id = 'te-top';
  top.innerHTML = `<span class="te-scene" data-scene></span><div class="te-height" data-h><button data-l="down" title="Lower viewing height">▼</button><span data-l="name">Height 0</span><button data-l="up" title="Raise viewing height">▲</button>${gm ? '<button class="te-show" data-l="show" title="Show this floor to the players">Show players</button>' : ''}</div><div class="te-fight" data-fight hidden></div><div class="te-tokens"></div>`;
  // The fight's buttons (Director: start/end, end round, malice; everyone: undo). Each presses the board's own button.
  const fightBar = doc.createElement('div'); fightBar.className = 'te-combat';
  fightBar.innerHTML = (gm ? '<button data-c="start" title="Start or end the fight">Start combat</button><button data-c="round" title="End the current round early" hidden>End round</button><button data-c="malice" title="Malice" hidden>Malice</button>' : '')
    + '<button data-c="undo" title="Undo the last action (Ctrl+Z). Shift-click: undo the whole turn (Ctrl+Shift+Z)">↶ Undo</button>';
  top.querySelector('.te-tokens')?.before(fightBar);
  fightBar.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', (e) => {
    const c = b.dataset.c;
    if (c === 'start') press('[data-action="start-combat"]');
    else if (c === 'round') press('[data-action="end-round"]');
    else if (c === 'malice') press('[data-malice-button]');
    else if (c === 'undo') key('z', e.shiftKey);
    setTimeout(paintTop, 120);
  }));
  top.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
    const l = b.dataset.l; if (l === 'name') return;
    press(l === 'show' ? '[data-action="activate-map-level"]' : `[data-action="view-map-level-${l}"]`); setTimeout(paintTop, 80);
  }));
  function paintTop() {
    const nav = $('[data-map-level-nav]'), levels = nav && !nav.hidden;
    const h = top.querySelector('[data-h]'); h.style.display = levels ? '' : 'none';
    if (levels) top.querySelector('[data-l="name"]').textContent = levelName() || 'Height 0';
    const st = status(), fight = top.querySelector('[data-fight]');
    const sn = top.querySelector('[data-scene]'); if (sn && sn.textContent !== st.scene) sn.textContent = st.scene;
    fight.hidden = !st.combat; if (st.combat) fight.textContent = `Round ${st.round} · ${st.turn || ''}`;
    const startBtn = fightBar.querySelector('[data-c="start"]');
    if (startBtn) { const t = st.combat ? 'End combat' : 'Start combat'; if (startBtn.textContent !== t) startBtn.textContent = t; startBtn.classList.toggle('on', st.combat); }
    const roundBtn = fightBar.querySelector('[data-c="round"]'); if (roundBtn) roundBtn.hidden = !st.combat;
    const maliceBtn = fightBar.querySelector('[data-c="malice"]'); if (maliceBtn) { maliceBtn.hidden = !st.combat; const t = `Malice ${st.malice || 0}`; if (maliceBtn.textContent !== t) maliceBtn.textContent = t; }
    // The token bar starts right after whatever is on the left of the top bar.
    // Two rows: the token bar takes the whole second row, from the bar's own left edge.
    const r = top.getBoundingClientRect();
    doc.documentElement.style.setProperty('--te-tracker-left', Math.round(r.left + 6) + 'px');
  }

  // ---------------------------------------------------------------- the strip
  const strip = doc.createElement('nav'); strip.id = 'te-strip'; strip.setAttribute('aria-label', 'Map tools');
  function build() {
    strip.innerHTML = '';
    TOOLS.forEach((t) => {
      if (t.sep) { const s = doc.createElement('div'); s.className = 'te-sep'; strip.append(s); return; }
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'te-btn' + (t.gm ? ' gm' : ''); b.dataset.tool = t.id; b.innerHTML = svg(t.id);
      b.addEventListener('mouseenter', () => showTip(b, t)); b.addEventListener('mouseleave', hideTip);
      b.addEventListener('click', () => { hideTip(); run(t.id, b); });
      strip.append(b);
    });
    doc.body.append(strip, top);
    refresh();
  }
  function refresh() {
    TOOLS.forEach((t) => { if (t.sep) return; const on = t.on ? t.on() : t.toggle ? pressed(t.sel) : false; strip.querySelector(`[data-tool="${t.id}"]`)?.classList.toggle('on', on); });
    const lv = strip.querySelector('[data-level]'); const nav = $('[data-map-level-nav]');
    if (lv) lv.textContent = nav && !nav.hidden ? levelName().replace(/^Height\s*/i, 'H') : '';
  }
  new MutationObserver(refresh).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-expanded', 'class', 'hidden'] });
  // The board's Damage / Heal box opens in the top-left corner (inline 16px, 16px), over the strip and the top bar:
  // it opens beside the strip and under the top bar instead. Dragged afterwards, it stays where it is put.
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1 || !n.classList.contains('vtt-damage-heal') || n.style.left !== '16px' || n.style.top !== '16px') return;
    n.style.left = (doc.documentElement.classList.contains('te-docked') ? 16 : 52) + 'px'; n.style.top = Math.round(topBarBottom() + 8) + 'px';
  }))).observe(doc.body, { childList: true });

  // ---------------------------------------------------------------- live state for the table's rail
  function status() {
    const tracker = $('[data-combat-tracker]');
    const combat = tracker?.dataset.combatActive === 'true';
    const pips = doc.querySelectorAll('[data-malice-pips] .vtt-malice__pip').length;
    let heroes = [];
    try {
      // Heroes: tokens linked to a sheet, or any non-enemy token (the Table matches them to heroes by name).
      heroes = (window.VTTBoardCallbacks?.getActiveScenePlacements?.() || []).filter((p) => p.characterProfileId || p.profileId || String(p.combatTeam || p.team || '').toLowerCase() !== 'enemy')
        .map((p) => ({ id: p.id, name: p.name, hp: Number(p.hp?.current ?? p.hitPoints?.current), max: Number(p.hp?.max ?? p.hitPoints?.max), temp: Math.max(0, Number(p.tempStamina) || 0) }));
    } catch (_) { /* board not ready */ }
    return {
      scene: ($('#active-scene-name')?.textContent || '').trim(), level: $('[data-map-level-nav]')?.hidden === false ? levelName() : '',
      combat, round: combat ? Number($('[data-round-value]')?.textContent) || 1 : 0, turn: ($('[data-turn-indicator]')?.textContent || '').trim(),
      waiting: [...doc.querySelectorAll('[data-combat-tracker-waiting] [data-combatant-id], [data-combat-tracker-waiting] > *')].length,
      malice: pips, trackerShown: !!$('.vtt-board__tracker.te-show'), heroes, gm,
      chatOpen: !!$('#chat-panel:not(.chat-panel--closed)'),
      sceneId: window.vtt3dBridge?.getContext?.().sceneId || '',
      playerSceneId: (() => { const it = [...doc.querySelectorAll('.scene-item')].find((n) => /Players/.test(n.querySelector('.scene-item__status')?.textContent || '')); return it?.dataset.sceneId || ''; })(),
      playerSceneName: (() => { const it = [...doc.querySelectorAll('.scene-item')].find((n) => /Players/.test(n.querySelector('.scene-item__status')?.textContent || '')); return it?.querySelector('h4')?.textContent || ''; })(),
      // Heroes on the scene the players see, when the Director has another one open (their stamina stays in sight).
      partyHeroes: (() => { try {
        const bs = window.terrainContext?.()?.state?.boardState, pid = (() => { const it = [...doc.querySelectorAll('.scene-item')].find((n) => /Players/.test(n.querySelector('.scene-item__status')?.textContent || '')); return it?.dataset.sceneId || ''; })();
        if (!bs || !pid || pid === bs.activeSceneId) return [];
        return (bs.placements?.[pid] || []).filter((p) => p.characterProfileId || p.profileId || String(p.combatTeam || p.team || '').toLowerCase() !== 'enemy')
          .map((p) => ({ id: p.id, name: p.name, hp: Number(p.hp?.current ?? p.hitPoints?.current), max: Number(p.hp?.max ?? p.hitPoints?.max), temp: Math.max(0, Number(p.tempStamina) || 0) }));
      } catch (_) { return []; } })(),
      foes: (() => { try { return (window.VTTBoardCallbacks?.getActiveScenePlacements?.() || []).filter((p) => String(p.combatTeam || p.team || '').toLowerCase() === 'enemy' && !p.hidden).length; } catch (_) { return 0; } })(),
      onMap: (() => { try { return (window.VTTBoardCallbacks?.getActiveScenePlacements?.() || []).map((p) => p.name); } catch (_) { return []; } })(),
      chatCount: (() => { try { return window.dashboardChat?.getMessages?.().length || 0; } catch (_) { return 0; } })(),
      acted: [...doc.querySelectorAll('[data-combat-tracker-completed] .vtt-combat-token')].map((n) => n.getAttribute('title') || n.getAttribute('aria-label') || ''),
      waitingNames: [...doc.querySelectorAll('[data-combat-tracker-waiting] .vtt-combat-token')].map((n) => n.getAttribute('title') || n.getAttribute('aria-label') || ''),
      foeList: (() => { try { return (window.VTTBoardCallbacks?.getActiveScenePlacements?.() || []).filter((p) => String(p.combatTeam || p.team || '').toLowerCase() === 'enemy' && !p.hidden).map((p) => ({ name: p.name, hp: Number(p.hp?.current), max: Number(p.hp?.max) })); } catch (_) { return []; } })(),
    };
  }

  function dock(on) { doc.documentElement.classList.toggle('te-docked', !!on); setTimeout(() => dispatchEvent(new Event('resize')), 30); }

  window.vttEmbed = { tools: () => TOOLS.map(({ sel, on, ...t }) => t), run, status, dock, refresh, isActive: (id) => { const t = TOOLS.find((x) => x.id === id); return !!t && (t.on ? t.on() : !!t.sel && t.toggle && pressed(t.sel)); } };
  build();
  setInterval(() => { try { paintTop(); } catch (_) { /* not ready */ } }, 1000);
  setTimeout(() => dispatchEvent(new Event('resize')), 50);
  window.parent?.postMessage?.({ type: 'vtt-embed-ready' }, location.origin);
})();
