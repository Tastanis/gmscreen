// Scene switching and viewer routing: which commands to send, and with which values.
//
// The board used to remember only THAT a routing field needed saving and read its value from
// local state when the save ran. A server reply can overwrite local state in between, so a
// stale value could be sent back as if the user had chosen it: "scene B with scene A's map".
// Here the value the user meant is captured when the change is made and is the only value sent.

/** Fields of the routing record a client may set. */
export const ROUTING_FIELDS = Object.freeze(['mapUrl', 'playerMapDisabled', 'playerActiveSceneId', 'playerMapUrl', 'playerThumbnailUrl']);

/** The values the user meant to save, by field, each stamped so a newer change is never cleared by an older save. */
export function createRoutingIntent() {
  const values = new Map();
  let stamp = 0;
  return {
    /** Remember `value` as what `field` should be saved as. */
    mark(field, value) {
      if (typeof field !== 'string' || !field) return;
      values.set(field, { value: value ?? null, stamp: ++stamp });
    },
    has: (field) => values.has(field),
    get: (field) => values.get(field)?.value ?? null,
    stampOf: (field) => values.get(field)?.stamp ?? 0,
    /** Forget a field once it is saved, unless the user changed it again after `sentStamp`. */
    settle(field, sentStamp) {
      const entry = values.get(field);
      if (entry && entry.stamp <= sentStamp) values.delete(field);
      return !values.has(field);
    },
    clear: () => values.clear(),
    get size() { return values.size; },
    fields: () => [...values.keys()],
  };
}

/**
 * Commands for the pending scene and routing changes.
 * A scene switch travels as ONE command carrying the scene's own map picture, so the server never
 * holds, and never echoes, the new scene with the previous scene's picture.
 * Returns [{command, settles: [[field, stamp], ...]}].
 */
export function deriveRoutingCommands(intent, { scenesEnabled = true, routingEnabled = true } = {}) {
  const out = [];
  const carried = new Set();
  const sceneId = intent.has('activeSceneId') ? intent.get('activeSceneId') : undefined;
  if (scenesEnabled && sceneId) {
    const settles = [['activeSceneId', intent.stampOf('activeSceneId')]];
    const payload = {};
    if (intent.has('mapUrl')) {
      payload.mapUrl = intent.get('mapUrl');
      settles.push(['mapUrl', intent.stampOf('mapUrl')]);
      carried.add('mapUrl');
    }
    out.push({ command: { type: 'scene.activate', sceneId, payload }, settles });
  }
  if (routingEnabled) {
    const routing = {};
    const settles = [];
    for (const field of ROUTING_FIELDS) {
      if (!intent.has(field) || carried.has(field)) continue;
      routing[field] = intent.get(field);
      settles.push([field, intent.stampOf(field)]);
    }
    if (intent.has('activeSceneId') && !sceneId) {
      routing.activeSceneId = null;
      settles.push(['activeSceneId', intent.stampOf('activeSceneId')]);
    }
    if (settles.length) out.push({ command: { type: 'routing.set', sceneId: null, payload: { routing } }, settles });
  }
  return out;
}

/**
 * The picture the active scene should have, when the saved routing disagrees with the scene's own
 * record. Null when nothing needs repair. Only the GM repairs, and only for a scene that exists
 * in the scene list and has a picture of its own.
 */
export function activeSceneMapRepair({ isGM = false, activeSceneId = null, mapUrl = null, scenes = [] } = {}) {
  if (!isGM || !activeSceneId) return null;
  const scene = (Array.isArray(scenes) ? scenes : []).find((item) => item?.id === activeSceneId);
  const own = typeof scene?.mapUrl === 'string' && scene.mapUrl ? scene.mapUrl : null;
  return own && own !== mapUrl ? { sceneId: activeSceneId, mapUrl: own } : null;
}

/** Runs tasks one at a time, in order. A task that hangs past `stallMs` no longer holds up the rest. */
export function createSerialQueue({ stallMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const run = tail.then(() => task());
    const settled = run.then(() => {}, () => {});
    tail = new Promise((resolve) => {
      const timer = setTimer(resolve, stallMs);
      settled.then(() => { clearTimer(timer); resolve(); });
    });
    return run;
  };
}
