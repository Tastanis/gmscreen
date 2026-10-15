/*
 * A monster's 3D mini in the Monster Creator (docs/vtt-3d-minis.md): add or replace its .glb file,
 * look at it standing on its base, and set its scale, turn and lift. The monster is saved with
 *   model: { file, scale, yaw, lift }
 * and a token made from it stands on the VTT's 3D board as that model.
 *
 * The file is checked in the browser by the same rules as the server (mini-model.js), then sent to
 * upload-model.php, which stores it under a name made from its own content.
 */
(function (global) {
    'use strict';

    const RULES_URL = '/dnd/vtt/assets/js/ui/mini-model.js';
    const PREVIEW_URL = '/dnd/vtt/board3d/mini-preview.mjs';
    const SETTINGS = {
        scale: { label: 'Scale', min: 0.25, max: 4, step: 0.05, fallback: 1, title: 'Bigger or smaller than the fit to its squares' },
        yaw: { label: 'Turn°', min: -180, max: 180, step: 15, fallback: 0, title: 'Which way it faces (0 faces the camera\'s starting view)' },
        lift: { label: 'Lift', min: -2, max: 4, step: 0.05, fallback: 0, title: 'Raise or sink it, in squares' },
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const jsString = (value) => escapeHtml(JSON.stringify(String(value ?? '')));
    // monster-builder.js keeps the data in a top-level `let`, shared by the page's scripts but not on window.
    // eslint-disable-next-line no-undef
    const monsterOf = (monsterId) => (typeof monsterData !== 'undefined' ? monsterData : global.monsterData)?.monsters?.[monsterId] || null;
    const rules = () => import(RULES_URL);

    /** The monster's footprint in squares: "2" is 2; "1T", "1S", "1M" and "1L" are 1. */
    function footprintOf(monster) {
        const size = String(monster?.size ?? '1M').trim();
        return /^\d+$/.test(size) ? Math.max(1, parseInt(size, 10)) : 1;
    }

    function settingValue(model, key) {
        const n = Number(model?.[key]);
        return Number.isFinite(n) ? n : SETTINGS[key].fallback;
    }

    function saveChange(monsterId) {
        const monster = monsterOf(monsterId);
        if (!monster) return;
        monster.lastModified = Date.now();
        if (typeof global.markMonsterDirty === 'function') global.markMonsterDirty(monsterId);
    }

    function toast(message, kind = 'info') {
        if (global.UIKit?.toast) global.UIKit.toast(message, kind);
        else console.log('[Monster Creator]', message);
    }

    /** The "3D mini" part of a monster's card. */
    function cardBlock(monsterId, monster) {
        const model = monster?.model && typeof monster.model === 'object' ? monster.model : null;
        const id = escapeHtml(monsterId);
        const call = (name, ...args) => `MonsterMini.${name}(${[jsString(monsterId), ...args].join(',')})`;
        const settings = model ? Object.entries(SETTINGS).map(([key, s]) => `
            <label class="monster-mini__setting" title="${escapeHtml(s.title)}">
                <span>${escapeHtml(s.label)}</span>
                <input type="number" min="${s.min}" max="${s.max}" step="${s.step}" value="${escapeHtml(settingValue(model, key))}"
                       data-mini-setting="${key}" onchange="${call('set', jsString(key), 'this.value')}">
            </label>`).join('') : '';
        return `
            <div class="monster-mini" data-mini-for="${id}">
                <div class="monster-mini__head">
                    <span class="monster-mini__title">3D mini</span>
                    ${model ? `<span class="monster-mini__file" title="${escapeHtml(model.file)}">✓ on the board</span>` : '<span class="monster-mini__none">none (shows its picture)</span>'}
                </div>
                <div class="monster-mini__buttons">
                    <button type="button" class="monster-mini__button" onclick="document.getElementById('mini-file-${id}').click()">${model ? 'Replace .glb' : 'Add .glb'}</button>
                    ${model ? `<button type="button" class="monster-mini__button" onclick="${call('preview')}">Preview</button>
                    <button type="button" class="monster-mini__button monster-mini__button--quiet" onclick="${call('remove')}">Remove</button>` : ''}
                </div>
                ${settings ? `<div class="monster-mini__settings">${settings}</div>` : ''}
                <input type="file" id="mini-file-${id}" hidden accept=".glb,model/gltf-binary" onchange="${call('upload', 'this')}">
            </div>`;
    }

    async function upload(monsterId, input) {
        const file = input?.files?.[0];
        if (input) input.value = '';
        const monster = monsterOf(monsterId);
        if (!file || !monster) return;
        let check;
        try {
            const { inspectGlb, describeGlbStats } = await rules();
            check = inspectGlb(await file.arrayBuffer());
            if (!check.ok) { toast(`That model was not accepted: ${check.problems.join(' ')}`, 'error'); return; }
            check.text = describeGlbStats(check.stats);
        } catch (error) {
            toast('The model could not be read.', 'error');
            return;
        }
        const form = new FormData();
        form.append('action', 'upload');
        form.append('model', file);
        try {
            const response = await fetch('upload-model.php', { method: 'POST', body: form, credentials: 'same-origin' });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.success) { toast(`The model was not saved: ${result?.error || response.status}`, 'error'); return; }
            const previous = monster.model && typeof monster.model === 'object' ? monster.model : {};
            monster.model = { file: result.filename, scale: settingValue(previous, 'scale'), yaw: settingValue(previous, 'yaw'), lift: settingValue(previous, 'lift') };
            saveChange(monsterId);
            if (typeof global.refreshMonsterCard === 'function') global.refreshMonsterCard(monsterId);
            toast(`3D mini added (${check.text}).`, 'success');
            preview(monsterId);
        } catch (error) {
            toast('The model could not be uploaded.', 'error');
        }
    }

    function remove(monsterId) {
        const monster = monsterOf(monsterId);
        if (!monster?.model) return;
        delete monster.model;
        saveChange(monsterId);
        if (typeof global.refreshMonsterCard === 'function') global.refreshMonsterCard(monsterId);
        toast('3D mini removed. Tokens made from now on show the picture.', 'info');
    }

    let openPreview = null;
    function set(monsterId, key, raw) {
        const monster = monsterOf(monsterId);
        const setting = SETTINGS[key];
        if (!monster?.model || !setting) return;
        const n = Number(raw);
        monster.model[key] = Number.isFinite(n) ? Math.min(setting.max, Math.max(setting.min, n)) : setting.fallback;
        saveChange(monsterId);
        if (openPreview?.monsterId === monsterId) openPreview.view?.update({ ...monster.model }, footprintOf(monster));
        document.querySelectorAll(`[data-mini-for="${CSS.escape(monsterId)}"] [data-mini-setting="${key}"]`).forEach((input) => { input.value = monster.model[key]; });
    }

    async function preview(monsterId) {
        const monster = monsterOf(monsterId);
        if (!monster?.model) return;
        closePreview();
        const overlay = document.createElement('div');
        overlay.className = 'monster-mini-preview';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', '3D mini preview');
        overlay.innerHTML = `
            <div class="monster-mini-preview__panel">
                <div class="monster-mini-preview__header">
                    <strong>${escapeHtml(monster.name || 'Monster')}: 3D mini</strong>
                    <button type="button" class="monster-mini__button" data-mini-close>Done</button>
                </div>
                <div class="monster-mini-preview__view" data-mini-view><p class="monster-mini-preview__status">Loading…</p></div>
                <div class="monster-mini-preview__settings">${Object.entries(SETTINGS).map(([key, s]) => `
                    <label class="monster-mini__setting" title="${escapeHtml(s.title)}"><span>${escapeHtml(s.label)}</span>
                        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${escapeHtml(settingValue(monster.model, key))}" data-mini-range="${key}">
                    </label>`).join('')}
                </div>
                <p class="monster-mini-preview__hint">Drag to turn, wheel to zoom. The grid is its ${footprintOf(monster)}×${footprintOf(monster)} square${footprintOf(monster) === 1 ? '' : 's'}, as on the board.</p>
            </div>`;
        document.body.append(overlay);
        overlay.querySelector('[data-mini-close]').addEventListener('click', closePreview);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) closePreview(); });
        overlay.querySelectorAll('[data-mini-range]').forEach((range) => range.addEventListener('input', () => set(monsterId, range.dataset.miniRange, range.value)));
        openPreview = { monsterId, overlay, view: null };
        try {
            const { openMiniPreview } = await import(PREVIEW_URL);
            if (openPreview?.overlay !== overlay) return;
            const view = openMiniPreview(overlay.querySelector('[data-mini-view]'), { ...monster.model }, footprintOf(monster));
            openPreview.view = view;
            const status = await view.ready;
            if (status === 'failed') toast('The 3D mini could not be loaded. Try adding the .glb again.', 'error');
        } catch (error) {
            console.error('[Monster Creator] preview', error);
            overlay.querySelector('[data-mini-view]').innerHTML = '<p class="monster-mini-preview__status">The preview could not start in this browser.</p>';
        }
    }

    function closePreview() {
        if (!openPreview) return;
        openPreview.view?.dispose();
        openPreview.overlay.remove();
        openPreview = null;
    }

    global.MonsterMini = Object.freeze({ cardBlock, upload, remove, set, preview, closePreview, footprintOf });
})(typeof window !== 'undefined' ? window : globalThis);
