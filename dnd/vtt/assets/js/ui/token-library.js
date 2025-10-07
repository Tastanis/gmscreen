import { initializeTokenMaker } from './token-maker.js';
import { createToken, createTokenFolder } from '../services/token-service.js';

export function renderTokenLibrary(routes, store) {
  const moduleRoot = document.querySelector('[data-module="vtt-token-library"]');
  if (!moduleRoot) return;

  const listContainer = moduleRoot.querySelector('#token-template-list');
  const nameInput = moduleRoot.querySelector('[data-token-name-input]');
  const folderSelect = moduleRoot.querySelector('[data-token-folder-select]');
  const feedback = moduleRoot.querySelector('[data-token-feedback]');
  const createButtons = moduleRoot.querySelectorAll('[data-action="create-token"]');
  const folderButtons = moduleRoot.querySelectorAll('[data-action="create-token-folder"]');
  if (!listContainer) return;

  const maker = initializeTokenMaker(moduleRoot);

  const stateApi = store ?? {};
  const endpoints = routes ?? {};

  if (!endpoints.tokens) {
    createButtons.forEach((button) => {
      button.disabled = true;
      button.title = 'Token saving is unavailable right now.';
    });
    folderButtons.forEach((button) => {
      button.disabled = true;
      button.title = 'Token folders are unavailable right now.';
    });
  }

  const render = (state) => {
    const tokensState = normalizeTokenState(state?.tokens);
    updateFolderOptions(folderSelect, tokensState.folders);

    if (!tokensState.items.length) {
      listContainer.innerHTML = '<li class="token-template-list__empty">No tokens saved yet.</li>';
      return;
    }

    listContainer.innerHTML = buildTokenMarkup(tokensState);
  };

  render(stateApi.getState?.() ?? {});
  stateApi.subscribe?.((nextState) => render(nextState));

  moduleRoot.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    if (action === 'create-token-folder') {
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
        const token = await createToken(endpoints.tokens, {
          name,
          folderId,
          imageData: exportResult.dataUrl,
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

function buildTokenMarkup(tokenState) {
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

  if (!groups.length) {
    return '<li class="token-template-list__empty">No tokens saved yet.</li>';
  }

  return groups
    .map(
      (group) => `
        <li class="token-group" data-folder-id="${group.id ?? ''}">
          <div class="token-group__header">
            <h4 class="token-group__title">${escapeHtml(group.title)}</h4>
            <span class="token-group__count">${group.items.length}</span>
          </div>
          <ul class="token-group__list">
            ${group.items.map((token) => renderTokenItem(token)).join('')}
          </ul>
        </li>
      `
    )
    .join('');
}

function renderTokenItem(token) {
  const name = escapeHtml(token.name || 'Untitled Token');
  const thumb = renderTokenThumb(token);
  return `
    <li>
      <article class="token-item" draggable="true" data-token-id="${token.id}">
        ${thumb}
        <div class="token-item__meta">
          <h4>${name}</h4>
          <p>${token.type ? escapeHtml(token.type) : ''}</p>
        </div>
      </article>
    </li>
  `;
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

function ensureTokenDraft(draft) {
  if (!draft.tokens || typeof draft.tokens !== 'object') {
    draft.tokens = { folders: [], items: [] };
  } else {
    draft.tokens.folders = Array.isArray(draft.tokens.folders) ? draft.tokens.folders : [];
    draft.tokens.items = Array.isArray(draft.tokens.items) ? draft.tokens.items : [];
  }
}
