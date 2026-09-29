// Only unsent keyboard inputs live here. A submitted move is always awaited;
// clearing or expiring inputs never cancels, retries or replays that move.
export function createKeyboardMovementQueue({
  move, getContext, onError = () => {},
  now = () => performance.now(),
  schedule = callback => requestAnimationFrame(callback),
  maxAgeMs = 3000, maxPending = 12,
}) {
  const pending = [];
  let context, running = false;
  function clear() { pending.length = 0; }
  function syncContext() {
    const next = getContext();
    if (next !== context) { clear(); context = next; }
    const cutoff = now() - maxAgeMs;
    while (pending.length && pending[0].queuedAt <= cutoff) pending.shift();
  }
  function pump() {
    if (running || !pending.length) return;
    running = true;
    schedule(async () => {
      syncContext();
      const next = pending.shift();
      try {
        if (next && await move(next.delta) === false) clear();
      } catch (error) {
        clear();
        onError(error);
      } finally {
        running = false;
        syncContext();
        pump();
      }
    });
  }
  function enqueue(delta) {
    const x = Number.isFinite(delta?.x) ? Math.trunc(delta.x) : 0;
    const y = Number.isFinite(delta?.y) ? Math.trunc(delta.y) : 0;
    if (!x && !y) return false;
    syncContext();
    if (pending.length >= maxPending) return false;
    pending.push({ delta: { x, y }, queuedAt: now() });
    pump();
    return true;
  }
  return { enqueue, clear, syncContext };
}
