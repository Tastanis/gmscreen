export function connectionLabel({ online = true, lastContact = null, errorStatus = null, failed = false }, now = Date.now()) {
  if (!online) return 'Offline';
  if (errorStatus === 401) return 'Sign in required';
  if (errorStatus === 403) return 'Access denied';
  if (failed) return 'Reconnecting';
  if (lastContact === null) return 'Connecting';
  return now - lastContact > 15000 ? 'Connection unconfirmed' : 'Connected';
}

export function mountConnectionStatus(button, { recover, windowRef = window, now = () => Date.now() } = {}) {
  if (!button) return { update() {} };
  const state = { online: windowRef.navigator.onLine !== false, lastContact: null, errorStatus: null, failed: false };
  let busy = false;
  function render() {
    const label = connectionLabel(state, now());
    if (button.textContent !== label) button.textContent = label;
    const age = state.lastContact === null ? null : Math.max(0, Math.round((now() - state.lastContact) / 1000));
    button.title = `${age === null ? 'No successful server check yet.' : `Last successful server check: ${age} seconds ago.`} Click to check again. This does not retry rejected changes.`;
    button.hidden = label === 'Connected' || label === 'Connecting';
    button.dataset.connection = button.textContent === 'Connected' ? 'connected' : 'attention';
  }
  function browserConnection() { state.online = windowRef.navigator.onLine !== false; render(); }
  windowRef.addEventListener('online', browserConnection);
  windowRef.addEventListener('offline', browserConnection);
  const timer = windowRef.setInterval(render, 5000);
  windowRef.addEventListener('beforeunload', () => windowRef.clearInterval(timer), { once: true });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    try { await recover(); }
    catch (error) { state.failed = true; state.errorStatus = Number(error?.status) || null; }
    finally { busy = false; button.disabled = false; render(); }
  });
  render();
  return { update(name, details) {
    if (name === 'bootstrapSnapshotApplied' || name === 'recoveryCompleted') {
      state.lastContact = now(); state.failed = false; state.errorStatus = null;
    } else if (name === 'recoveryFailed' || name === 'bootstrapFailed') {
      state.failed = true; state.errorStatus = Number(details?.status) || null;
    } else return;
    render();
  } };
}
