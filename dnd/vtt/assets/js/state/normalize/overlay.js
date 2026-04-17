import { roundToPrecision } from './helpers.js';

export const OVERLAY_LAYER_PREFIX = 'overlay-layer-';

const overlayLayerSeed = Date.now();
let overlayLayerSequence = 0;

export function normalizeOverlayEntry(raw) {
  const overlay = createEmptyOverlayState();
  if (!raw || typeof raw !== 'object') {
    return overlay;
  }

  if (typeof raw.mapUrl === 'string') {
    const trimmed = raw.mapUrl.trim();
    if (trimmed) {
      overlay.mapUrl = trimmed;
    }
  }

  const layerSource = Array.isArray(raw.layers)
    ? raw.layers
    : Array.isArray(raw.items)
    ? raw.items
    : [];

  overlay.layers = layerSource
    .map((entry, index) => normalizeOverlayLayerEntry(entry, index))
    .filter(Boolean);

  if (overlay.mapUrl) {
    const preferredId = raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId ?? null;
    let assigned = false;
    overlay.layers = overlay.layers.map((layer, index) => {
      if (layer.mapUrl) {
        return layer;
      }

      if (!assigned && (layer.id === preferredId || index === 0)) {
        assigned = true;
        return { ...layer, mapUrl: overlay.mapUrl };
      }

      return layer;
    });
  }

  const legacyMask = normalizeOverlayMaskEntry(raw.mask ?? null);
  if (
    !overlay.layers.length &&
    (maskHasMeaningfulContent(legacyMask) || typeof raw.name === 'string' || raw.visible !== undefined)
  ) {
    const legacyLayer = normalizeOverlayLayerEntry(
      {
        id: typeof raw.id === 'string' ? raw.id : undefined,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        visible: raw.visible,
        mask: legacyMask,
      },
      0
    );
    if (legacyLayer) {
      overlay.layers.push(legacyLayer);
    }
  }

  overlay.activeLayerId = resolveOverlayActiveLayerId(
    raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId,
    overlay.layers
  );

  rebuildOverlayAggregate(overlay);
  return overlay;
}

export function normalizeOverlayLayerEntry(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const mask = normalizeOverlayMaskEntry(raw.mask ?? raw);
  const idSource = typeof raw.id === 'string' ? raw.id.trim() : '';
  const nameSource = typeof raw.name === 'string' ? raw.name.trim() : '';
  const visible = raw.visible === undefined ? true : Boolean(raw.visible);
  const mapUrlSource = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const id = idSource || createOverlayLayerId();
  const name = nameSource || `Overlay ${index + 1}`;

  return {
    id,
    name,
    visible,
    mask,
    mapUrl: mapUrlSource || null,
  };
}

function createOverlayLayerId() {
  overlayLayerSequence += 1;
  return `${OVERLAY_LAYER_PREFIX}${overlayLayerSeed.toString(36)}-${overlayLayerSequence.toString(36)}`;
}

export function createEmptyOverlayState() {
  return { mapUrl: null, mask: createEmptyOverlayMask(), layers: [], activeLayerId: null };
}

export function createEmptyOverlayMask() {
  return { visible: true, polygons: [] };
}

export function rebuildOverlayAggregate(overlay) {
  if (!overlay || typeof overlay !== 'object') {
    return createEmptyOverlayState();
  }

  overlay.mask = buildAggregateMask(Array.isArray(overlay.layers) ? overlay.layers : []);
  overlay.activeLayerId = resolveOverlayActiveLayerId(overlay.activeLayerId, overlay.layers);
  overlay.mapUrl = resolveOverlayMapUrl(overlay.layers, overlay.activeLayerId);
  return overlay;
}

function resolveOverlayMapUrl(layers = [], activeLayerId = null) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }

  if (activeLayerId) {
    const activeLayer = layers.find((layer) => layer && layer.id === activeLayerId);
    if (activeLayer?.mapUrl) {
      return activeLayer.mapUrl;
    }
  }

  const visibleLayer = layers.find((layer) => layer && layer.visible !== false && layer.mapUrl);
  if (visibleLayer?.mapUrl) {
    return visibleLayer.mapUrl;
  }

  const firstWithMap = layers.find((layer) => layer?.mapUrl);
  return firstWithMap?.mapUrl ?? null;
}

