// Only unsent keyboard inputs live here. A submitted move is always awaited;
// clearing or expiring inputs never cancels, retries or replays that move.
//
// A press does not wait to be SEEN. `show` draws the token on its new square the moment the key
// goes down and hands back what it drew (the squares themselves, not "one to the right"); the move
// is sent when the moves before it have been answered. A press that was shown is never dropped for
// being old or because the selection has moved on: the token already stands there, and what was
// shown is what is sent. Shown presses are thrown away only when a move before them is refused or
// `keepShown` says they no longer apply (the scene was left), and `dropped` then puts the tokens
// back where the server has them.
//
// `show` may decline (null): that press waits unseen, as every press used to, and so does every
// press after it until the unseen ones are done, because each is counted from where the token
// stands when its turn comes. Unseen presses still expire and still go when the selection changes.
export function createKeyboardMovementQueue({
  move, getContext, onError = () => {},
  show = () => null, dropped = () => {}, keepShown = () => true,
  now = () => performance.now(),
  schedule = callback => requestAnimationFrame(callback),
  maxAgeMs = 3000, maxPending = 12,
}) {
  const pending = [];
  let context, running = false, unseenRunning = false;
  const unseenWaiting = () => unseenRunning || pending.some(entry => !entry.step && !entry.task);
  // Throws away the waiting entries `keep` turns down, and says so if any of them had been shown.
  function discard(keep) {
    let shown = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const entry = pending[index];
      if (keep(entry)) continue;
      pending.splice(index, 1);
      if (entry.step || entry.task) shown = true;
      entry.cancel?.();
    }
    if (shown) dropped();
  }
  function clear() { discard(() => false); }
  function syncContext() {
    const next = getContext();
    if (next !== context) {
      discard(entry => Boolean(entry.task) || (Boolean(entry.step) && keepShown(entry.step)));
      context = next;
    }
    const cutoff = now() - maxAgeMs;
    discard(entry => Boolean(entry.task) || Boolean(entry.step) || entry.queuedAt > cutoff);
  }
  function settle() {
    running = false;
    unseenRunning = false;
    syncContext();
    pump();
  }
  function pump() {
    if (running || !pending.length) return;
    running = true;
    schedule(async () => {
      syncContext();
      const next = pending.shift();
      unseenRunning = Boolean(next) && !next.step && !next.task;
      try {
        const result = !next ? null : next.task ? await next.task() : await move(next.delta, next.step ?? null);
        if (result === false) clear();
      } catch (error) {
        clear();
        onError(error);
      } finally {
        settle();
      }
    });
  }
  function enqueue(delta) {
    const x = Number.isFinite(delta?.x) ? Math.trunc(delta.x) : 0;
    const y = Number.isFinite(delta?.y) ? Math.trunc(delta.y) : 0;
    if (!x && !y) return false;
    syncContext();
    if (pending.filter(entry => !entry.task).length >= maxPending) return false;
    const step = unseenWaiting() ? null : show({ x, y }) ?? null;
    pending.push({ delta: { x, y }, queuedAt: now(), step });
    pump();
    return true;
  }
  /**
   * A move made some other way (a drag). With nothing before it, it is made at once, exactly as if
   * this queue were not there; otherwise it takes its turn, so this browser's moves reach the
   * server in the order they were made. Either way presses made before it is answered wait for
   * it, and are thrown away if it is refused: they were shown from where it would have ended.
   * Resolves with what the move resolved with, or false when it was thrown away with the presses
   * before it.
   */
  function follow(task) {
    if (!running && !pending.length) {
      running = true;
      let made;
      try { made = task(); } catch (error) { settle(); throw error; }
      return Promise.resolve(made).then(
        (result) => { if (result === false) clear(); settle(); return result; },
        (error) => { clear(); settle(); throw error; },
      );
    }
    return new Promise((resolve) => {
      pending.push({
        queuedAt: now(), cancel: () => resolve(false),
        task: () => Promise.resolve().then(task).then(
          (result) => { resolve(result); return result; },
          (error) => { resolve(false); throw error; },
        ),
      });
      pump();
    });
  }
  const busy = () => running || pending.length > 0;
  return { enqueue, clear, syncContext, follow, busy };
}
