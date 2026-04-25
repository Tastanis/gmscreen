# VTT Workspace Overview

The `/dnd/vtt` directory holds the browser-based tabletop experience that mirrors the GM dashboard.

## Main Areas

```text
vtt/
├── api/                         # Scene, token, upload, and board-state endpoints
├── assets/
│   ├── css/                     # VTT layout and board styling
│   └── js/
│       ├── bootstrap.js         # Front-end entry point
│       ├── combat/              # Extracted live combat tracker modules
│       ├── services/            # PHP API clients and sync helpers
│       ├── state/               # Local store and persistence helpers
│       ├── ui/                  # Board, panels, tools, and DOM interactions
│       └── vendor/              # Placeholder for third-party bundles
├── bootstrap.php                # Shared PHP layout/bootstrap helpers
├── combat-tracker/              # Inactive wrapper shell around assets/js/combat
├── components/                  # PHP view fragments
├── config/                      # Route constants and configuration
├── index.php                    # Session guard and layout entry point
├── storage/                     # Runtime VTT storage and uploads
└── templates/                   # PHP layout templates
```

## Combat Tracker

The live combat tracker is mounted by the board UI and implemented through modules in:

`dnd/vtt/assets/js/combat/`

The canonical persisted combat state is:

`boardState.sceneState[sceneId].combat`

The `dnd/vtt/combat-tracker/` directory is not a second live tracker. It is an inactive wrapper shell retained for a possible future dedicated page, and it must continue to use the same canonical board-state combat field.

## Integration Notes

- PHP view fragments in `components/` render isolated panels that front-end modules hydrate.
- JavaScript under `assets/js/` is split by responsibility: services talk to PHP endpoints, state manages the local store, UI handles DOM interactions, and combat modules contain tracker-specific logic.
- Runtime storage belongs under `dnd/vtt/storage/` or the existing board-state API contract. Do not add separate combat persistence under `dnd/vtt/combat-tracker/storage/`.

## Testing

Run the UI interaction tests from the repository root:

```bash
npm test
```

The command executes the Node test runner against `dnd/vtt/assets/js/**/*.test.mjs`.
