# My Tasks

A self-contained personal task PWA synchronized through the same HTTPS/PHP host. It does not use Pusher, Azure, a database, or an external identity provider.

## Runtime design

- `index.php` provides the task-only password login and authenticated app shell.
- `api/data.php` is the same-origin authenticated read/write API.
- The authoritative JSON file and password hash live outside `public_html`.
- Writes require a PHP session CSRF token, validated bounded data, a matching revision, an exclusive lock, and atomic file replacement.
- Clients refresh at startup, on focus, and every 15 seconds. Pusher is unnecessary for this two-device use case.
- Browser-local tasks from the earlier version are never silently discarded; the signed-in app offers an explicit import/merge.

## Local test

Set `TASKS_CONFIG_FILE` to a disposable private config path, then serve the repository root:

```text
php -S localhost:8000 -t .
http://localhost:8000/tasks/
```

See `CPANEL-SETUP.md` for the required one-time production setup. Do not create a config file inside this repository.
