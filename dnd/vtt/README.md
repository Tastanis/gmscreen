# VTT Workspace Overview

The `/dnd/vtt` directory holds the browser-based tabletop experience that mirrors the GM dashboard. The layout below reflects the current project structure so future additions land in the right place.

## Directory Map
```
vtt/
├── README.md
├── api/
│   ├── scenes.php              # Scene CRUD endpoint
│   ├── state.php               # Board state snapshot endpoint
│   ├── state_helpers.php       # Shared utilities consumed by the API endpoints
│   ├── tokens.php              # Token CRUD endpoint
│   └── uploads.php             # Image upload endpoint shared with dashboard logic
├── assets/
│   ├── css/
│   │   ├── base.css
│   │   ├── board.css
│   │   ├── chat.css
│   │   ├── layout.css
│   │   └── settings.css
│   └── js/
│       ├── bootstrap.js        # Entry point wiring services, state, and UI modules
│       ├── services/
│       │   ├── board-state-service.js
│       │   ├── chat-service.js
│       │   ├── combat-timer-service.js
│       │   ├── scene-service.js
│       │   └── token-service.js
│       ├── state/
│       │   ├── persistence.js
│       │   └── store.js
│       ├── ui/
│       │   ├── __tests__/
│       │   │   ├── board-interactions.test.mjs
│       │   │   └── board-state-poller.test.mjs
│       │   ├── board-interactions.js
│       │   ├── chat-panel.js
│       │   ├── combat-timer-report.js
│       │   ├── dice-roller.js
│       │   ├── drag-ruler.js
│       │   ├── scene-manager.js
│       │   ├── settings-panel.js
│       │   ├── token-library.js
│       │   └── token-maker.js
│       └── vendor/             # Placeholder for third-party bundles (.gitkeep)
├── bootstrap.php               # Boots shared helpers for layout rendering
├── combat-tracker/             # Embedded combat tracker module (see nested README)
│   ├── README.md
│   ├── api/
│   │   ├── combat.php
│   │   └── snapshots.php
│   ├── assets/
│   │   ├── css/
│   │   │   └── combat-tracker.css
│   │   └── js/
│   │       └── bootstrap.js
│   ├── components/
│   │   └── CombatTrackerPanel.php
│   ├── storage/
│   │   ├── .gitkeep
│   │   └── combat-state.json   # Seeded example state referenced by local dev
│   └── tests/
│       ├── api.test.md
│       └── ui.test.md
├── components/
│   ├── ChatPanel.php
│   ├── SceneBoard.php
│   ├── SettingsPanel.php
│   ├── TokenLibrary.php
│   └── Shared/                 # Shared PHP partials (currently empty placeholder)
├── config/
│   └── routes.php              # Centralised route constants for front-end usage
├── index.php                   # Session guard + layout bootstrapper
├── storage/
│   ├── backups/                # Planned JSON backup folder (empty, tracked via .gitkeep)
│   ├── tokens/                 # Planned per-token data (empty, tracked via .gitkeep)
│   └── uploads/                # Upload staging area (gitignored, created on demand)
└── templates/
    └── layout.php              # PHP layout shell consumed by index.php
```

## Integration Notes
- `index.php` includes `bootstrap.php`, which prepares helper functions and renders template fragments from `templates/layout.php`.
- PHP view fragments in `components/` produce isolated panels so front-end modules can hydrate specific regions.
- JavaScript under `assets/js/` is split by responsibility: `services/` talk to the PHP endpoints, `state/` manages the local store, and `ui/` handles DOM interactions including the combat timer report view.
- Storage directories ship empty or with seed examples so the VTT can write JSON data at runtime without polluting version control.
- The combat tracker is a self-contained feature living in `combat-tracker/` with its own APIs, assets, storage, and Markdown specs.

## Testing
Run the UI interaction tests from the repository root:

```bash
npm test
```

The command executes the Node test runner against the modules in `assets/js/`, including the poller and board interaction suites.
