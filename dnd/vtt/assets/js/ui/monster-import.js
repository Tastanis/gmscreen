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
      return name.includes(query);
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

    list.innerHTML = filtered
      .map((monster) => {
        const id = monster?.id ?? monster?.uuid ?? monster?.slug ?? monster?.name;
        const name = typeof monster?.name === 'string' ? monster.name : 'Unknown Monster';
        const safeId = id != null ? String(id) : name;
        return `
          <li>
            <button type="button" class="monster-importer__item" data-monster-id="${escapeHtml(
              safeId
            )}">
              <span class="monster-importer__item-name">${escapeHtml(name)}</span>
            </button>
          </li>
        `;
      })
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

export default createMonsterImporter;
