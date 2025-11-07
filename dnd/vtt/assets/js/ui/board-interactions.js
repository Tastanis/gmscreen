import {
  beginExternalMeasurement,
  cancelExternalMeasurement,
  finalizeExternalMeasurement,
  isMeasureModeActive,
  updateExternalMeasurement,
} from './drag-ruler.js';
import { persistBoardState, persistCombatState } from '../services/board-state-service.js';
import {
  PLAYER_VISIBLE_TOKEN_FOLDER,
  normalizeMonsterSnapshot,
  normalizePlayerTokenFolderName,
} from '../state/store.js';
import { close as closeMonsterStatBlock, open as openMonsterStatBlock } from './monster-stat-block.js';
import { createCombatTimerService } from '../services/combat-timer-service.js';
import { showCombatTimerReport } from './combat-timer-report.js';

const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
let overlayLayerSeed = Date.now();
let overlayLayerSequence = 0;

export function createBoardStatePoller({
  routes,
  stateEndpoint,
  boardApi = {},
  fetchFn = typeof fetch === 'function' ? fetch : null,
  windowRef = typeof window === 'undefined' ? undefined : window,
  documentRef = typeof document === 'undefined' ? undefined : document,
  hashBoardStateSnapshotFn = (snapshot) => {
    try {
      return JSON.stringify(snapshot);
    } catch (error) {
      return null;
    }
  },
  safeJsonStringifyFn = (value) => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return null;
    }
  },
  mergeBoardStateSnapshotFn = (existing, incoming) => incoming ?? existing ?? {},
  getCurrentUserIdFn = () => null,
  normalizeProfileIdFn = (value) => value,
  getPendingSaveInfo = () => ({ pending: false }),
  getLastPersistedHashFn = () => null,
  getLastPersistedSignatureFn = () => null,
} = {}) {
  const endpoint = stateEndpoint ?? routes?.state ?? null;

  let isPolling = false;
  let lastHash = null;
  let pollErrorLogged = false;

  async function poll() {
    if (isPolling) {
      return;
    }
    if (!endpoint || typeof fetchFn !== 'function') {
      return;
    }
    if (documentRef && documentRef.visibilityState === 'hidden') {
      return;
    }

    isPolling = true;
    try {
      const response = await fetchFn(endpoint, { cache: 'no-store' });
      if (!response?.ok) {
        throw new Error(`Unexpected status ${response?.status ?? 'unknown'}`);
      }

      const payload = (await response.json().catch(() => ({}))) ?? {};
      const incoming = payload?.data?.boardState ?? null;
      if (!incoming || typeof incoming !== 'object') {
        return;
      }

      const hashCandidate = hashBoardStateSnapshotFn(incoming);
      const hashFallback = safeJsonStringifyFn(incoming) ?? String(Date.now());
      const hash = hashCandidate ?? hashFallback;
      if (hash === lastHash) {
        pollErrorLogged = false;
        return;
      }

      const pendingSaveInfo = getPendingSaveInfo?.() ?? {};
      const hasPendingSave = Boolean(
        pendingSaveInfo?.pending ||
          pendingSaveInfo?.promise ||
          pendingSaveInfo?.signature ||
          pendingSaveInfo?.hash
      );

      if (hasPendingSave) {
        lastHash = hash;
        pollErrorLogged = false;
        return;
      }

      const snapshotMetadata = incoming?.metadata ?? incoming?.meta ?? null;
      const snapshotSignature =
        typeof snapshotMetadata?.signature === 'string'
          ? snapshotMetadata.signature.trim()
          : null;
      const snapshotAuthorId = normalizeProfileIdFn(
        snapshotMetadata?.authorId ?? snapshotMetadata?.holderId ?? null
      );
      const snapshotUpdatedAtRaw = Number(
        snapshotMetadata?.updatedAt ?? snapshotMetadata?.timestamp
      );
      const snapshotUpdatedAt = Number.isFinite(snapshotUpdatedAtRaw)
        ? snapshotUpdatedAtRaw
        : 0;
      const snapshotAuthorRole =
        typeof snapshotMetadata?.authorRole === 'string'
          ? snapshotMetadata.authorRole.trim().toLowerCase()
          : '';
      const snapshotAuthorIsGm = Boolean(
        snapshotMetadata?.authorIsGm || snapshotAuthorRole === 'gm'
      );

      const currentState = boardApi.getState?.() ?? {};
      const currentMetadata =
        currentState?.boardState?.metadata ?? currentState?.boardState?.meta ?? null;
      const currentSignature =
        typeof currentMetadata?.signature === 'string'
          ? currentMetadata.signature.trim()
          : null;
      const currentAuthorRole =
        typeof currentMetadata?.authorRole === 'string'
          ? currentMetadata.authorRole.trim().toLowerCase()
          : '';
      const currentAuthorIsGm = Boolean(
        currentMetadata?.authorIsGm || currentAuthorRole === 'gm'
      );
      const currentUpdatedAtRaw = Number(
        currentMetadata?.updatedAt ?? currentMetadata?.timestamp
      );
      const currentUpdatedAt = Number.isFinite(currentUpdatedAtRaw)
        ? currentUpdatedAtRaw
        : 0;
      const currentUserId = normalizeProfileIdFn(getCurrentUserIdFn());
      const incomingHash = hashCandidate;
      const lastPersistedHash = getLastPersistedHashFn?.() ?? null;
      const lastPersistedSignature = getLastPersistedSignatureFn?.() ?? null;

      const authoredSnapshot = Boolean(
        (snapshotSignature && snapshotSignature === lastPersistedSignature) ||
          (snapshotAuthorId && currentUserId && snapshotAuthorId === currentUserId) ||
          (incomingHash && incomingHash === lastPersistedHash)
      );

      if (authoredSnapshot) {
        lastHash = hash;
        pollErrorLogged = false;
        return;
      }

      if (
        currentAuthorIsGm &&
        currentUpdatedAt > 0 &&
        (!snapshotAuthorIsGm ||
          currentUpdatedAt > snapshotUpdatedAt ||
          (currentUpdatedAt === snapshotUpdatedAt &&
            currentSignature &&
            snapshotSignature &&
            currentSignature === snapshotSignature))
      ) {
        lastHash = hash;
        pollErrorLogged = false;
        return;
      }

      lastHash = hash;
      pollErrorLogged = false;

      boardApi.updateState?.((draft) => {
        draft.boardState = mergeBoardStateSnapshotFn(
          draft.boardState,
          incoming
        );
      });
    } catch (error) {
      if (!pollErrorLogged) {
        console.warn('[VTT] Board state poll failed', error);
        pollErrorLogged = true;
      }
    } finally {
      isPolling = false;
    }
  }

  function start() {
    if (!endpoint || typeof windowRef?.setInterval !== 'function' || typeof fetchFn !== 'function') {
      return { stop() {} };
    }

    poll();
    const intervalId = windowRef.setInterval(poll, 2000);
    return {
      stop() {
        if (typeof windowRef?.clearInterval === 'function') {
          windowRef.clearInterval(intervalId);
        }
      },
    };
  }

  return { poll, start };
}

export async function createOverlayCutoutBlob({
  mapUrl,
  polygons,
  polygon,
  view = {},
  documentRef = typeof document !== 'undefined' ? document : null,
} = {}) {
  const url = typeof mapUrl === 'string' ? mapUrl.trim() : '';
  const normalizedPolygons = [];

  const appendPolygon = (entry) => {
    const points = Array.isArray(entry?.points) ? entry.points : [];
    const normalizedPoints = points
      .map((point) => {
        const column = Number(point?.column ?? point?.x);
        const row = Number(point?.row ?? point?.y);
        return Number.isFinite(column) && Number.isFinite(row)
          ? { column, row }
          : null;
      })
      .filter(Boolean);

    if (normalizedPoints.length >= 3) {
      normalizedPolygons.push(normalizedPoints);
    }
  };

  if (Array.isArray(polygons)) {
    polygons.forEach(appendPolygon);
  } else if (polygon) {
    appendPolygon(polygon);
  }

  if (!documentRef || !url || normalizedPolygons.length === 0) {
    return null;
  }

  const image = await loadImageForCutout(url, documentRef).catch(() => null);
  if (!image) {
    return null;
  }

  const mapWidth = Number.isFinite(view?.mapPixelSize?.width)
    ? view.mapPixelSize.width
    : image.naturalWidth || image.width || 0;
  const mapHeight = Number.isFinite(view?.mapPixelSize?.height)
    ? view.mapPixelSize.height
    : image.naturalHeight || image.height || 0;

  if (!mapWidth || !mapHeight) {
    return null;
  }

  const canvas = documentRef.createElement('canvas');
  canvas.width = mapWidth;
  canvas.height = mapHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, mapWidth, mapHeight);
  context.drawImage(image, 0, 0, mapWidth, mapHeight);

  const offsets = view?.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
  const gridSize = Math.max(8, Number.isFinite(view?.gridSize) ? view.gridSize : 64);

  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = '#fff';
  context.beginPath();

  let hasPath = false;

  normalizedPolygons.forEach((points) => {
    points.forEach((point, index) => {
      const x = offsetLeft + point.column * gridSize;
      const y = offsetTop + point.row * gridSize;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.closePath();
    hasPath = true;
  });

  if (hasPath) {
    context.fill();
  }

  context.restore();

  const blob = await canvasToBlob(canvas, 'image/png');
  return blob;
}

export async function uploadMap(file, endpoint, fileName) {
  if (!endpoint) {
    throw new Error('Upload endpoint is not defined');
  }

  const formData = new FormData();
  const fallbackName = 'map.png';
  const providedName = typeof fileName === 'string' ? fileName.trim() : '';
  const inferredName = typeof file?.name === 'string' ? file.name.trim() : '';
  const resolvedName = providedName || inferredName || fallbackName;

  formData.append('map', file, resolvedName);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response?.ok) {
    const message = await safeReadError(response);
    throw new Error(message || `Upload failed with status ${response?.status ?? 'unknown'}`);
  }

  const payload = await response.json();
  if (!payload?.success) {
    throw new Error(payload?.error || 'Upload failed');
  }

  const url = typeof payload?.data?.url === 'string' ? payload.data.url.trim() : '';
  return url || null;
}

export const overlayUploadHelpers = {
  createOverlayCutoutBlob,
  uploadMap,
};

async function canvasToBlob(canvas, type = 'image/png') {
  if (typeof canvas?.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, type);
    });
  }

  if (typeof canvas?.convertToBlob === 'function') {
    try {
      return await canvas.convertToBlob({ type });
    } catch (error) {
      return null;
    }
  }

  return null;
}

async function loadImageForCutout(url, documentRef) {
  return new Promise((resolve, reject) => {
    const image = documentRef.createElement('img');
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = url;
  });
}

async function safeReadError(response) {
  try {
    const payload = await response.json();
    return payload?.error ?? '';
  } catch (error) {
    return '';
  }
}

const TURN_TIMER_DURATION_MS = 60000;
const TURN_TIMER_STAGE_INTERVAL_MS = 20000;
const TURN_TIMER_INITIAL_DISPLAY = '1:00';
const TURN_TIMER_COUNTUP_INITIAL_DISPLAY = '0:00';
const TURN_TIMER_STAGE_FALLBACK = 'full';
const TURN_TIMER_WARNING_YELLOW_THRESHOLD_MS = 30000;
const TURN_TIMER_WARNING_RED_THRESHOLD_MS = 10000;
const INDIGO_ROTATION_INTERVAL_MS = 60000;
const INDIGO_ROTATION_INCREMENT_DEGREES = 45;
const TURN_INDICATOR_DEFAULT_TEXT = 'Waiting for turn';
const TURN_INDICATOR_GM_TEXT = "GM's turn";
const TURN_FLASH_TONE_CLASSES = {
  yellow: 'is-turn-flash-yellow',
  red: 'is-turn-flash-red',
};
const MAP_PING_ANIMATION_DURATION_MS = 900;
const MAP_PING_RETENTION_MS = 10000;
const MAP_PING_HISTORY_LIMIT = 8;
const MAP_PING_PROCESSED_RETENTION_MS = 60000;

export function mountBoardInteractions(store, routes = {}) {
  const board = document.getElementById('vtt-board-canvas');
  const mapSurface = document.getElementById('vtt-map-surface');
  const mapTransform = document.getElementById('vtt-map-transform');
  let mapOverlay = document.getElementById('vtt-map-overlay');
  let overlayStack = mapOverlay?.querySelector('.vtt-board__map-overlay-stack') ?? null;
  const overlayLayerElements = new Map();
  const grid = document.getElementById('vtt-grid-overlay');
  const tokenLayer = document.getElementById('vtt-token-layer');
  const templateLayer = document.getElementById('vtt-template-layer');
  let pingLayer = document.getElementById('vtt-ping-layer');
  const mapBackdrop = document.getElementById('vtt-map-backdrop');
  const mapImage = document.getElementById('vtt-map-image');
  const emptyState = board?.querySelector('.vtt-board__empty');
  const status = document.getElementById('active-scene-status');
  const sceneName = document.getElementById('active-scene-name');
  const appMain = document.getElementById('vtt-main');
  const combatTrackerRoot = document.querySelector('[data-combat-tracker]');
  const combatTrackerWaiting = combatTrackerRoot?.querySelector('[data-combat-tracker-waiting]');
  const combatTrackerCompleted = combatTrackerRoot?.querySelector('[data-combat-tracker-completed]');
  const uploadButton = document.querySelector('[data-action="upload-map"]');
  const uploadInput = document.getElementById('vtt-map-upload-input');
  const templatesButton = document.querySelector('[data-action="open-templates"]');
  const sceneListContainer = document.getElementById('scene-manager');
  const groupButton = document.querySelector('[data-action="group-combatants"]');
  const startCombatButton = document.querySelector('[data-action="start-combat"]');
  const damageHealButton = document.querySelector('[data-action="damage-heal"]');
  const roundTracker = document.querySelector('[data-round-tracker]');
  const roundValue = roundTracker?.querySelector('[data-round-value]');
  const turnIndicator = document.querySelector('[data-turn-indicator]');
  const turnTimerElement = document.querySelector('[data-turn-timer]');
  const turnTimerImage = turnTimerElement?.querySelector('[data-turn-timer-image]');
  const turnTimerDisplay = turnTimerElement?.querySelector('[data-turn-timer-display]');
  const conditionBannerRegion = document.querySelector('[data-condition-banner-region]');
  if (!board || !mapSurface || !mapTransform || !mapBackdrop || !mapImage || !templateLayer) return;
  if (!mapOverlay && mapTransform) {
    mapOverlay = document.createElement('div');
    mapOverlay.id = 'vtt-map-overlay';
    mapOverlay.className = 'vtt-board__map-overlay';
    mapOverlay.setAttribute('aria-hidden', 'true');
    mapOverlay.hidden = true;
    const overlayInsertTarget = grid ?? templateLayer;
    if (overlayInsertTarget && overlayInsertTarget.parentNode === mapTransform) {
      mapTransform.insertBefore(mapOverlay, overlayInsertTarget);
    } else {
      mapTransform.appendChild(mapOverlay);
    }
  }
  if (mapOverlay && !overlayStack) {
    overlayStack = document.createElement('div');
    overlayStack.className = 'vtt-board__map-overlay-stack';
    mapOverlay.prepend(overlayStack);
  }
  if (!pingLayer && mapTransform) {
    pingLayer = document.createElement('div');
    pingLayer.id = 'vtt-ping-layer';
    pingLayer.className = 'vtt-board__pings';
    pingLayer.setAttribute('aria-hidden', 'true');
    if (tokenLayer && tokenLayer.parentNode === mapTransform) {
      tokenLayer.insertAdjacentElement('afterend', pingLayer);
    } else {
      mapTransform.appendChild(pingLayer);
    }
  }
  if (!mapOverlay) return;

  const defaultStatusText = status?.textContent ?? '';
  if (turnTimerDisplay) {
    turnTimerDisplay.textContent = TURN_TIMER_INITIAL_DISPLAY;
  }
  if (turnTimerImage) {
    turnTimerImage.dataset.stage = TURN_TIMER_STAGE_FALLBACK;
  }
  if (turnTimerElement) {
    turnTimerElement.setAttribute('aria-hidden', 'true');
  }

  if (uploadButton && !routes.uploads) {
    uploadButton.disabled = true;
    uploadButton.title = 'Map uploads are not available right now.';
  }

  const viewState = {
    scale: 1,
    minScale: 0.1,
    maxScale: 5,
    translation: { x: 0, y: 0 },
    isPanning: false,
    pointerId: null,
    lastPointer: { x: 0, y: 0 },
    mapLoaded: false,
    activeMapUrl: null,
    gridSize: 64,
    gridOffsets: { top: 0, right: 0, bottom: 0, left: 0 },
    mapPixelSize: { width: 0, height: 0 },
    dragCandidate: null,
    dragState: null,
  };

  const tokenLibraryDragState = {
    active: false,
    usesFallbackPayload: false,
  };

  let overlayDropProxyActive = false;
  let lastBoardStateHeartbeatSignature = null;
  let lastBoardStateHeartbeatAt = 0;
  const BOARD_STATE_HEARTBEAT_DEBOUNCE_MS = 2000;

  function handleTokenLibraryDragStart(event) {
    const tokenItem = event?.target?.closest?.('.token-item');
    if (!tokenItem) {
      return;
    }

    tokenLibraryDragState.active = true;
    tokenLibraryDragState.usesFallbackPayload = false;

    const dataTransfer = event?.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    try {
      const types = Array.from(dataTransfer.types || []);
      if (types.includes(TOKEN_DRAG_TYPE)) {
        return;
      }
    } catch (error) {
      // Ignore DOMStringList conversion issues when checking drag types
    }

    try {
      const fallbackPayload = dataTransfer.getData(TOKEN_DRAG_FALLBACK_TYPE);
      tokenLibraryDragState.usesFallbackPayload = Boolean(fallbackPayload);
    } catch (error) {
      tokenLibraryDragState.usesFallbackPayload = false;
    }
  }

  function handleTokenLibraryDragEnd() {
    tokenLibraryDragState.active = false;
    tokenLibraryDragState.usesFallbackPayload = false;
  }

  document.addEventListener('dragstart', handleTokenLibraryDragStart, true);
  document.addEventListener('dragend', handleTokenLibraryDragEnd, true);
  document.addEventListener('drop', handleTokenLibraryDragEnd, true);

  function mapPointToGrid(point, view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width)
      ? view.mapPixelSize.width
      : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height)
      ? view.mapPixelSize.height
      : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return null;
    }
    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null;
    }

    const localX = point.x;
    const localY = point.y;
    const withinX = localX >= offsetLeft && localX <= offsetLeft + innerWidth;
    const withinY = localY >= offsetTop && localY <= offsetTop + innerHeight;
    if (!withinX || !withinY) {
      return null;
    }

    const column = (localX - offsetLeft) / gridSize;
    const row = (localY - offsetTop) / gridSize;
    return { column, row };
  }

  const boardApi = store ?? {};
  const combatTimerService = createCombatTimerService();
  const tokenRotationAngles = new Map();
  let indigoRotationIntervalId = null;
  let indigoRotationUnloadRegistered = false;
  ensureIndigoRotationTimer();
  let overlayEditorActive = false;
  const overlayTool = createOverlayTool(routes?.uploads);
  const templateTool = createTemplateTool();
  const processedPings = new Map();
  const TOKEN_DRAG_TYPE = 'application/x-vtt-token-template';
  const TOKEN_DRAG_FALLBACK_TYPE = 'text/plain';
  let tokenDropDepth = 0;
  const selectedTokenIds = new Set();
  const combatTrackerGroups = new Map();
  const combatantGroupRepresentative = new Map();
  let lastCombatTrackerEntries = [];
  let renderedPlacements = [];
  let mapLoadSequence = 0;
  let lastActiveSceneId = null;
  let lastOverlaySignature = null;
  const movementQueue = [];
  let movementScheduled = false;
  const MAX_QUEUED_MOVEMENTS = 12;
  const DRAG_ACTIVATION_DISTANCE = 6;
  const DEFAULT_HP_PLACEHOLDER = '—';
  const DEFAULT_HP_DISPLAY = `${DEFAULT_HP_PLACEHOLDER} / ${DEFAULT_HP_PLACEHOLDER}`;
  const CONDITION_DEFINITIONS = [
    {
      name: 'Bleeding',
      description:
        'While bleeding, whenever you make a test using Might or Agility, make a strike, or use an action, maneuver, or a triggered action, you lose 1d6 Stamina after the test, action, maneuver, or triggered action is resolved. This Stamina loss can’t be prevented in any way.',
    },
    {
      name: 'Dazed',
      description:
        'While you are dazed, you can do only one thing on your turn: use a maneuver, use an action, or take a move action. You also can’t use triggered actions, free triggered actions, or free maneuvers.',
    },
    {
      name: 'Frightened',
      description:
        'If you are frightened, ability power rolls you make against the source of your fear take a bane. If that source is a creature, their ability power rolls against you gain an edge. You can’t willingly move closer to the source of your fear if you know the location of that source. If you gain the frightened condition from one source while already frightened by a different source, the new condition replaces the old one.',
    },
    {
      name: 'Grabbed',
      description:
        'While you are grabbed, your speed is 0, you can’t be force moved, you can’t use the Knockback maneuver, and you take a bane on abilities that don’t target the creature grabbing you. If the creature grabbing you moves, they bring you with them. If the creature’s size is equal to or less than yours, their speed is halved while they have you grabbed. The creature grabbing you can use a maneuver to move you into an unoccupied space adjacent to them. The creature grabbing you can end the grab at any time (no action required). You can also attempt to escape being grabbed using the Escape Grab maneuver (see Maneuvers in Combat). If you teleport or if the creature grabbing you is force moved to a space that isn’t adjacent to you, you are no longer grabbed.',
    },
    {
      name: 'Prone',
      description:
        'While you are prone, you are flat on the ground, strikes you make take a bane, and melee abilities made against you gain an edge. You must crawl to move along the ground, which costs you 1 additional square of movement for every square you crawl. You can’t climb, jump, swim, or fly while prone. If you are climbing, flying, or jumping while you are knocked prone, you fall. While prone, you can stand up as a maneuver (see Maneuvers in Combat), unless the ability or effect that imposed the condition says otherwise. You can use a maneuver to make an adjacent prone creature stand up.',
    },
    {
      name: 'Restrained',
      description:
        'While you are restrained, your speed is 0, you can’t use the Stand Up maneuver, and you can’t be force moved. Your ability power rolls take a bane, abilities against you gain an edge, and you have a bane on Might and Agility tests. If you teleport while restrained, the condition ends.',
    },
    {
      name: 'Slowed',
      description: 'While you are slowed, your speed is 2 unless it is already lower, and you can’t shift.',
    },
    {
      name: 'Taunted',
      description:
        'If you are taunted, you have a double bane on ability power rolls that don’t target the creature who taunted you while you have line of effect to that creature. If you gain the taunted condition from one creature while already taunted by a different creature, the new condition replaces the old one.',
    },
    {
      name: 'Weakened',
      description: 'While you are weakened, all your power rolls take a bane.',
    },
  ];
  const CONDITION_NAMES = CONDITION_DEFINITIONS.map((definition) => definition.name);
  const CONDITION_DEFINITION_MAP = new Map(
    CONDITION_DEFINITIONS.map((definition) => [definition.name.toLowerCase(), definition])
  );
  const CONDITION_ALIASES = new Map([
    ['grappled', 'Grabbed'],
  ]);
  const conditionTooltipRegistry = new WeakMap();
  let conditionTooltipElement = null;
  let conditionTooltipActiveTarget = null;

  function getConditionDefinition(name) {
    if (typeof name !== 'string') {
      return null;
    }

    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const alias = CONDITION_ALIASES.get(normalized);
    const lookupKey = alias ? alias.toLowerCase() : normalized;
    return CONDITION_DEFINITION_MAP.get(lookupKey) ?? null;
  }

  function normalizeConditionTooltipEntries(source) {
    if (!source) {
      return [];
    }

    const rawEntries = Array.isArray(source) ? source : [source];
    const entries = [];

    rawEntries.forEach((entry) => {
      if (!entry) {
        return;
      }

      if (typeof entry === 'string') {
        const definition = getConditionDefinition(entry);
        if (definition?.description) {
          entries.push({ name: definition.name, description: definition.description });
        }
        return;
      }

      if (typeof entry === 'object') {
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) {
          return;
        }

        const definition = getConditionDefinition(name);
        if (definition?.description) {
          entries.push({ name: definition.name, description: definition.description });
        } else if (typeof entry.description === 'string' && entry.description.trim()) {
          entries.push({ name, description: entry.description.trim() });
        }
      }
    });

    return entries;
  }

  function ensureConditionTooltipElement() {
    if (conditionTooltipElement || typeof document === 'undefined') {
      return conditionTooltipElement;
    }

    if (!document?.body) {
      return null;
    }

    const element = document.createElement('div');
    element.id = 'vtt-condition-tooltip';
    element.className = 'vtt-condition-tooltip';
    element.setAttribute('role', 'tooltip');
    element.hidden = true;
    document.body.appendChild(element);
    conditionTooltipElement = element;
    return conditionTooltipElement;
  }

  function renderConditionTooltip(entries) {
    const tooltip = ensureConditionTooltipElement();
    if (!tooltip) {
      return;
    }

    tooltip.replaceChildren();
    tooltip.removeAttribute('aria-label');
    entries.forEach((entry, index) => {
      if (!entry?.name || !entry?.description) {
        return;
      }
      const item = document.createElement('div');
      item.className = 'vtt-condition-tooltip__item';

      const nameElement = document.createElement('div');
      nameElement.className = 'vtt-condition-tooltip__name';
      nameElement.textContent = entry.name;
      item.appendChild(nameElement);

      const descriptionElement = document.createElement('div');
      descriptionElement.className = 'vtt-condition-tooltip__description';
      descriptionElement.textContent = entry.description;
      item.appendChild(descriptionElement);

      tooltip.appendChild(item);
      if (index === 0) {
        tooltip.setAttribute('aria-label', `${entry.name}: ${entry.description}`);
      }
    });
  }

  function positionConditionTooltip(target) {
    const tooltip = ensureConditionTooltipElement();
    if (!tooltip || !target || typeof target.getBoundingClientRect !== 'function') {
      return;
    }

    const { clientWidth: viewportWidth, clientHeight: viewportHeight } =
      document.documentElement || document.body;

    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.hidden = false;
    tooltip.style.visibility = 'hidden';
    tooltip.dataset.visible = 'true';

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    let top = targetRect.bottom + 8;

    const margin = 8;
    if (left + tooltipRect.width > viewportWidth - margin) {
      left = viewportWidth - tooltipRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top + tooltipRect.height > viewportHeight - margin) {
      top = Math.max(margin, targetRect.top - tooltipRect.height - 8);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.visibility = '';
  }

  function showConditionTooltip(target, entries) {
    const tooltipEntries = normalizeConditionTooltipEntries(entries);
    if (!tooltipEntries.length) {
      return;
    }

    const tooltip = ensureConditionTooltipElement();
    if (!tooltip) {
      return;
    }

    renderConditionTooltip(tooltipEntries);
    positionConditionTooltip(target);
    conditionTooltipActiveTarget = target;
    target?.setAttribute('aria-describedby', 'vtt-condition-tooltip');
  }

  function hideConditionTooltip(target) {
    if (target && conditionTooltipActiveTarget && target !== conditionTooltipActiveTarget) {
      return;
    }

    const tooltip = ensureConditionTooltipElement();
    if (!tooltip) {
      return;
    }

    tooltip.hidden = true;
    tooltip.removeAttribute('data-visible');
    tooltip.style.visibility = '';
    conditionTooltipActiveTarget?.removeAttribute('aria-describedby');
    conditionTooltipActiveTarget = null;
  }

  function configureConditionTooltip(target, entries, options = {}) {
    if (!target) {
      return;
    }

    const tooltipEntries = normalizeConditionTooltipEntries(entries);
    const delay =
      typeof options.delay === 'number' && options.delay >= 0 ? options.delay : 400;

    if (!tooltipEntries.length) {
      detachConditionTooltip(target);
      return;
    }

    let registryEntry = conditionTooltipRegistry.get(target);
    if (!registryEntry) {
      registryEntry = {
        entries: tooltipEntries,
        delay,
        showTimeoutId: null,
      };
      conditionTooltipRegistry.set(target, registryEntry);

      registryEntry.handlePointerEnter = () => {
        window.clearTimeout(registryEntry.showTimeoutId);
        registryEntry.showTimeoutId = window.setTimeout(() => {
          showConditionTooltip(target, registryEntry.entries);
        }, registryEntry.delay);
      };

      registryEntry.handlePointerLeave = () => {
        window.clearTimeout(registryEntry.showTimeoutId);
        hideConditionTooltip(target);
      };

      registryEntry.handlePointerDown = () => {
        window.clearTimeout(registryEntry.showTimeoutId);
        hideConditionTooltip(target);
      };

      registryEntry.handleFocus = () => {
        window.clearTimeout(registryEntry.showTimeoutId);
        registryEntry.showTimeoutId = window.setTimeout(() => {
          showConditionTooltip(target, registryEntry.entries);
        }, Math.min(registryEntry.delay, 200));
      };

      registryEntry.handleBlur = () => {
        window.clearTimeout(registryEntry.showTimeoutId);
        hideConditionTooltip(target);
      };

      target.addEventListener('pointerenter', registryEntry.handlePointerEnter);
      target.addEventListener('pointerleave', registryEntry.handlePointerLeave);
      target.addEventListener('pointerdown', registryEntry.handlePointerDown);
      target.addEventListener('pointercancel', registryEntry.handlePointerLeave);
      target.addEventListener('focus', registryEntry.handleFocus);
      target.addEventListener('blur', registryEntry.handleBlur);
    }

    registryEntry.entries = tooltipEntries;
    registryEntry.delay = delay;
  }

  function detachConditionTooltip(target) {
    if (!target) {
      return;
    }

    const registryEntry = conditionTooltipRegistry.get(target);
    if (!registryEntry) {
      return;
    }

    target.removeEventListener('pointerenter', registryEntry.handlePointerEnter);
    target.removeEventListener('pointerleave', registryEntry.handlePointerLeave);
    target.removeEventListener('pointerdown', registryEntry.handlePointerDown);
    target.removeEventListener('pointercancel', registryEntry.handlePointerLeave);
    target.removeEventListener('focus', registryEntry.handleFocus);
    target.removeEventListener('blur', registryEntry.handleBlur);
    window.clearTimeout(registryEntry.showTimeoutId);
    if (conditionTooltipActiveTarget === target) {
      hideConditionTooltip(target);
    }
    conditionTooltipRegistry.delete(target);
  }
  const tokenSettingsMenu = createTokenSettingsMenu();
  const conditionBannerRegistry = new Map();
  const MAX_CONDITION_BANNERS = 4;
  let nextConditionBannerId = 1;
  let activeTokenSettingsId = null;
  let activeMonsterStatBlockPlacementId = null;
  let removeTokenSettingsListeners = null;
  let hitPointsEditSession = null;
  let damageHealUi = null;
  let pendingDamageHeal = null;
  let damageHealStatusTimeoutId = null;
  const completedCombatants = new Set();
  const combatantTeams = new Map();
  let combatActive = false;
  let combatRound = 0;
  let activeCombatantId = null;
  let highlightedCombatantId = null;
  let focusedCombatantId = null;
  let pendingRoundConfirmation = false;
  let activeConditionPrompt = null;
  let activeTurnDialog = null;
  let activeSaveEndsPrompt = null;
  let lastTurnPromptAnchorRect = null;
  const turnLockState = {
    holderId: null,
    holderName: null,
    combatantId: null,
    lockedAt: 0,
  };
  let lastPersistedBoardStateSignature = null;
  let lastPersistedBoardStateHash = null;
  let pendingBoardStateSave = null;
  let suppressCombatStateSync = false;
  let combatStateVersion = 0;
  let lastCombatStateSnapshot = null;
  let startingCombatTeam = null;
  let currentTurnTeam = null;
  let activeTeam = null;
  let lastActingTeam = null;
  let pendingTurnTransition = null;
  let borderFlashTimeoutId = null;
  let allyTurnTimerInterval = null;
  let allyTurnTimerMode = 'idle';
  let allyTurnTimerExpiresAt = null;
  let allyTurnTimerStartedAt = null;
  let allyTurnTimerWarnings = { yellow: false, red: false };
  let currentTurnTimerStage = null;
  let audioContext = null;
  let lastTurnEffect = null;
  let lastTurnEffectSignature = null;
  let lastProcessedTurnEffectSignature = null;
  // Sand timer artwork is resolved via CSS data-stage attributes using
  // assets/images/turn-timer/sand-timer-{stage}.png.
  const SOUND_PROFILES = {
    longDing: [
      { frequency: 880, type: 'sine', attack: 0.01, decay: 0.35, sustain: 0.6, duration: 1.4, release: 1.1, volume: 0.25 },
      { frequency: 1320, type: 'sine', attack: 0.04, decay: 0.4, sustain: 0.4, duration: 1.2, release: 1.0, volume: 0.12 },
    ],
    softGong: [
      { frequency: 220, type: 'sine', attack: 0.02, decay: 0.6, sustain: 0.4, duration: 1.8, release: 1.4, volume: 0.28 },
      { frequency: 330, type: 'sine', attack: 0.03, decay: 0.6, sustain: 0.35, duration: 1.7, release: 1.3, volume: 0.18 },
      { frequency: 147.5, type: 'sine', attack: 0.02, decay: 0.5, sustain: 0.3, duration: 1.9, release: 1.5, volume: 0.22 },
    ],
  };

  function clearIndigoRotationTimer() {
    if (indigoRotationIntervalId !== null && typeof window?.clearInterval === 'function') {
      window.clearInterval(indigoRotationIntervalId);
      indigoRotationIntervalId = null;
    }
  }

  function handleIndigoRotationTeardown() {
    clearIndigoRotationTimer();
    tokenRotationAngles.clear();
  }

  function stepIndigoRotations() {
    if (!viewState.mapLoaded) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const placements = getActiveScenePlacements(state);
    const activeIds = new Set();

    placements.forEach((placement) => {
      const normalized = normalizePlacementForRender(placement);
      if (!normalized) {
        return;
      }

      activeIds.add(normalized.id);

      if (normalized.name === 'Indigo') {
        const previous = tokenRotationAngles.get(normalized.id) ?? 0;
        const nextAngle = (previous + INDIGO_ROTATION_INCREMENT_DEGREES) % 360;
        tokenRotationAngles.set(normalized.id, nextAngle);
      } else if (tokenRotationAngles.has(normalized.id)) {
        tokenRotationAngles.delete(normalized.id);
      }
    });

    tokenRotationAngles.forEach((_, id) => {
      if (!activeIds.has(id)) {
        tokenRotationAngles.delete(id);
      }
    });

    if (tokenLayer) {
      renderTokens(state, tokenLayer, viewState);
    }
  }

  function ensureIndigoRotationTimer() {
    if (
      indigoRotationIntervalId !== null ||
      typeof window === 'undefined' ||
      typeof window.setInterval !== 'function'
    ) {
      return;
    }

    indigoRotationIntervalId = window.setInterval(stepIndigoRotations, INDIGO_ROTATION_INTERVAL_MS);

    if (!indigoRotationUnloadRegistered && typeof window.addEventListener === 'function') {
      window.addEventListener('unload', handleIndigoRotationTeardown, { once: true });
      indigoRotationUnloadRegistered = true;
    }
  }

  const PLAYER_PROFILE_ALIASES = {
    frunk: ['frunk'],
    sharon: ['sharon'],
    indigo: ['indigo'],
    zepha: ['zepha'],
  };

  const SHARON_PROFILE_ID = 'sharon';

  function formatProfileDisplayName(profileId) {
    if (typeof profileId !== 'string' || !profileId.trim()) {
      return 'Unknown Player';
    }
    const normalized = profileId.trim();
    if (normalized.toLowerCase() === 'gm') {
      return 'GM';
    }
    return normalized
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ') || 'Unknown Player';
  }

  let roundTurnCount = 0;
  let hesitationBannerTimeoutId = null;
  let hesitationBannerRemoveId = null;

  function escapeHtml(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getActiveSceneId() {
    const state = boardApi.getState?.();
    const activeSceneId = state?.boardState?.activeSceneId ?? null;
    return typeof activeSceneId === 'string' && activeSceneId ? activeSceneId : null;
  }

  function getActiveOverlayLayerId(rawOverlay) {
    if (!rawOverlay || typeof rawOverlay !== 'object') {
      return null;
    }

    const overlay = normalizeOverlayState(rawOverlay);
    const activeLayerId = overlay?.activeLayerId ?? null;
    return typeof activeLayerId === 'string' && activeLayerId ? activeLayerId : null;
  }

  function syncCutoutToggleButtons() {
    if (!sceneListContainer) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const boardState = state.boardState && typeof state.boardState === 'object' ? state.boardState : {};
    const sceneState = boardState.sceneState && typeof boardState.sceneState === 'object'
      ? boardState.sceneState
      : {};
    const activeSceneId = typeof boardState.activeSceneId === 'string' ? boardState.activeSceneId : null;
    const buttons = sceneListContainer.querySelectorAll('[data-action="edit-overlay-layer"]');
    const activeLayerId = getActiveOverlayLayerId(boardState.overlay ?? null);
    buttons.forEach((button) => {
      const sceneId = button.getAttribute('data-scene-id');
      const overlayId = button.getAttribute('data-overlay-id');
      const isActiveScene = activeSceneId && sceneId && sceneId === activeSceneId;
      const pressed =
        overlayEditorActive && isActiveScene && overlayId && overlayId === activeLayerId
          ? 'true'
          : 'false';
      button.setAttribute('aria-pressed', pressed);
    });

    syncOverlayVisibilityButtons(sceneState, activeSceneId);
  }

  function syncOverlayVisibilityButtons(sceneState = {}, activeSceneId = null) {
    if (!sceneListContainer) {
      return;
    }

    const buttons = sceneListContainer.querySelectorAll('[data-action="toggle-overlay-layer-visibility"]');
    buttons.forEach((button) => {
      const sceneId = button.getAttribute('data-scene-id');
      const overlayId = button.getAttribute('data-overlay-id');
      const sceneEntry = sceneId && sceneState[sceneId] && typeof sceneState[sceneId] === 'object'
        ? sceneState[sceneId]
        : {};
      const overlayEntry = normalizeOverlayDraft(sceneEntry.overlay ?? {});
      const layer = overlayEntry.layers.find((entry) => entry.id === overlayId);
      const layerVisible = layer ? layer.visible !== false && normalizeOverlayMask(layer.mask).visible !== false : false;
      button.setAttribute('aria-pressed', layerVisible ? 'true' : 'false');
      button.dataset.overlayVisible = layerVisible ? 'true' : 'false';

      const isActiveScene = Boolean(activeSceneId && sceneId && sceneId === activeSceneId);
      if (!isActiveScene) {
        button.setAttribute('disabled', 'disabled');
      } else {
        button.removeAttribute('disabled');
      }
    });
  }

  function isInputElement(node) {
    return Boolean(
      node &&
        typeof node === 'object' &&
        'tagName' in node &&
        typeof node.tagName === 'string' &&
        node.tagName.toLowerCase() === 'input'
    );
  }

  function isSelectElement(node) {
    return Boolean(
      node &&
        typeof node === 'object' &&
        'tagName' in node &&
        typeof node.tagName === 'string' &&
        node.tagName.toLowerCase() === 'select'
    );
  }

  function showConditionBanner(message, options = {}) {
    if (!conditionBannerRegion || typeof message !== 'string') {
      return null;
    }

    const normalized = message.trim();
    if (!normalized) {
      return null;
    }

    const id = `condition-banner-${nextConditionBannerId++}`;
    const banner = document.createElement('div');
    banner.className = 'vtt-condition-banner';

    const tone = typeof options.tone === 'string' && options.tone.trim() ? options.tone.trim() : 'reminder';
    if (tone) {
      banner.dataset.tone = tone;
    }

    const content = document.createElement('div');
    content.className = 'vtt-condition-banner__content';
    banner.appendChild(content);

    const messageElement = document.createElement('p');
    messageElement.className = 'vtt-condition-banner__message';
    messageElement.textContent = normalized;
    content.appendChild(messageElement);

    const descriptionText =
      typeof options.description === 'string' ? options.description.trim() : '';
    if (descriptionText) {
      const descriptionElement = document.createElement('p');
      descriptionElement.className = 'vtt-condition-banner__description';
      descriptionElement.textContent = descriptionText;
      content.appendChild(descriptionElement);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'vtt-condition-banner__close';
    closeButton.setAttribute('aria-label', options.closeLabel || 'Dismiss notification');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      dismissConditionBanner(id);
    });
    banner.appendChild(closeButton);

    banner.dataset.bannerId = id;
    conditionBannerRegion.appendChild(banner);

    conditionBannerRegistry.set(id, {
      element: banner,
      onDismiss: typeof options.onDismiss === 'function' ? options.onDismiss : null,
    });

    if (conditionBannerRegistry.size > MAX_CONDITION_BANNERS) {
      for (const [existingId, entry] of conditionBannerRegistry) {
        if (existingId === id) {
          continue;
        }
        if (!entry?.onDismiss) {
          dismissConditionBanner(existingId);
          break;
        }
      }
    }

    return id;
  }

  function dismissConditionBanner(id, { suppressCallback = false } = {}) {
    if (!id) {
      return;
    }

    const entry = conditionBannerRegistry.get(id);
    if (!entry) {
      const fallback = conditionBannerRegion?.querySelector(`[data-banner-id="${id}"]`);
      fallback?.remove();
      return;
    }

    conditionBannerRegistry.delete(id);
    const { element, onDismiss } = entry;
    if (element?.parentElement) {
      element.remove();
    }

    if (!suppressCallback && typeof onDismiss === 'function') {
      onDismiss();
    }
  }

  if (groupButton) {
    groupButton.addEventListener('click', () => {
      if (groupButton.disabled) {
        return;
      }
      handleGroupSelectedTokens();
    });
  }

  if (sceneListContainer) {
    sceneListContainer.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-action="edit-overlay-layer"]');
      if (editButton) {
        if (editButton.disabled) {
          return;
        }

        event.preventDefault();
        if (!isGmUser()) {
          return;
        }

        const sceneId = editButton.getAttribute('data-scene-id');
        const overlayId = editButton.getAttribute('data-overlay-id');
        const activeSceneId = getActiveSceneId();
        if (!sceneId || !overlayId || !activeSceneId || sceneId !== activeSceneId) {
          return;
        }

        if (typeof overlayTool.isEditingLayer === 'function' && overlayTool.isEditingLayer(overlayId)) {
          overlayTool.toggle();
          return;
        }

        overlayTool.editLayer(overlayId);
        return;
      }

      const button = event.target.closest('[data-action="toggle-overlay-editor"]');
      if (!button || button.disabled) {
        return;
      }

      event.preventDefault();
      if (!isGmUser()) {
        return;
      }

      const sceneId = button.getAttribute('data-scene-id');
      const activeSceneId = getActiveSceneId();
      if (!sceneId || !activeSceneId || sceneId !== activeSceneId) {
        return;
      }

      overlayTool.toggle();
    });

    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        syncCutoutToggleButtons();
      });
      observer.observe(sceneListContainer, { childList: true, subtree: true });
    }

    syncCutoutToggleButtons();
  }

  if (startCombatButton) {
    startCombatButton.classList.remove('btn--soon');
    startCombatButton.addEventListener('click', (event) => {
      event.preventDefault();
      if (!isGmUser()) {
        return;
      }
      handleStartCombat();
    });
  }

  if (damageHealButton) {
    damageHealButton.addEventListener('click', (event) => {
      event.preventDefault();
      toggleDamageHealWidget();
    });
  }

  if (combatTrackerRoot) {
    combatTrackerRoot.addEventListener('click', handleCombatTrackerClick);
    combatTrackerRoot.addEventListener('dblclick', handleCombatTrackerDoubleClick);
    combatTrackerRoot.addEventListener('keydown', handleCombatTrackerKeydown);
  }

  notifySelectionChanged();
  updateStartCombatButton();
  updateCombatModeIndicators();

  const persistBoardStateSnapshot = () => {
    if (!routes?.state || typeof boardApi.getState !== 'function') {
      return;
    }

    const latest = boardApi.getState?.();
    const boardState = latest?.boardState ?? null;
    if (!boardState || typeof boardState !== 'object') {
      return;
    }

    const isGmUser = Boolean(latest?.user?.isGM);
    const snapshot = buildBoardStateSnapshotForPersistence(boardState, { isGm: isGmUser });
    if (!snapshot) {
      return;
    }

    const previousMetadata = cloneBoardSection(boardState.metadata ?? boardState.meta);
    const authorId = normalizeProfileId(getCurrentUserId());
    const timestamp = Date.now();
    const signatureSeed = Math.random().toString(36).slice(2);
    const signatureBase = authorId ? `${authorId}:${timestamp}` : `${timestamp}`;
    const signature = `${signatureBase}:${signatureSeed}`;

    const metadataBase =
      previousMetadata && typeof previousMetadata === 'object' ? previousMetadata : {};
    const metadata = {
      ...metadataBase,
      updatedAt: timestamp,
      signature,
      authorRole: isGmUser ? 'gm' : 'player',
      authorIsGm: isGmUser,
    };
    if (authorId) {
      metadata.authorId = authorId;
    }

    snapshot.metadata = metadata;

    const snapshotHashCandidate = hashBoardStateSnapshot(snapshot);
    const snapshotHash = snapshotHashCandidate ?? safeJsonStringify(snapshot) ?? null;

    const savePromise = persistBoardState(routes.state, snapshot);
    if (savePromise && typeof savePromise.then === 'function') {
      const pendingEntry = {
        promise: savePromise,
        signature,
        hash: snapshotHash,
      };
      pendingBoardStateSave = pendingEntry;
      savePromise.then((result) => {
        if (pendingBoardStateSave !== pendingEntry) {
          return result;
        }

        pendingBoardStateSave = null;
        if (result?.success) {
          lastPersistedBoardStateSignature = signature;
          lastPersistedBoardStateHash = snapshotHash;
        }
        return result;
      });
      return savePromise;
    }

    return savePromise ?? null;
  };

  function maybeNudgeBoardState(reason = 'heartbeat') {
    if (typeof boardApi.updateState !== 'function') {
      return;
    }

    if (!isGmUser()) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    const placements = getActiveScenePlacements(state);
    if (Array.isArray(placements) && placements.length > 0) {
      return;
    }

    const signature = `${activeSceneId}:${reason}`;
    const now = Date.now();
    if (
      lastBoardStateHeartbeatSignature === signature &&
      now - lastBoardStateHeartbeatAt < BOARD_STATE_HEARTBEAT_DEBOUNCE_MS
    ) {
      return;
    }

    lastBoardStateHeartbeatSignature = signature;
    lastBoardStateHeartbeatAt = now;

    boardApi.updateState?.((draft) => {
      const boardDraft = ensureBoardStateDraft(draft);
      const metadata = ensureBoardMetadataDraft(boardDraft);
      metadata.syncHeartbeat = now;
      metadata.syncHeartbeatScene = activeSceneId;
      metadata.syncHeartbeatReason = reason;
    });

    persistBoardStateSnapshot();
  }

  function buildBoardStateSnapshotForPersistence(boardState = {}, { isGm = false } = {}) {
    if (!boardState || typeof boardState !== 'object') {
      return null;
    }

    const snapshot = {};

    if (Object.prototype.hasOwnProperty.call(boardState, 'activeSceneId')) {
      snapshot.activeSceneId = boardState.activeSceneId ?? null;
    }

    snapshot.placements = sanitizePlacementsForPersistence(
      boardState.placements,
      { includeHidden: isGm }
    );
    snapshot.templates = sanitizeTemplatesForPersistence(boardState.templates);
    snapshot.pings = sanitizePingsForPersistence(boardState.pings);

    if (isGm) {
      snapshot.mapUrl = boardState.mapUrl ?? null;
      snapshot.sceneState = cloneBoardSection(boardState.sceneState);
      snapshot.overlay = cloneOverlayState(boardState.overlay);
    }

    return snapshot;
  }

  function sanitizePlacementsForPersistence(source, { includeHidden = false } = {}) {
    const clone = cloneBoardSection(source);
    if (!clone || typeof clone !== 'object') {
      return {};
    }

    Object.keys(clone).forEach((sceneId) => {
      const entries = Array.isArray(clone[sceneId]) ? clone[sceneId] : [];
      const filtered = entries.filter((entry) => includeHidden || !isPlacementHiddenForPersistence(entry));
      clone[sceneId] = filtered;
    });

    return clone;
  }

  function sanitizeTemplatesForPersistence(source) {
    const clone = cloneBoardSection(source);
    return clone && typeof clone === 'object' ? clone : {};
  }

  function sanitizePingsForPersistence(source) {
    const entries = Array.isArray(source) ? source : [];
    const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
    const byId = new Map();

    entries.forEach((entry) => {
      const normalized = normalizeIncomingPing(entry);
      if (!normalized) {
        return;
      }
      if (normalized.createdAt < retentionThreshold) {
        return;
      }
      const previous = byId.get(normalized.id);
      if (!previous || normalized.createdAt >= previous.createdAt) {
        byId.set(normalized.id, normalized);
      }
    });

    if (byId.size === 0) {
      return [];
    }

    const sorted = Array.from(byId.values()).sort(
      (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
    );
    if (sorted.length > MAP_PING_HISTORY_LIMIT) {
      return sorted.slice(sorted.length - MAP_PING_HISTORY_LIMIT);
    }

    return sorted;
  }

  function isPlacementHiddenForPersistence(placement) {
    if (!placement || typeof placement !== 'object') {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(placement, 'hidden')) {
      return toBoolean(placement.hidden, false);
    }

    if (Object.prototype.hasOwnProperty.call(placement, 'isHidden')) {
      return toBoolean(placement.isHidden, false);
    }

    if (
      placement.flags &&
      typeof placement.flags === 'object' &&
      Object.prototype.hasOwnProperty.call(placement.flags, 'hidden')
    ) {
      return toBoolean(placement.flags.hidden, false);
    }

    return false;
  }

  function startBoardStatePoller() {
    if (!routes?.state) {
      return;
    }

    const poller = createBoardStatePoller({
      routes,
      boardApi,
      fetchFn: typeof fetch === 'function' ? fetch : null,
      windowRef: typeof window === 'undefined' ? undefined : window,
      documentRef: typeof document === 'undefined' ? undefined : document,
      hashBoardStateSnapshotFn: hashBoardStateSnapshot,
      safeJsonStringifyFn: safeJsonStringify,
      mergeBoardStateSnapshotFn: mergeBoardStateSnapshot,
      getCurrentUserIdFn: getCurrentUserId,
      normalizeProfileIdFn: normalizeProfileId,
      getPendingSaveInfo: getPendingBoardStateSaveInfo,
      getLastPersistedHashFn: () => lastPersistedBoardStateHash,
      getLastPersistedSignatureFn: () => lastPersistedBoardStateSignature,
    });

    poller.start();
  }

  function getPendingBoardStateSaveInfo() {
    if (!pendingBoardStateSave?.promise) {
      return { pending: false, promise: null, signature: null, hash: null };
    }

    return {
      pending: true,
      promise: pendingBoardStateSave.promise,
      signature: pendingBoardStateSave.signature ?? null,
      hash: pendingBoardStateSave.hash ?? null,
    };
  }

  function mergeBoardStateSnapshot(existing, incoming) {
    if (!incoming || typeof incoming !== 'object') {
      return existing ?? {};
    }

    const snapshot = {
      activeSceneId: typeof incoming.activeSceneId === 'string' ? incoming.activeSceneId : null,
      mapUrl: typeof incoming.mapUrl === 'string' ? incoming.mapUrl : null,
      placements: cloneBoardSection(incoming.placements),
      sceneState: cloneBoardSection(incoming.sceneState),
      templates: cloneBoardSection(incoming.templates),
      overlay: cloneOverlayState(incoming.overlay),
      pings: clonePingEntries(incoming.pings),
    };

    const metadata = cloneBoardSection(incoming.metadata ?? incoming.meta);
    if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
      snapshot.metadata = metadata;
    }

    return snapshot;
  }

  function cloneBoardSection(section) {
    if (!section || typeof section !== 'object') {
      return {};
    }
    try {
      return JSON.parse(JSON.stringify(section));
    } catch (error) {
      return {};
    }
  }

  function cloneOverlayState(section) {
    if (!section || typeof section !== 'object') {
      return { mapUrl: null, mask: createEmptyOverlayMask() };
    }

    return normalizeOverlayDraft(section);
  }

  function clonePingEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    try {
      return JSON.parse(JSON.stringify(entries));
    } catch (error) {
      return [];
    }
  }

  function hashBoardStateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    const base = {
      activeSceneId:
        typeof snapshot.activeSceneId === 'string' ? snapshot.activeSceneId : snapshot.activeSceneId ?? null,
      mapUrl: typeof snapshot.mapUrl === 'string' ? snapshot.mapUrl : snapshot.mapUrl ?? null,
      placements: cloneBoardSection(snapshot.placements),
      sceneState: cloneBoardSection(snapshot.sceneState),
      templates: cloneBoardSection(snapshot.templates),
      overlay: cloneOverlayState(snapshot.overlay),
      pings: clonePingEntries(snapshot.pings),
    };

    return safeStableStringify(base);
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return null;
    }
  }

  function safeStableStringify(value) {
    const seen = new WeakSet();

    function serialize(input) {
      if (input === null || typeof input !== 'object') {
        return input;
      }

      if (seen.has(input)) {
        return null;
      }
      seen.add(input);

      if (Array.isArray(input)) {
        return input.map((item) => serialize(item));
      }

      const result = {};
      const keys = Object.keys(input).sort();
      for (const key of keys) {
        result[key] = serialize(input[key]);
      }
      return result;
    }

    try {
      return JSON.stringify(serialize(value));
    } catch (error) {
      return null;
    }
  }

  board.addEventListener('keydown', (event) => {
    if ((pendingDamageHeal || damageHealUi) && event.key === 'Escape') {
      event.preventDefault();
      closeDamageHealWidget();
      return;
    }

    if (templateTool?.handleKeydown?.(event)) {
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selectedTokenIds.size) {
        return;
      }
      event.preventDefault();
      removeSelectedTokens();
      return;
    }

    const movement = movementFromKey(event.key);
    if (!movement) {
      return;
    }

    if (!selectedTokenIds.size) {
      return;
    }

    event.preventDefault();
    enqueueMovement(movement);
  });

  board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  if (uploadButton && uploadInput && routes.uploads) {
    uploadButton.addEventListener('click', () => {
      uploadInput.click();
    });

    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      uploadInput.value = '';
      if (!file) return;

      try {
        setUploadingState(true);
        const url = await overlayUploadHelpers.uploadMap(file, routes.uploads);
        if (!url) {
          throw new Error('Upload endpoint returned no URL.');
        }

        boardApi.updateState?.((draft) => {
          const boardDraft = ensureBoardStateDraft(draft);
          boardDraft.mapUrl = url;
        });
        persistBoardStateSnapshot();

        if (status) {
          status.textContent = 'Map uploaded successfully. Right-click to pan and scroll to zoom.';
        }
      } catch (error) {
        console.error('[VTT] Failed to upload map', error);
        if (status) {
          status.textContent = `Unable to upload map: ${error.message ?? 'Unknown error'}`;
        }
      } finally {
        setUploadingState(false);
      }
    });
  }

  mapSurface.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  if (tokenLayer) {
    tokenLayer.addEventListener('pointerdown', handleTriggerIndicatorPointerDown);
    tokenLayer.addEventListener('click', handleTriggerIndicatorClick);
    tokenLayer.addEventListener('keydown', handleTriggerIndicatorKeydown);
  }

  mapSurface.addEventListener(
    'wheel',
    (event) => {
      if (!viewState.mapLoaded) return;
      event.preventDefault();
      const pointer = getPointerPosition(event, board);
      const previousScale = viewState.scale;
      const zoomIntensity = 0.0018;
      const scaleFactor = Math.exp(-event.deltaY * zoomIntensity);
      const nextScale = clamp(previousScale * scaleFactor, viewState.minScale, viewState.maxScale);
      if (nextScale === previousScale) return;

      const zoomRatio = nextScale / previousScale;
      viewState.translation.x = pointer.x - (pointer.x - viewState.translation.x) * zoomRatio;
      viewState.translation.y = pointer.y - (pointer.y - viewState.translation.y) * zoomRatio;
      viewState.scale = nextScale;
      applyTransform();
    },
    { passive: false }
  );

  mapSurface.addEventListener('pointerdown', (event) => {
    if (event.altKey && (event.button === 0 || event.button === 2)) {
      const handled = handleMapPing(event, { focus: event.button === 2 });
      if (handled) {
        event.preventDefault();
        return;
      }
    }
    if (pendingDamageHeal && event.button === 2) {
      event.preventDefault();
      closeDamageHealWidget();
      return;
    }

    if (!viewState.mapLoaded) {
      return;
    }

    if (pendingDamageHeal && event.button === 0) {
      event.preventDefault();
      const action = pendingDamageHeal;
      const placement = findRenderedPlacementAtPoint(event);
      if (!placement) {
        const noun = action.mode === 'damage' ? 'damage' : 'healing';
        updateStatus(`Click a token to apply ${action.amount} ${noun}.`);
        return;
      }

      const result = applyDamageHealToPlacement(placement.id, action.mode, action.amount);
      if (!result) {
        updateStatus('Unable to update hit points for that token.');
        return;
      }

      const { name, current, max, change } = result;
      const effectLabel = action.mode === 'damage' ? 'damage' : 'HP';
      const verb = action.mode === 'damage' ? 'takes' : 'recovers';
      const maxDisplay = max !== null ? max : DEFAULT_HP_PLACEHOLDER;
      const hpDisplay = max !== null ? `${current}/${maxDisplay}` : `${current}`;
      const suffix = action.mode === 'damage'
        ? ` (${hpDisplay} HP remaining).`
        : ` (${hpDisplay} HP).`;
      updateStatus(`${name} ${verb} ${change} ${effectLabel}${suffix}`);
      closeDamageHealWidget({ restoreStatus: false });
      scheduleDamageHealStatusReset();
      return;
    }

    if (event.button === 0) {
      closeTokenSettings();
      const placement = findRenderedPlacementAtPoint(event);
      if (placement) {
        const selectionChanged = updateSelection(placement.id, {
          additive: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        });
        if (selectionChanged) {
          renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
        }
        prepareTokenDrag(event, placement);
        templateTool.clearSelection();
      } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (clearSelection()) {
          renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
        }
        templateTool.clearSelection();
        clearDragCandidate();
        if (viewState.dragState) {
          endTokenDrag({ commit: false });
        }
      } else {
        clearDragCandidate();
      }
      focusBoard();
      event.preventDefault();
      return;
    }

    if (event.button === 2) {
      const placement = findRenderedPlacementAtPoint(event);
      if (placement) {
        const opened = openTokenSettingsById(placement.id, event.clientX, event.clientY);
        if (opened) {
          const selectionChanged = updateSelection(placement.id, { additive: false });
          if (selectionChanged) {
            renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
          }
          templateTool.clearSelection();
          clearDragCandidate();
          if (viewState.dragState) {
            endTokenDrag({ commit: false });
          }
          focusBoard();
          event.preventDefault();
          return;
        }
      }

      closeTokenSettings();
      event.preventDefault();
      focusBoard();
      viewState.isPanning = true;
      viewState.pointerId = event.pointerId;
      viewState.lastPointer = { x: event.clientX, y: event.clientY };
      mapSurface.classList.add('is-panning');
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        console.warn('[VTT] Unable to set pointer capture', error);
      }
      return;
    }

    closeTokenSettings();
    return;
  });

  mapSurface.addEventListener('pointermove', (event) => {
    if (!viewState.mapLoaded) {
      return;
    }

    if (viewState.dragState && event.pointerId === viewState.dragState.pointerId) {
      event.preventDefault();
      updateTokenDrag(event);
      return;
    }

    if (viewState.dragCandidate && event.pointerId === viewState.dragCandidate.pointerId) {
      if ((event.buttons & 1) === 0) {
        clearDragCandidate(event.pointerId);
      } else {
        const deltaX = event.clientX - viewState.dragCandidate.startClient.x;
        const deltaY = event.clientY - viewState.dragCandidate.startClient.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance >= DRAG_ACTIVATION_DISTANCE) {
          const started = beginTokenDrag(event);
          if (started) {
            event.preventDefault();
            updateTokenDrag(event);
            return;
          }
        }
      }
    }

    if (!viewState.isPanning || event.pointerId !== viewState.pointerId) {
      return;
    }

    const deltaX = event.clientX - viewState.lastPointer.x;
    const deltaY = event.clientY - viewState.lastPointer.y;
    viewState.translation.x += deltaX;
    viewState.translation.y += deltaY;
    viewState.lastPointer = { x: event.clientX, y: event.clientY };
    applyTransform();
  });

  const endPan = (event) => {
    if (viewState.pointerId !== null && event.pointerId !== viewState.pointerId) {
      return;
    }

    viewState.isPanning = false;
    viewState.pointerId = null;
    mapSurface.classList.remove('is-panning');
    try {
      mapSurface.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore capture release errors
    }
  };

  const handlePointerUp = (event) => {
    if (viewState.dragState && event.pointerId === viewState.dragState.pointerId) {
      const isPrimaryButton = event.button === 0 || event.button === -1;
      endTokenDrag({ commit: isPrimaryButton, pointerId: event.pointerId });
    } else if (viewState.dragCandidate && event.pointerId === viewState.dragCandidate.pointerId) {
      clearDragCandidate(event.pointerId);
    }

    if (event.button === 2) {
      endPan(event);
    }
  };

  const handlePointerCancel = (event) => {
    if (viewState.dragState && event.pointerId === viewState.dragState.pointerId) {
      endTokenDrag({ commit: false, pointerId: event.pointerId });
    }
    clearDragCandidate(event.pointerId);
    endPan(event);
  };

  const handlePointerLeave = (event) => {
    if (viewState.dragState && event.pointerId === viewState.dragState.pointerId) {
      endTokenDrag({ commit: false, pointerId: event.pointerId });
    }
    clearDragCandidate(event.pointerId);
    endPan(event);
  };

  mapSurface.addEventListener('pointerup', handlePointerUp);
  mapSurface.addEventListener('pointercancel', handlePointerCancel);
  mapSurface.addEventListener('pointerleave', handlePointerLeave);

  const isTokenDragEvent = (event) => {
    if (!viewState.mapLoaded) {
      return false;
    }

    const { dataTransfer } = event;
    if (!dataTransfer) {
      return false;
    }

    return hasTokenData(dataTransfer, TOKEN_DRAG_TYPE);
  };

  const isWithinMapSurface = (target) =>
    target instanceof Node &&
    (mapSurface.contains(target) || (overlayDropProxyActive && mapOverlay?.contains(target)));

  const handleTokenDragEnter = (event) => {
    if (!isTokenDragEvent(event)) {
      return;
    }

    const previousTarget = event.relatedTarget;
    if (isWithinMapSurface(previousTarget)) {
      return;
    }

    event.preventDefault();
    tokenDropDepth += 1;
    mapSurface.classList.add('is-token-drop-active');
  };

  const handleTokenDragLeave = (event) => {
    if (!isTokenDragEvent(event)) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (isWithinMapSurface(nextTarget)) {
      return;
    }

    tokenDropDepth = Math.max(0, tokenDropDepth - 1);
    if (tokenDropDepth === 0) {
      mapSurface.classList.remove('is-token-drop-active');
    }
  };

  const handleTokenDragOver = (event) => {
    if (!isTokenDragEvent(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleTokenDrop = (event) => {
    if (!isTokenDragEvent(event)) {
      return;
    }

    event.preventDefault();
    mapSurface.classList.remove('is-token-drop-active');
    tokenDropDepth = 0;

    const template = readTokenTemplate(event.dataTransfer, TOKEN_DRAG_TYPE);
    if (!template) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      if (status) {
        status.textContent = 'Activate a scene before placing tokens.';
      }
      return;
    }

    const placement = calculateTokenPlacement(template, event, mapSurface, viewState);
    if (!placement) {
      if (status) {
        status.textContent = 'Unable to place token inside the map bounds.';
      }
      return;
    }

    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      scenePlacements.push(placement);
    });

    persistBoardStateSnapshot();

    if (status) {
      const label = template.name ? `"${template.name}"` : 'Token';
      status.textContent = `Placed ${label} on the scene.`;
    }
  };

  const tokenDragListenerOptions = { capture: true };

  let overlayDropProxyListenersAttached = false;

  function attachOverlayDropProxies() {
    if (!mapOverlay) {
      overlayDropProxyActive = false;
      overlayDropProxyListenersAttached = false;
      return;
    }
    if (overlayDropProxyListenersAttached) {
      overlayDropProxyActive = true;
      return;
    }

    mapOverlay.addEventListener('dragenter', handleTokenDragEnter, tokenDragListenerOptions);
    mapOverlay.addEventListener('dragleave', handleTokenDragLeave, tokenDragListenerOptions);
    mapOverlay.addEventListener('dragover', handleTokenDragOver, tokenDragListenerOptions);
    mapOverlay.addEventListener('drop', handleTokenDrop, tokenDragListenerOptions);
    overlayDropProxyActive = true;
    overlayDropProxyListenersAttached = true;
  }

  function detachOverlayDropProxies() {
    if (!overlayDropProxyListenersAttached || !mapOverlay) {
      overlayDropProxyActive = false;
      overlayDropProxyListenersAttached = false;
      return;
    }

    mapOverlay.removeEventListener('dragenter', handleTokenDragEnter, tokenDragListenerOptions);
    mapOverlay.removeEventListener('dragleave', handleTokenDragLeave, tokenDragListenerOptions);
    mapOverlay.removeEventListener('dragover', handleTokenDragOver, tokenDragListenerOptions);
    mapOverlay.removeEventListener('drop', handleTokenDrop, tokenDragListenerOptions);
    overlayDropProxyActive = false;
    overlayDropProxyListenersAttached = false;
  }

  mapSurface.addEventListener('dragenter', handleTokenDragEnter, tokenDragListenerOptions);
  mapSurface.addEventListener('dragleave', handleTokenDragLeave, tokenDragListenerOptions);
  mapSurface.addEventListener('dragover', handleTokenDragOver, tokenDragListenerOptions);
  mapSurface.addEventListener('drop', handleTokenDrop, tokenDragListenerOptions);

  document.addEventListener('dragend', () => {
    tokenDropDepth = 0;
    mapSurface.classList.remove('is-token-drop-active');
  });

  const applyGridState = (gridState = {}) => {
    if (!grid) return;

    const parsedSize = Number.parseInt(gridState.size, 10);
    const size = Number.isFinite(parsedSize) ? parsedSize : 64;
    const dimension = `${Math.max(8, size)}px`;
    grid.style.setProperty('--vtt-grid-size', dimension);
    const isVisible = gridState.visible ?? true;
    grid.classList.toggle('is-visible', Boolean(isVisible));
    viewState.gridSize = Math.max(8, size);
    templateTool.notifyGridChanged();
    overlayTool.notifyGridChanged();
  };

  const applyStateToBoard = (state = {}) => {
    const sceneState = normalizeSceneState(state.scenes);
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (activeSceneId !== lastActiveSceneId) {
      lastActiveSceneId = activeSceneId;
      selectedTokenIds.clear();
      notifySelectionChanged();
      resetCombatGroups();
      clearDragCandidate();
      if (viewState.dragState) {
        try {
          mapSurface.releasePointerCapture?.(viewState.dragState.pointerId);
        } catch (error) {
          // Ignore release errors when swapping scenes
        }
        viewState.dragState = null;
      }
      closeTokenSettings();
    }
    const activeScene = sceneState.items.find((scene) => scene.id === activeSceneId) ?? null;

    updateSceneMeta(activeScene);

    const nextUrl = state.boardState?.mapUrl ?? null;
    if (nextUrl !== viewState.activeMapUrl) {
      loadMap(nextUrl);
    }
    const overlayConfig = resolveSceneOverlayState(state.boardState ?? {}, activeSceneId);
    syncOverlayLayer(overlayConfig);
    overlayTool.notifyOverlayMaskChange(overlayConfig ?? null);
    applyGridState(state.grid ?? {});
    renderTokens(state, tokenLayer, viewState);
    templateTool.notifyMapState();
    overlayTool.notifyMapState();
    applyCombatStateFromBoardState(state);
    processIncomingPings(state.boardState?.pings ?? [], activeSceneId);

    if (activeTokenSettingsId) {
      const placementForSettings = resolvePlacementById(state, activeSceneId, activeTokenSettingsId);
      if (!placementForSettings) {
        closeTokenSettings();
      } else {
        syncTokenSettingsForm(placementForSettings);
      }
    }
  };

  if (typeof boardApi.subscribe === 'function') {
    boardApi.subscribe(applyStateToBoard);
  }

  if (grid && (!boardApi || typeof boardApi.updateState !== 'function')) {
    const toggleGridButton = document.querySelector('[data-action="toggle-grid"]');
    toggleGridButton?.addEventListener('click', () => {
      grid.classList.toggle('is-visible');
    });
  }

  applyStateToBoard(boardApi.getState?.() ?? {});
  startBoardStatePoller();

  function focusBoard() {
    if (!board) {
      return;
    }
    if (document.activeElement === board) {
      return;
    }
    try {
      board.focus({ preventScroll: true });
    } catch (error) {
      board.focus();
    }
  }

  function notifySelectionChanged() {
    if (!groupButton) {
      return;
    }

    const canGroup = selectedTokenIds.size > 1;
    groupButton.disabled = !canGroup;
    groupButton.title = canGroup
      ? 'Group selected tokens in the combat tracker'
      : 'Select at least two tokens to enable grouping';
  }

  function updateSelection(id, { additive = false, toggle = false } = {}) {
    if (typeof id !== 'string' || !id) {
      return false;
    }

    if (toggle) {
      if (selectedTokenIds.has(id)) {
        selectedTokenIds.delete(id);
        notifySelectionChanged();
        return true;
      }
      selectedTokenIds.add(id);
      notifySelectionChanged();
      return true;
    }

    if (additive) {
      if (selectedTokenIds.has(id)) {
        return false;
      }
      selectedTokenIds.add(id);
      notifySelectionChanged();
      return true;
    }

    if (selectedTokenIds.size === 1 && selectedTokenIds.has(id)) {
      return false;
    }

    if (selectedTokenIds.size === 0) {
      selectedTokenIds.add(id);
      notifySelectionChanged();
      return true;
    }

    selectedTokenIds.clear();
    selectedTokenIds.add(id);
    notifySelectionChanged();
    return true;
  }

  function clearSelection() {
    if (!selectedTokenIds.size) {
      return false;
    }
    selectedTokenIds.clear();
    notifySelectionChanged();
    return true;
  }

  function prepareTokenDrag(event, placement) {
    if (!viewState.mapLoaded) {
      return;
    }
    if (!placement || typeof placement !== 'object' || !placement.id) {
      return;
    }

    const pointer = getLocalMapPoint(event);
    if (!pointer) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const placements = getActiveScenePlacements(state);
    if (!Array.isArray(placements) || !placements.length) {
      return;
    }

    const candidateIds =
      selectedTokenIds.size && selectedTokenIds.has(placement.id)
        ? Array.from(selectedTokenIds)
        : [placement.id];
    if (!candidateIds.length) {
      return;
    }

    const placementMap = new Map();
    placements.forEach((entry) => {
      const normalized = normalizePlacementForRender(entry);
      if (normalized) {
        placementMap.set(normalized.id, normalized);
      }
    });

    const tokens = [];
    const originals = new Map();
    candidateIds.forEach((id) => {
      const info = placementMap.get(id);
      if (!info) {
        return;
      }
      tokens.push({ ...info });
      originals.set(id, {
        column: info.column,
        row: info.row,
        width: info.width,
        height: info.height,
      });
    });

    if (!tokens.length) {
      return;
    }

    viewState.dragCandidate = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPointer: pointer,
      tokens,
      originalPositions: originals,
    };
  }

  function beginTokenDrag(event) {
    const candidate = viewState.dragCandidate;
    if (!candidate || candidate.pointerId !== event.pointerId) {
      return false;
    }
    if (!candidate.tokens || !candidate.tokens.length) {
      viewState.dragCandidate = null;
      return false;
    }

    viewState.dragCandidate = null;

    const preview = new Map();
    candidate.tokens.forEach((token) => {
      if (!token || !token.id) {
        return;
      }
      preview.set(token.id, {
        column: token.column ?? 0,
        row: token.row ?? 0,
        width: token.width ?? 1,
        height: token.height ?? 1,
      });
    });

    viewState.dragState = {
      pointerId: candidate.pointerId,
      startPointer: candidate.startPointer,
      tokens: candidate.tokens.map((token) => ({ ...token })),
      originalPositions: candidate.originalPositions,
      previewPositions: preview,
      hasMoved: false,
      measurement: null,
    };

    if (isMeasureModeActive()) {
      const primaryToken = candidate.tokens.find((token) => token && token.id) ?? null;
      if (primaryToken) {
        const original = candidate.originalPositions.get(primaryToken.id) ?? {
          column: primaryToken.column ?? 0,
          row: primaryToken.row ?? 0,
          width: primaryToken.width ?? 1,
          height: primaryToken.height ?? 1,
        };
        const startPoint = measurementPointFromToken(original);
        if (startPoint && beginExternalMeasurement(startPoint)) {
          viewState.dragState.measurement = {
            tokenId: primaryToken.id,
          };
        }
      }
    }

    try {
      mapSurface.setPointerCapture?.(candidate.pointerId);
    } catch (error) {
      // Ignore capture issues for unsupported browsers
    }

    applyDragPreview(preview, false);
    return true;
  }

  function updateTokenDrag(event) {
    const dragState = viewState.dragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      endTokenDrag({ commit: false, pointerId: event.pointerId });
      return;
    }

    const pointer = getLocalMapPoint(event);
    if (!pointer) {
      return;
    }

    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return;
    }

    const deltaX = (pointer.x - dragState.startPointer.x) / gridSize;
    const deltaY = (pointer.y - dragState.startPointer.y) / gridSize;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }

    const nextPreview = new Map();
    let changed = false;

    dragState.tokens.forEach((token) => {
      if (!token || !token.id) {
        return;
      }
      const origin = dragState.originalPositions.get(token.id);
      if (!origin) {
        return;
      }
      const width = Math.max(1, toNonNegativeNumber(origin.width ?? token.width ?? 1, 1));
      const height = Math.max(1, toNonNegativeNumber(origin.height ?? token.height ?? 1, 1));
      const baseColumn = toNonNegativeNumber(origin.column ?? token.column ?? 0, 0);
      const baseRow = toNonNegativeNumber(origin.row ?? token.row ?? 0, 0);
      const nextColumn = baseColumn + deltaX;
      const nextRow = baseRow + deltaY;
      const clamped = clampPlacementToBounds(nextColumn, nextRow, width, height);
      const previous = dragState.previewPositions?.get(token.id);
      if (!previous || previous.column !== clamped.column || previous.row !== clamped.row) {
        changed = true;
      }
      nextPreview.set(token.id, {
        column: clamped.column,
        row: clamped.row,
        width,
        height,
      });
    });

    if (!nextPreview.size) {
      return;
    }

    applyDragPreview(nextPreview, changed);
  }

  function endTokenDrag({ commit = false, pointerId = null } = {}) {
    const dragState = viewState.dragState;
    if (!dragState) {
      clearDragCandidate(pointerId);
      return;
    }

    if (pointerId !== null && dragState.pointerId !== pointerId) {
      return;
    }

    try {
      mapSurface.releasePointerCapture?.(dragState.pointerId);
    } catch (error) {
      // Ignore release errors
    }

    const preview = dragState.previewPositions;
    const moved = dragState.hasMoved;
    const measurement = dragState.measurement ?? null;

    if (measurement) {
      if (!isMeasureModeActive()) {
        cancelExternalMeasurement();
      } else if (commit && moved && preview && preview.size && measurement.tokenId) {
        const finalPosition = preview instanceof Map ? preview.get(measurement.tokenId) : null;
        const finalPoint = finalPosition ? measurementPointFromToken(finalPosition) : null;
        if (finalPoint) {
          finalizeExternalMeasurement(finalPoint);
        } else {
          cancelExternalMeasurement();
        }
      } else {
        cancelExternalMeasurement();
      }
    }

    viewState.dragState = null;
    clearDragCandidate(pointerId);

    if (commit && moved && preview && preview.size) {
      commitDragPreview(preview);
    } else {
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
    }
  }

  function applyDragPreview(preview, changed) {
    if (!viewState.dragState) {
      return;
    }
    viewState.dragState.previewPositions = preview;
    if (changed) {
      viewState.dragState.hasMoved = true;
    }
    if (viewState.dragState.measurement) {
      syncTokenMeasurement(preview);
    }
    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
  }

  function syncTokenMeasurement(preview) {
    const dragState = viewState.dragState;
    if (!dragState || !dragState.measurement) {
      return;
    }

    if (!isMeasureModeActive()) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    const tokenId = dragState.measurement.tokenId;
    if (!tokenId) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    const previewMap = preview instanceof Map ? preview : null;
    const position = previewMap?.get(tokenId) ?? dragState.originalPositions?.get(tokenId) ?? null;
    const nextPoint = position ? measurementPointFromToken(position) : null;
    if (!nextPoint) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    updateExternalMeasurement(nextPoint);
  }

  function clearDragCandidate(pointerId = null) {
    if (!viewState.dragCandidate) {
      return;
    }
    if (pointerId !== null && viewState.dragCandidate.pointerId !== pointerId) {
      return;
    }
    viewState.dragCandidate = null;
  }

  function commitDragPreview(preview) {
    if (typeof boardApi.updateState !== 'function') {
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      renderTokens(state, tokenLayer, viewState);
      return;
    }

    const updates = new Map();
    preview.forEach((position, id) => {
      if (!id) {
        return;
      }
      const column = toNonNegativeNumber(position.column ?? position.col ?? 0);
      const row = toNonNegativeNumber(position.row ?? position.y ?? 0);
      const width = Math.max(1, toNonNegativeNumber(position.width ?? position.columns ?? 1));
      const height = Math.max(1, toNonNegativeNumber(position.height ?? position.rows ?? 1));
      updates.set(id, { column, row, width, height });
    });

    if (!updates.size) {
      renderTokens(state, tokenLayer, viewState);
      return;
    }

    let movedCount = 0;
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      if (!Array.isArray(scenePlacements) || !scenePlacements.length) {
        return;
      }
      scenePlacements.forEach((placement) => {
        if (!placement || typeof placement !== 'object') {
          return;
        }
        const next = updates.get(placement.id);
        if (!next) {
          return;
        }
        const clamped = clampPlacementToBounds(next.column, next.row, next.width, next.height);
        if (placement.column !== clamped.column || placement.row !== clamped.row) {
          placement.column = clamped.column;
          placement.row = clamped.row;
          movedCount += 1;
        }
      });
    });

    if (movedCount) {
      persistBoardStateSnapshot();
    }

    if (movedCount && status) {
      const noun = movedCount === 1 ? 'token' : 'tokens';
      status.textContent = `Moved ${movedCount} ${noun}.`;
    }

    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
  }

  function getLocalMapPoint(event) {
    const pointer = getPointerPosition(event, mapSurface);
    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const translation = viewState.translation ?? { x: 0, y: 0 };
    const offsetX = Number.isFinite(translation.x) ? translation.x : 0;
    const offsetY = Number.isFinite(translation.y) ? translation.y : 0;
    const localX = (pointer.x - offsetX) / scale;
    const localY = (pointer.y - offsetY) / scale;
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      return null;
    }
    return { x: localX, y: localY };
  }

  function handleMapPing(event, { focus = false } = {}) {
    if (!viewState.mapLoaded) {
      return false;
    }

    const pointer = getLocalMapPoint(event);
    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (!pointer || mapWidth <= 0 || mapHeight <= 0) {
      return false;
    }

    const normalizedX = Math.min(1, Math.max(0, pointer.x / mapWidth));
    const normalizedY = Math.min(1, Math.max(0, pointer.y / mapHeight));

    const state = boardApi.getState?.() ?? {};
    const sceneIdRaw = typeof state?.boardState?.activeSceneId === 'string'
      ? state.boardState.activeSceneId
      : null;
    const sceneId = sceneIdRaw && sceneIdRaw.trim() ? sceneIdRaw : null;
    const authorId = normalizeProfileId(getCurrentUserId());
    const now = Date.now();
    const signatureSeed = Math.random().toString(36).slice(2, 10);
    const baseId = authorId ? `${authorId}:${now}` : `${now}`;
    const pingId = `${baseId}:${signatureSeed}`;

    const pingEntry = {
      id: pingId,
      sceneId,
      x: normalizedX,
      y: normalizedY,
      type: focus ? 'focus' : 'ping',
      createdAt: now,
    };
    if (authorId) {
      pingEntry.authorId = authorId;
    }

    const queued = queuePingForState(pingEntry);
    recordProcessedPing(pingEntry);
    renderPing(pingEntry);
    if (focus) {
      centerViewOnPing(pingEntry);
    }
    if (queued) {
      persistBoardStateSnapshot();
    }

    return true;
  }

  function queuePingForState(pingEntry) {
    if (typeof boardApi.updateState !== 'function') {
      return false;
    }

    let updated = false;
    const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
    boardApi.updateState((draft) => {
      if (!draft.boardState || typeof draft.boardState !== 'object') {
        draft.boardState = { pings: [] };
      }
      if (!Array.isArray(draft.boardState.pings)) {
        draft.boardState.pings = [];
      }

      draft.boardState.pings = draft.boardState.pings
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          const createdAt = Number(entry.createdAt ?? entry.timestamp ?? 0);
          if (!Number.isFinite(createdAt)) {
            return false;
          }
          return createdAt >= retentionThreshold;
        })
        .slice(-MAP_PING_HISTORY_LIMIT + 1);

      draft.boardState.pings.push({ ...pingEntry });
      if (draft.boardState.pings.length > MAP_PING_HISTORY_LIMIT) {
        draft.boardState.pings = draft.boardState.pings.slice(
          draft.boardState.pings.length - MAP_PING_HISTORY_LIMIT
        );
      }
      updated = true;
    });

    return updated;
  }

  function normalizeIncomingPing(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) {
      return null;
    }

    const createdAtRaw = Number(entry.createdAt ?? entry.timestamp ?? Date.now());
    const createdAt = Number.isFinite(createdAtRaw) ? Math.max(0, Math.trunc(createdAtRaw)) : Date.now();
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const normalized = {
      id,
      sceneId:
        typeof entry.sceneId === 'string' && entry.sceneId.trim()
          ? entry.sceneId.trim()
          : null,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      type:
        typeof entry.type === 'string' && entry.type.trim().toLowerCase() === 'focus'
          ? 'focus'
          : 'ping',
      createdAt,
    };

    return normalized;
  }

  function renderPing(pingEntry) {
    if (!pingLayer || !viewState.mapLoaded) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const localX = Math.min(1, Math.max(0, pingEntry.x)) * mapWidth;
    const localY = Math.min(1, Math.max(0, pingEntry.y)) * mapHeight;
    spawnPingPulse(localX, localY, pingEntry.type, 0);
  }

  function spawnPingPulse(localX, localY, type, delayMs) {
    if (!pingLayer) {
      return;
    }

    const element = document.createElement('div');
    element.className = 'vtt-board__ping';
    if (type === 'focus') {
      element.classList.add('vtt-board__ping--focus');
    }
    element.style.left = `${localX}px`;
    element.style.top = `${localY}px`;
    element.style.setProperty('--vtt-ping-delay', `${delayMs}ms`);

    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const baseSize = 160;
    const size = baseSize / scale;
    element.style.setProperty('--vtt-ping-size', `${size}px`);

    pingLayer.appendChild(element);
    const cleanupDelay = MAP_PING_ANIMATION_DURATION_MS + delayMs + 160;
    scheduleTimeout(() => {
      element.remove();
    }, cleanupDelay);
  }

  function scheduleTimeout(callback, delayMs) {
    if (typeof callback !== 'function') {
      return;
    }
    const timer =
      typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout.bind(window)
        : typeof setTimeout === 'function'
        ? setTimeout
        : null;
    if (timer) {
      timer(callback, delayMs);
    }
  }

  function recordProcessedPing(pingEntry) {
    if (!pingEntry || typeof pingEntry.id !== 'string') {
      return;
    }
    const timestamp = Number.isFinite(pingEntry.createdAt)
      ? pingEntry.createdAt
      : Date.now();
    processedPings.set(pingEntry.id, timestamp);
    pruneProcessedPings();
  }

  function pruneProcessedPings(now = Date.now()) {
    processedPings.forEach((timestamp, id) => {
      if (!Number.isFinite(timestamp) || now - timestamp > MAP_PING_PROCESSED_RETENTION_MS) {
        processedPings.delete(id);
      }
    });
  }

  function processIncomingPings(entries, activeSceneId) {
    const list = Array.isArray(entries) ? entries : [];
    const now = Date.now();
    pruneProcessedPings(now);

    const retentionThreshold = now - MAP_PING_RETENTION_MS;
    const staleIndexes = [];
    const pendingPings = [];

    list.forEach((entry, index) => {
      const ping = normalizeIncomingPing(entry);
      if (!ping) {
        return;
      }

      if (ping.createdAt < retentionThreshold) {
        staleIndexes.push(index);
        return;
      }

      pendingPings.push(ping);
    });

    if (staleIndexes.length && Array.isArray(entries)) {
      for (let i = staleIndexes.length - 1; i >= 0; i -= 1) {
        entries.splice(staleIndexes[i], 1);
      }
    }

    if (!viewState.mapLoaded) {
      return;
    }

    pendingPings.forEach((ping) => {
      if (ping.sceneId && activeSceneId && ping.sceneId !== activeSceneId) {
        return;
      }
      if (processedPings.has(ping.id)) {
        return;
      }
      recordProcessedPing(ping);
      renderPing(ping);
      if (ping.type === 'focus') {
        centerViewOnPing(ping);
      }
    });
  }

  function centerViewOnPing(pingEntry) {
    if (!board || !viewState.mapLoaded) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const boardRect = board.getBoundingClientRect();
    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const localX = Math.min(1, Math.max(0, pingEntry.x)) * mapWidth;
    const localY = Math.min(1, Math.max(0, pingEntry.y)) * mapHeight;
    const desiredX = boardRect.width / 2 - localX * scale;
    const desiredY = boardRect.height / 2 - localY * scale;

    const mapWidthScaled = mapWidth * scale;
    const mapHeightScaled = mapHeight * scale;
    const minX = Math.min(0, boardRect.width - mapWidthScaled);
    const maxX = Math.max(0, boardRect.width - mapWidthScaled);
    const minY = Math.min(0, boardRect.height - mapHeightScaled);
    const maxY = Math.max(0, boardRect.height - mapHeightScaled);

    viewState.translation.x = clamp(desiredX, minX, maxX);
    viewState.translation.y = clamp(desiredY, minY, maxY);
    applyTransform();
  }

  function clampPlacementToBounds(column, row, width, height) {
    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    const offsets = viewState.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);

    if (innerWidth <= 0 || innerHeight <= 0 || !Number.isFinite(gridSize) || gridSize <= 0) {
      return {
        column: Math.max(0, Math.round(column)),
        row: Math.max(0, Math.round(row)),
      };
    }

    const maxColumn = Math.max(0, Math.floor(innerWidth / gridSize - Math.max(1, width)));
    const maxRow = Math.max(0, Math.floor(innerHeight / gridSize - Math.max(1, height)));

    return {
      column: clamp(Math.round(column), 0, maxColumn),
      row: clamp(Math.round(row), 0, maxRow),
    };
  }

  function enqueueMovement(delta) {
    if (!delta || typeof delta !== 'object') {
      return;
    }
    const stepX = Number.isFinite(delta.x) ? Math.trunc(delta.x) : 0;
    const stepY = Number.isFinite(delta.y) ? Math.trunc(delta.y) : 0;
    if (stepX === 0 && stepY === 0) {
      return;
    }
    if (movementQueue.length >= MAX_QUEUED_MOVEMENTS) {
      return;
    }
    movementQueue.push({ x: stepX, y: stepY });
    scheduleMovementProcessing();
  }

  function scheduleMovementProcessing() {
    if (movementScheduled) {
      return;
    }
    movementScheduled = true;
    const schedule = window.requestAnimationFrame?.bind(window) ?? ((callback) => window.setTimeout(callback, 16));
    schedule(processMovementQueue);
  }

  function processMovementQueue() {
    movementScheduled = false;
    const next = movementQueue.shift();
    if (!next) {
      return;
    }
    applyMovementDelta(next);
    if (movementQueue.length) {
      scheduleMovementProcessing();
    }
  }

  function applyMovementDelta(delta) {
    if (!viewState.mapLoaded) {
      return;
    }
    if (typeof boardApi.updateState !== 'function') {
      return;
    }

    const stepX = Number.isFinite(delta?.x) ? Math.trunc(delta.x) : 0;
    const stepY = Number.isFinite(delta?.y) ? Math.trunc(delta.y) : 0;
    if (stepX === 0 && stepY === 0) {
      return;
    }

    const selectedIds = Array.from(selectedTokenIds);
    if (!selectedIds.length) {
      return;
    }

    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const offsets = viewState.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return;
    }

    const gridColumns = Math.max(0, Math.floor(innerWidth / gridSize));
    const gridRows = Math.max(0, Math.floor(innerHeight / gridSize));
    if (gridColumns <= 0 && gridRows <= 0) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    let moved = false;
    boardApi.updateState?.((draft) => {
      if (!draft.boardState || typeof draft.boardState !== 'object') {
        return;
      }
      const placementsByScene = draft.boardState.placements;
      if (!placementsByScene || typeof placementsByScene !== 'object') {
        return;
      }
      const scenePlacements = placementsByScene[activeSceneId];
      if (!Array.isArray(scenePlacements) || !scenePlacements.length) {
        return;
      }

      scenePlacements.forEach((placement) => {
        if (!placement || typeof placement !== 'object') {
          return;
        }
        if (!selectedSet.has(placement.id)) {
          return;
        }
        const width = Math.max(1, Number.isFinite(placement.width) ? placement.width : 1);
        const height = Math.max(1, Number.isFinite(placement.height) ? placement.height : 1);
        const currentColumn = Number.isFinite(placement.column) ? placement.column : 0;
        const currentRow = Number.isFinite(placement.row) ? placement.row : 0;
        const maxColumn = Math.max(0, gridColumns - width);
        const maxRow = Math.max(0, gridRows - height);
        const nextColumn = clamp(currentColumn + stepX, 0, maxColumn);
        const nextRow = clamp(currentRow + stepY, 0, maxRow);
        if (nextColumn !== currentColumn || nextRow !== currentRow) {
          placement.column = nextColumn;
          placement.row = nextRow;
          moved = true;
        }
      });
    });

    if (moved) {
      persistBoardStateSnapshot();
    }

    if (moved && status) {
      const count = selectedSet.size;
      const noun = count === 1 ? 'token' : 'tokens';
      status.textContent = `Moved ${count} ${noun}.`;
    }
  }

  function removeSelectedTokens() {
    if (!selectedTokenIds.size) {
      return;
    }
    if (typeof boardApi.updateState !== 'function') {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    const selectedSet = new Set(selectedTokenIds);
    if (!selectedSet.size) {
      return;
    }

    let removedCount = 0;
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      if (!Array.isArray(scenePlacements) || !scenePlacements.length) {
        return;
      }
      const nextPlacements = scenePlacements.filter((placement) => {
        if (!placement || typeof placement !== 'object') {
          return true;
        }
        return !selectedSet.has(placement.id);
      });
      removedCount = scenePlacements.length - nextPlacements.length;
      if (removedCount > 0) {
        draft.boardState.placements[activeSceneId] = nextPlacements;
      }
    });

    if (removedCount > 0) {
      persistBoardStateSnapshot();
      selectedTokenIds.clear();
      notifySelectionChanged();
      if (status) {
        const noun = removedCount === 1 ? 'token' : 'tokens';
        status.textContent = `Removed ${removedCount} ${noun} from the scene.`;
      }
    }
  }

  function loadMap(url) {
    const loadToken = ++mapLoadSequence;
    viewState.activeMapUrl = url || null;
    viewState.mapLoaded = false;
    lastOverlaySignature = null;
    clearDragCandidate();
    if (viewState.dragState) {
      try {
        mapSurface.releasePointerCapture?.(viewState.dragState.pointerId);
      } catch (error) {
        // Ignore release issues when resetting the map
      }
      viewState.dragState = null;
    }
    selectedTokenIds.clear();
    notifySelectionChanged();
    renderedPlacements = [];
    mapImage.hidden = true;
    mapBackdrop.hidden = !url;
    mapTransform.hidden = !url;
    if (grid) {
      grid.hidden = !url;
    }
    if (!url) {
      teardownOverlayLayer();
    }
    resetView();
    applyGridOffsets();

    if (!url) {
      mapTransform.style.width = '';
      mapTransform.style.height = '';
      emptyState?.removeAttribute('hidden');
      updateSceneMeta(null);
      viewState.mapPixelSize = { width: 0, height: 0 };
      resetCombatGroups();
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      templateTool.reset();
      overlayTool.reset();
      return;
    }

    emptyState?.setAttribute('hidden', 'hidden');

    let loadHandled = false;

    const handleMapImageLoad = () => {
      if (loadHandled || loadToken !== mapLoadSequence) {
        return;
      }
      loadHandled = true;
      viewState.mapLoaded = true;
      calibrateToBoard();
      mapImage.hidden = false;
      mapBackdrop.hidden = false;
      mapTransform.hidden = false;
      if (grid) {
        grid.hidden = false;
        applyGridState(boardApi.getState?.().grid ?? {});
      }
      const latestState = boardApi.getState?.() ?? {};
      const activeSceneId = latestState.boardState?.activeSceneId ?? null;
      const overlayState = resolveSceneOverlayState(latestState.boardState ?? {}, activeSceneId);
      syncOverlayLayer(overlayState);
      if (status) {
        status.textContent = 'Right-click and drag to pan. Use the mouse wheel to zoom.';
      }
      updateSceneMeta(activeSceneFromState());
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      templateTool.notifyMapState();
      maybeNudgeBoardState('map-ready');
    };
    const handleMapImageError = () => {
      if (loadHandled || loadToken !== mapLoadSequence) {
        return;
      }
      loadHandled = true;
      viewState.mapLoaded = false;
      mapImage.hidden = true;
      mapBackdrop.hidden = true;
      mapTransform.hidden = true;
      mapTransform.style.width = '';
      mapTransform.style.height = '';
      if (grid) {
        grid.hidden = true;
      }
      teardownOverlayLayer();
      emptyState?.removeAttribute('hidden');
      if (status) {
        status.textContent = 'Unable to display the uploaded map.';
      }
      viewState.mapPixelSize = { width: 0, height: 0 };
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      templateTool.reset();
      overlayTool.reset();
    };
    mapImage.onload = handleMapImageLoad;
    mapImage.onerror = handleMapImageError;
    mapImage.src = url;

    const scheduleMicrotask =
      typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);

    const waitForIntrinsicDimensions = () =>
      new Promise((resolve) => {
        const schedule = (callback) => {
          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(callback);
            return;
          }
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(callback);
            return;
          }
          setTimeout(callback, 16);
        };

        const checkDimensions = () => {
          if (loadHandled || loadToken !== mapLoadSequence) {
            resolve();
            return;
          }
          if (mapImage.naturalWidth > 0 && mapImage.naturalHeight > 0) {
            resolve();
            return;
          }
          if (!mapImage.complete) {
            schedule(checkDimensions);
            return;
          }
          schedule(checkDimensions);
        };

        checkDimensions();
      });

    const ensureImageReady = async () => {
      if (loadHandled || loadToken !== mapLoadSequence) {
        return;
      }

      if (mapImage.complete && mapImage.naturalWidth > 0 && mapImage.naturalHeight > 0) {
        handleMapImageLoad();
        return;
      }

      try {
        if (typeof mapImage.decode === 'function') {
          await mapImage.decode();
        } else {
          await waitForIntrinsicDimensions();
        }
      } catch (error) {
        if (loadHandled || loadToken !== mapLoadSequence) {
          return;
        }
        await waitForIntrinsicDimensions();
      }

      if (loadHandled || loadToken !== mapLoadSequence) {
        return;
      }
      if (mapImage.naturalWidth > 0 && mapImage.naturalHeight > 0) {
        handleMapImageLoad();
      }
    };

    if (mapImage.complete && mapImage.naturalWidth > 0 && mapImage.naturalHeight > 0) {
      handleMapImageLoad();
    }

    scheduleMicrotask(() => {
      ensureImageReady().catch(() => {});
    });
  }

  function resolveSceneOverlayState(boardState = {}, sceneId = null) {
    if (!boardState || typeof boardState !== 'object') {
      return null;
    }

    const sceneEntries =
      boardState.sceneState && typeof boardState.sceneState === 'object'
        ? boardState.sceneState
        : {};

    const key = typeof sceneId === 'string' ? sceneId : '';
    if (key && sceneEntries[key] && typeof sceneEntries[key] === 'object') {
      return sceneEntries[key].overlay ?? null;
    }

    return boardState.overlay ?? null;
  }

  function syncOverlayLayer(rawOverlay) {
    if (!mapOverlay || !overlayStack) {
      return;
    }

    const overlay = normalizeOverlayState(rawOverlay);
    const signature = safeStableStringify(overlay);
    if (signature === lastOverlaySignature) {
      return;
    }

    lastOverlaySignature = signature;

    const layers = Array.isArray(overlay.layers)
      ? overlay.layers.filter((layer) => {
          if (!layer || typeof layer !== 'object') {
            return false;
          }
          const url = typeof layer.mapUrl === 'string' ? layer.mapUrl.trim() : '';
          if (url) {
            return true;
          }
          const mask = layer.mask && typeof layer.mask === 'object' ? layer.mask : null;
          const hasMaskPolygons = Array.isArray(mask?.polygons)
            ? mask.polygons.some((polygon) => Array.isArray(polygon?.points) && polygon.points.length)
            : false;
          if (hasMaskPolygons) {
            return true;
          }
          return overlayEditorActive && overlay.activeLayerId === layer.id;
        })
      : [];

    if (!layers.length) {
      teardownOverlayLayer();
      return;
    }

    mapOverlay.dataset.activeOverlayLayerId = overlay.activeLayerId ?? '';

    const fragment = document.createDocumentFragment();
    const retained = new Set();
    let hasVisibleLayer = false;

    layers.forEach((layer, index) => {
      const mapUrl = typeof layer.mapUrl === 'string' ? layer.mapUrl.trim() : '';
      const baseVisible = layer.visible !== false;
      const hasMap = Boolean(mapUrl);

      let element = overlayLayerElements.get(layer.id);
      if (!element || element.parentNode !== overlayStack) {
        element = document.createElement('div');
        element.className = 'vtt-board__map-overlay-layer';
        element.dataset.overlayLayerId = layer.id;
        overlayLayerElements.set(layer.id, element);
      }

      retained.add(layer.id);
      element.dataset.overlayLayerIndex = String(index);
      element.dataset.overlayLayerBaseVisible = baseVisible ? 'true' : 'false';
      element.dataset.overlayHasMap = hasMap ? 'true' : 'false';
      element.style.backgroundImage = hasMap ? buildCssUrl(mapUrl) || '' : '';

      const maskAllowsDisplay = applyMaskToOverlayElement(element, layer.mask, {
        allowDuringEditing: overlayEditorActive && overlay.activeLayerId === layer.id,
      });

      const finalVisible = baseVisible && hasMap && maskAllowsDisplay;
      setOverlayLayerVisibility(element, finalVisible);
      if (finalVisible) {
        hasVisibleLayer = true;
      }

      fragment.append(element);
    });

    overlayLayerElements.forEach((element, id) => {
      if (!retained.has(id)) {
        if (element.parentNode === overlayStack) {
          element.remove();
        }
        overlayLayerElements.delete(id);
      }
    });

    overlayStack.replaceChildren(fragment);

    if (!hasVisibleLayer && !overlayEditorActive) {
      mapOverlay.hidden = true;
      mapOverlay.setAttribute('hidden', '');
    } else {
      mapOverlay.hidden = false;
      mapOverlay.removeAttribute('hidden');
    }
  }

  function teardownOverlayLayer() {
    if (!mapOverlay || !overlayStack) {
      return;
    }

    if (!overlayEditorActive) {
      mapOverlay.hidden = true;
      mapOverlay.setAttribute('hidden', '');
    }

    mapOverlay.dataset.activeOverlayLayerId = '';
    overlayLayerElements.forEach((element) => {
      clearOverlayMask(element);
      element.style.backgroundImage = '';
      setOverlayLayerVisibility(element, false);
      if (element.parentNode === overlayStack) {
        element.remove();
      }
    });
    overlayLayerElements.clear();
  }

  function applyMaskToOverlayElement(element, mask = {}, options = {}) {
    if (!element) {
      return false;
    }

    const { allowDuringEditing = false } =
      options && typeof options === 'object' ? options : {};

    clearOverlayMask(element);
    const normalizedMask = normalizeOverlayMask(mask);
    element.dataset.overlayMask = JSON.stringify(normalizedMask);
    const maskVisible = normalizedMask.visible !== false;
    element.dataset.overlayMaskVisible = maskVisible ? 'true' : 'false';

    if (!maskVisible && !allowDuringEditing) {
      element.setAttribute('data-overlay-mask-hidden', 'true');
      return false;
    }

    element.removeAttribute('data-overlay-mask-hidden');

    const maskUrl = typeof normalizedMask.url === 'string' ? normalizedMask.url.trim() : '';
    if (maskUrl) {
      const cssUrl = buildCssUrl(maskUrl);
      if (cssUrl) {
        element.style.maskImage = cssUrl;
        element.style.webkitMaskImage = cssUrl;
        element.style.maskRepeat = 'no-repeat';
        element.style.webkitMaskRepeat = 'no-repeat';
        element.style.maskSize = '100% 100%';
        element.style.webkitMaskSize = '100% 100%';
      }
      return true;
    }

    const clipPath = buildClipPathFromPolygons(normalizedMask.polygons, viewState);
    if (clipPath) {
      element.style.clipPath = clipPath;
      element.style.webkitClipPath = clipPath;
    }

    return true;
  }

  function clearOverlayMask(element) {
    if (!element) {
      return;
    }

    element.style.removeProperty('mask-image');
    element.style.removeProperty('-webkit-mask-image');
    element.style.removeProperty('mask-repeat');
    element.style.removeProperty('-webkit-mask-repeat');
    element.style.removeProperty('mask-size');
    element.style.removeProperty('-webkit-mask-size');
    element.style.removeProperty('clip-path');
    element.style.removeProperty('-webkit-clip-path');
    delete element.dataset.overlayMask;
    delete element.dataset.overlayMaskVisible;
    element.removeAttribute('data-overlay-mask-hidden');
  }

  function setOverlayLayerVisibility(element, visible) {
    if (!element) {
      return;
    }

    element.dataset.overlayVisible = visible ? 'true' : 'false';
    if (visible) {
      element.hidden = false;
      element.removeAttribute('hidden');
    } else {
      element.hidden = true;
      element.setAttribute('hidden', '');
    }
  }

  function applyOverlayMaskToLayer(layerId, mask, options = {}) {
    if (!layerId) {
      return false;
    }

    const element = overlayLayerElements.get(layerId);
    if (!element || element.parentNode !== overlayStack) {
      return false;
    }

    const baseVisible = element.dataset.overlayLayerBaseVisible !== 'false';
    const hasMap = element.dataset.overlayHasMap === 'true';
    const maskAllowsDisplay = applyMaskToOverlayElement(element, mask, options);
    const finalVisible = baseVisible && hasMap && maskAllowsDisplay;
    setOverlayLayerVisibility(element, finalVisible);
    return true;
  }

  function normalizeOverlayState(raw = null) {
    if (!raw || typeof raw !== 'object') {
      return createEmptyOverlayState();
    }

    const overlay = createEmptyOverlayState();
    const mapUrl = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
    if (mapUrl) {
      overlay.mapUrl = mapUrl;
    }

    const layerSource = Array.isArray(raw.layers)
      ? raw.layers
      : Array.isArray(raw.items)
      ? raw.items
      : [];

    overlay.layers = layerSource
      .map((entry, index) => normalizeOverlayLayer(entry, index))
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

    const legacyMask = normalizeOverlayMask(raw.mask ?? null);
    if (!overlay.layers.length && maskHasMeaningfulOverlayContent(legacyMask)) {
      const legacyLayer = normalizeOverlayLayer(
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

  function createEmptyOverlayState() {
    return { mapUrl: null, mask: createEmptyOverlayMask(), layers: [], activeLayerId: null };
  }

  function createOverlayLayer(name = '', existingLayers = []) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const safeLayers = Array.isArray(existingLayers) ? existingLayers : [];
    const resolvedName = ensureUniqueOverlayName(trimmed || 'Overlay', safeLayers);
    return {
      id: createOverlayLayerId(),
      name: resolvedName,
      visible: true,
      mask: createEmptyOverlayMask(),
      mapUrl: null,
    };
  }

  function ensureUniqueOverlayName(baseName, existingLayers = []) {
    const fallback = typeof baseName === 'string' && baseName.trim() ? baseName.trim() : 'Overlay';
    const normalizedExisting = new Set();
    const usedNumbers = new Set();

    existingLayers.forEach((layer) => {
      if (!layer || typeof layer !== 'object') {
        return;
      }

      const candidate = typeof layer.name === 'string' ? layer.name.trim() : '';
      if (!candidate) {
        return;
      }

      normalizedExisting.add(candidate.toLowerCase());

      const prefixMatch = fallbackPrefixMatch(candidate, fallback);
      if (prefixMatch !== null) {
        usedNumbers.add(prefixMatch);
      }
    });

    if (!normalizedExisting.has(fallback.toLowerCase())) {
      return fallback;
    }

    const prefix = deriveNamePrefix(fallback);
    const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\s+(\d+)$`, 'i');

    existingLayers.forEach((layer) => {
      if (!layer || typeof layer !== 'object') {
        return;
      }

      const candidate = typeof layer.name === 'string' ? layer.name.trim() : '';
      if (!candidate) {
        return;
      }

      const match = candidate.match(prefixPattern);
      if (match) {
        const value = Number.parseInt(match[1], 10);
        if (Number.isFinite(value)) {
          usedNumbers.add(value);
        }
      }
    });

    let counter = 1;
    const fallbackMatch = fallback.match(prefixPattern);
    if (fallbackMatch) {
      const preferred = Number.parseInt(fallbackMatch[1], 10);
      if (Number.isFinite(preferred) && preferred > 0) {
        counter = preferred;
      }
    }

    while (
      usedNumbers.has(counter) || normalizedExisting.has(`${prefix} ${counter}`.toLowerCase())
    ) {
      counter += 1;
    }

    return `${prefix} ${counter}`;
  }

  function deriveNamePrefix(name) {
    const match = name.match(/^(.*?)(?:\s+\d+)?$/);
    if (match) {
      const prefix = match[1].trim();
      if (prefix) {
        return prefix;
      }
    }
    return 'Overlay';
  }

  function fallbackPrefixMatch(candidate, fallback) {
    const prefix = deriveNamePrefix(fallback);
    const pattern = new RegExp(`^${escapeRegExp(prefix)}\s+(\d+)$`, 'i');
    const match = candidate.match(pattern);
    if (!match) {
      return null;
    }

    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function createOverlayLayerId() {
    overlayLayerSequence += 1;
    return `${OVERLAY_LAYER_PREFIX}${overlayLayerSeed.toString(36)}-${overlayLayerSequence.toString(36)}`;
  }

  function normalizeOverlayLayer(raw = {}, index = 0) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const mask = normalizeOverlayMask(raw.mask ?? raw);
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

  function rebuildOverlayAggregate(overlay) {
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

      const mask = normalizeOverlayMask(layer.mask ?? {});
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
            aggregate.polygons.push({ points: points.map((point) => ({ ...point })) });
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

  function createEmptyOverlayMask() {
    return { visible: true, polygons: [] };
  }

  function normalizeOverlayMask(raw = null) {
    if (!raw || typeof raw !== 'object') {
      return createEmptyOverlayMask();
    }

    const normalized = {
      visible: normalizeOverlayMaskVisibility(raw.visible),
      polygons: [],
    };

    if (typeof raw.url === 'string') {
      const trimmed = raw.url.trim();
      if (trimmed) {
        normalized.url = trimmed;
      }
    }

    const sourcePolygons = Array.isArray(raw.polygons) ? raw.polygons : [];
    sourcePolygons.forEach((entry) => {
      const rawPoints = Array.isArray(entry?.points) ? entry.points : Array.isArray(entry) ? entry : [];
      if (!Array.isArray(rawPoints)) {
        return;
      }

      const points = rawPoints.map(normalizeOverlayMaskPoint).filter(Boolean);
      if (points.length >= 3) {
        normalized.polygons.push({ points });
      }
    });

    return normalized;
  }

  function maskHasMeaningfulOverlayContent(mask = {}) {
    if (!mask || typeof mask !== 'object') {
      return false;
    }

    if (typeof mask.url === 'string' && mask.url.trim()) {
      return true;
    }

    return Array.isArray(mask.polygons) ? mask.polygons.length > 0 : false;
  }

  function normalizeOverlayMaskVisibility(value) {
    if (value === undefined) {
      return true;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
        return false;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
        return true;
      }
    }

    return Boolean(value);
  }

  function overlayMaskSignature(mask = null) {
    return safeStableStringify(normalizeOverlayMask(mask));
  }

  function normalizeOverlayMaskPoint(point) {
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

  function buildClipPathFromPolygons(polygons = [], view = viewState) {
    if (!Array.isArray(polygons) || polygons.length === 0) {
      return '';
    }

    const bounds = resolveGridBounds(view);
    const totalColumns = Number.isFinite(bounds?.columns) ? bounds.columns : 0;
    const totalRows = Number.isFinite(bounds?.rows) ? bounds.rows : 0;
    if (totalColumns <= 0 || totalRows <= 0) {
      return '';
    }

    const commands = [];

    polygons.forEach((polygon) => {
      const points = Array.isArray(polygon?.points) ? polygon.points : [];
      if (points.length < 3) {
        return;
      }

      const path = points
        .map((point, index) => {
          const xPercent = clamp(((point.column ?? 0) / totalColumns) * 100, 0, 100);
          const yPercent = clamp(((point.row ?? 0) / totalRows) * 100, 0, 100);
          if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
            return null;
          }
          return `${index === 0 ? 'M' : 'L'} ${roundToPrecision(xPercent, 4)}% ${roundToPrecision(yPercent, 4)}%`;
        })
        .filter(Boolean);

      if (path.length >= 3) {
        commands.push(`${path.join(' ')} Z`);
      }
    });

    if (!commands.length) {
      return '';
    }

    return `path('${commands.join(' ')}')`;
  }

  function resolveGridBounds(view = viewState) {
    const mapWidth = Number.isFinite(view?.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view?.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return { columns: 0, rows: 0 };
    }

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return { columns: 0, rows: 0 };
    }

    return {
      columns: innerWidth / gridSize,
      rows: innerHeight / gridSize,
    };
  }

  function roundToPrecision(value, precision = 4) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const places = Number.isFinite(precision) ? Math.max(0, Math.trunc(precision)) : 0;
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }

  function buildCssUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const sanitized = trimmed.replace(/["\\\n\r]/g, (char) => {
      if (char === '"') {
        return '\\"';
      }
      if (char === '\\') {
        return '\\\\';
      }
      return '';
    });

    return 'url("' + sanitized + '")';
  }

  function calibrateToBoard() {
    const boardRect = board.getBoundingClientRect();
    const styles = getComputedStyle(mapBackdrop);
    const paddingTop = parseFloat(styles.paddingTop || '0');
    const paddingRight = parseFloat(styles.paddingRight || '0');
    const paddingBottom = parseFloat(styles.paddingBottom || '0');
    const paddingLeft = parseFloat(styles.paddingLeft || '0');
    const mapWidth = mapImage.naturalWidth + paddingLeft + paddingRight;
    const mapHeight = mapImage.naturalHeight + paddingTop + paddingBottom;

    if (mapTransform) {
      mapTransform.style.width = `${mapWidth}px`;
      mapTransform.style.height = `${mapHeight}px`;
    }

    viewState.mapPixelSize = { width: mapWidth, height: mapHeight };
    applyGridOffsets({
      top: paddingTop,
      right: paddingRight,
      bottom: paddingBottom,
      left: paddingLeft,
    });

    const scaleX = boardRect.width / mapWidth;
    const scaleY = boardRect.height / mapHeight;
    const initialScale = Number.isFinite(Math.min(scaleX, scaleY))
      ? Math.min(1, Math.min(scaleX, scaleY))
      : 1;

    viewState.scale = clamp(initialScale, 0.02, 1);
    viewState.minScale = Math.min(viewState.scale, 0.05);
    viewState.maxScale = Math.max(5, viewState.scale * 6);

    viewState.translation.x = (boardRect.width - mapWidth * viewState.scale) / 2;
    viewState.translation.y = (boardRect.height - mapHeight * viewState.scale) / 2;
    applyTransform();
    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
    templateTool.notifyMapState();
  }

  function applyTransform() {
    if (!mapTransform) return;
    mapTransform.style.transform = `translate3d(${viewState.translation.x}px, ${viewState.translation.y}px, 0) scale(${viewState.scale})`;
    mapTransform.style.setProperty('--vtt-map-scale', String(viewState.scale));
    const overlayScale = viewState.scale ? 1 / viewState.scale : 1;
    mapTransform.style.setProperty('--vtt-overlay-scale', String(overlayScale));
    if (mapOverlay) {
      mapOverlay.style.setProperty('--vtt-overlay-scale', String(overlayScale));
    }
    if (grid) {
      const lineWidth = Math.max(1, 1 / viewState.scale);
      grid.style.setProperty('--vtt-grid-line-width', `${lineWidth}px`);
    }
  }

  function resetView() {
    viewState.scale = 1;
    viewState.translation = { x: 0, y: 0 };
    applyTransform();
  }

  function applyGridOffsets(offsets = {}) {
    const { top = 0, right = 0, bottom = 0, left = 0 } = offsets;
    const sanitize = (value) => (Number.isFinite(value) ? value : 0);
    const nextOffsets = {
      top: sanitize(top),
      right: sanitize(right),
      bottom: sanitize(bottom),
      left: sanitize(left),
    };
    viewState.gridOffsets = nextOffsets;
    if (mapOverlay) {
      mapOverlay.style.setProperty('--vtt-grid-offset-top', `${nextOffsets.top}px`);
      mapOverlay.style.setProperty('--vtt-grid-offset-right', `${nextOffsets.right}px`);
      mapOverlay.style.setProperty('--vtt-grid-offset-bottom', `${nextOffsets.bottom}px`);
      mapOverlay.style.setProperty('--vtt-grid-offset-left', `${nextOffsets.left}px`);
    }
    if (!grid) {
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      return;
    }
    grid.style.setProperty('--vtt-grid-offset-top', `${nextOffsets.top}px`);
    grid.style.setProperty('--vtt-grid-offset-right', `${nextOffsets.right}px`);
    grid.style.setProperty('--vtt-grid-offset-bottom', `${nextOffsets.bottom}px`);
    grid.style.setProperty('--vtt-grid-offset-left', `${nextOffsets.left}px`);
    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
    templateTool.notifyGridChanged();
  }

  function setUploadingState(isUploading) {
    if (!uploadButton) return;
    uploadButton.disabled = isUploading;
    uploadButton.classList.toggle('is-loading', isUploading);
    if (isUploading && status) {
      status.textContent = 'Uploading map…';
    }
  }

  function updateSceneMeta(scene) {
    if (sceneName) {
      sceneName.textContent = scene ? scene.name || 'Untitled Scene' : 'No Active Scene';
    }
    if (status && !viewState.mapLoaded) {
      status.textContent = scene ? 'Loading scene map…' : defaultStatusText;
    }
  }

  function activeSceneFromState() {
    const state = boardApi.getState?.() ?? {};
    const sceneState = normalizeSceneState(state.scenes);
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    return sceneState.items.find((scene) => scene.id === activeSceneId) ?? null;
  }

  function getPointerPosition(event, element) {
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function renderTokens(state = {}, layer, view) {
    if (!layer) {
      updateCombatTracker([]);
      return;
    }

    renderedPlacements = [];
    const gmViewing = isGmUser();

    const gridSize = Math.max(8, Number.isFinite(view?.gridSize) ? view.gridSize : 64);
    const offsets = view?.gridOffsets ?? {};
    const leftOffset = Number.isFinite(offsets.left) ? offsets.left : 0;
    const topOffset = Number.isFinite(offsets.top) ? offsets.top : 0;

    const placements = view?.mapLoaded ? getActiveScenePlacements(state) : [];
    if (!view?.mapLoaded || !placements.length || !Number.isFinite(gridSize) || gridSize <= 0) {
      while (layer.firstChild) {
        layer.removeChild(layer.firstChild);
      }
      layer.hidden = true;
      renderedPlacements = [];
      tokenRotationAngles.clear();
      selectedTokenIds.clear();
      notifySelectionChanged();
      closeTokenSettings();
      updateCombatTracker([]);
      return;
    }

    const previewPositions = view?.dragState?.previewPositions ?? null;
    const existingNodes = new Map();
    Array.from(layer.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        layer.removeChild(child);
        return;
      }
      const id = child.dataset?.placementId;
      if (id) {
        existingNodes.set(id, child);
      } else {
        layer.removeChild(child);
      }
    });

    const fragment = document.createDocumentFragment();
    let renderedCount = 0;
    const retainedSelection = new Set();
    const trackerEntries = [];
    const activeRotationIds = new Set();

    placements.forEach((placement) => {
      const normalized = normalizePlacementForRender(placement);
      if (!normalized) {
        return;
      }

      if (!gmViewing && normalized.hidden) {
        return;
      }

      trackerEntries.push(normalized);

      activeRotationIds.add(normalized.id);

      let column = normalized.column;
      let row = normalized.row;
      let width = normalized.width;
      let height = normalized.height;

      if (previewPositions && previewPositions.has(normalized.id)) {
        const preview = previewPositions.get(normalized.id) ?? {};
        column = toNonNegativeNumber(preview.column ?? column, column);
        row = toNonNegativeNumber(preview.row ?? row, row);
        width = Math.max(1, toNonNegativeNumber(preview.width ?? width, width));
        height = Math.max(1, toNonNegativeNumber(preview.height ?? height, height));
      }

      renderedPlacements.push({ id: normalized.id, column, row, width, height });

      let token = existingNodes.get(normalized.id);
      if (token) {
        existingNodes.delete(normalized.id);
      } else {
        token = document.createElement('div');
        token.className = 'vtt-token';
      }

      token.dataset.placementId = normalized.id;
      token.style.width = `${width * gridSize}px`;
      token.style.height = `${height * gridSize}px`;
      const left = leftOffset + column * gridSize;
      const top = topOffset + row * gridSize;
      const baseTransform = `translate3d(${left}px, ${top}px, 0)`;
      token.style.transform = baseTransform;

      const rotation = tokenRotationAngles.get(normalized.id);
      if (Number.isFinite(rotation)) {
        token.style.setProperty('--vtt-token-rotation', `${rotation}deg`);
      } else {
        token.style.removeProperty('--vtt-token-rotation');
      }

      token.classList.toggle('vtt-token--hidden', Boolean(normalized.hidden));

      if (normalized.imageUrl) {
        let img = token.querySelector('img.vtt-token__image');
        if (!img) {
          img = document.createElement('img');
          img.className = 'vtt-token__image';
          token.appendChild(img);
        }
        if (img.src !== normalized.imageUrl) {
          img.src = normalized.imageUrl;
        }
        const alt = normalized.name || 'Token';
        if (img.alt !== alt) {
          img.alt = alt;
        }
        token.classList.remove('vtt-token--placeholder');
      } else {
        const existingImage = token.querySelector('img.vtt-token__image');
        if (existingImage) {
          existingImage.remove();
        }
        token.classList.add('vtt-token--placeholder');
      }

      if (selectedTokenIds.has(normalized.id)) {
        token.classList.add('is-selected');
        retainedSelection.add(normalized.id);
      } else {
        token.classList.remove('is-selected');
      }

      if (previewPositions && previewPositions.has(normalized.id)) {
        token.classList.add('is-dragging');
        token.style.zIndex = '10';
      } else {
        token.classList.remove('is-dragging');
        token.style.zIndex = '';
      }

      token.dataset.tokenName = normalized.name || '';
      applyTokenOverlays(token, normalized);
      attachBoardTokenHover(token, normalized.id);

      fragment.appendChild(token);
      renderedCount += 1;
    });

    if (selectedTokenIds.size) {
      const missing = [];
      selectedTokenIds.forEach((id) => {
        if (!retainedSelection.has(id)) {
          missing.push(id);
        }
      });
      if (missing.length) {
        missing.forEach((id) => selectedTokenIds.delete(id));
        notifySelectionChanged();
      }
    }

    tokenRotationAngles.forEach((_, id) => {
      if (!activeRotationIds.has(id)) {
        tokenRotationAngles.delete(id);
      }
    });

    existingNodes.forEach((node) => {
      node.remove();
    });

    while (layer.firstChild) {
      layer.removeChild(layer.firstChild);
    }

    if (renderedCount > 0) {
      layer.appendChild(fragment);
      layer.hidden = false;
    } else {
      layer.hidden = true;
      renderedPlacements = [];
    }

    updateCombatTracker(trackerEntries);
  }

  function updateCombatTracker(combatants = [], options = {}) {
    if (!combatTrackerRoot || !combatTrackerWaiting || !combatTrackerCompleted) {
      return;
    }

    const waitingContainer = combatTrackerWaiting;
    const completedContainer = combatTrackerCompleted;
    const gmViewing = isGmUser();
    const entries = Array.isArray(combatants)
      ? combatants
          .filter(Boolean)
          .filter((entry) => gmViewing || !toBoolean(entry.hidden ?? entry.isHidden ?? false, false))
      : [];

    combatantTeams.clear();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const id = typeof entry.id === 'string' ? entry.id : null;
      if (!id) {
        return;
      }
      const team = normalizeCombatTeam(entry.team ?? entry.combatTeam ?? null);
      combatantTeams.set(id, team);
    });

    if (!options?.skipCache) {
      lastCombatTrackerEntries = entries.map(cloneCombatantEntry).filter(Boolean);
    }

    const activeIds = new Set();
    entries.forEach((entry) => {
      if (entry && typeof entry.id === 'string') {
        activeIds.add(entry.id);
      }
    });

    const groupsPruned = pruneCombatGroups(activeIds);
    if (gmViewing) {
      pruneCompletedCombatants(activeIds);
    }

    if (groupsPruned && isGmUser() && !suppressCombatStateSync) {
      syncCombatStateToStore();
    }

    const waitingFragment = document.createDocumentFragment();
    const completedFragment = document.createDocumentFragment();
    const renderedRepresentatives = new Set();

    entries.forEach((combatant) => {
      if (!combatant || typeof combatant !== 'object') {
        return;
      }

      const id = typeof combatant.id === 'string' ? combatant.id : null;
      if (!id) {
        return;
      }

      const representativeId = getRepresentativeIdFor(id);
      if (!representativeId || representativeId !== id) {
        return;
      }

      if (renderedRepresentatives.has(representativeId)) {
        return;
      }
      renderedRepresentatives.add(representativeId);

      const label = typeof combatant.name === 'string' && combatant.name.trim() ? combatant.name.trim() : 'Token';
      const token = document.createElement('div');
      token.className = 'vtt-combat-token';
      token.dataset.combatantId = representativeId;
      token.setAttribute('role', 'listitem');
      token.setAttribute('tabindex', isGmUser() ? '0' : '-1');

      const groupMembers = getGroupMembers(representativeId);
      const groupSize = groupMembers.length;
      const accessibleLabel = groupSize > 1 ? `${label} (group of ${groupSize})` : label;
      token.setAttribute('aria-label', accessibleLabel);
      token.title = accessibleLabel;

      const imageUrl = typeof combatant.imageUrl === 'string' ? combatant.imageUrl : '';
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = label;
        token.appendChild(img);
      } else {
        const initials = document.createElement('span');
        initials.className = 'vtt-combat-token__initials';
        initials.textContent = deriveTokenInitials(label);
        token.appendChild(initials);
      }

      if (groupSize > 1) {
        token.dataset.groupSize = String(groupSize);
      } else if ('groupSize' in token.dataset) {
        delete token.dataset.groupSize;
      }

      const team = getCombatantTeam(representativeId);
      if (team) {
        token.dataset.combatTeam = team;
      } else if ('combatTeam' in token.dataset) {
        delete token.dataset.combatTeam;
      }

      groupMembers.forEach((memberId) => {
        if (memberId) {
          combatantTeams.set(memberId, team);
        }
      });

      const isCompleted = combatActive && completedCombatants.has(representativeId);
      token.dataset.combatState = isCompleted ? 'completed' : 'waiting';
      applyCombatantStateToNode(token, representativeId);

      if (isCompleted) {
        completedFragment.appendChild(token);
      } else {
        waitingFragment.appendChild(token);
      }
    });

    const representativeSet = renderedRepresentatives;
    if (activeCombatantId && !representativeSet.has(activeCombatantId)) {
      setActiveCombatantId(null);
    }

    waitingContainer.innerHTML = '';
    waitingContainer.appendChild(waitingFragment);
    waitingContainer.dataset.empty = waitingContainer.children.length ? 'false' : 'true';

    completedContainer.innerHTML = '';
    completedContainer.appendChild(completedFragment);
    completedContainer.dataset.empty = completedContainer.children.length ? 'false' : 'true';

    const hasCombatants = waitingContainer.children.length || completedContainer.children.length;
    combatTrackerRoot.dataset.hasCombatants = hasCombatants ? 'true' : 'false';

    attachTrackerHoverHandlers(waitingContainer);
    attachTrackerHoverHandlers(completedContainer);
    refreshCombatantStateClasses();
    updateCombatModeIndicators();
  }

  function cloneCombatantEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const clone = { ...entry };
    if (entry.hp && typeof entry.hp === 'object') {
      clone.hp = { ...entry.hp };
    }
    return clone;
  }

  function refreshCombatTracker() {
    if (!combatTrackerRoot || !combatTrackerWaiting || !combatTrackerCompleted) {
      return;
    }
    updateCombatTracker(lastCombatTrackerEntries, { skipCache: true });
  }

  function pruneCombatGroups(activeIds) {
    const activeSet = activeIds instanceof Set ? activeIds : new Set(activeIds ?? []);

    const representativesToDelete = [];
    let mutated = false;
    combatTrackerGroups.forEach((members, representativeId) => {
      if (!activeSet.has(representativeId)) {
        members.forEach((memberId) => {
          if (memberId !== representativeId) {
            combatantGroupRepresentative.delete(memberId);
          }
        });
        representativesToDelete.push(representativeId);
        mutated = true;
        return;
      }

      const filtered = new Set();
      members.forEach((memberId) => {
        if (activeSet.has(memberId)) {
          filtered.add(memberId);
        } else if (memberId !== representativeId) {
          combatantGroupRepresentative.delete(memberId);
          mutated = true;
        }
      });

      filtered.add(representativeId);

      if (filtered.size <= 1) {
        filtered.forEach((memberId) => {
          if (memberId !== representativeId) {
            combatantGroupRepresentative.delete(memberId);
          }
        });
        representativesToDelete.push(representativeId);
        mutated = true;
      } else {
        let changedForRep = filtered.size !== members.size;
        if (!changedForRep) {
          members.forEach((memberId) => {
            if (!filtered.has(memberId)) {
              changedForRep = true;
            }
          });
        }
        if (changedForRep) {
          combatTrackerGroups.set(representativeId, filtered);
          mutated = true;
        }
      }
    });

    representativesToDelete.forEach((repId) => {
      combatTrackerGroups.delete(repId);
      mutated = true;
    });

    Array.from(combatantGroupRepresentative.keys()).forEach((memberId) => {
      if (!activeSet.has(memberId)) {
        combatantGroupRepresentative.delete(memberId);
        mutated = true;
      }
    });

    return mutated;
  }

  function pruneCompletedCombatants(activeIds) {
    const activeSet = activeIds instanceof Set ? activeIds : new Set(activeIds ?? []);
    const representativeSet = new Set();

    activeSet.forEach((id) => {
      const representativeId = getRepresentativeIdFor(id);
      if (representativeId) {
        representativeSet.add(representativeId);
      }
    });

    const toRemove = [];
    completedCombatants.forEach((id) => {
      if (!representativeSet.has(id)) {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => completedCombatants.delete(id));

    if (activeCombatantId && !representativeSet.has(activeCombatantId)) {
      setActiveCombatantId(null);
    }
  }

  function applyCombatGroupsFromState(groups) {
    const source = Array.isArray(groups)
      ? groups
      : groups && typeof groups === 'object'
      ? Object.entries(groups).map(([representativeId, memberIds]) => ({
          representativeId,
          memberIds: Array.isArray(memberIds) ? memberIds : [],
        }))
      : [];

    const prepared = [];

    source.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const representativeSource =
        typeof entry.representativeId === 'string'
          ? entry.representativeId
          : typeof entry.id === 'string'
          ? entry.id
          : null;
      const representativeId = representativeSource ? representativeSource.trim() : '';
      if (!representativeId) {
        return;
      }

      const membersSource = Array.isArray(entry.memberIds)
        ? entry.memberIds
        : Array.isArray(entry.members)
        ? entry.members
        : Array.isArray(entry.ids)
        ? entry.ids
        : [];

      const normalizedMembers = membersSource
        .map((memberId) => (typeof memberId === 'string' ? memberId.trim() : ''))
        .filter((memberId) => memberId.length > 0);

      if (!normalizedMembers.includes(representativeId)) {
        normalizedMembers.push(representativeId);
      }

      const uniqueMembers = Array.from(new Set(normalizedMembers));
      if (uniqueMembers.length <= 1) {
        return;
      }

      prepared.push({ representativeId, members: new Set(uniqueMembers) });
    });

    let changed = combatTrackerGroups.size !== prepared.length;

    if (!changed) {
      for (const { representativeId, members } of prepared) {
        const existing = combatTrackerGroups.get(representativeId);
        if (!existing || existing.size !== members.size) {
          changed = true;
          break;
        }
        for (const memberId of members) {
          if (!existing.has(memberId)) {
            changed = true;
            break;
          }
        }
        if (changed) {
          break;
        }
      }
    }

    if (!changed) {
      const expectedRepresentatives = new Map();
      prepared.forEach(({ representativeId, members }) => {
        members.forEach((memberId) => {
          if (memberId !== representativeId) {
            expectedRepresentatives.set(memberId, representativeId);
          }
        });
      });

      if (combatantGroupRepresentative.size !== expectedRepresentatives.size) {
        changed = true;
      } else {
        for (const [memberId, repId] of expectedRepresentatives) {
          if (combatantGroupRepresentative.get(memberId) !== repId) {
            changed = true;
            break;
          }
        }
      }
    }

    if (!changed) {
      return false;
    }

    combatTrackerGroups.clear();
    combatantGroupRepresentative.clear();

    prepared.forEach(({ representativeId, members }) => {
      const memberSet = new Set(members);
      combatTrackerGroups.set(representativeId, memberSet);
      memberSet.forEach((memberId) => {
        if (memberId !== representativeId) {
          combatantGroupRepresentative.set(memberId, representativeId);
        }
      });
    });

    return true;
  }

  function getRepresentativeIdFor(combatantId) {
    if (!combatantId) {
      return null;
    }
    return combatantGroupRepresentative.get(combatantId) || combatantId;
  }

  function getGroupMembers(representativeId) {
    if (!representativeId) {
      return [];
    }
    const group = combatTrackerGroups.get(representativeId);
    if (!group || !group.size) {
      return [representativeId];
    }
    if (!group.has(representativeId)) {
      group.add(representativeId);
    }
    return Array.from(group);
  }

  function highlightTrackerToken(combatantId, shouldHighlight) {
    if (!combatantId || !combatTrackerRoot) {
      return;
    }
    const nodes = Array.from(combatTrackerRoot.querySelectorAll('[data-combatant-id]')).filter(
      (node) => node instanceof HTMLElement && node.dataset.combatantId === combatantId
    );
    nodes.forEach((node) => {
      node.classList.toggle('is-highlighted', shouldHighlight);
    });
  }

  function highlightBoardTokensForCombatant(combatantId, shouldHighlight) {
    const representativeId = getRepresentativeIdFor(combatantId);
    if (!representativeId) {
      return;
    }
    const members = getGroupMembers(representativeId);
    members.forEach((memberId) => {
      toggleBoardTokenHighlight(memberId, shouldHighlight);
    });
  }

  function toggleBoardTokenHighlight(tokenId, shouldHighlight) {
    if (!tokenLayer || !tokenId) {
      return;
    }
    const token = Array.from(tokenLayer.querySelectorAll('[data-placement-id]')).find(
      (node) => node instanceof HTMLElement && node.dataset.placementId === tokenId
    );
    if (token) {
      token.classList.toggle('is-hover-highlight', shouldHighlight);
    }
  }

  function attachTrackerHoverHandlers(container) {
    if (!container) {
      return;
    }
    Array.from(container.querySelectorAll('[data-combatant-id]')).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (node.dataset.trackerHoverBound === 'true') {
        return;
      }
      node.addEventListener('mouseenter', () => {
        handleTrackerTokenHover(node.dataset.combatantId, true);
      });
      node.addEventListener('mouseleave', () => {
        handleTrackerTokenHover(node.dataset.combatantId, false);
      });
      node.dataset.trackerHoverBound = 'true';
    });
  }

  function handleTrackerTokenHover(combatantId, shouldHighlight) {
    if (!combatantId) {
      return;
    }
    highlightTrackerToken(combatantId, shouldHighlight);
    highlightBoardTokensForCombatant(combatantId, shouldHighlight);
  }

  function setFocusedCombatantId(nextId) {
    const normalized = typeof nextId === 'string' && nextId ? nextId : null;

    if (focusedCombatantId === normalized) {
      return;
    }

    if (focusedCombatantId) {
      highlightTrackerToken(focusedCombatantId, false);
      if (focusedCombatantId !== activeCombatantId) {
        highlightBoardTokensForCombatant(focusedCombatantId, false);
      }
    }

    focusedCombatantId = normalized;

    if (normalized) {
      highlightTrackerToken(normalized, true);
      if (normalized !== activeCombatantId) {
        highlightBoardTokensForCombatant(normalized, true);
      }
    }
  }

  function focusCombatTrackerEntry(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const combatantId = target.dataset.combatantId || '';
    if (!combatantId) {
      return;
    }

    setFocusedCombatantId(combatantId);

    if (typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    }
  }

  function applyCombatantStateToNode(node, representativeId) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const isRepresentative = typeof representativeId === 'string' && representativeId !== '';
    const isActive = combatActive && isRepresentative && representativeId === activeCombatantId;
    const isCompleted = combatActive && isRepresentative && completedCombatants.has(representativeId);

    node.classList.toggle('is-active', Boolean(isActive));
    node.classList.toggle('is-completed', Boolean(isCompleted));
    if (isActive) {
      node.setAttribute('aria-current', 'true');
    } else {
      node.removeAttribute('aria-current');
    }

    const state = isCompleted ? 'completed' : isActive ? 'active' : 'waiting';
    node.dataset.combatState = state;
    node.setAttribute('tabindex', isGmUser() ? '0' : '-1');
  }

  function refreshCombatantStateClasses() {
    if (!combatTrackerRoot) {
      return;
    }
    Array.from(combatTrackerRoot.querySelectorAll('[data-combatant-id]')).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      applyCombatantStateToNode(node, node.dataset.combatantId || null);
    });
  }

  function setActiveCombatantId(nextId) {
    const normalizedNextId = typeof nextId === 'string' && nextId ? nextId : null;
    const transitionHint = pendingTurnTransition;
    pendingTurnTransition = null;

    const previousCombatantId = transitionHint?.fromCombatantId ?? activeCombatantId ?? null;
    let previousTeam = transitionHint?.fromTeam ?? null;
    if (!previousTeam && previousCombatantId) {
      previousTeam = getCombatantTeam(previousCombatantId);
    } else if (!previousTeam) {
      previousTeam = activeTeam;
    }
    const nextTeam = normalizedNextId ? getCombatantTeam(normalizedNextId) : null;

    if (focusedCombatantId) {
      setFocusedCombatantId(null);
    }

    if (highlightedCombatantId && highlightedCombatantId !== normalizedNextId) {
      highlightBoardTokensForCombatant(highlightedCombatantId, false);
    }
    highlightedCombatantId = normalizedNextId;
    activeCombatantId = normalizedNextId;
    activeTeam = nextTeam ?? null;

    if (normalizedNextId) {
      highlightBoardTokensForCombatant(normalizedNextId, true);
    }
    refreshCombatantStateClasses();
    handleActiveTeamChanged(previousTeam ?? null, nextTeam ?? null, previousCombatantId, normalizedNextId);

    if (!isGmUser()) {
      return;
    }

    if (!combatActive || !normalizedNextId) {
      combatTimerService.endTurn();
      combatTimerService.clearWaiting();
      return;
    }

    const waitingTeam = nextTeam === 'ally' || nextTeam === 'enemy' ? nextTeam : null;
    const hasTurnLock =
      typeof turnLockState.combatantId === 'string' && turnLockState.combatantId === normalizedNextId;

    if (!waitingTeam) {
      combatTimerService.clearWaiting();
      return;
    }

    if (hasTurnLock) {
      combatTimerService.stopWaiting(waitingTeam);
      return;
    }

    combatTimerService.startWaiting({
      team: waitingTeam,
      round: combatRound > 0 ? combatRound : 1,
      combatantId: normalizedNextId,
    });
  }

  function handleCombatTrackerClick(event) {
    if (!combatActive || !isGmUser()) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-combatant-id]') : null;
    if (!target || !combatTrackerRoot?.contains(target)) {
      return;
    }
    event.preventDefault();
    focusCombatTrackerEntry(target);
  }

  function handleCombatTrackerDoubleClick(event) {
    if (!combatActive) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-combatant-id]') : null;
    if (!target || !combatTrackerRoot?.contains(target)) {
      return;
    }
    event.preventDefault();
    if (isGmUser()) {
      processCombatantActivation(target);
      return;
    }

    const combatantId = target.dataset.combatantId || '';
    if (!combatantId) {
      return;
    }

    const context = buildTurnContext(combatantId);
    handlePlayerInitiatedTurn(combatantId, context);
  }

  function handleCombatTrackerKeydown(event) {
    if (!combatActive || !isGmUser()) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-combatant-id]') : null;
    if (!target || !combatTrackerRoot?.contains(target)) {
      return;
    }
    event.preventDefault();
    processCombatantActivation(target);
  }

  function processCombatantActivation(target) {
    if (!combatActive || !target) {
      return;
    }
    setFocusedCombatantId(null);
    const combatantId = target.dataset.combatantId || '';
    if (!combatantId) {
      return;
    }

    const isInCompleted = Boolean(target.closest('[data-combat-tracker-completed]'));
    const state = target.dataset.combatState;

    if (isInCompleted || state === 'completed') {
      completedCombatants.delete(combatantId);
      setActiveCombatantId(combatantId);
      currentTurnTeam = getCombatantTeam(combatantId) ?? currentTurnTeam;
      refreshCombatTracker();
      forceAcquireTurnLockForGm(combatantId);
      updateCombatModeIndicators();
      syncCombatStateToStore();
      return;
    }

    if (activeCombatantId === combatantId) {
      closeTurnPrompt();
      setActiveCombatantId(null);
      releaseTurnLock(getCurrentUserId());
      updateCombatModeIndicators();
      syncCombatStateToStore();
      return;
    }

    completedCombatants.delete(combatantId);
    setActiveCombatantId(combatantId);
    forceAcquireTurnLockForGm(combatantId);
    beginCombatantTurn(combatantId);
  }

  function beginCombatantTurn(combatantId, options = {}) {
    if (!combatActive || !combatantId) {
      return;
    }

    closeSaveEndsPrompt();

    const currentUserId = getCurrentUserId();
    const initiatorProfileId = normalizeProfileId(options?.initiatorProfileId ?? currentUserId);
    const fallbackName = getCurrentUserName() || initiatorProfileId || 'GM';
    const initiatorName =
      typeof options?.initiatorName === 'string' && options.initiatorName.trim()
        ? options.initiatorName.trim()
        : fallbackName;
    const turnTeam = getCombatantTeam(combatantId) ?? null;
    const roundForTurn = combatRound > 0 ? combatRound : 1;
    const participantId =
      turnTeam === 'enemy'
        ? 'gm'
        : initiatorProfileId || normalizeProfileId(currentUserId) || null;
    const participantName =
      turnTeam === 'enemy'
        ? initiatorName || getCurrentUserName() || 'GM'
        : initiatorName || formatProfileDisplayName(participantId);

    if (turnLockState.holderId && turnLockState.holderId !== initiatorProfileId) {
      if (isGmUser()) {
        let confirmed = true;
        try {
          if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            confirmed = window.confirm('Override the active turn lock?');
          }
        } catch (error) {
          confirmed = false;
        }
        if (!confirmed) {
          return;
        }
        acquireTurnLock(initiatorProfileId || 'gm', initiatorName, combatantId, { force: true });
      } else {
        notifyTurnLocked(turnLockState.holderName);
        return;
      }
    } else {
      acquireTurnLock(initiatorProfileId || 'gm', initiatorName, combatantId, { force: isGmUser() });
    }

    completedCombatants.delete(combatantId);
    setActiveCombatantId(combatantId);
    if (isGmUser()) {
      combatTimerService.startTurn({
        userId: participantId || undefined,
        displayName: participantName,
        team: turnTeam ?? 'ally',
        round: roundForTurn,
        combatantId,
      });
    }
    currentTurnTeam = getCombatantTeam(combatantId) ?? currentTurnTeam;
    refreshCombatTracker();
    updateCombatModeIndicators();
    const shouldShowPrompt = !initiatorProfileId || initiatorProfileId === currentUserId;
    if (shouldShowPrompt) {
      openTurnPrompt(combatantId);
    }
    notifyConditionTurnStart(combatantId);
    maybeTriggerSpecialTurnEffects(combatantId, options);
    syncCombatStateToStore();
  }

  function notifyConditionTurnStart(combatantId) {
    if (!combatantId) {
      return;
    }

    const placement = getPlacementFromStore(combatantId);
    if (!placement) {
      return;
    }

    const label = tokenLabel(placement);
    const conditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);
    if (!conditions.length) {
      return;
    }

    const notified = new Set();
    conditions.forEach((condition) => {
      const name = typeof condition?.name === 'string' ? condition.name.trim() : '';
      if (!name) {
        return;
      }
      const definition = getConditionDefinition(name);
      const displayName = definition?.name ?? name;
      const description = definition?.description ?? '';
      const key = displayName.toLowerCase();
      if (notified.has(key)) {
        return;
      }
      notified.add(key);
      showConditionBanner(`${label} has ${displayName}`, {
        tone: 'reminder',
        description,
      });
    });
  }

  function completeActiveCombatant() {
    if (!activeCombatantId) {
      return;
    }
    const finishedId = activeCombatantId;
    if (isGmUser()) {
      combatTimerService.endTurn();
    }
    const finishingPlacement = getPlacementFromStore(finishedId);
    const finishingConditions = ensurePlacementConditions(
      finishingPlacement?.conditions ?? finishingPlacement?.condition ?? null
    );
    closeTurnPrompt();
    const finishedTeam = getCombatantTeam(finishedId);
    if (finishedTeam) {
      lastActingTeam = finishedTeam;
    }
    completedCombatants.add(finishedId);
    roundTurnCount = Math.max(0, roundTurnCount + 1);
    setActiveCombatantId(null);
    refreshCombatTracker();
    const saveEndsConditions = [];
    if (finishingConditions.length) {
      finishingConditions.forEach((condition) => {
        if (getConditionDurationType(condition) !== 'save-ends') {
          return;
        }
        const normalized = ensurePlacementCondition(condition);
        const name = typeof normalized?.name === 'string' ? normalized.name.trim() : '';
        if (!name) {
          return;
        }
        showConditionBanner(`${name} Save Ends`, { tone: 'reminder' });
        saveEndsConditions.push(normalized);
      });
    }
    if (saveEndsConditions.length) {
      openSaveEndsPrompt(finishedId, tokenLabel(finishingPlacement), saveEndsConditions);
    }
    const clearedEndOfTurn = clearEndOfTurnConditionsForTarget(finishedId);
    if (clearedEndOfTurn.length) {
      clearedEndOfTurn.forEach((entry) => {
        const baseName = entry?.tokenName ?? 'Token';
        const possessive = formatPossessiveName(baseName);
        const removedConditions = Array.isArray(entry?.conditions) ? entry.conditions : [];
        removedConditions.forEach((condition) => {
          const name = typeof condition?.name === 'string' ? condition.name.trim() : '';
          if (!name) {
            return;
          }
          showConditionBanner(`${possessive} ${name} has ended.`, { tone: 'reminder' });
        });
      });
    }
    releaseTurnLock(getCurrentUserId());
    const nextId = pickNextCombatantId([
      finishedTeam === 'ally' ? 'enemy' : 'ally',
      finishedTeam,
    ]);
    if (nextId) {
      pendingTurnTransition = { fromTeam: finishedTeam, fromCombatantId: finishedId };
      setActiveCombatantId(nextId);
    } else {
      pendingTurnTransition = null;
    }
    updateCombatModeIndicators();
    checkForRoundCompletion();
    syncCombatStateToStore();
  }

  function closeSaveEndsPrompt() {
    if (!activeSaveEndsPrompt) {
      return;
    }

    const state = activeSaveEndsPrompt;
    if (state.rollButton && state.handleRollButtonClick) {
      state.rollButton.removeEventListener('click', state.handleRollButtonClick);
    }
    if (state.bonusButton && state.handleBonusButtonClick) {
      state.bonusButton.removeEventListener('click', state.handleBonusButtonClick);
    }
    if (state.closeButton && state.handleCloseButtonClick) {
      state.closeButton.removeEventListener('click', state.handleCloseButtonClick);
    }
    if (state.overlay && state.handleOverlayClick) {
      state.overlay.removeEventListener('click', state.handleOverlayClick);
    }
    if (typeof document !== 'undefined' && state.handleKeydown) {
      document.removeEventListener('keydown', state.handleKeydown);
    }
    state.overlay?.remove();
    activeSaveEndsPrompt = null;
  }

  function openSaveEndsPrompt(placementId, tokenName, conditions = []) {
    if (
      !placementId ||
      typeof document === 'undefined' ||
      !document.body ||
      !Array.isArray(conditions) ||
      !conditions.length
    ) {
      return;
    }

    const queue = conditions
      .map((condition) => {
        const normalized = ensurePlacementCondition(condition);
        if (!normalized || typeof normalized.name !== 'string') {
          return null;
        }
        const name = normalized.name.trim();
        if (!name) {
          return null;
        }
        return {
          condition: normalized,
          name,
          successApplied: false,
        };
      })
      .filter(Boolean);

    if (!queue.length) {
      return;
    }

    closeSaveEndsPrompt();

    const overlay = document.createElement('div');
    overlay.className = 'vtt-save-ends-overlay';
    overlay.innerHTML = `
      <div class="vtt-save-ends-dialog" role="dialog" aria-modal="true" data-save-ends-dialog>
        <div class="vtt-save-ends-dialog__header">
          <h3 class="vtt-save-ends-dialog__title" data-save-ends-title></h3>
          <button type="button" class="vtt-save-ends-dialog__close" aria-label="Close save prompt" data-save-ends-close>&times;</button>
        </div>
        <div class="vtt-save-ends-dialog__body">
          <div class="vtt-save-ends-dialog__tracker" data-save-ends-tracker hidden></div>
          <p class="vtt-save-ends-dialog__description" data-save-ends-description></p>
          <div class="vtt-save-ends-dialog__bonus">
            <span class="vtt-save-ends-dialog__bonus-label">Bonus</span>
            <span class="vtt-save-ends-dialog__bonus-value" data-save-ends-bonus>+0</span>
          </div>
          <div class="vtt-save-ends-dialog__result" data-save-ends-result aria-live="polite"></div>
        </div>
        <div class="vtt-save-ends-dialog__actions">
          <button type="button" class="btn btn--primary vtt-save-ends-dialog__button" data-save-ends-roll>Make Save</button>
          <button
            type="button"
            class="btn vtt-save-ends-dialog__button vtt-save-ends-dialog__button--bonus"
            data-save-ends-bonus-button
          >+1</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const rollButton = overlay.querySelector('[data-save-ends-roll]');
    const bonusButton = overlay.querySelector('[data-save-ends-bonus-button]');
    const closeButton = overlay.querySelector('[data-save-ends-close]');
    const titleElement = overlay.querySelector('[data-save-ends-title]');
    const trackerElement = overlay.querySelector('[data-save-ends-tracker]');
    const descriptionElement = overlay.querySelector('[data-save-ends-description]');
    const bonusElement = overlay.querySelector('[data-save-ends-bonus]');
    const resultElement = overlay.querySelector('[data-save-ends-result]');

    if (!rollButton || !bonusButton || !closeButton || !titleElement || !descriptionElement || !resultElement) {
      overlay.remove();
      return;
    }

    const normalizedTokenName =
      typeof tokenName === 'string' && tokenName.trim() ? tokenName.trim() : 'This token';
    const possessiveTokenName = formatPossessiveName(normalizedTokenName);

    const state = {
      overlay,
      placementId,
      tokenName: normalizedTokenName,
      possessiveTokenName,
      queue,
      index: 0,
      mode: 'roll',
      modifier: 0,
      hasRolled: false,
      roll: null,
      rollButton,
      bonusButton,
      closeButton,
      titleElement,
      trackerElement,
      descriptionElement,
      bonusElement,
      resultElement,
      handleOverlayClick: null,
      handleRollButtonClick: null,
      handleBonusButtonClick: null,
      handleCloseButtonClick: null,
      handleKeydown: null,
    };

    const handleOverlayClick = (event) => {
      if (event.target === overlay) {
        closeSaveEndsPrompt();
      }
    };

    const handleCloseButtonClick = () => {
      closeSaveEndsPrompt();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSaveEndsPrompt();
      }
    };

    const handleRollButtonClick = () => {
      if (!activeSaveEndsPrompt) {
        return;
      }

      if (state.mode === 'advance') {
        advanceSaveEndsPrompt();
        return;
      }
      if (state.mode === 'close') {
        closeSaveEndsPrompt();
        return;
      }
      if (state.hasRolled) {
        return;
      }

      state.roll = Math.floor(Math.random() * 10) + 1;
      state.hasRolled = true;
      const entry = state.queue[state.index];
      if (!entry) {
        renderSaveEndsPromptResult();
        return;
      }

      const total = state.roll + state.modifier;
      if (total >= 6) {
        applySaveEndsSuccess(entry);
      }

      const hasNext = state.index + 1 < state.queue.length;
      state.mode = hasNext ? 'advance' : 'close';
      state.rollButton.textContent = hasNext ? 'Next Condition' : 'Close';
      renderSaveEndsPromptResult();
    };

    const handleBonusButtonClick = () => {
      if (!activeSaveEndsPrompt) {
        return;
      }

      state.modifier += 1;
      if (state.bonusElement) {
        state.bonusElement.textContent = `+${state.modifier}`;
      }

      const entry = state.queue[state.index];
      if (state.hasRolled && entry && !entry.successApplied) {
        const total = state.roll + state.modifier;
        if (total >= 6) {
          applySaveEndsSuccess(entry);
        }
      }

      renderSaveEndsPromptResult();
    };

    state.handleOverlayClick = handleOverlayClick;
    state.handleRollButtonClick = handleRollButtonClick;
    state.handleBonusButtonClick = handleBonusButtonClick;
    state.handleCloseButtonClick = handleCloseButtonClick;
    state.handleKeydown = handleKeydown;

    overlay.addEventListener('click', handleOverlayClick);
    rollButton.addEventListener('click', handleRollButtonClick);
    bonusButton.addEventListener('click', handleBonusButtonClick);
    closeButton.addEventListener('click', handleCloseButtonClick);
    document.addEventListener('keydown', handleKeydown);

    activeSaveEndsPrompt = state;

    updateSaveEndsPromptView();
  }

  function updateSaveEndsPromptView() {
    if (!activeSaveEndsPrompt) {
      return;
    }

    const state = activeSaveEndsPrompt;
    const entry = state.queue[state.index];
    if (!entry) {
      closeSaveEndsPrompt();
      return;
    }

    state.mode = 'roll';
    state.modifier = 0;
    state.hasRolled = false;
    state.roll = null;
    entry.successApplied = Boolean(entry.successApplied);

    state.rollButton.disabled = false;
    state.rollButton.textContent = 'Make Save';
    state.bonusButton.disabled = false;

    if (state.titleElement) {
      state.titleElement.textContent = `Save Ends: ${entry.name}`;
    }
    if (state.trackerElement) {
      if (state.queue.length > 1) {
        state.trackerElement.hidden = false;
        state.trackerElement.textContent = `Condition ${state.index + 1} of ${state.queue.length}`;
      } else {
        state.trackerElement.hidden = true;
        state.trackerElement.textContent = '';
      }
    }
    if (state.descriptionElement) {
      state.descriptionElement.textContent = `${state.tokenName} is rolling to end ${entry.name}.`;
    }
    if (state.bonusElement) {
      state.bonusElement.textContent = '+0';
    }
    if (state.resultElement) {
      state.resultElement.classList.remove('is-success', 'is-failure');
    }

    renderSaveEndsPromptResult();

    if (state.rollButton && typeof state.rollButton.focus === 'function') {
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(() => {
          try {
            state.rollButton?.focus();
          } catch (error) {
            // Ignore focus errors in non-interactive environments
          }
        }, 0);
      } else {
        try {
          state.rollButton.focus();
        } catch (error) {
          // Ignore focus errors in non-interactive environments
        }
      }
    }
  }

  function renderSaveEndsPromptResult() {
    if (!activeSaveEndsPrompt || !activeSaveEndsPrompt.resultElement) {
      return;
    }

    const state = activeSaveEndsPrompt;
    const element = state.resultElement;
    element.textContent = '';
    element.classList.remove('is-success', 'is-failure');

    if (state.roll === null) {
      const instructions = document.createElement('div');
      instructions.className = 'vtt-save-ends-dialog__result-summary';
      let text = 'Roll a d10. A 6 or higher ends the condition.';
      if (state.modifier > 0) {
        text += ` Current bonus: +${state.modifier}.`;
      }
      instructions.textContent = text;
      element.appendChild(instructions);
      return;
    }

    const total = state.roll + state.modifier;
    const success = total >= 6;
    const summary = document.createElement('div');
    summary.className = 'vtt-save-ends-dialog__result-summary';
    summary.textContent =
      state.modifier > 0
        ? `Result: ${state.roll} + ${state.modifier} = ${total}`
        : `Result: ${state.roll}`;

    const outcome = document.createElement('div');
    outcome.className = 'vtt-save-ends-dialog__result-outcome';
    outcome.textContent = success
      ? 'Success! The condition ends.'
      : 'Failure. The condition remains.';

    element.appendChild(summary);
    element.appendChild(outcome);

    element.classList.toggle('is-success', success);
    element.classList.toggle('is-failure', !success);
  }

  function advanceSaveEndsPrompt() {
    if (!activeSaveEndsPrompt) {
      return;
    }

    const state = activeSaveEndsPrompt;
    if (state.index + 1 >= state.queue.length) {
      closeSaveEndsPrompt();
      return;
    }

    state.index += 1;
    updateSaveEndsPromptView();
  }

  function applySaveEndsSuccess(entry) {
    if (!activeSaveEndsPrompt || !entry || entry.successApplied) {
      return;
    }

    const state = activeSaveEndsPrompt;
    const removed = removeConditionFromPlacementByCondition(state.placementId, entry.condition);
    entry.successApplied = true;

    if (removed) {
      showConditionBanner(`${state.possessiveTokenName} ${entry.name} has ended.`, { tone: 'reminder' });
    }
  }

  function removeConditionFromPlacementByCondition(placementId, targetCondition) {
    if (!placementId) {
      return false;
    }

    const normalized = ensurePlacementCondition(targetCondition);
    if (!normalized) {
      return false;
    }

    let didChange = false;
    const updated = updatePlacementById(placementId, (target) => {
      const conditions = ensurePlacementConditions(target?.conditions ?? target?.condition ?? null);
      const filtered = conditions.filter((existing) => !areConditionsEqual(existing, normalized));
      if (filtered.length !== conditions.length) {
        didChange = true;
        if (filtered.length) {
          target.conditions = filtered;
          target.condition = filtered[0];
        } else {
          if (target.conditions !== undefined) {
            delete target.conditions;
          }
          if (target.condition !== undefined) {
            delete target.condition;
          }
        }
      }
    });

    if (updated && didChange) {
      refreshTokenSettings();
      if (placementId === activeTokenSettingsId) {
        resetConditionControls();
      }
    }

    return updated && didChange;
  }

  function openTurnPrompt(combatantId) {
    if (!combatantId || typeof document === 'undefined' || !document.body) {
      return;
    }

    closeTurnPrompt();

    const label = getCombatantLabel(combatantId);
    const heading = formatTurnPromptHeading(label);
    const overlay = document.createElement('div');
    overlay.className = 'vtt-turn-overlay';
    overlay.innerHTML = `
      <div class="vtt-turn-dialog" role="dialog" data-turn-dialog>
        <div class="vtt-turn-dialog__handle" data-turn-drag-handle aria-hidden="true"></div>
        <h3 class="vtt-turn-dialog__title">${escapeHtml(heading)}</h3>
        <div class="vtt-turn-dialog__actions">
          <button type="button" class="btn" data-turn-cancel>Cancel</button>
          <button type="button" class="btn btn--primary" data-turn-complete>End Turn</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    positionTurnPromptOverlay(overlay);

    const cancelButton = overlay.querySelector('[data-turn-cancel]');
    const completeButton = overlay.querySelector('[data-turn-complete]');
    const dragHandle = overlay.querySelector('[data-turn-drag-handle]');

    let dragState = null;
    let hasDragged = false;

    const cleanupDragListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    const handleCancel = () => {
      closeTurnPrompt();
      updateCombatModeIndicators();
    };

    const handleComplete = () => {
      completeActiveCombatant();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };

    const handleResize = () => {
      if (hasDragged) {
        const margin = 12;
        const rect = overlay.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const maxLeft = viewportWidth ? viewportWidth - rect.width - margin : -margin;
        const maxTop = viewportHeight ? viewportHeight - rect.height - margin : -margin;
        const nextLeft = clamp(rect.left, margin, maxLeft);
        const nextTop = clamp(rect.top, margin, maxTop);
        overlay.style.left = `${nextLeft}px`;
        overlay.style.top = `${nextTop}px`;
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.transform = 'none';
        return;
      }
      positionTurnPromptOverlay(overlay);
    };

    const handlePointerDown = (event) => {
      if (!dragHandle || !overlay) {
        return;
      }
      if (typeof event?.button === 'number' && event.button !== 0 && event.pointerType !== 'touch') {
        return;
      }
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
      hasDragged = true;
      if (activeTurnDialog) {
        activeTurnDialog.dragPointerId = event.pointerId;
        activeTurnDialog.hasDragged = true;
      }
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
      overlay.style.transform = 'none';
      dragHandle.classList.add('is-dragging');
      overlay.classList.add('is-dragging');
      if (typeof dragHandle.setPointerCapture === 'function') {
        try {
          dragHandle.setPointerCapture(event.pointerId);
        } catch (error) {
          // Ignore pointer capture errors on unsupported devices
        }
      }
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    };

    const handlePointerMove = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      event.preventDefault();
      const margin = 12;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const width = overlay.offsetWidth || dragState.width || 0;
      const height = overlay.offsetHeight || dragState.height || 0;
      const maxLeft = viewportWidth ? viewportWidth - width - margin : -margin;
      const maxTop = viewportHeight ? viewportHeight - height - margin : -margin;
      const nextLeft = clamp(event.clientX - dragState.offsetX, margin, maxLeft);
      const nextTop = clamp(event.clientY - dragState.offsetY, margin, maxTop);
      overlay.style.left = `${nextLeft}px`;
      overlay.style.top = `${nextTop}px`;
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
      overlay.style.transform = 'none';
    };

    const handlePointerUp = (event) => {
      if (dragState && event.pointerId === dragState.pointerId) {
        dragHandle.classList.remove('is-dragging');
        overlay.classList.remove('is-dragging');
        if (typeof dragHandle.releasePointerCapture === 'function') {
          try {
            dragHandle.releasePointerCapture(event.pointerId);
          } catch (error) {
            // Ignore release errors on unsupported devices
          }
        }
        dragState = null;
        if (activeTurnDialog) {
          activeTurnDialog.dragPointerId = null;
        }
      }
      cleanupDragListeners();
    };

    cancelButton?.addEventListener('click', handleCancel);
    completeButton?.addEventListener('click', handleComplete);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    dragHandle?.addEventListener('pointerdown', handlePointerDown);

    activeTurnDialog = {
      overlay,
      cancelButton,
      completeButton,
      handleCancel,
      handleComplete,
      handleKeydown,
      handleResize,
      dragHandle,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      cleanupDragListeners,
      dragPointerId: null,
      hasDragged,
      combatantId,
    };

    if (completeButton && typeof completeButton.focus === 'function') {
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(() => {
          completeButton.focus();
        }, 0);
      } else {
        completeButton.focus();
      }
    }
  }

  function positionTurnPromptOverlay(overlay) {
    if (!overlay || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const margin = 12;
    let top = margin;
    let right = margin;

    const anchorRect = getTurnPromptAnchorRect();
    if (anchorRect) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      top = anchorRect.bottom + margin;
      right = Math.max(margin, viewportWidth - anchorRect.right);
    }

    overlay.style.top = `${Math.max(margin, top)}px`;
    overlay.style.right = `${Math.max(margin, right)}px`;
  }

  function getTurnPromptAnchorRect() {
    if (typeof document === 'undefined') {
      return lastTurnPromptAnchorRect;
    }

    const timer = document.querySelector('.vtt-board__turn-timer');
    if (!(timer instanceof HTMLElement)) {
      return lastTurnPromptAnchorRect;
    }

    let rect = timer.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      const wasHidden = timer.hidden;
      const previousVisibility = timer.style.visibility;
      const previousAriaHidden = timer.getAttribute('aria-hidden');

      if (wasHidden) {
        timer.style.visibility = 'hidden';
        timer.hidden = false;
        rect = timer.getBoundingClientRect();
        timer.hidden = wasHidden;
        timer.style.visibility = previousVisibility;

        if (previousAriaHidden !== null) {
          timer.setAttribute('aria-hidden', previousAriaHidden);
        } else {
          timer.removeAttribute('aria-hidden');
        }
      }
    }

    if (rect && (rect.width || rect.height)) {
      lastTurnPromptAnchorRect = {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        height: rect.height,
      };
      return lastTurnPromptAnchorRect;
    }

    return lastTurnPromptAnchorRect;
  }

  function formatTurnPromptHeading(label) {
    const baseLabel = typeof label === 'string' ? label.trim() : '';
    const safeLabel = baseLabel || 'Token';
    const normalized = safeLabel.replace(/\s+/g, ' ');
    const lower = normalized.toLowerCase();
    if (lower.endsWith("'s") || lower.endsWith('’s')) {
      return `${normalized} Turn`;
    }
    if (/[sS]$/.test(normalized)) {
      return `${normalized}' Turn`;
    }
    return `${normalized}'s Turn`;
  }

  function closeTurnPrompt() {
    if (!activeTurnDialog) {
      return;
    }

    const {
      overlay,
      cancelButton,
      completeButton,
      handleCancel,
      handleComplete,
      handleKeydown,
      handleResize,
      dragHandle,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      cleanupDragListeners,
      dragPointerId,
    } =
      activeTurnDialog;

    cancelButton?.removeEventListener('click', handleCancel);
    completeButton?.removeEventListener('click', handleComplete);
    document.removeEventListener('keydown', handleKeydown);
    if (typeof handleResize === 'function') {
      window.removeEventListener('resize', handleResize);
    }
    if (dragHandle && typeof handlePointerDown === 'function') {
      dragHandle.removeEventListener('pointerdown', handlePointerDown);
    }
    if (typeof cleanupDragListeners === 'function') {
      cleanupDragListeners();
    } else {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    }
    if (dragHandle && typeof dragPointerId === 'number') {
      if (typeof dragHandle.releasePointerCapture === 'function') {
        try {
          dragHandle.releasePointerCapture(dragPointerId);
        } catch (error) {
          // Ignore release issues for unsupported devices
        }
      }
      dragHandle.classList.remove('is-dragging');
    }
    overlay?.classList.remove('is-dragging');
    overlay?.remove();
    activeTurnDialog = null;
  }

  function isCombatantHidden(combatantId) {
    if (!combatantId) {
      return false;
    }

    const placement = getPlacementFromStore(combatantId);
    if (placement && typeof placement === 'object' && 'hidden' in placement) {
      return Boolean(placement.hidden);
    }

    const entries = Array.isArray(lastCombatTrackerEntries) ? lastCombatTrackerEntries : [];
    const match = entries.find((entry) => entry && entry.id === combatantId);
    if (match) {
      return Boolean(match.hidden ?? match.isHidden ?? match?.flags?.hidden ?? false);
    }

    return false;
  }

  function getCombatantLabel(combatantId) {
    if (!combatantId) {
      return 'Token';
    }

    const entries = Array.isArray(lastCombatTrackerEntries) ? lastCombatTrackerEntries : [];
    const match = entries.find((entry) => entry && entry.id === combatantId);
    if (match && typeof match.name === 'string' && match.name.trim()) {
      return match.name.trim();
    }

    const placement = getPlacementFromStore(combatantId);
    return tokenLabel(placement);
  }

  function getCombatantTeam(combatantId) {
    if (!combatantId) {
      return 'enemy';
    }

    if (combatantTeams.has(combatantId)) {
      return normalizeCombatTeam(combatantTeams.get(combatantId));
    }

    const entries = Array.isArray(lastCombatTrackerEntries) ? lastCombatTrackerEntries : [];
    const match = entries.find((entry) => entry && entry.id === combatantId);
    if (match) {
      const team = normalizeCombatTeam(match.team ?? match.combatTeam ?? null);
      combatantTeams.set(combatantId, team);
      return team;
    }

    const placement = getPlacementFromStore(combatantId);
    if (placement) {
      const team = normalizeCombatTeam(placement.combatTeam ?? placement.team ?? null);
      combatantTeams.set(combatantId, team);
      return team;
    }

    return 'enemy';
  }

  function getWaitingCombatantsByTeam() {
    const waiting = { ally: [], enemy: [] };
    const entries = Array.isArray(lastCombatTrackerEntries) ? lastCombatTrackerEntries : [];
    const seen = new Set();

    entries.forEach((entry) => {
      if (!entry || typeof entry.id !== 'string') {
        return;
      }
      const representativeId = getRepresentativeIdFor(entry.id);
      const targetId = representativeId || entry.id;
      if (seen.has(targetId)) {
        return;
      }
      seen.add(targetId);
      if (completedCombatants.has(targetId)) {
        return;
      }
      const team = getCombatantTeam(targetId);
      if (team === 'ally') {
        waiting.ally.push(targetId);
      } else {
        waiting.enemy.push(targetId);
      }
    });

    return waiting;
  }

  function pickNextCombatantId(preferredTeams = []) {
    const waiting = getWaitingCombatantsByTeam();
    const order = Array.isArray(preferredTeams) ? preferredTeams : [];

    for (const candidate of order) {
      const team = normalizeCombatTeam(candidate);
      const pool = waiting[team];
      if (pool && pool.length) {
        currentTurnTeam = team;
        return pool[0];
      }
    }

    if (waiting.ally.length) {
      currentTurnTeam = 'ally';
      return waiting.ally[0];
    }

    if (waiting.enemy.length) {
      currentTurnTeam = 'enemy';
      return waiting.enemy[0];
    }

    currentTurnTeam = null;
    return null;
  }

  function focusNextCombatant(preferredTeams = []) {
    const nextId = pickNextCombatantId(preferredTeams);
    if (!nextId) {
      setActiveCombatantId(null);
      return false;
    }

    completedCombatants.delete(nextId);
    setActiveCombatantId(nextId);
    return true;
  }

  function handleStartCombat() {
    if (combatActive) {
      handleEndCombat();
      return;
    }

    stopAllyTurnTimer();
    clearTurnBorderFlash();
    pendingTurnTransition = null;
    activeTeam = null;
    combatActive = true;
    combatRound = 1;
    if (isGmUser()) {
      combatTimerService.startCombat({ round: combatRound });
    } else {
      combatTimerService.reset();
    }
    completedCombatants.clear();
    pendingRoundConfirmation = false;
    lastActingTeam = null;
    roundTurnCount = 0;
    closeTurnPrompt();
    setActiveCombatantId(null);
    resetTurnEffects();
    const initialTeam = rollForInitiativeAnnouncement() ?? 'enemy';
    startingCombatTeam = initialTeam;
    currentTurnTeam = initialTeam;
    updateStartCombatButton();
    refreshCombatTracker();
    focusNextCombatant([
      startingCombatTeam,
      startingCombatTeam === 'ally' ? 'enemy' : 'ally',
    ]);
    releaseTurnLock();
    updateCombatModeIndicators();
    syncCombatStateToStore();
  }

  function handleEndCombat() {
    if (!combatActive) {
      return;
    }

    let timerSummary = null;
    if (isGmUser()) {
      timerSummary = combatTimerService.finishCombat();
    } else {
      combatTimerService.reset();
    }

    combatActive = false;
    combatRound = 0;
    completedCombatants.clear();
    pendingRoundConfirmation = false;
    closeTurnPrompt();
    setActiveCombatantId(null);
    startingCombatTeam = null;
    currentTurnTeam = null;
    activeTeam = null;
    lastActingTeam = null;
    pendingTurnTransition = null;
    roundTurnCount = 0;
    stopAllyTurnTimer();
    clearTurnBorderFlash();
    clearHesitationBanner();
    resetTurnEffects();
    resetTriggeredActionsForActiveScene();
    updateStartCombatButton();
    refreshCombatTracker();
    updateCombatModeIndicators();
    releaseTurnLock();
    syncCombatStateToStore();
    if (status) {
      status.textContent = 'Combat ended.';
    }
    if (timerSummary && isGmUser()) {
      showCombatTimerReport(timerSummary);
    }
  }

  function rollForInitiativeAnnouncement() {
    const roll = Math.floor(Math.random() * 10) + 1;
    const playersFirst = roll >= 6;
    const team = playersFirst ? 'ally' : 'enemy';
    const message = playersFirst ? 'Players go first' : 'Enemies go first';
    announceToChat(`${message}. (Rolled ${roll} on a d10.)`);
    if (status) {
      status.textContent = `${message}.`;
    }
    return team;
  }

  function announceToChat(message) {
    if (!message || typeof window === 'undefined') {
      return;
    }
    try {
      const chat = window.dashboardChat;
      if (!chat || typeof chat.sendMessage !== 'function') {
        return;
      }
      const result = chat.sendMessage({ message });
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          console.warn('[VTT] Failed to send chat message', error);
        });
      }
    } catch (error) {
      console.warn('[VTT] Failed to access chat bridge', error);
    }
  }

  function getCurrentUserName() {
    const state = boardApi.getState?.();
    return typeof state?.user?.name === 'string' ? state.user.name : '';
  }

  function applyCombatStateFromBoardState(state = {}) {
    const boardState = state?.boardState ?? {};
    const activeSceneIdRaw = boardState.activeSceneId;
    const activeSceneId =
      typeof activeSceneIdRaw === 'string'
        ? activeSceneIdRaw
        : activeSceneIdRaw != null
        ? String(activeSceneIdRaw)
        : '';
    const activeSceneKey = activeSceneId.trim();
    if (!activeSceneKey) {
      return;
    }

    const sceneState = boardState.sceneState && typeof boardState.sceneState === 'object' ? boardState.sceneState : {};
    const combatState = sceneState[activeSceneKey]?.combat ?? {};
    const normalized = normalizeCombatState(combatState);

    if (normalized.updatedAt && normalized.updatedAt <= combatStateVersion) {
      return;
    }

    suppressCombatStateSync = true;
    try {
      const previousActive = activeCombatantId;
      const wasCombatActive = combatActive;
      combatActive = normalized.active;
      combatRound = normalized.round;
      if (isGmUser()) {
        combatTimerService.updateRound(combatRound);
      }
      startingCombatTeam = normalized.startingTeam;
      currentTurnTeam = normalized.currentTeam;
      lastActingTeam = normalized.lastTeam;
      roundTurnCount = normalized.roundTurnCount;
      completedCombatants.clear();
      normalized.completedCombatantIds.forEach((id) => completedCombatants.add(id));
      applyCombatGroupsFromState(normalized.groups);
      updateTurnLockState(normalized.turnLock);

      if (!combatActive) {
        stopAllyTurnTimer();
        clearTurnBorderFlash();
      }

      if (normalized.activeCombatantId !== previousActive) {
        setActiveCombatantId(normalized.activeCombatantId);
      } else {
        activeCombatantId = normalized.activeCombatantId;
        refreshCombatantStateClasses();
      }

      updateStartCombatButton();
      updateCombatModeIndicators();
      refreshCombatTracker();
      if (combatActive && isGmUser()) {
        checkForRoundCompletion();
      }
      const appliedVersion = normalized.updatedAt || Date.now();
      combatStateVersion = appliedVersion;
      const snapshot = { ...normalized, updatedAt: appliedVersion };
      lastCombatStateSnapshot = JSON.stringify(snapshot);
      if (normalized.lastEffect) {
        applyTurnEffectFromState(normalized.lastEffect);
      } else if (lastTurnEffect) {
        resetTurnEffects();
      }
      if (wasCombatActive && !combatActive) {
        if (isGmUser()) {
          const summary = combatTimerService.finishCombat();
          if (summary) {
            showCombatTimerReport(summary);
          }
        } else {
          combatTimerService.reset();
        }
      }
    } finally {
      suppressCombatStateSync = false;
    }
  }

  function normalizeCombatState(raw = {}) {
    const active = Boolean(raw?.active ?? raw?.isActive ?? false);
    const round = Math.max(0, toNonNegativeNumber(raw?.round ?? 0));
    const activeCombatantId = typeof raw?.activeCombatantId === 'string' ? raw.activeCombatantId.trim() : '';
    const completedSource = Array.isArray(raw?.completedCombatantIds) ? raw.completedCombatantIds : [];
    const completedCombatantIds = Array.from(
      new Set(
        completedSource
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => id.length > 0)
      )
    );
    const startingTeam = normalizeCombatTeam(raw?.startingTeam ?? raw?.initialTeam ?? null);
    const currentTeam = normalizeCombatTeam(raw?.currentTeam ?? raw?.activeTeam ?? null);
    const lastTeam = normalizeCombatTeam(raw?.lastTeam ?? raw?.previousTeam ?? null);
    const roundTurnCount = Math.max(0, toNonNegativeNumber(raw?.roundTurnCount ?? 0));
    const updatedAtRaw = Number(raw?.updatedAt);
    const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.trunc(updatedAtRaw)) : 0;
    const turnLock = normalizeTurnLock(raw?.turnLock ?? null);
    const lastEffect = normalizeTurnEffect(raw?.lastEffect ?? raw?.lastEvent ?? null);
    const groups = normalizeCombatGroups(
      raw?.groups ?? raw?.groupings ?? raw?.combatGroups ?? raw?.combatantGroups ?? null
    );

    return {
      active,
      round,
      activeCombatantId: activeCombatantId || null,
      completedCombatantIds,
      startingTeam,
      currentTeam,
      lastTeam,
      roundTurnCount,
      updatedAt,
      turnLock,
      lastEffect,
      groups,
    };
  }

  function normalizeCombatGroups(rawGroups) {
    const source = Array.isArray(rawGroups)
      ? rawGroups
      : rawGroups && typeof rawGroups === 'object'
      ? Object.entries(rawGroups).map(([representativeId, memberIds]) => ({
          representativeId,
          memberIds: Array.isArray(memberIds) ? memberIds : [],
        }))
      : [];

    const groups = [];

    source.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const representativeSource =
        typeof entry.representativeId === 'string'
          ? entry.representativeId
          : typeof entry.id === 'string'
          ? entry.id
          : null;
      const representativeId = representativeSource ? representativeSource.trim() : '';
      if (!representativeId) {
        return;
      }

      const membersSource = Array.isArray(entry.memberIds)
        ? entry.memberIds
        : Array.isArray(entry.members)
        ? entry.members
        : Array.isArray(entry.ids)
        ? entry.ids
        : [];

      const normalizedMembers = membersSource
        .map((memberId) => (typeof memberId === 'string' ? memberId.trim() : ''))
        .filter((memberId) => memberId.length > 0);

      if (!normalizedMembers.includes(representativeId)) {
        normalizedMembers.push(representativeId);
      }

      const uniqueMembers = Array.from(new Set(normalizedMembers));
      if (uniqueMembers.length <= 1) {
        return;
      }

      groups.push({ representativeId, memberIds: uniqueMembers });
    });

    return groups;
  }

  function resetTurnEffects() {
    lastTurnEffect = null;
    lastTurnEffectSignature = null;
    lastProcessedTurnEffectSignature = null;
  }

  function recordTurnEffect(effect) {
    const normalized = normalizeTurnEffect(effect);
    if (!normalized) {
      return;
    }
    lastTurnEffect = normalized;
    lastTurnEffectSignature = getTurnEffectSignature(normalized);
    lastProcessedTurnEffectSignature = lastTurnEffectSignature;
  }

  function applyTurnEffectFromState(effect) {
    const normalized = normalizeTurnEffect(effect);
    if (!normalized) {
      return;
    }
    const signature = getTurnEffectSignature(normalized);
    if (signature && signature === lastProcessedTurnEffectSignature) {
      if (signature !== lastTurnEffectSignature) {
        lastTurnEffect = normalized;
        lastTurnEffectSignature = signature;
      }
      return;
    }

    lastTurnEffect = normalized;
    lastTurnEffectSignature = signature;
    lastProcessedTurnEffectSignature = signature;

    if (normalized.type === 'sharon-hesitation') {
      showHesitationPopup();
    }
  }

  function normalizeTurnEffect(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const typeRaw = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
    if (!typeRaw) {
      return null;
    }

    const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
    const triggeredAtSource =
      raw.triggeredAt ?? raw.timestamp ?? raw.updatedAt ?? raw.time ?? raw.occurredAt ?? null;
    const triggeredAtRaw = Number(triggeredAtSource);
    const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : Date.now();
    const initiatorId = normalizeProfileId(raw.initiatorId ?? raw.profileId ?? null);

    const effect = {
      type: typeRaw,
      triggeredAt,
    };

    if (combatantId) {
      effect.combatantId = combatantId;
    }

    if (initiatorId) {
      effect.initiatorId = initiatorId;
    }

    return effect;
  }

  function getTurnEffectSignature(effect) {
    if (!effect || typeof effect !== 'object') {
      return '';
    }

    const type = typeof effect.type === 'string' ? effect.type.trim().toLowerCase() : '';
    const combatantId = typeof effect.combatantId === 'string' ? effect.combatantId.trim() : '';
    const triggeredAtRaw = Number(effect.triggeredAt);
    const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : 0;

    return `${type}:${combatantId}:${triggeredAt}`;
  }

  function normalizeTurnLock(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const holderId = normalizeProfileId(raw.holderId ?? raw.id ?? null);
    if (!holderId) {
      return null;
    }

    const holderName = typeof raw.holderName === 'string' ? raw.holderName.trim() : holderId;
    const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
    const lockedAtRaw = Number(raw.lockedAt);
    const lockedAt = Number.isFinite(lockedAtRaw) ? Math.max(0, Math.trunc(lockedAtRaw)) : Date.now();

    return {
      holderId,
      holderName,
      combatantId: combatantId || null,
      lockedAt,
    };
  }

  function updateTurnLockState(lock) {
    if (!lock || typeof lock !== 'object') {
      turnLockState.holderId = null;
      turnLockState.holderName = null;
      turnLockState.combatantId = null;
      turnLockState.lockedAt = 0;
      return;
    }

    turnLockState.holderId = lock.holderId ?? null;
    turnLockState.holderName = lock.holderName ?? lock.holderId ?? null;
    turnLockState.combatantId = lock.combatantId ?? null;
    turnLockState.lockedAt = Number.isFinite(lock.lockedAt) ? lock.lockedAt : Date.now();
  }

  function createCombatStateSnapshot() {
    const completed = Array.from(completedCombatants).filter((id) => typeof id === 'string' && id);
    const uniqueCompleted = Array.from(new Set(completed));
    const timestamp = Date.now();
    const effectSnapshot = lastTurnEffect ? { ...lastTurnEffect } : null;

    return {
      active: Boolean(combatActive),
      round: Math.max(0, Math.trunc(combatRound)),
      activeCombatantId: activeCombatantId ?? null,
      completedCombatantIds: uniqueCompleted,
      startingTeam: normalizeCombatTeam(startingCombatTeam),
      currentTeam: normalizeCombatTeam(currentTurnTeam),
      lastTeam: normalizeCombatTeam(lastActingTeam),
      roundTurnCount: Math.max(0, Math.trunc(roundTurnCount)),
      updatedAt: timestamp,
      turnLock: serializeTurnLockState(),
      lastEffect: effectSnapshot,
      groups: serializeCombatGroups(),
    };
  }

  function serializeCombatGroups() {
    if (!combatTrackerGroups.size) {
      return [];
    }

    const entries = [];
    combatTrackerGroups.forEach((members, representativeId) => {
      if (typeof representativeId !== 'string' || representativeId.trim() === '') {
        return;
      }

      const normalizedRep = representativeId.trim();
      const normalizedMembers = Array.from(members)
        .filter((id) => typeof id === 'string' && id.trim() !== '')
        .map((id) => id.trim());

      if (!normalizedMembers.includes(normalizedRep)) {
        normalizedMembers.push(normalizedRep);
      }

      const uniqueMembers = Array.from(new Set(normalizedMembers));
      if (uniqueMembers.length <= 1) {
        return;
      }

      entries.push({ representativeId: normalizedRep, memberIds: uniqueMembers });
    });

    return entries;
  }

  function serializeTurnLockState() {
    const holderId = normalizeProfileId(turnLockState.holderId);
    if (!holderId) {
      return null;
    }

    const combatantId =
      typeof turnLockState.combatantId === 'string' && turnLockState.combatantId
        ? turnLockState.combatantId
        : null;
    const lockedAt = Number.isFinite(turnLockState.lockedAt)
      ? Math.max(0, Math.trunc(turnLockState.lockedAt))
      : Date.now();

    return {
      holderId,
      holderName:
        typeof turnLockState.holderName === 'string' && turnLockState.holderName.trim()
          ? turnLockState.holderName.trim()
          : holderId,
      combatantId,
      lockedAt,
    };
  }

  function syncCombatStateToStore() {
    if (suppressCombatStateSync || typeof boardApi.updateState !== 'function') {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    const snapshot = createCombatStateSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastCombatStateSnapshot) {
      return;
    }

    boardApi.updateState?.((draft) => {
      const sceneStateEntry = ensureSceneStateDraftEntry(draft, activeSceneId);
      sceneStateEntry.combat = {
        ...snapshot,
        completedCombatantIds: [...snapshot.completedCombatantIds],
        lastEffect: snapshot.lastEffect ? { ...snapshot.lastEffect } : null,
      };
    });

    const latest = boardApi.getState?.() ?? state;
    if (latest?.user?.isGM) {
      persistBoardStateSnapshot();
    } else if (routes?.state) {
      persistCombatState(routes.state, activeSceneId, snapshot);
    }

    combatStateVersion = snapshot.updatedAt;
    lastCombatStateSnapshot = serialized;
  }

  function acquireTurnLock(holderId, holderName, combatantId, options = {}) {
    const normalizedId = normalizeProfileId(holderId);
    if (!normalizedId) {
      return false;
    }

    const normalizedName =
      typeof holderName === 'string' && holderName.trim() ? holderName.trim() : normalizedId;
    const existingHolder = turnLockState.holderId;
    const wantsForce = options.force === true;

    if (existingHolder && existingHolder !== normalizedId && !wantsForce) {
      return false;
    }

    turnLockState.holderId = normalizedId;
    turnLockState.holderName = normalizedName;
    turnLockState.combatantId = typeof combatantId === 'string' && combatantId ? combatantId : null;
    turnLockState.lockedAt = Date.now();
    return true;
  }

  function releaseTurnLock(requesterId = null) {
    if (!turnLockState.holderId) {
      return false;
    }
    const requester = normalizeProfileId(requesterId);
    if (turnLockState.holderId !== requester && requester && !isGmUser()) {
      return false;
    }
    turnLockState.holderId = null;
    turnLockState.holderName = null;
    turnLockState.combatantId = null;
    turnLockState.lockedAt = 0;
    return true;
  }

  function notifyTurnLocked(holderName) {
    const displayName = holderName && holderName.trim() ? holderName.trim() : 'another player';
    const message = `${displayName} is currently taking their turn.`;
    try {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      } else {
        showConditionBanner(message, { tone: 'warning' });
      }
    } catch (error) {
      showConditionBanner(message, { tone: 'warning' });
    }
  }

  function forceAcquireTurnLockForGm(combatantId) {
    const gmId = getCurrentUserId() ?? 'gm';
    const gmName = getCurrentUserName() || 'GM';
    acquireTurnLock(gmId, gmName, combatantId, { force: true });
  }

  function getAllRepresentativeIds() {
    if (!Array.isArray(lastCombatTrackerEntries)) {
      return [];
    }
    const ids = new Set();
    lastCombatTrackerEntries.forEach((entry) => {
      if (!entry || typeof entry.id !== 'string') {
        return;
      }
      const representativeId = getRepresentativeIdFor(entry.id);
      if (representativeId) {
        ids.add(representativeId);
      }
    });
    return Array.from(ids);
  }

  function checkForRoundCompletion() {
    if (!combatActive || pendingRoundConfirmation || !isGmUser()) {
      return;
    }
    const representatives = getAllRepresentativeIds();
    if (!representatives.length) {
      return;
    }
    const allCompleted = representatives.every((id) => completedCombatants.has(id));
    if (!allCompleted) {
      return;
    }

    pendingRoundConfirmation = true;

    const promptRoundEnd = () => {
      let confirmed = false;
      try {
        confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm('End combat round?')
          : false;
      } catch (error) {
        confirmed = false;
      }

      if (confirmed) {
        advanceCombatRound();
      }

      pendingRoundConfirmation = false;
    };

    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(promptRoundEnd, 0);
    } else {
      promptRoundEnd();
    }
  }

  function advanceCombatRound() {
    if (!combatActive) {
      return;
    }
    completedCombatants.clear();
    setActiveCombatantId(null);
    releaseTurnLock();
    combatRound = Math.max(1, combatRound + 1);
    if (isGmUser()) {
      combatTimerService.updateRound(combatRound);
    }
    roundTurnCount = 0;
    resetTriggeredActionsForActiveScene();
    const preferredTeam = startingCombatTeam ?? currentTurnTeam ?? 'ally';
    const secondaryTeam = preferredTeam === 'ally' ? 'enemy' : 'ally';
    updateStartCombatButton();
    refreshCombatTracker();
    const nextId = pickNextCombatantId([preferredTeam, secondaryTeam]);
    if (nextId) {
      const waitingPools = getWaitingCombatantsByTeam();
      const nextTeam = getCombatantTeam(nextId) ?? currentTurnTeam ?? preferredTeam;
      const opposingTeam = nextTeam === 'ally' ? 'enemy' : 'ally';
      const opposingHasCombatants = Array.isArray(waitingPools[opposingTeam])
        ? waitingPools[opposingTeam].length > 0
        : false;
      const previousTeam = opposingHasCombatants || !lastActingTeam
        ? opposingTeam
        : lastActingTeam !== nextTeam
          ? lastActingTeam
          : opposingTeam;
      pendingTurnTransition = {
        fromTeam: previousTeam ?? null,
        fromCombatantId: null,
      };
      completedCombatants.delete(nextId);
      setActiveCombatantId(nextId);
    } else {
      pendingTurnTransition = null;
      setActiveCombatantId(null);
    }
    updateCombatModeIndicators();
    if (status) {
      status.textContent = `Round ${combatRound} begins.`;
    }
    syncCombatStateToStore();
  }

  function resetTriggeredActionsForActiveScene() {
    if (typeof boardApi.updateState !== 'function') {
      return;
    }
    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    let mutated = false;
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      scenePlacements.forEach((placement) => {
        if (!placement || typeof placement !== 'object') {
          return;
        }
        if (placement.triggeredActionReady !== true) {
          placement.triggeredActionReady = true;
          mutated = true;
        }
      });
    });

    if (mutated) {
      persistBoardStateSnapshot();
      refreshTokenSettings();
    }
  }

  function updateStartCombatButton() {
    if (!startCombatButton) {
      return;
    }
    const gmUser = isGmUser();
    startCombatButton.classList.toggle('btn--danger', combatActive);
    startCombatButton.textContent = combatActive ? 'End Combat' : 'Start Combat';
    startCombatButton.setAttribute('aria-pressed', combatActive ? 'true' : 'false');
    if (gmUser) {
      startCombatButton.disabled = false;
      startCombatButton.title = combatActive
        ? 'End the current combat encounter.'
        : 'Start combat sequencing.';
    } else {
      startCombatButton.disabled = true;
      startCombatButton.title = combatActive
        ? 'Only the GM can end combat.'
        : 'Only the GM can start combat.';
    }
  }

  function updateCombatModeIndicators() {
    if (combatTrackerRoot) {
      combatTrackerRoot.dataset.combatActive = combatActive ? 'true' : 'false';
      combatTrackerRoot.dataset.completedCount = String(completedCombatants.size);
      combatTrackerRoot.dataset.currentTeam = currentTurnTeam ?? '';
      if (turnLockState.holderId) {
        combatTrackerRoot.dataset.turnLockHolder = turnLockState.holderName ?? turnLockState.holderId;
      } else if ('turnLockHolder' in combatTrackerRoot.dataset) {
        delete combatTrackerRoot.dataset.turnLockHolder;
      }
    }
    updateRoundTrackerDisplay();
  }

  function updateRoundTrackerDisplay() {
    if (!roundTracker || !roundValue) {
      if (turnIndicator) {
        turnIndicator.textContent = TURN_INDICATOR_DEFAULT_TEXT;
        turnIndicator.hidden = true;
      }
      return;
    }

    if (combatActive) {
      const displayRound = combatRound > 0 ? combatRound : 1;
      roundTracker.hidden = false;
      roundValue.textContent = String(displayRound);

      if (turnIndicator) {
        const indicatorLabel = getTurnIndicatorLabel();
        if (indicatorLabel) {
          turnIndicator.textContent = indicatorLabel;
          turnIndicator.hidden = false;
        } else {
          turnIndicator.textContent = TURN_INDICATOR_DEFAULT_TEXT;
          turnIndicator.hidden = true;
        }
      }
    } else {
      roundTracker.hidden = true;
      if (turnIndicator) {
        turnIndicator.textContent = TURN_INDICATOR_DEFAULT_TEXT;
        turnIndicator.hidden = true;
      }
    }
  }

  function getTurnIndicatorLabel() {
    if (!combatActive || !activeCombatantId) {
      return null;
    }

    const hidden = isCombatantHidden(activeCombatantId);
    const team = normalizeCombatTeam(getCombatantTeam(activeCombatantId));

    if (hidden || team !== 'ally') {
      return TURN_INDICATOR_GM_TEXT;
    }

    const label = getCombatantLabel(activeCombatantId);
    if (typeof label === 'string') {
      const trimmed = label.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return TURN_INDICATOR_GM_TEXT;
  }

  function flashTurnBorder(tone = 'yellow') {
    if (!appMain) {
      return;
    }
    const toneClass = TURN_FLASH_TONE_CLASSES[tone] ?? TURN_FLASH_TONE_CLASSES.yellow;
    const toneClassValues = Object.values(TURN_FLASH_TONE_CLASSES);
    if (borderFlashTimeoutId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(borderFlashTimeoutId);
      borderFlashTimeoutId = null;
    }
    appMain.classList.remove('is-turn-flash', ...toneClassValues);
    try {
      void appMain.offsetWidth;
    } catch (error) {
      // Ignore reflow errors in non-browser environments.
    }
    appMain.classList.add('is-turn-flash');
    if (toneClass) {
      appMain.classList.add(toneClass);
    }
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      borderFlashTimeoutId = window.setTimeout(() => {
        appMain.classList.remove('is-turn-flash', ...toneClassValues);
        borderFlashTimeoutId = null;
      }, 3000);
    }
  }

  function clearTurnBorderFlash() {
    if (!appMain) {
      return;
    }
    if (borderFlashTimeoutId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(borderFlashTimeoutId);
      borderFlashTimeoutId = null;
    }
    appMain.classList.remove('is-turn-flash', ...Object.values(TURN_FLASH_TONE_CLASSES));
  }

  function ensureAudioContextInstance() {
    if (typeof window === 'undefined') {
      return null;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    if (!audioContext) {
      try {
        audioContext = new AudioContextClass();
      } catch (error) {
        console.warn('[VTT] Unable to initialize turn audio context', error);
        audioContext = null;
        return null;
      }
    }
    if (audioContext && audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function scheduleTonePartial(context, partial, offset = 0) {
    if (!context || !partial || typeof partial.frequency !== 'number' || partial.frequency <= 0) {
      return;
    }
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    const startTime = context.currentTime + Math.max(0, offset);
    const attack = Math.max(0.005, Number(partial.attack) || 0.01);
    const decay = Math.max(0.05, Number(partial.decay) || 0.25);
    const sustain = Math.min(Math.max(Number(partial.sustain) || 0.4, 0), 1);
    const duration = Math.max(0.1, Number(partial.duration) || 1.2);
    const release = Math.max(0.1, Number(partial.release) || 1.0);
    const volume = Math.min(Math.max(Number(partial.volume) || 0.2, 0.01), 0.6);

    oscillator.type = partial.type || 'sine';
    oscillator.frequency.setValueAtTime(partial.frequency, startTime);
    if (typeof partial.detune === 'number') {
      oscillator.detune.setValueAtTime(partial.detune, startTime);
    }

    const peakTime = startTime + attack;
    const sustainTime = startTime + duration;
    const endTime = sustainTime + release;
    const sustainLevel = Math.max(volume * sustain, 0.0001);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(volume, peakTime);
    gainNode.gain.exponentialRampToValueAtTime(sustainLevel, peakTime + Math.max(decay, 0.05));
    gainNode.gain.setValueAtTime(sustainLevel, sustainTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(endTime + 0.1);
  }

  function playSoundProfile(profileKey) {
    const profile = SOUND_PROFILES[profileKey];
    if (!Array.isArray(profile) || !profile.length) {
      return;
    }
    const context = ensureAudioContextInstance();
    if (!context) {
      return;
    }
    profile.forEach((partial, index) => {
      scheduleTonePartial(context, partial, index * 0.015);
    });
  }

  function formatTimerValue(milliseconds, options = {}) {
    const direction = options.direction === 'up' ? 'up' : 'down';
    const totalSeconds =
      direction === 'up'
        ? Math.max(0, Math.floor(milliseconds / 1000))
        : Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function updateTurnTimerStage(remainingMs) {
    if (!turnTimerImage) {
      return;
    }
    let stage = 'low';
    if (remainingMs > TURN_TIMER_STAGE_INTERVAL_MS * 2) {
      stage = 'full';
    } else if (remainingMs > TURN_TIMER_STAGE_INTERVAL_MS) {
      stage = 'half';
    }
    if (currentTurnTimerStage === stage) {
      return;
    }
    currentTurnTimerStage = stage;
    turnTimerImage.dataset.stage = stage;
  }

  function resetAllyTurnTimerWarnings() {
    allyTurnTimerWarnings = { yellow: false, red: false };
  }

  function updateAllyTurnTimerDisplay() {
    if (!turnTimerElement || allyTurnTimerMode === 'idle') {
      return;
    }

    if (allyTurnTimerMode === 'countdown' && allyTurnTimerExpiresAt) {
      const remaining = Math.max(0, allyTurnTimerExpiresAt - Date.now());
      if (turnTimerDisplay) {
        turnTimerDisplay.textContent = formatTimerValue(remaining);
      }
      updateTurnTimerStage(remaining);

      if (remaining <= TURN_TIMER_WARNING_YELLOW_THRESHOLD_MS && !allyTurnTimerWarnings.yellow) {
        allyTurnTimerWarnings.yellow = true;
        flashTurnBorder('yellow');
      }
      if (remaining <= TURN_TIMER_WARNING_RED_THRESHOLD_MS && !allyTurnTimerWarnings.red) {
        allyTurnTimerWarnings.red = true;
        flashTurnBorder('red');
      }

      if (remaining <= 0) {
        stopAllyTurnTimer({ hide: false, holdStage: true });
      }
      return;
    }

    if (allyTurnTimerMode === 'countup' && allyTurnTimerStartedAt) {
      const elapsed = Math.max(0, Date.now() - allyTurnTimerStartedAt);
      if (turnTimerDisplay) {
        turnTimerDisplay.textContent = formatTimerValue(elapsed, { direction: 'up' });
      }
    }
  }

  function startAllyTurnCountdown() {
    if (!turnTimerElement) {
      return;
    }
    allyTurnTimerMode = 'countdown';
    allyTurnTimerExpiresAt = Date.now() + TURN_TIMER_DURATION_MS;
    allyTurnTimerStartedAt = null;
    resetAllyTurnTimerWarnings();
    currentTurnTimerStage = null;
    updateTurnTimerStage(TURN_TIMER_DURATION_MS);
    if (turnTimerDisplay) {
      turnTimerDisplay.textContent = formatTimerValue(TURN_TIMER_DURATION_MS);
    }
    turnTimerElement.hidden = false;
    turnTimerElement.setAttribute('aria-hidden', 'false');

    if (allyTurnTimerInterval && typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
      window.clearInterval(allyTurnTimerInterval);
    }
    if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
      allyTurnTimerInterval = window.setInterval(updateAllyTurnTimerDisplay, 500);
    }
    updateAllyTurnTimerDisplay();
  }

  function startAllyTurnCountUp() {
    if (!turnTimerElement) {
      return;
    }
    allyTurnTimerMode = 'countup';
    allyTurnTimerStartedAt = Date.now();
    allyTurnTimerExpiresAt = null;
    resetAllyTurnTimerWarnings();
    currentTurnTimerStage = null;
    updateTurnTimerStage(0);
    if (turnTimerDisplay) {
      turnTimerDisplay.textContent = TURN_TIMER_COUNTUP_INITIAL_DISPLAY;
    }
    turnTimerElement.hidden = false;
    turnTimerElement.setAttribute('aria-hidden', 'false');

    if (allyTurnTimerInterval && typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
      window.clearInterval(allyTurnTimerInterval);
    }
    if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
      allyTurnTimerInterval = window.setInterval(updateAllyTurnTimerDisplay, 500);
    }
    updateAllyTurnTimerDisplay();
  }

  function stopAllyTurnTimer(options = {}) {
    const { hide = true, holdStage = false } = options;
    if (allyTurnTimerInterval && typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
      window.clearInterval(allyTurnTimerInterval);
    }
    allyTurnTimerInterval = null;
    allyTurnTimerMode = 'idle';
    allyTurnTimerExpiresAt = null;
    allyTurnTimerStartedAt = null;
    resetAllyTurnTimerWarnings();
    if (turnTimerElement && hide) {
      turnTimerElement.hidden = true;
      turnTimerElement.setAttribute('aria-hidden', 'true');
    }
    if (turnTimerDisplay && !holdStage) {
      turnTimerDisplay.textContent = TURN_TIMER_INITIAL_DISPLAY;
    }
    if (!holdStage && turnTimerImage) {
      currentTurnTimerStage = TURN_TIMER_STAGE_FALLBACK;
      turnTimerImage.dataset.stage = TURN_TIMER_STAGE_FALLBACK;
    }
  }

  function notifyGmPlayersTurnEnd() {
    if (isGmUser()) {
      flashTurnBorder();
      playSoundProfile('longDing');
    } else {
      playSoundProfile('softGong');
    }
  }

  function notifyPlayersEnemyTurnEnd() {
    if (isGmUser()) {
      playSoundProfile('softGong');
    } else {
      flashTurnBorder();
      playSoundProfile('longDing');
    }
  }

  function buildTurnContext(combatantId) {
    const expectedTeam = currentTurnTeam ?? getCombatantTeam(combatantId);
    const previousTeam = lastActingTeam ?? null;
    const isFirstTurnOfRound = combatActive ? roundTurnCount === 0 : false;
    return { expectedTeam, previousTeam, isFirstTurnOfRound };
  }

  function handlePlayerInitiatedTurn(combatantId, context = {}) {
    const userId = getCurrentUserId();
    if (!userId) {
      return;
    }

    const team = getCombatantTeam(combatantId);
    if (team !== 'ally') {
      return;
    }

    if (turnLockState.holderId && turnLockState.holderId !== userId) {
      notifyTurnLocked(turnLockState.holderName);
      return;
    }

    const expectedTeam = context.expectedTeam ?? currentTurnTeam ?? team;
    const wasEnemyExpected = normalizeCombatTeam(expectedTeam) === 'enemy';
    const combatantProfileId = normalizeProfileId(getCombatantProfileId(combatantId));
    const isSharonUser = userId === SHARON_PROFILE_ID;
    const isSharonCombatant = combatantProfileId === SHARON_PROFILE_ID;
    const initiatorName = getCurrentUserName();

    if (wasEnemyExpected && !(isSharonUser && isSharonCombatant)) {
      if (!confirmPlayerTurnOverride()) {
        return;
      }
    }

    beginCombatantTurn(combatantId, {
      initiatorProfileId: userId,
      initiatorName,
      expectedTeam,
      previousTeam: context.previousTeam ?? lastActingTeam ?? null,
      isFirstTurnOfRound:
        typeof context.isFirstTurnOfRound === 'boolean'
          ? context.isFirstTurnOfRound
          : combatActive
          ? roundTurnCount === 0
          : false,
    });
  }

  function confirmPlayerTurnOverride() {
    try {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm("It is not the PC's turn. Would you like to go anyways?");
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  function handleActiveTeamChanged(previousTeam, nextTeam, previousCombatantId, nextCombatantId) {
    const normalizedPrevious = previousTeam ? normalizeCombatTeam(previousTeam) : null;
    const normalizedNext = nextTeam ? normalizeCombatTeam(nextTeam) : null;
    const teamChanged = normalizedPrevious !== normalizedNext;
    const combatantChanged = Boolean(
      nextCombatantId && previousCombatantId && nextCombatantId !== previousCombatantId
    );

    if (normalizedNext === 'ally') {
      const hasTurnLock =
        typeof nextCombatantId === 'string' &&
        nextCombatantId &&
        typeof turnLockState.combatantId === 'string' &&
        turnLockState.combatantId === nextCombatantId;

      if (hasTurnLock) {
        if (allyTurnTimerMode !== 'countup') {
          startAllyTurnCountUp();
        }
      } else if (teamChanged || combatantChanged || allyTurnTimerMode !== 'countdown') {
        startAllyTurnCountdown();
      }
    } else if (allyTurnTimerMode !== 'idle') {
      stopAllyTurnTimer();
    }

    if (normalizedPrevious && normalizedNext && teamChanged) {
      if (normalizedPrevious === 'ally' && normalizedNext === 'enemy') {
        notifyGmPlayersTurnEnd();
      } else if (normalizedPrevious === 'enemy' && normalizedNext === 'ally') {
        notifyPlayersEnemyTurnEnd();
      }
    }
  }

  function isGmUser() {
    const state = boardApi.getState?.();
    return Boolean(state?.user?.isGM);
  }

  function getCurrentUserId() {
    const state = boardApi.getState?.();
    const rawName = typeof state?.user?.name === 'string' ? state.user.name : '';
    const normalized = rawName.trim().toLowerCase();
    return normalized || null;
  }

  function normalizeProfileId(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  function getCombatantProfileId(combatantId) {
    if (!combatantId) {
      return null;
    }
    const placement = getPlacementFromStore(combatantId);
    const explicitProfile = extractProfileIdFromPlacement(placement);
    if (explicitProfile) {
      return explicitProfile;
    }
    const label = getCombatantLabel(combatantId);
    return matchProfileByName(label);
  }

  function extractProfileIdFromPlacement(placement) {
    if (!placement || typeof placement !== 'object') {
      return null;
    }

    const keys = ['profileId', 'profile', 'playerId', 'player', 'owner', 'controller'];
    for (const key of keys) {
      if (typeof placement[key] === 'string') {
        const normalized = normalizeProfileId(placement[key]);
        if (normalized) {
          return normalized;
        }
      }
    }

    const metadata = placement.metadata ?? placement.meta ?? null;
    if (metadata && typeof metadata === 'object') {
      for (const key of keys) {
        if (typeof metadata[key] === 'string') {
          const normalized = normalizeProfileId(metadata[key]);
          if (normalized) {
            return normalized;
          }
        }
      }
    }

    return matchProfileByName(placement?.name ?? '');
  }

  function matchProfileByName(name) {
    const normalizedName = normalizeCombatantName(name);
    if (!normalizedName) {
      return null;
    }
    for (const [profileId, aliases] of Object.entries(PLAYER_PROFILE_ALIASES)) {
      if (!Array.isArray(aliases)) {
        continue;
      }
      const matches = aliases.some((alias) => matchesProfileAlias(normalizedName, alias));
      if (matches) {
        return profileId;
      }
    }
    return null;
  }

  function normalizeCombatantName(name) {
    if (typeof name !== 'string') {
      return '';
    }
    return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function matchesProfileAlias(normalizedName, alias) {
    if (!normalizedName || typeof alias !== 'string') {
      return false;
    }
    const normalizedAlias = alias.trim().toLowerCase();
    if (!normalizedAlias) {
      return false;
    }
    const pattern = new RegExp(`(^|\s)${escapeRegExp(normalizedAlias)}(\s|$)`);
    return pattern.test(normalizedName);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function clearHesitationBanner() {
    if (hesitationBannerTimeoutId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(hesitationBannerTimeoutId);
    }
    if (hesitationBannerRemoveId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(hesitationBannerRemoveId);
    }
    hesitationBannerTimeoutId = null;
    hesitationBannerRemoveId = null;
    if (typeof document !== 'undefined') {
      const existing = document.querySelector('.vtt-hesitation-banner');
      if (existing && typeof existing.remove === 'function') {
        existing.remove();
      }
    }
  }

  function showHesitationPopup() {
    if (typeof document === 'undefined') {
      return;
    }
    clearHesitationBanner();
    const banner = document.createElement('div');
    banner.className = 'vtt-hesitation-banner';
    banner.textContent = 'HESITATION IS WEAKNESS!';
    document.body.appendChild(banner);

    if (typeof window !== 'undefined') {
      try {
        void banner.offsetWidth;
      } catch (error) {
        // Ignore layout thrash errors.
      }
      banner.classList.add('is-visible');

      if (typeof window.setTimeout === 'function') {
        hesitationBannerTimeoutId = window.setTimeout(() => {
          banner.classList.add('is-fading');
        }, 1800);
        hesitationBannerRemoveId = window.setTimeout(() => {
          if (banner.parentNode) {
            banner.parentNode.removeChild(banner);
          }
          hesitationBannerTimeoutId = null;
          hesitationBannerRemoveId = null;
        }, 2100);
      }
    }
  }

  function maybeTriggerSpecialTurnEffects(combatantId, options = {}) {
    const initiatorProfileId = normalizeProfileId(options?.initiatorProfileId ?? null);
    const combatantProfileId = normalizeProfileId(getCombatantProfileId(combatantId));
    if (combatantProfileId !== SHARON_PROFILE_ID) {
      return;
    }

    if (initiatorProfileId && initiatorProfileId !== SHARON_PROFILE_ID) {
      return;
    }

    const expectedTeamRaw =
      typeof options?.expectedTeam === 'string'
        ? options.expectedTeam
        : typeof currentTurnTeam === 'string'
        ? currentTurnTeam
        : null;
    if (!expectedTeamRaw) {
      return;
    }

    const expectedTeam = normalizeCombatTeam(expectedTeamRaw);
    if (expectedTeam !== 'enemy') {
      return;
    }

    const isFirstTurnOfRound = Boolean(options?.isFirstTurnOfRound);
    if (isFirstTurnOfRound) {
      return;
    }

    const previousTeamRaw =
      typeof options?.previousTeam === 'string'
        ? options.previousTeam
        : typeof lastActingTeam === 'string'
        ? lastActingTeam
        : null;
    if (!previousTeamRaw) {
      return;
    }

    const previousTeam = normalizeCombatTeam(previousTeamRaw);
    if (previousTeam !== 'ally') {
      return;
    }

    recordTurnEffect({
      type: 'sharon-hesitation',
      combatantId,
      triggeredAt: Date.now(),
    });
    showHesitationPopup();
    announceToChat('HESITATION IS WEAKNESS!');
  }

  function attachBoardTokenHover(tokenElement, tokenId) {
    if (!tokenElement || !tokenId) {
      return;
    }
    if (tokenElement.dataset.boardHoverBound === 'true') {
      return;
    }
    tokenElement.addEventListener('mouseenter', () => {
      handleBoardTokenHover(tokenId, true);
    });
    tokenElement.addEventListener('mouseleave', () => {
      handleBoardTokenHover(tokenId, false);
    });
    tokenElement.dataset.boardHoverBound = 'true';
  }

  function handleBoardTokenHover(tokenId, shouldHighlight) {
    if (!tokenId) {
      return;
    }
    toggleBoardTokenHighlight(tokenId, shouldHighlight);
    const representativeId = getRepresentativeIdFor(tokenId);
    if (representativeId) {
      highlightTrackerToken(representativeId, shouldHighlight);
    }
  }

  function pickRepresentativeIdForGroup(memberIds) {
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return null;
    }

    for (let index = memberIds.length - 1; index >= 0; index -= 1) {
      const candidate = typeof memberIds[index] === 'string' ? memberIds[index] : null;
      if (!candidate) {
        continue;
      }

      const placement = getPlacementFromStore(candidate);
      if (!isPlacementHiddenForPersistence(placement)) {
        return candidate;
      }
    }

    const fallback = memberIds[memberIds.length - 1];
    return typeof fallback === 'string' && fallback ? fallback : null;
  }

  function removeTokenFromGroups(tokenId) {
    if (!tokenId) {
      return;
    }

    if (combatTrackerGroups.has(tokenId)) {
      const groupMembers = combatTrackerGroups.get(tokenId);
      groupMembers.forEach((memberId) => {
        if (memberId !== tokenId) {
          combatantGroupRepresentative.delete(memberId);
        }
      });
      combatTrackerGroups.delete(tokenId);
    }

    const representativeId = combatantGroupRepresentative.get(tokenId);
    if (!representativeId) {
      return;
    }

    const members = combatTrackerGroups.get(representativeId);
    if (!members) {
      combatantGroupRepresentative.delete(tokenId);
      return;
    }

    members.delete(tokenId);
    combatantGroupRepresentative.delete(tokenId);

    if (members.size <= 1) {
      members.forEach((memberId) => {
        if (memberId !== representativeId) {
          combatantGroupRepresentative.delete(memberId);
        }
      });
      combatTrackerGroups.delete(representativeId);
    }
  }

  function handleGroupSelectedTokens() {
    if (selectedTokenIds.size <= 1) {
      return;
    }

    const orderedSelection = Array.from(selectedTokenIds);
    const uniqueSelection = Array.from(new Set(orderedSelection));
    if (uniqueSelection.length <= 1) {
      return;
    }

    const representativeCandidates = new Set(uniqueSelection.map((id) => getRepresentativeIdFor(id)));
    if (representativeCandidates.size === 1) {
      const [candidateRep] = representativeCandidates;
      const currentGroup = combatTrackerGroups.get(candidateRep);
      if (currentGroup && currentGroup.size === uniqueSelection.length) {
        const sameMembers = uniqueSelection.every((id) => currentGroup.has(id));
        if (sameMembers) {
          currentGroup.forEach((memberId) => {
            if (memberId !== candidateRep) {
              combatantGroupRepresentative.delete(memberId);
            }
          });
          combatTrackerGroups.delete(candidateRep);
          refreshCombatTracker();
          syncCombatStateToStore();
          if (status) {
            status.textContent = 'Ungrouped selected tokens.';
          }
          return;
        }
      }
    }

    const representativeId =
      pickRepresentativeIdForGroup(uniqueSelection) ?? uniqueSelection[uniqueSelection.length - 1];
    uniqueSelection.forEach(removeTokenFromGroups);

    const members = new Set(uniqueSelection);
    members.add(representativeId);
    combatTrackerGroups.set(representativeId, members);
    members.forEach((memberId) => {
      if (memberId !== representativeId) {
        combatantGroupRepresentative.set(memberId, representativeId);
      }
    });

    refreshCombatTracker();
    syncCombatStateToStore();
    if (status) {
      const count = members.size;
      const noun = count === 1 ? 'token' : 'tokens';
      status.textContent = `Grouped ${count} ${noun} in the combat tracker.`;
    }
  }

  function resetCombatGroups() {
    combatTrackerGroups.clear();
    combatantGroupRepresentative.clear();
    lastCombatTrackerEntries = [];
    refreshCombatTracker();
  }

  function deriveTokenInitials(label) {
    const trimmed = label.trim();
    if (!trimmed) {
      return '?';
    }

    const words = trimmed.split(/\s+/).slice(0, 2);
    const initials = words
      .map((word) => word.charAt(0))
      .filter(Boolean)
      .join('')
      .toUpperCase();
    return initials || trimmed.charAt(0).toUpperCase();
  }

  function applyTokenOverlays(tokenElement, placement) {
    if (!tokenElement || !placement) {
      return;
    }

    syncTokenTeamAffiliation(tokenElement, placement);
    syncTokenHitPoints(tokenElement, placement);
    syncTriggeredActionIndicator(tokenElement, placement);
    syncTokenConditionLabel(tokenElement, placement);
  }

  function syncTokenTeamAffiliation(tokenElement, placement) {
    const team = normalizeCombatTeam(placement.team ?? placement.combatTeam ?? null);
    if (team) {
      tokenElement.dataset.combatTeam = team;
    } else {
      delete tokenElement.dataset.combatTeam;
    }
  }

  function syncTokenHitPoints(tokenElement, placement) {
    const showHp = Boolean(placement.showHp);
    let hpBar = tokenElement.querySelector('.vtt-token__hp-bar');

    if (!showHp) {
      if (hpBar) {
        hpBar.remove();
      }
      return;
    }

    if (!hpBar) {
      hpBar = document.createElement('div');
      hpBar.className = 'vtt-token__hp-bar';
      tokenElement.appendChild(hpBar);
    }

    let track = hpBar.querySelector('.vtt-token__hp-track');
    if (!track) {
      track = document.createElement('div');
      track.className = 'vtt-token__hp-track';
      hpBar.insertBefore(track, hpBar.firstChild || null);
    }

    let fillElement = track.querySelector('.vtt-token__hp-fill');
    if (!fillElement) {
      fillElement = document.createElement('div');
      fillElement.className = 'vtt-token__hp-fill';
      track.appendChild(fillElement);
    }

    let valueElement = hpBar.querySelector('.vtt-token__hp-value');
    if (!valueElement) {
      valueElement = document.createElement('span');
      valueElement.className = 'vtt-token__hp-value';
      hpBar.appendChild(valueElement);
    }

    const hp = normalizePlacementHitPoints(placement.hp);
    const displayValue = formatHitPointsDisplay(hp);

    if (valueElement && valueElement.textContent !== displayValue) {
      valueElement.textContent = displayValue;
    }

    if (fillElement) {
      const percent = calculateHitPointsFillPercentage(hp);
      fillElement.style.width = `${percent}%`;
    }

    const isEmpty = !hp || (hp.current === '' && hp.max === '');
    hpBar.dataset.empty = isEmpty ? 'true' : 'false';
    const ariaLabel = isEmpty ? 'Hit points not set' : `${displayValue} hit points`;
    hpBar.setAttribute('aria-label', ariaLabel);
  }

  function syncTriggeredActionIndicator(tokenElement, placement) {
    const shouldShow = Boolean(placement.showTriggeredAction);
    let indicator = tokenElement.querySelector('.vtt-token__trigger-indicator');

    if (!shouldShow) {
      if (indicator) {
        indicator.remove();
      }
      return;
    }

    if (!indicator) {
      indicator = document.createElement('button');
      indicator.type = 'button';
      indicator.className = 'vtt-token__trigger-indicator';
      indicator.setAttribute('data-token-trigger-indicator', 'true');
      tokenElement.appendChild(indicator);
    }

    const isReady = placement.triggeredActionReady !== false;
    indicator.classList.toggle('is-spent', !isReady);
    indicator.setAttribute('aria-pressed', (!isReady).toString());
    indicator.setAttribute(
      'aria-label',
      isReady ? 'Triggered action ready. Click to mark used.' : 'Triggered action used. Click to reset.'
    );
    indicator.title = isReady ? 'Triggered action ready' : 'Triggered action used';
  }

  function syncTokenConditionLabel(tokenElement, placement) {
    let label = tokenElement.querySelector('.vtt-token__condition');
    const conditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);

    if (!conditions.length) {
      if (label) {
        detachConditionTooltip(label);
        label.remove();
      }
      return;
    }

    const text = conditions
      .map((condition) => (condition && typeof condition.name === 'string' ? condition.name.trim() : ''))
      .filter(Boolean)
      .join(' • ');

    if (!text) {
      if (label) {
        detachConditionTooltip(label);
        label.remove();
      }
      return;
    }

    if (!label) {
      label = document.createElement('div');
      label.className = 'vtt-token__condition';
      tokenElement.appendChild(label);
    }

    if (label.textContent !== text) {
      label.textContent = text;
    }
    label.setAttribute('aria-label', text);
    label.removeAttribute('title');
    configureConditionTooltip(label, conditions, { delay: 500 });
  }

  function handleTriggerIndicatorPointerDown(event) {
    const indicator = event.target.closest('.vtt-token__trigger-indicator');
    if (!indicator) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTriggerIndicatorClick(event) {
    const indicator = event.target.closest('.vtt-token__trigger-indicator');
    if (!indicator) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const tokenElement = indicator.closest('.vtt-token');
    const placementId = tokenElement?.dataset?.placementId ?? null;
    if (!placementId) {
      return;
    }
    toggleTriggeredActionState(placementId);
  }

  function handleTriggerIndicatorKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const indicator = event.target.closest('.vtt-token__trigger-indicator');
    if (!indicator) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const tokenElement = indicator.closest('.vtt-token');
    const placementId = tokenElement?.dataset?.placementId ?? null;
    if (!placementId) {
      return;
    }
    toggleTriggeredActionState(placementId);
  }

  function findRenderedPlacementAtPoint(event) {
    if (!renderedPlacements.length) {
      return null;
    }

    const pointer = getPointerPosition(event, mapSurface);
    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const translation = viewState.translation ?? { x: 0, y: 0 };
    const offsetX = Number.isFinite(translation.x) ? translation.x : 0;
    const offsetY = Number.isFinite(translation.y) ? translation.y : 0;
    const localX = (pointer.x - offsetX) / scale;
    const localY = (pointer.y - offsetY) / scale;

    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      return null;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return null;
    }

    const offsets = viewState.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null;
    }

    if (
      localX < offsetLeft ||
      localX > offsetLeft + innerWidth ||
      localY < offsetTop ||
      localY > offsetTop + innerHeight
    ) {
      return null;
    }

    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return null;
    }

    const pointX = localX - offsetLeft;
    const pointY = localY - offsetTop;

    for (let index = renderedPlacements.length - 1; index >= 0; index -= 1) {
      const placement = renderedPlacements[index];
      if (!placement || typeof placement !== 'object') {
        continue;
      }

      const column = Number.isFinite(placement.column) ? placement.column : 0;
      const row = Number.isFinite(placement.row) ? placement.row : 0;
      const width = Math.max(1, Number.isFinite(placement.width) ? placement.width : 1);
      const height = Math.max(1, Number.isFinite(placement.height) ? placement.height : 1);

      const left = column * gridSize;
      const top = row * gridSize;
      const right = left + width * gridSize;
      const bottom = top + height * gridSize;

      if (pointX >= left && pointX < right && pointY >= top && pointY < bottom) {
        return placement;
      }
    }

    return null;
  }

  function getActiveScenePlacements(state = {}) {
    const boardState = state.boardState;
    if (!boardState || typeof boardState !== 'object') {
      return [];
    }
    const activeSceneId = boardState.activeSceneId ?? null;
    if (!activeSceneId) {
      return [];
    }
    const placements = boardState.placements;
    if (!placements || typeof placements !== 'object') {
      return [];
    }
    const scenePlacements = placements[activeSceneId];
    return Array.isArray(scenePlacements) ? scenePlacements : [];
  }

  function normalizePlacementForRender(placement) {
    if (!placement || typeof placement !== 'object') {
      return null;
    }

    const id = typeof placement.id === 'string' ? placement.id : null;
    if (!id) {
      return null;
    }

    const column = toNonNegativeNumber(placement.column ?? placement.col ?? 0);
    const row = toNonNegativeNumber(placement.row ?? placement.y ?? 0);
    const width = Math.max(1, toNonNegativeNumber(placement.width ?? placement.columns ?? 1));
    const height = Math.max(1, toNonNegativeNumber(placement.height ?? placement.rows ?? 1));
    const name = typeof placement.name === 'string' ? placement.name : '';
    const imageUrl = typeof placement.imageUrl === 'string' ? placement.imageUrl : '';
    const hp = normalizePlacementHitPoints(
      placement.hp ??
        placement.hitPoints ??
        placement?.overlays?.hitPoints ??
        placement?.overlays?.hitPoints?.value ??
        placement?.stats?.hp ??
        null
    );
    const showHp = Boolean(placement.showHp ?? placement.showHitPoints ?? placement?.overlays?.hitPoints?.visible ?? false);
    const showTriggeredAction = Boolean(
      placement.showTriggeredAction ?? placement?.overlays?.triggeredAction?.visible ?? false
    );
    const triggeredActionReady =
      placement.triggeredActionReady ?? placement?.overlays?.triggeredAction?.ready ?? true;
    const conditions = ensurePlacementConditions(
      placement?.conditions ??
        placement.condition ??
        placement?.status ??
        placement?.overlays?.condition ??
        placement?.overlays?.conditions ??
        null
    );
    const condition = conditions[0] ?? null;
    const team = normalizeCombatTeam(
      placement.combatTeam ??
        placement.team ??
        placement?.tags?.team ??
        placement?.faction ??
        placement?.alignment ??
        null
    );
    const hidden = toBoolean(
      placement.hidden ?? placement.isHidden ?? placement?.flags?.hidden ?? false,
      false
    );

    return {
      id,
      column,
      row,
      width,
      height,
      name,
      imageUrl,
      hp,
      showHp,
      showTriggeredAction,
      triggeredActionReady: triggeredActionReady !== false,
      conditions,
      condition,
      team,
      hidden,
    };
  }

  function normalizeCombatTeam(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'ally') {
      return 'ally';
    }
    if (raw === 'enemy') {
      return 'enemy';
    }
    return 'enemy';
  }

  function toNonNegativeNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }

    return Math.max(0, Math.trunc(fallback));
  }

  function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return fallback;
      }
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return fallback;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
        return false;
      }
      return fallback;
    }

    if (typeof value === 'object' && value !== null) {
      return toBoolean(value.valueOf(), fallback);
    }

    return fallback;
  }

  function measurementPointFromToken(position) {
    if (!position || !viewState.mapLoaded) {
      return null;
    }

    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return null;
    }

    const offsets = viewState.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;

    const width = Math.max(1, toNonNegativeNumber(position.width ?? position.columns ?? 1, 1));
    const height = Math.max(1, toNonNegativeNumber(position.height ?? position.rows ?? 1, 1));
    const column = toNonNegativeNumber(position.column ?? position.col ?? 0, 0);
    const row = toNonNegativeNumber(position.row ?? position.y ?? 0, 0);

    const centerColumn = column + width / 2 - 0.5;
    const centerRow = row + height / 2 - 0.5;

    const mapX = offsetLeft + (centerColumn + 0.5) * gridSize;
    const mapY = offsetTop + (centerRow + 0.5) * gridSize;

    if (!Number.isFinite(mapX) || !Number.isFinite(mapY)) {
      return null;
    }

    return {
      column: centerColumn,
      row: centerRow,
      mapX,
      mapY,
    };
  }

  function hasTokenData(dataTransfer, type) {
    if (!dataTransfer) {
      return false;
    }

    let types = [];
    try {
      types = Array.from(dataTransfer.types || []);
      if (types.includes(type)) {
        return true;
      }
      if (tokenLibraryDragState.active && types.includes(TOKEN_DRAG_FALLBACK_TYPE)) {
        tokenLibraryDragState.usesFallbackPayload = true;
        return true;
      }
    } catch (error) {
      // Ignore DOMStringList conversion issues
    }

    try {
      const payload = dataTransfer.getData(type);
      return Boolean(payload);
    } catch (error) {
      // Some browsers restrict access to custom types during dragover/dragenter
    }

    if (tokenLibraryDragState.active) {
      if (!tokenLibraryDragState.usesFallbackPayload) {
        try {
          const fallbackPayload = dataTransfer.getData(TOKEN_DRAG_FALLBACK_TYPE);
          if (fallbackPayload) {
            tokenLibraryDragState.usesFallbackPayload = true;
            return true;
          }
        } catch (error) {
          // Ignore fallback access errors
        }
      }

      return true;
    }

    try {
      const fallbackPayload = dataTransfer.getData(TOKEN_DRAG_FALLBACK_TYPE);
      return Boolean(fallbackPayload);
    } catch (error) {
      return false;
    }
  }

  function readTokenTemplate(dataTransfer, type) {
    if (!dataTransfer) {
      return null;
    }

    let raw = '';
    try {
      raw = dataTransfer.getData(type);
    } catch (error) {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const imageUrl = typeof parsed.imageUrl === 'string' ? parsed.imageUrl : '';
      if (!imageUrl) {
        return null;
      }

      const rawSize = typeof parsed.size === 'string' ? parsed.size : '';
      const size = rawSize.trim() || '1x1';
      const maxHp = normalizeHitPointsValue(parsed.hp ?? parsed.hitPoints ?? null);
      const hasTeam = typeof parsed.team === 'string' && parsed.team.trim().length > 0;
      const hasCombatTeam = typeof parsed.combatTeam === 'string' && parsed.combatTeam.trim().length > 0;
      const normalizedTeam = hasCombatTeam
        ? normalizeCombatTeam(parsed.combatTeam)
        : hasTeam
          ? normalizeCombatTeam(parsed.team)
          : null;

      const template = {
        id: typeof parsed.id === 'string' ? parsed.id : null,
        name: typeof parsed.name === 'string' ? parsed.name : '',
        imageUrl,
        size,
        maxHp,
        hp: maxHp,
      };

      if (hasTeam && normalizedTeam) {
        template.team = normalizedTeam;
      }

      if (hasCombatTeam && normalizedTeam) {
        template.combatTeam = normalizedTeam;
      }

      if (Object.prototype.hasOwnProperty.call(parsed, 'sourceFolderId')) {
        const rawId = parsed.sourceFolderId;
        if (rawId === null) {
          template.sourceFolderId = null;
        } else if (typeof rawId === 'string') {
          const trimmed = rawId.trim();
          template.sourceFolderId = trimmed || null;
        }
      }

      if (typeof parsed.sourceFolderName === 'string') {
        template.sourceFolderName = parsed.sourceFolderName.trim();
      }

      if (typeof parsed.folderName === 'string' && !template.sourceFolderName) {
        template.folderName = parsed.folderName.trim();
      }

      const rawMonsterId = typeof parsed.monsterId === 'string' ? parsed.monsterId.trim() : '';
      if (rawMonsterId) {
        template.monsterId = rawMonsterId;
      }

      if (parsed.monster) {
        const sanitizedMonster = normalizeMonsterSnapshot(parsed.monster);
        if (sanitizedMonster) {
          template.monster = sanitizedMonster;
          if (!template.monsterId && sanitizedMonster.id) {
            template.monsterId = sanitizedMonster.id;
          }
        }
      }

      return template;
    } catch (error) {
      console.warn('[VTT] Failed to parse dropped token payload', error);
      return null;
    }
  }

  function isTokenSourcePlayerVisible(template = {}) {
    const playerFolderKey = normalizePlayerTokenFolderName(PLAYER_VISIBLE_TOKEN_FOLDER);
    if (!playerFolderKey) {
      return false;
    }

    const candidateNames = [];
    if (typeof template.sourceFolderName === 'string') {
      candidateNames.push(template.sourceFolderName);
    }
    if (typeof template.sourceFolderId === 'string') {
      candidateNames.push(template.sourceFolderId);
    }
    if (typeof template.folderName === 'string') {
      candidateNames.push(template.folderName);
    }
    if (typeof template.folder?.name === 'string') {
      candidateNames.push(template.folder.name);
    }

    return candidateNames.some((value) => normalizePlayerTokenFolderName(value) === playerFolderKey);
  }

  function calculateTokenPlacement(template, event, surface, view) {
    if (!template || !surface || !view) {
      return null;
    }

    const pointer = getPointerPosition(event, surface);
    const scale = Number.isFinite(view.scale) && view.scale !== 0 ? view.scale : 1;
    const translation = view.translation ?? { x: 0, y: 0 };
    const localX = (pointer.x - (Number.isFinite(translation.x) ? translation.x : 0)) / scale;
    const localY = (pointer.y - (Number.isFinite(translation.y) ? translation.y : 0)) / scale;

    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      return null;
    }

    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return null;
    }

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null;
    }

    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return null;
    }

    const size = parseTokenSize(template.size);

    const withinBoundsX = localX >= offsetLeft && localX <= offsetLeft + innerWidth;
    const withinBoundsY = localY >= offsetTop && localY <= offsetTop + innerHeight;
    if (!withinBoundsX || !withinBoundsY) {
      return null;
    }

    const gridCoordX = (localX - offsetLeft) / gridSize;
    const gridCoordY = (localY - offsetTop) / gridSize;
    if (!Number.isFinite(gridCoordX) || !Number.isFinite(gridCoordY)) {
      return null;
    }

    let column = Math.round(gridCoordX - size.width / 2);
    let row = Math.round(gridCoordY - size.height / 2);

    const maxColumn = Math.max(0, Math.floor(innerWidth / gridSize - size.width));
    const maxRow = Math.max(0, Math.floor(innerHeight / gridSize - size.height));

    column = Math.max(0, Math.min(column, maxColumn));
    row = Math.max(0, Math.min(row, maxRow));

    const hitPoints = normalizePlacementHitPoints(template.hp ?? template.maxHp ?? null);
    const playerVisibleSource = isTokenSourcePlayerVisible(template);
    let hidden = !playerVisibleSource;
    if (Object.prototype.hasOwnProperty.call(template, 'hidden')) {
      hidden = toBoolean(template.hidden, hidden);
    } else if (Object.prototype.hasOwnProperty.call(template, 'isHidden')) {
      hidden = toBoolean(template.isHidden, hidden);
    }

    const placement = {
      id: createPlacementId(),
      tokenId: template.id,
      name: template.name ?? '',
      imageUrl: template.imageUrl ?? '',
      column,
      row,
      width: size.width,
      height: size.height,
      size: size.formatted,
      hp: hitPoints,
      showHp: false,
      showTriggeredAction: false,
      triggeredActionReady: true,
      condition: null,
      combatTeam: normalizeCombatTeam(template.combatTeam ?? template.team ?? null),
      hidden,
    };

    const placementMetadata = {};

    if (template.monsterId) {
      const trimmedId = typeof template.monsterId === 'string' ? template.monsterId.trim() : '';
      if (trimmedId) {
        placement.monsterId = trimmedId;
        placementMetadata.monsterId = trimmedId;
      }
    }

    if (template.monster) {
      const monsterSnapshot = cloneMonsterSnapshot(template.monster);
      if (monsterSnapshot) {
        placement.monster = monsterSnapshot;
        placementMetadata.monster = cloneMonsterSnapshot(template.monster);
        if (!placement.monsterId && monsterSnapshot.id) {
          placement.monsterId = monsterSnapshot.id;
          placementMetadata.monsterId = monsterSnapshot.id;
        }
      }
    }

    if (Object.keys(placementMetadata).length > 0) {
      placement.metadata = placementMetadata;
    }

    markPlacementAsGmAuthored(placement);

    return placement;
  }

  function cloneMonsterSnapshot(monster) {
    if (!monster || typeof monster !== 'object') {
      return null;
    }

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(monster);
      } catch (error) {
        // Fallback to JSON clone below.
      }
    }

    try {
      return JSON.parse(JSON.stringify(monster));
    } catch (error) {
      return null;
    }
  }

  function toggleTriggeredActionState(placementId) {
    if (!placementId || typeof boardApi.updateState !== 'function') {
      return false;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return false;
    }

    const gmUser = Boolean(state?.user?.isGM);
    let updated = false;
    let nextReady = true;
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      const target = scenePlacements.find((item) => item && item.id === placementId);
      if (!target) {
        return;
      }
      const current = target.triggeredActionReady !== false;
      nextReady = !current;
      target.triggeredActionReady = nextReady;
      if (gmUser) {
        markPlacementAsGmAuthored(target, { isGm: gmUser });
      }
      updated = true;
    });

    if (!updated) {
      return false;
    }

    persistBoardStateSnapshot();

    const latestState = boardApi.getState?.() ?? {};
    const placement = resolvePlacementById(latestState, activeSceneId, placementId);
    if (status && placement) {
      const label = tokenLabel(placement);
      status.textContent = nextReady
        ? `${label} is ready to act.`
        : `${label} has used their triggered action.`;
    }

    refreshTokenSettings();
    return true;
  }

  function toggleDamageHealWidget() {
    if (damageHealUi) {
      closeDamageHealWidget();
    } else {
      openDamageHealWidget();
    }
  }

  function openDamageHealWidget() {
    if (damageHealUi || typeof document === 'undefined') {
      if (damageHealUi?.amountInput) {
        try {
          damageHealUi.amountInput.focus();
          damageHealUi.amountInput.select?.();
        } catch (error) {
          // Ignore focus errors
        }
      }
      return damageHealUi;
    }

    cancelDamageHealTargeting({ restoreMessage: true });
    clearDamageHealStatusTimeout();

    const container = document.createElement('div');
    container.className = 'vtt-damage-heal';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Damage or heal tokens');
    container.style.position = 'fixed';
    container.style.top = '16px';
    container.style.left = '16px';
    container.tabIndex = -1;

    const header = document.createElement('div');
    header.className = 'vtt-damage-heal__header';

    const title = document.createElement('h2');
    title.className = 'vtt-damage-heal__title';
    title.textContent = 'Damage / Heal';
    header.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'vtt-damage-heal__close';
    closeButton.setAttribute('aria-label', 'Close damage and heal controls');
    closeButton.textContent = '×';
    header.appendChild(closeButton);
    container.appendChild(header);

    const field = document.createElement('label');
    field.className = 'vtt-damage-heal__field';

    const labelText = document.createElement('span');
    labelText.className = 'vtt-damage-heal__label';
    labelText.textContent = 'Amount';
    field.appendChild(labelText);

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '1';
    amountInput.step = '1';
    amountInput.inputMode = 'numeric';
    amountInput.className = 'vtt-damage-heal__input';
    amountInput.placeholder = 'Enter value';
    amountInput.autocomplete = 'off';
    field.appendChild(amountInput);

    container.appendChild(field);

    const actions = document.createElement('div');
    actions.className = 'vtt-damage-heal__actions';

    const damageButton = document.createElement('button');
    damageButton.type = 'button';
    damageButton.className = 'btn btn--danger btn--small';
    damageButton.textContent = 'Damage';
    damageButton.disabled = true;

    const healButton = document.createElement('button');
    healButton.type = 'button';
    healButton.className = 'btn btn--success btn--small';
    healButton.textContent = 'Heal';
    healButton.disabled = true;

    actions.appendChild(damageButton);
    actions.appendChild(healButton);
    container.appendChild(actions);

    damageHealUi = {
      container,
      amountInput,
      damageButton,
      healButton,
      closeButton,
      cleanup: null,
    };

    const handleDamageHealAction = (mode) => {
      const amount = parseDamageHealAmount(amountInput.value);
      if (amount === null) {
        updateDamageHealActionState();
        return;
      }
      beginDamageHealTargeting(mode, amount);
      setDamageHealMode(mode);
      focusBoard();
    };

    const handleDamageClick = (event) => {
      event.preventDefault();
      handleDamageHealAction('damage');
    };

    const handleHealClick = (event) => {
      event.preventDefault();
      handleDamageHealAction('heal');
    };

    const handleInput = () => {
      if (pendingDamageHeal) {
        cancelDamageHealTargeting({ restoreMessage: true });
      }
      setDamageHealMode(null);
      updateDamageHealActionState();
    };

    const handleClose = (event) => {
      event.preventDefault();
      closeDamageHealWidget();
    };

    const stopClosePointerDown = (event) => {
      event.stopPropagation();
    };

    const handleContainerKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDamageHealWidget();
        return;
      }
      if (event.key === 'Enter' && document.activeElement === amountInput) {
        event.preventDefault();
        const activeMode = damageHealUi?.container?.dataset?.mode ?? null;
        if (activeMode === 'damage' || activeMode === 'heal') {
          handleDamageHealAction(activeMode);
        }
      }
    };

    amountInput.addEventListener('input', handleInput);
    amountInput.addEventListener('change', handleInput);
    damageButton.addEventListener('click', handleDamageClick);
    healButton.addEventListener('click', handleHealClick);
    closeButton.addEventListener('click', handleClose);
    closeButton.addEventListener('pointerdown', stopClosePointerDown);
    container.addEventListener('keydown', handleContainerKeydown);

    const cleanupDrag = setupDamageHealDrag(container, header);

    damageHealUi.cleanup = () => {
      amountInput.removeEventListener('input', handleInput);
      amountInput.removeEventListener('change', handleInput);
      damageButton.removeEventListener('click', handleDamageClick);
      healButton.removeEventListener('click', handleHealClick);
      closeButton.removeEventListener('click', handleClose);
      closeButton.removeEventListener('pointerdown', stopClosePointerDown);
      container.removeEventListener('keydown', handleContainerKeydown);
      cleanupDrag();
    };

    document.body.appendChild(container);
    setDamageHealMode(null);
    updateDamageHealActionState();

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        try {
          amountInput.focus();
          amountInput.select?.();
        } catch (error) {
          // Ignore focus errors
        }
      });
    } else {
      try {
        amountInput.focus();
      } catch (error) {
        // Ignore focus errors
      }
    }

    return damageHealUi;
  }

  function closeDamageHealWidget(options = {}) {
    const { restoreStatus: restoreMessage = true } = options;
    if (damageHealUi) {
      damageHealUi.cleanup?.();
      if (damageHealUi.container?.parentElement) {
        damageHealUi.container.remove();
      }
      damageHealUi = null;
    }
    setDamageHealMode(null);
    clearDamageHealStatusTimeout();
    cancelDamageHealTargeting({ restoreMessage });
  }

  function setDamageHealMode(mode) {
    if (!damageHealUi?.container) {
      return;
    }

    if (mode === 'damage' || mode === 'heal') {
      damageHealUi.container.dataset.mode = mode;
      damageHealUi.damageButton.classList.toggle('is-active', mode === 'damage');
      damageHealUi.healButton.classList.toggle('is-active', mode === 'heal');
    } else {
      delete damageHealUi.container.dataset.mode;
      damageHealUi.damageButton.classList.remove('is-active');
      damageHealUi.healButton.classList.remove('is-active');
    }
  }

  function beginDamageHealTargeting(mode, amount) {
    if (mode !== 'damage' && mode !== 'heal') {
      return;
    }

    const normalizedAmount = Number.isFinite(amount)
      ? Math.max(0, Math.trunc(Math.abs(amount)))
      : null;
    if (!normalizedAmount) {
      return;
    }

    const previousStatus = status && typeof status.textContent === 'string' && status.textContent.trim()
      ? status.textContent
      : defaultStatusText;

    pendingDamageHeal = {
      mode,
      amount: normalizedAmount,
      previousStatus,
    };

    clearDamageHealStatusTimeout();

    const verb = mode === 'damage' ? 'apply' : 'grant';
    const noun = mode === 'damage' ? 'damage' : 'healing';
    updateStatus(`Click a token to ${verb} ${normalizedAmount} ${noun}. Right-click or press Escape to cancel.`);
  }

  function cancelDamageHealTargeting({ restoreMessage = true } = {}) {
    if (!pendingDamageHeal) {
      return;
    }

    const previousStatus = pendingDamageHeal.previousStatus;
    pendingDamageHeal = null;
    clearDamageHealStatusTimeout();
    setDamageHealMode(null);

    if (restoreMessage) {
      if (status && typeof previousStatus === 'string' && previousStatus.length) {
        status.textContent = previousStatus;
      } else {
        restoreStatus();
      }
    }
  }

  function clearDamageHealStatusTimeout() {
    if (damageHealStatusTimeoutId !== null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(damageHealStatusTimeoutId);
      damageHealStatusTimeoutId = null;
    }
  }

  function scheduleDamageHealStatusReset(delay = 4000) {
    clearDamageHealStatusTimeout();
    if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
      return;
    }
    damageHealStatusTimeoutId = window.setTimeout(() => {
      damageHealStatusTimeoutId = null;
      if (!pendingDamageHeal) {
        restoreStatus();
      }
    }, Math.max(0, delay));
  }

  function updateDamageHealActionState() {
    if (!damageHealUi) {
      return;
    }
    const amount = parseDamageHealAmount(damageHealUi.amountInput.value);
    const disabled = amount === null;
    damageHealUi.damageButton.disabled = disabled;
    damageHealUi.healButton.disabled = disabled;
  }

  function parseDamageHealAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = Math.trunc(Math.abs(value));
      return normalized > 0 ? normalized : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      const normalized = Math.trunc(Math.abs(parsed));
      return normalized > 0 ? normalized : null;
    }

    return null;
  }

  function applyDamageHealToPlacement(placementId, mode, amount) {
    if (!placementId || (mode !== 'damage' && mode !== 'heal')) {
      return null;
    }

    const normalizedAmount = Number.isFinite(amount)
      ? Math.max(0, Math.trunc(Math.abs(amount)))
      : null;
    if (!normalizedAmount) {
      return null;
    }

    let result = null;
    const updated = updatePlacementById(placementId, (target) => {
      const hp = ensurePlacementHitPoints(target.hp);
      const currentValue = parseHitPointNumber(hp.current);
      const maxValue = parseHitPointNumber(hp.max);
      const baseCurrent = currentValue ?? 0;

      let nextValue = mode === 'damage' ? baseCurrent - normalizedAmount : baseCurrent + normalizedAmount;

      if (mode === 'damage') {
        nextValue = Math.max(0, nextValue);
      } else if (maxValue !== null) {
        nextValue = Math.min(maxValue, nextValue);
      }

      if (!Number.isFinite(nextValue)) {
        nextValue = baseCurrent;
      }

      const finalValue = Math.max(0, Math.trunc(nextValue));
      const finalString = String(finalValue);

      target.hp = { current: finalString, max: hp.max };

      if (target.overlays && typeof target.overlays === 'object') {
        if (!target.overlays.hitPoints || typeof target.overlays.hitPoints !== 'object') {
          target.overlays.hitPoints = {};
        }
        target.overlays.hitPoints.value = { current: finalString, max: hp.max };
      }

      result = {
        previous: baseCurrent,
        current: finalValue,
        max: maxValue,
        change: Math.abs(finalValue - baseCurrent),
      };
    });

    if (!updated || !result) {
      return null;
    }

    const placement = getPlacementFromStore(placementId);
    const name = tokenLabel(placement);
    return {
      ...result,
      name,
    };
  }

  function parseHitPointNumber(value) {
    const normalized = normalizeHitPointsValue(value);
    if (typeof normalized !== 'string' || !normalized) {
      return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setupDamageHealDrag(container, handle) {
    if (!container || !handle || typeof document === 'undefined') {
      return () => {};
    }

    let dragState = null;

    const handlePointerMove = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      event.preventDefault();

      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : document.documentElement.clientWidth;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : document.documentElement.clientHeight;

      const maxLeft = Math.max(0, viewportWidth - container.offsetWidth);
      const maxTop = Math.max(0, viewportHeight - container.offsetHeight);

      const nextLeft = Math.max(0, Math.min(maxLeft, event.clientX - dragState.offsetX));
      const nextTop = Math.max(0, Math.min(maxTop, event.clientY - dragState.offsetY));

      container.style.left = `${nextLeft}px`;
      container.style.top = `${nextTop}px`;
    };

    const clearListeners = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      container.classList.remove('is-dragging');
      dragState = null;
    };

    const handlePointerUp = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      clearListeners();
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest('.vtt-damage-heal__close')) {
        return;
      }
      event.preventDefault();

      const bounds = container.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - bounds.left,
        offsetY: event.clientY - bounds.top,
      };

      container.classList.add('is-dragging');

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
    };

    handle.addEventListener('pointerdown', handlePointerDown);

    return () => {
      handle.removeEventListener('pointerdown', handlePointerDown);
      clearListeners();
    };
  }

  function markPlacementAsGmAuthored(target, { isGm } = {}) {
    const gmUser = typeof isGm === 'boolean' ? isGm : isGmUser();
    if (!gmUser || !target || typeof target !== 'object') {
      return;
    }

    target.authorIsGm = true;
    target.authorRole = 'gm';

    const flags = target.flags && typeof target.flags === 'object' ? target.flags : {};
    flags.gmAuthored = true;
    if (typeof target.hidden === 'boolean') {
      flags.hidden = target.hidden;
    }
    target.flags = flags;

    const metadataBase =
      target.metadata && typeof target.metadata === 'object' ? target.metadata : {};
    target.metadata = {
      ...metadataBase,
      authorRole: 'gm',
      authorIsGm: true,
    };
  }

  function updatePlacementById(placementId, mutator) {
    if (!placementId || typeof mutator !== 'function' || typeof boardApi.updateState !== 'function') {
      return false;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return false;
    }

    const gmUser = Boolean(state?.user?.isGM);
    let updated = false;
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      const target = scenePlacements.find((item) => item && item.id === placementId);
      if (!target) {
        return;
      }
      mutator(target);
      if (gmUser) {
        markPlacementAsGmAuthored(target, { isGm: gmUser });
      }
      updated = true;
    });

    if (updated) {
      persistBoardStateSnapshot();
    }

    return updated;
  }

  function getPlacementFromStore(placementId) {
    if (!placementId) {
      return null;
    }
    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return null;
    }
    return resolvePlacementById(state, activeSceneId, placementId);
  }

  function resolvePlacementById(state, sceneId, placementId) {
    if (!state || !sceneId || !placementId) {
      return null;
    }
    const placements = state.boardState?.placements;
    if (!placements || typeof placements !== 'object') {
      return null;
    }
    const scenePlacements = placements[sceneId];
    if (!Array.isArray(scenePlacements)) {
      return null;
    }
    return scenePlacements.find((placement) => placement && placement.id === placementId) ?? null;
  }

  function getPlacementsForActiveScene() {
    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return [];
    }
    const allPlacements = state.boardState?.placements;
    if (!allPlacements || typeof allPlacements !== 'object') {
      return [];
    }
    const scenePlacements = allPlacements[activeSceneId];
    if (!Array.isArray(scenePlacements)) {
      return [];
    }
    return scenePlacements.slice();
  }

  function tokenLabel(placement) {
    if (!placement || typeof placement !== 'object') {
      return 'Token';
    }
    const rawName = typeof placement.name === 'string' ? placement.name.trim() : '';
    return rawName || 'Token';
  }

  function formatPossessiveName(name) {
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) {
      return "Token's";
    }
    const normalized = raw.replace(/\s+/g, ' ');
    if (normalized.endsWith("'s") || normalized.endsWith('’s')) {
      return normalized;
    }
    return /s$/i.test(normalized) ? `${normalized}'` : `${normalized}'s`;
  }

  function getActiveHitPointsSnapshot() {
    if (!activeTokenSettingsId) {
      return null;
    }
    const placement = getPlacementFromStore(activeTokenSettingsId);
    if (!placement) {
      return null;
    }
    return ensurePlacementHitPoints(placement.hp);
  }

  function isEditingHitPoints() {
    return (
      Boolean(hitPointsEditSession) &&
      activeTokenSettingsId !== null &&
      hitPointsEditSession.placementId === activeTokenSettingsId &&
      tokenSettingsMenu?.hpCurrentInput === document.activeElement
    );
  }

  function restoreHitPointsInputValue() {
    if (!tokenSettingsMenu?.hpCurrentInput) {
      return;
    }
    const snapshot = getActiveHitPointsSnapshot();
    tokenSettingsMenu.hpCurrentInput.value = snapshot ? snapshot.current : '';
  }

  function commitHitPointsInput(rawValue) {
    if (!activeTokenSettingsId) {
      return false;
    }

    const placement = getPlacementFromStore(activeTokenSettingsId);
    if (!placement) {
      return false;
    }

    const baseSnapshot = hitPointsEditSession && hitPointsEditSession.placementId === activeTokenSettingsId
      ? {
          current: hitPointsEditSession.originalCurrent,
          max: hitPointsEditSession.originalMax,
        }
      : ensurePlacementHitPoints(placement.hp);

    const draft = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (draft === '') {
      return false;
    }

    const relativeMatch = /^([+-])\s*(\d+)$/u.exec(draft);
    let nextValue = null;

    if (relativeMatch) {
      const [, operator, digits] = relativeMatch;
      const delta = Number.parseInt(digits, 10);
      if (!Number.isFinite(delta)) {
        return false;
      }
      const baseValue =
        parseHitPointsNumber(baseSnapshot.current) ?? parseHitPointsNumber(baseSnapshot.max) ?? 0;
      const computed = operator === '-' ? baseValue - delta : baseValue + delta;
      if (!Number.isFinite(computed)) {
        return false;
      }
      nextValue = String(computed);
    } else {
      const normalized = normalizeHitPointsValue(draft);
      const parsed = parseHitPointsNumber(normalized);
      if (parsed === null) {
        return false;
      }
      nextValue = String(parsed);
    }

    hitPointsEditSession = null;

    updatePlacementById(activeTokenSettingsId, (target) => {
      const hitPoints = ensurePlacementHitPoints(target.hp, baseSnapshot.max);
      hitPoints.current = nextValue;
      if (hitPoints.max === '' && nextValue !== '') {
        hitPoints.max = nextValue;
      }
      target.hp = hitPoints;
    });

    const latestPlacement = getPlacementFromStore(activeTokenSettingsId);
    const latestSnapshot = latestPlacement ? ensurePlacementHitPoints(latestPlacement.hp) : null;

    if (tokenSettingsMenu?.hpCurrentInput && latestSnapshot) {
      tokenSettingsMenu.hpCurrentInput.value = latestSnapshot.current;
    }

    refreshTokenSettings();

    if (
      tokenSettingsMenu?.hpCurrentInput &&
      latestSnapshot &&
      document.activeElement === tokenSettingsMenu.hpCurrentInput
    ) {
      hitPointsEditSession = {
        placementId: activeTokenSettingsId,
        originalCurrent: latestSnapshot.current,
        originalMax: latestSnapshot.max,
      };
    }

    return true;
  }

  function normalizeHitPointsValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      if (typeof value.value === 'number' && Number.isFinite(value.value)) {
        return String(Math.trunc(value.value));
      }
      if (typeof value.value === 'string') {
        return value.value.trim();
      }
    }

    return '';
  }

  function normalizePlacementHitPoints(value, fallbackMax = '') {
    const normalized = { current: '', max: '' };

    if (value && typeof value === 'object') {
      const currentSource =
        value.current ?? value.value ?? value.hp ?? value.currentHp ?? value.hpCurrent ?? null;
      const maxSource =
        value.max ??
        value.maxHp ??
        value.total ??
        value.maximum ??
        value.value ??
        value.hp ??
        value.hitPoints ??
        null;

      normalized.current = normalizeHitPointsValue(currentSource);
      normalized.max = normalizeHitPointsValue(maxSource);
    } else {
      const parsed = normalizeHitPointsValue(value);
      normalized.current = parsed;
      normalized.max = parsed;
    }

    const fallback = normalizeHitPointsValue(fallbackMax);
    if (normalized.max === '' && fallback !== '') {
      normalized.max = fallback;
    }

    if (normalized.current === '' && normalized.max !== '') {
      normalized.current = normalized.max;
    }

    return normalized;
  }

  function ensurePlacementHitPoints(value, fallbackMax = '') {
    const normalized = normalizePlacementHitPoints(value, fallbackMax);
    return { current: normalized.current, max: normalized.max };
  }

  function normalizePlacementCondition(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      const name = value.trim();
      if (!name) {
        return null;
      }
      return { name, duration: { type: 'save-ends' } };
    }

    if (typeof value !== 'object') {
      return null;
    }

    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name) {
      return null;
    }

    const durationSource =
      typeof value.duration === 'string' || (value.duration && typeof value.duration === 'object')
        ? value.duration
        : value.mode ?? value.type ?? value.persist ?? null;

    const durationType = normalizeConditionDurationValue(
      typeof durationSource === 'string'
        ? durationSource
        : typeof durationSource?.type === 'string'
        ? durationSource.type
        : typeof durationSource?.value === 'string'
        ? durationSource.value
        : typeof durationSource?.mode === 'string'
        ? durationSource.mode
        : ''
    );

    const duration = { type: durationType };

    const targetTokenId =
      typeof durationSource?.targetTokenId === 'string'
        ? durationSource.targetTokenId.trim()
        : typeof durationSource?.tokenId === 'string'
        ? durationSource.tokenId.trim()
        : typeof durationSource?.id === 'string'
        ? durationSource.id.trim()
        : typeof value.targetTokenId === 'string'
        ? value.targetTokenId.trim()
        : null;

    const targetTokenName =
      typeof durationSource?.targetTokenName === 'string'
        ? durationSource.targetTokenName.trim()
        : typeof durationSource?.tokenName === 'string'
        ? durationSource.tokenName.trim()
        : typeof value.targetTokenName === 'string'
        ? value.targetTokenName.trim()
        : typeof value.tokenName === 'string'
        ? value.tokenName.trim()
        : '';

    if (duration.type === 'end-of-turn') {
      if (targetTokenId) {
        duration.targetTokenId = targetTokenId;
      }
      if (targetTokenName) {
        duration.targetTokenName = targetTokenName;
      }
    }

    return { name, duration };
  }

  function ensurePlacementCondition(value) {
    const normalized = normalizePlacementCondition(value);
    if (!normalized) {
      return null;
    }

    const condition = { name: normalized.name };
    if (normalized.duration && typeof normalized.duration === 'object') {
      condition.duration = { type: normalized.duration.type };
      if (normalized.duration.targetTokenId) {
        condition.duration.targetTokenId = normalized.duration.targetTokenId;
      }
      if (normalized.duration.targetTokenName) {
        condition.duration.targetTokenName = normalized.duration.targetTokenName;
      }
    } else {
      condition.duration = { type: 'save-ends' };
    }

    return condition;
  }

  function normalizePlacementConditions(value) {
    if (value === null || value === undefined) {
      return [];
    }

    const queue = Array.isArray(value) ? [...value] : [value];
    const normalized = [];
    const seen = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (current === null || current === undefined) {
        continue;
      }
      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      const condition = normalizePlacementCondition(current);
      if (!condition) {
        continue;
      }

      const key = buildConditionKey(condition);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(condition);
    }

    return normalized;
  }

  function ensurePlacementConditions(value) {
    return normalizePlacementConditions(value)
      .map((condition) => ensurePlacementCondition(condition))
      .filter(Boolean);
  }

  function buildConditionKey(condition) {
    if (!condition || typeof condition !== 'object' || typeof condition.name !== 'string') {
      return '';
    }

    const name = condition.name.trim().toLowerCase();
    const type = normalizeConditionDurationValue(condition?.duration?.type ?? '');
    if (type === 'end-of-turn') {
      const targetId =
        typeof condition?.duration?.targetTokenId === 'string'
          ? condition.duration.targetTokenId.trim().toLowerCase()
          : '';
      const targetName =
        typeof condition?.duration?.targetTokenName === 'string'
          ? condition.duration.targetTokenName.trim().toLowerCase()
          : '';
      return `${name}|${type}|${targetId}|${targetName}`;
    }

    return `${name}|${type}`;
  }

  function areConditionsEqual(first, second) {
    const left = ensurePlacementCondition(first);
    const right = ensurePlacementCondition(second);
    if (!left || !right) {
      return false;
    }
    return buildConditionKey(left) === buildConditionKey(right);
  }

  function parseHitPointsNumber(value) {
    const normalized = normalizeHitPointsValue(value);
    if (normalized === '') {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  function calculateHitPointsFillPercentage(value) {
    const hp = normalizePlacementHitPoints(value);
    const maxValue = parseHitPointsNumber(hp.max);
    const currentValue = parseHitPointsNumber(hp.current);

    if (maxValue === null || maxValue <= 0) {
      if (currentValue === null || currentValue <= 0) {
        return 0;
      }
      return 100;
    }

    const safeCurrent = currentValue === null ? maxValue : currentValue;
    const ratio = Math.max(0, Math.min(safeCurrent / maxValue, 1));
    return Math.round(ratio * 100);
  }

  function formatHitPointsDisplay(value) {
    const hp = normalizePlacementHitPoints(value);
    if (hp.current === '' && hp.max === '') {
      return DEFAULT_HP_DISPLAY;
    }
    const currentText =
      hp.current === '' ? (hp.max === '' ? DEFAULT_HP_PLACEHOLDER : hp.max) : hp.current;
    const maxText = hp.max === '' ? DEFAULT_HP_PLACEHOLDER : hp.max;
    return `${currentText} / ${maxText}`;
  }

  function createTokenSettingsMenu() {
    if (!document?.body) {
      return null;
    }

    const element = document.createElement('div');
    element.className = 'vtt-token-settings';
    element.hidden = true;
    element.dataset.open = 'false';
    element.tabIndex = -1;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'false');

    const conditionOptions = ['<option value="">None</option>']
      .concat(CONDITION_NAMES.map((name) => {
        const label = escapeHtml(name);
        return `<option value="${label}">${label}</option>`;
      }))
      .join('');

    const statBlockButtonMarkup = isGmUser()
      ? `
          <button
            type="button"
            class="vtt-token-settings__stat-block"
            data-token-settings-stat-block
            aria-pressed="false"
          >
            Stat Block
          </button>
        `
      : '';

    const hiddenToggleMarkup = isGmUser()
      ? `
        <div class="vtt-token-settings__section">
          <div class="vtt-token-settings__row">
            <label class="vtt-token-settings__toggle">
              <input type="checkbox" data-token-settings-toggle="hidden" />
              <span>Hidden from Players</span>
            </label>
          </div>
        </div>
      `
      : '';

    element.innerHTML = `
      <form class="vtt-token-settings__form" novalidate>
        <header class="vtt-token-settings__header">
          <h2 class="vtt-token-settings__title" data-token-settings-title>Token Settings</h2>
          ${statBlockButtonMarkup}
          <button type="button" class="vtt-token-settings__close" data-token-settings-close aria-label="Close token settings">×</button>
        </header>
        <div class="vtt-token-settings__section vtt-token-settings__section--conditions">
          <div class="vtt-token-settings__condition-grid">
            <label class="vtt-token-settings__condition-label" for="vtt-token-condition-select">Condition</label>
            <select
              id="vtt-token-condition-select"
              class="vtt-token-settings__condition-select"
              data-token-settings-condition-select
            >
              ${conditionOptions}
            </select>
            <div
              class="vtt-token-settings__condition-duration"
              role="radiogroup"
              aria-label="Condition duration"
              data-token-settings-condition-duration-group
            >
              <label class="vtt-token-settings__duration-option">
                <input
                  type="radio"
                  name="token-condition-duration"
                  value="save-ends"
                  data-token-settings-condition-duration
                  aria-label="Save Ends"
                  checked
                />
                <span>SE</span>
              </label>
              <label class="vtt-token-settings__duration-option">
                <input
                  type="radio"
                  name="token-condition-duration"
                  value="end-of-turn"
                  data-token-settings-condition-duration
                  aria-label="End of Turn"
                />
                <span>EOT</span>
              </label>
            </div>
            <button
              type="button"
              class="vtt-token-settings__condition-apply"
              data-token-settings-condition-apply
              aria-label="Apply condition"
            >
              <span aria-hidden="true">✔</span>
            </button>
          </div>
          <ul class="vtt-token-settings__condition-list" data-token-settings-condition-list></ul>
        </div>
        <div class="vtt-token-settings__section">
          <div class="vtt-token-settings__row">
            <label class="vtt-token-settings__toggle">
              <input type="checkbox" data-token-settings-toggle="hitPoints" />
              <span>Hit Points</span>
            </label>
            <div class="vtt-token-settings__hp-wrapper" data-token-settings-field="hitPoints">
              <div class="vtt-token-settings__hp-group">
                <input
                  type="text"
                  data-token-settings-input="hitPointsCurrent"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  inputmode="numeric"
                />
                <span class="vtt-token-settings__hp-separator" aria-hidden="true">/</span>
                <span class="vtt-token-settings__hp-max" data-token-settings-hp-max>${DEFAULT_HP_PLACEHOLDER}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="vtt-token-settings__section">
          <div class="vtt-token-settings__row">
            <label class="vtt-token-settings__toggle">
              <input type="checkbox" data-token-settings-toggle="triggeredAction" />
              <span>Triggered Action</span>
            </label>
          </div>
          <p class="vtt-token-settings__hint" data-token-settings-hint>Click the on-board indicator to toggle its state.</p>
        </div>
        ${hiddenToggleMarkup}
      </form>
    `;
    document.body.appendChild(element);

    const menu = {
      element,
      form: element.querySelector('form'),
      title: element.querySelector('[data-token-settings-title]'),
      statBlockButton: element.querySelector('[data-token-settings-stat-block]'),
      closeButton: element.querySelector('[data-token-settings-close]'),
      showHpToggle: element.querySelector('[data-token-settings-toggle="hitPoints"]'),
      hpField: element.querySelector('[data-token-settings-field="hitPoints"]'),
      hpCurrentInput: element.querySelector('[data-token-settings-input="hitPointsCurrent"]'),
      hpMaxDisplay: element.querySelector('[data-token-settings-hp-max]'),
      triggeredToggle: element.querySelector('[data-token-settings-toggle="triggeredAction"]'),
      conditionSelect: element.querySelector('[data-token-settings-condition-select]'),
      conditionDurationRadios: Array.from(
        element.querySelectorAll('[data-token-settings-condition-duration]')
      ),
      conditionApply: element.querySelector('[data-token-settings-condition-apply]'),
      conditionList: element.querySelector('[data-token-settings-condition-list]'),
      hiddenToggle: element.querySelector('[data-token-settings-toggle="hidden"]'),
    };

    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    menu.closeButton?.addEventListener('click', () => {
      closeTokenSettings();
    });

    if (menu.statBlockButton) {
      menu.statBlockButton.addEventListener('click', handleStatBlockButtonClick);
      menu.statBlockButton.disabled = true;
      menu.statBlockButton.setAttribute('aria-disabled', 'true');
      menu.statBlockButton.classList.add('is-disabled');
    }

    if (menu.conditionSelect) {
      menu.conditionSelect.addEventListener('change', () => {
        updateConditionDurationStyles();
        updateConditionControlState();
      });
    }

    if (menu.conditionDurationRadios?.length) {
      menu.conditionDurationRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
          updateConditionDurationStyles();
          updateConditionControlState();
        });
      });
    }

    if (menu.conditionApply) {
      menu.conditionApply.addEventListener('click', () => {
        handleTokenConditionApply();
      });
    }

    if (menu.conditionList) {
      menu.conditionList.addEventListener('click', handleConditionListClick);
    }

    if (menu.showHpToggle) {
      menu.showHpToggle.addEventListener('change', () => {
        if (!activeTokenSettingsId) {
          return;
        }
        const visible = menu.showHpToggle.checked;
        updatePlacementById(activeTokenSettingsId, (target) => {
          target.showHp = Boolean(visible);
          if (visible) {
            target.hp = ensurePlacementHitPoints(target.hp);
          }
        });
        refreshTokenSettings();
        if (!visible) {
          hitPointsEditSession = null;
        }
      });
    }

    if (menu.hiddenToggle) {
      menu.hiddenToggle.addEventListener('change', () => {
        if (!activeTokenSettingsId) {
          return;
        }

        const hidden = menu.hiddenToggle.checked;
        const updated = updatePlacementById(activeTokenSettingsId, (target) => {
          target.hidden = Boolean(hidden);
        });

        if (!updated) {
          menu.hiddenToggle.checked = !hidden;
          return;
        }

        refreshTokenSettings();
      });
    }

    if (menu.hpCurrentInput) {
      menu.hpCurrentInput.addEventListener('focus', () => {
        if (!activeTokenSettingsId) {
          hitPointsEditSession = null;
          return;
        }
        const snapshot = getActiveHitPointsSnapshot();
        if (!snapshot) {
          hitPointsEditSession = null;
          return;
        }
        hitPointsEditSession = {
          placementId: activeTokenSettingsId,
          originalCurrent: snapshot.current,
          originalMax: snapshot.max,
        };
      });

      menu.hpCurrentInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const committed = commitHitPointsInput(menu.hpCurrentInput.value);
          if (!committed) {
            return;
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          if (hitPointsEditSession) {
            restoreHitPointsInputValue();
            hitPointsEditSession = null;
          }
          menu.hpCurrentInput.blur();
        }
      });

      menu.hpCurrentInput.addEventListener('input', () => {
        if (
          !hitPointsEditSession &&
          activeTokenSettingsId &&
          document.activeElement === menu.hpCurrentInput
        ) {
          const snapshot = getActiveHitPointsSnapshot();
          if (snapshot) {
            hitPointsEditSession = {
              placementId: activeTokenSettingsId,
              originalCurrent: snapshot.current,
              originalMax: snapshot.max,
            };
          }
        }
      });

      menu.hpCurrentInput.addEventListener('blur', () => {
        if (!hitPointsEditSession) {
          return;
        }
        restoreHitPointsInputValue();
        hitPointsEditSession = null;
      });
    }

    if (menu.triggeredToggle) {
      menu.triggeredToggle.addEventListener('change', () => {
        if (!activeTokenSettingsId) {
          return;
        }
        const visible = menu.triggeredToggle.checked;
        updatePlacementById(activeTokenSettingsId, (target) => {
          target.showTriggeredAction = Boolean(visible);
          if (visible && target.triggeredActionReady === undefined) {
            target.triggeredActionReady = true;
          }
        });
        refreshTokenSettings();
      });
    }

    if (menu.form) {
      menu.form.addEventListener('submit', (event) => {
        event.preventDefault();
      });
    }

    return menu;
  }

  function openTokenSettingsById(placementId, clientX, clientY) {
    if (!placementId || !tokenSettingsMenu?.element) {
      return false;
    }

    const placement = getPlacementFromStore(placementId);
    if (!placement) {
      return false;
    }

    activeTokenSettingsId = placementId;
    hitPointsEditSession = null;
    syncTokenSettingsForm(placement);

    tokenSettingsMenu.element.hidden = false;
    tokenSettingsMenu.element.dataset.open = 'true';
    tokenSettingsMenu.element.dataset.placementId = placementId;
    tokenSettingsMenu.element.style.visibility = 'hidden';
    positionTokenSettings(tokenSettingsMenu.element, clientX, clientY);
    tokenSettingsMenu.element.style.visibility = '';

    if (typeof removeTokenSettingsListeners === 'function') {
      removeTokenSettingsListeners();
    }
    removeTokenSettingsListeners = attachTokenSettingsListeners();

    focusTokenSettings();
    return true;
  }

  function closeTokenSettings() {
    if (typeof removeTokenSettingsListeners === 'function') {
      removeTokenSettingsListeners();
      removeTokenSettingsListeners = null;
    }

    dismissConditionPrompt();

    if (tokenSettingsMenu?.element) {
      tokenSettingsMenu.element.hidden = true;
      tokenSettingsMenu.element.dataset.open = 'false';
      tokenSettingsMenu.element.dataset.placementId = '';
    }

    closeMonsterStatBlockViewer({ reason: 'settings-closed' });

    activeTokenSettingsId = null;
    hitPointsEditSession = null;
  }

  function focusTokenSettings() {
    if (!tokenSettingsMenu?.element) {
      return;
    }

    let focusTarget = null;
    if (tokenSettingsMenu.conditionSelect) {
      focusTarget = tokenSettingsMenu.conditionSelect;
    } else if (
      tokenSettingsMenu.showHpToggle?.checked &&
      tokenSettingsMenu.hpCurrentInput &&
      tokenSettingsMenu.hpCurrentInput.disabled === false
    ) {
      focusTarget = tokenSettingsMenu.hpCurrentInput;
    } else if (tokenSettingsMenu.showHpToggle) {
      focusTarget = tokenSettingsMenu.showHpToggle;
    } else if (tokenSettingsMenu.triggeredToggle) {
      focusTarget = tokenSettingsMenu.triggeredToggle;
    } else {
      focusTarget = tokenSettingsMenu.element;
    }

    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (error) {
        focusTarget.focus();
      }
    }
  }

  function attachTokenSettingsListeners() {
    const handlePointerDown = (event) => {
      if (tokenSettingsMenu?.element?.contains(event.target)) {
        return;
      }
      closeTokenSettings();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTokenSettings();
      }
    };

    const handleResize = () => {
      closeTokenSettings();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }

  function positionTokenSettings(element, clientX, clientY) {
    if (!element) {
      return;
    }

    const margin = 12;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const baseX = Number.isFinite(clientX) ? clientX : viewportWidth / 2;
    const baseY = Number.isFinite(clientY) ? clientY : viewportHeight / 2;

    let left = baseX + margin;
    let top = baseY + margin;

    const rect = element.getBoundingClientRect();
    if (left + rect.width + margin > viewportWidth) {
      left = viewportWidth - rect.width - margin;
    }
    if (top + rect.height + margin > viewportHeight) {
      top = viewportHeight - rect.height - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function refreshTokenSettings() {
    if (!activeTokenSettingsId) {
      return;
    }

    const placement = getPlacementFromStore(activeTokenSettingsId);
    if (!placement) {
      closeTokenSettings();
      return;
    }

    syncTokenSettingsForm(placement);
  }

  function syncTokenSettingsForm(placement) {
    if (!tokenSettingsMenu?.element) {
      return;
    }

    const label = tokenLabel(placement);
    if (tokenSettingsMenu.title) {
      tokenSettingsMenu.title.textContent = `${label} Settings`;
    }
    tokenSettingsMenu.element.setAttribute('aria-label', `${label} settings`);

    syncMonsterStatBlockControls(placement);

    syncConditionControls(placement);

    const showHp = Boolean(placement.showHp);
    if (tokenSettingsMenu.showHpToggle) {
      tokenSettingsMenu.showHpToggle.checked = showHp;
    }

    const hitPoints = ensurePlacementHitPoints(placement.hp);

    if (tokenSettingsMenu.hpCurrentInput) {
      if (!isEditingHitPoints() && tokenSettingsMenu.hpCurrentInput.value !== hitPoints.current) {
        tokenSettingsMenu.hpCurrentInput.value = hitPoints.current;
      }
      tokenSettingsMenu.hpCurrentInput.disabled = !showHp;
    }

    if (tokenSettingsMenu.hpMaxDisplay) {
      tokenSettingsMenu.hpMaxDisplay.textContent =
        hitPoints.max === '' ? DEFAULT_HP_PLACEHOLDER : hitPoints.max;
    }

    if (tokenSettingsMenu.hpField) {
      tokenSettingsMenu.hpField.classList.toggle('is-disabled', !showHp);
    }

    if (tokenSettingsMenu.triggeredToggle) {
      tokenSettingsMenu.triggeredToggle.checked = Boolean(placement.showTriggeredAction);
    }

    if (tokenSettingsMenu.hiddenToggle) {
      tokenSettingsMenu.hiddenToggle.checked = Boolean(
        placement.hidden ?? placement.isHidden ?? false
      );
    }
  }

  function handleStatBlockButtonClick() {
    if (!activeTokenSettingsId) {
      return;
    }

    const placement = getPlacementFromStore(activeTokenSettingsId);
    if (!placement?.monster) {
      closeMonsterStatBlockViewer({ placementId: placement?.id ?? null, reason: 'no-monster' });
      return;
    }

    if (activeMonsterStatBlockPlacementId === placement.id) {
      closeMonsterStatBlockViewer({ placementId: placement.id, reason: 'toggle' });
    } else {
      openMonsterStatBlockViewer(placement);
    }
  }

  function openMonsterStatBlockViewer(placement, { refresh = false } = {}) {
    if (!placement?.monster) {
      closeMonsterStatBlockViewer({ placementId: placement?.id ?? null, reason: 'missing-monster' });
      return;
    }

    const label = tokenLabel(placement);
    openMonsterStatBlock(placement.monster, {
      placementId: placement.id,
      tokenName: label,
      onClose: () => handleMonsterStatBlockClosed(placement.id),
      refresh,
    });

    activeMonsterStatBlockPlacementId = placement.id;
    if (!refresh) {
      setStatBlockButtonActive(true);
    }
  }

  function closeMonsterStatBlockViewer({ placementId, reason } = {}) {
    const targetId = placementId ?? activeMonsterStatBlockPlacementId ?? null;
    if (targetId && activeMonsterStatBlockPlacementId === targetId) {
      activeMonsterStatBlockPlacementId = null;
    }

    closeMonsterStatBlock();

    if (activeTokenSettingsId) {
      const placement = getPlacementFromStore(activeTokenSettingsId);
      if (placement) {
        const hasMonster = Boolean(placement.monster);
        setStatBlockButtonEnabled(hasMonster);
        const isActive = hasMonster && activeMonsterStatBlockPlacementId === placement.id;
        setStatBlockButtonActive(isActive);
        return;
      }
    }

    setStatBlockButtonActive(false);
    setStatBlockButtonEnabled(false);
  }

  function handleMonsterStatBlockClosed(placementId) {
    if (placementId && placementId !== activeMonsterStatBlockPlacementId) {
      return;
    }

    if (placementId && activeMonsterStatBlockPlacementId === placementId) {
      activeMonsterStatBlockPlacementId = null;
    }

    if (activeTokenSettingsId) {
      const placement = getPlacementFromStore(activeTokenSettingsId);
      if (placement) {
        setStatBlockButtonEnabled(Boolean(placement.monster));
        const isActive = Boolean(
          placement.monster && activeMonsterStatBlockPlacementId === placement.id
        );
        setStatBlockButtonActive(isActive);
        return;
      }
    }

    setStatBlockButtonActive(false);
  }

  function syncMonsterStatBlockControls(placement) {
    if (!tokenSettingsMenu?.statBlockButton) {
      return;
    }

    const hasMonster = Boolean(placement?.monster);
    setStatBlockButtonEnabled(hasMonster);

    const isActive = hasMonster && activeMonsterStatBlockPlacementId === placement?.id;
    setStatBlockButtonActive(isActive);

    if (isActive && placement) {
      openMonsterStatBlockViewer(placement, { refresh: true });
    } else if (!hasMonster && activeMonsterStatBlockPlacementId === placement?.id) {
      closeMonsterStatBlockViewer({ placementId: placement.id, reason: 'missing-monster' });
    }
  }

  function setStatBlockButtonEnabled(enabled) {
    if (!tokenSettingsMenu?.statBlockButton) {
      return;
    }

    tokenSettingsMenu.statBlockButton.disabled = !enabled;
    tokenSettingsMenu.statBlockButton.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    tokenSettingsMenu.statBlockButton.classList.toggle('is-disabled', !enabled);
  }

  function setStatBlockButtonActive(active) {
    if (!tokenSettingsMenu?.statBlockButton) {
      return;
    }

    tokenSettingsMenu.statBlockButton.classList.toggle('is-active', Boolean(active));
    tokenSettingsMenu.statBlockButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function syncConditionControls(placement) {
    if (!tokenSettingsMenu) {
      return;
    }

    const conditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);
    const select = tokenSettingsMenu.conditionSelect;
    if (select) {
      const previousValue = typeof select.value === 'string' ? select.value : '';
      const options = Array.from(select.options ?? []);
      options
        .filter((option) => option?.dataset?.dynamicConditionOption === 'true')
        .forEach((option) => option.remove());

      const staticNames = new Set(CONDITION_NAMES.map((name) => name.trim()));
      const dynamicNames = Array.from(
        new Set(
          conditions
            .map((condition) => (condition && typeof condition.name === 'string' ? condition.name.trim() : ''))
            .filter(Boolean)
        )
      );

      dynamicNames
        .filter((name) => !staticNames.has(name))
        .forEach((name) => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          option.dataset.dynamicConditionOption = 'true';
          select.appendChild(option);
        });

      if (previousValue && !Array.from(select.options ?? []).some((option) => option.value === previousValue)) {
        select.value = '';
      }
    }

    ensureDefaultConditionDuration();
    renderConditionList(conditions);
    updateConditionDurationStyles();
    updateConditionControlState();
  }

  function ensureDefaultConditionDuration(radios = tokenSettingsMenu?.conditionDurationRadios ?? []) {
    let hasCheckedRadio = false;
    radios.forEach((radio) => {
      if (isInputElement(radio) && radio.checked) {
        hasCheckedRadio = true;
      }
    });

    if (!hasCheckedRadio) {
      const firstRadio = radios.find((radio) => isInputElement(radio));
      if (firstRadio && !firstRadio.checked) {
        firstRadio.checked = true;
      }
    }
  }

  function updateConditionDurationStyles(radios = tokenSettingsMenu?.conditionDurationRadios ?? []) {
    radios.forEach((radio) => {
      const label = radio?.closest('label');
      if (!label) {
        return;
      }
      label.classList.toggle('is-selected', Boolean(radio?.checked));
    });
  }

  function renderConditionList(conditions = []) {
    const list = tokenSettingsMenu?.conditionList;
    if (!list) {
      return;
    }

    Array.from(list.querySelectorAll('.vtt-token-settings__condition-name')).forEach((node) => {
      detachConditionTooltip(node);
    });
    list.innerHTML = '';

    conditions.forEach((condition, index) => {
      if (!condition || typeof condition.name !== 'string') {
        return;
      }
      const name = condition.name.trim();
      if (!name) {
        return;
      }

      const item = document.createElement('li');
      item.className = 'vtt-token-settings__condition-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'vtt-token-settings__condition-name';
      nameSpan.textContent = name;
      nameSpan.dataset.tokenSettingsConditionName = name;
      configureConditionTooltip(nameSpan, condition, { delay: 300 });
      item.appendChild(nameSpan);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'vtt-token-settings__condition-remove';
      removeButton.dataset.tokenSettingsConditionRemove = String(index);
      removeButton.setAttribute('aria-label', `Remove ${name}`);
      removeButton.textContent = '×';
      item.appendChild(removeButton);

      list.appendChild(item);
    });
  }

  function normalizeConditionDurationValue(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
      return 'save-ends';
    }
    if (normalized.includes('save') || normalized === 'se') {
      return 'save-ends';
    }
    if (normalized.includes('eot') || normalized.includes('end')) {
      return 'end-of-turn';
    }
    return 'save-ends';
  }

  function getConditionDurationType(condition) {
    if (!condition || typeof condition !== 'object') {
      return 'save-ends';
    }
    const source = condition.duration ?? condition.mode ?? condition.type ?? null;
    if (typeof source === 'string') {
      return normalizeConditionDurationValue(source);
    }
    if (source && typeof source.type === 'string') {
      return normalizeConditionDurationValue(source.type);
    }
    return normalizeConditionDurationValue('');
  }

  function getSelectedConditionDuration() {
    if (!tokenSettingsMenu?.conditionDurationRadios?.length) {
      return 'save-ends';
    }
    const checked = tokenSettingsMenu.conditionDurationRadios.find(
      (radio) => isInputElement(radio) && radio.checked
    );
    return normalizeConditionDurationValue(checked?.value);
  }

  function updateConditionControlState() {
    if (!tokenSettingsMenu) {
      return;
    }

    const select = tokenSettingsMenu.conditionSelect;
    const selection = typeof select?.value === 'string' ? select.value.trim() : '';
    const hasSelection = selection !== '';

    const placement = activeTokenSettingsId ? getPlacementFromStore(activeTokenSettingsId) : null;
    const existingConditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);
    const hasExistingConditions = existingConditions.length > 0;

    tokenSettingsMenu.conditionDurationRadios?.forEach((radio) => {
      if (isInputElement(radio)) {
        radio.disabled = !hasSelection;
      }
    });

    if (tokenSettingsMenu.conditionApply) {
      tokenSettingsMenu.conditionApply.disabled = !hasSelection && !hasExistingConditions;
    }
  }

  function handleTokenConditionApply() {
    if (!activeTokenSettingsId) {
      return;
    }

    const select = tokenSettingsMenu?.conditionSelect ?? null;
    const rawValue = typeof select?.value === 'string' ? select.value : '';
    const conditionName = rawValue.trim();

    if (!conditionName) {
      applyConditionToPlacement(activeTokenSettingsId, null);
      return;
    }

    const duration = getSelectedConditionDuration();
    if (duration === 'save-ends') {
      applyConditionToPlacement(activeTokenSettingsId, {
        name: conditionName,
        duration: { type: 'save-ends' },
      });
      return;
    }

    promptConditionTargetSelection(activeTokenSettingsId, conditionName);
  }

  function applyConditionToPlacement(placementId, condition) {
    if (!placementId) {
      return false;
    }

    const normalized = ensurePlacementCondition(condition);
    let didChange = false;
    const updated = updatePlacementById(placementId, (target) => {
      const conditions = ensurePlacementConditions(target?.conditions ?? target?.condition ?? null);
      const hadConditions = conditions.length > 0;

      if (normalized) {
        const hasDuplicate = conditions.some((existing) => areConditionsEqual(existing, normalized));
        if (hasDuplicate) {
          return;
        }
        conditions.push(normalized);
        didChange = true;
      } else if (hadConditions || target.conditions !== undefined || target.condition !== undefined) {
        conditions.length = 0;
        didChange = true;
      } else {
        return;
      }

      if (conditions.length) {
        target.conditions = conditions;
        target.condition = conditions[0];
      } else {
        if (target.conditions !== undefined) {
          delete target.conditions;
        }
        if (target.condition !== undefined) {
          delete target.condition;
        }
      }
    });

    if (updated && didChange) {
      refreshTokenSettings();
      if (placementId === activeTokenSettingsId) {
        resetConditionControls();
      }
    }

    return updated && didChange;
  }

  function clearEndOfTurnConditionsForTarget(targetTokenId) {
    if (!targetTokenId) {
      return [];
    }

    const placements = getPlacementsForActiveScene();
    if (!Array.isArray(placements) || placements.length === 0) {
      return [];
    }

    const cleared = [];

    placements.forEach((placement) => {
      if (!placement || typeof placement !== 'object') {
        return;
      }

      const placementId = typeof placement.id === 'string' ? placement.id : '';
      if (!placementId) {
        return;
      }

      const conditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);
      if (!conditions.length) {
        return;
      }

      const removed = [];
      conditions.forEach((condition) => {
        if (getConditionDurationType(condition) !== 'end-of-turn') {
          return;
        }
        const linkedId =
          typeof condition?.duration?.targetTokenId === 'string' ? condition.duration.targetTokenId : '';
        if (linkedId === targetTokenId) {
          removed.push(condition);
        }
      });

      if (!removed.length) {
        return;
      }

      const updated = updatePlacementById(placementId, (target) => {
        const current = ensurePlacementConditions(target?.conditions ?? target?.condition ?? null);
        const filtered = current.filter((condition) => {
          if (getConditionDurationType(condition) !== 'end-of-turn') {
            return true;
          }
          const candidateId =
            typeof condition?.duration?.targetTokenId === 'string' ? condition.duration.targetTokenId : '';
          return candidateId !== targetTokenId;
        });

        if (filtered.length) {
          target.conditions = filtered;
          target.condition = filtered[0];
        } else {
          if (target.conditions !== undefined) {
            delete target.conditions;
          }
          if (target.condition !== undefined) {
            delete target.condition;
          }
        }
      });

      if (updated) {
        cleared.push({
          placementId,
          tokenName: tokenLabel(placement),
          conditions: removed,
        });

        if (placementId === activeTokenSettingsId) {
          resetConditionControls();
        }
      }
    });

    if (cleared.length) {
      refreshTokenSettings();
    }

    return cleared;
  }

  function handleConditionListClick(event) {
    const button = event.target.closest('[data-token-settings-condition-remove]');
    if (!button) {
      return;
    }

    event.preventDefault();

    if (!activeTokenSettingsId) {
      return;
    }

    const indexValue = button.dataset.tokenSettingsConditionRemove;
    const index = Number.parseInt(indexValue, 10);
    if (!Number.isInteger(index) || index < 0) {
      return;
    }

    removeConditionFromPlacement(activeTokenSettingsId, index);
  }

  function removeConditionFromPlacement(placementId, index) {
    if (!placementId || !Number.isInteger(index) || index < 0) {
      return false;
    }

    const placement = getPlacementFromStore(placementId);
    const existingConditions = ensurePlacementConditions(placement?.conditions ?? placement?.condition ?? null);
    if (index < 0 || index >= existingConditions.length) {
      return false;
    }

    let didChange = false;
    const updated = updatePlacementById(placementId, (target) => {
      const conditions = ensurePlacementConditions(target?.conditions ?? target?.condition ?? null);
      conditions.splice(index, 1);
      didChange = true;

      if (conditions.length) {
        target.conditions = conditions;
        target.condition = conditions[0];
      } else {
        if (target.conditions !== undefined) {
          delete target.conditions;
        }
        if (target.condition !== undefined) {
          delete target.condition;
        }
      }
    });

    if (updated && didChange) {
      refreshTokenSettings();
      if (placementId === activeTokenSettingsId) {
        resetConditionControls();
      }
    }

    return updated && didChange;
  }

  function resetConditionControls() {
    if (!tokenSettingsMenu) {
      return;
    }

    if (tokenSettingsMenu.conditionSelect) {
      tokenSettingsMenu.conditionSelect.value = '';
    }

    ensureDefaultConditionDuration();
    updateConditionDurationStyles();
    updateConditionControlState();
  }

  function promptConditionTargetSelection(placementId, conditionName) {
    if (!placementId || !conditionName) {
      return;
    }

    dismissConditionPrompt();

    const normalizedName = typeof conditionName === 'string' ? conditionName.trim() : '';
    if (!normalizedName) {
      return;
    }

    const placements = getPlacementsForActiveScene();
    if (!Array.isArray(placements) || placements.length === 0) {
      return;
    }

    closeTokenSettings();

    let cleanedUp = false;
    let bannerId = null;

    const handlePointerDown = (event) => {
      if (event.button === 2) {
        return;
      }
      if (event.button !== 0) {
        return;
      }

      const tokenElement = event.target instanceof HTMLElement ? event.target.closest('[data-placement-id]') : null;
      if (!tokenElement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const targetId = tokenElement.dataset?.placementId || '';
      if (!targetId) {
        return;
      }

      const targetPlacement =
        getPlacementFromStore(targetId) ?? placements.find((item) => item?.id === targetId) ?? null;
      const targetName = targetPlacement ? tokenLabel(targetPlacement) : tokenElement.dataset?.tokenName || '';

      applyConditionToPlacement(placementId, {
        name: normalizedName,
        duration: {
          type: 'end-of-turn',
          targetTokenId: targetId,
          targetTokenName: targetName,
        },
      });

      if (bannerId) {
        dismissConditionBanner(bannerId);
      }
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (bannerId) {
          dismissConditionBanner(bannerId);
        }
      }
    };

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      mapSurface.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeydown, true);
      if (activeConditionPrompt && activeConditionPrompt.bannerId === bannerId) {
        activeConditionPrompt = null;
      }
    };

    bannerId = showConditionBanner("Select the token whose turn ends your condition.", {
      tone: 'prompt',
      closeLabel: 'Cancel condition targeting',
      onDismiss: cleanup,
    });

    if (!bannerId) {
      cleanup();
      return;
    }

    mapSurface.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeydown, true);

    activeConditionPrompt = { bannerId, cleanup };
  }

  function dismissConditionPrompt() {
    if (!activeConditionPrompt) {
      return;
    }
    const prompt = activeConditionPrompt;
    if (prompt.bannerId && conditionBannerRegistry.has(prompt.bannerId)) {
      dismissConditionBanner(prompt.bannerId);
    } else if (typeof prompt.cleanup === 'function') {
      prompt.cleanup();
    }
    activeConditionPrompt = null;
  }

  function normalizeOverlayDraft(raw = {}) {
    if (!raw || typeof raw !== 'object') {
      return createEmptyOverlayState();
    }

    const overlay = createEmptyOverlayState();
    const mapUrl = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
    if (mapUrl) {
      overlay.mapUrl = mapUrl;
    }

    const layerSource = Array.isArray(raw.layers)
      ? raw.layers
      : Array.isArray(raw.items)
      ? raw.items
      : [];

    overlay.layers = layerSource
      .map((entry, index) => normalizeOverlayLayer(entry, index))
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

    const legacyMask = normalizeOverlayMask(raw.mask ?? null);
    if (!overlay.layers.length && maskHasMeaningfulOverlayContent(legacyMask)) {
      const legacyLayer = normalizeOverlayLayer(
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

  function ensureScenePlacementDraft(draft, sceneId) {
    const boardDraft = ensureBoardStateDraft(draft);

    if (!Array.isArray(boardDraft.placements[sceneId])) {
      boardDraft.placements[sceneId] = [];
    }

    return boardDraft.placements[sceneId];
  }

  function ensureSceneTemplateDraft(draft, sceneId) {
    const boardDraft = ensureBoardStateDraft(draft);

    if (!Array.isArray(boardDraft.templates[sceneId])) {
      boardDraft.templates[sceneId] = [];
    }

    return boardDraft.templates[sceneId];
  }

  function ensureBoardStateDraft(draft) {
    if (!draft.boardState || typeof draft.boardState !== 'object') {
      draft.boardState = {
        activeSceneId: null,
        mapUrl: null,
        placements: {},
        sceneState: {},
        templates: {},
        overlay: createEmptyOverlayState(),
      };
    }

    if (!draft.boardState.placements || typeof draft.boardState.placements !== 'object') {
      draft.boardState.placements = {};
    }

    if (!draft.boardState.sceneState || typeof draft.boardState.sceneState !== 'object') {
      draft.boardState.sceneState = {};
    }

    if (!draft.boardState.templates || typeof draft.boardState.templates !== 'object') {
      draft.boardState.templates = {};
    }

    if (!draft.boardState.overlay || typeof draft.boardState.overlay !== 'object') {
      draft.boardState.overlay = createEmptyOverlayState();
    } else {
      draft.boardState.overlay = normalizeOverlayDraft(draft.boardState.overlay);
    }

    return draft.boardState;
  }

  function ensureBoardMetadataDraft(boardDraft) {
    if (!boardDraft || typeof boardDraft !== 'object') {
      return {};
    }

    if (!boardDraft.metadata || typeof boardDraft.metadata !== 'object') {
      boardDraft.metadata = {};
    }

    if (
      boardDraft.meta &&
      typeof boardDraft.meta === 'object' &&
      boardDraft.meta !== boardDraft.metadata
    ) {
      Object.assign(boardDraft.metadata, boardDraft.meta);
    }

    boardDraft.meta = boardDraft.metadata;
    return boardDraft.metadata;
  }

  function ensureSceneStateDraftEntry(draft, sceneId) {
    const boardDraft = ensureBoardStateDraft(draft);
    const key = typeof sceneId === 'string' ? sceneId : String(sceneId ?? '');
    if (!key) {
      return boardDraft.sceneState;
    }

    if (!boardDraft.sceneState[key] || typeof boardDraft.sceneState[key] !== 'object') {
      boardDraft.sceneState[key] = {};
    }

    if (!boardDraft.sceneState[key].grid || typeof boardDraft.sceneState[key].grid !== 'object') {
      boardDraft.sceneState[key].grid = {
        size: 64,
        locked: false,
        visible: true,
      };
    }

    boardDraft.sceneState[key].overlay = normalizeOverlayDraft(
      boardDraft.sceneState[key].overlay ?? {}
    );

    return boardDraft.sceneState[key];
  }


function createOverlayTool(uploadsEndpoint) {
  if (!mapOverlay || !mapSurface) {
    return {
      toggle() {},
      reset() {},
      notifyGridChanged() {},
      notifyMapState() {},
      notifyOverlayMaskChange() {},
    };
  }

  const editor = document.createElement('div');
  editor.className = 'vtt-overlay-editor';
  editor.hidden = true;

  const toolbar = document.createElement('div');
  toolbar.className = 'vtt-overlay-editor__toolbar';
  toolbar.addEventListener('pointerdown', handleToolbarPointerDown);
  toolbar.addEventListener('pointermove', handleToolbarPointerMove);
  toolbar.addEventListener('pointerup', handleToolbarPointerUp);
  toolbar.addEventListener('pointercancel', handleToolbarPointerCancel);
  toolbar.addEventListener('lostpointercapture', handleToolbarPointerCancel);

  const dragHandle = document.createElement('div');
  dragHandle.className = 'vtt-overlay-editor__drag-handle';

  const controls = document.createElement('div');
  controls.className = 'vtt-overlay-editor__controls';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'vtt-overlay-editor__btn';
  closeButton.textContent = 'Close Shape';

  const commitButton = document.createElement('button');
  commitButton.type = 'button';
  commitButton.className = 'vtt-overlay-editor__btn vtt-overlay-editor__btn--primary';
  commitButton.textContent = 'Apply Mask';

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'vtt-overlay-editor__btn';
  resetButton.textContent = 'Reset';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className =
    'vtt-overlay-editor__btn vtt-overlay-editor__btn--danger vtt-overlay-editor__btn--full';
  clearButton.textContent = 'Delete Overlay';

  controls.append(closeButton, commitButton, resetButton, clearButton);

  const statusLabel = document.createElement('p');
  statusLabel.className = 'vtt-overlay-editor__status';
  statusLabel.hidden = true;

  toolbar.append(dragHandle, controls, statusLabel);
  editor.append(toolbar);

  const handlesLayer = document.createElement('div');
  handlesLayer.className = 'vtt-overlay-editor__handles';
  editor.append(handlesLayer);

  mapOverlay.append(editor);

  const DEFAULT_STATUS = '';
  const CLOSED_STATUS = 'Shape closed. Apply the mask to commit your changes.';
  const INSUFFICIENT_POINTS_STATUS =
    'A closed shape needs at least three valid points before starting another one.';

  let isActive = false;
  let nodes = [];
  let isClosed = false;
  let additionalPolygons = [];
  let persistedPrimaryPolygon = null;
  let dragState = null;
  let toolbarPosition = null;
  let toolbarDragState = null;
  let toolbarMeasurementFrame = null;
  let toolbarDimensions = { width: 0, height: 0 };
  let persistedOverlay = createEmptyOverlayState();
  let persistedMask = createEmptyOverlayMask();
  let persistedSignature = overlayMaskSignature(persistedMask);
  let persistedMapUrl = null;
  let overlayHiddenSnapshot = null;

  function getPersistedActiveLayer() {
    const layers = Array.isArray(persistedOverlay.layers) ? persistedOverlay.layers : [];
    if (!layers.length) {
      const created = createOverlayLayer(`Overlay ${layers.length + 1}`, layers);
      persistedOverlay.layers = [created];
      persistedOverlay.activeLayerId = created.id;
      return created;
    }

    const activeId = persistedOverlay.activeLayerId;
    let layer = layers.find((entry) => entry.id === activeId);
    if (!layer) {
      layer = layers[0];
      persistedOverlay.activeLayerId = layer.id;
    }
    return layer;
  }

  function ensurePersistedActiveLayer() {
    const layer = getPersistedActiveLayer();
    if (!persistedOverlay.layers.includes(layer)) {
      persistedOverlay.layers.push(layer);
    }
    return layer;
  }

  function applyOverlayDraftToDom(activeMaskOverride = null, options = {}) {
    syncOverlayLayer(persistedOverlay);
    const layers = Array.isArray(persistedOverlay.layers) ? persistedOverlay.layers : [];
    const activeId = persistedOverlay.activeLayerId;
    layers.forEach((layer) => {
      if (!layer || typeof layer !== 'object') {
        return;
      }

      const baseMask = layer.id === activeId && activeMaskOverride ? activeMaskOverride : layer.mask;
      const allowDuringEditing =
        options?.allowDuringEditing === true && layer.id === activeId;
      applyOverlayMaskToLayer(layer.id, baseMask ?? {}, { allowDuringEditing });
    });
  }

  function cloneOverlayPolygon(polygon) {
    if (!polygon || typeof polygon !== 'object') {
      return null;
    }

    const points = Array.isArray(polygon.points)
      ? polygon.points
          .map((point) => {
            const column = Number(point?.column ?? 0);
            const row = Number(point?.row ?? 0);
            if (!Number.isFinite(column) || !Number.isFinite(row)) {
              return null;
            }
            return {
              column: roundToPrecision(column, 4),
              row: roundToPrecision(row, 4),
            };
          })
          .filter(Boolean)
      : [];

    if (points.length < 3) {
      return null;
    }

    return { points };
  }

  function scheduleToolbarMeasurement() {
    if (!mapOverlay || !toolbar) {
      return;
    }
    const win = typeof window !== 'undefined' ? window : null;
    if (toolbarMeasurementFrame !== null && typeof win?.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(toolbarMeasurementFrame);
      toolbarMeasurementFrame = null;
    }

    const measure = () => {
      toolbarMeasurementFrame = null;
      measureToolbarPosition();
    };

    if (typeof win?.requestAnimationFrame === 'function') {
      toolbarMeasurementFrame = win.requestAnimationFrame(measure);
    } else {
      measure();
    }
  }

  function measureToolbarPosition() {
    if (!mapOverlay || !toolbar) {
      return;
    }

    const overlayRect = mapOverlay.getBoundingClientRect?.();
    const toolbarRect = toolbar.getBoundingClientRect?.();
    if (!overlayRect || !toolbarRect) {
      return;
    }

    const scale =
      Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;

    const overlayWidth = Number.isFinite(overlayRect.width)
      ? overlayRect.width / scale
      : 0;
    const overlayHeight = Number.isFinite(overlayRect.height)
      ? overlayRect.height / scale
      : 0;
    if (overlayWidth <= 0 || overlayHeight <= 0) {
      return;
    }

    const toolbarWidth = Number.isFinite(toolbarRect.width)
      ? toolbarRect.width / scale
      : toolbarDimensions.width;
    const toolbarHeight = Number.isFinite(toolbarRect.height)
      ? toolbarRect.height / scale
      : toolbarDimensions.height;

    toolbarDimensions = {
      width: Math.max(0, toolbarWidth),
      height: Math.max(0, toolbarHeight),
    };

    let nextX;
    let nextY;

    if (toolbarPosition) {
      nextX = toolbarPosition.x;
      nextY = toolbarPosition.y;
    } else {
      const rawX = toolbarRect.left - overlayRect.left;
      const rawY = toolbarRect.top - overlayRect.top;
      nextX = Number.isFinite(rawX) ? rawX / scale : 0;
      nextY = Number.isFinite(rawY) ? rawY / scale : 0;
    }

    const maxX = Math.max(0, overlayWidth - toolbarDimensions.width);
    const maxY = Math.max(0, overlayHeight - toolbarDimensions.height);

    nextX = clamp(Number.isFinite(nextX) ? nextX : 0, 0, maxX);
    nextY = clamp(Number.isFinite(nextY) ? nextY : 0, 0, maxY);

    applyToolbarPosition(nextX, nextY);
  }

  function applyToolbarPosition(x, y) {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    toolbarPosition = { x: safeX, y: safeY };
    editor.style.setProperty('--overlay-toolbar-x', `${safeX}px`);
    editor.style.setProperty('--overlay-toolbar-y', `${safeY}px`);
  }

  function ensureToolbarPosition() {
    if (!mapOverlay || !toolbar) {
      return;
    }
    scheduleToolbarMeasurement();
  }

  function handleToolbarPointerDown(event) {
    if (!isActive) {
      return;
    }
    if (event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch') {
      return;
    }
    if (event.target && event.target.closest('.vtt-overlay-editor__btn')) {
      return;
    }

    const handleTarget = event.target?.closest('.vtt-overlay-editor__drag-handle');
    if (!handleTarget) {
      return;
    }

    if (!mapOverlay) {
      return;
    }

    const overlayRect = mapOverlay.getBoundingClientRect?.();
    const toolbarRect = toolbar.getBoundingClientRect?.();
    if (!overlayRect || !toolbarRect) {
      return;
    }

    const scale =
      Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;

    toolbarDimensions = {
      width: Number.isFinite(toolbarRect.width)
        ? toolbarRect.width / scale
        : toolbarDimensions.width,
      height: Number.isFinite(toolbarRect.height)
        ? toolbarRect.height / scale
        : toolbarDimensions.height,
    };

    toolbarDragState = {
      pointerId: event.pointerId,
      offsetX: (event.clientX - toolbarRect.left) / scale,
      offsetY: (event.clientY - toolbarRect.top) / scale,
      width: toolbarDimensions.width,
      height: toolbarDimensions.height,
      handle: handleTarget,
    };

    try {
      toolbar.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore capture errors.
    }

    if (handleTarget && typeof handleTarget.setPointerCapture === 'function') {
      try {
        handleTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture errors.
      }
    }

    toolbar.classList.add('is-dragging');
    handleTarget?.classList.add('is-dragging');
    event.preventDefault();
    event.stopPropagation();
  }

  function handleToolbarPointerMove(event) {
    if (!toolbarDragState || event.pointerId !== toolbarDragState.pointerId) {
      return;
    }

    const overlayRect = mapOverlay.getBoundingClientRect?.();
    if (!overlayRect) {
      return;
    }

    const scale =
      Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;

    const overlayWidth = Number.isFinite(overlayRect.width) ? overlayRect.width / scale : 0;
    const overlayHeight = Number.isFinite(overlayRect.height) ? overlayRect.height / scale : 0;
    if (overlayWidth <= 0 || overlayHeight <= 0) {
      return;
    }

    const maxX = Math.max(0, overlayWidth - toolbarDragState.width);
    const maxY = Math.max(0, overlayHeight - toolbarDragState.height);

    const proposedX =
      (event.clientX - overlayRect.left) / scale - toolbarDragState.offsetX;
    const proposedY =
      (event.clientY - overlayRect.top) / scale - toolbarDragState.offsetY;

    const nextX = clamp(Number.isFinite(proposedX) ? proposedX : 0, 0, maxX);
    const nextY = clamp(Number.isFinite(proposedY) ? proposedY : 0, 0, maxY);

    applyToolbarPosition(nextX, nextY);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleToolbarPointerUp(event) {
    if (!toolbarDragState || event.pointerId !== toolbarDragState.pointerId) {
      return;
    }

    endToolbarDrag(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleToolbarPointerCancel(event) {
    if (toolbarDragState && event.pointerId === toolbarDragState.pointerId) {
      endToolbarDrag(event.pointerId);
    }
  }

  function endToolbarDrag(pointerId) {
    try {
      toolbar.releasePointerCapture?.(pointerId);
    } catch (error) {
      // Ignore release errors.
    }

    if (toolbarDragState?.handle) {
      try {
        toolbarDragState.handle.releasePointerCapture?.(pointerId);
      } catch (error) {
        // Ignore release errors.
      }
      toolbarDragState.handle.classList.remove('is-dragging');
    }

    toolbarDragState = null;
    toolbar.classList.remove('is-dragging');
    scheduleToolbarMeasurement();
  }

  function toggle() {
    if (isActive) {
      deactivate();
    } else {
      activate();
    }
  }

  function isEditingLayer(layerId = null) {
    if (!isActive) {
      return false;
    }

    const activeLayer = getPersistedActiveLayer();
    if (!activeLayer) {
      return false;
    }

    if (typeof layerId === 'string' && layerId.trim()) {
      return activeLayer.id === layerId.trim();
    }

    return true;
  }

  function editLayer(layerId) {
    if (typeof layerId === 'string' && layerId.trim()) {
      persistedOverlay.activeLayerId = layerId.trim();
      const activeLayer = getPersistedActiveLayer();
      persistedMask = normalizeOverlayMask(activeLayer?.mask ?? {});
      persistedSignature = overlayMaskSignature(persistedMask);
      setNodesFromMask(persistedMask);
      renderHandles();
      applyPreviewMask();
      updateControls();
    }

    if (!isActive) {
      activate();
    }

    syncCutoutToggleButtons();
  }

  function activate() {
    if (!isGmUser()) {
      return;
    }

    ensurePersistedActiveLayer();
    overlayHiddenSnapshot = mapOverlay.hasAttribute('hidden');
    mapOverlay.removeAttribute('hidden');
    mapOverlay.hidden = false;
    if (mapSurface) {
      mapSurface.dataset.overlayEditing = 'true';
    }
    isActive = true;
    editor.hidden = false;
    editor.dataset.interactive = 'true';
    mapOverlay.dataset.overlayEditing = 'true';
    attachOverlayDropProxies();
    setButtonState(true);
    setStatus(DEFAULT_STATUS);
    renderHandles();
    applyPreviewMask();
    updateControls();
    ensureToolbarPosition();
  }

  function deactivate() {
    isActive = false;
    editor.hidden = true;
    delete editor.dataset.interactive;
    if (mapSurface) {
      delete mapSurface.dataset.overlayEditing;
    }
    delete mapOverlay.dataset.overlayEditing;
    detachOverlayDropProxies();
    dragState = null;
    setButtonState(false);
    setStatus('');
    applyOverlayDraftToDom();
    updateControls();
    if (!hasOverlayMap() && overlayHiddenSnapshot) {
      mapOverlay.hidden = true;
    }
    overlayHiddenSnapshot = null;
  }

  function resetTool() {
    deactivate();
    nodes = [];
    isClosed = false;
    additionalPolygons = [];
    persistedPrimaryPolygon = null;
    dragState = null;
    persistedOverlay = createEmptyOverlayState();
    persistedMask = createEmptyOverlayMask();
    persistedSignature = overlayMaskSignature(persistedMask);
    persistedMapUrl = null;
    handlesLayer.innerHTML = '';
    applyOverlayDraftToDom();
    ensureToolbarPosition();
  }

  function notifyGridChanged() {
    if (!isActive && nodes.length === 0) {
      return;
    }
    renderHandles();
    ensureToolbarPosition();
  }

  function notifyMapState() {
    const state = boardApi.getState?.();
    if (!state) {
      return;
    }

    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      notifyOverlayMaskChange(null);
      return;
    }

    const overlayEntry = resolveSceneOverlayState(state.boardState ?? {}, activeSceneId);
    notifyOverlayMaskChange(overlayEntry ?? null);
    syncCutoutToggleButtons();
    ensureToolbarPosition();
  }

  function notifyOverlayMaskChange(overlayEntry) {
    const normalized = normalizeOverlayDraft(overlayEntry ?? {});
    persistedOverlay = normalized;

    const activeLayer = getPersistedActiveLayer();
    persistedMapUrl = activeLayer?.mapUrl ?? null;
    const normalizedMask = normalizeOverlayMask(activeLayer?.mask ?? {});
    const signature = overlayMaskSignature(normalizedMask);

    if (signature === persistedSignature) {
      if (!isActive && nodes.length === 0 && additionalPolygons.length === 0) {
        setNodesFromMask(normalizedMask);
        renderHandles();
      }
      applyPreviewMask();
      updateControls();
      syncCutoutToggleButtons();
      return;
    }

    persistedMask = normalizedMask;
    persistedSignature = signature;

    if (!isActive || !isDirty()) {
      setNodesFromMask(persistedMask);
      renderHandles();
    }
    applyPreviewMask();
    updateControls();
    syncCutoutToggleButtons();
  }

  function setNodesFromMask(mask) {
    const normalized = normalizeOverlayMask(mask);
    const polygons = Array.isArray(normalized.polygons) ? normalized.polygons : [];

    nodes = [];
    isClosed = false;
    persistedPrimaryPolygon = null;
    additionalPolygons = [];

    if (polygons.length === 0) {
      return;
    }

    const primaryClone = cloneOverlayPolygon(polygons[0]);
    if (primaryClone) {
      persistedPrimaryPolygon = primaryClone;
      nodes = primaryClone.points.map((point) => ({ column: point.column, row: point.row }));
      isClosed = nodes.length >= 3;
    }

    additionalPolygons = polygons
      .slice(1)
      .map((polygon) => cloneOverlayPolygon(polygon))
      .filter(Boolean);
  }

  function renderHandles() {
    handlesLayer.innerHTML = '';

    if (!isActive) {
      return;
    }

    const fragment = document.createDocumentFragment();

    const appendPolygonHandles = (points, options = {}) => {
      const { closed = false, readonly = false } = options;
      if (!Array.isArray(points) || points.length === 0) {
        return;
      }

      const createSegment = (start, end) => {
        const element = document.createElement('div');
        element.className = 'vtt-overlay-editor__segment';
        if (readonly) {
          element.classList.add('vtt-overlay-editor__segment--readonly');
        }
        const startLocal = gridPointToOverlayLocal(start);
        const endLocal = gridPointToOverlayLocal(end);
        const dx = endLocal.x - startLocal.x;
        const dy = endLocal.y - startLocal.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        element.style.width = `${length}px`;
        element.style.transform = `translate(${startLocal.x}px, ${startLocal.y}px) rotate(${angle}rad)`;
        fragment.append(element);
      };

      for (let index = 0; index < points.length - 1; index += 1) {
        createSegment(points[index], points[index + 1]);
      }

      if (closed && points.length >= 3) {
        createSegment(points[points.length - 1], points[0]);
      }

      points.forEach((point, index) => {
        const element = document.createElement('div');
        element.className = 'vtt-overlay-editor__node';
        if (readonly) {
          element.classList.add('vtt-overlay-editor__node--readonly');
        } else {
          element.dataset.index = String(index);
          if (index === 0) {
            element.classList.add('is-start');
          }
        }

        const local = gridPointToOverlayLocal(point);
        element.style.left = `${local.x}px`;
        element.style.top = `${local.y}px`;

        if (!readonly) {
          element.addEventListener('contextmenu', (event) => {
            event.preventDefault();
          });
          element.addEventListener('pointerdown', handleNodePointerDown);
          element.addEventListener('pointermove', handleNodePointerMove);
          element.addEventListener('pointerup', handleNodePointerUp);
          element.addEventListener('pointercancel', handleNodePointerUp);
          element.addEventListener('dblclick', handleNodeDoubleClick);
        }

        fragment.append(element);
      });
    };

    additionalPolygons.forEach((polygon) => {
      appendPolygonHandles(Array.isArray(polygon?.points) ? polygon.points : [], {
        closed: true,
        readonly: true,
      });
    });

    appendPolygonHandles(nodes, { closed: isClosed && nodes.length >= 3, readonly: false });

    handlesLayer.append(fragment);
  }

  function handleNodePointerDown(event) {
    if (!isActive) {
      return;
    }
    const target = event.currentTarget;
    const index = Number.parseInt(target?.dataset?.index ?? '', 10);
    if (!Number.isInteger(index)) {
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      try {
        target?.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // Ignore capture release issues.
      }
      dragState = null;
      removeNodeAtIndex(index);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragState = { index, pointerId: event.pointerId };
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore capture errors.
    }
  }

  function handleNodePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId || !isActive) {
      return;
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }

    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const snapped = snapOverlayPoint(gridPoint, event.shiftKey);
    const clamped = clampOverlayPoint(snapped);
    nodes[dragState.index] = clamped;
    renderHandles();
    applyPreviewMask();
    updateControls();
  }

  function handleNodePointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore
    }

    dragState = null;
    applyPreviewMask();
    updateControls();
  }

  function removeNodeAtIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) {
      return;
    }

    nodes.splice(index, 1);

    const wasClosed = isClosed;
    isClosed = wasClosed && nodes.length >= 3;

    if (isClosed) {
      setStatus(CLOSED_STATUS);
    } else {
      setStatus(DEFAULT_STATUS);
    }

    renderHandles();
    applyPreviewMask();
    updateControls();
  }

  function handleNodeDoubleClick(event) {
    if (!isActive) {
      return;
    }
    const index = Number.parseInt(event.currentTarget?.dataset?.index ?? '', 10);
    if (!Number.isInteger(index) || index !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (nodes.length >= 3) {
      isClosed = true;
      setStatus(CLOSED_STATUS);
      renderHandles();
      applyPreviewMask();
      updateControls();
    }
  }

  function handleSurfacePointerDown(event) {
    if (!isActive || event.button !== 0) {
      return;
    }
    if (event.target && event.target.closest('.vtt-overlay-editor__node')) {
      return;
    }
    if (event.target && event.target.closest('.vtt-overlay-editor__toolbar')) {
      return;
    }

    if (toolbar && typeof toolbar.getBoundingClientRect === 'function') {
      const rect = toolbar.getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX) ? event.clientX : null;
      const pointerY = Number.isFinite(event.clientY) ? event.clientY : null;
      if (
        rect &&
        pointerX !== null &&
        pointerY !== null &&
        pointerX >= rect.left &&
        pointerX <= rect.right &&
        pointerY >= rect.top &&
        pointerY <= rect.bottom
      ) {
        return;
      }
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }

    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const snapped = snapOverlayPoint(gridPoint, event.shiftKey);
    const clamped = clampOverlayPoint(snapped);

    if (isClosed && nodes.length >= 3) {
      const completedPolygon = cloneOverlayPolygon({ points: nodes });
      if (completedPolygon) {
        additionalPolygons = [...additionalPolygons, completedPolygon];
        persistedPrimaryPolygon = null;
        nodes = [];
        isClosed = false;
        setStatus(DEFAULT_STATUS);
      } else {
        setStatus(INSUFFICIENT_POINTS_STATUS);
        updateControls();
        return;
      }
    }

    nodes.push(clamped);
    isClosed = false;
    renderHandles();
    applyPreviewMask();
    updateControls();
  }

  function snapOverlayPoint(point, shiftKey = false) {
    const step = shiftKey ? 0.5 : 0.25;
    const snapValue = (value) => {
      const numeric = Number(value ?? 0);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return Math.round(numeric / step) * step;
    };
    return {
      column: roundToPrecision(snapValue(point.column), 4),
      row: roundToPrecision(snapValue(point.row), 4),
    };
  }

  function clampOverlayPoint(point) {
    const bounds = resolveGridBounds(viewState);
    const maxColumn = Math.max(0, Number.isFinite(bounds.columns) ? bounds.columns : 0);
    const maxRow = Math.max(0, Number.isFinite(bounds.rows) ? bounds.rows : 0);
    return {
      column: clamp(Number(point.column ?? 0), 0, maxColumn),
      row: clamp(Number(point.row ?? 0), 0, maxRow),
    };
  }

  function gridPointToOverlayLocal(point) {
    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    return {
      x: (point.column ?? 0) * gridSize,
      y: (point.row ?? 0) * gridSize,
    };
  }

  function setButtonState(pressed) {
    overlayEditorActive = Boolean(pressed);
    lastOverlaySignature = null;
    syncOverlayLayer(persistedOverlay);
    syncCutoutToggleButtons();
  }

  function setStatus(message) {
    const nextMessage = message || DEFAULT_STATUS;
    if (statusLabel) {
      statusLabel.textContent = nextMessage;
      statusLabel.hidden = !nextMessage;
    }
    ensureToolbarPosition();
  }

  function isDirty() {
    if (!isActive) {
      return false;
    }
    const preview = buildPreviewMask();
    return overlayMaskSignature(preview) !== persistedSignature;
  }

  function buildPreviewMask() {
    const base = normalizeOverlayMask(persistedMask);
    const mask = {
      visible: base.visible,
      polygons: additionalPolygons.map((polygon) => ({
        points: polygon.points.map((point) => ({
          column: roundToPrecision(point.column, 4),
          row: roundToPrecision(point.row, 4),
        })),
      })),
    };
    if (base.url) {
      mask.url = base.url;
    }

    if (isClosed && nodes.length >= 3) {
      mask.polygons.unshift({
        points: nodes.map((node) => ({
          column: roundToPrecision(node.column, 4),
          row: roundToPrecision(node.row, 4),
        })),
      });
    } else if (nodes.length === 0 && persistedPrimaryPolygon) {
      mask.polygons.unshift({
        points: persistedPrimaryPolygon.points.map((point) => ({
          column: roundToPrecision(point.column, 4),
          row: roundToPrecision(point.row, 4),
        })),
      });
    }

    return mask;
  }

  function applyPreviewMask() {
    const allowDuringEditing = overlayEditorActive;

    if (isActive && ((isClosed && nodes.length >= 3) || additionalPolygons.length > 0)) {
      const preview = buildPreviewMask();
      applyOverlayDraftToDom(preview, { allowDuringEditing });
    } else {
      applyOverlayDraftToDom(null, { allowDuringEditing });
    }
  }

  function updateControls() {
    const hasNodes = nodes.length >= 3;
    closeButton.disabled = !hasNodes || isClosed;
    commitButton.disabled = !isActive || !isClosed || !hasNodes || !isDirty();
    resetButton.disabled = !isActive || (!isDirty() && !dragState);
    clearButton.disabled = !hasPersistedOverlay();
    ensureToolbarPosition();
  }

  function hasPersistedOverlay() {
    if (persistedMapUrl) {
      return true;
    }
    const layers = Array.isArray(persistedOverlay.layers) ? persistedOverlay.layers : [];
    return layers.some(
      (layer) => layer && layer.visible !== false && maskHasMeaningfulOverlayContent(layer.mask)
    );
  }

  function hasOverlayMap() {
    return Boolean(persistedMapUrl);
  }

  async function commitChanges() {
    if (!isClosed || nodes.length < 3) {
      setStatus('Add at least three nodes and close the shape before applying the mask.');
      return;
    }

    const preview = buildPreviewMask();
    const polygons = Array.isArray(preview?.polygons) ? preview.polygons : [];
    const validPolygons = polygons.filter(
      (polygon) => Array.isArray(polygon?.points) && polygon.points.length >= 3
    );
    const canPersistCutout =
      Boolean(uploadsEndpoint) &&
      Boolean(persistedMapUrl) &&
      validPolygons.length > 0;

    if (canPersistCutout) {
      try {
        setStatus('Saving overlay cutout…');
        const blob = await overlayUploadHelpers.createOverlayCutoutBlob({
          mapUrl: persistedMapUrl,
          polygons: validPolygons,
          view: viewState,
        });

        if (blob) {
          const fileName = `overlay-cutout-${Date.now()}.png`;
          const uploadedUrl = await overlayUploadHelpers.uploadMap(
            blob,
            uploadsEndpoint,
            fileName
          );

          if (uploadedUrl) {
            const changed = updateSceneOverlay((overlayEntry, activeLayer) => {
              activeLayer.mapUrl = uploadedUrl;
              activeLayer.mask = createEmptyOverlayMask();
            });

            if (changed) {
              setNodesFromMask(persistedMask);
              renderHandles();
              applyPreviewMask();
              updateControls();
              setStatus('Overlay cutout applied.');
              persistBoardStateSnapshot();
              return;
            }
          }
        }
      } catch (error) {
        console.warn('[VTT] Failed to persist overlay cutout', error);
      }
    }

    const changed = updateSceneOverlay((overlayEntry, activeLayer) => {
      activeLayer.mask = normalizeOverlayMask(preview);
    });

    if (!changed) {
      setStatus('Unable to update the overlay for this scene.');
      return;
    }

    setNodesFromMask(persistedMask);
    renderHandles();
    applyPreviewMask();
    updateControls();
    setStatus('Overlay mask applied.');
    persistBoardStateSnapshot();
  }

  function restorePersistedMask() {
    setNodesFromMask(persistedMask);
    renderHandles();
    applyPreviewMask();
    updateControls();
    setStatus('Overlay reset to the last saved shape.');
    persistBoardStateSnapshot();
  }

  function clearOverlay() {
    const changed = updateSceneOverlay((overlayEntry, activeLayer) => {
      overlayEntry.layers = overlayEntry.layers.filter((layer) => layer.id !== activeLayer.id);
      if (overlayEntry.layers.length === 0) {
        const replacement = createOverlayLayer(`Overlay 1`, overlayEntry.layers);
        overlayEntry.layers.push(replacement);
        overlayEntry.activeLayerId = replacement.id;
      } else {
        overlayEntry.activeLayerId = overlayEntry.layers[0].id;
      }
    });

    if (!changed) {
      setStatus('Unable to delete the overlay for this scene.');
      return;
    }

    nodes = [];
    isClosed = false;
    additionalPolygons = [];
    persistedPrimaryPolygon = null;
    handlesLayer.innerHTML = '';
    applyPreviewMask();
    updateControls();
    setStatus('Overlay deleted.');
    persistBoardStateSnapshot();
  }

  function closePolygon() {
    if (nodes.length < 3) {
      setStatus('Add at least three nodes before closing the shape.');
      return;
    }
    isClosed = true;
    setStatus(CLOSED_STATUS);
    renderHandles();
    applyPreviewMask();
    updateControls();
  }

  function updateSceneOverlay(mutator) {
    if (typeof boardApi.updateState !== 'function') {
      return false;
    }

    let updated = false;
    boardApi.updateState?.((draft) => {
      const boardDraft = ensureBoardStateDraft(draft);
      const activeSceneId = boardDraft.activeSceneId;
      if (!activeSceneId) {
        return;
      }

      const sceneEntry = ensureSceneStateDraftEntry(draft, activeSceneId);
      const overlayEntry = normalizeOverlayDraft(sceneEntry.overlay ?? {});
      if (!Array.isArray(overlayEntry.layers) || overlayEntry.layers.length === 0) {
        const layer = createOverlayLayer(`Overlay ${overlayEntry.layers.length + 1}`, overlayEntry.layers);
        overlayEntry.layers.push(layer);
        overlayEntry.activeLayerId = layer.id;
      }

      const activeLayer = overlayEntry.layers.find((layer) => layer.id === overlayEntry.activeLayerId);
      if (!activeLayer) {
        return;
      }

      const result = mutator(overlayEntry, activeLayer, boardDraft);
      if (result === false) {
        return;
      }

      rebuildOverlayAggregate(overlayEntry);
      sceneEntry.overlay = overlayEntry;
      boardDraft.overlay = normalizeOverlayDraft(overlayEntry);
      persistedOverlay = normalizeOverlayDraft(overlayEntry);
      const persistedLayer = getPersistedActiveLayer();
      persistedMask = normalizeOverlayMask(persistedLayer.mask ?? {});
      persistedSignature = overlayMaskSignature(persistedMask);
      persistedMapUrl = persistedLayer?.mapUrl ?? null;
      updated = true;
    });

    return updated;
  }

  mapSurface.addEventListener('pointerdown', handleSurfacePointerDown, true);

  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (!isActive) {
      activate();
    }
    closePolygon();
  });

  commitButton.addEventListener('click', (event) => {
    event.preventDefault();
    commitChanges();
  });

  resetButton.addEventListener('click', (event) => {
    event.preventDefault();
    restorePersistedMask();
  });

  clearButton.addEventListener('click', (event) => {
    event.preventDefault();
    clearOverlay();
  });

  return {
    toggle,
    editLayer,
    reset: resetTool,
    notifyGridChanged,
    notifyMapState,
    notifyOverlayMaskChange,
    isEditingLayer,
  };
}

function createTemplateTool() {
  const layer = templateLayer;
  const shapes = [];
  let selectedId = null;
  let previewShape = null;
  let placementState = null;
  let activeDrag = null;
  let activeRotation = null;
  let menuController = null;
  let outsideClickHandler = null;
  let colorIndex = 0;
  const colorPalette = [
    'rgba(59, 130, 246, 0.95)',
    'rgba(14, 165, 233, 0.95)',
    'rgba(236, 72, 153, 0.95)',
    'rgba(16, 185, 129, 0.95)',
    'rgba(244, 114, 182, 0.95)',
  ];
  const PREVIEW_COLOR = 'rgba(148, 163, 184, 0.8)';
  const MIN_RECT_DIMENSION = 1;
  const MIN_CIRCLE_RADIUS = 0.5;
  let lastSyncedSnapshot = null;

  if (!layer) {
    return {
      render() {},
      reset() {},
      notifyGridChanged() {},
      notifyMapState() {},
      cancelPlacement() {
        return false;
      },
      handleKeydown() {
        return false;
      },
      clearSelection() {},
    };
  }

  updateLayerVisibility();

  function sanitizeColorValue(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 64) {
      return null;
    }

    if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) {
      return trimmed;
    }

    if (/^(rgba?|hsla?)\(/i.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  function toRoundedNumber(value, fallback = 0, precision = 4) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    if (!Number.isFinite(precision) || precision <= 0) {
      return parsed;
    }
    const factor = 10 ** precision;
    return Math.round(parsed * factor) / factor;
  }

  function snapshotKey(entries) {
    return JSON.stringify(entries);
  }

  function serializeShape(shape) {
    if (!shape || typeof shape !== 'object') {
      return null;
    }

    const type = typeof shape.type === 'string' ? shape.type : '';
    const id = typeof shape.id === 'string' ? shape.id : '';
    if (!id || !type) {
      return null;
    }

    const sanitizedColor = sanitizeColorValue(shape.color);
    const base = { id, type };
    if (sanitizedColor) {
      base.color = sanitizedColor;
    }

    if (type === 'circle') {
      const column = toRoundedNumber(shape.center?.column, 0);
      const row = toRoundedNumber(shape.center?.row, 0);
      const radius = Math.max(MIN_CIRCLE_RADIUS, toRoundedNumber(shape.radius, MIN_CIRCLE_RADIUS));
      base.center = { column, row };
      base.radius = radius;
      return base;
    }

    if (type === 'rectangle') {
      const startColumn = Math.max(0, toRoundedNumber(shape.start?.column, 0));
      const startRow = Math.max(0, toRoundedNumber(shape.start?.row, 0));
      const length = Math.max(MIN_RECT_DIMENSION, toRoundedNumber(shape.length, MIN_RECT_DIMENSION));
      const width = Math.max(MIN_RECT_DIMENSION, toRoundedNumber(shape.width, MIN_RECT_DIMENSION));
      const rotation = toRoundedNumber(shape.rotation, 0, 2);
      base.start = { column: startColumn, row: startRow };
      base.length = length;
      base.width = width;
      base.rotation = rotation;
      if (Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
        base.anchor = {
          column: Math.max(0, toRoundedNumber(shape.anchor.column, 0)),
          row: Math.max(0, toRoundedNumber(shape.anchor.row, 0)),
        };
      }
      if (Number.isFinite(shape.orientation?.x) || Number.isFinite(shape.orientation?.y)) {
        base.orientation = {
          x: shape.orientation?.x >= 0 ? 1 : -1,
          y: shape.orientation?.y >= 0 ? 1 : -1,
        };
      }
      return base;
    }

    if (type === 'wall') {
      const squares = Array.isArray(shape.squares) ? shape.squares : [];
      base.squares = squares
        .map((square) => {
          const column = Math.round(Number(square?.column ?? square?.col ?? square?.x));
          const row = Math.round(Number(square?.row ?? square?.y));
          if (!Number.isFinite(column) || !Number.isFinite(row)) {
            return null;
          }
          return { column: Math.max(0, column), row: Math.max(0, row) };
        })
        .filter(Boolean);
      return base;
    }

    return null;
  }

  function serializeShapesList(list = shapes) {
    return list.map((shape) => serializeShape(shape)).filter(Boolean);
  }

  function normalizeSerializedTemplate(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (!id || (type !== 'circle' && type !== 'rectangle' && type !== 'wall')) {
      return null;
    }

    const color = sanitizeColorValue(entry.color);

    if (type === 'circle') {
      const column = toRoundedNumber(entry.center?.column, 0);
      const row = toRoundedNumber(entry.center?.row, 0);
      const radius = Math.max(MIN_CIRCLE_RADIUS, toRoundedNumber(entry.radius, MIN_CIRCLE_RADIUS));
      return {
        id,
        type: 'circle',
        color,
        center: { column, row },
        radius,
      };
    }

    if (type === 'rectangle') {
      const startColumn = Math.max(0, toRoundedNumber(entry.start?.column, 0));
      const startRow = Math.max(0, toRoundedNumber(entry.start?.row, 0));
      const length = Math.max(MIN_RECT_DIMENSION, toRoundedNumber(entry.length, MIN_RECT_DIMENSION));
      const width = Math.max(MIN_RECT_DIMENSION, toRoundedNumber(entry.width, MIN_RECT_DIMENSION));
      const rotation = toRoundedNumber(entry.rotation, 0, 2);
      const anchorColumn = Number.isFinite(entry.anchor?.column)
        ? Math.max(0, toRoundedNumber(entry.anchor.column, 0))
        : null;
      const anchorRow = Number.isFinite(entry.anchor?.row)
        ? Math.max(0, toRoundedNumber(entry.anchor.row, 0))
        : null;
      const orientationX = Number.isFinite(entry.orientation?.x)
        ? entry.orientation.x >= 0
          ? 1
          : -1
        : undefined;
      const orientationY = Number.isFinite(entry.orientation?.y)
        ? entry.orientation.y >= 0
          ? 1
          : -1
        : undefined;

      const normalized = {
        id,
        type: 'rectangle',
        color,
        start: { column: startColumn, row: startRow },
        length,
        width,
        rotation,
      };

      if (anchorColumn !== null && anchorRow !== null) {
        normalized.anchor = { column: anchorColumn, row: anchorRow };
      }

      if (orientationX !== undefined || orientationY !== undefined) {
        normalized.orientation = {
          x: orientationX === undefined ? 1 : orientationX,
          y: orientationY === undefined ? 1 : orientationY,
        };
      }

      return normalized;
    }

    if (type === 'wall') {
      const rawSquares = Array.isArray(entry.squares) ? entry.squares : [];
      const squares = rawSquares
        .map((square) => {
          const column = Math.round(Number(square?.column ?? square?.col ?? square?.x));
          const row = Math.round(Number(square?.row ?? square?.y));
          if (!Number.isFinite(column) || !Number.isFinite(row)) {
            return null;
          }
          return { column: Math.max(0, column), row: Math.max(0, row) };
        })
        .filter(Boolean);

      return {
        id,
        type: 'wall',
        color,
        squares,
      };
    }

    return null;
  }

  function hydrateFromSerializedTemplates(entries) {
    shapes.splice(0, shapes.length).forEach((shape) => {
      shape.elements.root.remove();
    });

    entries.forEach((entry) => {
      const shape = createShape(entry.type, entry, { id: entry.id, color: entry.color });
      if (shape) {
        shapes.push(shape);
        layer.appendChild(shape.elements.root);
      }
    });

    colorIndex = shapes.length;
    selectedId = null;
    updateLayerVisibility();
  }

  function commitShapes() {
    const serialized = serializeShapesList();

    if (typeof boardApi.updateState !== 'function') {
      lastSyncedSnapshot = snapshotKey(serialized);
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      lastSyncedSnapshot = snapshotKey(serialized);
      return;
    }

    boardApi.updateState?.((draft) => {
      const templatesDraft = ensureSceneTemplateDraft(draft, activeSceneId);
      templatesDraft.length = 0;
      serialized.forEach((entry) => templatesDraft.push(entry));
    });

    lastSyncedSnapshot = snapshotKey(serialized);
    persistBoardStateSnapshot();
  }

  if (templatesButton) {
    templatesButton.addEventListener('click', (event) => {
      event.preventDefault();
      const controller = ensureMenu();
      controller.toggle();
    });
  }

  mapSurface.addEventListener('pointerdown', handlePlacementPointerDown, true);
  mapSurface.addEventListener('pointermove', handlePlacementPointerMove, true);
  mapSurface.addEventListener('pointerup', handlePlacementPointerUp, true);
  mapSurface.addEventListener('pointercancel', handlePlacementPointerCancel, true);

  function render(view = viewState) {
    updateLayerVisibility(view);
    shapes.forEach((shape) => updateShapeElement(shape, view));
    if (previewShape) {
      updateShapeElement(previewShape, view);
    }
  }

  function reset() {
    shapes.splice(0, shapes.length).forEach((shape) => {
      shape.elements.root.remove();
    });
    clearPreview();
    placementState = null;
    activeDrag = null;
    activeRotation = null;
    selectedId = null;
    lastSyncedSnapshot = null;
    updateLayerVisibility();
  }

  function notifyGridChanged() {
    render(viewState);
  }

  function notifyMapState() {
    if (!viewState.mapLoaded) {
      render(viewState);
      return;
    }

    if (placementState) {
      render(viewState);
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    const templatesByScene = state.boardState?.templates ?? {};
    const rawTemplates = activeSceneId && templatesByScene && typeof templatesByScene === 'object'
      ? templatesByScene[activeSceneId]
      : [];

    const normalized = Array.isArray(rawTemplates)
      ? rawTemplates.map((entry) => normalizeSerializedTemplate(entry)).filter(Boolean)
      : [];

    const nextSnapshot = snapshotKey(normalized);
    if (nextSnapshot !== lastSyncedSnapshot) {
      hydrateFromSerializedTemplates(normalized);
      lastSyncedSnapshot = nextSnapshot;
    }

    render(viewState);
  }

  function cancelPlacement() {
    if (!placementState) {
      return false;
    }
    if (placementState.pointerId !== null) {
      try {
        mapSurface.releasePointerCapture?.(placementState.pointerId);
      } catch (error) {
        // Ignore release failures when aborting placement.
      }
    }
    placementState = null;
    clearPreview();
    restoreStatus();
    updateLayerVisibility();
    return true;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      const handled = cancelPlacement();
      if (handled) {
        event.preventDefault();
        return true;
      }
      if (selectedId) {
        clearSelection();
        event.preventDefault();
        return true;
      }
      if (menuController?.isOpen()) {
        menuController.hide();
        event.preventDefault();
        return true;
      }
      return false;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      removeShape(selectedId);
      event.preventDefault();
      return true;
    }

    if (event.key === 'r' && selectedId) {
      rotateRectangle(selectedId, event.shiftKey ? -45 : 45);
      event.preventDefault();
      return true;
    }

    return false;
  }

  function handlePlacementPointerDown(event) {
    if (!placementState || event.button !== 0) {
      return;
    }

    if (placementState.type !== 'wall' && event.target && event.target.closest('.vtt-template__node')) {
      return;
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }
    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }
    const snapOptions =
      placementState.type === 'rectangle' ? { step: 1, mode: 'floor' } : undefined;
    const snappedPoint = snapPointToGrid(gridPoint, snapOptions);

    event.preventDefault();
    event.stopPropagation();

    if (placementState.type === 'wall') {
      handleWallPlacement(gridPoint);
      return;
    }

    if (placementState.type === 'circle') {
      if (placementState.stage === 'hover-circle' && previewShape) {
        finalizePlacement({
          type: 'circle',
          center: { ...previewShape.center },
          radius: Math.max(MIN_CIRCLE_RADIUS, previewShape.radius ?? MIN_CIRCLE_RADIUS),
        });
        return;
      }

      if (!placementState.dynamic && isFiniteNumber(placementState.values.radius)) {
        const radius = Math.max(
          MIN_CIRCLE_RADIUS,
          placementState.fixedRadius ?? placementState.values.radius
        );
        finalizePlacement({
          type: 'circle',
          center: snappedPoint,
          radius,
        });
        return;
      }

      placementState.stage = 'sizing-circle';
      placementState.start = snappedPoint;
      placementState.pointerId = event.pointerId;
      placementState.hasMoved = false;

      clearPreview();
      const radius = Math.max(
        MIN_CIRCLE_RADIUS,
        placementState.fixedRadius ?? MIN_CIRCLE_RADIUS
      );
      previewShape = createShape('circle', {
        center: snappedPoint,
        radius,
      }, { preview: true });
      layer.appendChild(previewShape.elements.root);
      placementState.start = { ...previewShape.center };
      updateStatus('Drag to set the radius. Hold Shift to snap to half-square increments. You can release and move the cursor before clicking to confirm.');
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture failures.
      }
      render(viewState);
      return;
    }

    if (placementState.type === 'rectangle') {
      if (placementState.stage === 'hover-rectangle' && previewShape) {
        finalizePlacement({
          type: 'rectangle',
          start: { ...previewShape.start },
          length: previewShape.length,
          width: previewShape.width,
          rotation: previewShape.rotation ?? 0,
          anchor: previewShape.anchor ? { ...previewShape.anchor } : undefined,
          orientation: previewShape.orientation ? { ...previewShape.orientation } : undefined,
        });
        return;
      }

      const hasLength = isFiniteNumber(placementState.values.length);
      const hasWidth = isFiniteNumber(placementState.values.width);

      if (!placementState.dynamic && hasLength && hasWidth) {
        finalizePlacement({
          type: 'rectangle',
          start: snappedPoint,
          length: Math.max(MIN_RECT_DIMENSION, placementState.values.length),
          width: Math.max(MIN_RECT_DIMENSION, placementState.values.width),
          rotation: 0,
          anchor: snappedPoint,
          orientation: { x: 1, y: 1 },
        });
        return;
      }

      placementState.stage = 'sizing-rectangle';
      const anchor = clampPointToGridBounds(snappedPoint, viewState);
      placementState.anchor = { ...anchor };
      placementState.start = { ...anchor };
      placementState.pointerId = event.pointerId;
      placementState.hasMoved = false;

      clearPreview();
      const baseLength = Math.max(MIN_RECT_DIMENSION, placementState.fixedLength ?? MIN_RECT_DIMENSION);
      const baseWidth = Math.max(MIN_RECT_DIMENSION, placementState.fixedWidth ?? MIN_RECT_DIMENSION);
      const initialRect = clampRectangleWithAnchor(
        anchor,
        { x: 1, y: 1 },
        baseLength,
        baseWidth,
        getGridBounds(viewState)
      );
      previewShape = createShape('rectangle', {
        start: initialRect.start,
        length: initialRect.length,
        width: initialRect.width,
        rotation: 0,
        anchor,
        orientation: initialRect.orientation,
      }, { preview: true });
      layer.appendChild(previewShape.elements.root);
      placementState.lastOrientation = initialRect.orientation ?? { x: 1, y: 1 };
      updateStatus('Drag to define the rectangle. You can release and adjust before clicking to confirm.');
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture failures.
      }
      render(viewState);
    }
  }

  function handlePlacementPointerMove(event) {
    if (activeRotation) {
      return;
    }
    if (!placementState) {
      return;
    }

    const stage = placementState.stage;
    const trackingHover = stage === 'hover-circle' || stage === 'hover-rectangle';
    if (!trackingHover) {
      if (placementState.pointerId === null || event.pointerId !== placementState.pointerId) {
        return;
      }
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }
    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (placementState.type === 'circle' && previewShape) {
      if (stage !== 'sizing-circle' && stage !== 'hover-circle') {
        return;
      }
      const dx = gridPoint.column - placementState.start.column;
      const dy = gridPoint.row - placementState.start.row;
      let radius = Math.max(MIN_CIRCLE_RADIUS, Math.sqrt(dx * dx + dy * dy));
      if (event.shiftKey) {
        radius = Math.max(MIN_CIRCLE_RADIUS, snapToHalf(radius));
      }
      previewShape.center = { ...placementState.start };
      previewShape.radius = radius;
      if (stage === 'sizing-circle' && radius > MIN_CIRCLE_RADIUS + 0.05) {
        placementState.hasMoved = true;
      }
      render(viewState);
      return;
    }

    if (placementState.type === 'rectangle' && previewShape) {
      if (stage !== 'sizing-rectangle' && stage !== 'hover-rectangle') {
        return;
      }

      const anchor = placementState.anchor ?? placementState.start ?? { column: 0, row: 0 };
      const snapStep = event.shiftKey ? 1 : 0.5;
      const snapMode = snapStep === 1 ? 'floor' : 'round';
      const snappedTarget = snapPointToGrid(gridPoint, { step: snapStep, mode: snapMode });
      const clampedTarget = clampPointToGridBounds(snappedTarget, viewState);
      const deltaX = clampedTarget.column - anchor.column;
      const deltaY = clampedTarget.row - anchor.row;
      if (stage === 'sizing-rectangle') {
        if (Math.abs(deltaX) > 0.05 || Math.abs(deltaY) > 0.05) {
          placementState.hasMoved = true;
        }
      }

      const rectConfig = computeRectangleFromAnchor(anchor, clampedTarget, {
        dynamicLength: placementState.dynamicLength,
        dynamicWidth: placementState.dynamicWidth,
        fixedLength: placementState.fixedLength ?? MIN_RECT_DIMENSION,
        fixedWidth: placementState.fixedWidth ?? MIN_RECT_DIMENSION,
        view: viewState,
        lastOrientation: placementState.lastOrientation,
      });
      placementState.lastOrientation = rectConfig.orientation;
      updateRectanglePreview({
        start: rectConfig.start,
        length: rectConfig.length,
        width: rectConfig.width,
        orientation: rectConfig.orientation,
        anchor,
      });
    }
  }

  function handlePlacementPointerUp(event) {
    if (!placementState || placementState.pointerId === null || event.pointerId !== placementState.pointerId) {
      return;
    }

    const localPoint = getLocalMapPoint(event);
    const gridPoint = localPoint ? mapPointToGrid(localPoint, viewState) : null;

    event.preventDefault();
    event.stopPropagation();

    try {
      mapSurface.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore release issues.
    }

    const stage = placementState.stage;
    placementState.pointerId = null;

    if (placementState.type === 'circle') {
      if (!gridPoint || stage !== 'sizing-circle') {
        cancelPlacement();
        return;
      }

      if (placementState.dynamic && !placementState.hasMoved) {
        placementState.stage = 'hover-circle';
        updateStatus('Move the cursor to set the radius, then click to confirm. Hold Shift to snap to half-square increments.');
        return;
      }

      const dx = gridPoint.column - placementState.start.column;
      const dy = gridPoint.row - placementState.start.row;
      let radius = Math.max(MIN_CIRCLE_RADIUS, Math.sqrt(dx * dx + dy * dy));
      if (event.shiftKey) {
        radius = Math.max(MIN_CIRCLE_RADIUS, snapToHalf(radius));
      }
      finalizePlacement({
        type: 'circle',
        center: placementState.start,
        radius,
      });
      return;
    }

    if (placementState.type === 'rectangle') {
      if (!gridPoint || stage !== 'sizing-rectangle') {
        cancelPlacement();
        return;
      }

      if (placementState.dynamic && !placementState.hasMoved) {
        placementState.stage = 'hover-rectangle';
        updateStatus('Move the cursor to size your rectangle, then click to confirm.');
        return;
      }

      if (previewShape && previewShape.type === 'rectangle') {
        finalizePlacement({
          type: 'rectangle',
          start: { ...previewShape.start },
          length: previewShape.length,
          width: previewShape.width,
          rotation: previewShape.rotation ?? 0,
          anchor: previewShape.anchor ? { ...previewShape.anchor } : undefined,
          orientation: previewShape.orientation ? { ...previewShape.orientation } : undefined,
        });
        return;
      }

      const anchor = placementState.anchor ?? placementState.start ?? { column: 0, row: 0 };
      const snapStep = event.shiftKey ? 1 : 0.5;
      const snapMode = snapStep === 1 ? 'floor' : 'round';
      const snappedPoint = snapPointToGrid(gridPoint, { step: snapStep, mode: snapMode });
      const clampedPoint = clampPointToGridBounds(snappedPoint, viewState);
      const rectConfig = computeRectangleFromAnchor(anchor, clampedPoint, {
        dynamicLength: placementState.dynamicLength,
        dynamicWidth: placementState.dynamicWidth,
        fixedLength: placementState.fixedLength ?? MIN_RECT_DIMENSION,
        fixedWidth: placementState.fixedWidth ?? MIN_RECT_DIMENSION,
        view: viewState,
        lastOrientation: placementState.lastOrientation,
      });
      finalizePlacement({
        type: 'rectangle',
        start: rectConfig.start,
        length: rectConfig.length,
        width: rectConfig.width,
        rotation: 0,
        anchor: placementState.anchor ? { ...placementState.anchor } : undefined,
        orientation: rectConfig.orientation ? { ...rectConfig.orientation } : undefined,
      });
      return;
    }

    cancelPlacement();
  }

  function handlePlacementPointerCancel(event) {
    if (!placementState || placementState.pointerId === null || event.pointerId !== placementState.pointerId) {
      return;
    }
    cancelPlacement();
  }

  function finalizePlacement(config) {
    clearPreview();
    restoreStatus();
    placementState = null;
    updateLayerVisibility();

    if (config.type === 'circle') {
      const center = resolveCircleCenter(config.center, config.radius, viewState);
      const shape = createShape('circle', {
        center,
        radius: config.radius,
      });
      addShape(shape);
      return;
    }

    if (config.type === 'wall') {
      const squares = clampWallSquares(config.squares, viewState);
      if (squares.length === 0) {
        render(viewState);
        return;
      }
      const shape = createShape('wall', { squares });
      addShape(shape);
      return;
    }

    const rotation = Number.isFinite(config.rotation)
      ? config.rotation
      : Number.isInteger(config.rotationSteps)
      ? (config.rotationSteps % 4) * 90
      : 0;
    const start = resolveRectangleStart(config.start, config.length, config.width, rotation, viewState);
    const originalStartColumn = Number.isFinite(config.start?.column) ? config.start.column : start.column;
    const originalStartRow = Number.isFinite(config.start?.row) ? config.start.row : start.row;
    const deltaStartColumn = start.column - originalStartColumn;
    const deltaStartRow = start.row - originalStartRow;
    let anchor = null;
    if (Number.isFinite(config.anchor?.column) && Number.isFinite(config.anchor?.row)) {
      anchor = {
        column: config.anchor.column + deltaStartColumn,
        row: config.anchor.row + deltaStartRow,
      };
    }
    const orientation = config.orientation ?? null;
    const shape = createShape('rectangle', {
      start,
      length: config.length,
      width: config.width,
      rotation,
      anchor,
      orientation,
    });
    addShape(shape);
  }

  function addShape(shape) {
    shapes.push(shape);
    layer.appendChild(shape.elements.root);
    selectShape(shape.id);
    render(viewState);
    commitShapes();
  }

  function createShape(type, data, options = {}) {
    const isPreview = Boolean(options.preview);
    const providedId =
      typeof options.id === 'string' && options.id.trim()
        ? options.id.trim()
        : typeof data.id === 'string' && data.id.trim()
        ? data.id.trim()
        : null;
    const id = isPreview ? `preview_${Date.now()}` : providedId ?? createPlacementId();
    const providedColor = sanitizeColorValue(options.color ?? data.color);
    const color = isPreview ? PREVIEW_COLOR : providedColor ?? nextColor();
    const root = document.createElement('div');
    root.className = `vtt-template vtt-template--${type}${isPreview ? ' vtt-template--preview' : ''}`;
    root.dataset.templateId = id;
    root.style.setProperty('--vtt-template-color', color);

    const shapeEl = document.createElement('div');
    shapeEl.className = 'vtt-template__shape';
    if (type === 'wall') {
      shapeEl.classList.add('vtt-template__shape--wall');
    }
    root.appendChild(shapeEl);

    let wallTileContainer = null;
    if (type === 'wall') {
      wallTileContainer = document.createElement('div');
      wallTileContainer.className = 'vtt-wall';
      shapeEl.appendChild(wallTileContainer);
    }

    let node;
    if (type === 'wall') {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'vtt-wall__hitbox';
      node.dataset.templateNode = id;
      node.setAttribute('aria-label', 'Select wall template');
      root.appendChild(node);
    } else {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'vtt-template__node';
      node.innerHTML = '<span class="vtt-template__node-symbol">◆</span>';
      node.dataset.templateNode = id;
      root.appendChild(node);
    }

    const label = document.createElement('div');
    label.className = 'vtt-template__label';
    if (type === 'wall') {
      root.appendChild(label);
    } else {
      node.appendChild(label);
    }

    let rotateHandle = null;
    if (!isPreview && type === 'rectangle') {
      rotateHandle = document.createElement('button');
      rotateHandle.type = 'button';
      rotateHandle.className = 'vtt-template__rotate-handle';
      rotateHandle.setAttribute('aria-label', 'Rotate rectangle template');
      rotateHandle.innerHTML = '<span aria-hidden="true">⟳</span>';
      node.appendChild(rotateHandle);
    }

    const shape = {
      id,
      type,
      color,
      elements: {
        root,
        shape: shapeEl,
        node,
        label,
        rotateHandle,
        tileContainer: wallTileContainer,
        tiles: new Map(),
        connectors: new Map(),
      },
      isPreview,
    };

    if (type === 'circle') {
      const radius = Math.max(MIN_CIRCLE_RADIUS, data.radius ?? MIN_CIRCLE_RADIUS);
      shape.radius = radius;
      const rawCenter = {
        column: Number.isFinite(data.center?.column) ? data.center.column : 0,
        row: Number.isFinite(data.center?.row) ? data.center.row : 0,
      };
      const resolvedCenter = resolveCircleCenter(rawCenter, radius, viewState);
      shape.center = {
        column: resolvedCenter.column,
        row: resolvedCenter.row,
      };
    } else if (type === 'rectangle') {
      const length = Math.max(MIN_RECT_DIMENSION, data.length ?? MIN_RECT_DIMENSION);
      const width = Math.max(MIN_RECT_DIMENSION, data.width ?? MIN_RECT_DIMENSION);
      shape.length = length;
      shape.width = width;
      let baseStart = {
        column: Number.isFinite(data.start?.column) ? data.start.column : 0,
        row: Number.isFinite(data.start?.row) ? data.start.row : 0,
      };
      if (Number.isFinite(data.center?.column) && Number.isFinite(data.center?.row)) {
        baseStart = rectangleStartFromCenter({ column: data.center.column, row: data.center.row }, length, width);
      }
      const initialRotation = Number.isFinite(data.rotation)
        ? data.rotation
        : Number.isInteger(data.rotationSteps)
        ? (data.rotationSteps % 4) * 90
        : 0;
      shape.rotation = normalizeAngle(initialRotation);
      const resolvedStart = resolveRectangleStart(baseStart, length, width, shape.rotation, viewState);
      shape.start = {
        column: resolvedStart.column,
        row: resolvedStart.row,
      };
      const orientationX = Number.isFinite(data.orientation?.x) ? (data.orientation.x >= 0 ? 1 : -1) : 1;
      const orientationY = Number.isFinite(data.orientation?.y) ? (data.orientation.y >= 0 ? 1 : -1) : 1;
      shape.orientation = { x: orientationX, y: orientationY };

      const deltaStartColumn = resolvedStart.column - baseStart.column;
      const deltaStartRow = resolvedStart.row - baseStart.row;
      if (Number.isFinite(data.anchor?.column) && Number.isFinite(data.anchor?.row)) {
        const anchorColumn = data.anchor.column + deltaStartColumn;
        const anchorRow = data.anchor.row + deltaStartRow;
        const clampedAnchor = clampPointToGridBounds({ column: anchorColumn, row: anchorRow }, viewState);
        shape.anchor = { column: clampedAnchor.column, row: clampedAnchor.row };
      }
    } else if (type === 'wall') {
      shape.squares = sanitizeWallSquares(data.squares);
    }

    if (!isPreview) {
      node.addEventListener('pointerdown', (event) => handleNodePointerDown(event, shape));
      node.addEventListener('pointermove', (event) => handleNodePointerMove(event, shape));
      node.addEventListener('pointerup', handleNodePointerUp);
      node.addEventListener('pointercancel', handleNodePointerCancel);
      node.addEventListener('click', (event) => handleNodeClick(event, shape));
      if (rotateHandle) {
        rotateHandle.addEventListener('pointerdown', (event) => startRectangleRotation(event, shape));
        rotateHandle.addEventListener('pointermove', (event) => updateRectangleRotation(event, shape));
        rotateHandle.addEventListener('pointerup', (event) => endRectangleRotation(event, shape));
        rotateHandle.addEventListener('pointercancel', (event) => endRectangleRotation(event, shape));
      }
    }

    return shape;
  }

  function clearPreview() {
    if (previewShape) {
      previewShape.elements.root.remove();
      previewShape = null;
    }
  }

  function selectShape(id) {
    if (selectedId === id) {
      return;
    }
    selectedId = id;
    shapes.forEach((shape) => {
      const isSelected = shape.id === id;
      shape.elements.root.classList.toggle('is-selected', isSelected);
      if (isSelected) {
        try {
          shape.elements.node.focus({ preventScroll: true });
        } catch (error) {
          // Ignore focus issues in browsers that do not support preventScroll.
        }
      }
    });
    if (selectedId) {
      updateStatus('Template selected. Drag to move, use the rotate handle or press R to rotate, or press Delete to remove.');
    } else {
      restoreStatus();
    }
  }

  function clearSelection() {
    selectedId = null;
    shapes.forEach((shape) => {
      shape.elements.root.classList.remove('is-selected');
    });
    restoreStatus();
  }

  function removeShape(id) {
    const index = shapes.findIndex((shape) => shape.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = shapes.splice(index, 1);
    removed.elements.root.remove();
    if (selectedId === id) {
      selectedId = null;
    }
    render(viewState);
    restoreStatus();
    updateLayerVisibility();
    commitShapes();
  }

  function rotateRectangle(id, deltaDegrees) {
    const shape = shapes.find((item) => item.id === id && item.type === 'rectangle');
    if (!shape) {
      return;
    }
    const nextRotation = normalizeAngle((shape.rotation ?? 0) + deltaDegrees);
    shape.rotation = nextRotation;

    const anchorVector = rectangleAnchorVector(shape);
    if (anchorVector && Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
      const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length ?? MIN_RECT_DIMENSION);
      const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width ?? MIN_RECT_DIMENSION);
      const anchorCenter = {
        column: shape.anchor.column + 0.5,
        row: shape.anchor.row + 0.5,
      };
      const radians = toRadians(nextRotation);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotatedX = anchorVector.x * cos - anchorVector.y * sin;
      const rotatedY = anchorVector.x * sin + anchorVector.y * cos;
      const centerColumn = anchorCenter.column - rotatedX;
      const centerRow = anchorCenter.row - rotatedY;
      const nextStart = rectangleStartFromCenter({ column: centerColumn, row: centerRow }, lengthUnits, widthUnits);
      shape.start.column = nextStart.column;
      shape.start.row = nextStart.row;
    } else {
      const previousStartColumn = shape.start.column;
      const previousStartRow = shape.start.row;
      const clamped = resolveRectangleStart(shape.start, shape.length, shape.width, shape.rotation, viewState);
      shape.start.column = clamped.column;
      shape.start.row = clamped.row;
      if (Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
        const deltaStartColumn = clamped.column - previousStartColumn;
        const deltaStartRow = clamped.row - previousStartRow;
        const nextAnchor = {
          column: shape.anchor.column + deltaStartColumn,
          row: shape.anchor.row + deltaStartRow,
        };
        const clampedAnchor = clampPointToGridBounds(nextAnchor, viewState);
        shape.anchor.column = clampedAnchor.column;
        shape.anchor.row = clampedAnchor.row;
      }
    }
    render(viewState);
    commitShapes();
  }

  function startRectangleRotation(event, shape) {
    if (event.button !== 0 || shape.type !== 'rectangle') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectShape(shape.id);

    const localPoint = getLocalMapPoint(event);
    const pivot = rectangleAnchorToLocal(shape, viewState) ?? rectangleCenterToLocal(shape, viewState);
    if (!localPoint || !pivot) {
      return;
    }

    const pointerAngle = Math.atan2(localPoint.y - pivot.y, localPoint.x - pivot.x);
    activeRotation = {
      shapeId: shape.id,
      pointerId: event.pointerId,
      startRotation: shape.rotation ?? 0,
      startPointerAngle: pointerAngle,
      anchorVector: rectangleAnchorVector(shape),
    };

    updateStatus('Rotate the rectangle. Hold Shift to snap to 45° increments.');
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      // Ignore pointer capture issues on unsupported browsers.
    }
  }

  function updateRectangleRotation(event, shape) {
    if (!activeRotation || activeRotation.shapeId !== shape.id || event.pointerId !== activeRotation.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const localPoint = getLocalMapPoint(event);
    const pivot = rectangleAnchorToLocal(shape, viewState) ?? rectangleCenterToLocal(shape, viewState);
    if (!localPoint || !pivot) {
      return;
    }

    const pointerAngle = Math.atan2(localPoint.y - pivot.y, localPoint.x - pivot.x);
    const deltaRadians = pointerAngle - activeRotation.startPointerAngle;
    let nextRotation = normalizeAngle(activeRotation.startRotation + toDegrees(deltaRadians));
    if (event.shiftKey) {
      nextRotation = snapAngle(nextRotation, 45);
    }

    shape.rotation = nextRotation;
    const anchorVector = activeRotation.anchorVector ?? rectangleAnchorVector(shape);
    if (anchorVector && Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
      const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length ?? MIN_RECT_DIMENSION);
      const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width ?? MIN_RECT_DIMENSION);
      const anchorCenter = {
        column: shape.anchor.column + 0.5,
        row: shape.anchor.row + 0.5,
      };
      const radians = toRadians(nextRotation);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotatedX = anchorVector.x * cos - anchorVector.y * sin;
      const rotatedY = anchorVector.x * sin + anchorVector.y * cos;
      const centerColumn = anchorCenter.column - rotatedX;
      const centerRow = anchorCenter.row - rotatedY;
      const nextStart = rectangleStartFromCenter({ column: centerColumn, row: centerRow }, lengthUnits, widthUnits);
      shape.start.column = nextStart.column;
      shape.start.row = nextStart.row;
    } else {
      const previousStartColumn = shape.start.column;
      const previousStartRow = shape.start.row;
      const clamped = resolveRectangleStart(shape.start, shape.length, shape.width, shape.rotation, viewState);
      const deltaStartColumn = clamped.column - previousStartColumn;
      const deltaStartRow = clamped.row - previousStartRow;
      shape.start.column = clamped.column;
      shape.start.row = clamped.row;
      if (Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
        const nextAnchor = {
          column: shape.anchor.column + deltaStartColumn,
          row: shape.anchor.row + deltaStartRow,
        };
        const clampedAnchor = clampPointToGridBounds(nextAnchor, viewState);
        shape.anchor.column = clampedAnchor.column;
        shape.anchor.row = clampedAnchor.row;
      }
    }
    render(viewState);
  }

  function endRectangleRotation(event, shape) {
    if (!activeRotation || activeRotation.shapeId !== shape.id || event.pointerId !== activeRotation.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore release issues.
    }
    activeRotation = null;
    if (selectedId) {
      updateStatus('Template selected. Drag to move, use the rotate handle or press R to rotate, or press Delete to remove.');
    } else {
      restoreStatus();
    }
    commitShapes();
  }

  function handleNodeClick(event, shape) {
    event.preventDefault();
    event.stopPropagation();
    selectShape(shape.id);
  }

  function handleNodePointerDown(event, shape) {
    if (event.button !== 0 || activeRotation) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectShape(shape.id);

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }
    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }

    const origin = shape.type === 'circle'
      ? { column: shape.center.column, row: shape.center.row }
      : shape.type === 'wall'
      ? null
      : { column: shape.start.column, row: shape.start.row };

    activeDrag = {
      shapeId: shape.id,
      pointerId: event.pointerId,
      origin,
      startPointer: gridPoint,
      originalSquares: shape.type === 'wall'
        ? shape.squares?.map((square) => ({ column: square.column, row: square.row })) ?? []
        : null,
      anchorOrigin:
        shape.type === 'rectangle' && Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)
          ? { column: shape.anchor.column, row: shape.anchor.row }
          : null,
    };

    updateStatus('Drag to reposition the template.');
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      // Ignore capture failures on older browsers.
    }
  }

  function handleNodePointerMove(event, shape) {
    if (!activeDrag || activeDrag.shapeId !== shape.id || event.pointerId !== activeDrag.pointerId) {
      return;
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }
    const gridPoint = mapPointToGrid(localPoint, viewState);
    if (!gridPoint) {
      return;
    }

    event.preventDefault();

    const deltaColumn = gridPoint.column - activeDrag.startPointer.column;
    const deltaRow = gridPoint.row - activeDrag.startPointer.row;

    if (shape.type === 'circle') {
      const proposedCenter = {
        column: activeDrag.origin.column + deltaColumn,
        row: activeDrag.origin.row + deltaRow,
      };
      const resolvedCenter = resolveCircleCenter(proposedCenter, shape.radius, viewState);
      shape.center.column = resolvedCenter.column;
      shape.center.row = resolvedCenter.row;
    } else if (shape.type === 'rectangle') {
      const proposedStart = {
        column: activeDrag.origin.column + deltaColumn,
        row: activeDrag.origin.row + deltaRow,
      };
      const resolvedStart = resolveRectangleStart(proposedStart, shape.length, shape.width, shape.rotation, viewState);
      const deltaStartColumn = resolvedStart.column - activeDrag.origin.column;
      const deltaStartRow = resolvedStart.row - activeDrag.origin.row;
      shape.start.column = resolvedStart.column;
      shape.start.row = resolvedStart.row;
      if (activeDrag.anchorOrigin) {
        const nextAnchor = {
          column: activeDrag.anchorOrigin.column + deltaStartColumn,
          row: activeDrag.anchorOrigin.row + deltaStartRow,
        };
        const clampedAnchor = clampPointToGridBounds(nextAnchor, viewState);
        shape.anchor = { column: clampedAnchor.column, row: clampedAnchor.row };
      } else if (Number.isFinite(shape.anchor?.column) && Number.isFinite(shape.anchor?.row)) {
        const nextAnchor = {
          column: shape.anchor.column + deltaStartColumn,
          row: shape.anchor.row + deltaStartRow,
        };
        const clampedAnchor = clampPointToGridBounds(nextAnchor, viewState);
        shape.anchor.column = clampedAnchor.column;
        shape.anchor.row = clampedAnchor.row;
      }
    } else if (shape.type === 'wall') {
      const originalSquares = Array.isArray(activeDrag.originalSquares) ? activeDrag.originalSquares : [];
      const moveColumn = Math.round(deltaColumn);
      const moveRow = Math.round(deltaRow);
      const clamped = clampWallDelta(originalSquares, moveColumn, moveRow, viewState);
      shape.squares = originalSquares.map((square) => ({
        column: square.column + clamped.column,
        row: square.row + clamped.row,
      }));
    }
    render(viewState);
  }

  function handleNodePointerUp(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore release issues.
    }
    activeDrag = null;
    restoreStatus();
    commitShapes();
  }

  function handleNodePointerCancel(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
      return;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore release issues.
    }
    activeDrag = null;
    restoreStatus();
    render(viewState);
    commitShapes();
  }

  function updateShapeElement(shape, view = viewState) {
    const { root, node, label } = shape.elements;
    if (!view.mapLoaded) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    root.style.setProperty('--vtt-grid-size', `${gridSize}px`);

    if (shape.type === 'wall') {
      updateWallElement(shape, view);
      node.style.left = '0';
      node.style.top = '0';
      node.style.width = '100%';
      node.style.height = '100%';
      return;
    }

    if (shape.type === 'circle') {
      const radius = Math.max(MIN_CIRCLE_RADIUS, shape.radius);
      const diameter = radius * 2;
      const boundsColumn = shape.center.column - radius;
      const boundsRow = shape.center.row - radius;
      const left = offsetLeft + boundsColumn * gridSize;
      const top = offsetTop + boundsRow * gridSize;
      const size = diameter * gridSize;

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.width = `${size}px`;
      root.style.height = `${size}px`;

      const nodeOffset = Math.max(0, (radius - 0.5) * gridSize);
      node.style.left = `${nodeOffset}px`;
      node.style.top = `${nodeOffset}px`;
      node.style.width = `${gridSize}px`;
      node.style.height = `${gridSize}px`;

      label.textContent = `Radius: ${radius.toFixed(1)}`;
      return;
    }

    const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length);
    const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width);
    const rotation = normalizeAngle(shape.rotation ?? 0);
    const centerColumn = shape.start.column + lengthUnits / 2;
    const centerRow = shape.start.row + widthUnits / 2;
    const radians = toRadians(rotation);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const spanWidth = Math.abs(lengthUnits * cos) + Math.abs(widthUnits * sin);
    const spanHeight = Math.abs(lengthUnits * sin) + Math.abs(widthUnits * cos);

    const left = offsetLeft + (centerColumn - spanWidth / 2) * gridSize;
    const top = offsetTop + (centerRow - spanHeight / 2) * gridSize;
    const width = Math.max(gridSize, spanWidth * gridSize);
    const height = Math.max(gridSize, spanHeight * gridSize);

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.setProperty('--vtt-rect-width', `${lengthUnits * gridSize}px`);
    root.style.setProperty('--vtt-rect-height', `${widthUnits * gridSize}px`);
    root.style.setProperty('--vtt-rect-rotation', `${rotation}deg`);

    const nodeSize = gridSize;
    const anchorColumn = Number.isFinite(shape.anchor?.column) ? shape.anchor.column : null;
    const anchorRow = Number.isFinite(shape.anchor?.row) ? shape.anchor.row : null;
    if (anchorColumn !== null && anchorRow !== null) {
      const anchorLocal = gridPointToLocal(anchorColumn + 0.5, anchorRow + 0.5, view);
      const nodeLeft = anchorLocal.x - left - nodeSize / 2;
      const nodeTop = anchorLocal.y - top - nodeSize / 2;
      node.style.left = `${nodeLeft}px`;
      node.style.top = `${nodeTop}px`;
    } else {
      const anchorDistance = widthUnits / 2 + 0.5;
      const offsetXUnits = 0;
      const offsetYUnits = -anchorDistance;
      const rotatedXUnits = offsetXUnits * cos - offsetYUnits * sin;
      const rotatedYUnits = offsetXUnits * sin + offsetYUnits * cos;
      const relativeXUnits = spanWidth / 2 + rotatedXUnits;
      const relativeYUnits = spanHeight / 2 + rotatedYUnits;
      node.style.left = `${relativeXUnits * gridSize - nodeSize / 2}px`;
      node.style.top = `${relativeYUnits * gridSize - nodeSize / 2}px`;
    }
    node.style.width = `${nodeSize}px`;
    node.style.height = `${nodeSize}px`;

    label.textContent = `${lengthUnits.toFixed(1)} × ${widthUnits.toFixed(1)}`;
  }

  function updateLayerVisibility(view = viewState) {
    const visible = Boolean(view.mapLoaded && (shapes.length > 0 || previewShape || placementState));
    layer.hidden = !visible;
    layer.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function nextColor() {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex += 1;
    return color;
  }

  function ensureMenu() {
    if (menuController) {
      return menuController;
    }

    const menu = document.createElement('div');
    menu.className = 'vtt-template-menu';
    menu.hidden = true;

    const title = document.createElement('h3');
    title.className = 'vtt-template-menu__title';
    title.textContent = 'Templates';
    menu.appendChild(title);

    const list = document.createElement('div');
    list.className = 'vtt-template-menu__list';
    menu.appendChild(list);

    let activeType = 'rectangle';

    const circleChoice = document.createElement('button');
    circleChoice.type = 'button';
    circleChoice.className = 'vtt-template-menu__choice';
    circleChoice.textContent = 'Circle';
    circleChoice.dataset.template = 'circle';
    list.appendChild(circleChoice);

    const rectChoice = document.createElement('button');
    rectChoice.type = 'button';
    rectChoice.className = 'vtt-template-menu__choice is-active';
    rectChoice.textContent = 'Rectangle';
    rectChoice.dataset.template = 'rectangle';
    list.appendChild(rectChoice);

    const wallChoice = document.createElement('button');
    wallChoice.type = 'button';
    wallChoice.className = 'vtt-template-menu__choice';
    wallChoice.textContent = 'Wall';
    wallChoice.dataset.template = 'wall';
    list.appendChild(wallChoice);

    const form = document.createElement('form');
    form.className = 'vtt-template-menu__form is-visible';
    menu.appendChild(form);

    const circleField = createNumberField('Radius (squares)', 'radius', { step: '1', min: '0' });
    circleField.input.placeholder = 'Optional';

    const lengthField = createNumberField('Length (squares)', 'length', { step: '1', min: '0' });
    lengthField.input.placeholder = 'Optional';

    const widthField = createNumberField('Width (squares)', 'width', { step: '1', min: '0' });
    widthField.input.placeholder = 'Optional';

    const wallField = createNumberField('Wall squares', 'squares', { step: '1', min: '1' });
    wallField.input.step = '1';
    wallField.input.min = '1';
    wallField.input.inputMode = 'numeric';
    wallField.input.pattern = '\\d*';

    form.appendChild(lengthField.wrapper);
    form.appendChild(widthField.wrapper);

    const actions = document.createElement('div');
    actions.className = 'vtt-template-menu__actions';
    form.appendChild(actions);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'vtt-template-menu__cancel';
    cancelButton.textContent = 'Cancel';
    actions.appendChild(cancelButton);

    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.className = 'vtt-template-menu__confirm';
    confirmButton.textContent = 'Create';
    actions.appendChild(confirmButton);

    function setActiveType(nextType) {
      activeType = nextType;
      circleChoice.classList.toggle('is-active', nextType === 'circle');
      rectChoice.classList.toggle('is-active', nextType === 'rectangle');
      wallChoice.classList.toggle('is-active', nextType === 'wall');

      if (nextType === 'circle') {
        form.replaceChildren(circleField.wrapper, actions);
      } else if (nextType === 'rectangle') {
        form.replaceChildren(lengthField.wrapper, widthField.wrapper, actions);
      } else {
        form.replaceChildren(wallField.wrapper, actions);
      }
    }

    circleChoice.addEventListener('click', () => setActiveType('circle'));
    rectChoice.addEventListener('click', () => setActiveType('rectangle'));
    wallChoice.addEventListener('click', () => setActiveType('wall'));

    cancelButton.addEventListener('click', () => {
      controller.hide();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        radius: parseFieldValue(circleField.input.value),
        length: parseFieldValue(lengthField.input.value),
        width: parseFieldValue(widthField.input.value),
        squares: parseSquareCount(wallField.input.value),
      };
      controller.hide();
      beginPlacement(activeType, values);
    });

    document.body.appendChild(menu);

    function hideMenu() {
      menu.hidden = true;
      templatesButton?.setAttribute('aria-expanded', 'false');
      if (outsideClickHandler) {
        document.removeEventListener('pointerdown', outsideClickHandler, true);
        outsideClickHandler = null;
      }
    }

    const controller = {
      show() {
        const anchor = templatesButton?.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const top = (anchor?.bottom ?? 0) + scrollY + 8;
        let left = (anchor?.left ?? 0) + scrollX;

        menu.hidden = false;
        menu.style.visibility = 'hidden';
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.right = '';

        const viewportWidth = Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0);
        const menuRect = menu.getBoundingClientRect();
        const margin = 16;
        if (menuRect.width && viewportWidth) {
          const anchorRight = (anchor?.right ?? anchor?.left ?? 0) + scrollX;
          const maxLeft = scrollX + viewportWidth - menuRect.width - margin;
          if (left > maxLeft) {
            left = Math.min(anchorRight - menuRect.width, maxLeft);
          }
          if (left < scrollX + margin) {
            left = scrollX + margin;
          }
        }

        menu.style.left = `${left}px`;
        menu.style.visibility = '';
        templatesButton?.setAttribute('aria-expanded', 'true');
        if (!outsideClickHandler) {
          outsideClickHandler = (event) => {
            if (!menu.contains(event.target) && event.target !== templatesButton) {
              hideMenu();
            }
          };
          document.addEventListener('pointerdown', outsideClickHandler, true);
        }
      },
      hide: hideMenu,
      toggle() {
        if (menu.hidden) {
          this.show();
        } else {
          hideMenu();
        }
      },
      isOpen() {
        return !menu.hidden;
      },
    };

    menuController = controller;
    return controller;
  }

  function beginPlacement(type, values) {
    cancelPlacement();
    clearSelection();
    if (type === 'wall') {
      const totalSquares = Number.isInteger(values?.squares)
        ? values.squares
        : parseSquareCount(values?.squares);
      if (!Number.isInteger(totalSquares) || totalSquares <= 0) {
        updateStatus('Enter the number of wall squares to place.');
        placementState = null;
        updateLayerVisibility();
        return;
      }

      placementState = {
        type: 'wall',
        values: { squares: totalSquares },
        stage: 'wall-select',
        pointerId: null,
        start: null,
        squares: [],
      };

      previewShape = createShape('wall', { squares: [] }, { preview: true });
      layer.appendChild(previewShape.elements.root);
      updateStatus('Select the first square for your wall.');
      updateLayerVisibility();
      return;
    }

    placementState = {
      type,
      values,
      stage: 'awaiting-start',
      pointerId: null,
      start: null,
      dynamic: false,
      hasMoved: false,
    };

    if (type === 'circle') {
      const fixedRadius = isFiniteNumber(values.radius)
        ? Math.max(MIN_CIRCLE_RADIUS, values.radius)
        : null;
      placementState.fixedRadius = fixedRadius;
      placementState.dynamic = !isFiniteNumber(values.radius);

      if (fixedRadius !== null) {
        updateStatus('Click the map to place the circle template.');
      } else {
        updateStatus('Click to set the circle center, then drag or move the cursor to size it.');
      }
      updateLayerVisibility();
      return;
    }

    if (type === 'rectangle') {
      const hasLength = isFiniteNumber(values.length);
      const hasWidth = isFiniteNumber(values.width);

      placementState.dynamicLength = !hasLength;
      placementState.dynamicWidth = !hasWidth;
      placementState.fixedLength = hasLength
        ? Math.max(MIN_RECT_DIMENSION, values.length)
        : null;
      placementState.fixedWidth = hasWidth
        ? Math.max(MIN_RECT_DIMENSION, values.width)
        : null;
      placementState.dynamic = !hasLength || !hasWidth;

      if (hasLength && hasWidth) {
        updateStatus('Click the map to place the rectangle template.');
      } else {
        updateStatus('Click to set the rectangle start, then drag or move the cursor to size it.');
      }
      updateLayerVisibility();
    }
  }

  function updateStatus(message) {
    if (!status) {
      return;
    }
    status.textContent = message || defaultStatusText;
  }

  function restoreStatus() {
    if (!status) {
      return;
    }
    if (!placementState && !activeDrag && !selectedId) {
      status.textContent = defaultStatusText;
    }
  }

  function createNumberField(labelText, name, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'vtt-template-menu__field';

    const labelEl = document.createElement('label');
    labelEl.textContent = labelText;
    wrapper.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'number';
    input.name = name;
    input.min = typeof options.min === 'string' ? options.min : String(options.min ?? '0');
    input.step = typeof options.step === 'string' ? options.step : String(options.step ?? '0.5');
    if (typeof options.placeholder === 'string') {
      input.placeholder = options.placeholder;
    }
    wrapper.appendChild(input);

    return { wrapper, input };
  }

  function parseFieldValue(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function parseSquareCount(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function updateRectanglePreview(rectangle) {
    if (!previewShape || previewShape.type !== 'rectangle' || !rectangle) {
      return;
    }

    const start = rectangle.start ?? { column: 0, row: 0 };
    const length = Number.isFinite(rectangle.length) ? rectangle.length : MIN_RECT_DIMENSION;
    const width = Number.isFinite(rectangle.width) ? rectangle.width : MIN_RECT_DIMENSION;

    previewShape.start = { column: start.column, row: start.row };
    previewShape.length = Math.max(0, length);
    previewShape.width = Math.max(0, width);
    previewShape.rotation = 0;
    if (Number.isFinite(rectangle.anchor?.column) && Number.isFinite(rectangle.anchor?.row)) {
      const clampedAnchor = clampPointToGridBounds(rectangle.anchor, viewState);
      previewShape.anchor = { column: clampedAnchor.column, row: clampedAnchor.row };
    }
    if (Number.isFinite(rectangle.orientation?.x) || Number.isFinite(rectangle.orientation?.y)) {
      const orientationX = Number.isFinite(rectangle.orientation?.x)
        ? rectangle.orientation.x >= 0
          ? 1
          : -1
        : previewShape.orientation?.x ?? 1;
      const orientationY = Number.isFinite(rectangle.orientation?.y)
        ? rectangle.orientation.y >= 0
          ? 1
          : -1
        : previewShape.orientation?.y ?? 1;
      previewShape.orientation = { x: orientationX, y: orientationY };
    }
    render(viewState);
  }

  function computeRectangleFromAnchor(anchor, target, options = {}) {
    const view = options.view ?? viewState;
    const bounds = getGridBounds(view);
    const anchorPoint = clampPointToGridBounds(anchor ?? { column: 0, row: 0 }, view);
    const targetPoint = clampPointToGridBounds(target ?? anchorPoint, view);

    const deltaColumn = targetPoint.column - anchorPoint.column;
    const deltaRow = targetPoint.row - anchorPoint.row;

    const lastOrientation = options.lastOrientation ?? { x: 1, y: 1 };
    const orientationX = Math.abs(deltaColumn) < 0.0001 ? lastOrientation.x ?? 1 : deltaColumn >= 0 ? 1 : -1;
    const orientationY = Math.abs(deltaRow) < 0.0001 ? lastOrientation.y ?? 1 : deltaRow >= 0 ? 1 : -1;

    const fixedLength = Number.isFinite(options.fixedLength)
      ? Math.max(MIN_RECT_DIMENSION, options.fixedLength)
      : MIN_RECT_DIMENSION;
    const fixedWidth = Number.isFinite(options.fixedWidth)
      ? Math.max(MIN_RECT_DIMENSION, options.fixedWidth)
      : MIN_RECT_DIMENSION;

    const baseLength = options.dynamicLength === false
      ? fixedLength
      : Math.max(MIN_RECT_DIMENSION, Math.abs(deltaColumn));
    const baseWidth = options.dynamicWidth === false
      ? fixedWidth
      : Math.max(MIN_RECT_DIMENSION, Math.abs(deltaRow));

    const resolved = clampRectangleWithAnchor(anchorPoint, { x: orientationX, y: orientationY }, baseLength, baseWidth, bounds);
    return {
      start: resolved.start,
      length: resolved.length,
      width: resolved.width,
      orientation: resolved.orientation,
    };
  }

  function clampRectangleWithAnchor(anchor, orientation, length, width, bounds) {
    const anchorColumn = Number.isFinite(anchor?.column) ? anchor.column : 0;
    const anchorRow = Number.isFinite(anchor?.row) ? anchor.row : 0;
    let dirX = orientation?.x >= 0 ? 1 : -1;
    let dirY = orientation?.y >= 0 ? 1 : -1;

    const totalColumns = Number.isFinite(bounds.columns) ? bounds.columns : 0;
    const totalRows = Number.isFinite(bounds.rows) ? bounds.rows : 0;

    const rawPositiveColumns = Math.max(0, totalColumns - anchorColumn);
    const rawNegativeColumns = Math.max(0, anchorColumn);
    if (dirX >= 0 && rawPositiveColumns <= 0) {
      dirX = -1;
    }
    if (dirX < 0 && rawNegativeColumns <= 0) {
      dirX = 1;
    }

    const rawPositiveRows = Math.max(0, totalRows - anchorRow);
    const rawNegativeRows = Math.max(0, anchorRow);
    if (dirY >= 0 && rawPositiveRows <= 0) {
      dirY = -1;
    }
    if (dirY < 0 && rawNegativeRows <= 0) {
      dirY = 1;
    }

    const maxPositiveColumns = Math.max(MIN_RECT_DIMENSION, rawPositiveColumns);
    const maxNegativeColumns = Math.max(MIN_RECT_DIMENSION, rawNegativeColumns + 1);
    const maxPositiveRows = Math.max(MIN_RECT_DIMENSION, rawPositiveRows);
    const maxNegativeRows = Math.max(MIN_RECT_DIMENSION, rawNegativeRows + 1);

    const maxLength = dirX >= 0 ? maxPositiveColumns : maxNegativeColumns;
    const maxWidth = dirY >= 0 ? maxPositiveRows : maxNegativeRows;

    const clampedLength = clamp(length, MIN_RECT_DIMENSION, maxLength);
    const clampedWidth = clamp(width, MIN_RECT_DIMENSION, maxWidth);

    const startColumn = dirX >= 0 ? anchorColumn : anchorColumn - (clampedLength - 1);
    const startRow = dirY >= 0 ? anchorRow : anchorRow - (clampedWidth - 1);

    return {
      start: { column: startColumn, row: startRow },
      length: clampedLength,
      width: clampedWidth,
      orientation: { x: dirX, y: dirY },
    };
  }

  function getGridBounds(view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return { columns: 0, rows: 0 };
    }

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return { columns: 0, rows: 0 };
    }

    const columns = innerWidth / gridSize;
    const rows = innerHeight / gridSize;
    return {
      columns: Number.isFinite(columns) ? columns : 0,
      rows: Number.isFinite(rows) ? rows : 0,
    };
  }

  function clampPointToGridBounds(point, view = viewState) {
    const bounds = getGridBounds(view);
    const column = clamp(Number.isFinite(point?.column) ? point.column : 0, 0, bounds.columns);
    const row = clamp(Number.isFinite(point?.row) ? point.row : 0, 0, bounds.rows);
    return { column, row };
  }

  function handleWallPlacement(gridPoint) {
    const square = snapWallSquare(gridPoint, viewState);
    if (!square) {
      return;
    }

    if (!Array.isArray(placementState.squares)) {
      placementState.squares = [];
    }

    if (placementState.squares.some((existing) => existing.column === square.column && existing.row === square.row)) {
      return;
    }

    if (placementState.squares.length > 0 && !isWallSquareAdjacent(square, placementState.squares)) {
      updateStatus('Select an adjacent square to continue the wall.');
      return;
    }

    placementState.squares.push(square);
    updateWallPreviewShape(placementState.squares);

    const total = Number.isInteger(placementState.values?.squares) ? placementState.values.squares : placementState.squares.length;
    const remaining = Math.max(0, total - placementState.squares.length);
    if (remaining <= 0) {
      finalizePlacement({ type: 'wall', squares: placementState.squares.slice() });
      return;
    }

    updateStatus(`Wall squares remaining: ${remaining}.`);
  }

  function snapWallSquare(gridPoint, view = viewState) {
    const bounds = getMapGridBounds(view);
    if (!bounds) {
      return null;
    }
    const column = Math.floor(gridPoint.column);
    const row = Math.floor(gridPoint.row);
    if (column < 0 || row < 0 || column >= bounds.columns || row >= bounds.rows) {
      return null;
    }
    return { column, row };
  }

  function isWallSquareAdjacent(candidate, existing = []) {
    return existing.some((square) => {
      const dx = Math.abs(square.column - candidate.column);
      const dy = Math.abs(square.row - candidate.row);
      return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
    });
  }

  function updateWallPreviewShape(squares) {
    const sanitized = sanitizeWallSquares(squares);
    if (!previewShape || previewShape.type !== 'wall') {
      clearPreview();
      previewShape = createShape('wall', { squares: sanitized }, { preview: true });
      layer.appendChild(previewShape.elements.root);
    } else {
      previewShape.squares = sanitized;
    }
    render(viewState);
    updateLayerVisibility();
  }

  function sanitizeWallSquares(input = []) {
    if (!Array.isArray(input)) {
      return [];
    }
    const seen = new Set();
    const result = [];
    input.forEach((square) => {
      const column = Number.isFinite(square?.column) ? Math.floor(square.column) : null;
      const row = Number.isFinite(square?.row) ? Math.floor(square.row) : null;
      if (column === null || row === null) {
        return;
      }
      const key = `${column},${row}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push({ column, row });
    });
    return result;
  }

  function clampWallSquares(squares, view = viewState) {
    const bounds = getMapGridBounds(view);
    const sanitized = sanitizeWallSquares(squares);
    if (!bounds) {
      return sanitized;
    }
    return sanitized.filter((square) => {
      return square.column >= 0 && square.column < bounds.columns && square.row >= 0 && square.row < bounds.rows;
    });
  }

  function getMapGridBounds(view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return null;
    }

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null;
    }

    const columns = Math.max(0, Math.floor(innerWidth / gridSize));
    const rows = Math.max(0, Math.floor(innerHeight / gridSize));
    if (columns === 0 || rows === 0) {
      return null;
    }

    return { columns, rows, gridSize, offsetLeft, offsetTop };
  }

  function clampWallDelta(originalSquares = [], deltaColumn, deltaRow, view = viewState) {
    const bounds = getMapGridBounds(view);
    if (!bounds || !Array.isArray(originalSquares) || originalSquares.length === 0) {
      return { column: 0, row: 0 };
    }

    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    originalSquares.forEach((square) => {
      if (!square) {
        return;
      }
      if (square.column < minCol) {
        minCol = square.column;
      }
      if (square.column > maxCol) {
        maxCol = square.column;
      }
      if (square.row < minRow) {
        minRow = square.row;
      }
      if (square.row > maxRow) {
        maxRow = square.row;
      }
    });

    if (!Number.isFinite(minCol) || !Number.isFinite(minRow)) {
      return { column: 0, row: 0 };
    }

    const maxRight = bounds.columns - 1 - maxCol;
    const maxLeft = -minCol;
    const maxDown = bounds.rows - 1 - maxRow;
    const maxUp = -minRow;

    const clampedColumn = Math.max(Math.min(deltaColumn, maxRight), maxLeft);
    const clampedRow = Math.max(Math.min(deltaRow, maxDown), maxUp);
    return { column: clampedColumn, row: clampedRow };
  }

  function updateWallElement(shape, view = viewState) {
    const squares = clampWallSquares(shape.squares, view);
    if (!view.mapLoaded || squares.length === 0) {
      shape.elements.root.hidden = true;
      shape.elements.root.setAttribute('aria-hidden', 'true');
      return;
    }

    shape.squares = squares;
    const bounds = getMapGridBounds(view);
    if (!bounds) {
      shape.elements.root.hidden = true;
      shape.elements.root.setAttribute('aria-hidden', 'true');
      return;
    }

    const minColumn = Math.min(...squares.map((square) => square.column));
    const maxColumn = Math.max(...squares.map((square) => square.column)) + 1;
    const minRow = Math.min(...squares.map((square) => square.row));
    const maxRow = Math.max(...squares.map((square) => square.row)) + 1;

    const left = bounds.offsetLeft + minColumn * bounds.gridSize;
    const top = bounds.offsetTop + minRow * bounds.gridSize;
    const width = Math.max(bounds.gridSize, (maxColumn - minColumn) * bounds.gridSize);
    const height = Math.max(bounds.gridSize, (maxRow - minRow) * bounds.gridSize);

    const root = shape.elements.root;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.setProperty('--vtt-wall-grid', `${bounds.gridSize}px`);

    const container = shape.elements.tileContainer;
    if (!container) {
      return;
    }

    const tilesMap = shape.elements.tiles ?? new Map();
    const connectorsMap = shape.elements.connectors ?? new Map();
    shape.elements.tiles = tilesMap;
    shape.elements.connectors = connectorsMap;

    const activeTileKeys = new Set();
    squares.forEach((square) => {
      const key = `${square.column},${square.row}`;
      activeTileKeys.add(key);
      let tile = tilesMap.get(key);
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'vtt-wall__tile';
        container.appendChild(tile);
        tilesMap.set(key, tile);
      }
      const localLeft = (square.column - minColumn) * bounds.gridSize;
      const localTop = (square.row - minRow) * bounds.gridSize;
      tile.style.left = `${localLeft}px`;
      tile.style.top = `${localTop}px`;
      tile.style.width = `${bounds.gridSize}px`;
      tile.style.height = `${bounds.gridSize}px`;
    });

    tilesMap.forEach((tile, key) => {
      if (!activeTileKeys.has(key)) {
        tile.remove();
        tilesMap.delete(key);
      }
    });

    const connectorKeys = new Set();
    const squareKeySet = new Set(squares.map((square) => `${square.column},${square.row}`));
    squares.forEach((square) => {
      const southEastKey = `${square.column + 1},${square.row + 1}`;
      if (squareKeySet.has(southEastKey)) {
        const key = ensureWallConnector(shape, bounds, { column: square.column, row: square.row }, { column: square.column + 1, row: square.row + 1 }, 'se', minColumn, minRow);
        if (key) {
          connectorKeys.add(key);
        }
      }

      const northEastKey = `${square.column + 1},${square.row - 1}`;
      if (squareKeySet.has(northEastKey)) {
        const key = ensureWallConnector(shape, bounds, { column: square.column, row: square.row }, { column: square.column + 1, row: square.row - 1 }, 'ne', minColumn, minRow);
        if (key) {
          connectorKeys.add(key);
        }
      }
    });

    connectorsMap.forEach((element, key) => {
      if (!connectorKeys.has(key)) {
        element.remove();
        connectorsMap.delete(key);
      }
    });

    if (shape.elements.label) {
      const count = squares.length;
      shape.elements.label.textContent = `${count} square${count === 1 ? '' : 's'}`;
    }
  }

  function ensureWallConnector(shape, bounds, startSquare, endSquare, orientation, minColumn, minRow) {
    const container = shape.elements.tileContainer;
    if (!container) {
      return null;
    }

    const connectorsMap = shape.elements.connectors ?? new Map();
    shape.elements.connectors = connectorsMap;

    const baseColumn = Math.min(startSquare.column, endSquare.column);
    const baseRow = Math.min(startSquare.row, endSquare.row);
    const key = `diag:${baseColumn},${baseRow}:${orientation}`;
    let connector = connectorsMap.get(key);
    if (!connector) {
      connector = document.createElement('div');
      connector.className = `vtt-wall__connector vtt-wall__connector--${orientation}`;
      container.appendChild(connector);
      connectorsMap.set(key, connector);
    }

    const midColumn = ((startSquare.column + endSquare.column) / 2) + 0.5;
    const midRow = ((startSquare.row + endSquare.row) / 2) + 0.5;
    const localLeft = (midColumn - minColumn) * bounds.gridSize;
    const localTop = (midRow - minRow) * bounds.gridSize;

    const connectorWidth = bounds.gridSize * Math.SQRT2;
    const connectorThickness = bounds.gridSize;
    connector.style.width = `${connectorWidth}px`;
    connector.style.height = `${connectorThickness}px`;
    connector.style.left = `${localLeft - connectorWidth / 2}px`;
    connector.style.top = `${localTop - connectorThickness / 2}px`;

    return key;
  }

  function snapToStep(value, step, mode = 'round') {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (mode === 'floor') {
      return Math.floor(value / step) * step;
    }
    if (mode === 'ceil') {
      return Math.ceil(value / step) * step;
    }
    return Math.round(value / step) * step;
  }

  function snapToHalf(value) {
    return snapToStep(value, 0.5);
  }

  function snapPointToGrid(point, options = {}) {
    const step = Number.isFinite(options.step) && options.step > 0 ? options.step : 0.5;
    const mode = options.mode === 'floor' ? 'floor' : options.mode === 'ceil' ? 'ceil' : 'round';
    if (!point) {
      return { column: 0, row: 0 };
    }
    return {
      column: snapToStep(point.column ?? 0, step, mode),
      row: snapToStep(point.row ?? 0, step, mode),
    };
  }

  function normalizeAngle(angle) {
    if (!Number.isFinite(angle)) {
      return 0;
    }
    let normalized = angle % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  }

  function snapAngle(angle, increment) {
    if (!Number.isFinite(angle) || !Number.isFinite(increment) || increment <= 0) {
      return angle;
    }
    return Math.round(angle / increment) * increment;
  }

  function toRadians(angle) {
    return (angle * Math.PI) / 180;
  }

  function toDegrees(radians) {
    return (radians * 180) / Math.PI;
  }

  function rectangleCenterFromStart(start, length, width) {
    return {
      column: (start?.column ?? 0) + length / 2,
      row: (start?.row ?? 0) + width / 2,
    };
  }

  function rectangleStartFromCenter(center, length, width) {
    return {
      column: (center?.column ?? 0) - length / 2,
      row: (center?.row ?? 0) - width / 2,
    };
  }

  function resolveRectangleStart(start, length, width, rotation = 0, view = viewState) {
    const lengthUnits = Math.max(MIN_RECT_DIMENSION, Number.isFinite(length) ? length : MIN_RECT_DIMENSION);
    const widthUnits = Math.max(MIN_RECT_DIMENSION, Number.isFinite(width) ? width : MIN_RECT_DIMENSION);
    const normalizedRotation = Number.isFinite(rotation) ? normalizeAngle(rotation) : 0;
    const snappedStart = snapPointToGrid(start, { step: 1, mode: 'floor' });
    const clamped = clampRectanglePosition(snappedStart, lengthUnits, widthUnits, normalizedRotation, view);
    const snappedAgain = snapPointToGrid(clamped, { step: 1, mode: 'floor' });
    return clampRectanglePosition(snappedAgain, lengthUnits, widthUnits, normalizedRotation, view);
  }

  function resolveCircleCenter(center, radius, view = viewState) {
    const radiusUnits = Math.max(MIN_CIRCLE_RADIUS, Number.isFinite(radius) ? radius : MIN_CIRCLE_RADIUS);
    const snapped = snapPointToGrid(center);
    const clamped = clampCircleCenter(snapped, radiusUnits, view);
    const snappedAgain = snapPointToGrid(clamped);
    return clampCircleCenter(snappedAgain, radiusUnits, view);
  }

  function gridPointToLocal(column, row, view = viewState) {
    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
    return {
      x: offsetLeft + column * gridSize,
      y: offsetTop + row * gridSize,
    };
  }

  function rectangleCenterToLocal(shape, view = viewState) {
    if (!shape) {
      return null;
    }
    const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length ?? MIN_RECT_DIMENSION);
    const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width ?? MIN_RECT_DIMENSION);
    const center = rectangleCenterFromStart(shape.start ?? { column: 0, row: 0 }, lengthUnits, widthUnits);
    return gridPointToLocal(center.column, center.row, view);
  }

  function rectangleAnchorToLocal(shape, view = viewState) {
    if (!shape) {
      return null;
    }
    const anchorColumn = Number.isFinite(shape.anchor?.column) ? shape.anchor.column : null;
    const anchorRow = Number.isFinite(shape.anchor?.row) ? shape.anchor.row : null;
    if (anchorColumn === null || anchorRow === null) {
      return null;
    }
    return gridPointToLocal(anchorColumn + 0.5, anchorRow + 0.5, view);
  }

  function rectangleAnchorVector(shape) {
    if (!shape) {
      return null;
    }
    const anchorColumn = Number.isFinite(shape.anchor?.column) ? shape.anchor.column : null;
    const anchorRow = Number.isFinite(shape.anchor?.row) ? shape.anchor.row : null;
    const startColumn = Number.isFinite(shape.start?.column) ? shape.start.column : null;
    const startRow = Number.isFinite(shape.start?.row) ? shape.start.row : null;
    if (anchorColumn === null || anchorRow === null || startColumn === null || startRow === null) {
      return null;
    }
    const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length ?? MIN_RECT_DIMENSION);
    const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width ?? MIN_RECT_DIMENSION);
    const offsetColumn = anchorColumn - startColumn;
    const offsetRow = anchorRow - startRow;
    return {
      x: offsetColumn + 0.5 - lengthUnits / 2,
      y: offsetRow + 0.5 - widthUnits / 2,
    };
  }

  function clampRectanglePosition(start, length, width, rotation = 0, view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return { column: start.column, row: start.row };
    }
    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return { column: start.column, row: start.row };
    }

    const lengthUnits = Math.max(MIN_RECT_DIMENSION, Number.isFinite(length) ? length : MIN_RECT_DIMENSION);
    const widthUnits = Math.max(MIN_RECT_DIMENSION, Number.isFinite(width) ? width : MIN_RECT_DIMENSION);
    const center = rectangleCenterFromStart(start, lengthUnits, widthUnits);
    const clampedCenter = clampRectangleCenter(center, lengthUnits, widthUnits, rotation, view);
    return rectangleStartFromCenter(clampedCenter, lengthUnits, widthUnits);
  }

  function clampRectangleCenter(center, length, width, rotation = 0, view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return { column: center.column, row: center.row };
    }

    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return { column: center.column, row: center.row };
    }

    const availableColumns = innerWidth / gridSize;
    const availableRows = innerHeight / gridSize;
    if (!Number.isFinite(availableColumns) || !Number.isFinite(availableRows) || availableColumns <= 0 || availableRows <= 0) {
      return { column: center.column, row: center.row };
    }

    const radians = toRadians(rotation);
    const spanWidth = Math.abs(length * Math.cos(radians)) + Math.abs(width * Math.sin(radians));
    const spanHeight = Math.abs(length * Math.sin(radians)) + Math.abs(width * Math.cos(radians));
    const halfWidth = Math.max(0, spanWidth / 2);
    const halfHeight = Math.max(0, spanHeight / 2);

    const minColumn = halfWidth;
    const maxColumn = Math.max(halfWidth, availableColumns - halfWidth);
    const minRow = halfHeight;
    const maxRow = Math.max(halfHeight, availableRows - halfHeight);

    return {
      column: clamp(center.column, minColumn, maxColumn),
      row: clamp(center.row, minRow, maxRow),
    };
  }

  function clampCircleCenter(center, radius, view = viewState) {
    const mapWidth = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return { column: center.column, row: center.row };
    }
    const offsets = view.gridOffsets ?? {};
    const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
    const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
    const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
    const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
    const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);

    const innerWidth = Math.max(0, mapWidth - offsetLeft - offsetRight);
    const innerHeight = Math.max(0, mapHeight - offsetTop - offsetBottom);
    if (innerWidth <= 0 || innerHeight <= 0) {
      return { column: center.column, row: center.row };
    }

    const maxColumn = Math.max(radius, innerWidth / gridSize - radius);
    const maxRow = Math.max(radius, innerHeight / gridSize - radius);

    return {
      column: clamp(center.column, radius, maxColumn),
      row: clamp(center.row, radius, maxRow),
    };
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  return {
    render,
    reset,
    notifyGridChanged,
    notifyMapState,
    cancelPlacement,
    handleKeydown,
    clearSelection,
  };
}

  function createPlacementId() {
    if (window.crypto?.randomUUID) {
      return `tpl_${window.crypto.randomUUID()}`;
    }

    const random = Math.floor(Math.random() * 1000000);
    return `tpl_${Date.now().toString(36)}_${random.toString(36)}`;
  }

  function parseTokenSize(rawSize) {
    if (typeof rawSize !== 'string') {
      return { width: 1, height: 1, formatted: '1x1' };
    }

    const trimmed = rawSize.trim().toLowerCase();
    const match = trimmed.match(/^([1-9][0-9]*)x([1-9][0-9]*)$/);
    if (!match) {
      return { width: 1, height: 1, formatted: '1x1' };
    }

    const width = Math.max(1, Number.parseInt(match[1], 10));
    const height = Math.max(1, Number.parseInt(match[2], 10));
    return { width, height, formatted: `${width}x${height}` };
  }

  return {
    getViewState: () => viewState,
    __testing: {
      openTokenSettingsById,
      getTokenSettingsMenu: () => tokenSettingsMenu,
    },
  };
}

function normalizeSceneState(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  return {
    folders: Array.isArray(raw?.folders) ? raw.folders : [],
    items: Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.scenes)
      ? raw.scenes
      : [],
  };
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
