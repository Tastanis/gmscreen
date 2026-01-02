import { initializeTokenMaker } from './token-maker.js';
import { createMonsterImporter } from './monster-import.js';
import { createToken, createTokenFolder, updateToken, deleteToken } from '../services/token-service.js';
import { PLAYER_VISIBLE_TOKEN_FOLDER, normalizePlayerTokenFolderName, restrictTokensToPlayerView } from '../state/store.js';

const UNSORTED_KEY = '__unsorted';
const sheetStaminaCache = new Map();
const sheetStaminaRequests = new Map();
const STAMINA_REFRESH_INTERVAL_MS = 60000;

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
  const importMonsterButton = moduleRoot.querySelector('[data-action="import-monster"]');
  if (!listContainer) return;

  const documentRef = moduleRoot.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

  const stateApi = store ?? {};
  const endpoints = routes ?? {};
  const initialState = typeof stateApi.getState === 'function' ? stateApi.getState() : {};
  const isGM = Boolean(options?.isGM ?? initialState?.user?.isGM);

  const maker = isGM ? initializeTokenMaker(moduleRoot) : null;
  const tokenMetadata = new Map();
  let selectedMonsterSnapshot = null;
  let monsterImporter = null;
  const monsterRoutes = endpoints.monsters ?? null;
  let staminaPrefetchInitialized = false;
  let staminaRefreshInterval = null;
  let staminaPrefetchNames = new Set();

  const notifyStaminaCacheUpdated = (names, reason) => {
    if (!moduleRoot || !names.length) {
      return;
    }

    moduleRoot.dispatchEvent(
      new CustomEvent('sheet-stamina-cache-updated', {
        detail: {
          names: [...names],
          reason,
        },
      })
    );

    if (typeof options?.onSheetStaminaCacheUpdated === 'function') {
      options.onSheetStaminaCacheUpdated({ names: [...names], reason });
    }
  };

  const getActiveSceneId = () => {
    const state = typeof stateApi.getState === 'function' ? stateApi.getState() : {};
    return state?.boardState?.activeSceneId ?? null;
  };

  const isTokenLibraryVisible = () => {
    if (!moduleRoot?.isConnected) {
      return false;
    }
    if (typeof moduleRoot.getClientRects === 'function' && moduleRoot.getClientRects().length === 0) {
      return false;
    }
    return true;
  };

  const shouldPrefetchStamina = () =>
    Boolean(endpoints?.sheet) && isTokenLibraryVisible();

  const collectTokenNamesFromLibrary = () => {
    if (!listContainer) {
      return [];
    }

    const playerFolderKey = normalizePlayerTokenFolderName(PLAYER_VISIBLE_TOKEN_FOLDER);
    if (!playerFolderKey) {
      return [];
    }

    const names = new Set();
    listContainer.querySelectorAll('.token-item').forEach((item) => {
      const folderName =
        typeof item?.dataset?.folderName === 'string' ? item.dataset.folderName : '';
      if (normalizePlayerTokenFolderName(folderName) !== playerFolderKey) {
        return;
      }

      const nameNode = item.querySelector('h4');
      if (!nameNode || typeof nameNode.textContent !== 'string') {
        return;
      }

      const name = nameNode.textContent.trim();
      if (name) {
        names.add(name);
      }
    });
    return [...names];
  };

  const refreshStaminaCache = () => {
    const names = [...staminaPrefetchNames];
    if (!names.length || !shouldPrefetchStamina()) {
      return;
    }

    const requests = names
      .map((name) => fetchSheetStamina(endpoints, name))
      .filter(Boolean);

    if (!requests.length) {
      return;
    }

    Promise.allSettled(requests).then(() => {
      notifyStaminaCacheUpdated(names, 'refresh');
    });
  };

  const updateStaminaPrefetchNames = () => {
    const names = collectTokenNamesFromLibrary();
    const previousNames = staminaPrefetchNames;
    staminaPrefetchNames = new Set(names);

    if (!names.length || !shouldPrefetchStamina()) {
      return;
    }

    if (!staminaPrefetchInitialized) {
      staminaPrefetchInitialized = true;
      const startupRequests = names
        .map((name) => fetchSheetStamina(endpoints, name))
        .filter(Boolean);
      Promise.allSettled(startupRequests).then(() => {
        notifyStaminaCacheUpdated(names, 'startup');
      });

      if (!staminaRefreshInterval && typeof window !== 'undefined') {
        staminaRefreshInterval = window.setInterval(
          refreshStaminaCache,
          STAMINA_REFRESH_INTERVAL_MS
        );
      }
      return;
    }

    const newNames = names.filter((name) => !previousNames.has(name));
    if (!newNames.length) {
      return;
    }

    const newRequests = newNames
      .map((name) => fetchSheetStamina(endpoints, name))
      .filter(Boolean);
    Promise.allSettled(newRequests).then(() => {
      notifyStaminaCacheUpdated(newNames, 'new');
    });
  };

  const disableImportButton = (message) => {
    if (!importMonsterButton) return;
    importMonsterButton.disabled = true;
    if (message) {
      importMonsterButton.title = message;
    }
  };

  const enableImportButton = () => {
    if (!importMonsterButton) return;
    importMonsterButton.disabled = false;
    importMonsterButton.removeAttribute('title');
  };

  const handleImporterStatus = (status) => {
    if (!feedback || !status || typeof status.message !== 'string') {
      return;
    }

    if (!status.message) {
      showFeedback(feedback, '', 'info');
      return;
    }

    const variant = status.variant || 'info';
    showFeedback(feedback, status.message, variant);
  };

  if (maker && typeof maker.reset === 'function') {
    const originalReset = maker.reset.bind(maker);
    maker.reset = () => {
      selectedMonsterSnapshot = null;
      originalReset();
    };
  }

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

  if (importMonsterButton) {
    if (!isGM) {
      disableImportButton('Only the GM can import monsters.');
    } else if (!monsterRoutes || !documentRef) {
      disableImportButton('Monster importing is unavailable right now.');
    } else {
      monsterImporter = createMonsterImporter({
        routes: monsterRoutes,
        documentRef,
        credentials: 'include',
        onStatusChange: handleImporterStatus,
        onSelect: async (monster) => {
          if (!maker || typeof maker.loadImageFromUrl !== 'function') {
            throw new Error('Token maker is unavailable.');
          }

          const sanitized = sanitizeMonsterSnapshot(monster);
          if (!sanitized) {
            throw new Error('Monster data is unavailable.');
          }

          const imageUrl = extractMonsterImageUrl(sanitized);
          if (!imageUrl) {
            throw new Error('Selected monster does not include an image.');
          }

          await maker.loadImageFromUrl(imageUrl, { credentials: 'include' });

          selectedMonsterSnapshot = sanitized;

          if (nameInput && typeof sanitized.name === 'string' && sanitized.name.trim()) {
            nameInput.value = sanitized.name.trim();
          }

          const monsterName = sanitized.name || 'Monster';
          const monsterType = extractMonsterType(sanitized);
          const successMessage = monsterType
            ? `Loaded ${monsterName} (${monsterType}) into the token maker.`
            : `Loaded ${monsterName} into the token maker.`;
          showFeedback(feedback, successMessage, 'success');
        },
      });

      if (!monsterImporter) {
        disableImportButton('Monster importing is unavailable right now.');
      } else {
        enableImportButton();
        importMonsterButton.addEventListener('click', async (event) => {
          event.preventDefault();
          try {
            await monsterImporter.open();
          } catch (error) {
            console.error('[VTT] Unable to open monster importer', error);
            showFeedback(
              feedback,
              error?.message || 'Unable to open monster importer.',
              'error'
            );
          }
        });
      }
    }
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
    tokensState.items = tokensState.items.map((token) => syncTokenMetadata(tokenMetadata, token));

    const validTokenIds = new Set(
      tokensState.items
        .map((token) => (token && typeof token.id === 'string' ? token.id : null))
        .filter(Boolean)
    );
    Array.from(tokenMetadata.keys()).forEach((key) => {
      if (!validTokenIds.has(key)) {
        tokenMetadata.delete(key);
      }
    });
    updateFolderOptions(folderSelect, tokensState.folders);

    tokenIndex.clear();
    tokensState.items.forEach((token) => {
      if (token && typeof token.id === 'string') {
        tokenIndex.set(token.id, token);
      }
    });

    if (!tokensState.items.length) {
      listContainer.innerHTML = '<li class="token-template-list__empty">No tokens saved yet.</li>';
      updateStaminaPrefetchNames();
      return;
    }

    const groups = groupTokens(tokensState);
    pruneCollapseState(collapseState, groups);

    const markup = buildTokenMarkup(groups, {
      isCollapsed: (folderId) => isGroupCollapsed(collapseState, folderId),
    });

    listContainer.innerHTML = markup;
    updateStaminaPrefetchNames();
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
        const monsterMeta = selectedMonsterSnapshot
          ? buildMonsterMetadata(selectedMonsterSnapshot)
          : null;

        const payload = {
          name,
          folderId,
          imageData: exportResult.dataUrl,
          team,
        };

        if (monsterMeta?.size) {
          payload.size = monsterMeta.size;
        }
        if (typeof monsterMeta?.hp === 'number' && Number.isFinite(monsterMeta.hp)) {
          payload.hp = monsterMeta.hp;
        }
        if (monsterMeta?.type) {
          payload.type = monsterMeta.type;
        }
        if (monsterMeta?.monsterId) {
          payload.monsterId = monsterMeta.monsterId;
        }
        if (monsterMeta?.monster) {
          payload.monster = monsterMeta.monster;
        }

        const token = await createToken(endpoints.tokens, payload);
        const enrichedToken = applyMonsterMetadataToToken(token, monsterMeta);

        stateApi.updateState?.((draft) => {
          ensureTokenDraft(draft);
          draft.tokens.items.push(enrichedToken);
          if (enrichedToken.folderId) {
            const hasFolder = draft.tokens.folders.some((item) => item.id === enrichedToken.folderId);
            if (!hasFolder && enrichedToken.folder) {
              draft.tokens.folders.push(enrichedToken.folder);
            }
          }
        });

        cacheTokenMetadataFromToken(tokenMetadata, enrichedToken);

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

    // Use synchronous buildTokenDragData instead of async buildTokenDragDataWithStamina.
    // Async dragstart handlers are unreliable - browsers require dataTransfer to be
    // set synchronously during the event. The sync version uses cached stamina if
    // available and kicks off a background fetch for next time if not cached.
    const dragData = buildTokenDragData(
      tokenElement,
      tokenIndex,
      {
        getState: stateApi.getState,
        routes: endpoints,
      }
    );
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

        tokenMetadata.delete(tokenId);

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
            cacheTokenMetadataFromToken(tokenMetadata, nextToken);
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

function buildTokenTemplateFromElement(element, tokenIndex) {
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
  let folderId = typeof record?.folderId === 'string' ? record.folderId : '';
  let folderName = typeof record?.folder?.name === 'string' ? record.folder.name : '';

  const groupElement = element.closest('.token-group');
  if (!folderId && groupElement) {
    const groupId = groupElement.getAttribute('data-folder-id');
    if (typeof groupId === 'string' && groupId.trim()) {
      folderId = groupId.trim();
    }
  }

  if (!folderName && groupElement) {
    const titleNode = groupElement.querySelector('.token-group__title');
    if (titleNode && typeof titleNode.textContent === 'string') {
      folderName = titleNode.textContent.trim();
    }
  }

  const sourceFolderId = folderId || null;
  const sourceFolderName = folderName || '';

  const monsterId = typeof record?.monsterId === 'string' ? record.monsterId.trim() : '';
  const monsterSnapshot = record?.monster ? sanitizeMonsterSnapshot(record.monster) : null;

  return {
    id: tokenId,
    name,
    imageUrl,
    size: sizeValue,
    hp: hpValue,
    source: 'token-library',
    team,
    sourceFolderId,
    sourceFolderName,
    monsterId: monsterId || undefined,
    monster: monsterSnapshot || undefined,
  };
}

function buildTokenDragData(element, tokenIndex, context = {}) {
  const template = buildTokenTemplateFromElement(element, tokenIndex);
  if (!template) {
    return null;
  }

  return hydratePlacementTemplateFromElement(template, {
    getState: typeof context.getState === 'function' ? context.getState : null,
    routes: context.routes ?? null,
  });
}

async function buildTokenDragDataWithStamina(element, tokenIndex, context = {}, options = {}) {
  const template = buildTokenTemplateFromElement(element, tokenIndex);
  if (!template) {
    return null;
  }

  return hydratePlacementTemplateWithStamina(template, {
    getState: typeof context.getState === 'function' ? context.getState : null,
    routes: context.routes ?? null,
  }, options);
}

function hydratePlacementTemplateFromElement(template, context = {}) {
  if (!template || typeof template !== 'object') {
    return null;
  }

  const getState = typeof context.getState === 'function' ? context.getState : null;
  const state = getState ? getState() ?? {} : {};
  const activeSceneId = state.boardState?.activeSceneId ?? null;
  if (!activeSceneId) {
    return template;
  }

  const name = typeof template.name === 'string' ? template.name.trim() : '';
  if (!name) {
    return template;
  }

  const cachedSheet = getCachedSheetStamina(name);
  if (!cachedSheet) {
    fetchSheetStamina(context.routes, name);
    return template;
  }

  return applyCachedSheetStaminaToTemplate(template, cachedSheet);
}

async function hydratePlacementTemplateWithStamina(template, context = {}, options = {}) {
  if (!template || typeof template !== 'object') {
    return null;
  }

  const getState = typeof context.getState === 'function' ? context.getState : null;
  const state = getState ? getState() ?? {} : {};
  const activeSceneId = state.boardState?.activeSceneId ?? null;
  if (!activeSceneId) {
    return template;
  }

  const name = typeof template.name === 'string' ? template.name.trim() : '';
  if (!name) {
    return template;
  }

  let cachedSheet = getCachedSheetStamina(name);
  if (!cachedSheet) {
    const request = fetchSheetStamina(context.routes, name);
    if (request) {
      const timeoutMs = Number.isFinite(options?.staminaTimeoutMs)
        ? options.staminaTimeoutMs
        : 0;
      try {
        if (timeoutMs > 0) {
          await Promise.race([
            request.catch(() => null),
            new Promise((resolve) => setTimeout(resolve, timeoutMs)),
          ]);
        } else {
          await request;
        }
      } catch (error) {
        // Ignore fetch errors; drag can continue without stamina data.
      }
    }
    cachedSheet = getCachedSheetStamina(name);
  }

  if (!cachedSheet) {
    return template;
  }

  return applyCachedSheetStaminaToTemplate(template, cachedSheet);
}

function applyCachedSheetStaminaToTemplate(template, cachedSheet) {
  if (!cachedSheet) {
    return template;
  }

  const current = toFiniteOrNull(
    cachedSheet.currentStamina ?? cachedSheet.stamina ?? cachedSheet.hp ?? null
  );
  const max = toFiniteOrNull(
    cachedSheet.staminaMax ?? cachedSheet.maxStamina ?? cachedSheet.maxHp ?? cachedSheet.hpMax ?? null
  );

  if (current === null && max === null) {
    return template;
  }

  const existingHp = template.hp;
  const existingCurrent =
    existingHp && typeof existingHp === 'object'
      ? existingHp.current ?? existingHp.value ?? existingHp.hp ?? ''
      : existingHp ?? '';
  const existingMax =
    existingHp && typeof existingHp === 'object'
      ? existingHp.max ?? existingHp.total ?? existingHp.maximum ?? existingHp.hp ?? ''
      : existingHp ?? '';

  return {
    ...template,
    hp: {
      current: current ?? existingCurrent,
      max: max ?? current ?? existingMax,
    },
  };
}

function getCachedSheetStamina(tokenName) {
  if (typeof tokenName !== 'string') {
    return null;
  }

  const key = tokenName.trim().toLowerCase();
  if (!key) {
    return null;
  }

  return sheetStaminaCache.get(key) ?? null;
}

function fetchSheetStamina(routes, tokenName) {
  if (typeof tokenName !== 'string') {
    return null;
  }

  const key = tokenName.trim().toLowerCase();
  if (!key) {
    return null;
  }

  const endpoint = typeof routes?.sheet === 'string' ? routes.sheet : null;
  if (!endpoint || typeof fetch !== 'function') {
    return null;
  }

  const existingRequest = sheetStaminaRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      let url = null;
      if (typeof window !== 'undefined' && window?.location?.href) {
        url = new URL(endpoint, window.location.href);
      } else {
        url = new URL(endpoint);
      }

      url.searchParams.set('action', 'sync-stamina');
      url.searchParams.set('character', tokenName);

      const response = await fetch(url.toString(), { method: 'GET' });
      if (!response?.ok) {
        throw new Error(`Sheet fetch failed with status ${response?.status ?? 'unknown'}`);
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return null;
      }

      if (data.success === false) {
        sheetStaminaCache.set(key, { currentStamina: null, staminaMax: null, missing: true });
        return null;
      }

      sheetStaminaCache.set(key, data);
      return data;
    } catch (error) {
      console.warn('[VTT] Failed to fetch sheet stamina', error);
      return null;
    } finally {
      sheetStaminaRequests.delete(key);
    }
  })();

  sheetStaminaRequests.set(key, request);
  return request;
}

function toFiniteOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
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
            ${group.items.map((token) => renderTokenItem(token, { folderName: group.title })).join('')}
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

function renderTokenItem(token, options = {}) {
  const name = escapeHtml(token.name || 'Untitled Token');
  const thumb = renderTokenThumb(token);
  const sizeAttr = typeof token.size === 'string' ? ` data-token-size="${escapeHtml(token.size)}"` : '';
  const hpAttr =
    typeof token.hp === 'number' && !Number.isNaN(token.hp)
      ? ` data-token-hp="${escapeHtml(token.hp)}"`
      : '';
  const teamAttr = ` data-token-team="${normalizeTokenTeam(token.combatTeam ?? token.team ?? null)}"`;
  const folderName =
    typeof options.folderName === 'string' && options.folderName.trim() ? options.folderName.trim() : '';
  const folderAttr = folderName ? ` data-folder-name="${escapeHtml(folderName)}"` : '';

  return `
    <li>
      <article class="token-item" draggable="true" data-token-id="${escapeHtml(token.id)}"${sizeAttr}${hpAttr}${teamAttr}${folderAttr}>
        <div class="token-item__meta">
          <h4>${name}</h4>
        </div>
        ${thumb}
        ${renderTokenDetails(token)}
      </article>
    </li>
  `;
}

