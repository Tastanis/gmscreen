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

  function getConfirmedSnapshot() {
    return confirmed;
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
    listeners.forEach((listener) => listener(getConfirmedSnapshot(), changeSet));
    return { applied: true, changeSet };
  }

  function commit(nextSnapshot, changeSet) {
    const normalized = {
      revision: normalizeRevision(nextSnapshot?.revision),
      state:
        nextSnapshot?.state && typeof nextSnapshot.state === 'object'
          ? nextSnapshot.state
          : {},
      appliedOperationIds: Array.isArray(nextSnapshot?.appliedOperationIds)
        ? nextSnapshot.appliedOperationIds.slice()
        : [],
    };
    if (normalized.revision !== confirmed.revision + 1) {
      throw new Error('Sync V2 event commits must advance exactly one revision');
    }
    confirmed = normalized;
    listeners.forEach((listener) => listener(getConfirmedSnapshot(), clone(changeSet)));
    return getConfirmedSnapshot();
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
    getConfirmedSnapshot,
    getRevision: () => confirmed.revision,
    replaceSnapshot,
    commit,
    subscribe,
  };
}
