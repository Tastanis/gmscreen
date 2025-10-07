import { initializeTokenMaker } from './token-maker.js';

export function renderTokenLibrary(routes, store) {
  const moduleRoot = document.querySelector('[data-module="vtt-token-library"]');
  if (!moduleRoot) return;

  const listContainer = moduleRoot.querySelector('#token-template-list');
  if (!listContainer) return;

  initializeTokenMaker(moduleRoot);

  const render = (state) => {
    const { tokens } = state;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      listContainer.innerHTML = '<li class="token-template-list__empty">No tokens available.</li>';
      return;
    }

    listContainer.innerHTML = tokens
      .map((token) => {
        return `
          <li>
            <article class="token-item" draggable="true" data-token-id="${token.id}">
              <div class="token-item__thumb" aria-hidden="true"></div>
              <div class="token-item__meta">
                <h4>${token.name ?? 'Unnamed Token'}</h4>
                <p>${token.type ?? ''}</p>
              </div>
            </article>
          </li>
        `;
      })
      .join('');
  };

  render(store.getState());
  store.subscribe(render);
}
