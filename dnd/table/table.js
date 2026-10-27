/* The Table — core (prototype). Windows, flyouts, cards, background, saved layout.
   What opens where is in table-apps.js; this file only knows how to put things on the table. */
(function () {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const table = $('#table');
  const LAYOUT_KEY = 'table-proto-layout-v1';
  let topZ = 20;

  // ---------------------------------------------------------------- toast + tip
  function toast(text, action) {
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    const t = el('div', 'toast', text); document.body.append(t);
    if (action) { const b = el('button', 'toast-act', action.label || 'Undo'); b.onclick = () => { t.remove(); action.run(); }; t.append(b); }
    setTimeout(() => t.remove(), action ? 6000 : 2400);
  }
  const tip = $('#tip');
  function showTip(target, html) {
    tip.innerHTML = html; tip.classList.add('show');
    const r = target.getBoundingClientRect();
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top = Math.max(6, Math.min(window.innerHeight - tip.offsetHeight - 6, r.top + r.height / 2 - tip.offsetHeight / 2)) + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  // ---------------------------------------------------------------- flyouts
  let flyout = null, flyoutBtn = null;
  function closeFlyout() {
    flyout?.remove(); flyout = null;
    flyoutBtn?.classList.remove('open'); flyoutBtn = null;
  }
  function openFlyout(btn, build) {
    if (flyoutBtn === btn) { closeFlyout(); return; }
    closeFlyout();
    flyout = el('div', 'flyout'); build(flyout);
    document.body.append(flyout);
    const r = btn.getBoundingClientRect();
    const fit = (f) => { f.style.top = Math.max(10, Math.min(window.innerHeight - f.offsetHeight - 10, r.top - 8)) + 'px'; };
    fit(flyout);
    // A flyout that grows (a search opens every folder) moves up so its bottom stays on screen.
    if (window.ResizeObserver) { const f = flyout; new ResizeObserver(() => { if (f.isConnected) fit(f); }).observe(f); }
    flyoutBtn = btn; btn.classList.add('open');
    flyout.querySelector('.search')?.focus();
  }
  document.addEventListener('pointerdown', (e) => {
    if (flyout && !flyout.contains(e.target) && !e.target.closest('.rail-btn')) closeFlyout();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlyout(); });
  // A click inside a window's page never reaches this page; the page losing focus to it does.
  window.addEventListener('blur', () => { setTimeout(() => { if (flyout && document.activeElement?.tagName === 'IFRAME') closeFlyout(); }, 0); });

  // ---------------------------------------------------------------- windows
  const windows = new Map();   // id -> {node, spec, state}
  const snap = $('#snap');
  const tray = $('#tray');

  function bounds() { return table.getBoundingClientRect(); }
  function focusWin(w) {
    windows.forEach((o) => o.node.classList.remove('focus'));
    w.node.classList.add('focus'); w.node.style.zIndex = ++topZ;
    refreshWork();
  }
  function place(w, x, y, wd, ht) {
    if (w.state.dock) return;
    const b = bounds();
    wd = Math.max(200, Math.min(wd, b.width)); ht = Math.max(120, Math.min(ht, b.height));
    x = Math.max(0, Math.min(x, b.width - 60)); y = Math.max(0, Math.min(y, b.height - 30));
    Object.assign(w.state, { x, y, w: wd, h: ht });
    Object.assign(w.node.style, { left: x + 'px', top: y + 'px', width: wd + 'px', height: ht + 'px' });
  }
  function openWindow(spec) {
    // One of a kind (the map, chat, dice...): bring it forward instead of a second copy.
    const id = spec.id;
    if (windows.has(id)) { const w = windows.get(id); if (w.state.min) restore(w); focusWin(w); spec.onReopen?.(w); return w; }
    const node = el('div', 'win' + (spec.app ? ' app-' + spec.app : ''));
    node.innerHTML = `<div class="bar"><svg class="ico" viewBox="0 0 24 24">${spec.icon || ''}</svg><div class="title">${spec.title}<em>${spec.sub || ''}</em></div>
      <span class="badge" hidden></span>
      ${spec.share ? '<button title="Show this window to the players (click again to stop)" data-b="share" class="share"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>' : ''}
      <button title="Slide back into the side" data-b="tuck" class="tuck">›</button>
      <button title="Pop out to its own window (second screen)" data-b="pop">⧉</button>
      <button title="Minimise to the tray" data-b="min">–</button>
      <button title="Fill the table (double-click the bar)" data-b="max">▢</button>
      <button class="x" title="Close (frees its memory)" data-b="close">×</button></div>
      <div class="content"></div><div class="grip e"></div><div class="grip s"></div><div class="grip w"></div><div class="grip se"></div><div class="grip dockgrip"></div><div class="grip spangrip sa" title="Drag to narrow"></div><div class="grip spangrip sb" title="Drag to narrow"></div>`;
    table.append(node);
    const w = { id, node, spec, state: { min: false, max: false }, content: $('.content', node) };
    windows.set(id, w);
    const b = bounds(), d = spec.size || [520, 380];
    const saved = spec.restore;
    const spot = saved ? null : freeSpot(Math.min(d[0], b.width - 16), Math.min(d[1], b.height - 16), node);
    place(w, saved?.x ?? spot.x, saved?.y ?? spot.y, saved?.w ?? d[0], saved?.h ?? d[1]);
    spec.build?.(w.content, w);
    wireWindow(w);
    if (saved?.dock) dock(w, saved.dock, !!saved.open, saved.dockSize);
    else if (saved?.max) maximize(w, true);
    focusWin(w); saveLayout();
    return w;
  }
  // Where a new window covers the least of what is already open (windows and cards); ties go top-left.
  function freeSpot(wd, ht, self) {
    const b = bounds(), rects = [];
    windows.forEach((o) => { if (o.node === self || o.state.min || (o.state.dock && !o.state.open)) return; const r = o.node.getBoundingClientRect(); rects.push([r.left - b.left, r.top - b.top, r.width, r.height]); });
    document.querySelectorAll('.card, #fight-panel:not([hidden])').forEach((c) => rects.push([c.offsetLeft, c.offsetTop, c.offsetWidth, c.offsetHeight, 10]));
    const map = windows.get('map'); if (map && map.node !== self && !map.state.min && !map.state.dock) { const r = map.node.getBoundingClientRect(); rects.push([r.left - b.left, r.top - b.top + 32, 46, r.height - 32, 10]); rects.push([r.left - b.left, r.top - b.top, r.width, 86, 10]); }   // its strip, and its title + top bar (height, turn tokens)
    let best = { x: 16, y: 16, cost: Infinity };
    for (let y = 16; y + ht <= b.height - 8 || y === 16; y += 24) {
      for (let x = 16; x + wd <= b.width - 8 || x === 16; x += 24) {
        let cost = 0;
        for (const [rx, ry, rw, rh, weight] of rects) cost += (weight || 1) * Math.max(0, Math.min(x + wd, rx + rw) - Math.max(x, rx)) * Math.max(0, Math.min(y + ht, ry + rh) - Math.max(y, ry));
        cost += (x + y) * .01;
        if (cost < best.cost) best = { x, y, cost };
        if (x + wd > b.width - 8) break;
      }
      if (y + ht > b.height - 8) break;
    }
    return best;
  }

  function wireWindow(w) {
    const { node } = w, bar = $('.bar', node);
    node.addEventListener('pointerdown', () => focusWin(w), true);
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) maximize(w, !w.state.max); });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button')?.dataset.b; if (!b) return;
      if (b === 'close') closeWindow(w);
      if (b === 'tuck') setOpen(w, false);
      if (b === 'min') minimize(w);
      if (b === 'max') maximize(w, !w.state.max);
      if (b === 'pop') popOut(w);
      if (b === 'share') { const on = !w.node.classList.contains('shared'); w.node.classList.toggle('shared', on); toast(on ? `Players can see “${w.spec.title}”` : `“${w.spec.title}” is private again`); }
    });
    // Drag by the bar. At an edge: let go at once = snap (left/right half, top fill); hold there a moment = tuck the
    // window into that side as a slide-out drawer with a tab (Brandon, October 2026).
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const start = { x: e.clientX, y: e.clientY, sx: w.state.x, sy: w.state.y };
      let zone = null, armed = false, holdTimer = null, moved = false;
      bar.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
      const preview = () => {
        const tb = bounds();
        if (!zone) { snap.style.display = 'none'; return; }
        let r;
        if (armed) {
          const d = DOCK_DEFAULT[zone] * (zone === 'left' || zone === 'right' ? tb.width : tb.height);
          r = zone === 'left' ? [0, 0, d, tb.height] : zone === 'right' ? [tb.width - d, 0, d, tb.height] : zone === 'top' ? [0, 0, tb.width, d] : [0, tb.height - d, tb.width, d];
        } else if (zone === 'bottom') { snap.style.display = 'none'; return; }
        else r = zone === 'top' ? [0, 0, tb.width, tb.height] : zone === 'left' ? [0, 0, tb.width / 2, tb.height] : [tb.width / 2, 0, tb.width / 2, tb.height];
        snap.classList.toggle('dock', armed);
        snap.dataset.say = armed ? 'Let go: tuck into the side' : '';
        Object.assign(snap.style, { display: 'block', left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' });
      };
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        moved = true;
        if (w.state.dock) { // pulling a drawer away from its side makes it a window again, under the pointer
          undock(w);
          const tb = bounds(); start.sx = ev.clientX - tb.left - w.state.w / 2; start.sy = ev.clientY - tb.top - 14; start.x = ev.clientX; start.y = ev.clientY;
        }
        if (w.state.max) { // pulling a full window off the edge shrinks it back under the pointer
          maximize(w, false);
          const tb = bounds(); start.sx = ev.clientX - tb.left - w.state.w / 2; start.sy = 0; start.x = ev.clientX; start.y = ev.clientY;
        }
        place(w, start.sx + ev.clientX - start.x, start.sy + ev.clientY - start.y, w.state.w, w.state.h);
        const tb = bounds(), px = ev.clientX - tb.left, py = ev.clientY - tb.top;
        const next = py < 8 ? 'top' : py > tb.height - 8 ? 'bottom' : px < 10 ? 'left' : px > tb.width - 10 ? 'right' : null;
        if (next !== zone) {
          zone = next; armed = false; clearTimeout(holdTimer);
          if (zone) holdTimer = setTimeout(() => { armed = true; preview(); }, DOCK_HOLD_MS);
        }
        preview();
      };
      const up = () => {
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); document.body.classList.remove('dragging');
        clearTimeout(holdTimer); snap.style.display = 'none'; snap.classList.remove('dock');
        const tb = bounds();
        if (zone && armed) dock(w, zone, true);
        else if (zone === 'top') maximize(w, true);
        else if (zone === 'left') place(w, 0, 0, tb.width / 2, tb.height);
        else if (zone === 'right') place(w, tb.width / 2, 0, tb.width / 2, tb.height);
        refreshWork(); saveLayout();
      };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
    });
    // The inner edge of a drawer resizes it.
    $('.grip.dockgrip', node).addEventListener('pointerdown', (e) => {
      e.stopPropagation(); const g = e.currentTarget; g.setPointerCapture(e.pointerId);
      const s0 = { x: e.clientX, y: e.clientY, size: w.state.dockSize };
      const move = (ev) => {
        const tb = bounds(), edge = w.state.dock;
        const d = edge === 'left' ? ev.clientX - s0.x : edge === 'right' ? s0.x - ev.clientX : edge === 'top' ? ev.clientY - s0.y : s0.y - ev.clientY;
        const span = edge === 'left' || edge === 'right' ? tb.width : tb.height;
        w.state.dockSize = Math.max(.15, Math.min(.85, s0.size + d / span));
        layoutDock(w); refreshWork();
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); saveLayout(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    // The ends of a drawer narrow it along its side (a top drawer from its left or right).
    node.querySelectorAll('.grip.spangrip').forEach((g) => g.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); g.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
      const first = g.classList.contains('sa');
      const move = (ev) => {
        const tb = bounds(), edge = w.state.dock, across = edge === 'left' || edge === 'right';
        if (!edge) return;
        const len = across ? tb.height : tb.width;
        let pos = (across ? ev.clientY - tb.top : ev.clientX - tb.left) / len;
        if (pos < .02) pos = 0; if (pos > .98) pos = 1;
        const span = [...(w.state.dockSpan || [0, 1])], MIN = Math.min(.9, 220 / len);
        if (first) span[0] = Math.max(0, Math.min(span[1] - MIN, pos)); else span[1] = Math.min(1, Math.max(span[0] + MIN, pos));
        w.state.dockSpan = span; layoutDock(w); refreshWork();
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); saveLayout(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    }));
    node.querySelectorAll('.grip:not(.dockgrip):not(.spangrip)').forEach((g) => g.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); g.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
      const s = { ...w.state, px: e.clientX, py: e.clientY }, dir = g.className.split(' ')[1];   // px/py: the pointer; x/y: the window
      const move = (ev) => {
        const dx = ev.clientX - s.px, dy = ev.clientY - s.py;
        let { x, y, w: wd, h: ht } = s;
        if (dir.includes('e')) wd = s.w + dx;
        if (dir.includes('s')) ht = s.h + dy;
        if (dir === 'w') { wd = s.w - dx; x = s.x + dx; }
        place(w, x, y, wd, ht); refreshWork();
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); saveLayout(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    }));
  }
  // ---------------------------------------------------------------- drawers: windows tucked into a side
  // A drawer sits flush against its side, over the windows. Its tab sticks out from the drawer's inner edge and always
  // stays in sight: shut, the drawer is off the table and only its tab shows at the side; click the tab to slide it
  // out or back. Along its side a drawer covers a span (dockSpan, fractions 0..1), so a top drawer can be narrowed.
  const DOCK_HOLD_MS = 700;
  const DOCK_DEFAULT = { left: .3, right: .3, top: .4, bottom: .4 };
  const TAB = 26;   // how far a tab sticks out from its drawer
  const relayoutDocks = () => windows.forEach((o) => { if (o.state.dock) layoutDock(o); });
  function layoutDock(w) {
    const edge = w.state.dock, size = w.state.dockSize, open = w.state.open;
    const tb = bounds(), across = edge === 'left' || edge === 'right';
    const d = Math.round(size * (across ? tb.width : tb.height));
    const len = across ? tb.height : tb.width;
    const [a0, b0] = w.state.dockSpan || [0, 1];
    const from = Math.round(a0 * len), span = Math.round((b0 - a0) * len);
    const st = w.node.style;
    if (across) {
      st.width = d + 'px'; st.height = span + 'px'; st.top = from + 'px';
      st.left = (edge === 'left' ? (open ? 0 : -d - 2) : (open ? tb.width - d : tb.width + 2)) + 'px';
    } else {
      st.height = d + 'px'; st.width = span + 'px'; st.left = from + 'px';
      st.top = (edge === 'top' ? (open ? 0 : -d - 2) : (open ? tb.height - d : tb.height + 2)) + 'px';
    }
    w.node.classList.toggle('drawer-shut', !open);
    w.node.classList.toggle('span-start', a0 > 0.001); w.node.classList.toggle('span-end', b0 < 0.999);
    placeTabs(edge);
  }
  // Each drawer's tab sits at its inner edge, centred on the drawer's span; tabs on one side never overlap.
  function placeTabs(edge) {
    const tb = bounds(), across = edge === 'left' || edge === 'right', len = across ? tb.height : tb.width;
    const list = [...windows.values()].filter((o) => o.state.dock === edge && o.tab)
      .sort((p, q) => (q.state.open ? 1 : 0) - (p.state.open ? 1 : 0));   // the open drawer's tab keeps its place
    const taken = [];
    list.forEach((o) => {
      const t = o.tab, size = (across ? t.offsetHeight : t.offsetWidth) || 80;
      const [a0, b0] = o.state.dockSpan || [0, 1];
      let at = Math.round(((a0 + b0) / 2) * len - size / 2);
      for (let i = 0; i < 20; i++) {
        const hit = taken.filter(([s0, e0]) => at < e0 + 4 && at + size > s0 - 4);
        if (!hit.length) break;
        at = Math.max(...hit.map(([, e0]) => e0)) + 6;
      }
      at = Math.max(4, Math.min(len - size - 4, at)); taken.push([at, at + size]);
      const d = Math.round(o.state.dockSize * (across ? tb.width : tb.height)), inner = o.state.open ? d : 0;
      const ts = t.style;
      if (edge === 'left') { ts.left = inner + 'px'; ts.top = at + 'px'; }
      else if (edge === 'right') { ts.left = (tb.width - inner - TAB) + 'px'; ts.top = at + 'px'; }
      else if (edge === 'top') { ts.top = inner + 'px'; ts.left = at + 'px'; }
      else { ts.top = (tb.height - inner - TAB) + 'px'; ts.left = at + 'px'; }
      t.classList.toggle('on', !!o.state.open);
    });
  }
  function dock(w, edge, open = true, size, span) {
    if (w.state.max) maximize(w, false);
    if (w.state.min) restore(w);
    w.state.dock = edge; w.state.dockSize = size || w.state.dockSize || DOCK_DEFAULT[edge];
    w.state.dockSpan = Array.isArray(span) && span.length === 2 ? span : [0, 1];
    w.node.classList.add('docked', 'dock-' + edge);
    const tab = el('button', 'tab dtab tab-' + edge, `<svg viewBox="0 0 24 24">${w.spec.icon || ''}</svg><span>${w.spec.title}</span>`);
    tab.title = 'Click: slide out / back in. Drag its window\'s bar away from the side to make it a window again.';
    tab.onclick = () => setOpen(w, !w.state.open);
    w.tab = tab; table.append(tab);
    table.classList.add('has-' + edge);
    setOpen(w, open);
  }
  function setOpen(w, open) {
    if (open) windows.forEach((o) => { if (o !== w && o.state.dock === w.state.dock && o.state.open) { o.state.open = false; layoutDock(o); } }); // one drawer out per side
    w.state.open = open; layoutDock(w);
    if (open) focusWin(w);
    document.dispatchEvent(new CustomEvent('table:drawer', { detail: { w, edge: w.state.dock, open } }));
    refreshWork(); saveLayout();
  }
  function undock(w) {
    const edge = w.state.dock; if (!edge) return;
    w.tab?.remove(); w.tab = null;
    w.node.classList.remove('docked', 'drawer-shut', 'dock-' + edge);
    w.state.dock = null; w.state.open = false;
    if (![...windows.values()].some((o) => o.state.dock === edge)) table.classList.remove('has-' + edge);
    placeTabs(edge);
    document.dispatchEvent(new CustomEvent('table:drawer', { detail: { w, edge, open: false } }));
    place(w, w.state.x, w.state.y, w.state.w, w.state.h);
  }

  function maximize(w, on) {
    if (on && w.state.dock) undock(w);
    if (on && !w.state.max) { w.state.before = { ...w.state }; const b = bounds(); Object.assign(w.node.style, { left: 0, top: 0, width: b.width + 'px', height: b.height + 'px' }); }
    if (!on && w.state.max) { const p = w.state.before; place(w, p.x, p.y, p.w, p.h); }
    w.state.max = on; w.node.classList.toggle('max', on);
    w.spec.onMax?.(w, on); refreshWork(); saveLayout();
    if (w.spec.app === 'map') setTimeout(relayoutDocks, 30);
  }
  function minimize(w) {
    w.state.min = true; w.node.classList.add('min');
    const chip = el('button', '', `<svg viewBox="0 0 24 24">${w.spec.icon || ''}</svg>${w.spec.title}`);
    chip.title = 'Bring it back';
    chip.onclick = () => restore(w);
    w.chip = chip; tray.append(chip);
    if (w.state.max) w.spec.onMax?.(w, false);
    refreshWork(); saveLayout();
  }
  function restore(w) {
    w.state.min = false; w.node.classList.remove('min'); w.chip?.remove(); w.chip = null;
    if (w.state.max) w.spec.onMax?.(w, true);
    focusWin(w); saveLayout();
  }
  function closeWindow(w) {
    w.spec.onClose?.(w);
    w.chip?.remove(); w.tab?.remove(); w.node.remove(); windows.delete(w.id);   // gone, not hidden: its memory is freed
    ['left', 'right', 'top', 'bottom'].forEach((edge) => { if (![...windows.values()].some((o) => o.state.dock === edge)) table.classList.remove('has-' + edge); placeTabs(edge); });
    refreshWork(); saveLayout();
  }
  // Pop-out: the window's own page opens in a browser window of its own (drag it to a second screen). The page is
  // the full site page (the map is the whole board with its own tools), and it leaves the table so it is not
  // running twice. Windows that are part of the table itself (the creature gallery...) stay on the table.
  function popOut(w) {
    const f = w.node.querySelector('iframe');
    let url = '';
    try { url = f?.contentWindow?.location?.href || ''; } catch (_) { url = ''; }
    if (!url || url === 'about:blank') url = f ? new URL(f.getAttribute('src') || '', location.href).href : '';
    if (!url) { toast(`${w.spec.title} lives on the table and cannot pop out`); return; }
    const wd = Math.max(520, Math.round(w.node.offsetWidth)), ht = Math.max(400, Math.round(w.node.offsetHeight));
    const left = Math.round((window.screenX || 0) + 40), top = Math.round((window.screenY || 0) + 40);
    const win = window.open(url, 'table-' + w.id, `popup=yes,width=${wd},height=${ht},left=${left},top=${top}`);
    if (!win) { toast('The browser blocked the pop-out: allow pop-ups for this site, then try again'); return; }
    try { win.focus(); } catch (_) { /* some browsers refuse focus */ }
    closeWindow(w);
    toast(`${w.spec.title} is in its own window now (drag it to another screen). Close it there when done.`);
  }

  // Work level of heavy windows (the map): full when big and in front; low detail when small; paused when
  // minimised or mostly covered. Prototype: shows the badge the real map would act on.
  function covered(w) {
    const r = w.node.getBoundingClientRect(); if (!r.width) return 1;
    let hidden = 0; const z = +w.node.style.zIndex;
    windows.forEach((o) => {
      if (o === w || o.state.min || (o.state.dock && !o.state.open) || +o.node.style.zIndex < z) return;
      const q = o.node.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)), iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
      hidden += ix * iy;
    });
    return Math.min(1, hidden / (r.width * r.height));
  }
  function refreshWork() {
    const em = $('#emblem'); if (em) em.style.opacity = [...windows.values()].some((w) => !w.state.min && !(w.state.dock && !w.state.open)) ? 0 : 1;
    windows.forEach((w) => {
      if (!w.spec.heavy) return;
      const badge = $('.badge', w.node);
      let level = 'full';
      if (w.state.min || (w.state.dock && !w.state.open) || covered(w) > .85) level = 'sleep';
      else if (w.state.w * w.state.h < 420 * 320 && !w.state.max) level = 'low';
      badge.hidden = level === 'full';   // only worth a word when it is saving work
      badge.className = 'badge' + (level === 'full' ? '' : ' ' + level);
      badge.textContent = level === 'full' ? 'full detail' : level === 'low' ? 'low detail' : 'paused';
      badge.title = level === 'full' ? 'Drawing at full quality' : level === 'low' ? 'Small window: drawing fewer pixels and fewer updates' : 'Covered, tucked away or minimised: not drawing at all';
      w.spec.onWork?.(w, level);
      w.node.classList.toggle('sleeping', level === 'sleep');
    });
  }

  // ---------------------------------------------------------------- cards (characters on the table)
  const cards = new Map();
  function addCard(spec, x, y, w) {
    if (cards.has(spec.id)) { const c = cards.get(spec.id); c.node.style.left = x + 'px'; c.node.style.top = y + 'px'; if (w) setCardWidth(c.node, w); saveLayout(); return; }
    const node = el('div', 'card');
    node.innerHTML = `<div class="tools"><button title="Open sheet">▤</button><button title="Remove from table">×</button></div>
      <div class="art" style="background:${spec.color}">${spec.initials}</div><div class="name">${spec.name}</div><div class="sub">${spec.sub || ''}</div>
      ${spec.hp ? `<div class="hp"><span style="width:${Math.round(100 * spec.hp[0] / spec.hp[1])}%"></span><b>${spec.hp[0]} / ${spec.hp[1]}</b></div>` : '<div style="height:8px"></div>'}`;
    node.style.left = x + 'px'; node.style.top = y + 'px';
    if (spec.hero) node.dataset.hero = spec.hero;
    node.append(el('div', 'card-grip'));
    if (w) setCardWidth(node, w);
    table.append(node);
    const c = { id: spec.id, node, spec }; cards.set(spec.id, c);
    // The corner grip resizes the card (the picture stays square).
    node.querySelector('.card-grip').addEventListener('pointerdown', (e) => {
      e.stopPropagation(); table.append(node); const g = e.currentTarget; g.setPointerCapture(e.pointerId);   // the card you touch comes to the front
      const s0 = { x: e.clientX, w: node.offsetWidth };
      const move = (ev) => setCardWidth(node, s0.w + ev.clientX - s0.x);
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); saveLayout(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    spec.onAdd?.(node);
    const [openBtn, rmBtn] = node.querySelectorAll('.tools button');
    openBtn.onclick = (e) => { e.stopPropagation(); spec.open?.(); };
    rmBtn.onclick = (e) => { e.stopPropagation(); node.remove(); cards.delete(spec.id); saveLayout(); };
    // A quick double-click opens the sheet; press and hold drags. The double-click is counted here, not left to the
    // browser: a real hand wobbles a few pixels between clicks, and the browser lost the double-click whenever that
    // wobble counted as a drag (Brandon, October 27, 2026).
    let lastTap = null;
    node.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .card-grip') || e.button !== 0) return;
      // Not moved in the page on pointerdown: a dragged card goes to the front of the other cards when it is let go.
      node.setPointerCapture(e.pointerId);
      const s = { x: e.clientX, y: e.clientY, l: node.offsetLeft, t: node.offsetTop, at: performance.now() };
      let moved = false;
      node.style.zIndex = 9;
      const move = (ev) => { if (!moved && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 8) return; moved = true; node.style.left = (s.l + ev.clientX - s.x) + 'px'; node.style.top = (s.t + ev.clientY - s.y) + 'px'; };
      const up = (ev) => {
        node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.style.zIndex = 5;
        if (moved) { lastTap = null; table.append(node); saveLayout(); return; }
        const now = performance.now();
        if (lastTap && now - lastTap.at < 500 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 12) { lastTap = null; spec.open?.(); return; }
        lastTap = { at: now, x: ev.clientX, y: ev.clientY };
      };
      node.addEventListener('pointermove', move); node.addEventListener('pointerup', up);
    });
    saveLayout();
    return c;
  }

  function setCardWidth(node, w) { const v = Math.max(88, Math.min(300, Math.round(w))); node.style.width = v + 'px'; node.style.setProperty('--s', (v / 104).toFixed(3)); }

  // ---------------------------------------------------------------- dragging things out of flyouts / galleries
  // A picked thing follows the pointer as a ghost; where it lands decides what happens (the table, the map...).
  function dragOut(e, payload, ghostHtml) {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;
    // Framed pages would swallow the pointer once it is over them: they ignore it while something is dragged.
    document.body.classList.add('dragging');
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      if (!ghost) {
        ghost = el('div', '', ghostHtml);
        Object.assign(ghost.style, { position: 'fixed', zIndex: 5000, pointerEvents: 'none', opacity: .85, transform: 'translate(-50%,-50%) rotate(-3deg)' });
        document.body.append(ghost);
        if (flyout && payload.closeFlyout !== false) flyout.style.opacity = .25;
      }
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      document.querySelectorAll('.drop-ok').forEach((n) => n.classList.remove('drop-ok'));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      under?.closest('[data-drop]')?.classList.add('drop-ok');
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      document.querySelectorAll('.drop-ok').forEach((n) => n.classList.remove('drop-ok'));
      if (!ghost) { payload.click?.(); return; }
      ghost.remove();
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = under?.closest('[data-drop]');
      const tb = bounds();
      if (target && payload.onDropTarget?.(target, ev)) { closeFlyout(); return; }
      if (under && (under.closest('#table')) && !under.closest('.win')) {
        payload.onTable?.(ev.clientX - tb.left - 59, ev.clientY - tb.top - 80);
        closeFlyout(); return;
      }
      if (flyout) flyout.style.opacity = 1;
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // ---------------------------------------------------------------- background: drop a picture, GIF or short video
  const surface = $('#surface');
  const DB = 'table-proto', STORE = 'bg';
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function saveBg(blob) { try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, 'current'); } catch (_) { /* private window */ } }
  async function loadBg() { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).get('current'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (_) { return null; } }
  function setBackground(blob) {
    surface.querySelectorAll('img,video').forEach((n) => { URL.revokeObjectURL(n.src); n.remove(); });
    if (!blob) { surface.className = 'leather'; $('#emblem').hidden = false; return; }
    const url = URL.createObjectURL(blob);
    const media = blob.type.startsWith('video/') ? Object.assign(el('video'), { src: url, autoplay: true, loop: true, muted: true, playsInline: true }) : Object.assign(el('img'), { src: url, alt: '' });
    surface.className = ''; surface.append(media); $('#emblem').hidden = true;
  }
  async function useBackgroundFile(file) {
    if (!/^(image|video)\//.test(file.type)) { toast('Drop a picture, GIF or short video'); return; }
    if (file.size > 60 * 1024 * 1024) { toast('That file is over 60 MB: try a shorter loop'); return; }
    setBackground(file); await saveBg(file); toast('New table background');
  }
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; document.body.classList.add('dropping'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dropping'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dropping'); const f = e.dataTransfer?.files?.[0]; if (f) useBackgroundFile(f); });
  loadBg().then((b) => b && setBackground(b));

  // ---------------------------------------------------------------- layout (what was open where, per person)
  function saveLayout() {
    try { relayoutDocks(); } catch (_) { /* before the drawers exist */ }
    try {
      const data = { windows: [...windows.values()].filter((w) => !w.state.min).map((w) => ({ app: w.spec.app, arg: w.spec.arg, ...w.state, before: undefined })),
        cards: [...cards.values()].map((c) => ({ app: c.spec.app, arg: c.spec.arg, x: c.node.offsetLeft, y: c.node.offsetTop, w: c.node.style.width ? c.node.offsetWidth : undefined })) };
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
    } catch (_) { /* no storage */ }
  }
  function loadLayout() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (_) { return null; } }
  function clearLayout() {
    const before = localStorage.getItem(LAYOUT_KEY);
    [...windows.values()].forEach(closeWindow); [...cards.values()].forEach((c) => c.node.remove()); cards.clear();
    try { localStorage.removeItem(LAYOUT_KEY); } catch (_) { /* no storage */ }
    if (before) toast('Table cleared', { label: 'Undo', run: () => { try { localStorage.setItem(LAYOUT_KEY, before); } catch (_) { /* no storage */ } location.reload(); } });
  }
  table.addEventListener('pointerdown', (e) => { if (e.target === table || e.target.id === 'surface' || e.target.closest?.('#surface')) windows.forEach((w) => { if (w.state.dock && w.state.open) setOpen(w, false); }); });
  window.addEventListener('resize', () => { windows.forEach((w) => { if (w.state.dock) layoutDock(w); else if (w.state.max) { const b = bounds(); Object.assign(w.node.style, { width: b.width + 'px', height: b.height + 'px' }); } }); refreshWork(); });

  window.Table = { $, el, toast, bounds, saveLayout, layoutDock, showTip, hideTip, openFlyout, closeFlyout, openWindow, closeWindow, maximize, dock, undock, setOpen, windows, addCard, cards, dragOut, setBackground, useBackgroundFile, saveBg, loadLayout, clearLayout, refreshWork };
})();