function renderTokenDetails(token) {
  if (!token.size) {
    return '';
  }

  return `<p class="token-item__details">Size: ${escapeHtml(token.size)}</p>`;
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

const TOKEN_METADATA_FIELDS = ['size', 'hp', 'type', 'monster', 'monsterId'];

function syncTokenMetadata(cache, token) {
  if (!token || typeof token.id !== 'string') {
    return token;
  }

  const current = cache.get(token.id) || {};
  const nextMetadata = { ...current };

  TOKEN_METADATA_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(token, field)) {
      const value = field === 'monster'
        ? sanitizeMonsterSnapshot(token[field])
        : token[field];
      if (value === undefined) {
        delete nextMetadata[field];
      } else {
        nextMetadata[field] = value;
      }
    }
  });

  if (Object.keys(nextMetadata).length) {
    cache.set(token.id, nextMetadata);
  } else {
    cache.delete(token.id);
  }

  const needsMerge = TOKEN_METADATA_FIELDS.some(
    (field) =>
      !Object.prototype.hasOwnProperty.call(token, field) &&
      Object.prototype.hasOwnProperty.call(nextMetadata, field)
  );

  if (!needsMerge) {
    return token;
  }

  const merged = { ...token };
  TOKEN_METADATA_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(token, field) && Object.prototype.hasOwnProperty.call(nextMetadata, field)) {
      merged[field] = nextMetadata[field];
    }
  });
  return merged;
}

