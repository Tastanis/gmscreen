# VTT Combat Tracker Blueprint

This document captures the high-level design for embedding a streamlined combat turn tracker directly inside the VTT workspace. It draws inspiration from the existing dashboard combat tracker (see `/dnd/combat`) while adapting it to the VTT's scene/token driven experience.

## Objectives
- Provide a GM-first interface for sequencing creature turns that can optionally sync with the dashboard tracker.
- Keep the feature self-contained within `vtt/combat-tracker/` so future work can progress in isolation from the core board, chat, and settings modules.
- Share scene and token context without duplicating their persistence logic.
- Maintain clear separation between read/write capabilities so spectator clients never trigger errors.

## Feature Parity Targets
Based on the dashboard tracker implementation, the VTT variant should eventually support:
- **Initiative ordering** with sortable combatants and round tracking.
- **Turn controls** for advancing, delaying, or skipping participants.
- **Condition & effect tags** similar to the dashboard's condition modal/tooltip pairing.
- **Image support** for combatants, favoring token portraits when available.
- **GM vs Player modes** (write vs read-only) with live updates.
- **Auto-save and refresh safety** so the UI never overwhelms the PHP back end.

The VTT version will initially focus on a simplified layout (no card grid) but the module boundaries below allow for richer UI later.

## Directory Layout
```
combat-tracker/
├── README.md
├── api/
│   ├── combat.php          # REST-style endpoint for initiative state
│   └── snapshots.php       # (Future) Bulk read for observers and recovery
├── assets/
│   ├── css/
│   │   └── combat-tracker.css    # Scoped styling for the tracker panel
│   └── js/
│       ├── bootstrap.js          # Entry point that wires tracker state + UI
│       ├── services/
│       │   ├── combat-service.js # Handles fetch/save with API endpoints
│       │   └── sync-service.js   # (Future) Bridges to dashboard tracker
│       ├── state/
│       │   ├── store.js          # Tracker-specific store slice + actions
│       │   └── selectors.js      # Derived data helpers (turn order, filters)
│       └── ui/
│           ├── tracker-panel.js  # Renders container + high-level controls
│           ├── initiative-list.js# Responsible for initiative ordering list
│           ├── controls.js       # Turn advancement, round management
│           └── conditions.js     # Condition tagging modal/tooltip logic
├── components/
│   └── CombatTrackerPanel.php    # PHP render helper mounted in layout shell
├── storage/
│   └── combat-state.json         # JSON persistence for tracker sessions
└── tests/
    ├── api.test.md               # Notes for exercising API contracts
    └── ui.test.md                # Manual test checklist for tracker UX
```

> **Note:** Files listed above are placeholders; implementation will populate them incrementally. `.gitkeep` files maintain empty directories until real assets exist.

## Integration Points
- **Bootstrap Wiring:** `assets/js/bootstrap.js` inside the VTT will lazily import `combat-tracker/assets/js/bootstrap.js` when the combat panel becomes visible. This prevents combat logic from blocking initial board load.
- **PHP Layout:** `components/CombatTrackerPanel.php` will be included by the VTT layout once the component is implemented. The component should only render container markup and pass configuration (`isGM`, active scene id) via `data-*` attributes.
- **Scene Awareness:** Combat entries will reference scene IDs from `state/store.js`. Instead of duplicating token data, the tracker can request token metadata via the existing `token-service.js` once a creature is linked to a token.
- **Persistence:** The tracker will store combat rounds in `storage/combat-state.json`, reusing the same atomic write helpers used by `storage/board-state.json`. API endpoints should share validation utilities with `api/state.php` to avoid drift.

## Data Model Sketch
```json
{
  "sceneId": "active-scene-id",
  "round": 3,
  "turnIndex": 1,
  "combatants": [
    {
      "id": "uuid",
      "name": "Goblin Raider",
      "type": "enemy",            // enemy | ally | neutral
      "initiative": 17,
      "hp": { "current": 7, "max": 12 },
      "conditions": ["Poisoned", "Prone"],
      "tokenId": "scene-token-id", // optional link to board token
      "portrait": "/path/to/image.jpg"
    }
  ],
  "log": [
    { "timestamp": 1700000000, "message": "Round advanced to 3" }
  ]
}
```

This schema mirrors the dashboard's need for initiative, statuses, and imagery while adding optional links into VTT tokens.

## Development Staging
1. **Scaffold Components:** Create the PHP container, bootstrap entry point, and empty CSS/JS modules.
2. **Read-Only Prototype:** Load a static combat snapshot to validate layout and integration with the VTT shell.
3. **Interactive GM Mode:** Implement CRUD against `combat.php`, including optimistic updates and debounced saves.
4. **Player Sync:** Introduce `sync-service.js` to poll `snapshots.php` and keep observers aligned.
5. **Token Linking:** Allow combatants to attach to active scene tokens, unlocking quick-select during play.

Following this plan keeps the feature isolated, ensures compatibility with the established token/scene systems, and reduces risk of runtime errors while iterating.
