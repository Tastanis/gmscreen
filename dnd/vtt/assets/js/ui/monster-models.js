// The Director's browser keeps each monster's 3D mini (docs/vtt-3d-minis.md) as the Monster
// Creator has it now, so a token dragged onto the board, or switched to its mini from its
// settings, takes the monster's current model even when the token was made before the model was.
// Only the GM can read monster records; players get the model on the placement itself.
import { storedMiniModel } from './mini-model.js';

let modelsById = new Map();
let loadedAt = 0;
let pending = null;

/** Reads every monster's model from the monster list. Quietly keeps what it had if that fails. */
export function loadMonsterModels(endpoint, { fetchImpl = globalThis.fetch, maxAgeMs = 20000, now = Date.now() } = {}) {
  if (typeof endpoint !== 'string' || !endpoint || typeof fetchImpl !== 'function') return Promise.resolve(modelsById);
  if (pending) return pending;
  if (loadedAt && now - loadedAt < maxAgeMs) return Promise.resolve(modelsById);
  pending = Promise.resolve()
    .then(() => fetchImpl(endpoint, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' }))
    .then((response) => (response?.ok ? response.json() : null))
    .then((payload) => {
      if (!Array.isArray(payload?.data)) return modelsById;
      const next = new Map();
      for (const monster of payload.data) {
        const id = typeof monster?.id === 'string' ? monster.id.trim() : '';
        const model = storedMiniModel(monster?.model);
        if (id && model) next.set(id, model);
      }
      modelsById = next;
      loadedAt = Date.now();
      return modelsById;
    })
    .catch(() => modelsById)
    .finally(() => { pending = null; });
  return pending;
}

/** The monster's model as last read, or null. */
export function monsterModelFor(monsterId) {
  const id = typeof monsterId === 'string' ? monsterId.trim() : '';
  const model = id ? modelsById.get(id) : null;
  return model ? { ...model } : null;
}

/** For tests. */
export function resetMonsterModels() { modelsById = new Map(); loadedAt = 0; pending = null; }
