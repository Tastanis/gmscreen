/* The Table — the rail and what each thing opens.
   Served by the site (http): real board, real scenes, real monsters, real pages and chat.
   Opened as a file: the same layout with made-up data, for looking at the design alone.
   A list or menu closes itself once you pick; a window stays until you close it. */
(function () {
  'use strict';
  const T = window.Table, { $, el } = T;
  const SERVED = /^https?:$/.test(location.protocol) && !/[?&]mock\b/.test(location.search);
  let playerView = false;
  let me = { user: '', gm: true };   // set from the server at start
  // Map quality (board3d/quality.mjs, shared with the board through this browser's storage).
  let MQ = null;
  if (SERVED) import('/dnd/vtt/board3d/quality.mjs').then((m) => { MQ = m; }).catch(() => { MQ = null; });

  // ---------------------------------------------------------------- icons (simple line drawings)
  const I = {
    heroes: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .1 5.5 2.4 5.5 5.8"/>',
    scenes: '<path d="M7 3l5 2 5-2v13l-5 2-5-2z"/><path d="M3 7l4-1M21 7l-4-1M3 7v13l4-1M21 7v13l-4-1"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    creatures: '<path d="M12 3c-4.4 0-8 3.2-8 7.3 0 2.4 1.2 4.4 3 5.7V20h10v-4c1.8-1.3 3-3.3 3-5.7C20 6.2 16.4 3 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2M14 20v-2"/>',
    combat: '<path d="M4 20l9-9M14.5 3.5L20 4l.5 5.5L11 19l-2-2zM4 4l6 6M20 20l-6-6M3 17l4 4"/>',
    dice: '<path d="M12 2l8 6-3 11H7L4 8z"/><path d="M12 2v7M4 8l8 1 8-1M7 19l5-10 5 10"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    test: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M8.5 13l2.5 2.5 4.5-5"/>',
    projects: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M15.5 16.5l1.5 1.5 3-3"/>',
    relations: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/><path d="M9 11h6"/>',
    malice: '<path d="M12 21c4 0 7-2.8 7-6.6 0-3-2-5-3.5-6.9-.4 1.9-1.4 3-2.6 3.4.4-3.4-1-6.4-3.9-7.9.3 3.3-1.5 5.4-3 7.3C4.8 12 5 13 5 14.4 5 18.2 8 21 12 21z"/>',
    people: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.6-2 2-3 3.5-3s2.9 1 3.5 3M14 9h4M14 12h4"/>',
    campus: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6M12 5V2"/>',
    notes: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>',
    rules: '<path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z"/>',
    workshop: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M12.5 8.5L4 17l3 3 8.5-8.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    layouts: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
    logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
    tokens: '<circle cx="8" cy="8" r="4.5"/><circle cx="16" cy="16" r="4.5"/><path d="M15 4.5h5M17.5 2v5"/>',
    arcane: '<path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/>',
    player: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    picture: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
    radio: '<circle cx="12" cy="12" r="7"/>', radioOn: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
    play: '<path d="M7 4l12 8-12 8z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    bar: '<rect x="3" y="4" width="18" height="6" rx="1"/><path d="M3 14h18M3 18h12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    // map tools (when they dock onto the rail)
    measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    mark: '<path d="M4 20l4-1 9-9-3-3-9 9z"/><circle cx="17" cy="17" r="4" stroke-dasharray="2 2"/>',
    damage: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z"/><path d="M8 12h2l1.5-3 2 5 1.5-2H16"/>',
    view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edits: '<path d="M3 5h18v14H3z"/><path d="M3 10h18M3 15h18M8 5v5M15 5v5M11 10v5M6 15v4M17 15v4"/>',
    templates: '<circle cx="8" cy="8" r="5"/><rect x="11" y="11" width="10" height="10" rx="1"/>',
    draw: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${I[k] || ''}</svg>`;
  const colors = ['#c9a36b', '#9fb7d9', '#d99f8c', '#a7cf8e', '#c7a3d9', '#e0c27a', '#8fc9c4', '#d9b0a0'];
  const tint = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `linear-gradient(135deg, ${colors[h % colors.length]}, ${colors[(h >>> 3) % colors.length]})`; };
  const initials = (s) => String(s).split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem('table-proto-' + k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('table-proto-' + k, JSON.stringify(v)); } catch (_) { /* no storage */ } } };

  // ---------------------------------------------------------------- heroes (portraits are the dashboard's pictures)
  // The heroes: the site's player roster, players who are on (dnd/api/campaign.php?action=heroes), filled in at start.
  // The list below is only for the file version and as a fallback.
  const HERO_FALLBACK = {
    indigo: { sub: 'Talent · Telepathy', pic: 'indigo_portrait_1750287056.jpg' }, zepha: { sub: 'Elementalist', pic: 'zepha_portrait_1750214726.png' },
    cal: { sub: 'Censor', pic: 'cal_portrait_1750214637.png' }, sharon: { sub: 'Shadow · Fire Starter', pic: 'sharon_portrait_1750262899.png' },
  };
  const HEROES = [
    { id: 'indigo', name: 'Indigo', sub: 'Talent · Telepathy', hp: [19, 36], pic: 'indigo_portrait_1750287056.jpg' },
    { id: 'zepha', name: 'Zepha', sub: 'Elementalist', hp: [30, 30], pic: 'zepha_portrait_1750214726.png' },
    { id: 'cal', name: 'Cal', sub: 'Censor', hp: [41, 45], pic: 'cal_portrait_1750214637.png' },
    { id: 'sharon', name: 'Sharon', sub: 'Shadow · Fire Starter', hp: [14, 33], pic: 'sharon_portrait_1750262899.png' },
  ];
  const portrait = (h) => (h?.picUrl && SERVED ? `url('${h.picUrl}') center 22% / cover no-repeat, ` : h?.pic && SERVED ? `url(/dnd/portraits/${h.pic}) center 22% / cover no-repeat, ` : '') + tint(h.name);
  async function loadHeroes() {
    if (!SERVED) return;
    try {
      const r = await fetch('/dnd/api/campaign.php?action=heroes', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || (!j.success && /log ?in|signed|session|not logged/i.test(String(j.error || '')))) { location.href = '/dnd/index.php'; return; }
      if (j.success) { me = { user: j.user || '', gm: !!j.is_gm }; playerView = !me.gm; }
      if (!j.success || !Array.isArray(j.heroes) || !j.heroes.length) return;
      const list = j.heroes.map((x) => {
        const known = HERO_FALLBACK[x.id] || {};
        const pic = x.portrait ? (/^(https?:)?\//.test(x.portrait) ? x.portrait : '/dnd/' + String(x.portrait).replace(/^\.?\//, '')) : '';
        return { id: x.id, name: x.name || x.id, sub: known.sub || x.character_name || '', hp: [null, null], picUrl: pic, pic: pic ? '' : known.pic, own: x.own !== false };
      });
      HEROES.length = 0; HEROES.push(...list);
    } catch (_) { /* keep the fallback list */ }
  }

  // ---------------------------------------------------------------- made-up data for the file version
  const MOCK_SCENES = { folders: [{ id: 'a', name: 'Strixhaven — this arc' }, { id: 'b', name: 'Dungeons' }], items: [
    { id: 's1', name: 'The Gravity Orchard v4', folderId: 'a' }, { id: 's2', name: 'Medpilis', folderId: 'a' }, { id: 's3', name: 'Witherbloom Bathhouse', folderId: 'a' },
    { id: 's4', name: 'Dead Root', folderId: 'b' }, { id: 's5', name: 'Delian Tomb — Level 1', folderId: 'b' }] };
  const MOCK_MONSTERS = [['Orchard Tender', 4, 'Elite Brute', 'Witherbloom'], ['Driftstone', 3, 'Platoon Controller', 'Gravity Orchard'], ['Mist Wisp', 2, 'Minion Harrier', 'Gravity Orchard'],
    ['Goblin Warrior', 1, 'Minion Brute', 'Goblins'], ['Goblin Sniper', 1, 'Minion Artillery', 'Goblins'], ['Goblin Underboss', 2, 'Leader Support', 'Goblins'], ['Kragen Spawn', 3, 'Platoon Ambusher', 'Kragen'],
    ['Kragen Matriarch', 5, 'Solo', 'Kragen'], ['Ink Devourer', 4, 'Elite Hexer', 'Silverquill'], ['Pest Swarm', 1, 'Minion Harrier', 'Witherbloom'], ['Lorehold Spirit', 3, 'Platoon Defender', 'Lorehold']]
    .map(([name, level, role, folder], i) => ({ id: 'm' + i, name, level, role, sourceFolderParts: [folder] }));
  const RULES = ['Conditions', 'Tests & Studying', 'Project rules', 'Skills', 'Falling & Jumping', 'Breakthrough', 'Respites', 'Negotiation', 'Universal Actions'];

  // ---------------------------------------------------------------- the real board (in the map window) and live state
  const vttFrame = () => { const f = T.windows.get('map')?.node.querySelector('iframe'); return f?.contentWindow?.vttEmbed ? f : null; };
  // Runs fn on the board in the map window. Without open it never opens or uncovers the map (Brandon, October 27,
  // 2026: a button opens only the thing asked for) and answers false when there is no board; with open, the map is
  // the thing asked for (a scene opened for yourself), so it is opened and brought into view.
  function withVtt(fn, open = false) {
    if (!SERVED) return false;
    let w = T.windows.get('map');
    if (!w && !open) return false;
    if (open) { w = apps.map(); if (w.state.dock && !w.state.open) T.setOpen(w, true); }   // opening it again restores and focuses it
    const go = (n = 0) => { const f = vttFrame(); if (f) { fn(f.contentWindow.vttEmbed, f); return; } if (n < 300) setTimeout(() => go(n + 1), 100); };
    go(); return true;
  }
  // Who you are, chat, scenes: the board page carries them (window.vttConfig).
  let siteCfg = null;
  T.siteConfig = () => { if (siteCfg) return siteCfg; const f = vttFrame(); const c = f?.contentWindow?.vttConfig; if (c) siteCfg = c; return siteCfg || window.TABLE_CONFIG || null; };
  // A Table file's address with this build's version on it, so no old copy is used after a deploy.
  const vers = (url) => url + (url.includes('?') ? '&' : '?') + 'v=' + (window.TABLE_BUILD || 0);

  let live = null, lastChatSeen = store.get('chat-seen', null);
  function pollLive() {
    const f = vttFrame();
    try { live = f ? f.contentWindow.vttEmbed.status() : null; } catch (_) { live = null; }
    if (live && lastChatSeen === null && live.chatCount) { lastChatSeen = live.chatCount; store.set('chat-seen', lastChatSeen); }   // count from the first look, not from the start of time
    const chatWin = T.windows.get('chat');
    if (live && chatWin && !chatWin.state.min && (!chatWin.state.dock || chatWin.state.open)) { lastChatSeen = live.chatCount; store.set('chat-seen', lastChatSeen); }
    paintLive(); paintDockState();
  }
  if (SERVED) setInterval(pollLive, 1000);
  // A map asleep long enough on a lighter quality level is unloaded: look again every 15 seconds.
  if (SERVED) setInterval(() => T.refreshWork(), 15000);
  // A hero's token on the board: linked tokens first, else a token with the hero's name.
  const shortScene = (n) => String(n || '').replace(/^the\s+/i, '').replace(/\s+v\d+$/i, '');   // "The Gravity Orchard v4" -> "Gravity Orchard"
  const findHero = (list, n) => list.find((h) => String(h.name).toLowerCase() === n) || list.find((h) => String(h.name).toLowerCase().split(/\s+/)[0] === n);
  const liveHero = (name) => { const n = name.toLowerCase(); const here = findHero(live?.heroes || [], n); if (here) return here; const there = findHero(live?.partyHeroes || [], n); return there ? { ...there, elsewhere: live?.playerSceneName || 'the players\u2019 map' } : null; };
  // The heroes' Stamina comes from their character sheets, the truth (Brandon, October 27, 2026: the cards showed the
  // tokens on the players' map, which can be behind the sheets). Read every few seconds; one word while no sheet changed.
  let sheetVitals = {}, vitalsStamp = '';
  async function readSheetVitals() {
    if (!SERVED || document.hidden) return;
    try {
      const j = await (await fetch('/dnd/character_sheet/handler.php?action=party-vitals' + (vitalsStamp ? '&since=' + encodeURIComponent(vitalsStamp) : ''), { credentials: 'same-origin', cache: 'no-store' })).json();
      if (!j?.success || j.unchanged) return;
      vitalsStamp = String(j.stamp || ''); sheetVitals = j.party || {}; paintLive();
    } catch (_) { /* next time */ }
  }
  if (SERVED) { setTimeout(readSheetVitals, 0); setInterval(readSheetVitals, 4000); }
  // [stamina, max, on a map, temp, the other map it is on]: the sheet's numbers; where the token is, from the board.
  const heroHp = (h) => {
    const r = liveHero(h.name), v = sheetVitals[h.id];
    if (v?.hasStamina) return [v.currentStamina, v.staminaMax, !!r, v.tempStamina || 0, r?.elsewhere || ''];
    if (r && Number.isFinite(r.hp) && r.max) return [r.hp, r.max, true, r.temp || 0, r.elsewhere || ''];
    return SERVED ? [null, null, !!r, 0, ''] : h.hp;
  };
  const hpText = (a, m, on, t) => (m ? `${a} / ${m}${t ? ` +${t}` : ''}` : on ? 'on the map' : 'not on the map');

  // Live marks on rail buttons: a small word under the icon, and at most one number badge.
  function paintLive() {
    const btn = (k) => document.querySelector(`#rail [data-k="${k}"]`);
    const micro = (k, text, cls = '') => { const b = btn(k); if (!b) return; let n = b.querySelector('.micro'); if (!text) { n?.remove(); b.classList.remove('has-micro'); return; } if (!n) { n = el('span', 'micro'); b.append(n); } n.textContent = text; n.className = 'micro ' + cls; b.classList.add('has-micro'); };
    const badge = (k, text, cls = '') => { const b = btn(k); if (!b) return; let n = b.querySelector('.count'); if (!text) { n?.remove(); return; } if (!n) { n = el('span', 'count'); b.append(n); } n.textContent = text; n.className = 'count ' + cls; };
    const L = live || {};
    micro('combat', L.combat ? 'R' + L.round : '', 'hot');
    badge('combat', L.combat && L.malice && !playerView ? String(L.malice) : '', 'malice');
    // The height as H + number (a player's label may have no number: then nothing).
    const hNum = String(L.level || '').match(/-?\d+(\.\d+)?/);
    micro('scenes', hNum ? 'H' + hNum[0] : '');
    const apart = L.sceneId && L.playerSceneId && L.sceneId !== L.playerSceneId && !playerView;
    badge('scenes', apart ? '!' : '', 'warn');
    { const sb = btn('scenes'), n = sb?.querySelector('.count'); if (n) n.title = 'The players see a different scene than you'; }
    const unread = L.chatCount && L.chatCount > lastChatSeen ? L.chatCount - lastChatSeen : 0;
    badge('chat', unread ? String(Math.min(unread, 99)) : '', 'unread');
    // New messages while chat is tucked away or minimised: its tab (or tray chip) flashes until you look.
    const cw = T.windows.get('chat');
    if (cw) { cw.tab?.classList.toggle('flash', !!unread); cw.chip?.classList.toggle('flash', !!unread); btn('chat')?.classList.toggle('flash', !!unread && !cw.tab); }
    else btn('chat')?.classList.toggle('flash', !!unread);
    // Heroes: one thin stamina bar each, inside the button.
    const hb = btn('heroes');
    if (hb) {
      let bars = hb.querySelector('.bars'); if (!bars) { bars = el('span', 'bars'); hb.append(bars); }
      bars.innerHTML = HEROES.map((h) => { const [a, m] = heroHp(h); const r = m ? a / m : 1; return `<i title="${h.name}" style="background:${!m ? '#5a4a3a' : a <= 0 ? '#c0392b' : r <= .5 ? '#e0a040' : '#5fbf7a'}"></i>`; }).join('');
      const hurt = HEROES.filter((h) => { const [a, m] = heroHp(h); return m && a <= m / 2; }).length;
      badge('heroes', hurt ? String(hurt) : '', 'hurt');
      const hc = hb.querySelector('.count'); if (hc) hc.title = `${hurt} hero${hurt > 1 ? 'es' : ''} at half stamina or less`;
    }
    const m = T.windows.get('map'); if (m && L.scene) { const em = m.node.querySelector('.title em'); const t = L.scene; if (em && em.textContent !== t) em.textContent = t; }
    const acted = new Set((L.combat ? L.acted || [] : []).map((n) => String(n).toLowerCase()));
    document.querySelectorAll('.card[data-hero]').forEach((c) => { const h = HEROES.find((x) => x.id === c.dataset.hero); if (!h) return; const [a, mx, on, t] = heroHp(h); const s = c.querySelector('.hp span'), b = c.querySelector('.hp b'); if (s) s.style.width = (mx ? Math.round(100 * Math.max(0, a) / mx) : 0) + '%'; if (b) b.textContent = hpText(a, mx, on, t);
      // Temp stamina: blue from the right, in the same bar.
      let tb = c.querySelector('.hp i.tmp'); if (!tb && c.querySelector('.hp')) { tb = el('i', 'tmp'); c.querySelector('.hp').insertBefore(tb, b); } if (tb) tb.style.width = (mx && t ? Math.min(100, Math.round(100 * t / mx)) : 0) + '%'; c.classList.toggle('winded', !!mx && a > 0 && a <= mx / 2); c.classList.toggle('dying', !!mx && a <= 0); c.classList.toggle('offmap', !mx); c.classList.toggle('acted', acted.has(h.name.toLowerCase()));
      const where = heroHp(h)[4]; let wt = c.querySelector('.where'); if (where) { if (!wt) { wt = el('span', 'where'); c.append(wt); } wt.textContent = 'on ' + shortScene(where); wt.title = 'On the map the players see: ' + where; wt.title = 'On the map the players see'; } else wt?.remove(); });
    paintFight(L);
  }

  // The fight at a glance, under the hero cards: round, whose turn, malice, the foes' stamina.
  function paintFight(L) {
    let p = $('#fight-panel');
    if (!L.combat || playerView && false) { if (p) p.hidden = true; return; }
    if (!p) { p = el('div', ''); p.id = 'fight-panel'; $('#table').append(p); }
    const cards = [...document.querySelectorAll('.card[data-hero]')];
    const left = cards.length ? Math.min(...cards.map((c) => c.offsetLeft)) : 24;
    const top = cards.length ? Math.max(...cards.map((c) => c.offsetTop + c.offsetHeight)) + 12 : 24;
    const width = cards.length ? Math.max(220, Math.max(...cards.map((c) => c.offsetLeft + c.offsetWidth)) - left) : 232;
    Object.assign(p.style, { left: left + 'px', top: top + 'px', width: width + 'px' });
    const enemies = /enemy|foe|monster/i.test(L.turn || '');
    const foes = {}; (L.foeList || []).forEach((f) => { const k = f.name; (foes[k] ||= { name: k, n: 0, hp: 0, max: 0 }); foes[k].n += 1; foes[k].hp += Number.isFinite(f.hp) ? f.hp : 0; foes[k].max += Number.isFinite(f.max) ? f.max : 0; });
    p.hidden = false;
    p.className = enemies ? 'foes-turn' : 'heroes-turn';
    p.innerHTML = `<div class="fp-head"><b>Round ${L.round}</b><span>${esc(L.turn || '')}</span>${playerView ? '' : `<span class="mal">${L.malice} malice</span>`}</div>
      <div class="fp-acted">${(L.acted || []).length ? 'Acted: ' + L.acted.map(esc).join(', ') : 'Nobody has acted yet'}</div>
      ${playerView ? '' : Object.values(foes).map((f) => { const r = f.max ? f.hp / f.max : 1; return `<div class="fp-foe"><span>${esc(f.name)}${f.n > 1 ? ` ×${f.n}` : ''}</span><span class="hpbar"><span style="width:${Math.round(r * 100)}%;background:#c0533e"></span><b>${f.max ? f.hp + ' / ' + f.max : '—'}</b></span></div>`; }).join('')}`;
  }
  // Buttons for the map (creatures, combat) only show while a map is open.
  setInterval(() => document.body.classList.toggle('no-map', !T.windows.has('map')), 400);

  // ---------------------------------------------------------------- windows ("apps")
  const apps = {};

  // A site page in a window: its own frame (own code and memory, freed on close), with the page's own top bar,
  // close/logout/back buttons, version line and its private dice and chat left out (the Table has those).
  const PAGES = {
    'Students': ['/dnd/strixhaven/students/', 'people', [760, 580]], 'Staff': ['/dnd/strixhaven/staff/', 'people', [760, 580]], 'Other NPCs': ['/dnd/strixhaven/othernpcs/', 'people', [760, 580]],
    'Campus map': ['/dnd/strixhaven/map3d/index.php', 'campus', [820, 600]], 'Locations': ['/dnd/strixhaven/locations/', 'campus', [700, 560]], 'Schedule': ['/dnd/schedule/', 'campus', [820, 600]],
    'GM notes': ['/dnd/strixhaven/gm/', 'notes', [860, 620]], 'Monster Creator': ['/dnd/strixhaven/monster-creator/', 'workshop', [960, 660]], 'Templates': ['/dnd/strixhaven/templates/', 'workshop', [800, 600]],
    'Arcane Construction': ['/dnd/strixhaven/arcaneconstruction/', 'workshop', [800, 600]], 'Players': ['/dnd/players.php', 'heroes', [640, 540]], 'Campaign record': ['/dnd/dashboard.php', 'heroes', [960, 660]],
    'Projects': ['/dnd/campaign/index.php?view=projects&character=all', 'projects', [980, 680]], 'Relationships': ['/dnd/campaign/index.php?view=relationships&character=all', 'relations', [980, 680]],
    'Conditions': ['/dnd/rules/conditions/index.html'], 'Tests & Studying': ['/dnd/rules/tests-studying/index.html'], 'Project rules': ['/dnd/rules/projects/index.html'], 'Skills': ['/dnd/rules/skills/index.html'],
    'Falling & Jumping': ['/dnd/rules/fall-jump/index.html'], 'Breakthrough': ['/dnd/rules/breakthrough/index.html'], 'Respites': ['/dnd/rules/respites/index.html'], 'Negotiation': ['/dnd/rules/negotiation/index.html'], 'Universal Actions': ['/dnd/rules/universal-actions/index.html'],
  };
  const PAGE_CHROME = '.strix-mini-nav,.strix-mini-nav-spacer,.nav-btn,.logout-btn,.version-footer,.back-btn,.dice-roller-launch,#chat-panel,#chat-panel-toggle,.chat-panel-toggle,#chat-whisper-popouts,button.close-btn[onclick*="window.close"]{display:none!important}body{padding-top:0!important}';
  function framePage(c, url) {
    c.innerHTML = `<iframe src="${url}" class="page-frame" style="opacity:0"></iframe><div class="loading">Opening…</div>`;
    const f = $('iframe', c);
    f.addEventListener('load', () => {
      try {
        const d = f.contentDocument;
        if (!/\/dnd\/table\/(chat|test|dice)\.php/.test(url)) { const st = d.createElement('style'); st.textContent = PAGE_CHROME; d.head.append(st); }
        // Older site pages get the compact window look (dnd/table/pages-embed.css/js), in the sheet's theme.
        if (!/\/dnd\/(table\/(chat|test|dice)\.php|campaign\/|character_sheet\/)/.test(url)) {
          let theme = 'diablo'; try { theme = localStorage.getItem('sheet-theme') === 'parchment' ? 'parchment' : 'diablo'; } catch (_) { /* no storage */ }
          d.documentElement.classList.add('in-table', theme);
          const css = d.createElement('link'); css.rel = 'stylesheet'; css.href = vers('/dnd/table/pages-embed.css'); d.head.append(css);
          const js = d.createElement('script'); js.src = vers('/dnd/table/pages-embed.js'); d.body.append(js);
        }
        d.querySelectorAll('button, a').forEach((b) => { if (/^(logout|←\s*back.*|back to .*)$/i.test((b.textContent || '').trim())) b.style.display = 'none'; });
      } catch (_) { /* another site */ }
      f.style.opacity = 1; $('.loading', c)?.remove();
    });
  }
  // Heavy pages (the 3D campus map) follow the map quality too: asleep long enough on a lighter level, they unload.
  const HEAVY_PAGES = new Set(['Campus map']);
  function pageWork(w, level) {
    const f = w.node.querySelector('iframe'); if (!f) return;
    const q = MQ ? MQ.quality() : null;
    if (level === 'sleep') {
      w.sleptAt = w.sleptAt || Date.now();
      if (q?.unloadAfterMs && !w.unloaded && Date.now() - w.sleptAt > q.unloadAfterMs) { w.unloaded = f.src; f.src = 'about:blank'; }
    } else { w.sleptAt = 0; if (w.unloaded) { const url = w.unloaded; w.unloaded = null; f.style.opacity = 0; f.src = url; } }
  }
  apps.page = (title) => {
    const known = PAGES[title], url = SERVED && known?.[0];
    return T.openWindow({ id: 'page-' + title, app: 'page', arg: title, title, icon: I[known?.[1] || 'rules'], size: known?.[2] || [600, 560],
      heavy: HEAVY_PAGES.has(title), onWork: HEAVY_PAGES.has(title) ? pageWork : undefined,
      build(c) { if (url) { framePage(c, url); return; } c.innerHTML = `<div class="pad"><h3 style="margin:0 0 6px;font-family:Georgia">${esc(title)}</h3><p class="muted">The real page opens here when the Table is served by the site.</p></div>`; } });
  };

  apps.sheet = (id) => {
    const h = HEROES.find((x) => x.id === id) || HEROES[0];
    return T.openWindow({ id: 'sheet-' + h.id, app: 'sheet', arg: h.id, title: h.name, sub: 'Sheet', icon: I.heroes, size: SERVED ? [860, 640] : [380, 470], share: true,
      build(c) {
        if (SERVED) { framePage(c, '/dnd/character_sheet/index.php?character=' + encodeURIComponent(h.id)); return; }
        const [a, m] = heroHp(h);
        c.innerHTML = `<div class="sheet-top"><div class="pic" style="background:${portrait(h)}">${initials(h.name)}</div><div><h2>${h.name}</h2><p>${h.sub}</p></div></div>
          <div class="sec"><h4>Stamina</h4><div class="pad">${a} / ${m}</div></div><div class="sec"><h4>The real sheet</h4><div class="pad muted">Opens here when the Table is served by the site.</div></div>`;
      } });
  };
  // The map's hero panel asks for the full sheet.
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.type === 'table-open-sheet' && e.data.character) apps.sheet(String(e.data.character).toLowerCase()); });
  const heroCard = (h) => ({ id: 'card-' + h.id, hero: h.id, app: 'heroCard', arg: h.id, name: h.name, sub: h.sub.split('·')[0], initials: (h.pic || h.picUrl) && SERVED ? '' : initials(h.name), color: (h.pic || h.picUrl) && SERVED ? '#14100c' : tint(h.name), hp: heroHp(h), onAdd: (node) => wireArt(node, h), open: () => (playerView && h.own === false ? T.toast(`Only ${h.name}’s player and the Director open that sheet`) : apps.sheet(h.id)) });
  apps.heroCard = (id, x, y, w) => { const h = HEROES.find((q) => q.id === id); if (h) T.addCard(heroCard(h), x, y, w); };

  // Card pictures: shrunk once at high quality (a 2048px portrait squashed by the browser into a small box looks
  // jagged), framed toward the upper middle; the wheel over a picture zooms toward the pointer, kept per hero.
  const thumbs = new Map();
  function thumbOf(url, size = 480) {
    if (!url) return Promise.resolve('');
    if (!thumbs.has(url)) thumbs.set(url, (async () => {
      try {
        const blob = await (await fetch(url, { credentials: 'same-origin' })).blob();
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
        const small = await createImageBitmap(bmp, { resizeWidth: Math.max(1, Math.round(bmp.width * k)), resizeHeight: Math.max(1, Math.round(bmp.height * k)), resizeQuality: 'high' });
        const cv = document.createElement('canvas'); cv.width = small.width; cv.height = small.height; cv.getContext('2d').drawImage(small, 0, 0);
        return await new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : url), 'image/webp', .9));
      } catch (_) { return url; }
    })());
    return thumbs.get(url);
  }
  const ART_KEY = 'table-proto-art';
  const artFrames = (() => { try { return JSON.parse(localStorage.getItem(ART_KEY) || '{}'); } catch (_) { return {}; } })();
  const saveFrames = () => { try { localStorage.setItem(ART_KEY, JSON.stringify(artFrames)); } catch (_) { /* no storage */ } };
  const picUrlOf = (h) => (h?.picUrl ? h.picUrl : h?.pic ? '/dnd/portraits/' + h.pic : '');
  function paintArt(art, h, src) {
    const f = artFrames[h.id] || { z: 1.35, x: 50, y: 24 };
    art.style.background = src ? `#14100c url('${src}') ${f.x}% ${f.y}% / ${Math.round(f.z * 100)}% auto no-repeat` : tint(h.name);
  }
  function wireArt(node, h) {
    const art = node.querySelector('.art'); if (!art) return;
    const url = picUrlOf(h); if (!url || !SERVED) return;
    art.textContent = ''; art.title = 'Mouse wheel: zoom the picture toward the pointer';
    thumbOf(url).then((src) => { art.dataset.src = src; paintArt(art, h, src); });
    art.addEventListener('wheel', (e) => {
      if (!art.dataset.src) return;
      e.preventDefault();
      const f = { ...(artFrames[h.id] || { z: 1.35, x: 50, y: 24 }) };
      const r = art.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 100, py = (e.clientY - r.top) / r.height * 100;
      const z = Math.max(1, Math.min(4, f.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      // lean the framing toward the pointer as it zooms in, back to the middle as it zooms out
      const pull = z > f.z ? .25 : -.15;
      f.x = Math.max(0, Math.min(100, f.x + (px - 50) * pull * (z > 1 ? 1 : 0)));
      f.y = Math.max(0, Math.min(100, f.y + (py - 50) * pull * (z > 1 ? 1 : 0)));
      f.z = z; if (z <= 1.001) { f.x = 50; f.y = 50; }
      artFrames[h.id] = f; saveFrames(); paintArt(art, h, art.dataset.src);
    }, { passive: false });
  }

  // The map: one window, one board. Its tools sit on its own strip and move onto the rail when it fills the table.
  let mockTokens = [{ n: 'Indigo', x: 22, y: 30 }, { n: 'Cal', x: 35, y: 55 }, { n: 'Orchard Tender', x: 62, y: 28, enemy: true }];
  apps.map = () => T.openWindow({ id: 'map', app: 'map', title: 'Map', sub: SERVED ? '' : 'The Gravity Orchard v4', icon: I.map, size: [700, 500], heavy: true, share: true, popUrl: '/dnd/vtt/index.php?table=1',
    build(c) {
      if (SERVED) {
        c.innerHTML = `<div class="vtt real" data-drop="map"><iframe src="/dnd/vtt/index.php" title="Map" allow="fullscreen" style="opacity:0"></iframe><div class="loading">Opening the board…</div><div class="sleep-cover"><div><b>Map paused</b><br>Tucked away, covered or minimised: not drawing.<br>Open it again to wake it.</div></div></div>`;
        const frame = $('iframe', c);
        frame.addEventListener('load', () => {
          const d = frame.contentDocument; if (!d || frame.src.endsWith('about:blank')) return;
          const css = d.createElement('link'); css.rel = 'stylesheet'; css.href = vers('/dnd/table/vtt-embed.css'); d.head.append(css);
          d.documentElement.classList.add('vtt-embed');
          const js = d.createElement('script'); js.src = vers('/dnd/table/vtt-embed.js'); d.body.append(js);
          const ready = () => { if (!frame.contentWindow?.vttEmbed) { setTimeout(ready, 100); return; } frame.style.opacity = 1; $('.loading', c)?.remove(); siteCfg = null; T.siteConfig(); syncDock(); pollLive(); };
          ready();
        });
        return;
      }
      c.innerHTML = `<div class="vtt"><div class="board" data-drop="map"><div class="ruin" style="left:42%;top:12%"></div><div class="tree" style="left:12%;top:60%"></div><div class="tree" style="left:70%;top:62%"></div>
        <div class="scene-tag">Made-up board · served by the site, the real one opens here</div><div class="sleep-cover"><div><b>Map paused</b></div></div></div></div>`;
      drawMockTokens(c);
    },
    onWork(w, level) {
      const f = w.node.querySelector('iframe');
      // Asleep long enough on a lighter quality level: unload the board completely (frees its memory); wake = reload.
      const q = MQ ? MQ.quality() : null;
      if (level === 'sleep') { w.sleptAt = w.sleptAt || Date.now(); if (q?.unloadAfterMs && !w.unloaded && Date.now() - w.sleptAt > q.unloadAfterMs && f) { w.unloaded = true; f.src = 'about:blank'; w.node.querySelector('.sleep-cover b').textContent = 'Map unloaded to save memory'; } }
      else { w.sleptAt = 0; if (w.unloaded && f) { w.unloaded = false; f.style.opacity = 0; f.src = '/dnd/vtt/index.php'; w.node.querySelector('.sleep-cover b').textContent = 'Map paused'; return; } }
      const vtt = f?.contentWindow; if (!vtt || w.unloaded) return;
      try {
        vtt.vttPaused = level === 'sleep';
        const r = vtt.vtt3dRenderer?.view?.renderer, dpr = vtt.devicePixelRatio || 1, top = Math.min(dpr, q ? q.pixelRatio : 1.6);
        if (r) { const want = level === 'low' ? top * .6 : top; if (Math.abs(r.getPixelRatio() - want) > .01) { r.setPixelRatio(want); vtt.dispatchEvent(new vtt.Event('resize')); } }
      } catch (_) { /* not loaded yet */ }
    },
    onMax(w, on) { document.body.classList.toggle('map-docked', on && !w.state.min); syncDock(); },
    onClose() { document.body.classList.remove('map-docked'); const dock = $('#map-tools'); if (dock) dock.innerHTML = ''; },   // its tools leave the rail with it
  });
  function drawMockTokens(c) {
    const board = $('.board', c); if (!board) return; board.querySelectorAll('.token').forEach((n) => n.remove());
    mockTokens.forEach((t) => { const n = el('div', 'token' + (t.enemy ? ' enemy' : ''), initials(t.n)); n.title = t.n; n.style.left = t.x + '%'; n.style.top = t.y + '%'; n.style.background = tint(t.n); board.append(n); });
  }
  // Map tools on the rail while the map fills the table; their menus open beside the rail.
  function syncDock() {
    const f = vttFrame(), docked = document.body.classList.contains('map-docked');
    if (!f) return;
    f.contentWindow.vttEmbed.dock(docked);
    const dock = $('#map-tools'); if (!dock) return;
    if (!docked) { dock.innerHTML = ''; return; }
    const tools = f.contentWindow.vttEmbed.tools();
    dock.innerHTML = '<div class="rail-sep"></div><div class="rail-label">Map</div>' + tools.filter((t) => !t.sep).map((t) => `<button class="rail-btn" data-rtool="${t.id}">${svg(t.id)}</button>`).join('');
    dock.querySelectorAll('[data-rtool]').forEach((b) => {
      const t = tools.find((x) => x.id === b.dataset.rtool);
      b.addEventListener('mouseenter', () => T.showTip(b, `<b>${t.t}</b><span class="how">${t.d}</span>`)); b.addEventListener('mouseleave', T.hideTip);
      b.addEventListener('click', () => {
        T.hideTip();
        const fr = f.getBoundingClientRect(), r = b.getBoundingClientRect();
        const anchor = { getBoundingClientRect: () => ({ left: r.left - fr.left, right: Math.max(4, r.right - fr.left), top: r.top - fr.top, bottom: r.bottom - fr.top, width: r.width, height: r.height }) };
        f.contentWindow.vttEmbed.run(t.id, anchor);
        setTimeout(paintDockState, 80);
      });
    });
    paintDockState();
  }
  function paintDockState() { const f = vttFrame(); if (!f) return; document.querySelectorAll('[data-rtool]').forEach((b) => b.classList.toggle('open', f.contentWindow.vttEmbed.isActive(b.dataset.rtool))); }

  // Creatures: the Monster Creator's own list as pictures. Drag one onto the map: it is placed there.
  let monsters = null;
  async function loadMonsters() {
    if (monsters) return monsters;
    if (!SERVED) { monsters = MOCK_MONSTERS; return monsters; }
    try { const r = await fetch('/dnd/vtt/api/monsters.php', { credentials: 'same-origin' }); const j = await r.json(); monsters = Array.isArray(j.data) ? j.data : []; } catch (_) { monsters = []; }
    return monsters;
  }
  const ORGS = ['Minion', 'Horde', 'Platoon', 'Elite', 'Leader', 'Solo'];
  const orgOf = (m) => ORGS.find((o) => new RegExp('\\b' + o + '\\b', 'i').test(m.role || '')) || '';
  const folderOf = (m) => (m.sourceFolderParts && m.sourceFolderParts[0]) || m.sourceFolder || 'Other';
  apps.creatures = () => {
    const b = $('#table').getBoundingClientRect();
    const fresh = !T.windows.has('creatures');
    const w = T.openWindow({ id: 'creatures', app: 'creatures', title: 'Creatures', sub: 'drag onto the map', icon: I.creatures, size: [Math.min(560, b.width * .4), b.height - 32],
      build(c) {
        const favs = new Set(store.get('favs', [])), recent = store.get('recent', []);
        const onMapNow = () => new Set((live?.onMap || []).map((n) => String(n).toLowerCase()));
        const st = { tab: 'all', q: '', folder: '', org: '', list: store.get('gallery-list', false) };
        c.innerHTML = '<div class="gallery-top"><input placeholder="Search creatures…" title="Name, role, folder or level (e.g. L3)"><div class="tabs" data-row="tabs"></div><div class="tools"><button class="chip-btn" data-view="grid" title="Pictures"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg></button><button class="chip-btn" data-view="list" title="List"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button></div><div class="chips"><span class="chip-label">Group</span><span data-row="org"></span></div><div class="chips"><span class="chip-label">Folder</span><span data-row="folder"></span></div></div><div class="grid"><p class="pad muted">Loading the monster list…</p></div>';
        const grid = $('.grid', c), input = $('input', c);
        loadMonsters().then((all) => {
          const folders = [...new Set(all.map(folderOf))].sort();
          const onNames = onMapNow();
          st.tab = all.some((m) => onNames.has(String(m.name).toLowerCase())) ? 'map' : recent.some((id) => all.find((m) => m.id === id)) ? 'recent' : 'all';
          $('[data-row="tabs"]', c).innerHTML = [['all', 'All'], ['map', 'On this map'], ['fav', '★ Favourites'], ['recent', 'Recent']].map(([k, t]) => `<button class="chip-btn" data-tab="${k}">${t}</button>`).join('');
          $('[data-row="org"]', c).innerHTML = ORGS.map((o) => `<button class="chip-btn" data-org="${o}">${o}</button>`).join('');
          $('[data-row="folder"]', c).innerHTML = folders.map((f) => `<button class="chip-btn" data-folder="${esc(f)}">${esc(f)}</button>`).join('');
          const list = () => {
            let l = all;
            if (st.tab === 'map') { const on = onMapNow(); l = l.filter((m) => on.has(String(m.name).toLowerCase())); }
            if (st.tab === 'fav') l = l.filter((m) => favs.has(m.id));
            if (st.tab === 'recent') l = recent.map((id) => all.find((m) => m.id === id)).filter(Boolean);
            if (st.folder) l = l.filter((m) => folderOf(m) === st.folder);
            if (st.org) l = l.filter((m) => orgOf(m) === st.org);
            if (st.q) l = l.filter((m) => `${m.name} ${m.role} ${folderOf(m)} L${m.level}`.toLowerCase().includes(st.q));
            return l;
          };
          const art = (m) => `${m.imageUrl ? `url('${esc(m.imageUrl)}') center 20% / cover no-repeat, ` : ''}${tint(m.name)}`;
          const paint = () => {
            c.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === st.tab));
            c.querySelectorAll('[data-org]').forEach((x) => x.classList.toggle('on', x.dataset.org === st.org));
            c.querySelectorAll('[data-folder]').forEach((x) => x.classList.toggle('on', x.dataset.folder === st.folder));
            c.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', (x.dataset.view === 'list') === st.list));
            grid.classList.toggle('list', st.list);
            const l = list(), on = onMapNow();
            grid.innerHTML = l.length ? l.slice(0, 300).map((m) => `<div class="tile${on.has(String(m.name).toLowerCase()) ? ' onmap' : ''}" data-id="${esc(m.id)}"><div class="art" style="background:${art(m)}">${m.imageUrl ? '' : initials(m.name)}<span class="lv">L${m.level ?? '?'}</span>${Number(m.stamina) > 0 ? `<span class="st">♥ ${m.stamina}</span>` : '<span class="st none" title="No stamina in its stat block">♥ ?</span>'}<span class="fav${favs.has(m.id) ? ' on' : ''}" title="Favourite">★</span></div><b>${esc(m.name)}</b><i>${esc(m.role || '')}${m.role ? ' · ' : ''}${esc(folderOf(m))}</i></div>`).join('')
              : `<div class="empty"><p>${st.tab === 'map' ? 'No monsters on this map yet.' : st.tab === 'fav' ? 'No favourites yet: click ★ on a picture.' : st.tab === 'recent' ? 'Nothing placed yet.' : 'Nothing matches these filters.'}</p><button class="chip-btn on" data-all>Show all monsters</button></div>`;
            grid.querySelector('[data-all]')?.addEventListener('click', () => { st.tab = 'all'; st.folder = ''; st.org = ''; st.q = ''; input.value = ''; paint(); });
            grid.querySelectorAll('.tile').forEach((tile) => {
              const m = l.find((x) => String(x.id) === tile.dataset.id);
              tile.querySelector('.fav').addEventListener('pointerdown', (e) => { e.stopPropagation(); favs.has(m.id) ? favs.delete(m.id) : favs.add(m.id); store.set('favs', [...favs]); paint(); });
              tile.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.fav')) return;
                T.dragOut(e, {
                  closeFlyout: false,
                  click: () => T.toast(`${m.name}: drag the picture onto the map`),
                  onDropTarget(target, ev) {
                    if (target.dataset.drop !== 'map') return false;
                    placeMonster(m, ev.clientX, ev.clientY, target).then((ok) => { if (ok) { const r = store.get('recent', []).filter((id) => id !== m.id); r.unshift(m.id); store.set('recent', r.slice(0, 24)); setTimeout(paint, 1600); } });
                    return true;
                  },
                  onTable() { T.toast('Drop monsters on the map'); },
                }, `<div class="tile" style="width:100px"><div class="art" style="background:${art(m)}"></div><b>${esc(m.name)}</b></div>`);
              });
            });
          };
          input.addEventListener('input', () => { st.q = input.value.trim().toLowerCase(); paint(); });
          c.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { st.tab = x.dataset.tab; paint(); });
          c.querySelectorAll('[data-view]').forEach((x) => x.onclick = () => { st.list = x.dataset.view === 'list'; store.set('gallery-list', st.list); paint(); });
          c.querySelectorAll('[data-org]').forEach((x) => x.onclick = () => { st.org = st.org === x.dataset.org ? '' : x.dataset.org; paint(); });
          c.querySelectorAll('[data-folder]').forEach((x) => x.onclick = () => { st.folder = st.folder === x.dataset.folder ? '' : x.dataset.folder; paint(); });
          paint();
        });
      } });
    // It opens beside the map (on the left), not on top of where you will drop.
    if (fresh) place(w, 16, 16, Math.min(560, b.width * .4), b.height - 32);
    return w;
  };
  // Put a monster on the board where it was dropped, through the board's own command (everyone sees it at once).
  async function placeMonster(m, cx, cy, target) {
    if (!SERVED) {
      const r = target.getBoundingClientRect(); mockTokens.push({ n: m.name, x: (cx - r.left) / r.width * 100, y: (cy - r.top) / r.height * 100, enemy: true });
      drawMockTokens(target.closest('.content')); T.toast(`${m.name} placed`); return true;
    }
    const f = vttFrame(); if (!f) { T.toast('The map is still opening'); return false; }
    try {
      const fr = f.getBoundingClientRect(), v = f.contentWindow;
      const hit = v.vtt3dRenderer?.pickAtClient?.(cx - fr.left, cy - fr.top, { tokens: false });
      if (!hit || !Number.isFinite(hit.x)) { T.toast('Drop it onto the ground of the map'); return false; }
      const full = await (await fetch('/dnd/vtt/api/monsters.php?id=' + encodeURIComponent(m.id), { credentials: 'same-origin' })).json();
      const mon = full?.data || m;
      const [fw, fh] = String(mon.footprint || mon.size || '1').split(/x/i).map((n) => Math.max(1, Math.round(Number(n) || 1)));
      // Stamina as the board reads it (token-library.js extractMonsterHp); none set: the token gets a blank, not 0/0.
      const stObj = mon.stamina && typeof mon.stamina === 'object' ? mon.stamina.value : mon.stamina;
      const stamina = [stObj, mon.stats?.stamina, mon.defenses?.stamina, mon.attributes?.hp, mon.hp].map((x) => parseInt(x, 10)).find((x) => Number.isFinite(x) && x > 0) || 0;
      const w = fw, h = fh || fw;
      const ctx = v.vtt3dBridge.getContext(), sceneId = ctx.sceneId;
      const status = await (await fetch('/dnd/vtt/api/v2/status.php', { credentials: 'same-origin', cache: 'no-store' })).json();
      const id = 'tpl_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
      const placement = { id, name: mon.name, imageUrl: mon.imageUrl || m.imageUrl || '', column: Math.round(hit.x - w / 2), row: Math.round(hit.y - h / 2), width: w, height: h, size: `${w}x${h}`,
        hp: { current: stamina ? String(stamina) : '', max: stamina ? String(stamina) : '' }, showHp: true, combatTeam: 'enemy', team: 'enemy', hidden: false, monsterId: mon.id || m.id, monster: mon,
        metadata: { monsterId: mon.id || m.id, monster: mon, sourceFolderName: folderOf(m) } };
      if (hit.levelId || ctx.viewerLevelId) placement.levelId = hit.levelId || ctx.viewerLevelId;
      const res = await fetch('/dnd/vtt/api/v2/commands.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'placement.batch', operationId: 'table-place-' + id, baseRevision: status?.status?.revision, payload: { actions: [{ kind: 'add', sceneId, placementId: id, placement }] } }) });
      if (!res.ok) { T.toast(`Could not place ${mon.name} (${res.status})`); return false; }
      T.toast(stamina ? `✓ ${mon.name} placed on the map` : `✓ ${mon.name} placed. Its stat block has no stamina: set it on the token.`); return true;
    } catch (error) { console.warn('[Table] place monster', error); T.toast('Could not place it: ' + error.message); return false; }
  }

  // A hero dropped on the map (Brandon, October 27, 2026): that hero's token from the board's PC's folder, linked to the
  // hero, with the sheet's stamina. A hero already on this map is not put there twice.
  async function placeHero(h, cx, cy, target) {
    if (!SERVED) { const r = target.getBoundingClientRect(); mockTokens.push({ n: h.name, x: (cx - r.left) / r.width * 100, y: (cy - r.top) / r.height * 100 }); drawMockTokens(target.closest('.content')); T.toast(`${h.name} placed`); return true; }
    const f = vttFrame(); if (!f) { T.toast('The map is still opening'); return false; }
    try {
      const fr = f.getBoundingClientRect(), v = f.contentWindow, ctx = v.vtt3dBridge.getContext(), sceneId = ctx.sceneId;
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const already = (ctx.placements || []).find((p) => norm(p.profileId || p.metadata?.profileId) === h.id || norm(p.name) === norm(h.name));
      if (already) { T.toast(`${h.name} is already on this map`); return false; }
      const lib = v.vttConfig?.tokens || {}, folders = lib.folders || [], items = lib.items || [];
      const pcFolders = folders.filter((x) => /^pc'?s$/i.test(String(x.name || '').trim())).map((x) => x.id);
      const tok = items.find((t) => pcFolders.includes(t.folderId) && norm(t.name) === norm(h.name)) || items.find((t) => norm(t.name) === norm(h.name));
      if (!tok) { T.toast(`${h.name} has no token in the PC's folder yet`); return false; }
      const hit = v.vtt3dRenderer?.pickAtClient?.(cx - fr.left, cy - fr.top, { tokens: false });
      if (!hit || !Number.isFinite(hit.x)) { T.toast('Drop the hero onto the ground of the map'); return false; }
      const [w, hh] = String(tok.size || '1x1').split(/x/i).map((n) => Math.max(1, Math.round(Number(n) || 1)));
      let cur = '', max = '';
      try { const s = await (await fetch('/dnd/character_sheet/handler.php?action=load&character=' + encodeURIComponent(h.id), { credentials: 'same-origin', cache: 'no-store' })).json(); const vit = s?.data?.hero?.vitals || {}; if (Number.isFinite(Number(vit.staminaMax))) { max = String(vit.staminaMax); cur = String(vit.currentStamina ?? vit.staminaMax); } } catch (_) { /* the board links it later */ }
      const folder = folders.find((x) => x.id === tok.folderId);
      const id = 'tpl_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
      const placement = { id, tokenId: tok.id, name: tok.name || h.name, imageUrl: tok.imageUrl || '', column: Math.round(hit.x - w / 2), row: Math.round(hit.y - (hh || w) / 2), width: w, height: hh || w, size: `${w}x${hh || w}`,
        hp: { current: cur, max }, showHp: true, showTriggeredAction: true, triggeredActionReady: true, condition: null, combatTeam: 'ally', team: 'ally', hidden: false, profileId: h.id,
        metadata: { profileId: h.id, sourceFolderName: folder?.name || "PC's", sourceFolderId: tok.folderId || '' } };
      if (hit.levelId || ctx.viewerLevelId) placement.levelId = hit.levelId || ctx.viewerLevelId;
      const status = await (await fetch('/dnd/vtt/api/v2/status.php', { credentials: 'same-origin', cache: 'no-store' })).json();
      const res = await fetch('/dnd/vtt/api/v2/commands.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'placement.batch', operationId: 'table-hero-' + id, baseRevision: status?.status?.revision, payload: { actions: [{ kind: 'add', sceneId, placementId: id, placement }] } }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); T.toast(`Could not place ${h.name}: ${j.error || res.status}`); return false; }
      T.toast(`✓ ${h.name} placed on the map`); return true;
    } catch (error) { console.warn('[Table] place hero', error); T.toast('Could not place the hero: ' + error.message); return false; }
  }

  // Chat: the site's own chat, always open, in a window or tucked into a side.
  apps.chat = () => T.openWindow({ id: 'chat', app: 'chat', title: 'Chat', icon: I.chat, size: [340, 520],
    build(c) {
      if (!SERVED) { c.innerHTML = '<div class="chat-log"><p><b>Director:</b> The orchard trembles.</p><p><b>Indigo:</b> I read the Tender\'s mind.</p></div><input class="chat-in" placeholder="Message…">'; return; }
      framePage(c, vers('/dnd/table/chat.php'));
    } });

  // Made-up windows for the file version only.
  apps.combat = () => T.openWindow({ id: 'combat', app: 'combat', title: 'Combat', sub: 'Round 3', icon: I.combat, size: [300, 300],
    build(c) { c.innerHTML = '<p class="pad muted">On the site, combat runs on the map: start and end it from the Combat button; the turn bar shows on the board.</p>'; } });
  // Ask for a test: a window of its own (Brandon, October 27, 2026: it opened the map). The map's own form (test.php).
  apps.test = () => T.openWindow({ id: 'test', app: 'test', title: me.gm ? 'Ask for a test' : 'Test', icon: I.test || I.dice, size: [420, 560],
    build(c) { if (SERVED) { framePage(c, vers('/dnd/table/test.php')); return; } c.innerHTML = '<p class="pad muted">Pick heroes; they roll from their sheets.</p>'; } });

  // A player asked for a test (Brandon, October 27, 2026): the Test window comes to the front with the request in it,
  // once per test; a test the Director cancels closes it again. Looked for every few seconds (one word while nothing changed).
  let testStamp = '', testWatched = '';
  const testsPopped = new Set((() => { try { return JSON.parse(sessionStorage.getItem('table-tests-popped') || '[]'); } catch (_) { return []; } })());
  async function watchTests() {
    if (!SERVED || me.gm || !me.user || document.hidden) return;
    try {
      const body = 'action=chat_test_state' + (testStamp ? '&stamp=' + encodeURIComponent(testStamp) : '');
      const j = await (await fetch('/dnd/chat_handler.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
      if (!j?.success || j.unchanged) return;
      testStamp = String(j.stamp || '');
      const mine = String(me.user).toLowerCase(), tests = j.tests || [];
      const fresh = tests.find((t) => t.rows?.[mine]?.status === 'waiting' && (t.age || 0) <= 1800 && !testsPopped.has(t.id));
      if (fresh) {
        testsPopped.add(fresh.id); testWatched = fresh.id;
        try { sessionStorage.setItem('table-tests-popped', JSON.stringify([...testsPopped].slice(-40))); } catch (_) { /* no storage */ }
        const w = apps.test();
        const focusIt = (n = 0) => { const f = w.node.querySelector('iframe'); try { if (f?.contentDocument?.readyState === 'complete') { f.focus(); f.contentWindow.focus(); return; } } catch (_) { /* not yet */ } if (n < 50) setTimeout(() => focusIt(n + 1), 200); };
        focusIt();
        return;
      }
      const watched = testWatched && tests.find((t) => t.id === testWatched);
      if (watched && watched.rows?.[mine]?.status === 'cancelled') {
        testWatched = '';
        const w = T.windows.get('test'); if (w) T.closeWindow(w);
        T.toast('The Director cancelled the test');
      }
    } catch (_) { /* next time */ }
  }
  if (SERVED) setInterval(watchTests, 3000);

  // Dice is a window of its own (Brandon, October 27, 2026: it opened the map): the sheet's roller, rolls to chat (dice.php).
  apps.dice = () => T.openWindow({ id: 'dice', app: 'dice', title: 'Dice', icon: I.dice, size: [400, 470],
    build(c) { if (SERVED) { framePage(c, vers('/dnd/table/dice.php')); return; } c.innerHTML ='<div class="dice"><div class="pr">POWER ROLL</div><div class="row"><div class="d">3</div><div class="d">6</div></div></div>'; } });

  // ---------------------------------------------------------------- the rail
  // In order of how often a Director reaches for it mid-session. Live state shows on the button itself.
  const RAIL = [
    { label: 'Table' },
    { k: 'heroes', t: 'Heroes', key: 'H', d: 'Stamina at a glance. Click a hero for the sheet; drag one onto the table for a card.', now: () => HEROES.map((h) => { const [a, m] = heroHp(h); return `${h.name} ${m ? a + '/' + m : '—'}`; }).join(' · '), open: flyHeroes },
    { k: 'scenes', t: 'Scenes', gm: true, d: 'Open a scene for yourself or show it to the players.', now: () => live?.scene ? `You: ${esc(live.scene)}${live.level ? ' · ' + live.level : ''}${live.playerSceneName && live.playerSceneId !== live.sceneId ? `<br><span class="warn">Players see: ${esc(live.playerSceneName)}</span>` : live.playerSceneName ? '<br>Players see the same scene' : ''}` : '', open: flyScenes,
      player: { k: 'scenes', t: 'Map', d: 'The map your table is playing on.', open: () => apps.map() } },
    { k: 'creatures', t: 'Creatures', gm: true, needsMap: true, d: 'Every monster as a picture. Drag one onto the map to place it.', now: () => live?.foes ? `${live.foes} foe${live.foes > 1 ? 's' : ''} on this map` : '', open: () => apps.creatures() },
    { k: 'dice', t: 'Dice', key: 'D', d: 'The dice roller; results go to chat.', open: () => apps.dice() },
    { k: 'chat', t: 'Chat', d: 'Table chat, whispers, shared pictures.', now: () => { const u = live?.chatCount > lastChatSeen ? live.chatCount - lastChatSeen : 0; return u ? `${u} new` : ''; }, open: () => { const w = apps.chat(); if (w.state.dock && !w.state.open) T.setOpen(w, true); } },
    { k: 'test', t: 'Ask for a test', gm: true, d: 'Pick heroes; they roll from their sheets.', open: () => apps.test() },
    { label: 'Campaign' },
    { k: 'projects', t: 'Projects', d: 'Every hero’s projects; project rolls go to chat for your approval.', open: () => apps.page('Projects') },
    { k: 'relations', t: 'Relationships', d: 'Who each hero is close to or at odds with.', open: () => apps.page('Relationships') },
    { k: 'people', t: 'People', d: 'Students, staff and other NPCs.', open: flyPeople },
    { k: 'campus', t: 'Campus', d: 'The campus map and the schedule.', open: flyCampus },
    { k: 'notes', t: 'GM notes', gm: true, d: 'Your GM screen notes.', open: () => apps.page('GM notes') },
    { k: 'rules', t: 'Rules', d: 'Rules pages, each in its own window.', open: flyRules },
    { k: 'arcane', t: 'Arcane Construction', only: 'zepha', d: 'Your arcane construction.', open: () => apps.page('Arcane Construction') },
    { label: 'Prep', gm: true },
    { k: 'workshop', t: 'Workshop', gm: true, d: 'Monster Creator, templates, players and more.', open: flyWorkshop },
  ];
  function buildRail() {
    const rail = $('#rail'); rail.innerHTML = '';
    const logo = el('button', 'logo', 'S'); logo.setAttribute('aria-label', 'Table menu');
    logo.addEventListener('mouseenter', () => T.showTip(logo, '<b>Table menu</b><span class="how">Layouts, background, see as a player, log out.</span>')); logo.addEventListener('mouseleave', T.hideTip);
    logo.addEventListener('click', () => { T.hideTip(); flyTable(logo); });
    rail.append(logo);
    let group = '';
    RAIL.forEach((r) => {
      if (r.label) group = r.label;
      if (playerView && r.gm && !r.player) return;
      if (r.only && String(me.user || '').toLowerCase() !== r.only) return;   // one player's own button
      if (r.label) { const n = el('div', 'rail-label', r.label); n.dataset.group = group; rail.append(n); return; }
      const spec = playerView && r.player ? { ...r, ...r.player } : r;
      const b = el('button', 'rail-btn', svg(spec.t === 'Map' ? 'map' : spec.k));
      b.dataset.k = spec.k; b.dataset.group = group; b.setAttribute('aria-label', spec.t); if (spec.needsMap && SERVED) b.dataset.needsMap = '';
      b.addEventListener('mouseenter', () => { const now = spec.now?.(); T.showTip(b, `<b>${spec.t}</b>${spec.key ? `<kbd>${spec.key}</kbd>` : ''}${now ? `<span class="now">${now}</span>` : ''}<span class="how">${spec.d}</span>`); });
      b.addEventListener('mouseleave', T.hideTip);
      b.addEventListener('click', () => { T.hideTip(); spec.open(b); });
      rail.append(b);
    });
    const dock = el('div', 'rail-group'); dock.id = 'map-tools'; rail.append(dock);
    if (playerView && me.gm) rail.append(el('div', 'rail-note', 'Player view'));
    if (SERVED) { syncDock(); paintLive(); }
  }
  // Keys: H heroes, D dice (when not typing).
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = { h: 'heroes', d: 'dice' }[e.key.toLowerCase()]; if (!k) return;
    document.querySelector(`#rail [data-k="${k}"]`)?.click();
  });

  // ---------------------------------------------------------------- flyouts
  const header = (title, hint) => `<header>${title}<span class="grow"></span><span class="hint">${hint || ''}</span></header>`;
  function filterable(fly) {
    const s = $('.search', fly); if (!s) return;
    s.addEventListener('input', () => {
      const q = s.value.trim().toLowerCase();
      fly.querySelectorAll('.item').forEach((n) => { n.hidden = q && !n.textContent.toLowerCase().includes(q); });
      fly.querySelectorAll('.fold').forEach((f) => { f.open = !!q || f.dataset.open === '1'; f.hidden = q && ![...f.querySelectorAll('.item')].some((n) => !n.hidden); });
    });
  }
  function menuFly(btn, title, rows, hint) {
    const shown = rows.filter((r) => !(playerView && r.gm));
    T.openFlyout(btn, (f) => {
      f.innerHTML = header(title, hint) + `<div class="body">${shown.map((r, i) => r.html ? r.html : `<div class="menu-row${r.cls ? ' ' + r.cls : ''}" data-i="${i}" role="menuitem${r.icon === 'radio' || r.icon === 'radioOn' ? 'radio' : ''}"${r.icon === 'radioOn' ? ' aria-checked="true"' : r.icon === 'radio' ? ' aria-checked="false"' : ''}>${svg(r.icon || 'notes')}<span>${r.t}</span><i>${r.note || ''}</i></div>`).join('')}</div>`;
      f.querySelectorAll('.menu-row[data-i]').forEach((n) => n.onclick = () => { shown[+n.dataset.i].go(); T.closeFlyout(); });
    });
  }
  function flyHeroes(btn) {
    T.openFlyout(btn, (f) => {
      const list = playerView ? HEROES.filter((h) => h.own !== false && (!me.gm || h === HEROES[0])) : HEROES;   // a player: their own hero
      f.innerHTML = header('Heroes', 'click: sheet · drag: card') + `<div class="body">${list.map((h) => { const [a, m, on, t] = heroHp(h); const r = m ? a / m : 1; return `<div class="item hero" data-key="${h.id}"><div class="pic" style="background:${portrait(h)}">${(h.pic || h.picUrl) && SERVED ? '' : initials(h.name)}</div><div class="txt"><b>${h.name}</b><i>${h.sub}${(() => { const r = liveHero(h.name); return r ? (r.elsewhere ? ' · on ' + esc(shortScene(r.elsewhere)) : ' · on the map') : ''; })()}</i>${m ? `<span class="hpbar"><span style="width:${Math.round(Math.max(0, r) * 100)}%;background:${r <= 0 ? '#d0503e' : r <= .5 ? '#d9a13e' : '#5fbf7a'}"></span>${t ? `<i class="tmp" style="width:${Math.min(100, Math.round(100 * t / m))}%"></i>` : ''}<b>${hpText(a, m, true, t)}</b></span>` : `<span class="offmap-pill">${hpText(a, m, on)}</span>`}</div></div>`; }).join('')}</div>`;
      f.querySelectorAll('.item').forEach((n) => { const h = HEROES.find((x) => x.id === n.dataset.key);
        n.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-mock]')) return; T.dragOut(e, { click: () => { apps.sheet(h.id); T.closeFlyout(); }, onTable: (x, y) => apps.heroCard(h.id, x, y), onDropTarget: (target, ev) => { if (target.dataset.drop !== 'map') return false; placeHero(h, ev.clientX, ev.clientY, target); return true; } },
          `<div class="card" style="position:static"><div class="art" style="background:${portrait(h)}"></div><div class="name">${h.name}</div><div style="height:8px"></div></div>`); }); });
    });
  }
  function flyScenes(btn) {
    if (SERVED && !btn._fresh) {
      fetch('/dnd/table/config.php', { cache: 'no-store', credentials: 'same-origin' }).then((r) => r.json()).then((j) => { if (j?.config) window.TABLE_CONFIG = j.config; })
        .catch(() => {}).finally(() => { btn._fresh = true; try { flyScenes(btn); } finally { btn._fresh = false; } });
      return;
    }
    const cfg = SERVED ? (window.TABLE_CONFIG?.scenes || T.siteConfig()?.scenes) : MOCK_SCENES;
    if (SERVED && !cfg) { T.toast('The scene list could not be read; try again'); return; }
    T.openFlyout(btn, (f) => {
      const folders = [...(cfg.folders || []), { id: '', name: 'Unsorted' }];
      const items = cfg.items || [];
      const known = new Set(folders.map((x) => x.id).filter(Boolean));
      const groups = folders.map((fo) => ({ fo, list: items.filter((s) => (fo.id ? s.folderId === fo.id : !known.has(s.folderId))) })).filter((g) => g.list.length);
      const byId = (id) => items.find((s) => s.id === id);
      const youId = live?.sceneId, playersId = live?.playerSceneId;
      const mark = (s) => [s.id === youId ? '<span class="tag you">you</span>' : '', s.id === playersId ? '<span class="tag players">players</span>' : ''].join('');
      const thumb = (s) => (s.mapUrl ? `url('${esc(s.mapUrl)}') center / cover no-repeat, ` : '') + tint(s.name);
      // Scenes with the same name (copies) fold under one row: "+3 copies" opens them.
      const row = (s, extra = '', cls = '') => `<div class="item scene${cls}" data-key="${esc(s.id)}"><div class="pic wide" style="background:${thumb(s)}"></div><div class="txt"><b>${esc(s.name)}</b><i>${mark(s)}${extra}</i></div><div class="act"><button class="chip-btn" data-a="show" title="Show this scene to the players">Show players</button></div></div>`;
      const twinRows = (list) => { const by = new Map(); list.forEach((s) => { const k = String(s.name).trim().toLowerCase(); if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
        return [...by.values()].map((arr) => { const lead = arr.find((s) => s.id === youId || s.id === playersId) || arr[0]; const rest = arr.filter((s) => s !== lead);
          if (!rest.length) return row(lead);
          return row(lead, `<button class="chip-btn twins" data-a="twins" title="Other scenes with this name">+${rest.length} cop${rest.length > 1 ? 'ies' : 'y'}</button>`) + `<div class="twins-list" hidden>${rest.map((s, i) => row(s, `<span class="tag dup">copy ${i + 2}</span>`, ' twin')).join('')}</div>`; }).join(''); };
      const mismatch = youId && playersId && youId !== playersId;
      f.classList.add('wide');
      const pin = (lead, s) => s ? `<div class="item scene" data-key="${esc(s.id)}"><span class="lead">${lead}</span><div class="pic wide" style="background:${thumb(s)}"></div><div class="txt"><b>${esc(s.name)}</b></div>${lead === 'You' && s.id !== playersId ? '<div class="act"><button class="chip-btn" data-a="show">Show players</button></div>' : ''}</div>` : '';
      f.innerHTML = header('Scenes', `${items.length} scenes`) +
        (youId || playersId ? `<div class="pinned">${pin('You', byId(youId))}${mismatch ? pin('Players', byId(playersId)) : playersId ? '<p class="muted" style="margin:2px 8px 6px;font-size:11.5px">The players see the same scene.</p>' : ''}</div>` : '') +
        '<input class="search" placeholder="Search scenes…">' +
        '<div class="body">' + groups.map((g) => { const open = g.list.some((s) => s.id === youId || s.id === playersId); return `<details class="fold" ${open ? 'open' : ''} data-open="${open ? 1 : 0}"><summary>${esc(g.fo.name)}<span class="n">${g.list.length}</span></summary>${twinRows(g.list)}</details>`; }).join('') + '</div>';
      // The folder you are in opens; Unsorted waits at the bottom.
      f.querySelectorAll('.fold').forEach((d) => { const has = d.querySelector(`[data-key="${CSS.escape(youId || '')}"]`); d.open = !!has; d.dataset.open = has ? '1' : '0'; });
      const unsorted = [...f.querySelectorAll('.fold')].find((d) => /^Unsorted/.test(d.querySelector('summary')?.textContent || '')); if (unsorted) unsorted.parentNode.append(unsorted);
      filterable(f);
      f.querySelectorAll('.item.scene').forEach((n) => n.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="twins"]')) { const l = n.nextElementSibling; if (l?.classList.contains('twins-list')) { l.hidden = !l.hidden; e.target.closest('[data-a="twins"]').classList.toggle('on', !l.hidden); } return; }
        const show = e.target.closest('[data-a="show"]'), id = n.dataset.key, name = n.querySelector('b').textContent;
        if (!SERVED) { T.toast(show ? `${name} shown to players` : `Opened ${name}`); if (!show) apps.map(); T.closeFlyout(); return; }
        if (show && !vttFrame()) { showToPlayers(id, name); T.closeFlyout(); return; }
        withVtt((v) => { const ok = v.run(show ? 'showScene' : 'openScene', id); T.toast(ok ? (show ? `Players now see ${name}` : `Opened ${name}`) : 'Could not find that scene'); }, !show);
        T.closeFlyout();
      }));
    });
  }
  // Players to a scene with no map open: the scene made visible to them, then the same move the map makes (scene.php).
  async function showToPlayers(id, name) {
    const cfg = window.TABLE_CONFIG || {}, scene = (cfg.scenes?.items || []).find((s) => s.id === id);
    try {
      if (scene && scene.playerVisible === false && cfg.scenesEndpoint) {
        const r = await fetch(cfg.scenesEndpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-scene-visibility', sceneId: id, playerVisible: true }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.success) throw new Error(j.error || 'The scene could not be made visible.');
        scene.playerVisible = true;
      }
      const r = await fetch('/dnd/table/scene.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId: id }) });
      const j = await r.json().catch(() => ({})); if (!r.ok || !j.success) throw new Error(j.error || 'The players were not moved.');
      T.toast(`Players now see ${name}`);
    } catch (error) { T.toast(error?.message || 'The players were not moved.'); }
  }
  function flyCombat(btn) {
    const L = live || {};
    const rows = [];
    if (L.combat) rows.push({ html: `<div class="state-line"><b>Round ${L.round}</b> · ${esc(L.turn || '')}${playerView ? '' : ` · <span class="mal">${L.malice} malice</span>`}</div>` });
    if (!playerView) rows.push(L.combat ? { t: 'End combat', icon: 'stop', note: 'asks first', go: () => withVtt((v) => v.run('endCombat')) } : { t: 'Start combat', icon: 'play', go: () => withVtt((v) => v.run('startCombat')) });
    if (!playerView && L.combat) rows.push({ t: 'End this round early', icon: 'combat', go: () => withVtt((v) => v.run('endRound')) });
    if (L.combat) {
      rows.push({ t: 'Undo last action', icon: 'undo', note: 'Ctrl+Z', go: () => withVtt((v) => v.run('undo')) });
      rows.push({ t: 'Undo the whole turn', icon: 'undo', note: 'Ctrl+Shift+Z', go: () => withVtt((v) => v.run('undoTurn')) });
    }
    if (!playerView) rows.push({ t: 'Malice…', icon: 'malice', note: String(L.malice || 0), go: () => withVtt((v) => v.run('malice')) });
    menuFly(btn, 'Combat', rows, L.combat ? 'Round ' + L.round : 'No combat');
  }
  function flyPeople(btn) {
    menuFly(btn, 'People', [
      { t: 'Students', icon: 'people', note: 'relationships', go: () => apps.page('Students') },
      { t: 'Staff', icon: 'people', go: () => apps.page('Staff') },
      { t: 'Other NPCs', icon: 'people', gm: true, go: () => apps.page('Other NPCs') },
    ]);
  }
  function flyCampus(btn) {
    menuFly(btn, 'Campus', [
      { t: 'Campus map', icon: 'map', note: '3D hexes', go: () => apps.page('Campus map') },
      { t: 'Schedule', icon: 'layouts', note: 'this week', go: () => apps.page('Schedule') },
    ]);
  }
  function flyRules(btn) {
    T.openFlyout(btn, (f) => {
      f.innerHTML = header('Rules') + '<input class="search" placeholder="Search rules…"><div class="body">' + RULES.map((r) => `<div class="menu-row item" data-key="${esc(r)}">${svg('rules')}<span>${r}</span></div>`).join('') + '</div>';
      filterable(f);
      f.querySelectorAll('.item').forEach((n) => n.onclick = () => { apps.page(n.dataset.key); T.closeFlyout(); });
    });
  }
  function flyWorkshop(btn) {
    menuFly(btn, 'Workshop', [
      { t: 'Monster Creator', icon: 'creatures', go: () => apps.page('Monster Creator') },
      { t: 'Organisation templates', icon: 'notes', go: () => apps.page('Templates') },
      { t: 'Arcane Construction', icon: 'workshop', go: () => apps.page('Arcane Construction') },
      { t: 'Players & roster', icon: 'heroes', go: () => apps.page('Players') },
    ]);
  }
  function flyTable(btn) {
    const tb = () => $('#table').getBoundingClientRect();
    menuFly(btn, 'The table', [
      { html: '<div class="menu-label">Arrange</div>' },
      { t: 'Prep', gm: true, icon: 'workshop', note: 'creatures beside the map', go: () => { const b = tb(); place(apps.creatures(), 0, 0, b.width * .36, b.height); place(apps.map(), b.width * .36, 0, b.width * .64, b.height); } },
      { t: 'Clear the table', icon: 'layouts', go: () => T.clearLayout() },
      ...(SERVED ? qualityRows() : []),
      { html: '<div class="menu-label">The table</div>' },
      { t: 'Background…', icon: 'picture', note: 'picture · GIF · MP4', go: () => { const i = Object.assign(el('input'), { type: 'file', accept: 'image/*,video/*' }); i.onchange = () => i.files[0] && T.useBackgroundFile(i.files[0]); i.click(); } },
      { t: 'Default background', icon: 'settings', note: 'leather', go: () => { T.setBackground(null); T.saveBg(null); } },
      ...(me.gm ? [{ t: playerView ? 'Back to the Director\'s view' : 'See it as a player', icon: 'player', go: togglePlayerView }] : []),
      // Brandon (October 27, 2026): logging out lives here; the Table has no other way out.
      { html: '<div class="menu-label">You</div>' },
      { t: 'Log out', icon: 'logout', note: me.user ? 'signed in as ' + esc(me.user) : '', go: () => { location.href = '/dnd/logout.php'; } },
    ], 'or drop a file on the table');
  }
  function qualityRows() {
    if (!MQ) return [];
    const choice = MQ.qualityChoice(), auto = MQ.autoLevel(), level = MQ.qualityLevel();
    const row = (k, label, note) => ({ t: label, icon: choice === k ? 'radioOn' : 'radio', note, cls: choice === k ? 'on' : '', go: () => setQuality(k) });
    return [
      { html: `<div class="menu-label">Map quality · now ${MQ.LEVELS[level].label}</div>` },
      row('auto', 'Auto', `${MQ.LEVELS[auto].label} here · recommended`),
      row('high', 'High', 'sharpest, most memory'),
      row('balanced', 'Balanced', 'half the pixels, smaller pictures'),
      row('low', 'Low', 'lightest; unloads a tucked map'),
    ];
  }
  function setQuality(k) {
    try { localStorage.setItem(MQ.QUALITY_KEY, k); } catch (_) { /* no storage */ }
    T.refreshWork();
    const m = T.windows.get('map'), f = m?.node.querySelector('iframe');
    T.toast(`Map quality: ${k === 'auto' ? 'Auto (' + MQ.LEVELS[MQ.autoLevel()].label + ')' : MQ.LEVELS[k].label}. Pictures change when the map reloads.`, f ? { label: 'Reload map now', run: () => { f.style.opacity = 0; f.src = '/dnd/vtt/index.php'; } } : null);
  }
  function place(w, x, y, wd, ht) { if (w.state.dock) T.undock(w); if (w.state.max) T.maximize(w, false); Object.assign(w.state, { x, y, w: wd, h: ht }); Object.assign(w.node.style, { left: x + 'px', top: y + 'px', width: wd + 'px', height: ht + 'px' }); T.refreshWork(); T.saveLayout?.(); }   // a layout (Prep, Combat) is kept for the next reload
  function togglePlayerView() { playerView = !playerView; T.closeFlyout(); buildRail(); T.toast(playerView ? 'Player view: only what a player has' : 'Director view'); }

  // Drawers slide out OVER the table (Brandon: chat opens on top of the map without changing it). Kept off on purpose.
  const DRAWERS_MAKE_ROOM = false;
  document.addEventListener('table:drawer', (e) => {
    if (!DRAWERS_MAKE_ROOM) return;
    const { w: drawer, edge, open } = e.detail || {};
    const map = T.windows.get('map'); if (!map || map === drawer || map.state.dock || map.state.min || (edge !== 'right' && edge !== 'left')) return;
    const b = T.bounds(), dw = drawer.node.offsetWidth + 26;
    if (open) {
      const r = map.state.max ? { x: 0, w: b.width } : { x: map.state.x, w: map.state.w };
      const touches = edge === 'right' ? r.x + r.w >= b.width - 30 : r.x <= 30;
      if (!touches) return;
      map.roomFor = { edge, before: { ...map.state } };
      if (map.state.max) T.maximize(map, false);
      if (edge === 'right') place(map, map.state.x, map.state.y, Math.max(320, b.width - dw - map.state.x), map.state.h);
      else place(map, dw, map.state.y, Math.max(320, map.state.x + map.state.w - dw), map.state.h);
    } else if (map.roomFor && map.roomFor.edge === edge) {
      const p = map.roomFor.before; map.roomFor = null;
      if (p.max) T.maximize(map, true); else place(map, p.x, p.y, p.w, p.h);
    }
  });

  // ---------------------------------------------------------------- start: the last table, or a first one
  (async () => {
  await loadHeroes();
  buildRail();
  const saved = T.loadLayout();
  if (saved?.windows?.length || saved?.cards?.length) {
    saved.windows.forEach((s) => { const a = apps[s.app]; if (!a) return; const w = a(s.arg); if (!w) return; place(w, s.x, s.y, s.w, s.h); if (s.dock) T.dock(w, s.dock, !!s.open, s.dockSize, s.dockSpan); else if (s.max) T.maximize(w, true); });
    saved.cards.forEach((c) => apps[c.app]?.(c.arg, c.x, c.y, c.w));
  } else {
    const b = $('#table').getBoundingClientRect();
    HEROES.forEach((h, i) => apps.heroCard(h.id, 24 + (i % 2) * 116, 24 + Math.floor(i / 2) * 196));
    place(apps.map(), 270, 16, b.width - 270 - 40, b.height - 32);   // clear of the right-hand drawer tabs
    if (SERVED) T.dock(apps.chat(), 'right', false, .24);
  }
  })();
})();
