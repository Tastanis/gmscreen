// APP Automation — bullet hierarchy with edit-mode drag/drop & selection.
// Vanilla JS, no build step. State persists via /buisness/api/{bullets,selection}.php.

(function () {
  'use strict';

  const API_BULLETS   = 'api/bullets.php';
  const API_SELECTION = 'api/selection.php';

  const DEPTH_INDENT = [0, 20, 48]; // px — must match .bRow.dN margin-left in CSS
  const DEPTH_LABEL  = ['Header', 'Sub-bullet', 'Leaf'];

  const els = {
    body:           document.body,
    list:           document.getElementById('bullet-list'),
    selectionList:  document.getElementById('selection-list'),
    editToggle:     document.getElementById('edit-mode-toggle'),
    addBtn:         document.getElementById('add-bullet-btn'),
    searchInput:    document.getElementById('search-input'),
    leftCount:      document.getElementById('left-count'),
    selCount:       document.getElementById('selection-count'),
    copyBtn:        document.getElementById('copy-btn'),
    clearBtn:       document.getElementById('clear-btn'),
    rightEmpty:     document.getElementById('right-empty'),
    leftPane:       document.getElementById('left-pane'),
    rightPane:      document.getElementById('right-pane'),
    splitter:       document.getElementById('splitter'),
    detailBody:     document.getElementById('detail-body'),
    saveStatus:     document.getElementById('save-status'),
    hintPill:       document.getElementById('hint-pill'),
    emptyEditHint:  document.getElementById('empty-edit-hint'),
    editorTpl:      document.getElementById('bullet-edit-template'),
  };

  const state = {
    bullets: [],
    added:   [],
    query:   '',
    editMode: false,
    leftPct: 60,
    pendingBulletsSave: null,
    pendingSelectionSave: null,
    dragId: null,
    dragOverIndex: -1,
    dragOverDepth: 0,
    activeEditor: null, // { mode:'edit'|'add', id?, node }
  };

  // ─────────── Utilities ───────────
  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function flashStatus(text, ms = 1400) {
    if (!els.hintPill) return;
    els.hintPill.textContent = text;
    els.hintPill.hidden = false;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => { els.hintPill.hidden = true; }, ms);
  }

  function setSaveStatus(text) {
    if (els.saveStatus) els.saveStatus.textContent = text;
  }

  function markerFor(depth) {
    return depth === 1 ? '•' : depth === 2 ? '◦' : '';
  }

  // ─────────── Persistence ───────────
  async function loadAll() {
    try {
      const [b, s] = await Promise.all([
        fetch(API_BULLETS,   { credentials: 'same-origin' }).then(r => r.json()),
        fetch(API_SELECTION, { credentials: 'same-origin' }).then(r => r.json()),
      ]);
      if (b && b.ok && Array.isArray(b.bullets)) state.bullets = b.bullets;
      if (s && s.ok && Array.isArray(s.ids))     state.added   = s.ids;
    } catch (e) {
      console.warn('Failed to load saved data', e);
    }
    renderAll();
  }

  function scheduleSaveBullets() {
    setSaveStatus('saving…');
    clearTimeout(state.pendingBulletsSave);
    state.pendingBulletsSave = setTimeout(saveBullets, 350);
  }

  async function saveBullets() {
    try {
      const res = await fetch(API_BULLETS, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bullets: state.bullets }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'save failed');
      setSaveStatus('draft · autosaved');
    } catch (e) {
      console.warn('Save bullets failed', e);
      setSaveStatus('save failed');
    }
  }

  function scheduleSaveSelection() {
    clearTimeout(state.pendingSelectionSave);
    state.pendingSelectionSave = setTimeout(saveSelection, 350);
  }

  async function saveSelection() {
    try {
      await fetch(API_SELECTION, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: state.added }),
      });
    } catch (e) {
      console.warn('Save selection failed', e);
    }
  }

  // ─────────── Filtering / search ───────────
  function computeFilteredIds() {
    const q = state.query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set();
    state.bullets.forEach((b, i) => {
      if (b.text.toLowerCase().includes(q)) {
        matches.add(b.id);
        // walk back, adding shallower ancestors so structure is visible
        for (let j = i - 1; j >= 0; j--) {
          if (state.bullets[j].depth < state.bullets[i].depth) {
            matches.add(state.bullets[j].id);
            if (state.bullets[j].depth === 0) break;
          }
        }
      }
    });
    return matches;
  }

  // ─────────── Render: left list ───────────
  function renderList() {
    const list = els.list;
    list.innerHTML = '';
    const filtered = computeFilteredIds();

    state.bullets.forEach((b, idx) => {
      const row = document.createElement('div');
      row.className = 'bRow d' + b.depth +
        (state.added.includes(b.id) ? ' added' : '') +
        (filtered && !filtered.has(b.id) ? ' hidden' : '');
      row.dataset.id = b.id;
      row.dataset.idx = String(idx);
      row.draggable = false; // enabled only in edit-mode via attr below
      row.title = state.editMode
        ? 'Drag to reorder · click to edit'
        : (b.depth < 2 ? 'Click to add · Double-click to add this section + everything under it' : 'Click to add');

      // Drag handle
      const handle = document.createElement('span');
      handle.className = 'bRowDragHandle';
      handle.setAttribute('aria-hidden', 'true');
      handle.textContent = '⋮⋮';
      row.appendChild(handle);

      // Marker (• / ◦)
      if (b.depth > 0) {
        const m = document.createElement('span');
        m.className = 'bMark';
        m.textContent = markerFor(b.depth);
        row.appendChild(m);
      }

      // Text
      const txt = document.createElement('span');
      txt.className = 'bTxt';
      txt.textContent = b.text || '(empty)';
      row.appendChild(txt);

      // Edit-mode controls
      const controls = document.createElement('div');
      controls.className = 'bRowControls';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'iconBtn';
      editBtn.title = 'Edit bullet';
      editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 14l4-1 7-7-3-3-7 7-1 4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor('edit', b.id, row);
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'iconBtn';
      delBtn.title = 'Delete bullet';
      delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 5h10M6.5 5V3.5h3V5M5 5l.5 8.5a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBullet(b.id);
      });
      controls.appendChild(editBtn);
      controls.appendChild(delBtn);
      row.appendChild(controls);

      list.appendChild(row);
    });

    list.classList.toggle('is-empty', state.bullets.length === 0);
    if (els.emptyEditHint) {
      els.emptyEditHint.style.display = state.bullets.length === 0 ? 'block' : 'none';
    }

    // counter
    if (filtered) {
      const visible = state.bullets.filter(b => filtered.has(b.id)).length;
      els.leftCount.textContent = visible + '/' + state.bullets.length;
    } else {
      els.leftCount.textContent = state.bullets.length + ' item' + (state.bullets.length === 1 ? '' : 's');
    }

    applyEditModeToRows();
  }

  // ─────────── Render: right pane (selection) ───────────
  function renderSelection() {
    const list = els.selectionList;
    list.innerHTML = '';
    // Order = original bullets order, filtered to added IDs
    const set = new Set(state.added);
    const items = state.bullets.filter(b => set.has(b.id));
    items.forEach(b => {
      const row = document.createElement('div');
      row.className = 'bRow d' + b.depth;
      if (b.depth > 0) {
        const m = document.createElement('span');
        m.className = 'bMark';
        m.textContent = markerFor(b.depth);
        row.appendChild(m);
      }
      const txt = document.createElement('span');
      txt.className = 'bTxt';
      txt.textContent = b.text || '(empty)';
      row.appendChild(txt);
      list.appendChild(row);
    });

    list.classList.toggle('is-empty', items.length === 0);
    if (els.rightEmpty) {
      els.rightEmpty.style.display = items.length === 0 ? 'grid' : 'none';
    }
    els.selCount.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
    els.selCount.classList.toggle('has', items.length > 0);
    els.copyBtn.disabled  = items.length === 0;
    els.clearBtn.disabled = items.length === 0;
  }

  function renderAll() {
    renderList();
    renderSelection();
  }

  // ─────────── Selection logic ───────────
  function toggleAdded(id) {
    const i = state.added.indexOf(id);
    if (i >= 0) state.added.splice(i, 1);
    else        state.added.push(id);
    // Order the saved IDs by their position in bullets[] so right-pane order stays canonical
    const order = new Map(state.bullets.map((b, idx) => [b.id, idx]));
    state.added.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    scheduleSaveSelection();
    renderAll();
  }

  function toggleSubtree(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return;
    const root = state.bullets[idx];
    const ids = [root.id];
    for (let i = idx + 1; i < state.bullets.length; i++) {
      if (state.bullets[i].depth <= root.depth) break;
      ids.push(state.bullets[i].id);
    }
    const set = new Set(state.added);
    const all = ids.every(x => set.has(x));
    if (all) ids.forEach(x => set.delete(x));
    else     ids.forEach(x => set.add(x));
    const order = new Map(state.bullets.map((b, i) => [b.id, i]));
    state.added = state.bullets.filter(b => set.has(b.id)).map(b => b.id);
    scheduleSaveSelection();
    renderAll();
  }

  function clearSelection() {
    state.added = [];
    scheduleSaveSelection();
    renderAll();
  }

  function copySelection() {
    const set = new Set(state.added);
    const items = state.bullets.filter(b => set.has(b.id));
    const lines = items.map(b => {
      const indent = '  '.repeat(b.depth);
      const prefix = b.depth === 0 ? '' : (b.depth === 1 ? '• ' : '◦ ');
      return indent + prefix + b.text;
    });
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flashStatus('Copied to clipboard'),
        () => flashStatus('Copy failed')
      );
    } else {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flashStatus('Copied to clipboard'); }
      catch (_) { flashStatus('Copy failed'); }
      document.body.removeChild(ta);
    }
  }

  // ─────────── Bullet CRUD (edit mode) ───────────
  function deleteBullet(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return;
    state.bullets.splice(idx, 1);
    state.added = state.added.filter(x => x !== id);
    scheduleSaveBullets();
    scheduleSaveSelection();
    renderAll();
  }

  function openEditor(mode, id, anchorRow) {
    closeEditor();
    const tpl = els.editorTpl.content.cloneNode(true);
    const wrap = tpl.querySelector('.bulletEditor');
    const textInput = wrap.querySelector('.bulletText');
    const depthSelect = wrap.querySelector('.depthSelect');
    const cancelBtn = wrap.querySelector('.cancelBtn');
    const saveBtn   = wrap.querySelector('.saveBtn');

    let initialDepth = 0;
    if (mode === 'edit') {
      const b = state.bullets.find(x => x.id === id);
      if (!b) return;
      textInput.value = b.text;
      initialDepth = b.depth;
    }
    depthSelect.value = String(initialDepth);

    const close = () => closeEditor();
    cancelBtn.addEventListener('click', close);

    const commit = () => {
      const text = textInput.value.trim();
      const depth = Math.max(0, Math.min(2, parseInt(depthSelect.value, 10) || 0));
      if (!text) {
        textInput.focus();
        return;
      }
      if (mode === 'edit') {
        const b = state.bullets.find(x => x.id === id);
        if (b) { b.text = text; b.depth = depth; }
      } else {
        state.bullets.push({ id: uid(), depth: depth, text: text });
      }
      scheduleSaveBullets();
      closeEditor();
      renderAll();
    };
    saveBtn.addEventListener('click', commit);
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    if (mode === 'edit' && anchorRow && anchorRow.parentNode === els.list) {
      anchorRow.style.display = 'none';
      anchorRow.insertAdjacentElement('afterend', wrap);
      state.activeEditor = { mode: 'edit', id: id, node: wrap, hidden: anchorRow };
    } else {
      // append at the end of the list area
      els.list.appendChild(wrap);
      state.activeEditor = { mode: 'add', node: wrap };
      // hide the empty hint while editor open
      if (els.emptyEditHint) els.emptyEditHint.style.display = 'none';
    }
    setTimeout(() => textInput.focus(), 0);
  }

  function closeEditor() {
    if (!state.activeEditor) return;
    const { node, hidden } = state.activeEditor;
    if (node && node.parentNode) node.parentNode.removeChild(node);
    if (hidden) hidden.style.display = '';
    state.activeEditor = null;
  }

  // ─────────── Edit-mode toggle / row click handling ───────────
  function applyEditModeToRows() {
    const rows = els.list.querySelectorAll('.bRow');
    rows.forEach(row => {
      row.draggable = state.editMode;
    });
  }

  function setEditMode(on) {
    state.editMode = !!on;
    els.body.classList.toggle('edit-mode', state.editMode);
    if (!state.editMode) closeEditor();
    applyEditModeToRows();
    // Re-render to update titles
    renderList();
  }

  // Single click on row in left pane:
  //   normal mode  -> toggle bullet in selection
  //   edit mode    -> open edit on that bullet
  // Double click on row (left pane, normal mode only) -> toggle whole subtree.
  els.list.addEventListener('click', (e) => {
    if (state.activeEditor) return;
    const row = e.target.closest('.bRow');
    if (!row) return;
    // Ignore clicks on row controls (they have their own handlers and stopPropagation)
    if (e.target.closest('.bRowControls')) return;
    const id = row.dataset.id;
    if (!id) return;
    if (state.editMode) {
      openEditor('edit', id, row);
    } else {
      toggleAdded(id);
    }
  });
  els.list.addEventListener('dblclick', (e) => {
    if (state.editMode || state.activeEditor) return;
    const row = e.target.closest('.bRow');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    toggleSubtree(id);
  });

  // ─────────── Drag & drop reordering (HTML5 DnD) ───────────
  let dropIndicator = null;
  function ensureDropIndicator() {
    if (dropIndicator) return dropIndicator;
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    return dropIndicator;
  }

  function clearDropIndicator() {
    if (dropIndicator && dropIndicator.parentNode) {
      dropIndicator.parentNode.removeChild(dropIndicator);
    }
    state.dragOverIndex = -1;
  }

  function depthFromX(localX) {
    // localX is the cursor's x relative to the list's left edge.
    // Snap to bands aligned with the depth indents (0/20/48 px).
    if (localX < 14) return 0;
    if (localX < 34) return 1;
    return 2;
  }

  function computeDropTarget(clientX, clientY) {
    const listRect = els.list.getBoundingClientRect();
    const localX = clientX - listRect.left;
    let depth = depthFromX(localX);
    const rows = Array.from(els.list.querySelectorAll('.bRow:not(.dragging)'));
    if (rows.length === 0) {
      return { index: 0, depth: depth };
    }
    // Find the row whose midpoint is below clientY -> insert before it.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (clientY < mid) {
        const idx = parseInt(rows[i].dataset.idx, 10);
        return { index: idx, depth: depth };
      }
    }
    // Past the end
    const last = rows[rows.length - 1];
    const idx = parseInt(last.dataset.idx, 10) + 1;
    return { index: idx, depth: depth };
  }

  function showDropIndicator(target) {
    const ind = ensureDropIndicator();
    const rows = els.list.querySelectorAll('.bRow');
    let parent = els.list;
    let topPx;
    if (target.index >= state.bullets.length) {
      // Past last row
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const r = lastRow.getBoundingClientRect();
        const lr = els.list.getBoundingClientRect();
        topPx = (r.bottom - lr.top) + 4;
      } else {
        topPx = 0;
      }
    } else {
      const row = els.list.querySelector('.bRow[data-idx="' + target.index + '"]');
      if (row) {
        const r = row.getBoundingClientRect();
        const lr = els.list.getBoundingClientRect();
        topPx = (r.top - lr.top) - 2;
      } else {
        topPx = 0;
      }
    }
    ind.style.top = topPx + 'px';
    ind.style.setProperty('--indent', DEPTH_INDENT[target.depth] + 'px');
    if (ind.parentNode !== els.list) els.list.appendChild(ind);
  }

  els.list.addEventListener('dragstart', (e) => {
    if (!state.editMode) { e.preventDefault(); return; }
    const row = e.target.closest('.bRow');
    if (!row) return;
    state.dragId = row.dataset.id;
    row.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', state.dragId); } catch (_) {}
    }
  });

  els.list.addEventListener('dragend', () => {
    const drag = els.list.querySelector('.bRow.dragging');
    if (drag) drag.classList.remove('dragging');
    state.dragId = null;
    clearDropIndicator();
  });

  els.list.addEventListener('dragover', (e) => {
    if (!state.editMode || !state.dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const target = computeDropTarget(e.clientX, e.clientY);
    state.dragOverIndex = target.index;
    state.dragOverDepth = target.depth;
    showDropIndicator(target);
  });

  els.list.addEventListener('drop', (e) => {
    if (!state.editMode || !state.dragId) return;
    e.preventDefault();
    const target = computeDropTarget(e.clientX, e.clientY);
    performMove(state.dragId, target.index, target.depth);
    clearDropIndicator();
    state.dragId = null;
  });

  function performMove(id, targetIndex, targetDepth) {
    const fromIdx = state.bullets.findIndex(b => b.id === id);
    if (fromIdx < 0) return;
    const item = state.bullets[fromIdx];
    state.bullets.splice(fromIdx, 1);
    let insertAt = targetIndex;
    if (fromIdx < targetIndex) insertAt = targetIndex - 1;
    if (insertAt < 0) insertAt = 0;
    if (insertAt > state.bullets.length) insertAt = state.bullets.length;
    item.depth = Math.max(0, Math.min(2, targetDepth | 0));
    state.bullets.splice(insertAt, 0, item);
    scheduleSaveBullets();
    renderAll();
  }

  // ─────────── Splitter ───────────
  let splitterDrag = false;
  els.splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitterDrag = true;
    els.splitter.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', (e) => {
    if (!splitterDrag) return;
    const r = els.detailBody.getBoundingClientRect();
    const pct = Math.max(28, Math.min(82, ((e.clientX - r.left) / r.width) * 100));
    state.leftPct = pct;
    els.leftPane.style.width  = pct + '%';
    els.rightPane.style.width = (100 - pct) + '%';
  });
  window.addEventListener('mouseup', () => {
    if (!splitterDrag) return;
    splitterDrag = false;
    els.splitter.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  // initialize widths
  els.leftPane.style.width  = state.leftPct + '%';
  els.rightPane.style.width = (100 - state.leftPct) + '%';

  // ─────────── Wire up controls ───────────
  els.editToggle.addEventListener('change', (e) => setEditMode(e.target.checked));
  els.addBtn.addEventListener('click', () => {
    if (!state.editMode) {
      els.editToggle.checked = true;
      setEditMode(true);
    }
    openEditor('add');
  });
  els.searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderList();
  });
  els.copyBtn.addEventListener('click', copySelection);
  els.clearBtn.addEventListener('click', clearSelection);

  // Initial paint
  renderAll();
  loadAll();
})();
