import { createInitialData, normalizeData } from './model.mjs';

const STORAGE_KEY = 'my-tasks-data-v1';

class BrowserStorage {
  label = 'Saved on this device';
  async load() {
    try { return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return createInitialData(); }
  }
  async save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

class JsonApiStorage {
  label = 'Saved to local tasks.json';
  constructor(baseUrl = '') { this.baseUrl = baseUrl.replace(/\/$/, ''); }
  async load() {
    const response = await fetch(`${this.baseUrl}/api/data`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not read the local task file.');
    return normalizeData(await response.json());
  }
  async save(data) {
    const response = await fetch(`${this.baseUrl}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Could not save the local task file.');
  }
}

export function createStorage(config = {}) {
  if (config.storageMode === 'json-api') return new JsonApiStorage(config.apiBaseUrl || '');
  return new BrowserStorage();
}
