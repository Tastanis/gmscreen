import { shownOnThisPage } from './drawing-tool.js';
import { pickView, floorDrawn } from './pointer-pick.mjs';
import { coverFor } from './cover-check.mjs';
import { normalizeCombatTeam } from '../combat/combat-state.js';
import { normalizeGridState } from '../state/normalize/grid.js';
import { renderPlayerPreviewTokens } from './player-preview-tokens.js';
import { sample } from './terrain-math.mjs';
import { rampHeight, rampAt } from './imported-ramps.mjs';
import { resolveSupportSurfaces } from './floor-support.js';
import { sceneZones, zonesHiddenFromPlayers } from './terrain-zones.mjs';

// This document receives a single server-projected snapshot. It has no live store,
// presence subscription, command transport or tools that can edit that snapshot.
window.startPlayerPreview = async (preview, state, levelId) => {
  const raw = preview.snapshot.state,
    sceneId = state.boardState.activeSceneId;
  const config = state.boardState.sceneState[sceneId],
    levels = config.mapLevels?.levels ?? [];
  const environment = config.environment ?? {},
    field = environment.terrain?.value,
    walls = { nodes: [], segments: [], roofs: [], ramps: [], ...environment.walls?.value };
  const grid = normalizeGridState(config.grid),
    image = document.getElementById('vtt-map-image');
  image.src = raw.routing.mapUrl;
  await image.decode();
  const padding = getComputedStyle(image.parentElement);
  const insets = Object.fromEntries(
    ['left', 'right', 'top', 'bottom'].map((side) => [
      side,
      parseFloat(padding.getPropertyValue('padding-' + side)) || 0,
    ])
  );
  const offsets = { ...insets, left: insets.left + grid.offsetX, top: insets.top + grid.offsetY };
  const view = {
    mapLoaded: true,
    activeMapUrl: raw.routing.mapUrl,
    gridSize: grid.size,
    gridOffsets: offsets,
    mapInsets: insets,
    mapPixelSize: {
      width: image.naturalWidth + insets.left + insets.right,
      height: image.naturalHeight + insets.top + insets.bottom,
    },
  };
  const stage = document.getElementById('vtt-map-transform');
  const layer = renderPlayerPreviewTokens(stage, state, view, levelId);
  layer.id = 'vtt-token-layer';
  const nodes = new Map();
  for (const node of layer.children) {
    node.dataset.placementId = node.dataset.previewPlacementId;
    nodes.set(node.dataset.placementId, node);
  }
  const placements = state.boardState.placements[sceneId].filter((p) => nodes.has(p.id) && !p.hidden);
  const context = {
    sceneId,
    placements,
    selectedIds: [],
    isGM: false,
    user: { name: preview.userId, isGM: false },
    viewerLevelId: levelId,
    environment,
    sceneConfig: config,
    levels,
    mapLevels: config.mapLevels,
    grid,
    view,
    mapUrl: raw.routing.mapUrl,
  };
  state.boardState.templates = { [sceneId]: Object.values(raw.templates?.[sceneId] ?? {}) };
  window.terrainContext = () => ({
    state,
    view,
    isGM: false,
    levelId,
    userId: preview.userId,
    selectedIds: [],
  });
  const heightAt = (x, y) =>
    field ? sample(field, (x - insets.left) / image.naturalWidth, (y - insets.top) / image.naturalHeight) : 0;
  window.terrainPrototype = { active: !!field, field, fieldVersion: 1, heightAt, markersVisible: false };
  window.wallPrototype = { model: walls, revision: 1 };
  const floorHeight = (id) => Number(levels.find((l) => l.id === id)?.elevationSquares) || 0;
  const surfaces = resolveSupportSurfaces(walls);
  function heightFor(id) {
    const p = placements.find((p) => p.id === id);
    if (!p) return 0;
    const x = p.column + (p.width || 1) / 2,
      y = p.row + (p.height || 1) / 2;
    if (['fly', 'hover'].includes(p.movementMode) && Number.isFinite(p.flightHeight))
      return Math.max(floorHeight(p.levelId), p.flightHeight);
    const ramp = p._floorTraversal && rampAt(walls.ramps || [], { x, y });
    if (ramp) return rampHeight(ramp, x, y);
    return (
      surfaces.find((s) => s.id === p._supportSurfaceId)?.height ??
      (p.levelId && p.levelId !== 'level-0'
        ? floorHeight(p.levelId)
        : heightAt(offsets.left + x * grid.size, offsets.top + y * grid.size))
    );
  }
  const primaryId = config.pcTokenAssociations?.[preview.userId];
  window.gmVision = {
    playerStanding: nodes.has(primaryId) ? { id: primaryId, height: heightFor(primaryId) } : null,
  };
  window.terrainPrototype.heightShown = z => {
    if (!field) return null;
    const token = placements.find(p => p.id === primaryId);
    const ground = token ? heightFor(token.id) : floorHeight(levelId);
    const viewer = pickView({token: token ?? {column:0,row:0,width:1,height:1}, ground});
    return z <= 0 || floorDrawn(z, viewer);
  };
  window.terrainZones = {
    zones: sceneZones(state.boardState.sceneState, sceneId),
    visible: true,
    hiddenFromPlayers: zonesHiddenFromPlayers(environment.zones),
  };
  const drawings = Object.values(raw.drawings?.[sceneId] ?? {}).filter(
    (d) => Array.isArray(d.points) && d.points.length > 1 && shownOnThisPage({levelId}, d)
  );
  const subscribers = new Set();
  function applySight() {
    const sight = window.vttSightTest;
    const viewers = (sight?.viewerIds ?? []).map(id => placements.find(p => p.id === id)).filter(Boolean);
    context.placements = !sight?.on || !viewers.length ? placements : placements.filter(target => {
      const team = normalizeCombatTeam(target.combatTeam ?? target.team);
      if ((team && team !== 'enemy') || viewers.includes(target)) return true;
      return viewers.some(actor => !coverFor({
        actor, target, walls,
        groundAt: (x, y) => heightAt(offsets.left + x * grid.size, offsets.top + y * grid.size),
        groundFor: token => heightFor(token.id),
      }).noLineOfEffect);
    });
    for (const subscriber of subscribers) subscriber(context);
  }
  document.addEventListener('vtt:sight-test-changed', applySight);
  window.vtt3dBridge = {
    getContext: () => context,
    subscribe: (listener) => { subscribers.add(listener); return () => subscribers.delete(listener); },
    heightFor,
    getTokenElement: (id) => nodes.get(id),
    canEndZone: () => false,
    drawingView: () => ({ drawings }),
    readOnly: true,
  };
  const ready = new Promise((resolve, reject) => {
    document.addEventListener(
      'vtt3d:ready',
      () => (window.vtt3d?.active ? resolve() : reject(Error('Could not render the captured scene.'))),
      { once: true }
    );
    document.addEventListener('vtt3d:error', () => reject(Error('Could not open the captured board.')), {
      once: true,
    });
  });
  await import('../../../board3d/integration.mjs');
  await ready;
  const { startSight } = await import('../../../board3d/sight-test.mjs');
  await startSight({ readOnly: true });
};
