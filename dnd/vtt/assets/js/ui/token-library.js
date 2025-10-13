import { initializeTokenMaker } from './token-maker.js';
import { createToken, createTokenFolder, updateToken, deleteToken } from '../services/token-service.js';
import { restrictTokensToPlayerView } from '../state/store.js';

const UNSORTED_KEY = '__unsorted';

export function renderTokenLibrary(routes, store, options = {}) {
  const moduleRoot = document.querySelector('[data-module="vtt-token-library"]');
  if (!moduleRoot) return;

  const listContainer = moduleRoot.querySelector('#token-template-list');
  const nameInput = moduleRoot.querySelector('[data-token-name-input]');
  const folderSelect = moduleRoot.querySelector('[data-token-folder-select]');
  const teamToggle = moduleRoot.querySelector('[data-token-team-toggle]');
  const feedback = moduleRoot.querySelector('[data-token-feedback]');
  const createButtons = moduleRoot.querySelectorAll('[data-action="create-token"]');
  const folderButtons = moduleRoot.querySelectorAll('[data-action="create-token-folder"]');
  if (!listContainer) return;

  const stateApi = store ?? {};
  const endpoints = routes ?? {};
  const initialState = typeof stateApi.getState === 'function' ? stateApi.getState() : {};
  const isGM = Boolean(options?.isGM ?? initialState?.user?.isGM);

  const maker = isGM ? initializeTokenMaker(moduleRoot) : null;

  if (teamToggle) {
    teamToggle.checked = false;
  }

  const collapseState = new Map();
  const tokenIndex = new Map();
  const contextMenu = isGM ? createTokenContextMenu(moduleRoot) : null;
  let contextTokenId = null;
  let contextTokenElement = null;
  let removeContextListeners = null;

  if (!endpoints.tokens || !isGM) {
    createButtons.forEach((button) => {
      button.disabled = true;
      button.title = 'Token saving is unavailable right now.';
    });
    folderButtons.forEach((button) => {
      button.disabled = true;
      button.title = 'Token folders are unavailable right now.';
    });
  }

  function closeContextMenu() {
    if (!contextMenu?.element) {
      return;
    }

    if (typeof removeContextListeners === 'function') {
      removeContextListeners();
      removeContextListeners = null;
    }

    if (contextTokenElement) {
      contextTokenElement.classList.remove('is-context-active');
      contextTokenElement = null;
    }

    contextTokenId = null;

    if (!contextMenu.element.hidden) {
      contextMenu.element.hidden = true;
      contextMenu.element.dataset.open = 'false';
    }

    if (contextMenu.form) {
      contextMenu.form.reset();
    }

    if (contextMenu.teamToggle) {
      contextMenu.teamToggle.checked = false;
    }

    if (contextMenu.sizeInput) {
      Array.from(
        contextMenu.sizeInput.querySelectorAll('option[data-dynamic-size-option="true"]')
      ).forEach((option) => option.remove());
    }

    setContextMenuPending(contextMenu, false);
    showFeedback(contextMenu.feedback, '', 'info');
  }

  function attachContextMenuListeners(onClose) {
    const handlePointerDown = (event) => {
      if (!contextMenu.element.contains(event.target)) {
        onClose();
      }
    };

    const handleContextMenu = (event) => {
      if (!contextMenu.element.contains(event.target)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    const handleResize = () => {
      onClose();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }

  function openContextMenu(token, clientX, clientY, sourceElement) {
    if (!contextMenu?.element || !token) {
      return;
    }

    if (contextTokenElement && contextTokenElement !== sourceElement) {
      contextTokenElement.classList.remove('is-context-active');
    }

    contextTokenElement = sourceElement ?? null;
    if (contextTokenElement) {
      contextTokenElement.classList.add('is-context-active');
    }

    contextTokenId = token.id;

    if (contextMenu.sizeInput) {
      const rawSize = typeof token.size === 'string' ? token.size : '';
      const sizeValue = rawSize.trim();
      if (sizeValue) {
        const hasOption = Array.from(contextMenu.sizeInput.options || []).some(
          (option) => option.value === sizeValue
        );
        if (!hasOption) {
          const dynamicOption = document.createElement('option');
          dynamicOption.value = sizeValue;
          dynamicOption.textContent = sizeValue;
          dynamicOption.dataset.dynamicSizeOption = 'true';
          contextMenu.sizeInput.appendChild(dynamicOption);
        }
        contextMenu.sizeInput.value = sizeValue;
      } else {
        contextMenu.sizeInput.value = '1x1';
      }
    }

    if (contextMenu.teamToggle) {
      const teamValue = normalizeTokenTeam(token.combatTeam ?? token.team ?? null);
      contextMenu.teamToggle.checked = teamValue === 'ally';
    }

    if (contextMenu.hpInput) {
      if (typeof token.hp === 'number' && !Number.isNaN(token.hp)) {
        contextMenu.hpInput.value = String(token.hp);
      } else if (typeof token.hp === 'string') {
        contextMenu.hpInput.value = token.hp;
      } else {
        contextMenu.hpInput.value = '';
      }
    }

    setContextMenuPending(contextMenu, false);
    showFeedback(contextMenu.feedback, '', 'info');

    contextMenu.element.hidden = false;
    contextMenu.element.dataset.open = 'true';
    contextMenu.element.style.visibility = 'hidden';
    contextMenu.element.style.left = '0px';
    contextMenu.element.style.top = '0px';
    positionContextMenu(contextMenu.element, clientX, clientY);
    contextMenu.element.style.visibility = '';

    if (contextMenu.sizeInput) {
      focusElement(contextMenu.sizeInput);
      if (typeof contextMenu.sizeInput.select === 'function') {
        contextMenu.sizeInput.select();
      }
    } else {
      focusElement(contextMenu.element);
    }

    if (typeof removeContextListeners === 'function') {
      removeContextListeners();
    }
    removeContextListeners = attachContextMenuListeners(closeContextMenu);
  }

  const render = (state) => {
    closeContextMenu();

    let tokensState = normalizeTokenState(state?.tokens);
    if (!isGM) {
      tokensState = restrictTokensToPlayerView(tokensState);
    }
    updateFolderOptions(folderSelect, tokensState.folders);

    tokenIndex.clear();
    tokensState.items.forEach((token) => {
      if (token && typeof token.id === 'string') {
        tokenIndex.set(token.id, token);
      }
    });

    if (!tokensState.items.length) {
      listContainer.innerHTML = '<li class="token-template-list__empty">No tokens saved yet.</li>';
      return;
    }

    const groups = groupTokens(tokensState);
    pruneCollapseState(collapseState, groups);

    const markup = buildTokenMarkup(groups, {
      isCollapsed: (folderId) => isGroupCollapsed(collapseState, folderId),
    });

    listContainer.innerHTML = markup;
  };

  render(stateApi.getState?.() ?? {});
  stateApi.subscribe?.((nextState) => render(nextState));

  moduleRoot.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');

    if (action === 'toggle-token-group') {
      const folderId = target.getAttribute('data-folder-id') || null;
      const nextCollapsed = !isGroupCollapsed(collapseState, folderId);
      setGroupCollapsed(collapseState, folderId, nextCollapsed);
      const group = target.closest('.token-group');
      if (group) {
        group.classList.toggle('is-collapsed', nextCollapsed);
      }
      target.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      closeContextMenu();
      return;
    }

    if (action === 'create-token-folder') {
      if (!isGM) {
        showFeedback(feedback, 'Only the GM can create token folders.', 'error');
        return;
      }
      if (!endpoints.tokens) {
        showFeedback(feedback, 'Token folders are unavailable right now.', 'error');
        return;
      }

      const name = window.prompt('Folder name');
      const trimmed = name?.trim();
      if (!trimmed) return;

      try {
        setButtonPending(target, true);
        const folder = await createTokenFolder(endpoints.tokens, trimmed);
        stateApi.updateState?.((draft) => {
          ensureTokenDraft(draft);
          const exists = draft.tokens.folders.some((item) => item.id === folder.id);
          if (!exists) {
            draft.tokens.folders.push(folder);
          }
        });
        if (folderSelect) {
          folderSelect.value = folder.id;
        }
        showFeedback(feedback, 'Folder created.', 'success');
      } catch (error) {
        console.error('[VTT] Failed to create token folder', error);
        showFeedback(feedback, error?.message || 'Unable to create folder.', 'error');
      } finally {
        setButtonPending(target, false);
      }
      return;
    }

    if (action === 'create-token') {
      if (!isGM) {
        showFeedback(feedback, 'Only the GM can create tokens.', 'error');
        return;
      }
      if (!endpoints.tokens) {
        showFeedback(feedback, 'Token saving is unavailable right now.', 'error');
        return;
      }

      if (!maker?.hasImage?.()) {
        showFeedback(feedback, 'Add an image to the token preview first.', 'error');
        return;
      }

      try {
        setButtonsDisabled(createButtons, true);
        showFeedback(feedback, 'Preparing token image…', 'info');
        const exportResult = await maker.exportToken?.({ size: 512 });
        if (!exportResult?.dataUrl) {
          throw new Error('Unable to prepare token image.');
        }

        const name = nameInput?.value?.trim() ?? '';
        const folderId = folderSelect?.value || null;
        const team = teamToggle?.checked ? 'ally' : 'enemy';
        const token = await createToken(endpoints.tokens, {
          name,
          folderId,
          imageData: exportResult.dataUrl,
          team,
        });

        stateApi.updateState?.((draft) => {
          ensureTokenDraft(draft);
          draft.tokens.items.push(token);
          if (token.folderId) {
            const hasFolder = draft.tokens.folders.some((item) => item.id === token.folderId);
            if (!hasFolder && token.folder) {
              draft.tokens.folders.push(token.folder);
            }
          }
        });

        if (nameInput) {
          nameInput.value = '';
        }
        if (teamToggle) {
          teamToggle.checked = false;
        }
        maker.reset?.();
        showFeedback(feedback, 'Token created.', 'success');
      } catch (error) {
        console.error('[VTT] Failed to create token', error);
        showFeedback(feedback, error?.message || 'Unable to create token.', 'error');
      } finally {
        setButtonsDisabled(createButtons, false);
      }
    }
  });

  moduleRoot.addEventListener('contextmenu', (event) => {
    if (!isGM) {
      return;
    }

    if (!contextMenu) {
      return;
    }

    if (contextMenu?.element?.contains(event.target)) {
      return;
    }

    const tokenElement = event.target.closest('.token-item');
    if (!tokenElement) {
      return;
    }

    event.preventDefault();

    if (!endpoints.tokens) {
      showFeedback(feedback, 'Token editing is unavailable right now.', 'error');
      return;
    }

    const tokenId = tokenElement.getAttribute('data-token-id');
    if (!tokenId) {
      return;
    }

    const token = tokenIndex.get(tokenId);
    if (!token) {
      return;
    }

    openContextMenu(token, event.clientX, event.clientY, tokenElement);
  });

  moduleRoot.addEventListener('dragstart', (event) => {
    const tokenElement = event.target.closest('.token-item');
    if (!tokenElement) {
      return;
    }

    const dragData = buildTokenDragData(tokenElement, tokenIndex);
    const dataTransfer = event.dataTransfer;
    if (!dragData || !dataTransfer) {
      event.preventDefault();
      return;
    }

    closeContextMenu();

    try {
      const payload = JSON.stringify(dragData);
      dataTransfer.setData('application/x-vtt-token-template', payload);
      dataTransfer.setData('text/plain', dragData.name || 'Token');
      dataTransfer.effectAllowed = 'copy';
      dataTransfer.dropEffect = 'copy';

      const dragImage = tokenElement.querySelector('img');
      if (dragImage) {
        const rect = dragImage.getBoundingClientRect();
        dataTransfer.setDragImage(
          dragImage,
          rect.width / 2,
          rect.height / 2
        );
      }
    } catch (error) {
      console.warn('[VTT] Unable to start token drag operation', error);
      event.preventDefault();
    }
  });

  if (contextMenu?.element) {
    contextMenu.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu();
      }
    });

    contextMenu.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  if (contextMenu?.deleteButton) {
    contextMenu.deleteButton.addEventListener('click', async (event) => {
      event.preventDefault();

      if (!contextTokenId) {
        return;
      }

      if (!endpoints.tokens) {
        showFeedback(contextMenu.feedback, 'Token editing is unavailable right now.', 'error');
        return;
      }

      const confirmed = window.confirm('Delete this token? This cannot be undone.');
      if (!confirmed) {
        return;
      }

      const tokenId = contextTokenId;

      try {
        setContextMenuPending(contextMenu, true);
        showFeedback(contextMenu.feedback, 'Deleting…', 'info');

        await deleteToken(endpoints.tokens, tokenId);

        closeContextMenu();

        stateApi.updateState?.((draft) => {
          ensureTokenDraft(draft);
          draft.tokens.items = draft.tokens.items.filter((item) => item?.id !== tokenId);
        });

        showFeedback(feedback, 'Token deleted.', 'success');
      } catch (error) {
        console.error('[VTT] Failed to delete token', error);
        showFeedback(contextMenu.feedback, error?.message || 'Unable to delete token.', 'error');
      } finally {
        setContextMenuPending(contextMenu, false);
      }
    });
  }

  if (contextMenu?.form) {
    contextMenu.form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!contextTokenId) {
        return;
      }

      if (!endpoints.tokens) {
        showFeedback(contextMenu.feedback, 'Token editing is unavailable right now.', 'error');
        return;
      }

      const sizeValue = contextMenu.sizeInput ? contextMenu.sizeInput.value.trim() : '';
      const hpValue = contextMenu.hpInput ? contextMenu.hpInput.value.trim() : '';
      const teamValue = contextMenu.teamToggle?.checked ? 'ally' : 'enemy';

      try {
        setContextMenuPending(contextMenu, true);
        showFeedback(contextMenu.feedback, 'Saving…', 'info');

        const updated = await updateToken(endpoints.tokens, {
          id: contextTokenId,
          size: sizeValue,
          hp: hpValue,
          team: teamValue,
        });

        stateApi.updateState?.((draft) => {
          ensureTokenDraft(draft);
          const index = draft.tokens.items.findIndex((item) => item.id === updated.id);
          if (index >= 0) {
            const nextToken = {
              ...draft.tokens.items[index],
              ...updated,
            };

            if (!Object.prototype.hasOwnProperty.call(updated, 'size')) {
              delete nextToken.size;
            }
            if (!Object.prototype.hasOwnProperty.call(updated, 'hp')) {
              delete nextToken.hp;
            }

            draft.tokens.items[index] = nextToken;
          }
        });

        closeContextMenu();
      } catch (error) {
        console.error('[VTT] Failed to update token', error);
        showFeedback(contextMenu.feedback, error?.message || 'Unable to update token.', 'error');
      } finally {
        setContextMenuPending(contextMenu, false);
      }
    });
  }
}

