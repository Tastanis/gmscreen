import { reduceCanonicalEvent } from './event-reducer.js';

function eventRevision(event) {
  const revision = Number(event?.revision);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

export function createEventStream({
  store,
  recoveryClient = null,
  changeRouter = null,
  onError = () => {},
  onDiagnostic = () => {},
  maxBufferedEvents = 1000,
} = {}) {
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.commit !== 'function') {
    throw new TypeError('Event stream requires a Sync V2 entity store');
  }

  const buffer = new Map();
  const bufferLimit = Math.max(10, Math.trunc(Number(maxBufferedEvents)) || 1000);
  let recoveryPromise = null;
  const getConfirmedSnapshot = () =>
    store.getConfirmedSnapshot?.() ?? store.getSnapshot();

  function applyOne(event, source) {
    const result = reduceCanonicalEvent(getConfirmedSnapshot(), event);
    if (result.status === 'applied') {
      store.commit(result.snapshot, { ...result.changeSet, source });
      changeRouter?.route?.(result.changeSet, { source, event });
      onDiagnostic('eventApplied', { source, revision: event.revision, type: event.type });
    }
    return result;
  }

  function flushBuffer() {
    let applied = 0;
    while (buffer.has(store.getRevision() + 1)) {
      const revision = store.getRevision() + 1;
      const event = buffer.get(revision);
      buffer.delete(revision);
      const result = applyOne(event, 'buffer');
      if (result.status !== 'applied') {
        onError(new Error(`Buffered Sync V2 event ${revision} could not be applied`), result);
        onDiagnostic('bufferApplyFailed', { revision, reason: result.reason ?? result.status });
        break;
      }
      applied += 1;
    }
    return applied;
  }

  async function runRecovery() {
    if (!recoveryClient || typeof recoveryClient.recoverAfter !== 'function') {
      return null;
    }
    if (recoveryPromise) {
      return recoveryPromise;
    }

    recoveryPromise = (async () => {
      const requestedRevision = store.getRevision();
      onDiagnostic('recoveryStarted', {
        afterRevision: requestedRevision,
        bufferedRevisions: buffer.size,
      });
      const recovery = await recoveryClient.recoverAfter(requestedRevision);
      if (recovery?.mode === 'snapshot' && recovery.snapshot) {
        const replaced = store.replaceSnapshot(recovery.snapshot, {
          authoritative: true,
          source: 'recovery',
        });
        if (!replaced.applied) {
          throw new Error('Authoritative Sync V2 recovery snapshot was rejected');
        }
        changeRouter?.route?.(replaced.changeSet, { source: 'recovery' });
        onDiagnostic('recoverySnapshotApplied', {
          revision: store.getRevision(),
          reason: recovery.reason ?? null,
        });
        for (const revision of buffer.keys()) {
          if (revision <= store.getRevision()) {
            buffer.delete(revision);
          }
        }
      } else if (recovery?.mode === 'events' && Array.isArray(recovery.events)) {
        if (
          Number(recovery.fromRevision) !== requestedRevision
          || !Number.isSafeInteger(Number(recovery.revision))
          || Number(recovery.revision) < requestedRevision
        ) {
          throw new Error('Sync V2 recovery cursor metadata is invalid');
        }
        let expected = requestedRevision + 1;
        for (const event of recovery.events) {
          const revision = eventRevision(event);
          if (revision !== expected) {
            throw new Error(`Sync V2 recovery events are not contiguous at revision ${expected}`);
          }
          buffer.set(revision, event);
          expected += 1;
        }
        if (expected - 1 !== Number(recovery.revision)) {
          throw new Error('Sync V2 recovery response ended before its declared revision');
        }
        onDiagnostic('recoveryEventsReceived', {
          fromRevision: requestedRevision,
          throughRevision: Number(recovery.revision),
          count: recovery.events.length,
        });
      } else {
        throw new Error('Sync V2 recovery response has an unsupported shape');
      }
      flushBuffer();
      const nextBuffered = Math.min(...buffer.keys());
      if (Number.isFinite(nextBuffered) && nextBuffered > store.getRevision() + 1) {
        throw new Error(
          `Sync V2 recovery remained incomplete at revision ${store.getRevision()}`
        );
      }
      onDiagnostic('recoveryCompleted', {
        revision: store.getRevision(),
        bufferedRevisions: buffer.size,
      });
      return recovery;
    })()
      .catch((error) => {
        onError(error);
        throw error;
      })
      .finally(() => {
        recoveryPromise = null;
      });
    return recoveryPromise;
  }

  async function ingest(event, source = 'transport') {
    const revision = eventRevision(event);
    if (revision === null) {
      return { status: 'invalid', reason: 'invalid_revision' };
    }
    if (revision <= store.getRevision()) {
      return applyOne(event, source);
    }
    if (revision > store.getRevision() + 1) {
      const buffered = buffer.get(revision);
      if (
        buffered
        && buffered.operationId !== event.operationId
      ) {
        onError(new Error(`Conflicting Sync V2 events claimed revision ${revision}`));
        onDiagnostic('bufferRevisionConflict', { revision });
      } else {
        buffer.set(revision, event);
      }
      if (buffer.size > bufferLimit) {
        buffer.clear();
        onDiagnostic('bufferOverflow', { limit: bufferLimit });
      }
      onDiagnostic('revisionGap', {
        currentRevision: store.getRevision(),
        receivedRevision: revision,
      });
      await runRecovery();
      return {
        status: 'buffered',
        revision,
        currentRevision: store.getRevision(),
      };
    }
    const result = applyOne(event, source);
    if (result.status === 'applied') {
      flushBuffer();
    } else if (result.status === 'invalid' && recoveryClient) {
      onDiagnostic('invalidEventRecovery', { revision, reason: result.reason });
      await runRecovery();
    }
    return result;
  }

  return {
    ingest,
    recover: runRecovery,
    getBufferedRevisions: () => Array.from(buffer.keys()).sort((a, b) => a - b),
    isRecovering: () => recoveryPromise !== null,
  };
}

