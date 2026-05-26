# Automation Hooks Reference

The canonical hook registry is `../../character_sheet/ability-automation/REGISTRY.md`. This file maps the registry to the code that implements the hooks.

## Main Flow

1. Ability JSON is normalized by `../../character_sheet/ability-automation/schema.js`.
2. The runner in `../../character_sheet/ability-automation/runner.js` walks `automation.cards`.
3. PC abilities get VTT callbacks through `../../vtt/assets/js/ui/character-summary-panel.js`.
4. Monster abilities get the same board callbacks through `../../vtt/assets/js/ui/monster-ability-runner-glue.js`.
5. Board-side CustomEvents are handled in `../../vtt/assets/js/ui/board-interactions.js`.

## Board Callback Surface

`window.VTTBoardCallbacks` is exported from `board-interactions.js` and includes target selection, area selection, damage, healing, conditions, potency checks, forced movement, teleport, swap, free strikes, persistent zones, marks, trigger events, and scoped flags.

Check `REGISTRY.md` before authoring against a hook. If it is not listed there, treat it as unsupported.

## Trigger Bus

`window.AbilityTriggerBus` lives in `board-interactions.js`. Authored trigger blocks use `match.event` and `match.filter`; PC trigger actions in the active scene are registered by the board as passive listeners. The runner's `registerTrigger` context hook still exists as a fallback/debug path. PC triggered actions are always-on once the character token is present in the active VTT scene; the player does not click the ability or open the character summary to start listening. Triggered abilities light the ready marker and are resolved manually. The triggered-action tray dot is also a manual override: clicking a spent/red dot makes the token ready again and clears the round-used flag so non-free authored triggers can arm before the round resets.

## VTT Automation Prompt UI

PC heroic-resource spends use draggable in-app VTT modals, not native browser `prompt`/`confirm` dialogs. Variable spends (`maxAmount`) show stepper buttons. Free-strike target selection uses the board picker plus a small draggable target prompt; right-click map panning remains available because these dialogs do not use a blocking backdrop.

Known current limitation: manual/non-automation damage does not fire the authored damage trigger events. Use the registry for the latest limitation list.

## Monster-Specific Runtime Notes

Monster ability execution is bridged by `monster-ability-runner-glue.js`.

- Villain and malice categories spend from `window.MaliceTracker`.
- Triggered monster actions prompt for confirmation before firing.
- Monsters should use `flatBonus`; attribute lookup exists as a fallback.
- Monster recovery and heroic resource spends skip with a chat note.
- Winded state is based on token HP at or below half max HP.
