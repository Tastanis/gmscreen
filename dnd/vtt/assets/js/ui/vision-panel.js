export function mountVisionPanel() {
  let panelEl = document.getElementById('vtt-fog-panel');
  if (!panelEl) {
    panelEl = createPanelElement();
    document.getElementById('vtt-app')?.appendChild(panelEl);
  }

  const launcher = document.querySelector('[data-settings-launch="fog"]');
  const syncLauncherActive = (open) => {
    if (!launcher) return;
    launcher.classList.toggle('is-active', open);
    launcher.setAttribute('aria-pressed', String(open));
  };
  if (launcher) {
    launcher.addEventListener('click', () => {
      const isOpen = !panelEl.hidden;
      panelEl.hidden = isOpen;
      syncLauncherActive(!isOpen);
    });
  }

  panelEl.querySelector('[data-fog-close]')?.addEventListener('click', () => {
    panelEl.hidden = true;
    syncLauncherActive(false);
  });

  panelEl.hidden = true;
}

function createPanelElement() {
  const div = document.createElement('div');
  div.id = 'vtt-fog-panel';
  div.className = 'vtt-fog-panel';
  div.hidden = true;
  div.innerHTML = `
    <div class="vtt-fog-panel__header">
      <h3 class="vtt-fog-panel__title">Fog of War</h3>
      <button type="button" class="vtt-fog-panel__close" data-fog-close>&times;</button>
    </div>
  `;
  return div;
}
