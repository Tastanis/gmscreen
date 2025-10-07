export function mountBoardInteractions(store) {
  const board = document.getElementById('vtt-board-canvas');
  const grid = document.getElementById('vtt-grid-overlay');
  if (!board) return;

  board.addEventListener('keydown', (event) => {
    const movement = movementFromKey(event.key);
    if (!movement) return;

    event.preventDefault();
    console.info('[VTT] Token movement pending implementation', movement);
  });

  const toggleGridButton = document.querySelector('[data-action="toggle-grid"]');
  if (toggleGridButton && grid) {
    toggleGridButton.addEventListener('click', () => {
      grid.classList.toggle('is-visible');
    });
  }
}

function movementFromKey(key) {
  switch (key) {
    case 'ArrowUp':
      return { x: 0, y: -1 };
    case 'ArrowDown':
      return { x: 0, y: 1 };
    case 'ArrowLeft':
      return { x: -1, y: 0 };
    case 'ArrowRight':
      return { x: 1, y: 0 };
    default:
      return null;
  }
}
