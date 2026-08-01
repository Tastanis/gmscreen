/* Shared same-site storage. The server-only password hash is never exposed here. */
window.TASK_APP_CONFIG = Object.freeze({
  storageMode: 'shared-api',
  apiBaseUrl: './api',
  appName: 'My Tasks'
});
