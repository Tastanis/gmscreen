// One redraw of the drag ruler asks for the same walk and the same ground heights several times
// over: for the cost, the line, its colours and each red stretch. Inside a pass each answer is
// worked out once and reused. Nothing on the board changes during a pass (it is one synchronous
// redraw), so the answers are exactly the ones that were computed before; outside a pass nothing
// is remembered at all.

/** Everything about a token that the height it stands at can depend on. */
export const passActorKey = (actor) => (actor
  ? [actor.id, actor.column, actor.row, actor.width, actor.height, actor.levelId, actor.movementMode, actor.flightHeight,
    actor._supportSurfaceId, actor._floorTraversal ? JSON.stringify(actor._floorTraversal) : ''].join('|')
  : '');

export function createRulerPass() {
  let cache = null;
  const remember = (store, key, compute) => {
    if (!cache) return compute();
    if (cache[store].has(key)) return cache[store].get(key);
    const value = compute();
    cache[store].set(key, value);
    return value;
  };
  return {
    /** Runs one redraw. A pass inside a pass is the same pass. */
    run(redraw) {
      if (cache) return redraw();
      cache = { ground: new Map(), routes: new Map() };
      try { return redraw(); } finally { cache = null; }
    },
    get active() { return cache !== null; },
    ground: (key, compute) => remember('ground', key, compute),
    route: (key, compute) => remember('routes', key, compute),
  };
}
