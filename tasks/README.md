# My Tasks

A self-contained, local-first task PWA. It does not share code, sessions, or data with the GM Screen, D&D, or ASL applications.

## Local web test

Serve the repository root so the app remains at `/tasks/`:

```text
php -S localhost:8000 -t .
http://localhost:8000/tasks/
```

## iPhone installation

After this folder is uploaded under HTTPS, open its URL in Safari, tap Share, then **Add to Home Screen**. Data remains on that iPhone until an authenticated sync backend is configured. Removing site data can remove locally saved tasks.

See `SYNC-SETUP.md` for the deliberate sync boundary.
