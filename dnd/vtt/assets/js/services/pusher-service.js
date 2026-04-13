/**
 * Pusher real-time synchronization service for VTT.
 *
 * This module handles:
 * - Pusher connection initialization
 * - Channel subscription and event binding
 * - State update application with version checking
 * - Reconnection and resync logic
 * - Deduplication of own updates
 */

// Pusher instance (singleton)
let pusherInstance = null;
let pusherChannel = null;
let currentSocketId = null;
let lastAppliedVersion = 0;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Callback functions set by the caller
let onStateUpdateCallback = null;
let onConnectionStateChangeCallback = null;
let getCurrentUserIdFn = () => null;
let getLastVersionFn = () => 0;

/**
 * Initialize Pusher connection and subscribe to the VTT channel.
 *
 * @param {Object} options Configuration options
 * @param {string} options.key Pusher application key
 * @param {string} options.cluster Pusher cluster
 * @param {string} options.channel Channel name to subscribe to
 * @param {Function} options.onStateUpdate Callback for state updates
 * @param {Function} options.onConnectionStateChange Callback for connection state changes
 * @param {Function} options.getCurrentUserId Function to get current user ID
 * @param {Function} options.getLastVersion Function to get last known version
 * @returns {Object} Pusher control interface
 */
export function initializePusher({
  key,
  cluster,
  channel,
  onStateUpdate,
  onConnectionStateChange,
  getCurrentUserId,
  getLastVersion,
} = {}) {
  // Check if Pusher is available
  if (typeof window === 'undefined' || typeof window.Pusher !== 'function') {
    console.warn('[VTT Pusher] Pusher library not available');
    return createNullInterface();
  }

  // Validate configuration
  if (!key || !cluster || !channel) {
    console.warn('[VTT Pusher] Missing required configuration');
    return createNullInterface();
  }

  // Store callbacks
  onStateUpdateCallback = onStateUpdate;
  onConnectionStateChangeCallback = onConnectionStateChange;
  getCurrentUserIdFn = getCurrentUserId || (() => null);
  getLastVersionFn = getLastVersion || (() => 0);

  // Initialize version from current state
  lastAppliedVersion = getLastVersionFn();

  try {
    // Create Pusher instance
    pusherInstance = new window.Pusher(key, {
      cluster,
      // Enable encrypted connection
      forceTLS: true,
      // Disable stats for privacy
      disableStats: true,
    });

    // Bind connection state events
    pusherInstance.connection.bind('connected', handleConnected);
    pusherInstance.connection.bind('disconnected', handleDisconnected);
    pusherInstance.connection.bind('error', handleError);
    pusherInstance.connection.bind('state_change', handleStateChange);

    // "Ready" promise: resolves the first time Pusher reports 'connected',
    // or after a short timeout so callers waiting on it don't block the UI
    // indefinitely when Pusher can't connect. Callers can use this to
    // sequence initialization (e.g. starting the poller only after the
    // connection state is known).
    let readyResolver;
    let readyTimeout;
    const readyPromise = new Promise((resolve) => {
      readyResolver = resolve;
    });

    pusherInstance.connection.bind('connected', () => {
      if (readyResolver) {
        readyResolver({ connected: true });
        readyResolver = null;
        if (readyTimeout) {
          clearTimeout(readyTimeout);
          readyTimeout = null;
        }
      }
    });

    readyTimeout = setTimeout(() => {
      if (readyResolver) {
        readyResolver({ connected: false, reason: 'timeout' });
        readyResolver = null;
      }
    }, 2500);

    // Subscribe to channel
    pusherChannel = pusherInstance.subscribe(channel);

    // Bind to state-updated event
    pusherChannel.bind('state-updated', handleStateUpdated);

    // Bind subscription events
    pusherChannel.bind('pusher:subscription_succeeded', () => {
      console.log('[VTT Pusher] Subscribed to channel:', channel);
      reconnectAttempts = 0;
    });

    pusherChannel.bind('pusher:subscription_error', (error) => {
      console.error('[VTT Pusher] Subscription error:', error);
    });

    console.log('[VTT Pusher] Initialized with channel:', channel);

    return {
      getSocketId,
      disconnect,
      isConnected: () => isConnected,
      getLastAppliedVersion: () => lastAppliedVersion,
      setLastAppliedVersion: (version) => {
        if (typeof version === 'number' && version > lastAppliedVersion) {
          lastAppliedVersion = version;
        }
      },
      ready: readyPromise,
    };
  } catch (error) {
    console.error('[VTT Pusher] Initialization failed:', error);
    return createNullInterface();
  }
}