function normalizeTokenState(raw = {}) {
  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.tokens)
    ? raw.tokens
    : Array.isArray(raw)
    ? raw
    : [];

  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((token) => token && typeof token.id === 'string'),
  };
}

function buildTokenDragData(element, tokenIndex) {
  if (!element) {
    return null;
  }

  const tokenId = element.getAttribute('data-token-id');
  if (!tokenId) {
    return null;
  }

  const record = tokenIndex?.get?.(tokenId) ?? null;
  const titleElement = element.querySelector('h4');
  const name = (record?.name || titleElement?.textContent || '').trim();
  const imageElement = element.querySelector('img');
  const imageUrl = typeof record?.imageUrl === 'string' && record.imageUrl
    ? record.imageUrl
    : imageElement?.getAttribute('src') || '';

  if (!imageUrl) {
    return null;
  }

  const recordSize = typeof record?.size === 'string' ? record.size.trim() : '';
  const elementSize = element.getAttribute('data-token-size');
  const fallbackSize = typeof elementSize === 'string' ? elementSize.trim() : '';
  const sizeValue = recordSize || fallbackSize || '1x1';
  const recordHp = record?.hp;
  const elementHp = element.getAttribute('data-token-hp');
  let hpValue = '';
  if (typeof recordHp === 'number' && Number.isFinite(recordHp)) {
    hpValue = String(Math.trunc(recordHp));
  } else if (typeof recordHp === 'string' && recordHp.trim()) {
    hpValue = recordHp.trim();
  } else if (typeof elementHp === 'string' && elementHp.trim()) {
    hpValue = elementHp.trim();
  }
  const elementTeam = element.getAttribute('data-token-team');
  const team = normalizeTokenTeam(record?.combatTeam ?? record?.team ?? elementTeam);

  return {
    id: tokenId,
    name,
    imageUrl,
    size: sizeValue,
    hp: hpValue,
    source: 'token-library',
    team,
  };
}

