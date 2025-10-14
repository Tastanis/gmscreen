# VTT Workspace Overview

The VTT directory now contains the scaffolding for the in-browser tabletop that mirrors the dashboard aesthetic. This README
summarises the current file layout so future changes can stay consistent with the existing structure.

## Directory Map
```
vtt/
├── README.md
├── api/
│   ├── scenes.php              # Scene CRUD endpoint
│   ├── state.php               # Board state snapshot endpoint
│   ├── tokens.php              # Token CRUD endpoint
│   └── uploads.php             # Image upload endpoint shared with dashboard logic
├── assets/
│   ├── css/
│   │   ├── base.css
│   │   ├── board.css
│   │   ├── chat.css
│   │   ├── layout.css
│   │   └── settings.css
│   ├── images/
│   │   └── turn-timer/         # Reserved for timer art assets (currently empty)
│   └── js/
│       ├── bootstrap.js        # Entry point that wires state + services + UI
│       ├── services/
│       │   ├── board-state-service.js
│       │   ├── chat-service.js
│       │   ├── scene-service.js
│       │   └── token-service.js
│       ├── state/
│       │   ├── persistence.js
│       │   └── store.js
│       ├── ui/
│       │   ├── __tests__/
│       │   │   └── board-interactions.test.mjs
│       │   ├── board-interactions.js
│       │   ├── chat-panel.js
│       │   ├── dice-roller.js
│       │   ├── drag-ruler.js
│       │   ├── scene-manager.js
│       │   ├── settings-panel.js
│       │   ├── token-library.js
│       │   └── token-maker.js
│       └── vendor/             # Placeholder for third-party bundles
├── bootstrap.php               # Boots shared helpers for layout rendering
├── combat-tracker/             # Embedded combat tracker module (see nested README)
├── components/
│   ├── ChatPanel.php
│   ├── SceneBoard.php
│   ├── SettingsPanel.php
│   ├── TokenLibrary.php
│   └── Shared/                 # Shared PHP partials (empty placeholder)
├── config/
│   └── routes.php              # Centralised route constants for front-end usage
├── index.php                   # Session guard + layout bootstrapper
├── storage/
│   ├── backups/                # Planned JSON backup folder (empty)
│   ├── tokens/                 # Planned per-token data (empty)
│   └── uploads/                # Upload staging area (empty)
└── templates/
    └── layout.php              # PHP layout shell consumed by index.php
```

## Integration Notes
- `index.php` loads `bootstrap.php`, which prepares helper functions and renders template fragments from `templates/layout.php`.
- PHP view fragments in `components/` produce isolated panels so front-end modules can hydrate specific regions.
- JavaScript modules under `assets/js/` are organised by responsibility: services talk to the PHP endpoints, state manages local
  stores and persistence queuing, and UI files handle DOM interactions.
- Storage directories ship empty so the VTT can write JSON data at runtime without polluting version control.
- The combat tracker is a self-contained feature living in `combat-tracker/` with its own APIs, assets, and tests.

Keep the structure above when adding new features—prefer new files within the existing module folders instead of mixing
responsibilities inside the entry points.
