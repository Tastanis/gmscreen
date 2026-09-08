/** Camera-only controls. Never submits shared board commands. */
export function mountMapNavigation({ root, board, view, applyTransform, selectedBounds, report }) {
  if (!root || !board) return;
  const help = root.querySelector('[data-navigation-help]');
  function run(action) {
    if (action === 'help') {
      help.hidden = !help.hidden;
      root.querySelector('[data-map-navigation="help"]').setAttribute('aria-expanded', String(!help.hidden));
      return;
    }
    if (!view.mapLoaded) { report('Load a scene to navigate its map.'); return; }
    const width = board.clientWidth, height = board.clientHeight;
    if (action === 'fit') {
      view.scale = Math.max(view.minScale, Math.min(1, (width - 32) / view.mapPixelSize.width, (height - 100) / view.mapPixelSize.height));
      view.translation.x = (width - view.mapPixelSize.width * view.scale) / 2;
      view.translation.y = (height - view.mapPixelSize.height * view.scale) / 2;
    } else if (action === 'center') {
      const bounds = selectedBounds();
      if (!bounds) { report('Select a visible token to center the map on it.'); return; }
      view.translation.x = width / 2 - bounds.x * view.scale;
      view.translation.y = height / 2 - bounds.y * view.scale;
    } else {
      const previous = view.scale;
      view.scale = Math.max(view.minScale, Math.min(view.maxScale, previous * (action === 'in' ? 1.25 : 0.8)));
      view.translation.x = width / 2 - (width / 2 - view.translation.x) * view.scale / previous;
      view.translation.y = height / 2 - (height / 2 - view.translation.y) * view.scale / previous;
    }
    applyTransform();
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-map-navigation]');
    if (button) run(button.dataset.mapNavigation);
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !help.hidden) {
      event.preventDefault(); event.stopPropagation();
      run('help');
      root.querySelector('[data-map-navigation="help"]').focus();
    }
  });
  // Shortcuts apply only while the board itself has focus, never in sheets/chat.
  board.addEventListener('keydown', event => {
    if (event.target !== board || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const action = ({ '+':'in', '=':'in', '-':'out', 'f':'fit', 'c':'center', '?':'help' })[event.key.toLowerCase()];
    if (action) { event.preventDefault(); run(action); }
  });
}
