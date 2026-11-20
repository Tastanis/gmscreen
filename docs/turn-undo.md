# Turn undo

Brandon, October 2026.

| Key | During a running turn | No turn running |
|---|---|---|
| Ctrl+Z | Undoes the turn's newest action (anyone's: a move, a whole ability use, a damage entry, a Malice change, a hero's heroic resource / surges / Recoveries spend) | Undoes your own last move (movement receipts, as before) |
| Ctrl+Shift+Z | Asks, then undoes every action of the turn so far (the turn stays running) | Says no turn is running |

- Anyone in the game may undo during a turn, any token (the server applies it with its own authority).
- Each undo posts one chat line, named for who did the action: `↶ Undid Burst: 6 damage to Goblin 1, Dazed on Cal — Zepha`. A whole turn is one line.
- A step whose token changed again since is left as it is (banner says so) and set aside.
- Hidden tokens read "a hidden creature" for players.

## How

- Server: `vtt/lib/UndoJournal.php` (table `vtt_undo_steps`) keeps before/after of every changed field while `combat.activeCombatantId` is set: `acceptPlacementBatch`, `acceptTokenMove`, Malice in `acceptCombatCommand`. Endpoint `vtt/api/v2/undo.php` (`step`, `turn`, `count`, `record`). Restores go through `acceptPlacementBatch`'s restore path; Malice by the opposite change.
- One action = one `undoGroup`: the ability runner sets it for a whole ability use (`runner.js open`), a move sets one for the move (a grab drag-along included). `services/undo-client.js` tags commands (`token-movement-runtime.js`).
- Hero sheet counters are reported by the page that changed them (`character-write.js`, the character panel) and given back by the undoing page; PC Stamina follows the token back to the sheet.
- "Start <name>'s turn?": combat on, nobody's turn running, the first move or ability by a creature (own hero for players; anything for the Director), once a round per creature.

Undoing a qualifying push can restore the token and mend the wall pieces recorded on its movement receipt. The individual move-undo path also attempts to refund recorded collision damage. Falls and later dependent actions require separate review. Chat, dice already rolled and turn boundaries remain visible. Ordinary map edits use their own undo. [Turn restore](../dnd/vtt/lib/SyncV2Store.php#L1501) · [Move undo and collision refund](../dnd/vtt/assets/js/ui/board-interactions.js#L10018)