function buildAggregateMask(layers = []) {
  const aggregate = createEmptyOverlayMask();
  let hasVisibleLayer = false;

  layers.forEach((layer) => {
    if (!layer || typeof layer !== 'object' || layer.visible === false) {
      return;
    }

    const mask = normalizeOverlayMaskEntry(layer.mask ?? {});
    if (mask.visible === false) {
      return;
    }

    hasVisibleLayer = true;
    if (!aggregate.url && mask.url) {
      aggregate.url = mask.url;
    }

    if (Array.isArray(mask.polygons)) {
      mask.polygons.forEach((polygon) => {
        const points = Array.isArray(polygon?.points) ? polygon.points : [];
        if (points.length >= 3) {
          aggregate.polygons.push({
            points: points.map((point) => ({
              column: roundToPrecision(Number(point?.column ?? point?.x ?? 0), 4),
              row: roundToPrecision(Number(point?.row ?? point?.y ?? 0), 4),
            })),
          });
        }
      });
    }
  });

  aggregate.visible = hasVisibleLayer;
  return aggregate;
}

function resolveOverlayActiveLayerId(preferredId, layers = []) {
  const entries = Array.isArray(layers) ? layers : [];
  if (!entries.length) {
    return null;
  }

  if (typeof preferredId === 'string') {
    const trimmed = preferredId.trim();
    if (trimmed) {
      const preferredLayer = entries.find((layer) => layer && layer.id === trimmed);
      if (preferredLayer && preferredLayer.visible !== false) {
        return preferredLayer.id;
      }
    }
  }

  const visibleLayer = entries.find((layer) => layer && layer.visible !== false && layer.id);
  if (visibleLayer) {
    return visibleLayer.id;
  }

  const fallback = entries.find((layer) => layer && layer.id);
  return fallback ? fallback.id : null;
}

function normalizeOverlayMaskEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayMask();
  }

  const normalized = {
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
    polygons: [],
  };

  if (typeof raw.url === 'string') {
    const trimmed = raw.url.trim();
    if (trimmed) {
      normalized.url = trimmed;
    }
  }

  const polygons = Array.isArray(raw.polygons) ? raw.polygons : [];
  polygons.forEach((polygon) => {
    const pointsSource = Array.isArray(polygon?.points)
      ? polygon.points
      : Array.isArray(polygon)
      ? polygon
      : [];
    if (!Array.isArray(pointsSource)) {
      return;
    }

    const points = pointsSource.map((point) => normalizeOverlayPoint(point)).filter(Boolean);
    if (points.length >= 3) {
      normalized.polygons.push({ points });
    }
  });

  return normalized;
}

function maskHasMeaningfulContent(mask = {}) {
  if (!mask || typeof mask !== 'object') {
    return false;
  }

  if (typeof mask.url === 'string' && mask.url.trim()) {
    return true;
  }

  return Array.isArray(mask.polygons) ? mask.polygons.length > 0 : false;
}

function normalizeOverlayPoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const column = Number(point.column ?? point.x);
  const row = Number(point.row ?? point.y);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }

  return {
    column: roundToPrecision(column, 4),
    row: roundToPrecision(row, 4),
  };
}

export function syncBoardOverlayState(boardState) {
  if (!boardState || typeof boardState !== 'object') {
    return;
  }

  if (!boardState.sceneState || typeof boardState.sceneState !== 'object') {
    boardState.overlay = createEmptyOverlayState();
    return;
  }

  Object.keys(boardState.sceneState).forEach((sceneId) => {
    const entry = boardState.sceneState[sceneId];
    if (!entry || typeof entry !== 'object') {
      return;
    }

    entry.overlay = normalizeOverlayEntry(entry.overlay ?? null);
  });

  const activeSceneId =
    typeof boardState.activeSceneId === 'string' ? boardState.activeSceneId.trim() : '';

  if (activeSceneId && boardState.sceneState[activeSceneId]) {
    boardState.overlay = normalizeOverlayEntry(
      boardState.sceneState[activeSceneId].overlay ?? boardState.overlay ?? null
    );
    return;
  }

  boardState.overlay = normalizeOverlayEntry(boardState.overlay ?? null);
}
