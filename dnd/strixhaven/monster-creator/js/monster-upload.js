// Upload Monsters: choose (or drop) a monster .json file, see a preview from the server, import.
//
// LLM note: the file shapes, matching and checks are documented for AIs in
// dnd/ai-reference/monsters/UPLOAD-GUIDE.md; the monster fields in MONSTER_JSON_IMPORT_TEMPLATE.md.
//
// The page normalises each monster with the same normalizeImportedMonsterJson the paste import
// uses (monster-builder.js) and the shared reader in monster-json-import-normalize.js; the server
// (import-monsters.php + includes/monster-import.php) decides new vs update, tabs and errors, for
// the preview and again for the apply, and writes through the creator's own save path.
//
// Loaded after monster-builder.js: uses its globals (monsterData, currentMainTab, currentSubTab,
// hasUnsavedChanges, saveChangedData, loadMonsterData, rebuildUI, ...).

(function () {
    'use strict';

    const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp)$/i;
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const state = { parsed: null, fileName: '', images: new Map(), prepared: null, preview: null, request: null, ticked: new Set(), defaultTab: null, busy: false };

    const $ = id => document.getElementById(id);

    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(props).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false) return;
            if (key === 'text') node.textContent = value;
            else if (key === 'className') node.className = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else if (key in node && typeof value !== 'string') node[key] = value;
            else node.setAttribute(key, value === true ? '' : value);
        });
        (Array.isArray(children) ? children : [children]).forEach(child => {
            if (child === null || child === undefined || child === false) return;
            node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return node;
    }

    function setStatus(text, kind = '') {
        const status = $('monsterUploadStatus');
        if (!status) return;
        status.textContent = text;
        status.className = 'monster-upload-status' + (kind ? ` monster-upload-status--${kind}` : '');
    }

    function setBusy(busy) {
        state.busy = busy;
        const input = $('monsterUploadInput');
        if (input) input.disabled = busy;
        $('monsterUploadDrop')?.classList.toggle('is-busy', busy);
        updateApplyButton();
    }

    function updateApplyButton() {
        const button = $('monsterUploadApply');
        if (!button) return;
        const count = state.ticked.size;
        button.disabled = state.busy || !state.preview || count === 0;
        button.textContent = count === 1 ? 'Import 1 monster' : `Import ${count} monsters`;
    }

    function resetState() {
        state.parsed = null; state.fileName = ''; state.images = new Map(); state.prepared = null;
        state.preview = null; state.request = null; state.ticked = new Set(); state.defaultTab = null;
        $('monsterUploadPreview')?.replaceChildren();
        $('monsterUploadFiles')?.replaceChildren();
        setStatus('');
        updateApplyButton();
    }

    function openModal() {
        const modal = $('monsterUploadModal');
        if (!modal) return;
        resetState();
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
        UIKit.openModal(modal, {
            onClose: () => { modal.style.display = 'none'; document.body.classList.remove('modal-open'); },
            initialFocus: $('monsterUploadDrop'),
        });
    }

    function closeModal() {
        const modal = $('monsterUploadModal');
        if (!modal) return;
        UIKit.closeModal(modal);
        if (modal.style.display !== 'none') {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    function renderFiles() {
        const box = $('monsterUploadFiles');
        if (!box) return;
        const parts = [];
        if (state.fileName) parts.push(el('span', { className: 'monster-upload-file', text: state.fileName }));
        state.images.forEach((file, name) => parts.push(el('span', { className: 'monster-upload-file monster-upload-file--image', text: name })));
        box.replaceChildren(...parts);
    }

    async function takeFiles(fileList) {
        if (state.busy) return;
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const jsons = files.filter(file => /\.json$/i.test(file.name) || file.type === 'application/json');
        const images = files.filter(file => IMAGE_PATTERN.test(file.name));
        const other = files.filter(file => !jsons.includes(file) && !images.includes(file));
        if (jsons.length > 1) { setStatus('Choose one .json file at a time (it may hold many monsters).', 'error'); return; }
        if (!jsons.length && !state.parsed) { setStatus('Choose a monster .json file (picture files can come with it).', 'error'); return; }
        const notes = other.map(file => `${file.name} was left out: only a .json file and PNG, JPEG, GIF or WebP pictures are taken.`);
        images.forEach(file => {
            if (file.size > MAX_IMAGE_BYTES) notes.push(`${file.name} was left out: pictures must be under 5 MB.`);
            else state.images.set(file.name, file);
        });
        if (jsons.length) {
            try {
                state.parsed = JSON.parse(await jsons[0].text());
                state.fileName = jsons[0].name;
            } catch (error) {
                renderFiles();
                setStatus(`${jsons[0].name} is not valid JSON: ${error.message}`, 'error');
                return;
            }
        }
        renderFiles();
        await runPreview(notes);
    }

    // The page's data must be on the server before the server plans against it, and the page must
    // not later save a copy from before the upload (its Save writes the whole file).
    async function flushPendingSave() {
        if (typeof autoSaveTimer !== 'undefined' && autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        for (let i = 0; i < 100 && typeof isSaving !== 'undefined' && isSaving; i++) await new Promise(resolve => setTimeout(resolve, 100));
        if (hasUnsavedChanges()) await saveChangedData();
        if (hasUnsavedChanges()) throw new Error('The Monster Creator has changes it could not save. Fix that first (see the save status), then upload.');
    }

    function tabChoices() {
        const out = [];
        Object.entries(monsterData.tabs || {}).forEach(([tabId, tab]) => {
            Object.entries(tab?.subTabs || {}).forEach(([subTabId, sub]) => out.push({ tabId, subTabId, label: `${tab.name || 'Tab'} / ${sub?.name || 'Sub-tab'}` }));
        });
        return out;
    }

    function defaultTab() {
        if (state.defaultTab) return state.defaultTab;
        const choices = tabChoices();
        const current = choices.find(choice => choice.tabId === currentMainTab && choice.subTabId === currentSubTab);
        return current ? { tabId: current.tabId, subTabId: current.subTabId } : (choices[0] ? { tabId: choices[0].tabId, subTabId: choices[0].subTabId } : null);
    }

    async function post(body) {
        const response = await fetch('import-monsters.php', { method: 'POST', credentials: 'same-origin', ...body });
        let data = null;
        try { data = await response.json(); } catch (_error) { data = null; }
        if (!response.ok || !data || !data.success) throw new Error(data?.error || `The server answered ${response.status}.`);
        return data;
    }

    async function runPreview(notes = []) {
        if (!state.parsed) return;
        setBusy(true);
        state.preview = null;
        state.ticked = new Set();
        $('monsterUploadPreview')?.replaceChildren();
        setStatus('Checking the monsters…');
        try {
            await flushPendingSave();
            const prepared = window.MonsterJsonImportNormalize.prepareUpload(state.parsed, window.normalizeImportedMonsterJson);
            if (prepared.error) throw new Error(prepared.error);
            state.prepared = prepared;
            state.request = {
                fileName: state.fileName,
                package: prepared.package,
                defaultTab: defaultTab(),
                entries: prepared.entries,
                images: Array.from(state.images.keys()).map(name => ({ name })),
            };
            const data = await post({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', request: state.request }) });
            state.preview = data.preview;
            state.preview.entries.forEach(row => { if (row.importable) state.ticked.add(row.index); });
            renderPreview(notes);
            setStatus('Preview ready. Untick any monster you do not want, then Import.', 'ok');
        } catch (error) {
            setStatus(error.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    function badge(text, kind) {
        return el('span', { className: `monster-upload-badge monster-upload-badge--${kind}`, text });
    }

    function renderPreview(notes) {
        const box = $('monsterUploadPreview');
        const preview = state.preview;
        const counts = preview.counts;
        const parts = [];
        const total = preview.entries.length;
        parts.push(el('p', { className: 'monster-upload-summary', text:
            `${total} monster${total === 1 ? '' : 's'} in ${preview.fileName || 'the file'}: ${counts.new} new, ${counts.update} update${counts.update === 1 ? '' : 's'}, ${counts.blocked} blocked.` }));
        const limit = preview.limits?.pictureBytes;
        const pictures = new Set(preview.entries.filter(row => row.image?.kind === 'sidecar').map(row => row.image.name));
        pictures.forEach(name => {
            const file = state.images.get(name);
            if (limit && file && file.size > limit) {
                notes = [...notes, `${name} (${(file.size / 1048576).toFixed(1)} MB) is over this server's picture limit (${preview.limits.pictureLimit || `${Math.round(limit / 1048576)} MB`}); it would not be stored. Use a smaller picture.`];
            }
        });
        notes.forEach(note => parts.push(el('p', { className: 'monster-upload-note monster-upload-note--warn', text: note })));
        if (preview.createTabs.length) {
            const lines = preview.createTabs.map(item => item.newTab
                ? `new tab "${item.tab}" with sub-tab${item.subTabs.length === 1 ? '' : 's'} ${item.subTabs.map(name => `"${name}"`).join(', ')}`
                : `new sub-tab${item.subTabs.length === 1 ? '' : 's'} ${item.subTabs.map(name => `"${name}"`).join(', ')} in tab "${item.tab}"`);
            parts.push(el('p', { className: 'monster-upload-note monster-upload-note--create', text: `The file asks for, and Import will create: ${lines.join('; ')}.` }));
        }
        const choices = tabChoices();
        const chosen = state.request.defaultTab;
        const select = el('select', { id: 'monsterUploadDefaultTab', onchange: event => {
            const choice = choices[Number(event.target.value)];
            state.defaultTab = choice ? { tabId: choice.tabId, subTabId: choice.subTabId } : null;
            runPreview();
        } }, choices.length ? choices.map((choice, index) => el('option', { value: String(index), text: choice.label,
            selected: chosen && chosen.tabId === choice.tabId && chosen.subTabId === choice.subTabId })) : [el('option', { value: '', text: '(no tabs yet)' })]);
        parts.push(el('label', { className: 'monster-upload-default' }, ['Monsters whose file names no tab go to ', select]));

        const list = el('div', { className: 'monster-upload-rows' });
        preview.entries.forEach(row => {
            const blocked = !row.importable;
            const checkbox = el('input', { type: 'checkbox', checked: state.ticked.has(row.index), disabled: blocked,
                'aria-label': `Import ${row.name || 'this monster'}`, onchange: event => {
                    if (event.target.checked) state.ticked.add(row.index); else state.ticked.delete(row.index);
                    updateApplyButton();
                } });
            const head = el('div', { className: 'monster-upload-row__head' }, [
                checkbox,
                blocked ? badge('BLOCKED', 'blocked') : badge(row.action === 'new' ? 'NEW' : 'UPDATE', row.action),
                el('strong', { text: row.name || `Item ${row.index + 1}` }),
                row.level !== null ? el('span', { className: 'monster-upload-row__level', text: `Level ${row.level}` }) : null,
            ]);
            const details = [];
            if (row.place) {
                details.push(el('div', {}, ['→ ', row.place,
                    row.tab?.create ? badge('new tab', 'create') : null,
                    !row.tab?.create && row.subTab?.create ? badge('new sub-tab', 'create') : null,
                    row.moveFrom ? ` (moves from ${row.moveFrom})` : null]));
            }
            if (row.matchNote) details.push(el('div', { className: 'monster-upload-row__match', text: row.matchNote }));
            if (row.id && row.action === 'new' && !blocked) details.push(el('div', { className: 'monster-upload-row__match', text: `New id: ${row.id}` }));
            const imageText = { sidecar: `Picture: ${row.image.name} (sent with the file)`, url: `Picture: ${row.image.name} (already uploaded)`, keep: 'Picture: keeps its current one' }[row.image?.kind];
            if (imageText) details.push(el('div', { className: 'monster-upload-row__image', text: imageText }));
            if (row.errors.length) details.push(el('ul', { className: 'monster-upload-row__errors' }, row.errors.map(text => el('li', { text }))));
            if (row.warnings.length) {
                const warnList = el('ul', { className: 'monster-upload-row__warnings' }, row.warnings.map(text => el('li', { text })));
                details.push(row.warnings.length > 3
                    ? el('details', {}, [el('summary', { text: `${row.warnings.length} warnings (allowed)` }), warnList])
                    : warnList);
            }
            list.append(el('div', { className: `monster-upload-row${blocked ? ' is-blocked' : ''}` }, [head, el('div', { className: 'monster-upload-row__body' }, details)]));
        });
        parts.push(list);
        box.replaceChildren(...parts);
        updateApplyButton();
    }

    async function applyUpload() {
        if (state.busy || !state.preview || !state.ticked.size) return;
        setBusy(true);
        setStatus('Importing…');
        try {
            await flushPendingSave();
            const selected = Array.from(state.ticked).sort((a, b) => a - b);
            const expect = {};
            const images = new Set();
            state.preview.entries.forEach(row => {
                if (!state.ticked.has(row.index)) return;
                expect[row.index] = row.expect;
                if (row.image?.kind === 'sidecar') images.add(row.image.name);
            });
            const form = new FormData();
            form.append('action', 'apply');
            form.append('payload', JSON.stringify({ ...state.request, selected, expect }));
            images.forEach(name => { const file = state.images.get(name); if (file) form.append('images[]', file, name); });
            const data = await post({ body: form });
            state.preview = null;
            state.ticked = new Set();
            await reloadAfterUpload(data.results);
            renderResults(data);
        } catch (error) {
            setStatus(`Nothing was imported: ${error.message}`, 'error');
        } finally {
            setBusy(false);
        }
    }

    async function reloadAfterUpload(results) {
        // Drafts not yet in a tab never reach the server; keep them in the page across the reload.
        const referenced = getReferencedMonsterIds();
        const drafts = Object.entries(monsterData.monsters || {}).filter(([id]) => !referenced.has(id));
        const keepTab = { tab: currentMainTab, sub: currentSubTab };
        const before = monsterData;
        await loadMonsterData();
        if (monsterData === before) throw new Error('The monsters were saved, but the page could not reload them. Reload the page before editing.');
        drafts.forEach(([id, monster]) => { if (!monsterData.monsters[id]) monsterData.monsters[id] = monster; });
        const landed = results.find(result => result.action === 'created' || result.action === 'updated');
        const goTo = landed ? { tab: landed.tabId, sub: landed.subTabId } : keepTab;
        if (monsterData.tabs[goTo.tab]?.subTabs?.[goTo.sub]) { currentMainTab = goTo.tab; currentSubTab = goTo.sub; }
        rebuildUI();
        updateSaveStatus('saved');
    }

    function renderResults(data) {
        const box = $('monsterUploadPreview');
        const counts = data.counts;
        const rows = data.results.map(result => {
            const text = result.action === 'skipped'
                ? `Skipped ${result.name || `item ${result.index + 1}`}: ${result.reason}`
                : `${result.action === 'created' ? 'Created' : 'Updated'} ${result.name} in ${result.place}${result.moveFrom ? ` (moved from ${result.moveFrom})` : ''}${result.image ? ` · picture ${result.image}` : ''}`;
            const item = el('li', { className: `monster-upload-result monster-upload-result--${result.action}`, text });
            const notes = (result.warnings || []).filter(note => /^Picture "/.test(note));
            if (notes.length) item.append(el('ul', { className: 'monster-upload-row__warnings' }, notes.map(note => el('li', { text: note }))));
            return item;
        });
        box.replaceChildren(
            el('p', { className: 'monster-upload-summary', text: `${counts.created || 0} created, ${counts.updated || 0} updated, ${counts.skipped || 0} skipped. A backup of the monsters from before the upload is in Data Recovery.` }),
            el('ul', { className: 'monster-upload-results' }, rows)
        );
        setStatus('Import finished.', 'ok');
        if ((counts.created || 0) + (counts.updated || 0) > 0) UIKit.toast(`Upload: ${counts.created || 0} created, ${counts.updated || 0} updated.`, 'success');
    }

    /** True when JSON pasted into Import JSON holds several monsters, which go through the upload preview. */
    function isMultiMonster(parsed) {
        return Array.isArray(parsed) || Boolean(parsed && typeof parsed === 'object' && Array.isArray(parsed.monsters));
    }

    function openWithParsed(parsed, fileName = 'pasted.json') {
        openModal();
        state.parsed = parsed;
        state.fileName = fileName;
        renderFiles();
        runPreview();
    }

    function wireDropZone() {
        const drop = $('monsterUploadDrop');
        const input = $('monsterUploadInput');
        if (!drop || !input) return;
        drop.addEventListener('click', () => { if (!state.busy) { input.value = ''; input.click(); } });
        drop.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); drop.click(); } });
        input.addEventListener('change', () => takeFiles(input.files));
        ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-dragover'); }));
        ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('is-dragover'); }));
        drop.addEventListener('drop', event => takeFiles(event.dataTransfer?.files));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireDropZone);
    else wireDropZone();

    window.openMonsterUploadModal = openModal;
    window.closeMonsterUploadModal = closeModal;
    window.applyMonsterUpload = applyUpload;
    window.MonsterUpload = Object.freeze({ isMultiMonster, openWithParsed, takeFiles });
})();
