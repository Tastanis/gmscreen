// Live editing between people (October 2026, approved by the Director), the page's side. The server's side is
// SheetLive in character_sheet/SheetChanges.php.
//
// - Poll: every ~1.6 s the page asks handler.php?action=live for the hero's revision and the field locks (one small
//   file on the server). When the revision moves, the page reloads the sheet. When the chat's Pusher is set up, a
//   "sheet-updated" notice makes the page ask at once; the poll works alone without it.
// - Locks: while a person edits a field (a form open, an input focused) the page holds a lock on it: taken on open,
//   renewed by a heartbeat every 8 s while the person is active, released on close/blur. The server lets a lock
//   lapse 20 s after its last heartbeat (a closed tab, a sleeping laptop, two minutes idle).

export const POLL_MS = 1600;
export const HEARTBEAT_MS = 8000;
export const IDLE_MS = 120000;

const overlaps = (a, b) => a === b || a.startsWith(b + '.') || b.startsWith(a + '.');

export function createSheetLive({
  character,
  endpoint = '/dnd/character_sheet/handler.php',
  fetchImpl = (...args) => globalThis.fetch(...args),
  pollMs = POLL_MS,
  heartbeatMs = HEARTBEAT_MS,
  idleMs = IDLE_MS,
  now = () => Date.now(),
  timers = (() => { const w = typeof window !== 'undefined' ? window : globalThis; return { set: (fn, ms) => w.setTimeout(fn, ms), clear: (id) => w.clearTimeout(id), every: (fn, ms) => w.setInterval(fn, ms), stop: (id) => w.clearInterval(id) }; })(),
  onRevision = () => {},
  onLocks = () => {},
  onLockLost = () => {},
  isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
} = {}) {
  let revision = null;
  let locks = [];
  let pollTimer = null;
  let polling = false;
  let lastActivity = now();
  const held = new Map();          // field -> heartbeat timer
  let heartbeatTimer = null;

  const url = (params) => {
    const u = new URL(endpoint, typeof location !== 'undefined' ? location.href : 'http://localhost/');
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  };
  const post = async (action, fields = {}) => {
    const body = new URLSearchParams({ action, character, ...fields });
    const response = await fetchImpl(endpoint, { method: 'POST', body, credentials: 'same-origin' });
    return response.json().catch(() => ({ success: false }));
  };

  async function poll() {
    if (polling || isHidden()) return null;
    polling = true;
    try {
      const response = await fetchImpl(url({ action: 'live', character }), { credentials: 'same-origin', cache: 'no-store' });
      const answer = await response.json();
      if (!answer?.success) return null;
      const before = revision;
      locks = Array.isArray(answer.locks) ? answer.locks : [];
      onLocks(locks);
      if (Number.isFinite(answer.revision) && answer.revision !== before) {
        if (before !== null) await onRevision(answer.revision, before);
        else revision = answer.revision;
      }
      return answer;
    } catch (_) {
      return null;
    } finally {
      polling = false;
    }
  }

  function start() {
    if (pollTimer) return;
    pollTimer = timers.every(poll, pollMs);
    poll();
    listenForPusher();
  }

  function stop() {
    if (pollTimer) timers.stop(pollTimer);
    pollTimer = null;
    releaseAll();
  }

  /** Someone else's name on a lock that covers this path (or ''). */
  function lockOf(path) {
    const found = locks.find((lock) => !lock.mine && overlaps(String(lock.field), String(path)));
    return found ? String(found.name || found.user || 'Someone') : '';
  }

  function touch() { lastActivity = now(); }

  function ensureHeartbeat() {
    if (heartbeatTimer || !held.size) return;
    heartbeatTimer = timers.every(async () => {
      if (!held.size) { timers.stop(heartbeatTimer); heartbeatTimer = null; return; }
      if (now() - lastActivity > idleMs) return;          // idle: let the server's 20 s run out
      for (const field of [...held.keys()]) {
        const answer = await post('heartbeat', { field }).catch(() => null);
        if (answer && answer.locked === false) { held.delete(field); onLockLost(field, answer.holder || null); }
      }
    }, heartbeatMs);
  }

  /** Takes every field's lock, or none: answers {ok: true} or {ok: false, holder, field}. */
  async function acquire(fields) {
    const list = [...new Set((Array.isArray(fields) ? fields : [fields]).filter(Boolean))];
    const taken = [];
    for (const field of list) {
      const other = lockOf(field);
      const answer = other ? { locked: false, holder: { name: other } } : await post('lock', { field }).catch(() => ({ locked: false, holder: null, error: 'No answer' }));
      if (!answer || answer.locked !== true) {
        await release(taken);
        return { ok: false, field, holder: answer?.holder || null, error: answer?.error || '' };
      }
      held.set(field, true);
      taken.push(field);
    }
    touch();
    ensureHeartbeat();
    return { ok: true };
  }

  async function release(fields) {
    const list = Array.isArray(fields) ? fields : [fields];
    await Promise.all(list.filter((field) => held.has(field)).map((field) => { held.delete(field); return post('unlock', { field }).catch(() => null); }));
  }

  function releaseAll({ beacon = false } = {}) {
    const fields = [...held.keys()];
    held.clear();
    if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      fields.forEach((field) => navigator.sendBeacon(endpoint, new URLSearchParams({ action: 'unlock', character, field })));
      return Promise.resolve();
    }
    return Promise.all(fields.map((field) => post('unlock', { field }).catch(() => null)));
  }

  function listenForPusher() {
    try {
      const config = typeof window !== 'undefined' ? window.chatPusherConfig : null;
      if (!config?.key || !config?.channel || typeof window.Pusher !== 'function') return;
      window.__sheetPusher ||= new window.Pusher(config.key, { cluster: config.cluster || 'us3', forceTLS: true, disableStats: true });
      const channel = window.__sheetPusher.subscribe(config.channel);
      channel.bind('sheet-updated', (data) => {
        const revisions = data?.revisions || {};
        if (!Object.prototype.hasOwnProperty.call(revisions, character)) return;
        if (revisions[character] !== revision) poll();
      });
    } catch (_) { /* polling alone */ }
  }

  return {
    start, stop, poll, lockOf, acquire, release, releaseAll, touch,
    get revision() { return revision; },
    set revision(value) { if (Number.isFinite(value)) revision = value; },
    get locks() { return locks; },
    held: () => [...held.keys()],
  };
}
