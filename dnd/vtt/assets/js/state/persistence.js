const pending = new Map();

export function queueSave(key, payload, endpoint) {
  const controller = new AbortController();
  if (pending.has(key)) {
    const { controller: existing } = pending.get(key);
    existing.abort();
  }

  pending.set(key, { payload, endpoint, controller });

  window.setTimeout(() => {
    const current = pending.get(key);
    if (!current) return;
    persist(key, current);
  }, 250);
}

async function persist(key, { payload, endpoint, controller }) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to save ${key}`);
    }
  } catch (error) {
    console.error(`[VTT] Persistence error for ${key}`, error);
  } finally {
    pending.delete(key);
  }
}
