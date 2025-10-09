# VTT Workspace Blueprint

This document captures the implementation plan for the Virtual Tabletop (VTT) workspace. It mirrors the dashboard look and feel, keeps systems modular, and safeguards against runtime errors during development.

## Vision & Styling Goals
- Reuse the dashboard's gradient palette (indigo-to-violet backgrounds, soft white panels, vivid accent buttons) to ensure the VTT feels native to the existing UI.
- Favor CSS custom properties and BEM-like class naming for extensible theming.
- Keep dynamic styling (e.g., grid sizing) managed by JavaScript modules, not inline HTML.

## Directory Map
```
vtt/
├── index.php              # Entry point, renders layout shell only
├── bootstrap.php          # Loads dependencies, exposes helper functions
├── config/
│   └── routes.php         # Centralizes API route constants
├── components/            # PHP render helpers for discrete UI sections
│   ├── ChatPanel.php
│   ├── SettingsPanel.php
│   ├── SceneBoard.php
│   ├── TokenLibrary.php
│   └── Shared/            # Shared partials (modals, icons, etc.)
├── assets/
│   ├── css/
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── board.css
│   │   ├── chat.css
│   │   └── settings.css
│   └── js/
│       ├── bootstrap.js   # Composes state, services, and UI modules
│       ├── state/
│       │   ├── store.js
│       │   └── persistence.js
│       ├── services/
│       │   ├── chat-service.js
│       │   ├── scene-service.js
│       │   └── token-service.js
│       ├── ui/
│       │   ├── chat-panel.js
│       │   ├── settings-panel.js
│       │   ├── scene-manager.js
│       │   ├── token-library.js
│       │   ├── board-interactions.js
│       │   └── drag-ruler.js
│       └── vendor/        # Third-party libs (if needed)
├── api/
│   ├── scenes.php
│   ├── tokens.php
│   ├── uploads.php
│   └── state.php
├── combat-tracker/       # Self-contained combat tracker module (see README)
├── storage/
│   ├── scenes.json
│   ├── tokens.json
│   ├── board-state.json
│   └── backups/           # Timestamped rollback files
├── templates/
│   ├── layout.php
│   └── partials/
└── README.md
```

## Entry Point Separation
- `index.php` validates the session, loads `bootstrap.php`, and renders the high-level layout. It injects a `window.vttConfig` snapshot for front-end modules but avoids heavy logic.
- `bootstrap.php` wires dependencies, exposes helper functions, and coordinates server-side rendering of core components (chat, settings, board).
- PHP components inside `components/` return isolated markup snippets so features remain decoupled.

## Front-End Architecture
- Native ES modules power the front end. `assets/js/bootstrap.js` imports state, services, and UI modules to assemble the application after DOM readiness.
- `state/store.js` hosts a lightweight publish/subscribe store (similar to Redux) for active scene, tokens, and grid metadata.
- `state/persistence.js` wraps API calls, throttles writes, and ensures the UI can survive temporary persistence failures.

### UI Modules
- `ui/chat-panel.js` integrates with the existing chat poller so the VTT chat stays synchronized with the dashboard chat. The label is updated to “VTT Chat.”
- `ui/settings-panel.js` controls the settings slide-out, managing tabs for scenes, tokens, and global preferences.
- `ui/scene-manager.js` handles CRUD for scenes, including grid configuration and activation.
- `ui/token-library.js` offers token template management, spawning instances onto the board.
- `ui/board-interactions.js` provides drag/drop handling, keyboard nudging, and grid snapping.
- `ui/drag-ruler.js` displays a measurement overlay for distance calculations.

## Backend Services
- `api/scenes.php`: CRUD operations for scenes (title, map, grid settings, active flag) using robust input validation and file locking.
- `api/tokens.php`: Manages token templates and scene-specific placements with optimistic versioning.
- `api/uploads.php`: Reuses existing upload sanitization pipelines for scene and token assets.
- `api/state.php`: Delivers a combined snapshot of scenes and board state for initialization and recovery.

## Combat Tracker Module
- Lives under `combat-tracker/` to keep turn-management logic isolated from the core board.
- Mirrors dashboard tracker capabilities (initiative, rounds, conditions) but will integrate tightly with active scenes/tokens.
- Provides its own PHP component, API endpoints, storage file, and front-end bootstrap so the feature can ship independently.
- See `combat-tracker/README.md` for the detailed blueprint, data model sketch, and development milestones.

## Persistence & Resilience Strategy
- JSON files in `storage/` are the source of truth. Each write is staged to a temp file and then atomically renamed. Previous versions are stored in `storage/backups/`.
- The front end performs debounced persistence via `persistence.js` to avoid overwhelming the server during drag operations.
- On load failure, the UI renders a minimal fallback with actionable error messaging, preventing fatal PHP errors.

## Chat Integration
- Chat modules reuse the same endpoint and poller as the dashboard. Only the panel title changes, so both chat logs stay in sync automatically.

## Development Workflow
1. Extend PHP components for new UI areas. Avoid embedding business logic directly in PHP templates.
2. Add new state slices via `store.js` and extend services for API interactions.
3. Update API endpoints to read/write validated JSON models.
4. Run lint/tests (to be defined) before committing.

This README will evolve as the VTT is implemented. For now, it documents the scaffolding and intended modular architecture.
