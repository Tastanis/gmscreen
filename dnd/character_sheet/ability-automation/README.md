# Ability Automation

This folder contains the character-sheet ability automation authoring and runtime system.

Start here before changing automation code. The system is split so saved ability data, builder UI, runtime execution, and VTT board effects stay separate.

## File Map

- `catalog.js`
  - Shared vocabulary and parser for automation shorthand.
  - Examples: `5 fire`, `push 3`, `slowed SE`, `slowed EOT`, `R < WEAK slowed SE`.
  - Use this when interpreting tier text or describing parsed effects.

- `schema.js`
  - Defines the saved automation data shape.
  - Normalizes old/new cards and saved tier data.
  - Creates default automation and validates warnings.
  - The saved `automation.cards` order is the runtime execution order.

- `primitives.js`
  - Defines builder primitives and action type labels.
  - Current primitives are `Target` and `Action`.
  - Current action types include `powerRoll`, `dealStaminaDamage`, `push`, and `note`.

- `actions.js`
  - Lightweight action registry for reusable executable action concepts.
  - Keep action behavior reusable here when practical.

- `builder.js`
  - Character-sheet authoring UI.
  - Exposes `window.AbilityAutomation.open(actionId, actionType, currentAutomation, onSave)`.
  - Saves only through the `onSave` callback. Do not fetch/save directly from here.

- `builder.css`
  - Styles the builder, builder popup/fallback, and current automation runtime UI.

- `runner.js`
  - VTT runtime executor.
  - Exposes `window.AbilityAutomationRunner.open(options)`.
  - Runs cards top-to-bottom.

## Integration Points

- `../index.php`
  - Loads catalog/schema/primitives/actions/builder/runner for the character sheet.

- `../../vtt/templates/layout.php`
  - Loads catalog/schema/primitives/actions/runner for the VTT.

- `../../vtt/assets/js/ui/character-summary-panel.js`
  - Starts automation when a configured ability is clicked in the VTT ability tray.

- `../../vtt/assets/js/ui/board-interactions.js`
  - Owns board-side effects: target selection, stamina damage, push movement, collision damage, token movement, and token visual feedback.

- `../../vtt/assets/css/board.css`
  - Owns token/map visuals such as selection halos, group dots, team borders, and push overlays.

## Data Model

Automation is stored on each ability/action as:

```js
action.automation = {
  schema: "ability-automation/v2",
  version: 2,
  cards: [
    { type: "target", data: { ... } },
    { type: "action", data: { actionType: "powerRoll", ... } },
    { type: "action", data: { actionType: "dealStaminaDamage", ... } },
  ],
};
```

Do not merge this with the existing manual `tests` array. Manual tests and automation must remain separate.

## Runtime Flow

The runner executes `automation.cards` in stored order.

Typical flow:

1. `target`
   - Requests a token from the VTT board.

2. `action: powerRoll`
   - Opens the power-roll UI.
   - Rolls and selects a tier.
   - Stores the chosen tier in runtime state.

3. `action: dealStaminaDamage`
   - Reads damage from the selected tier.
   - Calls the VTT board to apply stamina damage.
   - Board code handles typed immunity/vulnerability adjustments.

4. `action: push`
   - Reads `push X` from the selected tier.
   - Calls the VTT board to handle forced movement, legal preview squares, token move, and collision damage.

Area targeting is a target card mode. It asks the board to place a square/rectangle template, previews affected tokens while hovering, then stores all affected tokens as the current target set for later actions.

## Builder Shape

Keep the builder model broad:

- A `Target` card selects who/what the ability is aimed at.
- An `Action` card chooses an action type.
- Do not create a new top-level card for every mechanic unless it is truly not an action or target.

For example:

- Power roll is an action type.
- Deal stamina damage is an action type.
- Push is an action type.
- Conditions, riders, and later tier sub-effects should generally live under an action/tier unless there is a strong reason to promote them.

## Current Reference Catalog

Use this section as the human/LLM-facing index of automation concepts that currently exist. When adding a new action, trigger, target mode, or shorthand expression, update this list in the same change.

### Card Types

- `target`
  - Selects a token or area target before later actions resolve.
  - Runtime support exists for selecting one token or placing a square/rectangle area template on the VTT board.

- `action`
  - Executes one configured action type.
  - Action cards are the normal place to add mechanics.

### Action Types

- `powerRoll`
  - Rolls `2d10` plus an attribute/bonus.
  - New power rolls default to `Strongest`, which resolves to the source character's highest Might/Agility/Reason/Intuition/Presence value at runtime.
  - Auto-selects a tier, allows manual tier override, and stores the selected tier for later actions.
  - Tier potency riders are structured `potency` effects in `tier.effects`; shorthand remains supported for imports/backfill.

- `dealStaminaDamage`
  - Reads damage from the selected power-roll tier.
  - Applies stamina damage to every selected target.
  - Board code handles typed immunity/vulnerability adjustments for PC sheets.

- `push`
  - Reads `push X` from the selected power-roll tier.
  - Opens the VTT forced-movement preview.
  - Supports legal push preview squares, skip, token movement, and collision damage.

- `note`
  - Stores non-executable notes for future automation work.
  - Does not mutate board state.

### Trigger Types

No executable trigger cards exist yet.

Current trigger-related behavior is only indirect:

- VTT ability tray click starts an ability automation.
- Free triggered abilities can appear in the tray as abilities, but their trigger condition is not automated yet.

Future trigger work should add explicit trigger concepts here before wiring runtime behavior.

### Target Modes

The current target card stores:

- `mode`
  - Known values: `token`, `area`.

- `count`
  - Known values: `one`, `each`, `all`.

- `creature`
  - Known values: `enemy`, `ally`, `creature`, `object`, `creature or object`.

- `within`
  - Free-text note such as `melee 1`.

- `shape`
  - Area mode only.
  - Known values: `cube`, `rectangle`.

- `size`
  - Area cube/square size. `3` means a 3x3 area.

- `width` / `height`
  - Area rectangle dimensions in squares.

- `range`
  - Area mode placement guide. `10` draws the legal/range outline, but the board currently still allows dropping outside it.

- `optional`
  - Allows an ability to continue without a selected target when configured.

## Shorthand Rules

Use `catalog.js` for parsing and display.

Current supported shorthand:

- `5 fire` means 5 fire damage.
- `2 + Reason corruption` means 2 plus Reason modifier corruption damage.
- `push 3` means push 3 squares.
- `slowed SE` means slowed, save ends.
- `slowed EOT` means slowed until end of turn.
- `R < WEAK slowed SE` means compare the target's Reason to the source's Weak potency threshold and apply slowed, save ends, on failure.

When adding shorthand, update `catalog.js` first, then consume it from schema/builder/runner.

## VTT Boundaries

Builder code should not mutate the VTT board.

Runtime runner code should not directly edit board state. It should call functions passed in through `AbilityAutomationRunner.open(options)`.

Board mutations live in `board-interactions.js`, including:

- target selection
- stamina damage
- typed damage adjustment
- forced movement
- collision damage
- token visual feedback

## Important Invariants

- Plain JavaScript only.
- No new dependencies.
- Do not modify `handler.php` unless unavoidable.
- Saved automation stays on `action.automation`.
- Preserve existing manual `tests`.
- Card order is execution order.
- Builder saves through `onSave`; no direct fetch.
- Runtime should run top-to-bottom.
- VTT board state changes must propagate through existing board state persistence/sync paths.
