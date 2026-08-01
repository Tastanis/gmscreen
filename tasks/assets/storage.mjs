import { createInitialData, normalizeData } from './model.mjs';

const STORAGE_KEY = 'my-tasks-data-v1';

export class SyncConflictError extends Error {
  constructor(document) {
    super('Tasks changed on another device.');
    this.name = 'SyncConflictError';
    this.document = document;
  }
}

export class AuthenticationError extends Error {
  constructor() {
    super('Your task session has expired.');
    this.name = 'AuthenticationError';
  }
}

class BrowserStorage {
  label = 'Saved on this device';
  isShared = false;
  async load() { return readLegacyBrowserData() || createInitialData(); }
  async save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return { data }; }
}

class SharedApiStorage {
  label = 'Shared across your signed-in devices';
  isShared = true;
  revision = 0;
  constructor(baseUrl = '', csrfToken = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.csrfToken = csrfToken;
  }
  async request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    if (response.status === 401) throw new AuthenticationError();
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409 && payload.conflict) {
      throw new SyncConflictError(payload);
    }
    if (!response.ok) throw new Error(payload.error || 'The shared task service is unavailable.');
    return payload;
  }
  acceptDocument(document) {
    this.revision = Number(document.revision) || 0;
    if (document.csrfToken) this.csrfToken = document.csrfToken;
    return normalizeData(document.data);
  }
  async load() {
    const payload = await this.request(`${this.baseUrl}/data.php`);
    return this.acceptDocument(payload);
  }
  async save(data) {
    const payload = await this.request(`${this.baseUrl}/data.php`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken },
      body: JSON.stringify({ baseRevision: this.revision, data })
    });
    return { data: this.acceptDocument(payload), revision: this.revision };
  }
  acceptConflict(document) { return this.acceptDocument(document); }
}

export function readLegacyBrowserData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeData(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function legacyDataHasContent(data) {
  if (!data) return false;
  return data.tasks.length > 0 || data.lists.length > 1 || data.lists[0]?.name !== 'Tasks';
}

export function clearLegacyBrowserData() { localStorage.removeItem(STORAGE_KEY); }

export function createStorage(config = {}) {
  if (config.storageMode === 'shared-api') {
    const token = document.querySelector('#task-app-bootstrap')?.dataset.csrfToken || '';
    return new SharedApiStorage(config.apiBaseUrl || './api', token);
  }
  return new BrowserStorage();
}
