/* Sheet mock-up: loads a hero's real sheet (read only) and shows the proposed layout.
   Buttons change the numbers on this page only, to show how it feels; nothing is saved. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const words = (s) => String(s ?? '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/^( · )+|( · )+$/g, '').trim();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PORTRAITS = { indigo: 'indigo_portrait_1750287056.jpg', zepha: 'zepha_portrait_1750214726.png', cal: 'cal_portrait_1750214637.png', sharon: 'sharon_portrait_1750262899.png' };
  const params = new URLSearchParams(location.search);
  let who = (params.get('character') || 'indigo').toLowerCase();
  let data = null, tab = 'skills', abTab = 'all', editing = false;
  const local = {};   // numbers changed on this page only

  // Standalone: a bar to preview the three widths. Inside a Table window the window itself is the size.
  const embedded = window.top !== window;
  if (!embedded) {
    $('#preview').hidden = false;
    $('#who').value = who;
    $('#who').onchange = () => { who = $('#who').value; load(); };
    document.querySelectorAll('#preview [data-w]').forEach((b) => b.onclick = () => {
      document.querySelectorAll('#preview [data-w]').forEach((x) => x.classList.toggle('on', x === b));
      const w = Number(b.dataset.w); const sheet = $('#sheet');
      sheet.style.width = w ? w + 'px' : '100%'; $('#stage').classList.toggle('framed', !!w);
      requestAnimationFrame(measure);
    });
  }

  // Theme: the site's Diablo choice (dashboard setting) or parchment; the preview bar can switch it.
  // Theme: Diablo unless this browser chose Parchment on the sheet (Brandon, October 2026).
  let theme = 'diablo'; try { theme = localStorage.getItem('sheet-theme') || 'diablo'; } catch (_) { /* no storage */ }
  const setTheme = (t) => { theme = t; document.documentElement.classList.toggle('diablo', t === 'diablo'); try { localStorage.setItem('sheet-theme', t); } catch (_) { /* no storage */ } };
  setTheme(theme);

  async function load() {
    $('#sheet').innerHTML = '<p class="placeholder">Loading the sheet…</p>';
    try {
      const r = await fetch(`/dnd/character_sheet/handler.php?action=load&character=${encodeURIComponent(who)}`, { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'not loaded');
      data = j.data; Object.keys(local).forEach((k) => delete local[k]);
      render();
    } catch (e) { $('#sheet').innerHTML = `<p class="placeholder">Could not load ${esc(who)}'s sheet: ${esc(e.message)}</p>`; }
  }

  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const sign = (n) => (n > 0 ? '+' + n : String(n));
  const v = () => data.hero.vitals || {};
  const cur = (k, d) => (k in local ? local[k] : d);

  function statusHtml() {
    const h = data.hero, vit = v();
    const max = num(vit.staminaMax, 1), st = cur('stamina', num(vit.currentStamina, max)), temp = Math.max(0, st - max), shown = Math.min(st, max);
    const r = shown / max, color = st <= 0 ? 'var(--red)' : r <= .5 ? 'var(--amber)' : 'var(--green)';
    const recMax = num(vit.recoveriesMax), rec = cur('rec', num(vit.currentRecoveries, recMax));
    const recVal = Math.floor(max / 3), stored = num(vit.recoveryValue, recVal);
    const res = h.resource || {}, resVal = cur('res', num(res.value));
    const tokens = Array.isArray(h.heroTokens) ? h.heroTokens : [];
    const s = h.stats || {};
    const pic = PORTRAITS[who] ? `background-image:url(/dnd/portraits/${PORTRAITS[who]})` : '';
    return `<div class="status" id="status">
      <div class="who"><div class="pic" style="${pic}"></div>
        <div class="name"><b>${esc(h.name)}</b><span>L${esc(h.level)} ${esc(h.class)}${h.classTrack ? ' · ' + esc(h.classTrack) : ''} · ${esc(h.ancestry || '')}</span></div>
        <div class="counters">
          <div class="ctr" title="Hero tokens (party)"><small>Tokens</small><span class="tokens">${tokens.map((t) => `<i class="${t ? 'used' : ''}"></i>`).join('')}</span></div>
          <div class="ctr" title="Surges"><small>Surges</small><button class="mini" data-k="surges" data-d="-1">−</button> <b>${cur('surges', num(h.surges))}</b> <button class="mini" data-k="surges" data-d="1">+</button></div>
          <div class="ctr" title="Victories"><small>Victories</small><button class="mini" data-k="victories" data-d="-1">−</button> <b>${cur('victories', num(h.victories))}</b> <button class="mini" data-k="victories" data-d="1">+</button></div>
        </div>
      </div>
      <div class="vitals">
        <div class="stam" title="Winded at half (${Math.floor(max / 2)})"><div class="fill" style="width:${Math.max(0, r * 100)}%;background:${color}"></div>${temp ? `<div class="temp" style="width:${Math.min(100, temp / max * 100)}%"></div>` : ''}<div class="winded"></div>
          <div class="txt"><span>${st} / ${max}${temp ? ` <small>+${temp} temp</small>` : ''}</span><small>${st <= 0 ? 'dying' : r <= .5 ? 'winded' : 'stamina'}</small></div></div>
        <div class="vbtns"><button class="dmg" data-act="dmg" title="Take damage">− Dmg</button><button class="heal" data-act="heal" title="Heal">+ Heal</button><button class="tmp" data-act="temp" title="Temporary stamina">Temp</button></div>
      </div>
      <div class="row2">
        <div class="rec"><span class="lbl">Recoveries</span><span class="pips">${Array.from({ length: recMax }, (_, i) => `<i class="${i < rec ? '' : 'used'}"></i>`).join('')}</span><b>${rec}/${recMax}</b><button data-act="spend" title="Spend one recovery: heal ${recVal} (a third of ${max})${stored !== recVal ? ` · the sheet has ${stored} stored, which is out of date` : ''}">Spend recovery +${recVal}</button>${stored !== recVal ? '<span class="warn" title="The sheet stores a different recovery value">!</span>' : ''}</div>
        <div class="res"><span class="lbl">${esc(res.title || 'Resource')}</span><button data-k="res" data-d="-1">−</button><b>${resVal}</b><button data-k="res" data-d="1">+</button>${res.autoDice ? `<button data-act="roll" title="Start of turn">+${esc(res.autoDice)}</button>` : ''}</div>
        <div class="conds">${(local.conds || []).map((c) => `<span class="cond">${esc(c)}</span>`).join('')}<span class="cond add" data-act="cond">+ condition</span></div>
      </div>
      <div class="statboxes">${[['might', 'Might'], ['agility', 'Agility'], ['reason', 'Reason'], ['intuition', 'Intuition'], ['presence', 'Presence']].map(([k, l]) => `<div class="sb"><b>${sign(num(s[k]))}</b><small>${l}</small></div>`).join('')}</div>
      <div class="vline"><span>Speed <b>${esc(vit.speed)}</b></span><span>Stability <b>${esc(vit.stability)}</b></span><span>Disengage <b>${esc(vit.disengage)}</b></span><span>Size <b>${esc(vit.size)}</b></span><span>Save <b>${esc(vit.save)}+</b></span></div>
    </div>`;
  }

  // ---------------------------------------------------------------- cards (like the game's ability cards, cleaner)
  const TYPE = { mains: ['main', 'Main action'], maneuvers: ['maneuver', 'Maneuver'], triggers: ['trigger', 'Triggered action'], freeStrikes: ['free', 'Free strike'] };
  const ICON = {
    range: '<svg viewBox="0 0 24 24"><path d="M4 20L20 4M20 4h-7M20 4v7M4 20h7M4 20v-7"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/></svg>',
    trigger: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  };
  // Split the sheet's text into a flavour line and labelled parts ("Effect:", "Strained:", "Spend 2 Clarity:" ...).
  function parts(html) {
    const lines = String(html || '').split(/<br\s*\/?>/i).map((l) => l.replace(/&nbsp;/g, ' ').trim()).filter((l) => l && l !== ' ');
    const flavour = [], labelled = [];
    for (const raw of lines) {
      const text = raw.replace(/<\/?(b|strong|i|em|div|span)[^>]*>/gi, '').trim();
      const m = text.match(/^([A-Z][A-Za-z0-9 '+\-]{1,28}):\s*(.*)$/);
      if (m) labelled.push([m[1], m[2]]);
      else if (labelled.length) labelled[labelled.length - 1][1] += ' ' + text;
      else flavour.push(text);
    }
    return { flavour: flavour.join(' '), labelled };
  }
  const plain = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  function tierRow(badge, cls, t) {
    if (!t) return '';
    const bits = [t.damage ? `<b>${esc(t.damage)}${t.damageType ? ' ' + esc(t.damageType) : ''}</b>${/damage/i.test(t.notes || '') ? '' : (t.damage ? ' damage' : '')}` : '', t.notes ? esc(t.notes) : '', t.attributeCheck?.enabled ? `<span class="chk">${esc(t.attributeCheck.attribute)} &lt; ${esc(t.attributeCheck.threshold)}</span> ${esc(t.attributeCheck.effect)}` : ''].filter(Boolean);
    const joined = bits.reduce((acc, b, i) => acc + (i ? (/^[+\-]/.test(b.replace(/<[^>]+>/g, '').trim()) ? ' ' : '; ') : '') + b, '');
    return `<div class="tr"><span class="tb ${cls}">${badge}</span><span>${joined || '—'}</span></div>`;
  }
  const editTools = () => (editing ? '<span class="grip" title="Drag to move">⋮⋮</span>' : '');
  const editBtns = () => (editing ? '<button class="ic" data-edit title="Edit">✎</button><button class="ic" data-export title="Copy this card as JSON">⤓</button><button class="ic" data-del title="Delete">🗑</button>' : '');
  function abilityCard(a, kind, index = 0) {
    const [cls, label] = TYPE[kind] || ['main', a.actionLabel || ''];
    const test = (a.tests || [])[0];
    const { flavour, labelled } = parts(a.description);
    const extra = test?.additionalEffect && !plain(a.description).includes(plain(test.additionalEffect).slice(0, 40)) ? parts(test.additionalEffect).labelled.concat(parts(test.additionalEffect).flavour ? [['Effect', parts(test.additionalEffect).flavour]] : []) : [];
    const sig = !a.cost && kind === 'mains' ? 'Signature ability' : '';
    const roll = test?.label ? test.label.replace(/^Power Roll/i, '<b>Power Roll</b>') : '';
    return `<article class="card-ab ${cls}" data-kind="${kind}" data-i="${index}" ${editing ? 'draggable="true"' : ''}>
      <header>${editTools()}<h4>${esc(a.name)}</h4>${a.cost ? `<span class="cost">${esc(a.cost)}</span>` : ''}${editing ? editBtns() : '<button class="use" data-roll title="Use it on the board">Use</button>'}</header>
      <div class="body">
        ${sig ? `<div class="sig">${sig}</div>` : ''}
        ${flavour ? `<p class="flavour">${esc(flavour)}</p>` : ''}
        <div class="kwline"><span>${(a.tags || []).map(esc).join(', ')}</span><span class="atype">${esc(a.actionLabel || label)}</span></div>
        ${a.range || a.target ? `<div class="rt">${a.range ? `<span>${ICON.range}${esc(a.range)}</span>` : ''}${a.target ? `<span><i>${ICON.target}</i><em>${esc(a.target)}</em></span>` : ''}</div>` : ''}
        ${a.trigger ? `<div class="trig">${ICON.trigger}<span><b>Trigger:</b> ${esc(a.trigger)}</span></div>` : ''}
        ${test?.tiers ? `<div class="roll">${roll}</div>${tierRow('≤11', 't1', test.tiers.low)}${tierRow('12–16', 't2', test.tiers.mid)}${tierRow('17+', 't3', test.tiers.high)}` : ''}
        ${labelled.concat(extra).map(([k, v]) => `<p class="lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}
        ${a.useWhen ? `<p class="usewhen">Use when ${esc(a.useWhen)}</p>` : ''}
      </div></article>`;
  }
  function featureCard(f, index = 0) {
    const { flavour, labelled } = parts(f.text);
    const long = plain(f.text).length > 260;
    return `<article class="card-ft${long ? ' long' : ''}" data-feat data-kind="features" data-i="${index}" ${editing ? 'draggable="true"' : ''}>
      <header>${editTools()}<h4>${esc(f.title)}</h4>${editBtns()}${(f.tags || []).length ? `<span class="tags">${f.tags.map(esc).join(' · ')}</span>` : ''}</header>
      <div class="body">${flavour ? `<p>${esc(flavour)}</p>` : ''}${labelled.map(([k, v]) => `<p class="lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}
        ${f.useWhen && !/type about this/i.test(f.useWhen) ? `<p class="usewhen">Use when ${esc(f.useWhen)}</p>` : ''}</div>
      ${long ? '<button class="more-btn" data-more>Show all</button>' : ''}</article>`;
  }
  const SKILL_GROUPS = {
    Crafting: ['Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking', 'Fletching', 'Forgery', 'Jewelry', 'Mechanics', 'Tailoring'],
    Exploration: ['Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump', 'Lift', 'Navigate', 'Ride', 'Swim'],
    Interpersonal: ['Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate', 'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person'],
    Intrigue: ['Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist', 'Hide', 'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search', 'Sneak', 'Track'],
    Lore: ['Culture', 'Criminal Underworld', 'History', 'Magic', 'Monsters', 'Nature', 'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'],
  };
  function traitsHtml() {
    const sk = data.sidebar?.skills || {}, L = data.sidebar?.lists || {}, h = data.hero;
    const groups = {}; Object.entries(sk).forEach(([n, v]) => { const g = Object.keys(SKILL_GROUPS).find((k) => SKILL_GROUPS[k].includes(n)) || 'Other'; (groups[g] ||= []).push([n, v]); });
    const list = (arr) => (arr || []).map((x) => (typeof x === 'string' ? x : x.title || '')).filter(Boolean);
    const card = (title, inner, cls = '') => `<article class="card-tr ${cls}"><header><h4>${title}</h4></header><div class="body">${inner}</div></article>`;
    const chips = (arr, cls = '') => arr.length ? `<div class="chips">${arr.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join('')}</div>` : '<p class="none">None</p>';
    const out = [];
    out.push(card('Skills', Object.entries(groups).map(([g, arr]) => `<div class="sg"><span class="sgl">${g}</span><div class="chips">${arr.map(([n, v]) => `<span class="chip skill">${esc(n)}${v.bonus ? `<small>${esc(v.bonus)}</small>` : ''}</span>`).join('')}</div></div>`).join('') || '<p class="none">No skills.</p>', 'wide'));
    out.push(card('Languages', chips(list(L.languages))));
    out.push(card('Weaknesses & vulnerabilities', chips(list(L.weaknesses).concat(list(L.vulnerability), list(L.vulnerabilities)), 'bad')));
    out.push(card('Immunities', chips(list(L.immunity), 'good')));
    if ((h.bonuses || []).length) out.push(card('Bonuses', h.bonuses.map((b) => `<p class="lab"><b>${esc(words(b.source))}:</b> ${esc(words(b.bonus))}</p>`).join('')));
    (L.common || []).forEach((c) => { const { flavour, labelled } = parts(c.details); out.push(card(esc(c.title), (flavour ? `<p>${esc(flavour)}</p>` : '') + labelled.map(([k, v]) => `<p class="lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join(''))); });
    if ((h.hirelings || []).length) out.push(card('Hirelings', h.hirelings.map((x) => `<p class="lab"><b>${esc(words(x.name))}</b><br>${esc(words(x.skills || ''))}${x.bonus ? '<br>' + esc(words(x.bonus)) : ''}</p>`).join('')));
    if (data.sidebar?.resource?.text) out.push(card(esc(data.sidebar.resource.title || 'Heroic resource'), `<p>${esc(words(data.sidebar.resource.text))}</p>`, 'resource'));
    return `<div class="cards">${out.join('')}</div>`;
  }
  function paneHtml() {
    const A = data.actions || {};
    if (tab === 'abilities') {
      const groups = [['mains', 'Main actions'], ['maneuvers', 'Maneuvers'], ['triggers', 'Triggered'], ['freeStrikes', 'Free strikes']];
      const sub = `<div class="subtabs"><button data-ab-tab="all" class="${abTab === 'all' ? 'on' : ''}">All<i>${groups.reduce((n, [k]) => n + (A[k] || []).length, 0)}</i></button>${groups.map(([k, l]) => `<button data-ab-tab="${k}" class="${abTab === k ? 'on' : ''}">${l}<i>${(A[k] || []).length}</i></button>`).join('')}</div>`;
      const shown = groups.filter(([k]) => abTab === 'all' || abTab === k);
      return sub + shown.map(([k, label]) => `<section class="sect">${abTab === 'all' ? `<h3>${label}<span>${(A[k] || []).length}</span></h3>` : ''}<div class="cards" data-list="${k}">${(A[k] || []).map((a, i) => abilityCard(a, k, i)).join('')}${editing ? `<button class="add-card" data-add="${k}">+ Add ${label.toLowerCase().replace(/s$/, '')}</button>` : ''}</div></section>`).join('');
    }
    if (tab === 'features') return `<div class="cards" data-list="features">${(data.features || []).map((f, i) => featureCard(f, i)).join('') || '<p class="placeholder">No features.</p>'}${editing ? '<button class="add-card" data-add="features">+ Add feature</button>' : ''}</div>`;
    if (tab === 'skills') return traitsHtml();
    if (tab === 'record') {
      const h = data.hero;
      return `<div class="cards"><article class="card-tr"><header><h4>Background</h4></header><div class="body">
        <p class="lab"><b>Career:</b> ${esc(h.career?.career)} (${esc(h.career?.incitingIncident)})</p><p class="lab"><b>Culture:</b> ${esc(Object.values(h.culture || {}).join(', '))}</p>
        <p class="lab"><b>Complication:</b> ${esc(h.complication)}</p><p class="lab"><b>Wealth · Renown · XP:</b> ${esc(h.wealth)} · ${esc(h.renown)} · ${esc(h.xp)}</p></div></article>
        <article class="card-tr"><header><h4>Campaign record</h4></header><div class="body"><p class="none">Classes, relationships, projects, clubs and job from the dashboard would live here.</p></div></article></div>`;
    }
    return '<div class="cards"><article class="card-tr wide"><header><h4>Inventory</h4></header><div class="body"><p class="none">The same items as today, as compact cards with quantity and a use button.</p></div></article></div>';
  }

  function render() {
    const A = data.actions || {}, count = ['mains', 'maneuvers', 'triggers', 'freeStrikes'].reduce((n, k) => n + (A[k] || []).length, 0);
    const tabs = [['skills', 'Skills & traits', ''], ['abilities', 'Abilities', count], ['features', 'Features', (data.features || []).length], ['inventory', 'Inventory', ''], ['record', 'Record', '']];
    $('#sheet').innerHTML = `<div class="layout${editing ? ' editing' : ''}">${statusHtml()}<div><nav class="tabs">${tabs.map(([k, t, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}${n !== '' ? `<i>${n}</i>` : ''}</button>`).join('')}<span class="tab-tools"><button class="theme-toggle" data-theme-toggle title="Switch between the Diablo and Parchment looks">${theme === 'diablo' ? '☀ Parchment' : '☾ Diablo'}</button><button class="edit-toggle${editing ? ' on' : ''}" data-edit-toggle title="Edit mode: move, edit, add, import and delete">${editing ? '✓ Done editing' : '✎ Edit'}</button></span></nav>${editing ? '<div class="edit-banner"><span>Edit mode — drag cards by ⋮⋮ to reorder; ✎ edits, ⤓ copies a card as JSON, 🗑 deletes.</span><button class="import-btn" data-import>⇪ Import JSON</button><small>Mock-up: changes stay on this page.</small></div>' : ''}<div class="pane">${paneHtml()}</div></div></div>`;
    wire(); requestAnimationFrame(measure);
  }
  // At VTT panel width there is no Abilities tab (the board's ability bar has them): fall back to Skills & traits.
  function measure() { if (tab === 'abilities' && ($('#sheet')?.offsetWidth || 999) <= 430) { tab = 'skills'; render(); return; } const st = $('#status'); if (st) document.documentElement.style.setProperty('--status-h', (getComputedStyle(st).position === 'sticky' && st.offsetHeight < innerHeight * .8 ? st.offsetHeight : 0) + 'px'); }
  addEventListener('resize', measure);

  function ask(text, d) { const r = prompt(text, d); const n = Number(r); return r === null || !Number.isFinite(n) ? null : n; }
  function wire() {
    const vit = v(), max = num(vit.staminaMax, 1);
    const st = () => cur('stamina', num(vit.currentStamina, max));
    document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });
    document.querySelectorAll('[data-ab-tab]').forEach((b) => b.onclick = () => { abTab = b.dataset.abTab; render(); });
    document.querySelector('[data-edit-toggle]')?.addEventListener('click', () => { editing = !editing; render(); });
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => { setTheme(theme === 'diablo' ? 'parchment' : 'diablo'); render(); });
    document.querySelector('[data-import]')?.addEventListener('click', () => openImport());
    document.querySelectorAll('[data-export]').forEach((b) => b.onclick = async (e) => { e.stopPropagation(); const c = b.closest('[data-kind]'); const list = c.dataset.kind === 'features' ? data.features : data.actions[c.dataset.kind]; const json = JSON.stringify(list[Number(c.dataset.i)], null, 2); try { await navigator.clipboard.writeText(json); b.textContent = '✓'; } catch (_) { prompt('Copy this JSON:', json); } });
    document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); alert('Edit form: every field of the card (name, keywords, range, target, cost, power roll, tiers, effects, automation) in a side panel. To be rebuilt with the real sheet.'); });
    document.querySelectorAll('[data-del]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const c = b.closest('[data-kind]'); const list = c.dataset.kind === 'features' ? data.features : data.actions[c.dataset.kind]; if (confirm('Delete this card? (mock-up)')) { list.splice(Number(c.dataset.i), 1); render(); } });
    document.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => openImport(b.dataset.add));
    if (editing) wireDrag();
    document.querySelectorAll('[data-more]').forEach((b) => b.onclick = () => { const c = b.closest('.card-ft'); c.classList.toggle('open'); b.textContent = c.classList.contains('open') ? 'Show less' : 'Show all'; });
    document.querySelectorAll('[data-roll]').forEach((b) => b.onclick = () => alert('Mock-up: on the real sheet this runs the ability (rolls, targets, damage) on the board.'));
    document.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { const k = b.dataset.k, base = k === 'res' ? num(data.hero.resource?.value) : num(data.hero[k]); local[k] = cur(k, base) + Number(b.dataset.d); if (k !== 'res') local[k] = Math.max(0, local[k]); render(); });
    document.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'dmg') { const n = ask('Damage?', 5); if (n !== null) { local.stamina = st() - n; render(); } }
      if (a === 'heal') { const n = ask('Heal how much?', 5); if (n !== null) { local.stamina = Math.min(max, st() + n); render(); } }
      if (a === 'temp') { const n = ask('Temporary stamina?', 5); if (n !== null) { local.stamina = Math.max(st(), max) + n; render(); } }
      if (a === 'spend') { const rec = cur('rec', num(vit.currentRecoveries)); if (rec <= 0) { alert('No recoveries left.'); return; } local.rec = rec - 1; local.stamina = Math.min(max, st() + Math.floor(max / 3)); render(); }
      if (a === 'roll') { local.res = cur('res', num(data.hero.resource?.value)) + 1 + Math.floor(Math.random() * 3); render(); }
      if (a === 'cond') { const c = prompt('Condition (e.g. Slowed, save ends)'); if (c) { local.conds = [...(local.conds || []), c]; render(); } }
    });
  }
  // Import JSON: paste or choose a file. One ability or a list; each goes to Main / Maneuver / Triggered / Free strike by
  // its actionLabel (or "type"), unless a group is picked. Features import into Features.
  const GROUP_OF = (a) => { const t = String(a.actionLabel || a.type || a.action || '').toLowerCase(); if (/maneuver/.test(t)) return 'maneuvers'; if (/trigger/.test(t)) return 'triggers'; if (/free/.test(t)) return 'freeStrikes'; if (/feature/.test(t) || (a.title && !a.name)) return 'features'; return 'mains'; };
  const LABEL = { mains: 'Main action', maneuvers: 'Maneuver', triggers: 'Triggered action', freeStrikes: 'Free strike', features: 'Feature' };
  function openImport(preset = '') {
    const dlg = document.createElement('div'); dlg.className = 'modal';
    dlg.innerHTML = `<div class="modal-card"><header><h4>Import JSON</h4><button class="ic" data-x title="Close">×</button></header>
      <div class="modal-body"><p class="hint">Paste one ability (or a list), or choose a .json file. Each one lands in its group by its action type.</p>
        <textarea placeholder='{ "name": "Mind Spike", "actionLabel": "Main action", "tags": ["Psionic"], "range": "Ranged 10", ... }'></textarea>
        <div class="modal-row"><label class="file"><input type="file" accept=".json,application/json" hidden>Choose file…</label>
          <label>Put in <select><option value="">by its action type</option>${Object.entries(LABEL).map(([k, l]) => `<option value="${k}" ${k === preset ? 'selected' : ''}>${l}s</option>`).join('')}</select></label></div>
        <p class="err" hidden></p></div>
      <footer><button data-x>Cancel</button><button class="primary" data-go>Import</button></footer></div>`;
    document.body.append(dlg);
    const ta = dlg.querySelector('textarea'), err = dlg.querySelector('.err'), sel = dlg.querySelector('select');
    dlg.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
    dlg.querySelector('input[type=file]').onchange = async (e) => { const f = e.target.files[0]; if (f) ta.value = await f.text(); };
    dlg.querySelector('[data-go]').onclick = () => {
      let items; try { const j = JSON.parse(ta.value); items = Array.isArray(j) ? j : Array.isArray(j.abilities) ? j.abilities : [j]; } catch (e) { err.hidden = false; err.textContent = 'That is not valid JSON: ' + e.message; return; }
      const bad = items.filter((a) => !a || typeof a !== 'object' || !(a.name || a.title)); if (bad.length) { err.hidden = false; err.textContent = 'Each ability needs at least a "name".'; return; }
      const added = {};
      items.forEach((a) => {
        const g = sel.value || GROUP_OF(a);
        const card = { id: 'imported_' + Math.random().toString(36).slice(2), tags: [], tests: [], ...a };
        if (g === 'features') { card.title = card.title || card.name; (data.features ||= []).push(card); }
        else { card.actionLabel = card.actionLabel || LABEL[g]; ((data.actions ||= {})[g] ||= []).push(card); }
        added[g] = (added[g] || 0) + 1;
      });
      dlg.remove();
      const first = Object.keys(added)[0]; if (first === 'features') tab = 'features'; else { tab = 'abilities'; abTab = Object.keys(added).length > 1 ? 'all' : first; }
      render();
      const n = document.createElement('div'); n.className = 'flash-note'; n.textContent = 'Imported ' + Object.entries(added).map(([g, c]) => `${c} ${LABEL[g].toLowerCase()}${c > 1 ? 's' : ''}`).join(', '); document.body.append(n); setTimeout(() => n.remove(), 2600);
    };
    ta.focus();
  }

  // Edit mode: drag a card onto another in the same list to move it there.
  function wireDrag() {
    let from = null;
    document.querySelectorAll('[data-kind][draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => { from = { kind: card.dataset.kind, i: Number(card.dataset.i) }; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); document.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after')); });
      card.addEventListener('dragover', (e) => {
        if (!from || from.kind !== card.dataset.kind) return;
        e.preventDefault();
        const r = card.getBoundingClientRect(), after = (e.clientX - r.left) / r.width > .5;
        document.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
        card.classList.add(after ? 'drop-after' : 'drop-before');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault(); if (!from || from.kind !== card.dataset.kind) return;
        const list = from.kind === 'features' ? data.features : data.actions[from.kind];
        let to = Number(card.dataset.i) + (card.classList.contains('drop-after') ? 1 : 0);
        const [moved] = list.splice(from.i, 1); if (from.i < to) to -= 1; list.splice(to, 0, moved);
        from = null; render();
      });
    });
  }
  load();
})();