function updateFolderOptions(select, folders = []) {
  if (!select) return;
  const current = select.value;
  const options = ['<option value="">Unsorted</option>']
    .concat(
      folders.map(
        (folder) => `<option value="${folder.id}">${escapeHtml(folder.name || 'Untitled Folder')}</option>`
      )
    )
    .join('');
  select.innerHTML = options;
  select.value = folders.some((folder) => folder.id === current) ? current : '';
}

function groupTokens(tokenState) {
  const groups = [];

  tokenState.folders.forEach((folder) => {
    const items = tokenState.items.filter((token) => token.folderId === folder.id);
    if (items.length) {
      groups.push({
        id: folder.id,
        title: folder.name || 'Untitled Folder',
        items,
      });
    }
  });

  const unsorted = tokenState.items.filter(
    (token) => !token.folderId || !tokenState.folders.some((folder) => folder.id === token.folderId)
  );

  if (unsorted.length) {
    groups.push({ id: null, title: 'Unsorted Tokens', items: unsorted });
  }

  return groups;
}

function buildTokenMarkup(groups, options = {}) {
  if (!groups.length) {
    return '<li class="token-template-list__empty">No tokens saved yet.</li>';
  }

  const isCollapsed = typeof options.isCollapsed === 'function' ? options.isCollapsed : () => false;

  return groups
    .map((group) => {
      const collapsed = isCollapsed(group.id);
      const listId = buildGroupListId(group.id);
      return `
        <li class="token-group${collapsed ? ' is-collapsed' : ''}" data-folder-id="${group.id ?? ''}">
          <div class="token-group__header">
            <button
              type="button"
              class="token-group__toggle"
              data-action="toggle-token-group"
              data-folder-id="${group.id ?? ''}"
              aria-expanded="${collapsed ? 'false' : 'true'}"
              aria-controls="${listId}"
            >
              <span class="token-group__chevron" aria-hidden="true"></span>
              <span class="token-group__title">${escapeHtml(group.title)}</span>
              <span class="token-group__count">${group.items.length}</span>
            </button>
          </div>
          <ul class="token-group__list" id="${listId}">
            ${group.items.map((token) => renderTokenItem(token)).join('')}
          </ul>
        </li>
      `;
    })
    .join('');
}

