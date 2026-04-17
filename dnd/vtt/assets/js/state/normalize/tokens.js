import { stripMonsterSnapshot } from './monsters.js';

export const PLAYER_VISIBLE_TOKEN_FOLDER = "PC's";

export function normalizePlayerTokenFolderName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return normalized.replace(/[^a-z0-9]/g, '');
}

export function normalizeTokens(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.tokens)
    ? raw.tokens
    : [];

  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((token) => token && typeof token.id === 'string'),
  };
}

export function restrictTokensToPlayerView(tokenState = {}) {
  const folders = Array.isArray(tokenState.folders) ? tokenState.folders : [];
  const items = Array.isArray(tokenState.items) ? tokenState.items : [];

  const visibleFolders = [];
  const allowedIds = new Set();
  const playerFolderKey = normalizePlayerTokenFolderName(PLAYER_VISIBLE_TOKEN_FOLDER);

  if (!playerFolderKey) {
    return { folders: [], items: [] };
  }

  folders.forEach((folder) => {
    if (!folder || typeof folder !== 'object') {
      return;
    }

    const nameKey = normalizePlayerTokenFolderName(folder.name);
    if (!nameKey || nameKey !== playerFolderKey) {
      return;
    }

    const id = typeof folder.id === 'string' ? folder.id : '';
    if (!id) {
      return;
    }

    if (!allowedIds.has(id)) {
      allowedIds.add(id);
      visibleFolders.push(folder);
    }
  });

  const visibleItems = [];

  items.forEach((token) => {
    if (!token || typeof token !== 'object') {
      return;
    }

    const folderId = typeof token.folderId === 'string' ? token.folderId : '';
    if (folderId && allowedIds.has(folderId)) {
      visibleItems.push(stripMonsterSnapshot(token));
      return;
    }

    const folderName = typeof token.folder?.name === 'string' ? token.folder.name : '';
    if (normalizePlayerTokenFolderName(folderName) === playerFolderKey) {
      if (folderId && !allowedIds.has(folderId)) {
        allowedIds.add(folderId);
        visibleFolders.push({ id: folderId, name: PLAYER_VISIBLE_TOKEN_FOLDER });
      }
      visibleItems.push(stripMonsterSnapshot(token));
    }
  });

  return {
    folders: dedupeFoldersById(visibleFolders),
    items: visibleItems,
  };
}

function dedupeFoldersById(folders) {
  const seen = new Set();
  const result = [];
  folders.forEach((folder) => {
    if (!folder || typeof folder !== 'object') {
      return;
    }
    const id = typeof folder.id === 'string' ? folder.id : '';
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    result.push(folder);
  });
  return result;
}
