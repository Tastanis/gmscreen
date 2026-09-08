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
    root.querySelectorAll('button').forEach(button => { button.disabled = busy || !sceneId; });
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
        for (const [text, action] of [['Download', () => download(checkpoint)], ['Delete', () => remove(checkpoint)]]) {
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
