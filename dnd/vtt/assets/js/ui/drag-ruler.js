export function mountDragRuler() {
  const ruler = document.getElementById('vtt-distance-ruler');
  if (!ruler) return;

  document.addEventListener('keydown', (event) => {
    if (event.key === 'r') {
      toggleRuler(ruler, true);
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === 'r') {
      toggleRuler(ruler, false);
    }
  });
}

function toggleRuler(ruler, visible) {
  ruler.toggleAttribute('hidden', !visible);
}
