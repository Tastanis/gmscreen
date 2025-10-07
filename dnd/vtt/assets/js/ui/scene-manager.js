export function renderSceneList(routes, store) {
  const container = document.getElementById('scene-manager');
  if (!container) return;

  const render = (state) => {
    const { scenes, boardState } = state;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      container.innerHTML = '<p class="empty-state">No scenes yet. Create one to get started.</p>';
      return;
    }

    const items = scenes
      .map((scene) => {
        const isActive = boardState?.activeSceneId === scene.id;
        return `
          <article class="scene-item${isActive ? ' is-active' : ''}">
            <header class="scene-item__header">
              <h4>${scene.name ?? 'Untitled Scene'}</h4>
              <span class="scene-item__status">${isActive ? 'Active' : ''}</span>
            </header>
            <footer class="scene-item__footer">
              <button type="button" class="btn" data-action="activate-scene" data-scene-id="${scene.id}">Activate</button>
              <button type="button" class="btn" data-action="edit-scene" data-scene-id="${scene.id}">Edit</button>
            </footer>
          </article>
        `;
      })
      .join('');

    container.innerHTML = `<div class="scene-list">${items}</div>`;
  };

  render(store.getState());
  store.subscribe(render);
}
