import { restrictTokensToPlayerView } from '../state/store.js';

export function buildPlayerPreviewState(preview, tokens) {
  const canonical = preview.snapshot.state,
    sceneId = canonical.routing?.activeSceneId;
  return {
    tokens: restrictTokensToPlayerView(tokens ?? { items: [], folders: [] }),
    boardState: {
      activeSceneId: sceneId,
      sceneState: {
        [sceneId]: { ...canonical.sceneConfig?.[sceneId], combat: canonical.combat?.[sceneId] ?? {} },
      },
      placements: { [sceneId]: Object.values(canonical.placements?.[sceneId] ?? {}) },
    },
  };
}

/** A separate document keeps the captured player's renderer and camera isolated from the live board. */
export async function createPlayerPreviewMap(preview, { levelId, tokens, host }) {
  const state = buildPlayerPreviewState(preview, tokens);
  if (!state.boardState.activeSceneId || !preview.snapshot.state.routing?.mapUrl)
    throw Error('The player map is closed.');
  const stage = document.createElement('iframe');
  stage.title = 'Captured player board';
  stage.inert = true;
  const width = Math.max(640, host.clientWidth),
    height = Math.max(420, window.innerHeight - 300);
  stage.style.cssText = `width:${width}px;height:${height}px;border:0;transform-origin:top left`;
  const frame = document.createElement('div');
  frame.style.cssText = 'position:relative;overflow:hidden';
  frame.append(stage);
  host.replaceChildren(frame);
  const doc = stage.contentDocument;
  const base = doc.createElement('base');
  base.href = new URL('/dnd/vtt/', location.href).href;
  doc.head.append(base);
  doc.documentElement.className = 'vtt3d-on';
  for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet.href;
    doc.head.append(link);
  }
  const map = doc.createElement('script');
  map.type = 'importmap';
  map.textContent = document.querySelector('script[type="importmap"]').textContent;
  doc.head.append(map);
  doc.body.style.cssText = 'margin:0;overflow:hidden';
  doc.body.innerHTML =
    '<main id="vtt-board-canvas" style="position:absolute;inset:0"><div id="vtt-map-surface"><div id="vtt-map-transform"><div id="vtt-map-backdrop" class="vtt-board__map-backdrop"><img hidden id="vtt-map-image" alt=""></div></div></div></main>';
  const start = doc.createElement('script');
  start.type = 'module';
  start.src = new URL('./player-preview-frame.js', import.meta.url).href;
  await new Promise((resolve, reject) => {
    start.onload = resolve;
    start.onerror = () => reject(Error('Player preview failed to load.'));
    doc.head.append(start);
  });
  if (stage.isConnected) await stage.contentWindow.startPlayerPreview(preview, state, levelId);
  return { stage, frame, width, height };
}
