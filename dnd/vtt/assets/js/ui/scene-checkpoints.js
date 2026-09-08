export function mountSceneCheckpoints(root, store) {
  if (!root) return;
  const endpoint = '/dnd/vtt/api/v2/checkpoints.php';
  const name = root.querySelector('[data-checkpoint-name]');
  const label = root.querySelector('[data-checkpoint-scene]');
  const status = root.querySelector('[data-checkpoint-status]');
  const list = root.querySelector('[data-checkpoint-list]');
  const create = root.querySelector('[data-checkpoint-create]');
  let sceneId = null, busy = false, loadSequence = 0, pendingCapture = null;
  function controls() {
    root.querySelectorAll('button').forEach(button => { button.disabled = busy || !sceneId || button.dataset.unavailable === 'true'; });
    name.disabled = busy || !sceneId;
  }
  function message(text) { status.textContent = text; }
  async function api(suffix = '', options = {}) {
    const response = await fetch(endpoint + suffix, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw Error(data.error || `Checkpoint request failed (${response.status}).`);
    return data;
  }
  async function refresh() {
    const requestedScene = sceneId, sequence = ++loadSequence;
    if (!requestedScene) { list.replaceChildren(); return; }
    try {
      const data = await api('?sceneId=' + encodeURIComponent(requestedScene));
      if (sceneId !== requestedScene || sequence !== loadSequence) return;
      list.replaceChildren();
      if (!data.checkpoints.length) {
        const empty = document.createElement('li'); empty.textContent = 'No checkpoints for this scene yet.'; list.append(empty);
      }
      for (const checkpoint of data.checkpoints) {
        const row = document.createElement('li'); row.dataset.checkpointId = checkpoint.id;
        const title = document.createElement('strong'); title.textContent = checkpoint.name;
        const meta = document.createElement('small');
        meta.textContent = `${new Date(checkpoint.createdAt).toLocaleString()} · revision ${checkpoint.revision}`;
        const actions = document.createElement('div'); actions.className = 'vtt-checkpoints__actions';
        for (const [text, action] of [['Preview positions', () => preview(checkpoint, row)], ['Preview layout', () => preview(checkpoint, row, 'layout')], ['Download', () => download(checkpoint)], ['Delete', () => remove(checkpoint)]]) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = text;
          button.addEventListener('click', action); actions.append(button);
        }
        row.append(title, meta, actions); list.append(row);
      }
      controls();
    } catch (error) { if (sequence === loadSequence) message(error.message); }
  }
  async function perform(action) {
    if (busy) return;
    busy = true; controls();
    try { await action(); } catch (error) { message(error.message || 'Checkpoint request could not be confirmed.'); }
    finally { busy = false; controls(); }
  }
  async function download(checkpoint) {
    await perform(async () => {
      const data = await api('?id=' + encodeURIComponent(checkpoint.id));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.checkpoint, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `scene-checkpoint-${checkpoint.id}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(`Downloaded ${checkpoint.name}.`);
    });
  }
  async function preview(checkpoint, row, restoreScope = 'positions') {
    await perform(async () => {
      const layout = restoreScope === 'layout';
      const { preview } = await api('?id=' + encodeURIComponent(checkpoint.id) + '&preview=' + restoreScope);
      row.querySelector('[data-checkpoint-preview]')?.remove();
      const panel = document.createElement('div'); panel.dataset.checkpointPreview = '';
      const scope = document.createElement('p');
      scope.textContent = layout
        ? `Scene layout: ${preview.savedFloorCount} floors, ${preview.changes.length} token moves. ${preview.newerTokensPreserved} newer tokens are retained; any necessary relocations are listed below. Current stamina, conditions and turns are preserved. Deleted tokens, character sheets and base-map/catalog metadata are not restored.`
        : `Positions and floors only: ${preview.changes.length} tokens would move, ${preview.unchanged} unchanged, ${preview.skipped.length} skipped. ${preview.newerTokensPreserved} newer tokens stay in place. Stamina, conditions, turns, and scene geometry stay as they are.`;
      panel.append(scope);
      if (layout) {
        const geometry=document.createElement('p'); geometry.textContent=`Geometry changes: ${preview.geometryFields.join(', ') || 'none'}.`; panel.append(geometry);
        for(const domain of ['drawings','templates']) {
          const counts=preview.content[domain]; const summary=document.createElement('p');
          summary.textContent=`${domain}: ${counts.added} restored, ${counts.removed} newer entries removed, ${counts.updated} changed.`; panel.append(summary);
        }
        for(const view of preview.viewerChanges) {const text=document.createElement('p');text.textContent=`${view.userId}'s view: ${view.from ?? 'default'} → ${view.to}`;panel.append(text);}
      }
      if (preview.geometryChanged) {
        const warning = document.createElement('p'); warning.textContent = 'The grid or floor layout has changed since this checkpoint. Review destinations against the current map.'; panel.append(warning);
      }
      const details = document.createElement('ul'); details.className = 'vtt-checkpoints__preview';
      for (const change of preview.changes) {
        const item = document.createElement('li');
        item.textContent = `${change.name}: (${change.from?.column ?? '?'}, ${change.from?.row ?? '?'}) ${change.from?.levelId ?? '?'} → (${change.to.column}, ${change.to.row}) ${change.to.levelId}`;
        if(layout)item.textContent+=` — ${change.reason}${change.newer ? ' (newer token)' : ''}`;
        details.append(item);
      }
      for (const skipped of preview.skipped) { const item = document.createElement('li'); item.textContent = `${skipped.name}: ${skipped.reason}.`; details.append(item); }
      const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn';
      apply.textContent = layout ? 'Restore this layout' : 'Restore these positions'; apply.dataset.unavailable = String(layout ? !preview.hasChanges : !preview.changes.length);
      apply.addEventListener('click', () => perform(async () => {
        const text = layout
          ? `Restore the previewed floors, grid, fog, drawings, templates and ${preview.changes.length} token positions? Newer drawings/templates may be removed. Newer tokens remain, with the listed relocations. Current stamina, conditions and turns are preserved. Base-map/catalog metadata and character sheets are not restored.`
          : `Move ${preview.changes.length} tokens to their checkpoint positions and floors? ${preview.skipped.length} skipped tokens and ${preview.newerTokensPreserved} newer tokens stay in place. Stamina, conditions, turns, and scene geometry are not restored.${preview.geometryChanged ? ' The grid or floor layout has changed; verify the destinations in the preview.' : ''}`;
        const confirmed = window.UIKit
          ? await window.UIKit.confirm({ title: layout ? 'Restore checkpoint layout' : 'Restore checkpoint positions', message: text, confirmText: layout ? 'Restore layout' : 'Restore positions' })
          : window.confirm(text);
        if (!confirmed) return;
        message(layout ? 'Restoring layout…' : 'Restoring positions…');
        try {
          await (layout ? store.restoreCheckpointLayout : store.restoreCheckpointPositions)(checkpoint.id, preview.baseRevision, preview.sceneId);
          apply.dataset.unavailable = 'true';
          message(layout ? 'Restored scene layout. Preview again to review the current board.' : `Restored ${preview.changes.length} token positions. Preview again to review the current board.`);
        } catch (error) {
          if (error?.status === 409) {
            apply.dataset.unavailable = 'true';
            throw Error(`The board changed after this preview. Preview ${restoreScope} again before restoring.`);
          }
          throw error;
        }
      }));
      panel.append(details, apply); row.append(panel);
      message(`Preview from revision ${preview.baseRevision}. No changes applied.`);
    });
  }
  async function remove(checkpoint) {
    if (busy) return;
    const confirmed = window.UIKit
      ? await window.UIKit.confirm({ title: 'Delete checkpoint', message: `Delete “${checkpoint.name}” from the archive? The board is unaffected.`, confirmText: 'Delete checkpoint' })
      : window.confirm(`Delete checkpoint “${checkpoint.name}”? The board is unaffected.`);
    if (!confirmed) return;
    await perform(async () => {
      await api('', { method: 'DELETE', body: JSON.stringify({ id: checkpoint.id }) });
      message('Checkpoint deleted.'); await refresh();
    });
  }
  create.addEventListener('click', () => {
    if (!name.value.trim()) { message('Give this checkpoint a name.'); name.focus(); return; }
    return perform(async () => {
    const requestedName = name.value.trim(), requestedScene = sceneId;
    if (!requestedName) { message('Give this checkpoint a name.'); name.focus(); return; }
    const signature = JSON.stringify([requestedScene, requestedName]);
    if (pendingCapture?.signature !== signature) pendingCapture = { signature, id: crypto.randomUUID() };
    message('Saving checkpoint…');
    const data = await api('', { method: 'POST', body: JSON.stringify({ id: pendingCapture.id, name: requestedName, sceneId: requestedScene }) });
    pendingCapture = null;
    message(`Saved “${data.checkpoint.name}” at revision ${data.checkpoint.revision}.`);
    if (sceneId === requestedScene) await refresh();
    });
  });
  root.querySelector('[data-checkpoint-refresh]').addEventListener('click', refresh);
  root.addEventListener('toggle', () => { if (root.open) refresh(); });
  function updateScene(state = {}) {
    const next = state.boardState?.activeSceneId || null;
    if (next === sceneId) return;
    sceneId = next; loadSequence++;
    const scenes = state.scenes?.items || [];
    label.textContent = next ? `Current scene: ${scenes.find(scene => scene.id === next)?.name || next}` : 'Open a scene to save a checkpoint.';
    list.replaceChildren(); message(''); controls();
    if (root.open) refresh();
  }
  updateScene(store.getState?.()); controls();
  store.subscribe?.(updateScene);
}
