import { createPendingCommands } from './pending-commands.js';

function fallbackOperationId() {
  const random = Math.random().toString(36).slice(2);
  return `op-${Date.now().toString(36)}-${random}`;
}

export function createOperationId(cryptoRef = globalThis.crypto) {
  return typeof cryptoRef?.randomUUID === 'function'
    ? cryptoRef.randomUUID()
    : fallbackOperationId();
}

export function createCommandClient({
  endpoint,
  eventStream,
  pendingCommands = createPendingCommands(),
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  getRevision = () => 0,
  getSocketId = () => null,
  operationIdFactory = () => createOperationId(),
  maxNetworkAttempts = 2,
  retryDelayMs = 100,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  onDiagnostic = () => {},
} = {}) {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new TypeError('Command endpoint is required');
  }
  if (!eventStream || typeof eventStream.ingest !== 'function') {
    throw new TypeError('Command client requires the canonical event stream');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  async function submit(type, payload = {}, options = {}) {
    const command = {
      operationId: options.operationId ?? operationIdFactory(),
      type,
      sceneId: options.sceneId ?? null,
      entityId: options.entityId ?? null,
      baseRevision: options.baseRevision ?? getRevision(),
      entityRevision: options.entityRevision ?? null,
      payload,
    };
    const socketId = getSocketId();
    if (socketId) {
      command.socketId = socketId;
    }

    pendingCommands.add(command);
    let response;
    let body;
    const attempts = Math.max(1, Math.min(5, Math.trunc(Number(maxNetworkAttempts)) || 2));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      pendingCommands.markAttempt(command.operationId);
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
          signal: options.signal,
        });
        body = await response.json().catch(() => ({}));
      } catch (error) {
        if (options.signal?.aborted || attempt >= attempts) {
          pendingCommands.fail(command.operationId, { error: error?.message ?? 'network_error' });
          throw error;
        }
        onDiagnostic('commandRetry', {
          operationId: command.operationId,
          type,
          attempt,
          reason: 'network_error',
        });
        await sleep(Math.max(0, Number(retryDelayMs) || 0) * attempt);
        continue;
      }
      const retryableStatus =
        response.status === 408
        || response.status === 429
        || response.status >= 500;
      if (!response.ok && retryableStatus && attempt < attempts) {
        onDiagnostic('commandRetry', {
          operationId: command.operationId,
          type,
          attempt,
          reason: `http_${response.status}`,
        });
        await sleep(Math.max(0, Number(retryDelayMs) || 0) * attempt);
        continue;
      }
      if (
        response.ok
        && (body?.success !== true || !body?.event)
        && attempt < attempts
      ) {
        onDiagnostic('commandRetry', {
          operationId: command.operationId,
          type,
          attempt,
          reason: 'invalid_success_body',
        });
        await sleep(Math.max(0, Number(retryDelayMs) || 0) * attempt);
        continue;
      }
      break;
    }

    if (!response.ok || body?.success !== true || !body?.event) {
      pendingCommands.reject(command.operationId, body);
      const error = new Error(body?.error || `Sync V2 command failed (${response.status})`);
      error.status = response.status;
      error.response = body;
      throw error;
    }

    const applyResult = await eventStream.ingest(body.event, 'acknowledgement');
    pendingCommands.acknowledge(command.operationId, {
      event: body.event,
      idempotent: Boolean(body.idempotent),
      applyStatus: applyResult.status,
    });
    return {
      command,
      event: body.event,
      idempotent: Boolean(body.idempotent),
      applyResult,
    };
  }

  return {
    submit,
    pendingCommands,
  };
}