function buildGroupListId(groupId) {
  const base = groupId ? String(groupId) : 'unsorted';
  return `token-group-list-${base.replace(/[^a-zA-Z0-9_-]/g, '-') || 'unsorted'}`;
}

function renderTokenItem(token) {
  const name = escapeHtml(token.name || 'Untitled Token');
  const thumb = renderTokenThumb(token);
  const sizeAttr = typeof token.size === 'string' ? ` data-token-size="${escapeHtml(token.size)}"` : '';
  const hpAttr =
    typeof token.hp === 'number' && !Number.isNaN(token.hp)
      ? ` data-token-hp="${escapeHtml(token.hp)}"`
      : '';
  const teamAttr = ` data-token-team="${normalizeTokenTeam(token.combatTeam ?? token.team ?? null)}"`;

  return `
    <li>
      <article class="token-item" draggable="true" data-token-id="${escapeHtml(token.id)}"${sizeAttr}${hpAttr}${teamAttr}>
        ${thumb}
        <div class="token-item__meta">
          <h4>${name}</h4>
          ${renderTokenDetails(token)}
        </div>
      </article>
    </li>
  `;
}

function renderTokenDetails(token) {
  const lines = [];
  if (token.type) {
    lines.push(`<p class="token-item__subtext">${escapeHtml(token.type)}</p>`);
  }

  const stats = [];
  if (token.size) {
    stats.push(`Size: ${escapeHtml(token.size)}`);
  }
  if (typeof token.hp === 'number' && !Number.isNaN(token.hp)) {
    stats.push(`HP: ${escapeHtml(token.hp)}`);
  }
  const team = normalizeTokenTeam(token.combatTeam ?? token.team ?? null);
  if (team) {
    stats.push(`Team: ${team === 'ally' ? 'Ally' : 'Enemy'}`);
  }

  if (stats.length) {
    lines.push(`<p class="token-item__details">${stats.join(' · ')}</p>`);
  }

  return lines.join('');
}

