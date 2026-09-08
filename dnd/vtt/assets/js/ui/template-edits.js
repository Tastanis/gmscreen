export function templateAuthority(entry = {}) {
  return {
    authorId: typeof entry.authorId === 'string' ? entry.authorId.trim().toLowerCase() : '',
    persistent: entry.persistent === true,
  };
}

export function canEditTemplate(entry, { userId, isGM = false } = {}) {
  const { authorId, persistent } = templateAuthority(entry);
  return isGM || (!persistent && Boolean(authorId) && authorId === String(userId || '').trim().toLowerCase());
}

// Normalize on both sides so server revisions, timestamps, and property order
// never turn a change to one template into a write to everyone else's shapes.
export function templateCommands(sceneId, before, after, normalize = (entry) => entry) {
  const clean = (entry) => {
    const value = { ...normalize(entry) };
    delete value._entityRevision;
    delete value._lastModified;
    return value;
  };
  const stable = (value) => JSON.stringify(value, (key, entry) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map((name) => [name, entry[name]]))
      : entry
  ));
  const previous = new Map(before.map((entry) => [entry.id, clean(entry)]));
  const next = new Map(after.map((entry) => [entry.id, clean(entry)]));
  const commands = [];
  for (const [id, template] of next) {
    if (!previous.has(id) || stable(previous.get(id)) !== stable(template)) {
      commands.push({ type: 'template.upsert', sceneId, entityId: id, payload: { template } });
    }
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) commands.push({ type: 'template.remove', sceneId, entityId: id, payload: {} });
  }
  return commands;
}