function cacheTokenMetadataFromToken(cache, token) {
  if (!token || typeof token.id !== 'string') {
    return;
  }
  const record = buildTokenMetadataRecord(token);
  if (record) {
    cache.set(token.id, record);
  } else {
    cache.delete(token.id);
  }
}

function buildTokenMetadataRecord(token) {
  if (!token || typeof token !== 'object') {
    return null;
  }

  const record = {};
  TOKEN_METADATA_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(token, field) && token[field] !== undefined) {
      record[field] = field === 'monster' ? sanitizeMonsterSnapshot(token[field]) : token[field];
    }
  });

  return Object.keys(record).length ? record : null;
}

function applyMonsterMetadataToToken(token, metadata) {
  if (!metadata || !token) {
    return token;
  }

  const next = { ...token };
  if (metadata.size) {
    next.size = metadata.size;
  }
  if (typeof metadata.hp === 'number' && Number.isFinite(metadata.hp)) {
    next.hp = metadata.hp;
  }
  if (metadata.type) {
    next.type = metadata.type;
  }
  if (metadata.monsterId) {
    next.monsterId = metadata.monsterId;
  }
  if (metadata.monster) {
    next.monster = metadata.monster;
  }
  return next;
}

function buildMonsterMetadata(monster) {
  if (!monster || typeof monster !== 'object') {
    return null;
  }

  const sanitized = sanitizeMonsterSnapshot(monster);
  if (!sanitized) {
    return null;
  }

  const metadata = { monster: sanitized };
  const monsterId = getMonsterIdentifier(sanitized);
  if (monsterId) {
    metadata.monsterId = monsterId;
  }

  const size = deriveMonsterTokenSize(sanitized);
  if (size) {
    metadata.size = size;
  }

  const hp = extractMonsterHp(sanitized);
  if (typeof hp === 'number' && Number.isFinite(hp)) {
    metadata.hp = hp;
  }

  const type = extractMonsterType(sanitized);
  if (type) {
    metadata.type = type;
  }

  return metadata;
}

