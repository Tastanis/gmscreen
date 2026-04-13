/**
 * Phase 3-C: Client-side delta op applier.
 *
 * Mirrors `applyBoardStateOp()` in `dnd/vtt/api/state.php` so a Pusher
 * broadcast carrying `{type: 'ops', ops: [...]}` can be applied to the
 * local board state without re-fetching the full state from
 * `api/state.php`.
 *
 * Each function mutates the passed-in `boardState` object in place. The
 * caller is expected to wrap calls in `boardApi.updateState((draft) => …)`
 * (which uses Immer-style mutation under the hood) so the mutations
 * become a single committed state transition.
 *
 * Op shapes:
 *   { type: 'placement.move',   sceneId, placementId, x, y }
 *   { type: 'placement.add',    sceneId, placement: { id, ... } }
 *   { type: 'placement.remove', sceneId, placementId }
 *   { type: 'placement.update', sceneId, placementId, patch: { ... } }
 *   { type: 'template.upsert',  sceneId, template: { id, ... } }
 *   { type: 'template.remove',  sceneId, templateId }
 *   { type: 'drawing.add',      sceneId, drawing:  { id, ... } }
 *   { type: 'drawing.remove',   sceneId, drawingId }
 *
 * Unknown or malformed ops are silently ignored — the function returns
 * the boardState unchanged for that op. This matches the server's
 * tolerance for ops it can't apply and protects clients on older
 * builds from getting stuck on a payload they don't understand.
 */

/**
 * Apply a single op to a board state object in place.
 *
 * @param {object} boardState - Mutable board state object (the `boardState`
 *   slice of the store, not the wrapping container).
 * @param {object} op - The op to apply.
 * @returns {boolean} True if the op caused a state change, false otherwise.
 */
export function applyBoardStateOpLocally(boardState, op) {
  if (!boardState || typeof boardState !== 'object') {
    return false;
  }
  if (!op || typeof op !== 'object') {
    return false;
  }
  const type = typeof op.type === 'string' ? op.type : '';
  if (!type) {
    return false;
  }
  const sceneId = extractSceneId(op);
  if (!sceneId) {
    return false;
  }

  if (type === 'placement.move') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const x = Number(op.x);
    const y = Number(op.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.id !== placementId) continue;
      // The wire format uses x/y for coordinates, but the canonical
      // placement record stores column/row. Mirror the server.
      entry.column = x;
      entry.row = y;
      // The server stamps `_lastModified` so timestamp-based merges
      // downstream treat the move as newer than any in-flight stale
      // payload. Mirror that locally too — without it, a polling
      // response that arrived just before this Pusher broadcast could
      // win the timestamp tie and snap the token back.
      entry._lastModified = Date.now();
      return true;
    }
    return false;
  }

  if (type === 'placement.add') {
    if (!op.placement || typeof op.placement !== 'object') return false;
    const placementId = entryId(op.placement);
    if (!placementId) return false;
    if (!boardState.placements || typeof boardState.placements !== 'object') {
      boardState.placements = {};
    }
    if (!Array.isArray(boardState.placements[sceneId])) {
      boardState.placements[sceneId] = [];
    }
    // Clone to avoid sharing the broadcast object across the store.
    const next = { ...op.placement, _lastModified: Date.now() };
    const list = boardState.placements[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === placementId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'placement.remove') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== placementId;
    });
    if (filtered.length === list.length) return false;
    boardState.placements[sceneId] = filtered;
    return true;
  }

  if (type === 'placement.update') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    if (!op.patch || typeof op.patch !== 'object') return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entryId(entry) !== placementId) continue;
      // Shallow merge — never overwrite the id. A null value signals
      // that the property was deleted on the source client (e.g. the
      // last condition was removed from a token), so delete locally.
      for (const key of Object.keys(op.patch)) {
        if (key === 'id') continue;
        if (op.patch[key] === null) {
          delete entry[key];
        } else {
          entry[key] = op.patch[key];
        }
      }
      entry._lastModified = Date.now();
      return true;
    }
    return false;
  }

  if (type === 'template.upsert') {
    if (!op.template || typeof op.template !== 'object') return false;
    const templateId = entryId(op.template);
    if (!templateId) return false;
    if (!boardState.templates || typeof boardState.templates !== 'object') {
      boardState.templates = {};
    }
    if (!Array.isArray(boardState.templates[sceneId])) {
      boardState.templates[sceneId] = [];
    }
    const next = { ...op.template, _lastModified: Date.now() };
    const list = boardState.templates[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === templateId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'template.remove') {
    const templateId = extractOpEntityId(op, 'templateId');
    if (!templateId) return false;
    const list = boardState?.templates?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== templateId;
    });
    if (filtered.length === list.length) return false;
    boardState.templates[sceneId] = filtered;
    return true;
  }

  if (type === 'drawing.add') {
    if (!op.drawing || typeof op.drawing !== 'object') return false;
    const drawingId = entryId(op.drawing);
    if (!drawingId) return false;
    if (!boardState.drawings || typeof boardState.drawings !== 'object') {
      boardState.drawings = {};
    }
    if (!Array.isArray(boardState.drawings[sceneId])) {
      boardState.drawings[sceneId] = [];
    }
    const next = { ...op.drawing, _lastModified: Date.now() };
    const list = boardState.drawings[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === drawingId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'drawing.remove') {
    const drawingId = extractOpEntityId(op, 'drawingId');
    if (!drawingId) return false;
    const list = boardState?.drawings?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== drawingId;
    });
    if (filtered.length === list.length) return false;
    boardState.drawings[sceneId] = filtered;
    return true;
  }

  // Unknown op type — ignored so the client tolerates payloads from
  // newer servers without crashing.
  return false;
}

/**
 * Apply a list of ops to a board state in order. Returns the count of
 * ops that actually mutated state. Stops if any op throws (it
 * shouldn't, but if it does the partial application would leave the
 * state inconsistent and the caller should resync).
 *
 * @param {object} boardState
 * @param {Array<object>} ops
 * @returns {number}
 */
export function applyBoardStateOpsLocally(boardState, ops) {
  if (!Array.isArray(ops) || ops.length === 0) return 0;
  let mutated = 0;
  for (const op of ops) {
    if (applyBoardStateOpLocally(boardState, op)) {
      mutated++;
    }
  }
  return mutated;
}

function extractSceneId(op) {
  const raw = op.sceneId;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  return '';
}

function extractOpEntityId(op, field) {
  const raw = op[field];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}

function entryId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const raw = entry.id;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}
