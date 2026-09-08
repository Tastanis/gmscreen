let activeJournal = null;
export const getCharacterOperationJournal = () => activeJournal;

export function createCharacterOperationJournal(storage, actorId, notify = () => {}) {
  const prefix = `vtt.character-operation.${encodeURIComponent(actorId)}.`;
  const key = id => prefix + id;
  const read = id => JSON.parse(storage.getItem(key(id)) || 'null');
  return {
    list() {
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (name?.startsWith(prefix)) entries.push(JSON.parse(storage.getItem(name)));
      }
      return entries.filter(Boolean).sort((a,b) => a.createdAt - b.createdAt);
    },
    begin(entry) {
      // Separate keys prevent simultaneous tabs from overwriting each other's attempts.
      if (!read(entry.operationId)) storage.setItem(key(entry.operationId), JSON.stringify({...entry, actorId, createdAt:Date.now(), status:'pending'}));
      notify();
    },
    fail(id, reason) {
      const entry = read(id);
      if (entry) storage.setItem(key(id), JSON.stringify({...entry, status:'unconfirmed', reason}));
      notify();
    },
    complete(id) { storage.removeItem(key(id)); notify(); },
  };
}

export function configureCharacterOperationJournal(actorId) {
  if (!actorId) return null;
  const storage = {
    get length() {return window.localStorage.length;},
    key: index => window.localStorage.key(index),
    getItem: key => window.localStorage.getItem(key),
    setItem: (key,value) => window.localStorage.setItem(key,value),
    removeItem: key => window.localStorage.removeItem(key),
  };
  activeJournal = createCharacterOperationJournal(storage, actorId,
    () => document.dispatchEvent(new CustomEvent('vtt:character-operation-review')));
  return activeJournal;
}