function extractMonsterImageUrl(monster) {
  if (!monster || typeof monster !== 'object') {
    return '';
  }

  const candidates = [
    typeof monster.image === 'string' ? monster.image : null,
    typeof monster.image?.url === 'string' ? monster.image.url : null,
    typeof monster.image?.src === 'string' ? monster.image.src : null,
    typeof monster.imageUrl === 'string' ? monster.imageUrl : null,
    typeof monster.portrait === 'string' ? monster.portrait : null,
    typeof monster.portrait?.url === 'string' ? monster.portrait.url : null,
    typeof monster.avatar === 'string' ? monster.avatar : null,
    typeof monster.avatar?.url === 'string' ? monster.avatar.url : null,
  ];

  const match = candidates.find((value) => typeof value === 'string' && value.trim());
  return match ? match.trim() : '';
}

function extractMonsterType(monster) {
  if (!monster || typeof monster !== 'object') {
    return '';
  }

  const role = monster.role;
  if (typeof role === 'string' && role.trim()) {
    return role.trim();
  }
  if (role && typeof role.label === 'string' && role.label.trim()) {
    return role.label.trim();
  }
  if (role && typeof role.name === 'string' && role.name.trim()) {
    return role.name.trim();
  }
  if (Array.isArray(monster.roles)) {
    const labeledRole = monster.roles.find((entry) => typeof entry?.label === 'string' && entry.label.trim());
    if (labeledRole) {
      return labeledRole.label.trim();
    }
    const namedRole = monster.roles.find((entry) => typeof entry === 'string' && entry.trim());
    if (namedRole) {
      return namedRole.trim();
    }
  }

  const typeFields = [monster.type, monster.creatureType, monster.classification];
  for (const field of typeFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
    if (field && typeof field.label === 'string' && field.label.trim()) {
      return field.label.trim();
    }
  }

  if (Array.isArray(monster.tags)) {
    const tag = monster.tags.find((entry) => typeof entry === 'string' && entry.trim());
    if (tag) {
      return tag.trim();
    }
  }

  return '';
}

