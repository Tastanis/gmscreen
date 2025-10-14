# VTT Combat Tracker Module

This folder contains the VTT-specific combat tracker that complements the main tabletop. The files below are already scaffolded
so the tracker can evolve independently of the core board implementation.

## Directory Map
```
combat-tracker/
├── README.md
├── api/
│   ├── combat.php          # REST-style endpoint (currently returns 501 placeholder)
│   └── snapshots.php       # Observer polling endpoint (also 501 placeholder)
├── assets/
│   ├── css/
│   │   └── combat-tracker.css    # Tracker panel styling scaffold
│   └── js/
│       ├── bootstrap.js          # Entry point exposed to the VTT shell
│       ├── services/
│       │   ├── combat-service.js # Client helpers for combat.php
│       │   └── sync-service.js   # Planned bridge for snapshot polling/sync
│       ├── state/
│       │   ├── selectors.js      # Derived data helpers
│       │   └── store.js          # Tracker-specific state container
│       └── ui/
│           ├── conditions.js     # Manage condition tags rendering
│           ├── controls.js       # Round/turn advancement controls
│           ├── initiative-list.js# Initiative order list rendering
│           └── tracker-panel.js  # Top-level panel composition
├── components/
│   └── CombatTrackerPanel.php    # PHP helper that outputs the mounting container
├── storage/
│   └── combat-state.json         # JSON persistence file (seeded empty)
└── tests/
    ├── api.test.md               # Manual test checklist for API behaviour
    └── ui.test.md                # Manual test checklist for UI interactions
```

## Current Status
- PHP endpoints are stubbed with HTTP 501 responses until the data contract is finalised.
- `assets/js/bootstrap.js` exports `initializeCombatTracker`, which currently returns a disposable stub so integration work can
  begin before the UI is implemented.
- UI, service, and state modules are in place to define the boundaries and naming conventions; their internals are placeholders
  ready to be filled out feature-by-feature.
- `CombatTrackerPanel.php` renders an empty `<section>` with data attributes (`isGM`, `sceneId`) that front-end code can read when
  the tracker mounts.
- `storage/combat-state.json` is checked in as an empty file to anchor runtime persistence without polluting git history.

When expanding the tracker, add new assets or helpers within the directories above to keep responsibilities isolated and to
make it clear which layer (API, state, UI) a change belongs to.
