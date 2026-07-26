/**
 * Board state poller.
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of the
 * phase 4 refactor. Do not add unrelated code to this file.
 *
 * The poller is an HTTP fallback that fetches the canonical board state from
 * the server on an interval. It has two modes, toggled via `reconfigure`:
 *   - Fallback mode (Pusher down): polls aggressively to keep clients in sync.
 *   - Safety-net mode (Pusher up): polls rarely in case a Pusher event was
 *     dropped during a reconnect.
 *
 * See docs/vtt-sync-refactor/phase-1-2-dynamic-poller.md and phase-3-A for
 * the design history.
 */

import { isPusherConnected } from './pusher-service.js';

// Board state poller intervals. See phase-1-2-dynamic-poller.md.
// Fallback mode: Pusher is down, poll aggressively as an active fallback.
// Safety-net mode: Pusher is up, poll rarely just in case a Pusher event
// was dropped during a reconnect.
const POLL_FALLBACK_INTERVAL_MS = 1000;
const POLL_SAFETY_NET_INTERVAL_MS = 30000;

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
  getCurrentVersionFn = () => 0,
  onVersionUpdated = null,
  onStateUpdated = null,
  onSyncError = null,
  onSyncRecovered = null,
  isPusherConnectedFn = isPusherConnected,
} = {}) {
  const endpoint = stateEndpoint ?? routes?.state ?? null;

  let isPolling = false;
  let lastHash = null;
  let lastServerEtag = null;
  let pollErrorLogged = false;

  async function poll({ authoritative = false } = {}) {
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
      // Phase 3-A: Conditional GET. Send If-None-Match with the version
      // we last applied so the server can return 304 Not Modified when
      // nothing has changed. Safety-net polls (every 30s while Pusher is
      // up) become near-zero work on both client and server.
      const headers = { Accept: 'application/json' };
      const knownVersion = typeof getCurrentVersionFn === 'function'
        ? getCurrentVersionFn()
        : 0;
      if (!authoritative && lastServerEtag) {
        headers['If-None-Match'] = lastServerEtag;
      } else if (!authoritative && typeof knownVersion === 'number' && knownVersion > 0) {
        // Compatibility for the first poll after bootstrap and older servers.
        // A hash-aware server returns one full response, whose ETag is then
        // reused on subsequent safety polls.
        headers['If-None-Match'] = `W/"v${knownVersion}"`;
      }

      const response = await fetchFn(endpoint, {
        cache: 'no-store',
        headers,
      });
      const responseEtag = response?.headers?.get?.('ETag');
      if (typeof responseEtag === 'string' && responseEtag.trim()) {
        lastServerEtag = responseEtag.trim();
      }
      if (response?.status === 304) {
        onSyncRecovered?.();
        // Nothing has changed since our last applied version. Treat as a
        // successful no-op: do not touch lastHash, do not update state,
        // do not log an error.
        pollErrorLogged = false;
        return;
      }
      if (!response?.ok) {
        const error = new Error(`Unexpected status ${response?.status ?? 'unknown'}`);
        error.status = Number(response?.status) || 0;
        throw error;
      }
      onSyncRecovered?.();

      const payload = (await response.json().catch(() => ({}))) ?? {};
      const incoming = payload?.data?.boardState ?? null;
      if (!incoming || typeof incoming !== 'object') {
        return;
      }

      const hashCandidate = hashBoardStateSnapshotFn(incoming);
      const hashFallback = safeJsonStringifyFn(incoming) ?? String(Date.now());
      const hash = hashCandidate ?? hashFallback;
      if (!authoritative && hash === lastHash) {
        pollErrorLogged = false;
        return;
      }

      const pendingSaveInfo = getPendingSaveInfo?.() ?? {};
      const hasPendingSave = Boolean(
        pendingSaveInfo?.pending ||
          pendingSaveInfo?.promise ||
          pendingSaveInfo?.signature ||
          pendingSaveInfo?.hash ||
          pendingSaveInfo?.blocking
      );

      const hasInFlightSave = Boolean(pendingSaveInfo?.promise);
      if (hasPendingSave && (!authoritative || hasInFlightSave)) {
        // Do NOT update lastHash here. If we record the hash while skipping,
        // the next poll after the save completes will see the same hash and
        // skip again, causing the client to permanently miss this update.
        // By leaving lastHash unchanged, the next poll will detect the
        // difference and apply the state correctly.
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
      const currentUserId = normalizeProfileIdFn(getCurrentUserIdFn());
      const incomingHash = hashCandidate;
      const lastPersistedHash = getLastPersistedHashFn?.() ?? null;
      const lastPersistedSignature = getLastPersistedSignatureFn?.() ?? null;

      const authoredSnapshot = Boolean(
        (incomingHash && incomingHash === lastPersistedHash) ||
          (!incomingHash &&
            ((snapshotSignature && snapshotSignature === lastPersistedSignature) ||
              (snapshotAuthorId && currentUserId && snapshotAuthorId === currentUserId)))
      );

      if (!authoritative && authoredSnapshot) {
        lastHash = hash;
        pollErrorLogged = false;
        return;
      }

      // Version-based stale response rejection
      // This prevents race conditions where a polling response initiated BEFORE a save
      // arrives AFTER a Pusher real-time update, which would overwrite newer data
      const incomingVersion = typeof incoming._version === 'number'
        ? incoming._version
        : (typeof incoming._version === 'string' ? parseInt(incoming._version, 10) : 0);
      const currentVersion = typeof getCurrentVersionFn === 'function'
        ? getCurrentVersionFn()
        : 0;

      // Check for stale response: incoming version is older than what we have
      // Exception: If current version is very high but incoming is low (e.g., 500 vs 1),
      // this likely indicates a server reset - accept the incoming data in that case.
      // We use a threshold of 100 versions to detect this scenario.
      const VERSION_RESET_THRESHOLD = 100;
      const isStaleResponse = incomingVersion > 0 &&
                              currentVersion > 0 &&
                              incomingVersion < currentVersion &&
                              (currentVersion - incomingVersion) < VERSION_RESET_THRESHOLD;

      if (isStaleResponse) {
        console.log(`[VTT] Rejecting stale poll response (v${incomingVersion} < current v${currentVersion})`);
        lastHash = hash;
        pollErrorLogged = false;
        return;
      }

      lastHash = hash;
      pollErrorLogged = false;

      boardApi.updateState?.((draft) => {
        draft.boardState = mergeBoardStateSnapshotFn(
          draft.boardState,
          incoming,
          { authoritative }
        );
      });

      // Update version tracking if polling response has a newer version
      if (incomingVersion > currentVersion && typeof onVersionUpdated === 'function') {
        onVersionUpdated(incomingVersion);
      }

      // Immediately trigger combat state refresh after board state update
      // This replaces the separate combat refresh polling loop
      if (typeof onStateUpdated === 'function') {
        try {
          const updatedState = boardApi.getState?.();
          if (updatedState) {
            onStateUpdated(updatedState);
          }
        } catch (callbackError) {
          console.warn('[VTT] onStateUpdated callback failed', callbackError);
        }
      }
    } catch (error) {
      onSyncError?.(error);
      if (!pollErrorLogged) {
        console.warn('[VTT] Board state poll failed', error);
        pollErrorLogged = true;
      }
    } finally {
      isPolling = false;
    }
  }

  function forceImmediatePoll() {
    return poll({ authoritative: true });
  }

  function start() {
    if (!endpoint || typeof windowRef?.setInterval !== 'function' || typeof fetchFn !== 'function') {
      return { stop() {}, reconfigure() {} };
    }

    // The poller has two modes:
    //   - Fallback mode (Pusher down): poll every POLL_FALLBACK_INTERVAL_MS
    //   - Safety-net mode (Pusher up): poll every POLL_SAFETY_NET_INTERVAL_MS
    // Pick the initial mode from the current Pusher state. Later connection
    // changes go through reconfigure() below.
    let currentIntervalMs =
      typeof isPusherConnectedFn === 'function' && isPusherConnectedFn()
        ? POLL_SAFETY_NET_INTERVAL_MS
        : POLL_FALLBACK_INTERVAL_MS;
    let intervalId = null;

    function schedule(intervalMs) {
      if (intervalId !== null && typeof windowRef?.clearInterval === 'function') {
        windowRef.clearInterval(intervalId);
      }
      currentIntervalMs = intervalMs;
      intervalId = windowRef.setInterval(poll, currentIntervalMs);
    }

    // Initial poll, then start the interval.
    poll();
    schedule(currentIntervalMs);

    return {
      stop() {
        if (intervalId !== null && typeof windowRef?.clearInterval === 'function') {
          windowRef.clearInterval(intervalId);
        }
        intervalId = null;
      },
      reconfigure({ pusherConnected } = {}) {
        const nextIntervalMs = pusherConnected
          ? POLL_SAFETY_NET_INTERVAL_MS
          : POLL_FALLBACK_INTERVAL_MS;
        if (nextIntervalMs === currentIntervalMs) {
          return; // no-op when the mode has not actually changed
        }
        const enteringFallback = !pusherConnected;
        schedule(nextIntervalMs);
        if (enteringFallback) {
          // Pusher just dropped. Fire one poll immediately so the user does
          // not have to wait up to a full interval for the first fetch.
          // When going the other way (fallback -> safety-net) we deliberately
          // do NOT fire an immediate poll, because Pusher itself is about to
          // deliver fresh state.
          poll();
        }
      },
      // Phase 3-C: External callers (the Pusher subscriber, specifically)
      // can force a one-shot poll to recover from a version-gap detected
      // on an ops broadcast or from an `ops-overflow` marker. The
      // existing internal staleness/grace-period guards inside `poll()`
      // still apply, so calling this during a pending save is a safe
      // no-op — see the `pendingResyncAfterSave` plumbing in
      // board-interactions for the deferred case.
      forceImmediatePoll,
    };
  }

  return { poll, start, forceImmediatePoll };
}
