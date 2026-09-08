export function createTokenLibraryPreferences(storage, userName = '') {
  const key = `vtt:token-library:${encodeURIComponent(userName || 'anonymous')}:v1`;
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch {}
  const ids = (values, limit) => Array.isArray(values)
    ? [...new Set(values.filter(value => typeof value === 'string' && value.length < 256))].slice(0, limit) : [];
  const favorites = new Set(ids(saved.favorites, 500));
  let recent = ids(saved.recent, 20);
  function persist() {
    try { storage?.setItem(key, JSON.stringify({ favorites: [...favorites], recent })); } catch {}
  }
  return {
    isFavorite: id => favorites.has(id),
    toggleFavorite(id) {
      if (favorites.has(id)) favorites.delete(id);
      else if (favorites.size < 500) favorites.add(id);
      persist();
    },
    recordUsed(id) {
      if (!id || typeof id !== 'string') return;
      recent = [id, ...recent.filter(value => value !== id)].slice(0, 20);
      persist();
    },
    recentIds: () => [...recent],
  };
}