/**
 * Handle successful connection.
 */
function handleConnected() {
  isConnected = true;
  currentSocketId = pusherInstance?.connection?.socket_id || null;
  reconnectAttempts = 0;
  console.log('[VTT Pusher] Connected, socket ID:', currentSocketId);

  if (typeof onConnectionStateChangeCallback === 'function') {
    onConnectionStateChangeCallback({
      connected: true,
      socketId: currentSocketId,
    });
  }
}

/**
 * Handle disconnection.
 */
function handleDisconnected() {
  isConnected = false;
  // Clear the cached socket ID — on reconnect Pusher assigns a new one,
  // and any save that happens while we are disconnected must not carry
  // a stale socket ID.
  currentSocketId = null;
  console.log('[VTT Pusher] Disconnected');

  if (typeof onConnectionStateChangeCallback === 'function') {
    onConnectionStateChangeCallback({
      connected: false,
      socketId: null,
    });
  }
}

/**
 * Handle connection errors.
 */
function handleError(error) {
  console.error('[VTT Pusher] Connection error:', error);
  reconnectAttempts++;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('[VTT Pusher] Max reconnection attempts reached, falling back to polling');
  }
}

/**
 * Handle connection state changes.
 */
function handleStateChange(states) {
  console.log('[VTT Pusher] State change:', states.previous, '->', states.current);

  // Keep currentSocketId in sync with the connection state. This is the
  // single source of truth for the cached socket ID. Any state that is
  // not 'connected' means we do not currently hold a valid socket and
  // must not advertise one on saves.
  if (states && typeof states === 'object') {
    if (states.current === 'connected') {
      currentSocketId = pusherInstance?.connection?.socket_id || null;
    } else if (
      states.current === 'disconnected' ||
      states.current === 'failed' ||
      states.current === 'unavailable' ||
      states.current === 'connecting'
    ) {
      currentSocketId = null;
    }
  }
}

/**
 * Handle incoming state update from Pusher.
 *
 * Phase 3-C: Inspect `data.type` and dispatch:
 *   - `'ops'`           — compact delta-op broadcast. Pass `type` and
 *                          `ops` straight through to the consumer; do
 *                          not unpack the (absent) full-state fields.
 *   - `'ops-overflow'`  — the server tried to broadcast ops but the
 *                          payload exceeded the 10 KB Pusher limit.
 *                          Pass through so the consumer can trigger a
 *                          full GET resync.
 *   - `'full'` / absent — the legacy full-state broadcast shape. Unpack
 *                          placements/templates/drawings/etc. exactly
 *                          as before. Older messages without a `type`
 *                          field still flow through this branch.
 */
