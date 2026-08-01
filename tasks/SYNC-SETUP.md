# Storage and future sync

## What works now

- The website/PWA build saves data in that browser's local storage. It works offline after its first load.
- The Windows build uses the same interface but saves to `data/tasks.json` in its own folder.
- No account, cloud service, database, upload, or cross-device sync is configured.

The JSON file is intentionally simple and easy to back up. A file on one PC cannot by itself synchronize an iPhone in another location.

## Adding private cross-device sync later

Keep the UI and data shape. Replace the storage adapter selected by `config.js` with a managed HTTPS API that implements authenticated `GET` and `PUT` operations for the current user's task document. The backend must provide real access control: unique user authentication, authorization on every request, TLS, server-side validation, and private per-user storage. A secret folder name or unlisted URL is not access control.

The existing `JsonApiStorage` seam in `assets/storage.mjs` shows the small request boundary. Before enabling it on the public website, add authenticated sessions or tokens, conflict/version handling, backups, and CSRF protection where applicable. Do not point the public app at the Windows-only local JSON server.
