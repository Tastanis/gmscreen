/* Projects and Relationships screens: the HTML for each view, from the state. No DOM, no requests, so it runs in
   node tests too (dnd/campaign/__tests__). campaign.js owns the page: loading, clicks, dialogs, the dice roller.

   state = { isGM, view: 'projects'|'relationships', who: 'all'|heroId, filter: 'active'|'done'|'all', query,
             heroes: [{ id, name, info: { portrait, ... }, projects: [...], relationships: [...] }],
             pending: { 'hero:index': total }, base: '../' (the dnd/ folder, for pictures), theme }
   Projects come from api/campaign.php already cut down for players (their points, no history or notes);
   the views also check isGM, so a player never gets the Director's tools even if more data arrived. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampaignViews = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  /** A stored path (under dnd/) as a URL from this page; full URLs and absolute paths stay as they are. */
  function mediaUrl(base, path) {
    const p = String(path || '').trim();
    if (!p) return '';
    if (/^(https?:)?\/\//i.test(p) || p.startsWith('/') || p.startsWith('data:')) return p;
    return (base || '') + p.replace(/^\.\//, '');
  }
  /**
   * Notes as typed, tidied for reading (never saved back): trailing commas and spaces gone, runs of spaces collapsed,
   * and a missing space after a signed number before a short word ("+2to" -> "+2 to"). Line breaks are kept.
   */
  function cleanNote(text) {
    return String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line
        .replace(/[ \t ]{2,}/g, ' ')
        .replace(/(^|[\s(])([+\-−]\d+)(to|on|in|vs|for|at|and|or|with|per)(?=[\s.,;:!?)]|$)/g, '$1$2 $3')
        .replace(/[\s,]+$/, '')
        .trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }
  const bg = (url) => (url ? `background-image:url('${esc(String(url).replace(/'/g, '%27'))}')` : '');

  const visibleHeroes = (state) => (state.who === 'all' ? state.heroes : state.heroes.filter((h) => h.id === state.who));
  /** The owner's face on a card (only when every hero is shown): ringed in the hero's college colour, gold when unknown. */
  const heroDot = (state, h, force = false) => {
    if (state.who !== 'all' && !force) return '';
    const c = collegeKey(h.info && h.info.college);
    return `<span class="hero-dot owner${c ? ` c-${c}` : ''}" style="${bg(mediaUrl(state.base, h.info && h.info.portrait))}" title="${esc(h.name)}"></span>`;
  };

  // ---------------------------------------------------------------- projects

  /** The roll button's die: a line drawing in the button's colour (the 🎲 emoji was off-palette). */
  const DIE = '<svg class="die" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z"/><path d="M3.5 7.4L12 12.3l8.5-4.9M12 12.3v9.2"/><circle cx="12" cy="7.2" r="1.1"/><circle cx="7.6" cy="13.4" r="1.1"/><circle cx="16.4" cy="13.4" r="1.1"/></svg>';

  /** 0..1+ how far along; waiting projects (no total yet) count as 0. */
  function progress(p) {
    if (p.waiting) return 0;
    if (p.total_points) return num(p.points_earned) / num(p.total_points);
    return num(p.percent) / 100;
  }
  const isDone = (p) => !p.waiting && (p.complete || progress(p) >= 1);
  /**
   * The whole percent shown on a card, the same for the Director and players: rounded DOWN, so nothing reads 100%
   * before it is complete (api/campaign.php floors the players' percent the same way). Integer maths, so 29/100 is 29.
   */
  function percentOf(p) {
    if (p.waiting) return 0;
    const raw = num(p.total_points) > 0
      ? Math.floor((num(p.points_earned) * 100) / num(p.total_points) + 1e-9)
      : Math.floor(num(p.percent) + 1e-9);
    const pct = Math.min(100, Math.max(0, raw));
    return pct >= 100 && !isDone(p) ? 99 : pct;
  }
  const isClose = (p) => !p.waiting && !isDone(p) && progress(p) >= 0.75;

  /** The last few rolls, newest first: [{ total, step, pos, now }] (pos = place in points_history; now = the newest,
   *  drawn bold with no "set back" button). The history keeps totals only, no times, so no "3 d ago" labels. */
  function historyRows(p, count = 4) {
    const hist = (p.points_history || []).map(num);
    const rows = hist.map((total, pos) => ({ total, step: total - (pos ? hist[pos - 1] : 0), pos }));
    return rows.slice(-count).reverse().map((r, n) => Object.assign(r, { now: n === 0 }));
  }

  /** What "↶ Set back to N" sends: points go back to that roll's total, the rolls after it are dropped. */
  function setBackRequest(heroId, p, pos) {
    const hist = (p.points_history || []).map(num);
    if (!(pos >= 0 && pos < hist.length - 1)) return null;
    return { action: 'project_set_back', character: heroId, index: String(p.index), name: p.project_name, to_index: String(pos), to: String(hist[pos]) };
  }

  function projectCard(state, h, p) {
    const gm = !!state.isGM;
    const key = `${h.id}:${p.index}`;
    const waiting = !!p.waiting, done = isDone(p), close = isClose(p);
    const pct = percentOf(p);
    let hist = '';
    if (gm) {
      const rows = historyRows(p);
      hist = rows.length ? `<div class="hist"><span class="hl">Last rolls</span>${rows.map((r) => `<div class="hrow${r.now ? ' now' : ''}"><span>${r.step >= 0 ? '+' : ''}${r.step} → <b>${r.total}</b></span>${r.now ? ''
        : `<button class="setback" data-setback="${key}" data-pos="${r.pos}" title="Set the points back to ${r.total} (undo the rolls after it)">↶ Set back to ${r.total}</button>`}</div>`).join('')}</div>`
        : '<div class="hist empty">No rolls yet</div>';
    }
    // A player looking at another hero's project (rolling on it is allowed: the Director asked for it): whose it is,
    // said in words under the title, with that hero's face even when only that hero is shown.
    const other = !gm && !!state.me && h.id !== state.me;
    const owner = other ? `<span class="owner-tag" title="${esc(h.name)} owns this project; you can still roll on it">${esc(h.name)}’s project</span>` : '';
    const pending = state.pending && state.pending[key] !== undefined
      ? `<div class="pending">⏳ ${gm ? `Roll of <b>${esc(state.pending[key])}</b> sent to chat` : 'Roll sent to chat'} — waiting for the Director</div>` : '';
    return `<article class="pj${done ? ' done' : close ? ' close' : ''}" data-key="${key}">
      <header>${heroDot(state, h, other)}<div class="ttl"><h4 title="${esc(p.project_name || 'Project')}">${esc(p.project_name || 'Project')}</h4>${owner}${done ? '<span class="ribbon">Complete</span>' : close ? '<span class="ribbon soon" title="75% or more of the way">Nearly done</span>' : ''}</div></header>
      <div class="body">
        ${gm && p.source ? `<div class="src">Source: ${esc(p.source)}</div>` : ''}
        ${waiting ? `<div class="await">Waiting for the Director to set the total${gm ? ' — click ✎ to set it' : ''}</div>`
        : `<div class="pbar"><div class="fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div><span>${num(p.total_points) > 0 ? `${num(p.points_earned)} / ${num(p.total_points)} ` : ''}<small>${pct}%</small></span></div>`}
        ${hist}
        ${gm && cleanNote(p.extra) ? `<p class="notes">${esc(cleanNote(p.extra))}</p>` : ''}
        ${pending}
      </div>
      <footer>${done ? '<span class="muted">Finished</span>' : waiting ? '<span class="muted">Roll once the total is set</span>' : `<button class="roll-btn" data-roll="${key}">${DIE}Project roll</button>`}${gm ? `<span class="gm"><button class="ic2" data-pts="${key}" title="Add points by hand" aria-label="Add points by hand">±</button><button class="ic2" data-pedit="${key}" title="Edit: name, source, total, points, notes" aria-label="Edit project">✎</button></span>` : ''}</footer>
    </article>`;
  }

  function projectList(state) {
    const list = [];
    visibleHeroes(state).forEach((h) => (h.projects || []).forEach((p) => list.push([h, p])));
    return list;
  }

  function projectsView(state) {
    const list = projectList(state);
    const counts = { active: list.filter(([, p]) => !isDone(p)).length, done: list.filter(([, p]) => isDone(p)).length, all: list.length };
    const ready = list.filter(([, p]) => isClose(p)).length;
    const q = String(state.query || '').toLowerCase();
    let shown = list.filter(([, p]) => (state.filter === 'active' ? !isDone(p) : state.filter === 'done' ? isDone(p) : true));
    if (q) shown = shown.filter(([h, p]) => `${p.project_name} ${p.source || ''} ${p.extra || ''} ${h.name}`.toLowerCase().includes(q));
    if (state.filter !== 'done') shown = shown.slice().sort((a, b) => progress(b[1]) - progress(a[1]));
    const canAdd = state.isGM || state.heroes.length > 0;
    // The counts per filter are on the filter chips; the summary says only what the chips do not: how many are close.
    const summary = ready ? `<b>${ready}</b> nearly done <small>(75% or more)</small>` : counts.active ? 'None nearly done yet' : '';
    return `${summary ? `<div class="summary">${summary}</div>` : ''}
      <div class="filters"><div class="subtabs">${[['active', 'In progress'], ['done', 'Complete'], ['all', 'All']].map(([k, l]) => `<button data-filter="${k}" class="${state.filter === k ? 'on' : ''}">${l}<i>${counts[k]}</i></button>`).join('')}</div>
        <input class="search" type="search" placeholder="Search projects…" value="${esc(state.query || '')}">${canAdd ? '<button class="add-btn" data-newproj>+ New project</button>' : ''}</div>
      <div class="pj-grid">${shown.map(([h, p]) => projectCard(state, h, p)).join('') || '<p class="placeholder">No projects here.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- relationships

  const COLLEGES = ['lorehold', 'prismari', 'quandrix', 'silverquill', 'witherbloom'];
  /** "Silverquill" / "silverquill college" -> 'silverquill'; '' when it is not one of the five. */
  function collegeKey(college) {
    const c = String(college || '').toLowerCase();
    return COLLEGES.find((k) => c.includes(k)) || '';
  }
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  /**
   * For a relationship with no student link: the one student whose name holds every word of this name ("Theo
   * Gearsprocket" -> "Theo Gearsprocket Finch", "Rampart" -> "Bhedum 'Rampart' Sooviij"). Only for the face (picture
   * and college colour); null when none or more than one match.
   */
  function guessStudent(people, name) {
    const want = words(name);
    if (!want.length || !Array.isArray(people)) return null;
    const hits = people.filter((p) => { const have = words(p && p.name); return want.every((w) => have.includes(w)); });
    return hits.length === 1 ? hits[0] : null;
  }

  function relCard(state, h, r) {
    const gm = !!state.isGM;
    const pts = num(r.points), mag = Math.min(10, Math.abs(pts));
    const link = r.link;
    const name = r.display_name || r.npc_name || 'Someone';
    const guess = link ? null : guessStudent(state.people, name);
    const face = link || guess || {};
    const pic = face.image ? bg(mediaUrl(state.base, face.image)) : '';
    const college = collegeKey(face.college) || 'neutral';
    const faceTitle = guess ? ` title="Picture from the Students page: ${esc(guess.name)}"` : face.college ? ` title="${esc(face.college)}"` : '';
    const sub = link
      ? `${esc([link.college, link.year || link.role].filter(Boolean).join(' · ') || (link.type === 'staff' ? 'Staff' : 'Student'))}${link.synced ? ' · <span class="link" title="Points and notes stay in step with the Students page">⇄ Students</span>' : ''}`
      // Not linked: "NPC" plus what is known, as full a line as a college label ("Silverquill · 2nd Year").
      : `NPC · ${guess && guess.college ? esc(guess.college) : 'not on the Students page'}`;
    const key = `${h.id}:${r.index}`;
    return `<article class="rel ${pts > 0 ? 'pos' : pts < 0 ? 'neg' : ''}" data-key="${key}">
      <div class="who2"><div class="face c-${college}" style="${pic}"${faceTitle}>${pic ? '' : esc(String(name).slice(0, 1))}</div>
        <div class="nm"><b>${esc(name)}</b><span class="sub${link ? '' : ' sub-npc'}">${sub}</span></div>${heroDot(state, h)}</div>
      <div class="meter" title="${pts > 0 ? 'Friendly' : pts < 0 ? 'Strained' : 'Neutral'}: ${pts > 0 ? '+' : ''}${pts} (−10 strained … +10 friendly)"><span class="neg-side"><i style="width:${pts < 0 ? mag * 10 : 0}%"></i></span><b>${pts > 0 ? '+' : ''}${pts}</b><span class="pos-side"><i style="width:${pts > 0 ? mag * 10 : 0}%"></i></span></div>
      <div class="meter-ends" aria-hidden="true"><span>strained</span><span>friendly</span></div>
      ${r.boon || r.bane ? `<div class="bb">${r.boon ? `<span class="boon">Boon: ${esc(cleanNote(r.boon))}</span>` : ''}${r.bane ? `<span class="bane">Bane: ${esc(cleanNote(r.bane))}</span>` : ''}</div>` : ''}
      ${cleanNote(r.extra) ? `<p class="notes">${esc(cleanNote(r.extra))}</p>` : '<p class="notes none">No notes</p>'}
      ${gm ? `<footer class="gm"><button class="ic2" data-rp="-1" data-rel="${key}" title="Worse">−</button><button class="ic2" data-rp="1" data-rel="${key}" title="Better">+</button><button class="ic2" data-redit="${key}" title="Edit">✎</button></footer>` : ''}
    </article>`;
  }

  function relationshipsView(state) {
    const list = [];
    visibleHeroes(state).forEach((h) => (h.relationships || []).forEach((r) => list.push([h, r])));
    const q = String(state.query || '').toLowerCase();
    let shown = q ? list.filter(([h, r]) => `${r.display_name} ${r.npc_name} ${r.extra} ${r.boon} ${r.bane} ${h.name}`.toLowerCase().includes(q)) : list;
    shown = shown.slice().sort((a, b) => num(b[1].points) - num(a[1].points));
    const pos = list.filter(([, r]) => num(r.points) > 0).length, neg = list.filter(([, r]) => num(r.points) < 0).length;
    return `<div class="summary"><b>${list.length}</b> relationships · <b class="g">${pos}</b> friendly · <b class="r">${neg}</b> strained</div>
      <div class="filters"><input class="search" type="search" placeholder="Search people, notes…" value="${esc(state.query || '')}">${state.isGM ? '<button class="add-btn" data-add>+ Add someone</button>' : ''}</div>
      <div class="rel-grid${shown.length && shown.length <= 6 ? ' few' : ''}">${shown.map(([h, r]) => relCard(state, h, r)).join('') || '<p class="placeholder">No relationships yet.</p>'}${state.isGM && shown.length ? '<button class="rel-add-tile" data-add>+ Add someone</button>' : ''}</div>`;
  }

  // ---------------------------------------------------------------- the page

  function page(state) {
    // Projects: everyone sees every hero (players: title, bar and roll). Relationships: a player sees only their own.
    const ownOnly = !state.isGM && state.view === 'relationships';
    const chipHeroes = ownOnly ? state.heroes.filter((h) => h.id === state.me) : state.heroes;
    const chips = `${ownOnly ? '' : `<button data-who="all" class="hchip${state.who === 'all' ? ' on' : ''}">All heroes</button>`}${chipHeroes.map((h) => `<button data-who="${esc(h.id)}" class="hchip${state.who === h.id ? ' on' : ''}"><span class="hero-dot" style="${bg(mediaUrl(state.base, h.info && h.info.portrait))}"></span>${esc(h.name)}</button>`).join('')}`;
    return `<div class="cm-top">
        <nav class="tabs"><button data-view="projects" class="${state.view === 'projects' ? 'on' : ''}">Projects</button><button data-view="relationships" class="${state.view === 'relationships' ? 'on' : ''}">Relationships</button>
          <span class="tab-tools"><button class="theme-toggle" data-theme-toggle>${state.theme === 'parchment' ? '☾ Diablo' : '☀ Parchment'}</button></span></nav>
        <div class="heroes-bar">${chips}</div>
      </div><div class="cm-body">${state.view === 'relationships' ? relationshipsView(state) : projectsView(state)}</div>`;
  }

  /** Project rolls waiting in chat: { 'hero:index': total } from the chat's messages. */
  function pendingRolls(messages, heroes) {
    const out = {};
    (messages || []).forEach((m) => {
      if (!m || m.type !== 'project_roll' || !m.payload) return;
      const pl = m.payload;
      if (String(pl.status || 'pending').toLowerCase() !== 'pending') return;
      const hero = (heroes || []).find((h) => h.id === pl.characterId);
      if (!hero) return;
      const name = String(pl.projectName || '').trim().toLowerCase();
      let p = (hero.projects || []).find((x) => x.index === Number(pl.projectIndex));
      if (p && name && String(p.project_name).trim().toLowerCase() !== name) p = null;
      if (!p && name) p = (hero.projects || []).find((x) => String(x.project_name).trim().toLowerCase() === name);
      if (p) out[`${hero.id}:${p.index}`] = pl.total;
    });
    return out;
  }

  return { esc, mediaUrl, cleanNote, progress, percentOf, isDone, isClose, historyRows, setBackRequest, projectCard, projectsView, relCard, relationshipsView, page, pendingRolls, collegeKey, guessStudent };
}));
