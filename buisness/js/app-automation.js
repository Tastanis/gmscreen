// APP Automation: modular APP bullets, formatted content, batching, presets, exports.
// Vanilla JS, no build step. State persists via /buisness/api/{bullets,selection}.php.

(function () {
  'use strict';

  const API_BULLETS = 'api/bullets.php';
  const API_SELECTION = 'api/selection.php';

  const DEPTH_INDENT = [0, 20, 48];
  const DEFAULT_PRESETS = [
    { key: 'general', title: 'General', ids: [] },
    { key: 'templates', title: 'Templates', ids: [] },
    { key: 'schedule', title: 'Schedule', ids: [] },
    { key: 'integrations', title: 'Integrations', ids: [] },
    { key: 'reports', title: 'Reports', ids: [] },
    { key: 'audit-log', title: 'Audit Log', ids: [] },
  ];

  const els = {
    body: document.body,
    list: document.getElementById('bullet-list'),
    selectionList: document.getElementById('selection-list'),
    editToggle: document.getElementById('edit-mode-toggle'),
    addBtn: document.getElementById('add-bullet-btn'),
    searchInput: document.getElementById('search-input'),
    leftCount: document.getElementById('left-count'),
    selCount: document.getElementById('selection-count'),
    copyBtn: document.getElementById('copy-btn'),
    clearBtn: document.getElementById('clear-btn'),
    exportQuestionsBtn: document.getElementById('export-questions-btn'),
    exportDraftsBtn: document.getElementById('export-drafts-btn'),
    rightEmpty: document.getElementById('right-empty'),
    leftPane: document.getElementById('left-pane'),
    rightPane: document.getElementById('right-pane'),
    splitter: document.getElementById('splitter'),
    detailBody: document.getElementById('detail-body'),
    saveStatus: document.getElementById('save-status'),
    hintPill: document.getElementById('hint-pill'),
    emptyEditHint: document.getElementById('empty-edit-hint'),
    editorTpl: document.getElementById('bullet-edit-template'),
    presetTabs: Array.from(document.querySelectorAll('.presetTab')),
    contentModal: document.getElementById('content-modal'),
    contentTitle: document.getElementById('content-modal-title'),
    contentSubtitle: document.getElementById('content-modal-subtitle'),
    contentClose: document.getElementById('content-modal-close'),
    contentCancel: document.getElementById('content-cancel-btn'),
    contentClear: document.getElementById('content-clear-btn'),
    contentSave: document.getElementById('content-save-btn'),
    questionsEditor: document.getElementById('questions-editor'),
    draftEditor: document.getElementById('draft-editor'),
  };

  const state = {
    bullets: [],
    added: [],
    presets: DEFAULT_PRESETS.map(p => ({ ...p })),
    activePresetKey: 'general',
    query: '',
    editMode: false,
    leftPct: 60,
    pendingBulletsSave: null,
    pendingSelectionSave: null,
    dragId: null,
    dragOverIndex: -1,
    dragOverDepth: 0,
    activeEditor: null,
    activeContentId: null,
  };

  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeBullet(b) {
    return {
      id: String(b.id || uid()),
      depth: Math.max(0, Math.min(2, Number.parseInt(b.depth, 10) || 0)),
      text: String(b.text || ''),
      questionsHtml: String(b.questionsHtml || ''),
      draftHtml: String(b.draftHtml || ''),
      batchWithParent: !!b.batchWithParent && (Number.parseInt(b.depth, 10) || 0) > 0,
    };
  }

  function flashStatus(text, ms = 1600) {
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
    return depth === 1 ? '\u2022' : depth === 2 ? '\u25e6' : '';
  }

  function htmlHasContent(html) {
    if (!html) return false;
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent.trim() !== '' || !!div.querySelector('img,table,hr');
  }

  function plainTextFromHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent.trim();
  }

  function orderSelection(ids) {
    const set = new Set(ids);
    return state.bullets.filter(b => set.has(b.id)).map(b => b.id);
  }

  function mergePresets(loaded) {
    const byKey = new Map(DEFAULT_PRESETS.map(p => [p.key, { ...p }]));
    if (Array.isArray(loaded)) {
      loaded.forEach(p => {
        if (!p || !p.key || !byKey.has(p.key)) return;
        byKey.set(p.key, {
          key: p.key,
          title: String(p.title || byKey.get(p.key).title),
          ids: Array.isArray(p.ids) ? orderSelection(p.ids) : [],
        });
      });
    }
    return DEFAULT_PRESETS.map(p => byKey.get(p.key));
  }

  async function loadAll() {
    try {
      const [b, s] = await Promise.all([
        fetch(API_BULLETS, { credentials: 'same-origin' }).then(r => r.json()),
        fetch(API_SELECTION, { credentials: 'same-origin' }).then(r => r.json()),
      ]);
      if (b && b.ok && Array.isArray(b.bullets)) {
        state.bullets = b.bullets.map(normalizeBullet);
      }
      if (s && s.ok && Array.isArray(s.ids)) state.added = orderSelection(s.ids);
      if (s && s.ok && Array.isArray(s.presets)) state.presets = mergePresets(s.presets);
      state.added = normalizeSelection(state.added, { includeBatched: false });
    } catch (e) {
      console.warn('Failed to load saved data', e);
    }
    renderAll();
  }

  function scheduleSaveBullets() {
    setSaveStatus('saving...');
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
      setSaveStatus('draft - autosaved');
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
        body: JSON.stringify({ ids: state.added, presets: state.presets }),
      });
    } catch (e) {
      console.warn('Save selection failed', e);
    }
  }

  function computeFilteredIds() {
    const q = state.query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set();
    state.bullets.forEach((b, i) => {
      if (b.text.toLowerCase().includes(q) || plainTextFromHtml(b.questionsHtml).toLowerCase().includes(q) || plainTextFromHtml(b.draftHtml).toLowerCase().includes(q)) {
        matches.add(b.id);
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

  function parentIndexOf(index) {
    const child = state.bullets[index];
    if (!child || child.depth === 0) return -1;
    for (let i = index - 1; i >= 0; i--) {
      if (state.bullets[i].depth < child.depth) return i;
    }
    return -1;
  }

  function ancestorIdsFor(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return [];
    const ancestors = [];
    let currentDepth = state.bullets[idx].depth;
    for (let i = idx - 1; i >= 0 && currentDepth > 0; i--) {
      if (state.bullets[i].depth < currentDepth) {
        ancestors.unshift(state.bullets[i].id);
        currentDepth = state.bullets[i].depth;
      }
    }
    return ancestors;
  }

  function subtreeIdsFor(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return [];
    const rootDepth = state.bullets[idx].depth;
    const ids = [id];
    for (let i = idx + 1; i < state.bullets.length; i++) {
      if (state.bullets[i].depth <= rootDepth) break;
      ids.push(state.bullets[i].id);
    }
    return ids;
  }

  function batchedDescendantIdsFor(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return [];
    const rootDepth = state.bullets[idx].depth;
    const included = new Set([id]);
    const ids = [];
    for (let i = idx + 1; i < state.bullets.length; i++) {
      const b = state.bullets[i];
      if (b.depth <= rootDepth) break;
      const parentIdx = parentIndexOf(i);
      const parentId = parentIdx >= 0 ? state.bullets[parentIdx].id : null;
      if (b.batchWithParent && parentId && included.has(parentId)) {
        included.add(b.id);
        ids.push(b.id);
      }
    }
    return ids;
  }

  function normalizeSelection(ids, options = {}) {
    const includeBatched = options.includeBatched !== false;
    const wanted = new Set();
    ids.forEach(id => {
      if (!state.bullets.some(b => b.id === id)) return;
      ancestorIdsFor(id).forEach(x => wanted.add(x));
      wanted.add(id);
      if (includeBatched) batchedDescendantIdsFor(id).forEach(x => wanted.add(x));
    });
    return state.bullets.filter(b => wanted.has(b.id)).map(b => b.id);
  }

  function renderStatusBadges(b) {
    const wrap = document.createElement('span');
    wrap.className = 'contentBadges';
    const q = document.createElement('span');
    q.className = 'contentBadge q' + (htmlHasContent(b.questionsHtml) ? ' has' : '');
    q.textContent = 'Q';
    q.title = htmlHasContent(b.questionsHtml) ? 'Questions attached' : 'No questions attached';
    const d = document.createElement('span');
    d.className = 'contentBadge d' + (htmlHasContent(b.draftHtml) ? ' has' : '');
    d.textContent = 'D';
    d.title = htmlHasContent(b.draftHtml) ? 'Draft attached' : 'No draft attached';
    wrap.appendChild(q);
    wrap.appendChild(d);
    return wrap;
  }

  function renderList() {
    const list = els.list;
    list.innerHTML = '';
    const filtered = computeFilteredIds();

    state.bullets.forEach((b, idx) => {
      const row = document.createElement('div');
      row.className = 'bRow d' + b.depth +
        (state.added.includes(b.id) ? ' added' : '') +
        (filtered && !filtered.has(b.id) ? ' hidden' : '') +
        (b.batchWithParent ? ' batched' : '');
      row.dataset.id = b.id;
      row.dataset.idx = String(idx);
      row.draggable = false;
      row.title = state.editMode ? 'Drag to reorder or use buttons to edit' : 'Click to select';

      const handle = document.createElement('span');
      handle.className = 'bRowDragHandle';
      handle.setAttribute('aria-hidden', 'true');
      handle.textContent = '\u22ee\u22ee';
      row.appendChild(handle);

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

      row.appendChild(renderStatusBadges(b));

      const controls = document.createElement('div');
      controls.className = 'bRowControls';

      const contentBtn = document.createElement('button');
      contentBtn.type = 'button';
      contentBtn.className = 'iconBtn';
      contentBtn.title = 'Edit questions and draft';
      contentBtn.textContent = 'QD';
      contentBtn.addEventListener('click', e => {
        e.stopPropagation();
        openContentModal(b.id);
      });

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'iconBtn';
      editBtn.title = 'Edit bullet';
      editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 14l4-1 7-7-3-3-7 7-1 4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      editBtn.addEventListener('click', e => {
        e.stopPropagation();
        openEditor('edit', b.id, row);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'iconBtn';
      delBtn.title = 'Delete bullet';
      delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 5h10M6.5 5V3.5h3V5M5 5l.5 8.5a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteBullet(b.id);
      });

      controls.appendChild(contentBtn);
      controls.appendChild(editBtn);
      controls.appendChild(delBtn);
      row.appendChild(controls);
      list.appendChild(row);
    });

    list.classList.toggle('is-empty', state.bullets.length === 0);
    if (els.emptyEditHint) els.emptyEditHint.style.display = state.bullets.length === 0 ? 'block' : 'none';

    if (filtered) {
      const visible = state.bullets.filter(b => filtered.has(b.id)).length;
      els.leftCount.textContent = visible + '/' + state.bullets.length;
    } else {
      els.leftCount.textContent = state.bullets.length + ' item' + (state.bullets.length === 1 ? '' : 's');
    }

    applyEditModeToRows();
  }

  function renderSelection() {
    const list = els.selectionList;
    list.innerHTML = '';
    const set = new Set(state.added);
    const items = state.bullets.filter(b => set.has(b.id));

    items.forEach(b => {
      const row = document.createElement('div');
      row.className = 'bRow d' + b.depth + (b.batchWithParent ? ' batched' : '');
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

    const hasItems = items.length > 0;
    list.classList.toggle('is-empty', !hasItems);
    if (els.rightEmpty) els.rightEmpty.style.display = hasItems ? 'none' : 'grid';
    els.selCount.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
    els.selCount.classList.toggle('has', hasItems);
    els.copyBtn.disabled = !hasItems;
    els.clearBtn.disabled = !hasItems;
    els.exportQuestionsBtn.disabled = !hasItems;
    els.exportDraftsBtn.disabled = !hasItems;
  }

  function renderPresetTabs() {
    const byKey = new Map(state.presets.map(p => [p.key, p]));
    els.presetTabs.forEach(tab => {
      const key = tab.dataset.presetKey;
      const preset = byKey.get(key);
      if (!preset) return;
      tab.textContent = preset.title;
      tab.classList.toggle('on', state.activePresetKey === key);
      tab.classList.toggle('saved', preset.ids.length > 0);
      tab.title = state.editMode
        ? 'Click to rename and save the current selection to this preset'
        : (preset.ids.length ? 'Load this preset selection' : 'No saved selection yet');
    });
  }

  function renderAll() {
    renderList();
    renderSelection();
    renderPresetTabs();
  }

  function addToSelection(id) {
    state.added = normalizeSelection([...state.added, id]);
  }

  function removeFromSelection(id) {
    const remove = new Set(subtreeIdsFor(id));
    state.added = state.added.filter(x => !remove.has(x));
  }

  function toggleAdded(id) {
    const selected = state.added.includes(id);
    const bullet = state.bullets.find(b => b.id === id);
    if (selected && bullet && bullet.batchWithParent) {
      flashStatus('That item is batched with its parent');
      return;
    }
    if (selected) removeFromSelection(id);
    else addToSelection(id);
    state.added = normalizeSelection(state.added);
    scheduleSaveSelection();
    renderAll();
  }

  function toggleSubtree(id) {
    const ids = subtreeIdsFor(id);
    const set = new Set(state.added);
    const all = ids.every(x => set.has(x));
    if (all) ids.forEach(x => set.delete(x));
    else ids.forEach(x => set.add(x));
    state.added = normalizeSelection([...set], { includeBatched: false });
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
      const prefix = b.depth === 0 ? '' : (b.depth === 1 ? '* ' : '- ');
      return indent + prefix + b.text;
    });
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flashStatus('Copied to clipboard'),
        () => flashStatus('Copy failed')
      );
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flashStatus('Copied to clipboard'); }
      catch (_) { flashStatus('Copy failed'); }
      document.body.removeChild(ta);
    }
  }

  function deleteBullet(id) {
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return;
    const remove = new Set(subtreeIdsFor(id));
    state.bullets = state.bullets.filter(b => !remove.has(b.id));
    state.added = state.added.filter(x => !remove.has(x));
    state.presets.forEach(p => { p.ids = p.ids.filter(x => !remove.has(x)); });
    scheduleSaveBullets();
    scheduleSaveSelection();
    renderAll();
  }

  function canBatchWithParent(depth, id) {
    if (depth <= 0) return false;
    const idx = state.bullets.findIndex(b => b.id === id);
    if (idx < 0) return true;
    return parentIndexOf(idx) >= 0;
  }

  function openEditor(mode, id, anchorRow) {
    closeEditor();
    const tpl = els.editorTpl.content.cloneNode(true);
    const wrap = tpl.querySelector('.bulletEditor');
    const textInput = wrap.querySelector('.bulletText');
    const depthSelect = wrap.querySelector('.depthSelect');
    const batchToggle = wrap.querySelector('.batchWithParent');
    const batchWrap = wrap.querySelector('.batchToggle');
    const cancelBtn = wrap.querySelector('.cancelBtn');
    const saveBtn = wrap.querySelector('.saveBtn');

    let initialDepth = 0;
    if (mode === 'edit') {
      const b = state.bullets.find(x => x.id === id);
      if (!b) return;
      textInput.value = b.text;
      initialDepth = b.depth;
      batchToggle.checked = !!b.batchWithParent;
    }
    depthSelect.value = String(initialDepth);

    const refreshBatch = () => {
      const depth = Number.parseInt(depthSelect.value, 10) || 0;
      const enabled = canBatchWithParent(depth, id);
      batchWrap.hidden = depth <= 0;
      batchToggle.disabled = !enabled;
      if (!enabled) batchToggle.checked = false;
    };
    refreshBatch();
    depthSelect.addEventListener('change', refreshBatch);

    const close = () => closeEditor();
    cancelBtn.addEventListener('click', close);

    const commit = () => {
      const text = textInput.value.trim();
      const depth = Math.max(0, Math.min(2, Number.parseInt(depthSelect.value, 10) || 0));
      if (!text) {
        textInput.focus();
        return;
      }
      if (mode === 'edit') {
        const b = state.bullets.find(x => x.id === id);
        if (b) {
          b.text = text;
          b.depth = depth;
          b.batchWithParent = depth > 0 && batchToggle.checked && canBatchWithParent(depth, id);
        }
      } else {
        state.bullets.push({
          id: uid(),
          depth,
          text,
          questionsHtml: '',
          draftHtml: '',
          batchWithParent: depth > 0 && batchToggle.checked,
        });
      }
      state.added = normalizeSelection(state.added);
      scheduleSaveBullets();
      scheduleSaveSelection();
      closeEditor();
      renderAll();
    };

    saveBtn.addEventListener('click', commit);
    textInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    if (mode === 'edit' && anchorRow && anchorRow.parentNode === els.list) {
      anchorRow.style.display = 'none';
      anchorRow.insertAdjacentElement('afterend', wrap);
      state.activeEditor = { mode: 'edit', id, node: wrap, hidden: anchorRow };
    } else {
      els.list.appendChild(wrap);
      state.activeEditor = { mode: 'add', node: wrap };
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

  function sanitizeEditorHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html || '';
    tpl.content.querySelectorAll('script, iframe, object, embed, link, meta, base, form, input, button, textarea, select, option').forEach(n => n.remove());
    tpl.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) node.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) node.removeAttribute(attr.name);
      });
    });
    return tpl.innerHTML.trim();
  }

  function openContentModal(id) {
    closeEditor();
    const b = state.bullets.find(x => x.id === id);
    if (!b) return;
    state.activeContentId = id;
    els.contentTitle.textContent = 'Questions and draft';
    els.contentSubtitle.textContent = b.text || '(empty)';
    els.questionsEditor.innerHTML = b.questionsHtml || '';
    els.draftEditor.innerHTML = b.draftHtml || '';
    els.contentModal.hidden = false;
    els.body.classList.add('modal-open');
    setTimeout(() => els.questionsEditor.focus(), 0);
  }

  function closeContentModal() {
    state.activeContentId = null;
    els.contentModal.hidden = true;
    els.body.classList.remove('modal-open');
  }

  function saveContentModal() {
    const b = state.bullets.find(x => x.id === state.activeContentId);
    if (!b) return;
    b.questionsHtml = sanitizeEditorHtml(els.questionsEditor.innerHTML);
    b.draftHtml = sanitizeEditorHtml(els.draftEditor.innerHTML);
    scheduleSaveBullets();
    closeContentModal();
    renderAll();
    flashStatus('Content saved');
  }

  function clearContentModal() {
    if (!confirm('Clear both Questions and Draft for this bullet?')) return;
    els.questionsEditor.innerHTML = '';
    els.draftEditor.innerHTML = '';
  }

  function applyEditModeToRows() {
    els.list.querySelectorAll('.bRow').forEach(row => {
      row.draggable = state.editMode;
    });
  }

  function setEditMode(on) {
    state.editMode = !!on;
    els.body.classList.toggle('edit-mode', state.editMode);
    if (!state.editMode) closeEditor();
    renderAll();
  }

  function handlePresetClick(tab) {
    const key = tab.dataset.presetKey;
    const preset = state.presets.find(p => p.key === key);
    if (!preset) return;
    state.activePresetKey = key;

    if (state.editMode) {
      let changed = false;
      const saveCurrent = confirm('Save the current right-side selection to "' + preset.title + '"?');
      const newTitle = prompt('Preset button name:', preset.title);
      if (newTitle !== null && newTitle.trim() !== '' && newTitle.trim() !== preset.title) {
        preset.title = newTitle.trim();
        changed = true;
      }
      if (saveCurrent) {
        preset.ids = orderSelection(state.added);
        changed = true;
      }
      if (changed) {
        scheduleSaveSelection();
        flashStatus('Preset saved');
      }
      renderPresetTabs();
      return;
    }

    if (!preset.ids.length) {
      flashStatus('No selection saved for this preset yet');
      renderPresetTabs();
      return;
    }
    state.added = normalizeSelection(preset.ids, { includeBatched: false });
    scheduleSaveSelection();
    renderAll();
    flashStatus('Loaded ' + preset.title);
  }

  function selectedItems() {
    const set = new Set(state.added);
    return state.bullets.filter(b => set.has(b.id));
  }

  function exportHtmlDocument(title, bodyHtml) {
    const doc = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;line-height:1.5;color:#111;margin:40px;max-width:900px}' +
      '.export-block{margin:0 0 28px}.draft-group{break-after:page;page-break-after:always;margin:0 0 40px}.draft-group:last-child{break-after:auto;page-break-after:auto}' +
      'hr{border:0;border-top:1px solid #ccc;margin:28px 0}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 6px}</style></head><body>' +
      bodyHtml + '</body></html>';
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 0);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function exportQuestions() {
    const blocks = selectedItems()
      .map(b => b.questionsHtml)
      .filter(htmlHasContent)
      .map(html => '<div class="export-block">' + html + '</div>');
    if (!blocks.length) {
      flashStatus('Selected bullets have no questions yet');
      return;
    }
    exportHtmlDocument('Questions Export', blocks.join('\n'));
    flashStatus('Questions exported');
  }

  function exportDrafts() {
    const items = selectedItems();
    const groups = [];
    let current = null;

    items.forEach(b => {
      if (b.depth === 0 || !current) {
        current = [];
        groups.push(current);
      }
      if (htmlHasContent(b.draftHtml)) current.push(b.draftHtml);
    });

    const body = groups
      .map(group => group.filter(htmlHasContent).map(html => '<div class="export-block">' + html + '</div>').join('\n'))
      .filter(Boolean)
      .map(html => '<section class="draft-group">' + html + '</section>')
      .join('\n');

    if (!body) {
      flashStatus('Selected bullets have no drafts yet');
      return;
    }
    exportHtmlDocument('Drafts Export', body);
    flashStatus('Drafts exported');
  }

  els.list.addEventListener('click', e => {
    if (state.activeEditor) return;
    const row = e.target.closest('.bRow');
    if (!row) return;
    if (e.target.closest('.bRowControls') || e.target.closest('.contentBadges')) return;
    const id = row.dataset.id;
    if (!id) return;
    if (state.editMode) openEditor('edit', id, row);
    else toggleAdded(id);
  });

  els.list.addEventListener('dblclick', e => {
    if (state.editMode || state.activeEditor) return;
    const row = e.target.closest('.bRow');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    toggleSubtree(id);
  });

  let dropIndicator = null;
  function ensureDropIndicator() {
    if (dropIndicator) return dropIndicator;
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    return dropIndicator;
  }

  function clearDropIndicator() {
    if (dropIndicator && dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
    state.dragOverIndex = -1;
  }

  function depthFromX(localX) {
    if (localX < 14) return 0;
    if (localX < 34) return 1;
    return 2;
  }

  function computeDropTarget(clientX, clientY) {
    const listRect = els.list.getBoundingClientRect();
    const depth = depthFromX(clientX - listRect.left);
    const rows = Array.from(els.list.querySelectorAll('.bRow:not(.dragging)'));
    if (rows.length === 0) return { index: 0, depth };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        return { index: Number.parseInt(rows[i].dataset.idx, 10), depth };
      }
    }
    const last = rows[rows.length - 1];
    return { index: Number.parseInt(last.dataset.idx, 10) + 1, depth };
  }

  function showDropIndicator(target) {
    const ind = ensureDropIndicator();
    const rows = els.list.querySelectorAll('.bRow');
    let topPx = 0;
    if (target.index >= state.bullets.length) {
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const r = lastRow.getBoundingClientRect();
        const lr = els.list.getBoundingClientRect();
        topPx = (r.bottom - lr.top) + 4;
      }
    } else {
      const row = els.list.querySelector('.bRow[data-idx="' + target.index + '"]');
      if (row) {
        const r = row.getBoundingClientRect();
        const lr = els.list.getBoundingClientRect();
        topPx = (r.top - lr.top) - 2;
      }
    }
    ind.style.top = topPx + 'px';
    ind.style.setProperty('--indent', DEPTH_INDENT[target.depth] + 'px');
    if (ind.parentNode !== els.list) els.list.appendChild(ind);
  }

  els.list.addEventListener('dragstart', e => {
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

  els.list.addEventListener('dragover', e => {
    if (!state.editMode || !state.dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const target = computeDropTarget(e.clientX, e.clientY);
    state.dragOverIndex = target.index;
    state.dragOverDepth = target.depth;
    showDropIndicator(target);
  });

  els.list.addEventListener('drop', e => {
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
    insertAt = Math.max(0, Math.min(state.bullets.length, insertAt));
    item.depth = Math.max(0, Math.min(2, targetDepth | 0));
    if (item.depth === 0) item.batchWithParent = false;
    state.bullets.splice(insertAt, 0, item);
    state.added = normalizeSelection(state.added);
    state.presets.forEach(p => { p.ids = orderSelection(p.ids); });
    scheduleSaveBullets();
    scheduleSaveSelection();
    renderAll();
  }

  let splitterDrag = false;
  els.splitter.addEventListener('mousedown', e => {
    e.preventDefault();
    splitterDrag = true;
    els.splitter.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', e => {
    if (!splitterDrag) return;
    const r = els.detailBody.getBoundingClientRect();
    const pct = Math.max(28, Math.min(82, ((e.clientX - r.left) / r.width) * 100));
    state.leftPct = pct;
    els.leftPane.style.width = pct + '%';
    els.rightPane.style.width = (100 - pct) + '%';
  });
  window.addEventListener('mouseup', () => {
    if (!splitterDrag) return;
    splitterDrag = false;
    els.splitter.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  els.leftPane.style.width = state.leftPct + '%';
  els.rightPane.style.width = (100 - state.leftPct) + '%';

  els.editToggle.addEventListener('change', e => setEditMode(e.target.checked));
  els.addBtn.addEventListener('click', () => {
    if (!state.editMode) {
      els.editToggle.checked = true;
      setEditMode(true);
    }
    openEditor('add');
  });
  els.searchInput.addEventListener('input', e => {
    state.query = e.target.value;
    renderList();
  });
  els.copyBtn.addEventListener('click', copySelection);
  els.clearBtn.addEventListener('click', clearSelection);
  els.exportQuestionsBtn.addEventListener('click', exportQuestions);
  els.exportDraftsBtn.addEventListener('click', exportDrafts);
  els.presetTabs.forEach(tab => tab.addEventListener('click', () => handlePresetClick(tab)));

  els.contentClose.addEventListener('click', closeContentModal);
  els.contentCancel.addEventListener('click', closeContentModal);
  els.contentSave.addEventListener('click', saveContentModal);
  els.contentClear.addEventListener('click', clearContentModal);
  els.contentModal.addEventListener('click', e => {
    if (e.target === els.contentModal) closeContentModal();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.contentModal.hidden) closeContentModal();
  });

  renderAll();
  loadAll();
})();
