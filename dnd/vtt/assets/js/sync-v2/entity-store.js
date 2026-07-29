function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function normalizeEntitySnapshot(snapshot = {}) {
  const state = snapshot?.state && typeof snapshot.state === 'object' ? snapshot.state : {};
  return {
    revision: normalizeRevision(snapshot?.revision),
    state: clone(state),
    appliedOperationIds: Array.isArray(snapshot?.appliedOperationIds)
      ? snapshot.appliedOperationIds.filter((value) => typeof value === 'string')
      : [],
  };
}

export function createEntityStore(initialSnapshot = {}) {
  let confirmed = normalizeEntitySnapshot(initialSnapshot);
  const listeners = new Set();

  function getSnapshot() {
    return clone(confirmed);
  }

  function replaceSnapshot(snapshot, metadata = {}) {
    const incoming = normalizeEntitySnapshot(snapshot);
    if (incoming.revision < confirmed.revision) {
      return {
        applied: false,
        reason: 'revision_decrease',
        revision: confirmed.revision,
      };
    }
    confirmed = incoming;
    const changeSet = {
      revision: confirmed.revision,
      snapshot: true,
      source: metadata.source ?? 'snapshot',
    };
    listeners.forEach((listener) => listener(getSnapshot(), changeSet));
    return { applied: true, changeSet };
  }

  function commit(nextSnapshot, changeSet) {
    const normalized = normalizeEntitySnapshot(nextSnapshot);
    if (normalized.revision < confirmed.revision) {
      throw new Error('Sync V2 store revisions cannot decrease');
    }
    confirmed = normalized;
    listeners.forEach((listener) => listener(getSnapshot(), clone(changeSet)));
    return getSnapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Sync V2 store listener must be a function');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getSnapshot,
    getRevision: () => confirmed.revision,
    replaceSnapshot,
    commit,
    subscribe,
  };
}