function extractMonsterSize(monster) {
  if (!monster || typeof monster !== 'object') {
    return '';
  }

  const size = monster.size;
  if (typeof size === 'string' && size.trim()) {
    return size.trim();
  }
  if (size && typeof size.label === 'string' && size.label.trim()) {
    return size.label.trim();
  }
  if (size && typeof size.name === 'string' && size.name.trim()) {
    return size.name.trim();
  }

  const sizeFields = [monster.dimensions?.space, monster.space, monster.traits?.size];
  for (const field of sizeFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }

  return '';
}

function deriveMonsterTokenSize(monster) {
  if (!monster || typeof monster !== 'object') {
    return '';
  }

  const seen = new Set();
  const candidates = [];

  const addCandidate = (value) => {
    if (value == null) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      candidates.push(trimmed);
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = `#${value}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push(value);
      return;
    }

    if (typeof value === 'object') {
      addCandidate(value.value);
      addCandidate(value.size);
      addCandidate(value.space);
      addCandidate(value.width);
      addCandidate(value.length);
    }
  };

  addCandidate(monster.token?.size);
  addCandidate(monster.token?.space);
  addCandidate(monster.token?.dimensions?.space);
  addCandidate(monster.token?.dimensions?.width);
  addCandidate(monster.token?.dimensions?.length);
  addCandidate(monster.dimensions?.space);
  addCandidate(monster.dimensions?.width);
  addCandidate(monster.dimensions?.length);
  addCandidate(monster.space);
  addCandidate(monster.traits?.space);
  addCandidate(monster.traits?.size);
  addCandidate(monster.attributes?.space);
  addCandidate(monster.attributes?.size);
  addCandidate(extractMonsterSize(monster));

  for (const candidate of candidates) {
    const normalized = normalizeMonsterSizeForToken(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function normalizeMonsterSizeForToken(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatSizeFromNumeric(value);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.toLowerCase();

  const gridPattern = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)/);
  if (gridPattern) {
    const width = Number.parseFloat(gridPattern[1]);
    const height = Number.parseFloat(gridPattern[2]);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return formatSizeFromDimensions(width, height);
    }
  }

  const rectanglePattern = normalized.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(?:ft|feet|foot|')\s*(?:by|x|×)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:ft|feet|foot|')/
  );
  if (rectanglePattern) {
    const widthFeet = Number.parseFloat(rectanglePattern[1]);
    const heightFeet = Number.parseFloat(rectanglePattern[2]);
    if (Number.isFinite(widthFeet) && Number.isFinite(heightFeet)) {
      return formatSizeFromFeet(widthFeet, heightFeet);
    }
  }

  const feetMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:ft|feet|foot|')/);
  if (feetMatch) {
    const feet = Number.parseFloat(feetMatch[1]);
    if (Number.isFinite(feet)) {
      return formatSizeFromFeet(feet, feet);
    }
  }

  const numberMatch = normalized.match(/^[0-9]+(?:\.[0-9]+)?$/);
  if (numberMatch) {
    const numeric = Number.parseFloat(numberMatch[0]);
    return formatSizeFromNumeric(numeric);
  }

  const keywordMap = [
    ['tiny', 1],
    ['small', 1],
    ['medium', 1],
    ['average', 1],
    ['standard', 1],
    ['large', 2],
    ['huge', 3],
    ['gargantuan', 4],
    ['colossal', 6],
  ];

  for (const [keyword, squares] of keywordMap) {
    if (normalized.includes(keyword)) {
      return `${squares}x${squares}`;
    }
  }

  return '';
}

function formatSizeFromNumeric(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  if (value <= 4) {
    const squares = Math.max(1, Math.round(value));
    return `${squares}x${squares}`;
  }

  return formatSizeFromFeet(value, value);
}

function formatSizeFromFeet(widthFeet, heightFeet) {
  const widthSquares = feetToSquares(widthFeet);
  const heightSquares = feetToSquares(heightFeet);
  if (!widthSquares || !heightSquares) {
    return '';
  }
  return `${widthSquares}x${heightSquares}`;
}

function formatSizeFromDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return '';
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return `${w}x${h}`;
}

function feetToSquares(feet) {
  if (!Number.isFinite(feet) || feet <= 0) {
    return 0;
  }

  const squares = Math.round(feet / 5);
  return Math.max(1, squares);
}

function extractMonsterHp(monster) {
  if (!monster || typeof monster !== 'object') {
    return null;
  }

  const stamina = monster.stamina;
  const staminaValue = stamina && typeof stamina === 'object' ? stamina.value : stamina;
  const candidates = [
    staminaValue,
    monster.stats?.stamina,
    monster.defenses?.stamina,
    monster.attributes?.hp,
    monster.hp,
  ];

  for (const candidate of candidates) {
    const numeric = toNumericValue(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function getMonsterIdentifier(monster) {
  const candidates = [monster.id, monster.uuid, monster.slug, monster.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return null;
}

function toNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const numeric = Number.parseInt(value.replace(/[^0-9-]/g, ''), 10);
    return Number.isNaN(numeric) ? null : numeric;
  }
  return null;
}

function sanitizeMonsterSnapshot(monster) {
  if (!monster || typeof monster !== 'object') {
    return null;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(monster);
    } catch (error) {
      // Fallback to JSON/recursive clone.
    }
  }

  try {
    return JSON.parse(JSON.stringify(monster));
  } catch (error) {
    return clonePlain(monster);
  }
}

function clonePlain(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
    }
    return value;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => clonePlain(item, seen));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const output = {};
  Object.keys(value).forEach((key) => {
    const item = value[key];
    if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) {
      return;
    }
    output[key] = clonePlain(item, seen);
  });
  return output;
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
