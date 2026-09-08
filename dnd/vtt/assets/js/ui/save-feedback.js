export function describeSaveFailure(error, source = 'change') {
  const status = Number(error?.status) || 0;
  const rawReason = String(error?.message || error?.reason || '').trim();
  const reason = rawReason === 'checkpoint_preview_stale'
    ? 'The board changed after the preview. Create a fresh checkpoint preview before restoring.' : rawReason;
  if (status === 401) return `${source}: sign in again. ${reason}`.trim();
  if (status >= 400 && status < 500 && ![408, 429].includes(status)) {
    return `${source} rejected: ${reason || `HTTP ${status}`}`;
  }
  return `${source}: acceptance is unconfirmed. ${reason || 'Check your connection and refresh to reconcile the board.'}`;
}

function actionLabel(type = 'Change') {
  return ({ 'token.move': 'Token movement', 'placement.batch': 'Token changes', 'checkpoint.restorePositions': 'Checkpoint position restore', 'checkpoint.restoreLayout': 'Checkpoint layout restore',
    'drawing.upsert': 'Drawing', 'drawing.remove': 'Drawing removal',
    'template.upsert': 'Template', 'template.remove': 'Template removal',
    'level.user.set': 'Viewed floor', 'level.config.set': 'Floor configuration', 'level.delete': 'Floor deletion',
    'combat.transition': 'Combat action' })[type] || String(type).replaceAll('.', ' ');
}

export function createSaveFeedbackState() {
  const pending = new Map(), failures = new Map();
  let lastAccepted = '';
  return {
    update(entry) {
      const id = entry.operationId;
      if (entry.status === 'sending') pending.set(id, entry);
      else {
        pending.delete(id);
        if (entry.status === 'accepted') { failures.delete(id); lastAccepted = entry.type; }
        else failures.set(id, entry);
      }
      while (failures.size > 20) failures.delete(failures.keys().next().value);
    },
    dismiss() { failures.clear(); },
    snapshot: () => ({ pending: [...pending.values()], failures: [...failures.values()], lastAccepted }),
  };
}

export function mountSaveFeedback(root) {
  const state = createSaveFeedbackState();
  if (!root) return { update() {}, report() {} };
  const summary = root.querySelector('summary'), list = root.querySelector('[data-save-feedback-list]');
  root.addEventListener('toggle', () => {
    if (!root.open) return;
    const navigation = root.closest('[data-map-navigation-root]');
    const help = navigation?.querySelector('[data-navigation-help]');
    if (help) help.hidden = true;
    navigation?.querySelector('[data-map-navigation="help"]')?.setAttribute('aria-expanded', 'false');
  });
  function render() {
    const snapshot = state.snapshot();
    summary.textContent = snapshot.pending.length ? `Saving ${snapshot.pending.length}…`
      : snapshot.failures.length ? `${snapshot.failures.length} save issue${snapshot.failures.length === 1 ? '' : 's'}` : 'Save status';
    list.replaceChildren();
    for (const entry of snapshot.failures) {
      const item = document.createElement('p');
      item.textContent = describeSaveFailure({ status: entry.httpStatus, reason: entry.reason }, actionLabel(entry.type));
      list.append(item);
    }
    const accepted = document.createElement('p');
    accepted.textContent = snapshot.lastAccepted ? `Last accepted change: ${actionLabel(snapshot.lastAccepted)}.`
      : 'No changes submitted in this tab yet.';
    list.append(accepted);
    root.dataset.hasFailure = String(snapshot.failures.length > 0);
    if (snapshot.failures.length) root.open = true;
  }
  root.querySelector('[data-dismiss-save-issues]').addEventListener('click', () => { state.dismiss(); render(); root.open = false; });
  render();
  return {
    update(entry) { state.update(entry); render(); },
    report(error, source) {
      if (error?.operationId) return;
      state.update({ operationId: `local:${source}`, type: source, status: 'failed', httpStatus: error?.status, reason: error?.message });
      render();
    },
  };
}
