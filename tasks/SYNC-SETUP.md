# Shared sync boundary

The deployed HTTPS task website is the single source of truth. Both iPhone and Windows use the same authenticated PHP session and JSON API.

## Authority and conflicts

The private server document contains an integer revision plus the validated task data. Every save sends its base revision. If another device saved first, the API returns HTTP `409` with the latest shared document; the app asks the user to reload and repeat the last change rather than silently overwriting anything.

No task data is broadcast through Pusher. Refresh on startup, focus, visibility change, and a 15-second interval is sufficient for one person using two devices.

## Local migration

The former browser-only data remains under the legacy `my-tasks-data-v1` key. When meaningful legacy data exists, the authenticated app shows an explicit import prompt. Import merges lists and tasks by stable ID and keeps the newer version of a matching task. The local key is removed only after the merged shared save succeeds.

The former Windows `data/tasks.json` is not an ongoing sync source. The Windows launcher now opens the deployed HTTPS app directly.
