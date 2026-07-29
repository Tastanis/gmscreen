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
} = {}) {
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.commit !== 'function') {
    throw new TypeError('Event stream requires a Sync V2 entity store');
  }

  const buffer = new Map();
  let recoveryPromise = null;

  function applyOne(event, source) {
    const result = reduceCanonicalEvent(store.getSnapshot(), event);
    if (result.status === 'applied') {
      store.commit(result.snapshot, { ...result.changeSet, source });
      changeRouter?.route?.(result.changeSet, { source, event });
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
      const recovery = await recoveryClient.recoverAfter(store.getRevision());
      if (recovery?.mode === 'snapshot' && recovery.snapshot) {
        const replaced = store.replaceSnapshot(recovery.snapshot, {
          authoritative: true,
          source: 'recovery',
        });
        if (!replaced.applied) {
          throw new Error('Authoritative Sync V2 recovery snapshot was rejected');
        }
        changeRouter?.route?.(replaced.changeSet, { source: 'recovery' });
        for (const revision of buffer.keys()) {
          if (revision <= store.getRevision()) {
            buffer.delete(revision);
          }
        }
      } else if (recovery?.mode === 'events' && Array.isArray(recovery.events)) {
        for (const event of recovery.events) {
          const revision = eventRevision(event);
          if (revision !== null && revision > store.getRevision()) {
            buffer.set(revision, event);
          }
        }
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
      buffer.set(revision, event);
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
  };
}
