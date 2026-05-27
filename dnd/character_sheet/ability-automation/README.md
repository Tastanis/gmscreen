# Ability Automation

This folder contains the character-sheet ability automation system: paste-in JSON authoring, runtime execution, and inspector for debugging.

Start here before changing automation code. Saved ability data, paste UI, runtime execution, and VTT board effects are kept separate.

For LLM-friendly authoring docs, read [`AUTHORING.md`](AUTHORING.md). For the registry of every supported field, hook, and feature, read [`REGISTRY.md`](REGISTRY.md).

## File Map

- `primitives.js` — Single source of truth for vocabulary: block types, effect kinds, conditions, damage types, durations, forced-movement verbs, target predicates, distance forms. Add new vocabulary here first.
- `schema.js` — Normalizes/validates JSON automation against v3. Lenient — surfaces warnings but never blocks save (per A2 questionnaire answer). Exposes `normalizeAutomation`, `summarizeBlock`, `describeAutomationSteps`, `hasAutomation`.
- `catalog.js` — Shorthand parser (LLM-import only). Not used by the runtime.
- `runner.js` — VTT runtime executor. Walks `automation.cards` top-to-bottom, dispatches effects through context callbacks. Exposes `window.AbilityAutomationRunner.open(options)`.
- `paste.js` — Character-sheet authoring UI: a JSON paste dialog. Replaces the v2 builder. Exposes `window.AbilityAutomation.open(actionId, type, currentAutomation, onSave)` matching the legacy signature so the sheet integration is zero-touch.
- `inspector.js` — Read-only inspector modal for one ability. Shows runtime steps, normalized JSON, raw JSON, warnings. Exposes `window.AbilityAutomationInspector.open({ action })`.
- `automation.css` — Styles for runner, paste, inspector, and the small "configured" pip on character-sheet ability buttons.
- `AUTHORING.md` — Format spec. Paste alongside an ability description into an LLM to get JSON output. Self-contained — should never need a code grep.
- `REGISTRY.md` — Flat reference of every supported value, hook, and feature with implementation status.

## Integration points

- `../index.php` — Loads primitives → schema → catalog → paste → inspector → runner for the character sheet (in that order).
- `../../vtt/templates/layout.php` — Loads primitives → schema → catalog → runner for the VTT (paste/inspector aren't needed there).
- `../../vtt/assets/js/ui/character-summary-panel.js` — `startAbilityAutomation()` opens the runner with board hooks.
- `../../vtt/assets/js/ui/board-interactions.js` — Owns `selectTarget`, `selectAreaTarget`, `applyDamage`, `applyCondition`, `checkPotency`, `forceMove` event handlers.

## Saved data shape

```js
action.automation = {
  schema: "ability-automation/v3",
  version: 3,
  warnings: [],   // populated by normalize; surfaced in inspector
  cards: [
    { type: "target",     id, name, mode, predicate, count, optional, distance, ... },
    { type: "powerRoll",  id, attribute, bonus, target, tiers: { tier1, tier2, tier3 } },
    { type: "effect",     id, target, effects: [...] },
    { type: "trigger",    id, condition, effects: [...] },
    { type: "persistent", id, cost, resource, tickAt, effects: [...] }
  ]
}
```

`automation.cards` (the field name is retained from v2 for minimal sheet-side churn) is the runtime execution order. Block types are orthogonal — multiple targets, multiple effects, etc. all allowed.

## Runtime flow

For each block in `automation.cards`:

1. `target` — VTT prompts the user to pick token(s) or place a template. Result is stored under `state.groups[block.name]`.
2. `powerRoll` — Open dice modal; user rolls, picks a tier, accepts. The runtime then walks `tier.effects` and dispatches each effect against the resolved target group.
3. `effect` — Walk `block.effects` against the target group (no roll).
4. `trigger` — With structured `match`, registers on the VTT trigger bus. PC trigger actions in the Triggers list auto-register when that character's summary panel loads or refreshes. Resolving a ready trigger skips the trigger card and runs the follow-up cards with the captured event payload. Without `match`, posts a chat reminder.
5. `persistent` — Post a chat reminder. **No zone tracking this pass.**

Each effect is dispatched by `kind`:

- `damage`, `condition`, `forcedMovement` (push), `potency`, `spend` — full implementation via board hooks.
- `forcedMovement` (pull/slide/vertical) — verb passed through; board may fall back to push behavior. See REGISTRY.md.
- `heal`, `temporaryStamina`, `teleport`, `swap`, `freeStrike`, `resourceGain`, `note` — full implementation via board/sheet hooks.
- `cascade`, `other` — chat reminder; manual application required.

## Authoring flow

1. The user types ability text on the character sheet (name, description, range, cost, tests). The sheet handles all of that.
2. The user clicks **Automate** on the ability.
3. `paste.js` opens a modal with a JSON textarea.
4. The user pastes (or types) JSON. Live lenient validation shows warnings/summary.
5. Click **Save** — the JSON is normalized and written to `action.automation`.
6. The user can click **Inspect** later to read the saved JSON, see the runtime-step preview, and confirm warnings.

## Important invariants

- Plain JavaScript only. No new dependencies.
- Do not modify `handler.php`.
- Saved automation lives on `action.automation`.
- The character sheet's manual `tests` array is separate — never merge.
- `automation.cards` order is execution order.
- `paste.js` saves through the `onSave` callback only — no direct fetch.
- `runner.js` does not mutate the board directly. All board effects flow through `state.context.*` callbacks.
- VTT board state changes propagate through the existing board state persistence/sync paths.
- When adding a new effect kind, condition, etc.: update `primitives.js`, then `schema.js` normalizer, then `runner.js` dispatcher, then `AUTHORING.md` and `REGISTRY.md`.

## Known gaps (deferred to later phases)

- Persistent zone **persistence across page reloads** + Pusher sync to other clients (Pass 1 is in-memory + GM-only).
- Persistent zones: "on enter zone" trigger during movement (Pass 1 only ticks at owner's turn).
- Vertical forced movement (Z-axis); horizontal push/pull/slide are fully wired.
- `cascade` effect kind — fires another ability as a free triggered action. Needs stable cross-ability identifiers and a recursive runner entry point. Phase D candidate.
- Recovery-style heals now decrement the target PC's `currentRecoveries` through the VTT sheet save path. Non-PC targets or unresolved sheets still fall back to chat/no-op behavior.
- Marks (judged by, marked by, bonded).
- Teleport's destination picker reuses the slide overlay, which means clicking an occupied cell triggers a slam (technically wrong for teleport). Picking an empty cell behaves correctly.
- Auto-resolution of fired triggers — today the bus marks the watcher's blue `!` overlay and the user clicks to resolve. Intentional: keeps the player in the loop.
- Standalone inspector page listing every ability across every character.

When implementing any of these, update `REGISTRY.md` so authors know.
