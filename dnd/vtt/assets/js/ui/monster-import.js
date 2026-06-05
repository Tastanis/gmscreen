import { fetchMonsterIndex, fetchMonsterDetail } from '../services/monster-service.js';

const DEFAULT_STATUS = { message: '', variant: 'info' };

export function createMonsterImporter({
  routes = {},
  indexEndpoint = null,
  detailEndpoint = null,
  documentRef = typeof document !== 'undefined' ? document : null,
  onSelect = null,
  onStatusChange = null,
  credentials = 'same-origin',
} = {}) {
  if (!documentRef || !documentRef.body) {
    return null;
  }

  const resolvedIndexEndpoint = indexEndpoint
    || (typeof routes === 'string' ? routes : routes?.index ?? null);
  const resolvedDetailEndpoint = detailEndpoint
    || (typeof routes === 'string' ? routes : routes?.detail ?? routes?.index ?? null);

  if (!resolvedIndexEndpoint || !resolvedDetailEndpoint) {
    return null;
  }

  const overlay = documentRef.createElement('div');
  overlay.className = 'monster-importer';
  overlay.hidden = true;

  const backdrop = documentRef.createElement('div');
  backdrop.className = 'monster-importer__backdrop';
  overlay.appendChild(backdrop);

  const dialog = documentRef.createElement('div');
  dialog.className = 'monster-importer__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'monster-importer-title');
  overlay.appendChild(dialog);

  const header = documentRef.createElement('header');
  header.className = 'monster-importer__header';
  const title = documentRef.createElement('h2');
  title.id = 'monster-importer-title';
  title.className = 'monster-importer__title';
  title.textContent = 'Import Monster';
  header.appendChild(title);

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'monster-importer__close';
  closeButton.setAttribute('aria-label', 'Close monster importer');
  closeButton.innerHTML = '&times;';
  header.appendChild(closeButton);
  dialog.appendChild(header);

  const body = documentRef.createElement('div');
  body.className = 'monster-importer__body';
  dialog.appendChild(body);

  const searchWrapper = documentRef.createElement('label');
  searchWrapper.className = 'monster-importer__search';
  searchWrapper.textContent = 'Search';

  const searchInput = documentRef.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search monsters';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchWrapper.appendChild(searchInput);
  body.appendChild(searchWrapper);

  const status = documentRef.createElement('p');
  status.className = 'monster-importer__status';
  status.hidden = true;
  body.appendChild(status);

  const list = documentRef.createElement('ul');
  list.className = 'monster-importer__list';
  list.setAttribute('role', 'listbox');
  body.appendChild(list);

  documentRef.body.appendChild(overlay);

  const state = {
    isOpen: false,
    hasLoaded: false,
    isLoadingIndex: false,
    isLoadingDetail: false,
    monsters: [],
    filter: '',
    status: DEFAULT_STATUS,
    openFolders: new Set(),
  };

  let removeListeners = null;

  const notifyStatus = (message, variant = 'info') => {
    state.status = { message, variant };
    status.textContent = message;
    status.hidden = !message;
    status.dataset.variant = variant;
    if (typeof onStatusChange === 'function') {
      onStatusChange(state.status);
    }
  };

  const clearStatus = () => {
    notifyStatus('', 'info');
  };

  const setOpen = (open) => {
    state.isOpen = open;
    overlay.hidden = !open;
    overlay.dataset.open = open ? 'true' : 'false';
    if (open) {
      overlay.focus?.();
    }
  };

  const getFilteredMonsters = () => {
    if (!state.filter) {
      return state.monsters;
    }
    const query = state.filter.toLowerCase();
    return state.monsters.filter((monster) => {
      const name = typeof monster?.name === 'string' ? monster.name.toLowerCase() : '';
      const folder = getMonsterFolderLabel(monster).toLowerCase();
      return name.includes(query) || folder.includes(query);
    });
  };

  const renderList = () => {
    const filtered = getFilteredMonsters();
    if (!filtered.length) {
      list.innerHTML = '';
      if (!state.isLoadingIndex && state.hasLoaded) {
        notifyStatus('No monsters found. Try another search.', 'info');
      }
      return;
    }

    const groups = groupMonstersByFolder(filtered);
    list.innerHTML = groups
      .map((group) => renderFolderGroup(group))
      .join('');
  };

  const handleSearchInput = (event) => {
    state.filter = event.target.value.trim();
    renderList();
  };

  const close = () => {
    if (!state.isOpen) {
      return;
    }
    setOpen(false);
    clearStatus();
    state.filter = '';
    state.openFolders.clear();
    searchInput.value = '';
    renderList();
    documentRef.removeEventListener('keydown', handleKeydown);
    list.removeEventListener('click', handleListClick);
    list.classList.remove('is-loading');
    state.isLoadingDetail = false;
    removeListeners?.();
    removeListeners = null;
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const attachBaseListeners = () => {
    const handleBackdropClick = (event) => {
      if (event.target === backdrop) {
        close();
      }
    };

    backdrop.addEventListener('click', handleBackdropClick);
    closeButton.addEventListener('click', close);
    searchInput.addEventListener('input', handleSearchInput);

    removeListeners = () => {
      backdrop.removeEventListener('click', handleBackdropClick);
      closeButton.removeEventListener('click', close);
      searchInput.removeEventListener('input', handleSearchInput);
    };
  };

  const parseIndexRecords = (data) => {
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data?.results)) {
      return data.results;
    }
    if (Array.isArray(data?.monsters)) {
      return data.monsters;
    }
    if (Array.isArray(data?.items)) {
      return data.items;
    }
    return [];
  };

  const sortMonsters = (items) => {
    return items
      .slice()
      .filter((monster) => monster && (monster.id != null || monster.name))
      .sort((a, b) => {
        const nameA = typeof a?.name === 'string' ? a.name.toLowerCase() : '';
        const nameB = typeof b?.name === 'string' ? b.name.toLowerCase() : '';
        return nameA.localeCompare(nameB);
      });
  };

  const groupMonstersByFolder = (items) => {
    const groupMap = new Map();
    items.forEach((monster) => {
      const folder = getMonsterFolderLabel(monster);
      if (!groupMap.has(folder)) {
        groupMap.set(folder, []);
      }
      groupMap.get(folder).push(monster);
    });

    return Array.from(groupMap.entries())
      .map(([label, monsters]) => ({
        label,
        monsters: sortMonsters(monsters),
      }))
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  };

  const renderFolderGroup = (group) => {
    const isOpen = state.filter !== '' || state.openFolders.has(group.label);
    const itemCount = group.monsters.length;
    return `
      <li class="monster-importer__folder${isOpen ? '' : ' is-collapsed'}">
        <button
          type="button"
          class="monster-importer__folder-toggle"
          data-monster-folder="${escapeHtml(group.label)}"
          aria-expanded="${isOpen ? 'true' : 'false'}"
        >
          <span class="monster-importer__folder-chevron" aria-hidden="true"></span>
          <span class="monster-importer__folder-name">${escapeHtml(group.label)}</span>
          <span class="monster-importer__folder-count">${itemCount}</span>
        </button>
        <ul class="monster-importer__folder-list">
          ${group.monsters.map((monster) => renderMonsterItem(monster)).join('')}
        </ul>
      </li>
    `;
  };

  const renderMonsterItem = (monster) => {
    const id = monster?.id ?? monster?.uuid ?? monster?.slug ?? monster?.name;
    const name = typeof monster?.name === 'string' ? monster.name : 'Unknown Monster';
    const safeId = id != null ? String(id) : name;
    const imageUrl = getMonsterImageUrl(monster);
    const meta = getMonsterMeta(monster);
    const initial = name.trim().charAt(0).toUpperCase() || '?';

    return `
      <li>
        <button type="button" class="monster-importer__item" data-monster-id="${escapeHtml(safeId)}">
          <span class="monster-importer__thumb" aria-hidden="true">
            ${imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
              : `<span class="monster-importer__thumb-fallback">${escapeHtml(initial)}</span>`}
          </span>
          <span class="monster-importer__item-body">
            <span class="monster-importer__item-name">${escapeHtml(name)}</span>
            ${meta ? `<span class="monster-importer__item-meta">${escapeHtml(meta)}</span>` : ''}
          </span>
        </button>
      </li>
    `;
  };

  const ensureIndex = async () => {
    if (state.hasLoaded || state.isLoadingIndex) {
      return;
    }

    state.isLoadingIndex = true;
    notifyStatus('Loading monsters…', 'info');

    try {
      const data = await fetchMonsterIndex(resolvedIndexEndpoint, { credentials });
      const monsters = sortMonsters(parseIndexRecords(data));
      state.monsters = monsters;
      state.hasLoaded = true;
      if (!monsters.length) {
        notifyStatus('No monsters are available for import.', 'info');
      } else {
        clearStatus();
        renderList();
      }
    } catch (error) {
      console.error('[VTT] Failed to load monster index', error);
      notifyStatus(error?.message || 'Unable to load monsters.', 'error');
      throw error;
    } finally {
      state.isLoadingIndex = false;
    }
  };

  const handleListClick = async (event) => {
    const folderButton = event.target.closest('.monster-importer__folder-toggle');
    if (folderButton) {
      const folder = folderButton.getAttribute('data-monster-folder');
      if (!folder) {
        return;
      }

      if (state.openFolders.has(folder)) {
        state.openFolders.delete(folder);
      } else {
        state.openFolders.add(folder);
      }

      renderList();
      return;
    }

    const button = event.target.closest('.monster-importer__item');
    if (!button) {
      return;
    }

    const monsterId = button.getAttribute('data-monster-id');
    if (!monsterId || state.isLoadingDetail) {
      return;
    }

    state.isLoadingDetail = true;
    notifyStatus('Loading monster…', 'info');
    list.classList.add('is-loading');

    try {
      const monster = await fetchMonsterDetail(resolvedDetailEndpoint, monsterId, { credentials });
      await Promise.resolve(onSelect?.(monster));
      clearStatus();
      close();
    } catch (error) {
      console.error('[VTT] Failed to import monster', error);
      notifyStatus(error?.message || 'Unable to import monster.', 'error');
    } finally {
      state.isLoadingDetail = false;
      list.classList.remove('is-loading');
    }
  };

  const open = async () => {
    if (state.isOpen) {
      return;
    }

    try {
      await ensureIndex();
    } catch (error) {
      // Error already surfaced; do not open modal if index failed.
      return;
    }

    setOpen(true);
    attachBaseListeners();
    documentRef.addEventListener('keydown', handleKeydown);
    list.addEventListener('click', handleListClick);

    requestAnimationFrame(() => {
      searchInput.focus();
    });
  };

  const destroy = () => {
    close();
    list.removeEventListener('click', handleListClick);
    overlay.remove();
  };

  return {
    open,
    close,
    destroy,
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getMonsterFolderLabel(monster) {
  if (Array.isArray(monster?.sourceFolderParts)) {
    const parts = monster.sourceFolderParts
      .map((part) => String(part ?? '').trim())
      .filter(Boolean);
    if (parts.length) {
      return parts.join('/');
    }
  }

  const candidates = [
    monster?.sourceFolder,
    monster?.folder,
    monster?.folderName,
    monster?.source,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return 'Unsorted';
}

function getMonsterImageUrl(monster) {
  const candidates = [
    monster?.imageUrl,
    monster?.image,
    monster?.thumbnailUrl,
    monster?.thumbnail,
    monster?.portraitUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return '';
}

function getMonsterMeta(monster) {
  const parts = [];
  if (monster?.level !== null && monster?.level !== undefined && String(monster.level).trim() !== '') {
    parts.push(`Level ${monster.level}`);
  }

  const role = monster?.role ?? monster?.type ?? monster?.types;
  if (typeof role === 'string' && role.trim() !== '') {
    parts.push(role.trim());
  }

  return parts.join(' / ');
}

export default createMonsterImporter;