function handleStateUpdated(data) {
  if (!data || typeof data !== 'object') {
    console.warn('[VTT Pusher] Invalid state update received');
    return;
  }

  const {
    type,
    version,
    timestamp,
    authorId,
    authorRole,
    changedFields,
    ops,
    placements,
    templates,
    drawings,
    replaceDrawings,
    pings,
    sceneState,
    activeSceneId,
    mapUrl,
    overlay,
  } = data;

  // Version check - skip if we've already applied a newer version.
  // Applies uniformly to ops, ops-overflow, and full-state broadcasts.
  if (typeof version === 'number' && version <= lastAppliedVersion) {
    console.log('[VTT Pusher] Skipping stale update, version:', version, 'current:', lastAppliedVersion);
    return;
  }

  // Self-update check - skip if this update was authored by the current
  // user. The same rule applies to ops broadcasts: the author already
  // got the new state in their save response and re-applying their own
  // ops is redundant. The `_socketId` exclusion at the Pusher layer is
  // the first line of defense; this is the second.
  const currentUserId = normalizeUserId(getCurrentUserIdFn());
  const updateAuthorId = normalizeUserId(authorId);

  if (currentUserId && updateAuthorId && currentUserId === updateAuthorId) {
    console.log('[VTT Pusher] Skipping own update');
    // Still update version even for own updates
    if (typeof version === 'number') {
      lastAppliedVersion = version;
    }
    return;
  }

  console.log('[VTT Pusher] Applying update, version:', version, 'author:', authorId, 'type:', type || 'full');

  // Build the delta object handed to the consumer. The shape is
  // discriminated by `type` so the consumer can decide whether to run
  // the op-applier or the full-state merge.
  let delta;
  if (type === 'ops') {
    delta = {
      type: 'ops',
      version,
      timestamp,
      authorId,
      authorRole,
      ops: Array.isArray(ops) ? ops : [],
    };
  } else if (type === 'ops-overflow') {
    delta = {
      type: 'ops-overflow',
      version,
      timestamp,
      authorId,
      authorRole,
    };
  } else {
    // 'full' or undefined — legacy full-state broadcast.
    delta = {
      type: 'full',
      version,
      timestamp,
      authorId,
      authorRole,
      changedFields: changedFields || [],
    };

    if (placements !== undefined) {
      delta.placements = placements;
    }
    if (templates !== undefined) {
      delta.templates = templates;
    }
    if (drawings !== undefined) {
      delta.drawings = drawings;
    }
    // List of scene IDs whose drawings array should be fully replaced
    // (erase/clear/undo). Forwarded so the consumer's drawings merge can
    // drop entries absent from the broadcast for those scenes; normal
    // additive draw broadcasts omit this field.
    if (Array.isArray(replaceDrawings) && replaceDrawings.length > 0) {
      delta.replaceDrawings = replaceDrawings;
    }
    if (pings !== undefined) {
      delta.pings = pings;
    }
    if (sceneState !== undefined) {
      delta.sceneState = sceneState;
    }
    if (activeSceneId !== undefined) {
      delta.activeSceneId = activeSceneId;
    }
    if (mapUrl !== undefined) {
      delta.mapUrl = mapUrl;
    }
    if (overlay !== undefined) {
      delta.overlay = overlay;
    }
  }

  // Update last applied version. We bump even before the consumer
  // applies because the consumer's own staleness/gap rules use the
  // store's `currentBoardStateVersion` (independent of this counter)
  // and a resync will reconcile both. Bumping here also lets the
  // pusher-service drop any *strictly older* follow-up broadcasts
  // that arrive while the consumer is still mid-apply.
  if (typeof version === 'number') {
    lastAppliedVersion = version;
  }

  // Call the state update callback
  if (typeof onStateUpdateCallback === 'function') {
    try {
      onStateUpdateCallback(delta);
    } catch (error) {
      console.error('[VTT Pusher] State update callback failed:', error);
    }
  }
}

/**
 * Normalize user ID for comparison.
 */
function normalizeUserId(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  return value.trim().toLowerCase();
}

/**
 * Get the current socket ID (for excluding self from broadcasts).
 */
export function getSocketId() {
  return currentSocketId;
}

/**
 * Disconnect from Pusher.
 */
export function disconnect() {
  if (pusherChannel) {
    pusherChannel.unbind_all();
  }
  if (pusherInstance) {
    pusherInstance.disconnect();
  }
  pusherInstance = null;
  pusherChannel = null;
  currentSocketId = null;
  isConnected = false;
  console.log('[VTT Pusher] Disconnected');
}

/**
 * Create a null interface for when Pusher is not available.
 */
function createNullInterface() {
  return {
    getSocketId: () => null,
    disconnect: () => {},
    isConnected: () => false,
    getLastAppliedVersion: () => 0,
    setLastAppliedVersion: () => {},
    ready: Promise.resolve({ connected: false, reason: 'unavailable' }),
  };
}

/**
 * Check if Pusher is connected.
 */
export function isPusherConnected() {
  return isConnected;
}

/**
 * Get the current Pusher instance (for advanced usage).
 */
export function getPusherInstance() {
  return pusherInstance;
}