function renderTokenThumb(token) {
  const url = typeof token.imageUrl === 'string' ? token.imageUrl.trim() : '';
  if (!url) {
    return '<div class="token-item__thumb" aria-hidden="true"></div>';
  }

  const safeUrl = escapeHtml(url);
  const label = token.name ? `Preview of ${token.name}` : 'Token preview';
  return `
    <div class="token-item__thumb">
      <img src="${safeUrl}" alt="${escapeHtml(label)}" loading="lazy" />
    </div>
  `;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeTokenTeam(value) {
  if (typeof value !== 'string') {
    return 'enemy';
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'ally' ? 'ally' : 'enemy';
}

function showFeedback(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
  element.dataset.variant = type;
}

function setButtonsDisabled(buttons, disabled) {
  buttons.forEach((button) => {
    if (button) {
      button.disabled = disabled;
      button.classList.toggle('is-loading', disabled);
    }
  });
}

function setButtonPending(button, pending) {
  if (!button) return;
  button.disabled = pending;
  button.classList.toggle('is-loading', pending);
}

function setContextMenuPending(menu, pending) {
  if (!menu) return;
  const elements = [
    menu.sizeInput,
    menu.teamToggle,
    menu.hpInput,
    menu.submitButton,
    menu.deleteButton,
  ].filter(Boolean);
  elements.forEach((element) => {
    element.disabled = pending;
    if (element.classList?.contains('btn')) {
      element.classList.toggle('is-loading', pending);
    }
  });
}

function ensureTokenDraft(draft) {
  if (!draft.tokens || typeof draft.tokens !== 'object') {
    draft.tokens = { folders: [], items: [] };
  } else {
    draft.tokens.folders = Array.isArray(draft.tokens.folders) ? draft.tokens.folders : [];
    draft.tokens.items = Array.isArray(draft.tokens.items) ? draft.tokens.items : [];
  }
}

function focusElement(element) {
  if (!element || typeof element.focus !== 'function') {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

function createTokenContextMenu(root) {
  const element = document.createElement('div');
  element.className = 'token-context-menu';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.setAttribute('aria-label', 'Edit token');
  element.hidden = true;
  element.dataset.open = 'false';
  element.tabIndex = -1;
  const sizeOptions = Array.from({ length: 10 }, (_, index) => {
    const size = `${index + 1}x${index + 1}`;
    const selected = index === 0 ? ' selected' : '';
    return `<option value="${size}"${selected}>${size}</option>`;
  }).join('');

  element.innerHTML = `
    <form class="token-context-menu__form" data-token-context-form>
      <header class="token-context-menu__header">
        <h3 class="token-context-menu__title">Token Details</h3>
      </header>
      <div class="token-context-menu__field">
        <label for="token-context-size">Size</label>
        <select
          id="token-context-size"
          data-token-context-size
        >
          ${sizeOptions}
          <option value="">No size override</option>
        </select>
      </div>
      <div class="token-context-menu__field token-context-menu__field--toggle">
        <label class="token-context-menu__toggle" for="token-context-ally">
          <input
            id="token-context-ally"
            type="checkbox"
            data-token-context-ally
          />
          <span>Make Ally</span>
        </label>
      </div>
      <div class="token-context-menu__field">
        <label for="token-context-hp">Max HP</label>
        <input
          id="token-context-hp"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          data-token-context-hp
        />
      </div>
      <p class="token-context-menu__hint">Leave a field empty to clear its value.</p>
      <div class="token-context-menu__actions">
        <button class="btn btn--danger" type="button" data-token-context-delete>Delete</button>
        <button class="btn btn--primary" type="submit">Save</button>
      </div>
      <p class="token-context-menu__feedback" data-token-context-feedback hidden></p>
    </form>
  `;

  root.appendChild(element);

  return {
    element,
    form: element.querySelector('[data-token-context-form]'),
    sizeInput: element.querySelector('[data-token-context-size]'),
    teamToggle: element.querySelector('[data-token-context-ally]'),
    hpInput: element.querySelector('[data-token-context-hp]'),
    feedback: element.querySelector('[data-token-context-feedback]'),
    submitButton: element.querySelector('.token-context-menu__actions .btn[type="submit"]'),
    deleteButton: element.querySelector('[data-token-context-delete]'),
  };
}

function positionContextMenu(element, clientX, clientY) {
  const padding = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const rect = element.getBoundingClientRect();
  let x = clientX;
  let y = clientY;

  if (x + rect.width + padding > viewportWidth) {
    x = viewportWidth - rect.width - padding;
  }
  if (y + rect.height + padding > viewportHeight) {
    y = viewportHeight - rect.height - padding;
  }

  x = Math.max(padding, x);
  y = Math.max(padding, y);

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
}

function isGroupCollapsed(state, folderId) {
  return state.get(getGroupKey(folderId)) === true;
}

function setGroupCollapsed(state, folderId, collapsed) {
  state.set(getGroupKey(folderId), collapsed);
}

function pruneCollapseState(state, groups) {
  const activeKeys = new Set(groups.map((group) => getGroupKey(group.id)));
  Array.from(state.keys()).forEach((key) => {
    if (!activeKeys.has(key)) {
      state.delete(key);
    }
  });
}

function getGroupKey(folderId) {
  return folderId ?? UNSORTED_KEY;
}
