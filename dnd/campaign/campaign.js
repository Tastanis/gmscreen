/* Projects and Relationships (campaign/index.php): loads the heroes from api/campaign.php, draws them with
   campaign-views.js, and handles the clicks. Project rolls use the site's dice roller (dice-roller/dice-roller.js)
   exactly as the dashboard did; the result goes to chat and the Director accepts or denies it there. The screen
   then refreshes by itself: a light revision check every few seconds and the chat's own sync channel. */
(function () {
  'use strict';
  const V = window.CampaignViews;
  const cfg = window.CAMPAIGN_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const esc = V.esc;
  const POLL_MS = 4000;

  const state = {
    isGM: !!cfg.isGM,
    me: cfg.user || '',
    view: cfg.view === 'relationships' ? 'relationships' : 'projects',
    who: String(cfg.character || 'all'),
    filter: 'active',
    query: '',
    heroes: [],
    pending: {},
    base: cfg.base || '../',
    theme: 'diablo',
  };
  let rev = null;
  let loading = null;
  let people = null; // students and staff, for "Add someone"

  // ---------------------------------------------------------------- theme (shared with the character sheet)
  try { state.theme = localStorage.getItem('sheet-theme') === 'parchment' ? 'parchment' : 'diablo'; } catch (_) { /* no storage */ }
  function applyTheme() {
    document.documentElement.classList.toggle('diablo', state.theme === 'diablo');
    document.body.classList.toggle('diablo-theme', state.theme === 'diablo'); // the dice roller's Diablo skin
  }

  // ---------------------------------------------------------------- server
  async function api(params) {
    const r = await fetch(cfg.api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    let j = null;
    try { j = await r.json(); } catch (_) { j = null; }
    if (!j || !j.success) throw new Error((j && j.error) || `The server said ${r.status}`);
    return j;
  }

  let syncChannel = null;
  try { syncChannel = new BroadcastChannel('campaign-sync-v1'); } catch (_) { syncChannel = null; }

  function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const j = await api({ action: 'character', character: 'all' });
        state.heroes = j.heroes || [];
        rev = j.rev;
        if (state.who !== 'all' && !state.heroes.some((h) => h.id === state.who)) state.who = state.isGM ? 'all' : (cfg.user || 'all');
        // A player's relationships are their own: that view always shows their hero.
        if (!state.isGM && state.view === 'relationships') state.who = cfg.user;
        state.pending = currentPending();
        render();
      } catch (e) {
        $('#app').innerHTML = `<p class="placeholder">Could not load: ${esc(e.message)}</p>`;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  /** A change, then everyone's screens catch up (this one at once, other windows through the channel or the poll). */
  async function change(params, done) {
    try {
      const j = await api(params);
      if (syncChannel) syncChannel.postMessage({ type: 'changed' });
      await load();
      if (done) flash(done);
      return j;
    } catch (e) {
      flash(e.message, true);
      await load();
      return null;
    }
  }

  // ---------------------------------------------------------------- drawing
  // The students list, fetched once when Relationships first shows: faces for people not linked to a student record
  // (a picture and college colour when exactly one student's name matches). A failed fetch just leaves the letters.
  let peopleAsked = false;
  function wantPeople() {
    if (peopleAsked || state.view !== 'relationships') return;
    peopleAsked = true;
    api({ action: 'students_lookup' }).then((j) => {
      people = people || j.students || [];
      state.people = people;
      render();
    }).catch(() => { /* letters stay */ });
  }
  function render() {
    wantPeople();
    const s = $('.search');
    const focused = s && document.activeElement === s;
    const pos = focused ? s.selectionStart : 0;
    $('#app').innerHTML = V.page(state);
    document.title = state.view === 'relationships' ? 'Relationships' : 'Projects';
    if (focused) { const n = $('.search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  }
  function remember() {
    try { history.replaceState(null, '', `?view=${state.view}&character=${encodeURIComponent(state.who)}`); } catch (_) { /* sandboxed */ }
  }

  function flash(text, bad) {
    document.querySelectorAll('.flash-note').forEach((n) => n.remove());
    const n = document.createElement('div');
    n.className = `flash-note${bad ? ' bad' : ''}`;
    n.textContent = text;
    document.body.append(n);
    setTimeout(() => n.remove(), bad ? 4500 : 2200);
  }

  function find(key, section) {
    const [heroId, idx] = String(key).split(':');
    const h = state.heroes.find((x) => x.id === heroId);
    const item = h && (h[section] || []).find((x) => String(x.index) === idx);
    return [h, item];
  }

  // ---------------------------------------------------------------- dialogs
  function dialog(title, body, buttons) {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"><header><h4>${esc(title)}</h4><button class="ic" data-x title="Close">×</button></header>
      <div class="modal-body">${body}</div>
      <footer>${buttons.map((b, i) => `<button data-b="${i}" class="${b.primary ? 'primary' : ''}${b.danger ? ' danger' : ''}">${esc(b.label)}</button>`).join('')}</footer></div>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') {
        const i = buttons.findIndex((b) => b.primary);
        if (i >= 0) { e.preventDefault(); el.querySelector(`[data-b="${i}"]`).click(); }
      }
    };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-x]')) { close(); return; }
      const b = e.target.closest('[data-b]');
      if (b) { const def = buttons[Number(b.dataset.b)]; if (def.onClick ? def.onClick(el) !== false : true) close(); }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(el);
    const first = el.querySelector('input:not([type=hidden]), textarea, select');
    if (first) first.focus();
    return el;
  }
  const field = (label, html) => `<label class="fld"><span>${esc(label)}</span>${html}</label>`;
  const val = (el, name) => { const f = el.querySelector(`[name="${name}"]`); return f ? f.value.trim() : ''; };
  const heroSelect = (selected) => (state.heroes.length > 1
    ? field('Hero', `<select name="hero">${state.heroes.map((h) => `<option value="${esc(h.id)}"${h.id === selected ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`)
    : `<input type="hidden" name="hero" value="${esc(cfg.user || '')}">`);
  const defaultHero = () => (state.who !== 'all' ? state.who : (state.heroes[0] ? state.heroes[0].id : ''));

  // ---------------------------------------------------------------- projects
  function newProject() {
    if (!state.isGM) {
      const hero = state.me;   // a player adds projects to their own hero only
      dialog('New project', `<p class="hint">Name your project. The Director sets how many points it needs; you can roll once that is set.</p>${field('Project', '<input name="project_name" maxlength="120">')}`, [
        { label: 'Cancel' },
        { label: 'Add project', primary: true, onClick: (el) => { const n = val(el, 'project_name'); if (!n) return false; change({ action: 'project_add', character: hero, project_name: n }, 'Project added'); return true; } },
      ]);
      return;
    }
    dialog('New project', `${heroSelect(defaultHero())}${field('Project', '<input name="project_name" maxlength="120">')}${field('Source', '<input name="source" maxlength="200">')}
      <div class="row2f">${field('Total points', '<input name="total_points" type="number" min="0" placeholder="set later">')}${field('Points so far', '<input name="points_earned" type="number" min="0" value="0">')}</div>
      ${field('Notes', '<textarea name="extra" rows="3"></textarea>')}`, [
      { label: 'Cancel' },
      { label: 'Add project', primary: true, onClick: (el) => {
        const n = val(el, 'project_name'); if (!n) return false;
        change({ action: 'project_add', character: val(el, 'hero'), project_name: n, source: val(el, 'source'), total_points: val(el, 'total_points'), points_earned: val(el, 'points_earned'), extra: val(el, 'extra') }, 'Project added');
        return true;
      } },
    ]);
  }

  function editProject(key) {
    const [h, p] = find(key, 'projects'); if (!h || !p) return;
    const ref = { character: h.id, index: String(p.index), name: p.project_name };
    dialog(`Edit · ${p.project_name}`, `${field('Project', `<input name="project_name" maxlength="120" value="${esc(p.project_name)}">`)}${field('Source', `<input name="source" maxlength="200" value="${esc(p.source || '')}">`)}
      <div class="row2f">${field('Total points', `<input name="total_points" type="number" min="0" value="${p.total_points ?? ''}" placeholder="not set">`)}${field('Points so far', `<input name="points_earned" type="number" min="0" value="${Number(p.points_earned) || 0}">`)}</div>
      ${field('Notes', `<textarea name="extra" rows="3">${esc(p.extra || '')}</textarea>`)}`, [
      { label: 'Delete', danger: true, onClick: () => { if (!confirm(`Delete "${p.project_name}" from ${h.name}'s projects?`)) return false; change(Object.assign({ action: 'project_delete' }, ref), 'Project deleted'); return true; } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: (el) => {
        if (!val(el, 'project_name')) return false;
        change(Object.assign({ action: 'project_update', project_name: val(el, 'project_name'), source: val(el, 'source'), total_points: val(el, 'total_points'), points_earned: val(el, 'points_earned'), extra: val(el, 'extra') }, ref), 'Saved');
        return true;
      } },
    ]);
  }

  function addPoints(key) {
    const [h, p] = find(key, 'projects'); if (!h || !p) return;
    dialog(`Points · ${p.project_name}`, `<p class="hint">Now ${Number(p.points_earned) || 0}${p.total_points ? ` of ${p.total_points}` : ''}. Use a minus number to take points away.</p>${field('Add', '<input name="delta" type="number" step="1" placeholder="e.g. 10">')}`, [
      { label: 'Cancel' },
      { label: 'Add', primary: true, onClick: (el) => {
        const d = Math.trunc(Number(val(el, 'delta'))); if (!d) return false;
        change({ action: 'project_add_points', character: h.id, index: String(p.index), name: p.project_name, delta: String(d) }, `${d > 0 ? '+' : ''}${d} points`);
        return true;
      } },
    ]);
  }

  function setBack(key, pos) {
    const [h, p] = find(key, 'projects'); if (!h || !p) return;
    const req = V.setBackRequest(h.id, p, Number(pos)); if (!req) return;
    if (!confirm(`Set "${p.project_name}" back to ${req.to} points? The rolls after it are removed.`)) return;
    change(req, `Set back to ${req.to}`);
  }

  /** The dashboard's project roll: School/Normal, retainers, the day counter, manual number; result to chat. */
  function roll(key) {
    const [h, p] = find(key, 'projects'); if (!h || !p) return;
    const roller = window.dashboardDiceRoller;
    if (!roller || !window.dashboardChat) { flash('The dice roller is still starting; try again in a moment.', true); return; }
    window.currentCharacter = h.id;     // the roll's chat card and award go to this hero
    window.currentUser = h.id;          // the dice roller gives Zepha 6d10 a day by this name
    roller.startProjectRollForProject(p.index, p.project_name);
  }

  // ---------------------------------------------------------------- relationships
  function relPoints(key, delta) {
    const [h, r] = find(key, 'relationships'); if (!h || !r) return;
    change({ action: 'relationship_points', character: h.id, index: String(r.index), name: r.npc_name, delta: String(delta) });
  }

  function editRel(key) {
    const [h, r] = find(key, 'relationships'); if (!h || !r) return;
    const ref = { character: h.id, index: String(r.index), name: r.npc_name };
    const linked = r.link && r.link.type;
    dialog(`Edit · ${r.display_name}`, `${linked ? `<p class="hint">${r.link.type === 'student' ? 'Linked to the Students page: points and notes stay in step.' : 'Linked to the Staff page (name only; staff records keep no points).'}</p>` : field('Name', `<input name="npc_name" maxlength="100" value="${esc(r.npc_name)}">`)}
      ${field('Points', `<input name="points" type="number" step="1" value="${Number(r.points) || 0}">`)}
      <div class="row2f">${field('Boon', `<input name="boon" maxlength="300" value="${esc(r.boon)}">`)}${field('Bane', `<input name="bane" maxlength="300" value="${esc(r.bane)}">`)}</div>
      ${field('Notes', `<textarea name="extra" rows="4">${esc(r.extra)}</textarea>`)}`, [
      { label: 'Delete', danger: true, onClick: () => { if (!confirm(`Remove ${r.display_name} from ${h.name}'s relationships?`)) return false; change(Object.assign({ action: 'relationship_delete' }, ref), 'Removed'); return true; } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: (el) => {
        const params = Object.assign({ action: 'relationship_update', points: val(el, 'points') || '0', boon: val(el, 'boon'), bane: val(el, 'bane'), extra: val(el, 'extra') }, ref);
        if (!linked) { params.npc_name = val(el, 'npc_name'); if (!params.npc_name) return false; }
        change(params, 'Saved');
        return true;
      } },
    ]);
  }

  async function addRel() {
    if (!people) {
      try { people = (await api({ action: 'students_lookup' })).students || []; state.people = people; } catch (e) { flash(e.message, true); return; }
    }
    const el = dialog('Add someone', `${heroSelect(defaultHero())}${field('Who', '<input name="q" type="search" placeholder="Type a student’s name, or any name…" autocomplete="off">')}<div class="picklist"></div>`, [{ label: 'Cancel' }]);
    const q = el.querySelector('[name="q"]'), list = el.querySelector('.picklist'), heroSel = el.querySelector('[name="hero"]');
    const draw = () => {
      const text = q.value.trim().toLowerCase();
      const hero = state.heroes.find((x) => x.id === heroSel.value);
      const taken = new Set((hero ? hero.relationships : []).filter((r) => r.link).map((r) => `${r.link.type}:${r.link.id}`));
      const hits = people.filter((p) => !text || String(p.name).toLowerCase().includes(text)).slice(0, 40);
      list.innerHTML = hits.map((p) => {
        const has = taken.has(`${p.type}:${p.id}`);
        return `<button class="pick" data-type="${esc(p.type)}" data-id="${esc(p.id)}"${has ? ' disabled' : ''}><span class="face sm" style="${p.image ? `background-image:url('${esc(V.mediaUrl(state.base, p.image).replace(/'/g, '%27'))}')` : ''}">${p.image ? '' : esc(String(p.name).slice(0, 1))}</span>
          <span class="pk"><b>${esc(p.name)}</b><small>${esc([p.type === 'staff' ? 'Staff' : 'Student', p.college, p.grade || p.role].filter(Boolean).join(' · '))}${has ? ' · already on the list' : ''}</small></span></button>`;
      }).join('') + (text ? `<button class="pick plain" data-type="" data-name="${esc(q.value.trim())}"><span class="pk"><b>Add “${esc(q.value.trim())}” by name only</b><small>Not on the Students or Staff pages</small></span></button>` : '');
    };
    q.addEventListener('input', draw);
    heroSel.addEventListener('change', draw);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.pick'); if (!b || b.disabled) return;
      const params = { action: 'relationship_add', character: heroSel.value, link_type: b.dataset.type };
      if (b.dataset.type) params.link_id = b.dataset.id; else params.npc_name = b.dataset.name;
      el.remove();
      change(params, 'Added');
    });
    draw();
  }

  // ---------------------------------------------------------------- clicks
  function wire() {
    const app = $('#app');
    app.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.view) { state.view = d.view; state.query = ''; if (!state.isGM && state.view === 'relationships') state.who = state.me; remember(); render(); return; }
      if (d.who) { state.who = d.who; remember(); render(); return; }
      if (d.filter) { state.filter = d.filter; render(); return; }
      if ('themeToggle' in d) { state.theme = state.theme === 'diablo' ? 'parchment' : 'diablo'; try { localStorage.setItem('sheet-theme', state.theme); } catch (_) { /* no storage */ } applyTheme(); render(); return; }
      if (d.roll) { roll(d.roll); return; }
      if ('newproj' in d) { newProject(); return; }
      if (!state.isGM) return; // everything below is the Director's
      if (d.pts) addPoints(d.pts);
      else if (d.pedit) editProject(d.pedit);
      else if (d.setback) setBack(d.setback, d.pos);
      else if (d.rp) relPoints(d.rel, Number(d.rp));
      else if (d.redit) editRel(d.redit);
      else if ('add' in d) addRel();
    });
    app.addEventListener('input', (e) => {
      if (!e.target.classList.contains('search')) return;
      state.query = e.target.value.trim().toLowerCase();
      render();
    });
  }

  // ---------------------------------------------------------------- keeping up with chat and other windows
  function currentPending() {
    try { return V.pendingRolls(window.dashboardChat ? window.dashboardChat.getMessages() : [], state.heroes); } catch (_) { return {}; }
  }
  function refreshPending() {
    const next = currentPending();
    if (JSON.stringify(next) !== JSON.stringify(state.pending)) { state.pending = next; render(); }
  }
  async function poll() {
    if (document.hidden || loading) return;
    try {
      const j = await api({ action: 'revision' });
      if (rev !== null && j.rev !== rev) load();
    } catch (_) { /* next time */ }
  }
  let soon = null;
  const reloadSoon = () => { clearTimeout(soon); soon = setTimeout(load, 250); };

  // The chat's Accept in the Table's chat window (another page) tells every page through this channel.
  try {
    const chatSync = new BroadcastChannel('dnd-chat-sync-v1');
    chatSync.addEventListener('message', (e) => {
      const m = e.data && e.data.message;
      if (e.data && e.data.type === 'chat-message-updated' && m && m.type === 'project_roll') { reloadSoon(); setTimeout(refreshPending, 400); }
    });
  } catch (_) { /* polling covers it */ }
  if (syncChannel) syncChannel.addEventListener('message', reloadSoon);
  // When this page's own (hidden) chat accepted a roll — only if the Director ever uses it here.
  window.handleAcceptedProjectRoll = () => reloadSoon();

  applyTheme();
  wire();
  remember();
  load();
  setInterval(poll, POLL_MS);
  setInterval(refreshPending, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
