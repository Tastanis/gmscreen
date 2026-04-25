# VTT Combat Tracker Shell

This directory is intentionally not a second combat tracker implementation.

The live tracker is owned by the board and its extracted modules in:

`dnd/vtt/assets/js/combat/`

The canonical persisted combat state remains:

`boardState.sceneState[sceneId].combat`

## Current Status

- The PHP endpoints in `api/` are disabled shell endpoints. They do not read or write separate combat storage.
- `assets/js/bootstrap.js` re-exports the live combat modules as namespaces for future wrapper work.
- The service and store files are lightweight adapter scaffolds only. They require board-state dependencies to be injected.
- The `storage/` directory is intentionally empty except for `.gitkeep`; live combat state must not be persisted here.

## If This Becomes A Dedicated Page Later

Build it as a thin wrapper around `dnd/vtt/assets/js/combat/` and the existing board-state persistence path. Do not add a second JSON file, endpoint contract, or client-side state model that can diverge from the live board.
