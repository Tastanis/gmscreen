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
}

/**
 * Handle incoming state update from Pusher.
 */
function handleStateUpdated(data) {
  if (!data || typeof data !== 'object') {
    console.warn('[VTT Pusher] Invalid state update received');
    return;
  }

  const {
    version,
    timestamp,
    authorId,
    authorRole,
    changedFields,
    placements,
    templates,
    drawings,
    pings,
    sceneState,
    activeSceneId,
    mapUrl,
    overlay,
  } = data;

  // Version check - skip if we've already applied a newer version
  if (typeof version === 'number' && version <= lastAppliedVersion) {
    console.log('[VTT Pusher] Skipping stale update, version:', version, 'current:', lastAppliedVersion);
    return;
  }

  // Self-update check - skip if this update was authored by the current user
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

  console.log('[VTT Pusher] Applying update, version:', version, 'author:', authorId);

  // Build delta update object
  const delta = {
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

  // Update last applied version
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
