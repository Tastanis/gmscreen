# Automation Hooks Reference

The canonical hook registry is `../../character_sheet/ability-automation/REGISTRY.md`. This file maps the registry to the code that implements the hooks.

## Main Flow

1. Ability JSON is normalized by `../../character_sheet/ability-automation/schema.js`.
2. The runner in `../../character_sheet/ability-automation/runner.js` walks `automation.cards`.
3. PC abilities get VTT callbacks through `../../vtt/assets/js/ui/character-summary-panel.js`.
4. Monster abilities get the same board callbacks through `../../vtt/assets/js/ui/monster-ability-runner-glue.js`.
5. Board-side CustomEvents are handled in `../../vtt/assets/js/ui/board-interactions.js`.

## Board Callback Surface

`window.VTTBoardCallbacks` is exported from `board-interactions.js` and includes target selection, area selection, damage, healing, PC recovery spending, conditions, potency checks, forced movement, teleport, swap, free strikes, persistent zones, marks, trigger events, scoped flags, board-state power-roll suggestions, and hidden roll-rider consumption through `consumeRollRiders`.

Check `REGISTRY.md` before authoring against a hook. If it is not listed there, treat it as unsupported.

## Trigger Bus

`window.AbilityTriggerBus` lives in `board-interactions.js`. Authored trigger blocks use `match.event` and `match.filter`; PC trigger actions in the active scene are registered by the board as passive listeners. The runner's `registerTrigger` context hook still exists as a fallback/debug path. PC triggered actions are always-on once the character token is present in the active VTT scene; the player does not click the ability or open the character summary to start listening. Triggered abilities light the ready marker and are resolved manually. The triggered-action tray dot is also a manual override: clicking a spent/red dot makes the token ready again and clears the round-used flag so non-free authored triggers can arm before the round resets.

## VTT Automation Prompt UI

PC heroic-resource spends use draggable in-app VTT modals, not native browser `prompt`/`confirm` dialogs. Variable spends (`maxAmount`) show stepper buttons. Free-strike target selection uses the board picker plus a small draggable target prompt; right-click map panning remains available because these dialogs do not use a blocking backdrop.

Target-selection prompts can be customized from ability JSON with `promptTitle` and `promptText` on a `target` card. The runner also supplies a generic damage prompt when a target card is immediately followed by damage against that same target group. Token target cards with custom or inferred prompt text use the board picker as the single visible prompt, including `Skip` for optional target cards.

Recovery-style heals (`{ "kind": "heal", "recoveries": N }`) call `spendRecoveryForTarget`, which acts on the **target's** sheet: for a matched PC target it decrements `hero.vitals.currentRecoveries` before applying stamina healing. This works regardless of whether the caster is a PC or a monster, so a monster ability can heal or drain a PC target's recoveries. Targets with no recovery pool (e.g. another monster) skip or fall back to a chat reminder.

Known current limitation: manual/non-automation damage does not fire the authored damage trigger events. Use the registry for the latest limitation list.

## Monster-Specific Runtime Notes

Monster ability execution is bridged by `monster-ability-runner-glue.js`.

- Villain and malice categories spend from `window.MaliceTracker`.
- Triggered monster actions prompt for confirmation before firing.
- Monsters should use `flatBonus`; attribute lookup exists as a fallback.
- Monster heroic `spend` falls back to a native `confirm()` dialog (the monster context omits `spendHeroicResource`); `resourceGain` and `surgeGain` post manual chat reminders (`applyResourceGain` / `applySurgeGain` are not passed). Recovery heals are NOT monster-blocked — `spendRecoveryForTarget` is wired and acts on the target's sheet.
- Winded state is based on token HP at or below half max HP.