/**
 * Pusher transport adapter. It only forwards event envelopes to the stream;
 * it contains no reducer, game rule, persistence, or DOM behavior.
 */
export function createPusherEventTransport({
  PusherClass,
  key,
  cluster,
  channel,
  authEndpoint = null,
  onEvent,
  onConnectionChange = () => {},
} = {}) {
  if (typeof PusherClass !== 'function' || !key || !cluster || !channel) {
    return {
      connect: () => false,
      disconnect: () => {},
      getSocketId: () => null,
      getState: () => 'unavailable',
    };
  }
  if (typeof onEvent !== 'function') {
    throw new TypeError('Pusher Sync V2 transport requires an onEvent callback');
  }

  let client = null;
  let subscription = null;
  function connect() {
    if (client) {
      return true;
    }
    const options = { cluster, forceTLS: true, disableStats: true };
    if (authEndpoint) {
      options.channelAuthorization = { endpoint: authEndpoint };
    }
    client = new PusherClass(key, options);
    client.connection?.bind?.('state_change', (change) => onConnectionChange(change));
    subscription = client.subscribe(channel);
    subscription.bind?.('pusher:subscription_error', (error) => {
      onConnectionChange({ current: 'subscription_error', error });
    });
    subscription.bind('sync-v2-event', (message) => {
      if (message?.event && typeof message.event === 'object') {
        onEvent(message.event, 'pusher');
      }
    });
    return true;
  }

  function disconnect() {
    if (subscription && client) {
      client.unsubscribe?.(channel);
    }
    client?.disconnect?.();
    subscription = null;
    client = null;
  }

  return {
    connect,
    disconnect,
    getSocketId: () => client?.connection?.socket_id ?? null,
    getState: () => client?.connection?.state ?? (client ? 'initialized' : 'disconnected'),
  };
}
