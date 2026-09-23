/* Serialized, version-checked autosaves. Never rebase an uncertain/stale write. */
(() => {
    const config = BLOCK_CONFIG;
    const cells = [...document.querySelectorAll('.block-cell')];
    const state = document.getElementById('save-state');
    const warning = document.getElementById('participation-warning');
    const storageKey = `asl-block-autosave:${config.actor}:${config.field}:${config.revision}`;
    const key = cell => `${cell.dataset.student}:${cell.dataset.block}`;
    let drafts = {};
    try { drafts = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) {}
    if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) drafts = {};
    let saving = false, timer, warningTimer;
    const dirty = new Set();
    const blocked = new Set();
    const restoredConflicts = new Set();
    function persist() {
        try {
            if (Object.keys(drafts).length) localStorage.setItem(storageKey, JSON.stringify(drafts));
            else localStorage.removeItem(storageKey);
        } catch (_) { /* In-memory edits still save when storage is unavailable. */ }
    }
    function remember(cell) {
        const id = key(cell);
        if (cell.value === cell.dataset.initial && !saving) {
            dirty.delete(cell); delete drafts[id];
        } else {
            dirty.add(cell);
            drafts[id] = {value: cell.value, version: Number(cell.dataset.version)};
        }
        cell.classList.toggle('dirty', dirty.has(cell));
        persist();
    }
    function showWarning(cell) {
        if (!warning || config.field !== 'participation_points' || Number(cell.value) <= Number(cell.dataset.maximum)) return;
        warning.textContent = `${cell.dataset.studentName}: ${Number(cell.value) - Number(cell.dataset.maximum)} above`;
        warning.hidden = false;
        clearTimeout(warningTimer);
        warningTimer = setTimeout(() => warning.hidden = true, 4500);
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(save, 400); }
    cells.forEach(cell => {
        cell.dataset.initial = cell.value;
        const draft = drafts[key(cell)];
        if (draft && typeof draft.value === 'string') {
            if (draft.value === cell.value) delete drafts[key(cell)];
            else {
                cell.value = draft.value;
                dirty.add(cell); cell.classList.add('dirty');
                if (draft.version !== Number(cell.dataset.version)) {
                    blocked.add(cell);
                    restoredConflicts.add(cell);
                    state.textContent = 'An unsaved value conflicts with a newer save. Check and edit the value to save it.';
                }
            }
        }
        cell.addEventListener('input', () => {
            // After a fresh page read, explicit editing resolves a restored draft.
            // A failed request in this page still requires reload before retrying.
            if (restoredConflicts.delete(cell)) blocked.delete(cell);
            remember(cell); showWarning(cell); schedule();
        });
        cell.addEventListener('change', () => { remember(cell); showWarning(cell); schedule(); });
        cell.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const column = cells.filter(c => c.dataset.block === cell.dataset.block);
            const next = column[column.indexOf(cell) + 1];
            if (next) { next.focus(); next.select(); }
            save();
        });
    });
    async function save() {
        if (saving) return;
        const pending = [...dirty].filter(cell => !blocked.has(cell) && cell.validity.valid).slice(0, 500);
        if (!pending.length) return;
        const sent = new Map(pending.map(cell => [cell, cell.value]));
        const changes = pending.map(cell => ({
            student_id: Number(cell.dataset.student), block_id: Number(cell.dataset.block),
            version: Number(cell.dataset.version), [config.field]: cell.value === '' ? null : Number(cell.value)
        }));
        saving = true;
        state.textContent = 'Saving…';
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 15000);
        try {
            const body = new URLSearchParams({csrf_token: config.csrf, changes: JSON.stringify(changes), calendar_revision: config.revision});
            const response = await fetch(config.api, {method: 'POST', body, signal: controller.signal});
            const out = await response.json();
            if (!out.success) throw new Error(out.error || 'Save failed. Reload before trying again.');
            if (!Array.isArray(out.saved) || pending.some(cell => !out.saved.some(row => row.student_id === Number(cell.dataset.student) && row.block_id === Number(cell.dataset.block)))) {
                throw new Error('Save confirmation missing. Reload and check the values.');
            }
            pending.forEach(cell => {
                const saved = out.saved.find(row => row.student_id === Number(cell.dataset.student) && row.block_id === Number(cell.dataset.block));
                cell.dataset.version = saved.version;
                cell.dataset.initial = sent.get(cell);
                if (cell.value === sent.get(cell)) {
                    dirty.delete(cell); delete drafts[key(cell)]; cell.classList.remove('dirty');
                } else drafts[key(cell)] = {value: cell.value, version: saved.version};
            });
            persist();
            state.textContent = blocked.size ? 'Some values could not be saved. Reload and check them.' : '';
        } catch (error) {
            pending.forEach(cell => blocked.add(cell));
            state.textContent = error.name === 'AbortError' ? 'Save not confirmed. Reload and check the values.' : error.message;
        } finally {
            clearTimeout(deadline); saving = false;
            if ([...dirty].some(cell => !blocked.has(cell) && cell.validity.valid)) schedule();
        }
    }
    persist(); schedule();
    window.addEventListener('beforeunload', event => {
        if (dirty.size || saving) { event.preventDefault(); event.returnValue = ''; }
    });
})();
