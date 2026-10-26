/* Projects and Relationships mock-ups: each hero's real dashboard data (read only), in the new sheet's style.
   ?view=projects|relationships&character=indigo|all. Buttons act on this page only; nothing is saved. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEROES = ['indigo', 'zepha', 'cal', 'sharon', 'frunk'];
  const PORTRAITS = { indigo: 'indigo_portrait_1750287056.jpg', zepha: 'zepha_portrait_1750214726.png', cal: 'cal_portrait_1750214637.png', sharon: 'sharon_portrait_1750262899.png' };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const params = new URLSearchParams(location.search);
  let view = params.get('view') === 'relationships' ? 'relationships' : 'projects';
  let who = (params.get('character') || 'all').toLowerCase();
  let filter = 'active', query = '';
  // Who is looking: the Director sees everything; a player sees their own hero, the bar and the roll button.
  let role = params.get('as') === 'player' ? 'player' : 'gm';
  if (role === 'player' && who === 'all') who = 'indigo';
  const data = {}; let students = [];
  const pending = {};   // project rolls waiting for the Director in this mock-up

  let theme = 'diablo'; try { theme = localStorage.getItem('sheet-theme') || 'diablo'; } catch (_) { /* no storage */ }
  const setTheme = (t) => { theme = t; document.documentElement.classList.toggle('diablo', t === 'diablo'); try { localStorage.setItem('sheet-theme', t); } catch (_) { /* no storage */ } };
  setTheme(theme);

  const post = async (body) => { const r = await fetch('/dnd/dashboard.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) }); return r.json(); };
  async function load() {
    await Promise.all(HEROES.map(async (h) => { try { const j = await post({ action: 'load', character: h }); if (j.success) data[h] = j.data || {}; } catch (_) { /* skip */ } }));
    try { const j = await post({ action: 'get_students_for_autocomplete' }); students = j.students || []; } catch (_) { students = []; }
    render();
  }
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const heroes = () => (who === 'all' ? HEROES.filter((h) => data[h]) : [who]);
  const isGm = () => role === 'gm';

  // ---------------------------------------------------------------- projects
  const pct = (p) => (num(p.total_points) ? num(p.points_earned) / num(p.total_points) : 0);
  function projectCard(h, p, i) {
    const waiting = !num(p.total_points);
    const r = pct(p), done = !waiting && r >= 1, close = !done && !waiting && r >= .75;
    const hist = (p.points_history || []).map(num);
    const steps = hist.map((v, k) => v - (k ? hist[k - 1] : 0));
    const top = Math.max(1, ...steps.map((x) => Math.abs(x)));
    const key = h + ':' + i;
    return `<article class="pj${done ? ' done' : close ? ' close' : ''}" data-key="${key}">
      <header>${who === 'all' ? `<span class="hero-dot" style="background-image:url(/dnd/portraits/${PORTRAITS[h] || ''})" title="${cap(h)}"></span>` : ''}<h4>${esc(p.project_name || 'Project')}</h4>${done ? '<span class="ribbon">Complete</span>' : close ? '<span class="ribbon soon">Close</span>' : ''}</header>
      <div class="body">
        ${p.source ? `<div class="src">Source: ${esc(p.source)}</div>` : ''}
        ${waiting ? `<div class="await">Waiting for the Director to set the total${isGm() ? ' — click ✎ to set it' : ''}</div>` : `<div class="pbar"><div class="fill" style="width:${Math.min(100, r * 100)}%"></div><span>${isGm() ? `${num(p.points_earned)} / ${num(p.total_points)} ` : ''}<small>${Math.round(r * 100)}%</small></span></div>`}
        ${!isGm() ? '' : hist.length ? `<div class="hist"><span class="hl">Last rolls</span>${hist.map((v, k) => [v, steps[k], k]).slice(-4).reverse().map(([v, d, k], n) => `<div class="hrow${n === 0 ? ' now' : ''}"><span>${d >= 0 ? '+' : ''}${d} → <b>${v}</b></span>${n === 0 ? '<small>now</small>' : `<button class="setback" data-setback="${key}" data-to="${v}" title="Set the points back to ${v} (undo the rolls after it)">↶ Set back to ${v}</button>`}</div>`).join('')}</div>` : '<div class="hist empty">No rolls yet</div>'}
        ${p.extra && isGm() ? `<p class="notes">${esc(p.extra)}</p>` : ''}
        ${pending[key] ? `<div class="pending">⏳ Roll of <b>${pending[key]}</b> sent to chat — waiting for the Director</div>` : ''}
      </div>
      <footer>${done ? '<span class="muted">Finished</span>' : waiting ? '<span class="muted">Roll once the total is set</span>' : `<button class="roll-btn" data-roll="${key}">🎲 Project roll</button>`}${isGm() ? `<span class="gm"><button class="ic2" data-pts="${key}" title="Add points by hand">±</button><button class="ic2" data-pedit="${key}" title="Edit: name, source, total, points, notes">✎</button></span>` : ''}</footer>
    </article>`;
  }
  function projectsView() {
    const list = []; heroes().forEach((h) => (data[h]?.projects || []).forEach((p, i) => list.push([h, p, i])));
    const counts = { active: list.filter(([, p]) => pct(p) < 1).length, done: list.filter(([, p]) => pct(p) >= 1).length, all: list.length };
    let shown = list.filter(([, p]) => (filter === 'active' ? pct(p) < 1 : filter === 'done' ? pct(p) >= 1 : true));
    if (query) shown = shown.filter(([h, p]) => `${p.project_name} ${p.source} ${p.extra} ${h}`.toLowerCase().includes(query));
    shown.sort((a, b) => (filter === 'done' ? 0 : pct(b[1]) - pct(a[1])));
    const ready = list.filter(([, p]) => pct(p) >= .75 && pct(p) < 1).length;
    if (!isGm()) shown = shown.filter(([h]) => h === who);
    return `<div class="summary"><b>${counts.active}</b> in progress · <b>${ready}</b> close to done · <b>${counts.done}</b> complete</div>
      <div class="filters"><div class="subtabs">${[['active', 'In progress'], ['done', 'Complete'], ['all', 'All']].map(([k, l]) => `<button data-filter="${k}" class="${filter === k ? 'on' : ''}">${l}<i>${counts[k]}</i></button>`).join('')}</div>
        <input class="search" placeholder="Search projects…" value="${esc(query)}"><button class="add-btn" data-newproj>+ New project</button></div>
      <div class="pj-grid">${shown.map(([h, p, i]) => projectCard(h, p, i)).join('') || '<p class="placeholder">No projects here.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- relationships
  const studentFor = (r) => students.find((s) => (r.student_id && s.id === r.student_id) || String(s.name).toLowerCase() === String(r.npc_name).toLowerCase());
  function relCard(h, r) {
    const s = studentFor(r), pts = num(r.points), mag = Math.min(10, Math.abs(pts));
    const pic = s?.image_path ? `background-image:url('/dnd/strixhaven/students/${esc(s.image_path)}')` : '';
    return `<article class="rel ${pts > 0 ? 'pos' : pts < 0 ? 'neg' : ''}">
      <div class="who2"><div class="face" style="${pic}">${pic ? '' : esc(String(r.npc_name || '?').slice(0, 1))}</div>
        <div class="nm"><b>${esc((!r.npc_name || /^new relationship$/i.test(r.npc_name)) && s ? s.name : (r.npc_name || 'Someone'))}</b><span>${s ? esc([s.college, s.grade ? 'Year ' + s.grade : ''].filter(Boolean).join(' · ')) || 'Student' : 'NPC'}${s ? ' · <span class="link" title="Points and notes stay in step with the Students page">⇄ Students</span>' : ''}</span></div>
        ${who === 'all' ? `<span class="hero-dot" style="background-image:url(/dnd/portraits/${PORTRAITS[h] || ''})" title="${cap(h)}"></span>` : ''}</div>
      <div class="meter"><span class="neg-side"><i style="width:${pts < 0 ? mag * 10 : 0}%"></i></span><b>${pts > 0 ? '+' : ''}${pts}</b><span class="pos-side"><i style="width:${pts > 0 ? mag * 10 : 0}%"></i></span></div>
      ${r.boon || r.bane ? `<div class="bb">${r.boon ? `<span class="boon">Boon: ${esc(r.boon)}</span>` : ''}${r.bane ? `<span class="bane">Bane: ${esc(r.bane)}</span>` : ''}</div>` : ''}
      ${r.extra ? `<p class="notes">${esc(r.extra)}</p>` : ''}
      ${isGm() ? '<footer class="gm"><button class="ic2" data-rp="-1" title="Worse">−</button><button class="ic2" data-rp="1" title="Better">+</button><button class="ic2" data-edit title="Edit">✎</button></footer>' : ''}
    </article>`;
  }
  function relationshipsView() {
    const list = []; heroes().forEach((h) => (data[h]?.relationships || []).forEach((r) => list.push([h, r])));
    let shown = query ? list.filter(([h, r]) => `${r.npc_name} ${r.extra} ${r.boon} ${r.bane} ${h}`.toLowerCase().includes(query)) : list;
    shown = shown.slice().sort((a, b) => num(b[1].points) - num(a[1].points));
    const pos = list.filter(([, r]) => num(r.points) > 0).length, neg = list.filter(([, r]) => num(r.points) < 0).length;
    return `<div class="summary"><b>${list.length}</b> relationships · <b class="g">${pos}</b> friendly · <b class="r">${neg}</b> strained</div>
      <div class="filters"><input class="search" placeholder="Search people, notes…" value="${esc(query)}">${isGm() ? '<button class="add-btn" data-add>+ Add someone</button>' : ''}</div>
      <div class="rel-grid">${shown.map(([h, r]) => relCard(h, r)).join('') || '<p class="placeholder">No relationships yet.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- page
  function render() {
    $('#app').innerHTML = `<div class="cm-top">
        <nav class="tabs"><button data-view="projects" class="${view === 'projects' ? 'on' : ''}">Projects</button><button data-view="relationships" class="${view === 'relationships' ? 'on' : ''}">Relationships</button>
          <span class="tab-tools"><span class="seeas">See as <button data-role="gm" class="${isGm() ? 'on' : ''}">Director</button><button data-role="player" class="${!isGm() ? 'on' : ''}">Player (${cap(who === 'all' ? 'indigo' : who)})</button></span><button class="theme-toggle" data-theme-toggle>${theme === 'diablo' ? '☀ Parchment' : '☾ Diablo'}</button></span></nav>
        <div class="heroes-bar">${isGm() ? `<button data-who="all" class="hchip${who === 'all' ? ' on' : ''}">All heroes</button>` : ''}${HEROES.filter((h) => data[h] && (isGm() || h === who)).map((h) => `<button data-who="${h}" class="hchip${who === h ? ' on' : ''}"><span class="hero-dot" style="background-image:url(/dnd/portraits/${PORTRAITS[h] || ''})"></span>${cap(h)}</button>`).join('')}</div>
      </div><div class="cm-body">${view === 'projects' ? projectsView() : relationshipsView()}</div>`;
    wire();
  }
  function wire() {
    document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { view = b.dataset.view; query = ''; render(); });
    document.querySelectorAll('[data-who]').forEach((b) => b.onclick = () => { who = b.dataset.who; render(); });
    document.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { filter = b.dataset.filter; render(); });
    $('[data-theme-toggle]').onclick = () => { setTheme(theme === 'diablo' ? 'parchment' : 'diablo'); render(); };
    const s = $('.search'); if (s) { s.oninput = () => { query = s.value.trim().toLowerCase(); const pos = s.selectionStart; render(); const n = $('.search'); n.focus(); n.setSelectionRange(pos, pos); }; }
    document.querySelectorAll('[data-roll]').forEach((b) => b.onclick = () => rollFlow(b.dataset.roll));
    document.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => { role = b.dataset.role; if (role === 'player' && who === 'all') who = 'indigo'; render(); });
    const np = document.querySelector('[data-newproj]');
    if (np) np.onclick = () => {
      const h = who === 'all' ? null : who;
      if (!h) { alert('Pick a hero first (the chips above), then add the project.'); return; }
      const name = prompt(isGm() ? 'New project name (set the total with the edit button):' : 'What is your project called? (The Director sets the total.)');
      if (!name) return;
      (data[h].projects = data[h].projects || []).push({ project_name: name.trim(), source: '', points_earned: '0', total_points: '', extra: '', points_history: [] });
      filter = 'active'; render();
    };
    document.querySelectorAll('[data-pedit]').forEach((b) => b.onclick = () => {
      const [h, i] = b.dataset.pedit.split(':'); const p = data[h].projects[Number(i)];
      const total = prompt('Total points for "' + p.project_name + '":', p.total_points || '');
      if (total === null) return; p.total_points = String(Math.max(0, Number(total) || 0));
      const src = prompt('Source (optional):', p.source || ''); if (src !== null) p.source = src;
      render();
    });
    document.querySelectorAll('[data-setback]').forEach((b) => b.onclick = () => {
      const [h, i] = b.dataset.setback.split(':'); const p = data[h].projects[Number(i)], to = Number(b.dataset.to);
      if (!confirm(`Set "${p.project_name}" back to ${to} points? The rolls after it are removed. (Mock-up: this page only.)`)) return;
      const hist = (p.points_history || []).map(Number); const at = hist.lastIndexOf(to);
      p.points_history = hist.slice(0, at + 1); p.points_earned = String(to); render();
    });
    document.querySelectorAll('[data-pts], [data-edit], [data-add], [data-rp]').forEach((b) => b.onclick = () => alert('Director tools: same as today on the dashboard (add points, edit, add, delete). Mock-up only.'));
  }
  // The project roll as today: School +2 or Normal +4 → retainers → roll → chat → the Director accepts or denies.
  function rollFlow(key) {
    const [h, i] = key.split(':'); const p = data[h].projects[Number(i)];
    const dlg = document.createElement('div'); dlg.className = 'modal';
    dlg.innerHTML = `<div class="modal-card"><header><h4>Project roll · ${esc(p.project_name)}</h4><button class="ic" data-x>×</button></header>
      <div class="modal-body"><p class="hint">The same steps as today's dice roller. The result goes to chat for the Director to accept.</p>
        <div class="choice"><button data-type="school"><b>School project</b><small>+6 per day · 5d10</small></button><button data-type="normal" class="on"><b>Normal project</b><small>+12 per day · 5d10</small></button></div>
        <div class="modal-row"><label>Days <input type="number" min="1" value="1" data-days style="width:60px"></label><label>Retainers <input type="number" min="0" value="0" data-ret style="width:60px"></label></div>
        <p class="hint" style="margin-top:8px">${h === 'zepha' ? 'Zepha rolls 6d10 per day.' : ''}</p></div>
      <footer><button data-x>Cancel</button><button class="primary" data-go>Roll and send to chat</button></footer></div>`;
    document.body.append(dlg);
    let type = 'normal';
    dlg.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { type = b.dataset.type; dlg.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b)); });
    dlg.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => dlg.remove());
    dlg.querySelector('[data-go]').onclick = () => {
      const days = Math.max(1, num(dlg.querySelector('[data-days]').value)), ret = Math.max(0, num(dlg.querySelector('[data-ret]').value));
      const d10 = () => 1 + Math.floor(Math.random() * 10); let total = 0;
      for (let d = 0; d < days; d += 1) { for (let k = 0; k < (h === 'zepha' ? 6 : 5); k += 1) total += d10(); total += type === 'school' ? 6 : 12; for (let r = 0; r < ret; r += 1) total += d10() + d10() + 2; }
      pending[key] = total; dlg.remove(); render();
    };
  }
  load();
})();
