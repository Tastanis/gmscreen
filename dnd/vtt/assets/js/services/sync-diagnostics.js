const MAX_RECENT_EVENTS = 120;

const DEFAULT_COUNTERS = Object.freeze([
  'pageLoads',
  'pageReloads',
  'legacySavesQueued',
  'legacySaveAttempts',
  'legacySavesSucceeded',
  'legacySavesFailed',
  'pusherEventsReceived',
  'pusherOpsReceived',
  'pusherFullReceived',
  'pusherOverflowReceived',
  'revisionGaps',
  'recoveryRequests',
  'recoverySnapshotsApplied',
  'pollSnapshotsApplied',
  'boardStateApplications',
  'tokenLayerReconciliations',
  'mapLoads',
]);

function createCounterRecord() {
  return Object.fromEntries(DEFAULT_COUNTERS.map((name) => [name, 0]));
}

function cloneDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(details));
  } catch (error) {
    return { note: 'details-not-serializable' };
  }
}

function detectNavigationType(performanceRef) {
  try {
    const entry = performanceRef?.getEntriesByType?.('navigation')?.[0];
    if (typeof entry?.type === 'string' && entry.type.trim()) {
      return entry.type.trim();
    }
  } catch (error) {
    // Diagnostics must never interfere with the VTT.
  }
  return 'unknown';
}

export function createSyncDiagnostics({
  now = () => Date.now(),
  performanceRef = typeof performance === 'undefined' ? null : performance,
} = {}) {
  let startedAt = now();
  let counters = createCounterRecord();
  let recentEvents = [];
  const navigationType = detectNavigationType(performanceRef);

  counters.pageLoads = 1;
  if (navigationType === 'reload') {
    counters.pageReloads = 1;
  }

  function record(name, details = null, amount = 1) {
    if (typeof name !== 'string' || !name.trim()) {
      return;
    }
    const key = name.trim();
    const normalizedAmount = Number.isFinite(Number(amount)) ? Number(amount) : 1;
    counters[key] = (Number(counters[key]) || 0) + normalizedAmount;
    recentEvents.push({
      name: key,
      at: now(),
      details: cloneDetails(details),
    });
    if (recentEvents.length > MAX_RECENT_EVENTS) {
      recentEvents = recentEvents.slice(-MAX_RECENT_EVENTS);
    }
  }

  function snapshot() {
    return {
      startedAt,
      navigationType,
      counters: { ...counters },
      recentEvents: recentEvents.map((entry) => ({
        ...entry,
        details: cloneDetails(entry.details),
      })),
    };
  }

  function reset() {
    startedAt = now();
    counters = createCounterRecord();
    counters.pageLoads = 1;
    if (navigationType === 'reload') {
      counters.pageReloads = 1;
    }
    recentEvents = [];
    return snapshot();
  }

  return {
    record,
    snapshot,
    reset,
  };
}

let sharedDiagnostics = null;

export function getSyncDiagnostics() {
  if (sharedDiagnostics === null) {
    sharedDiagnostics = createSyncDiagnostics();
  }
  return sharedDiagnostics;
}

export function recordSyncDiagnostic(name, details = null, amount = 1) {
  getSyncDiagnostics().record(name, details, amount);
}

export function exposeSyncDiagnostics(windowRef = typeof window === 'undefined' ? null : window) {
  if (!windowRef || typeof windowRef !== 'object') {
    return null;
  }
  const diagnostics = getSyncDiagnostics();
  const publicApi = Object.freeze({
    snapshot: () => diagnostics.snapshot(),
    reset: () => diagnostics.reset(),
  });
  try {
    windowRef.__VTT_SYNC_DIAGNOSTICS__ = publicApi;
  } catch (error) {
    return null;
  }
  return publicApi;
}

exposeSyncDiagnostics();
