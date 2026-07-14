# Monster Automation Reference

Single entry point for authoring `automation` JSON on **monster** abilities (Strixhaven Monster Creator → VTT monster tray). The canonical field/enums registry is `../../character_sheet/ability-automation/REGISTRY.md` — everything there applies to monsters unless this file says otherwise. Read this file first, then confirm exact field shapes in REGISTRY.md.

## Where automation lives

Each monster ability object may carry an `automation` object using the same `ability-automation/v3` schema PCs use:

```json
{
  "name": "Tile Slide",
  "keywords": "Earth, Magic",
  "range": "Ranged 10",
  "targets": "Each creature in the area",
  "effect": "…stat block text…",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [ … ]
  }
}
```

Abilities live in `monster.abilities.<category>` arrays. Use ONLY these category keys:

`passive`, `maneuver`, `action`, `triggered_action`, `villain_action`, `malice`

The category is the array the ability sits in — there is no `category` field on the ability itself. PHP round-trips `automation` opaquely (`dnd/vtt/api/monster_helpers.php`); validation happens in `schema.js`.

## Monster authoring rules (differences from PCs)

| Rule | Detail |
|---|---|
| Static numbers | No `7 + M` formulas. Damage amounts and distances are literal integers. |
| `flatBonus` on power rolls | Use `"flatBonus": 2` instead of `"attribute"`. Attribute lookup exists as a fallback (reads the monster's M/A/R/I/P) but `flatBonus` is the convention. |
| Static potency targets | `getPotencyThreshold` returns 0 for monsters — hard-code the potency `target` integer from the stat block (e.g. `M<2` → `"target": 2`). |
| `whenWinded` | Works exactly like PCs: shallow-merge override on `powerRoll` (bonus/tiers) or `effect` (effects/target) when token HP ≤ half max. |
| `usageLimit` | Works for monsters (scoped flags are placement-keyed). `{ "scope": "encounter", "key": "my-key", "target": "self", "message": "1/encounter." }` |
| No heroic resources | `spend` falls back to a native confirm dialog; `resourceGain`/`surgeGain` post chat reminders. Prefer `note` for these mechanics. |
| No recoveries on monsters | `heal` with flat `amount` works. `recoveries` only works when the recovery **source** resolves to a PC sheet (a monster ability can drain/heal a PC target's recoveries); a monster-as-source recovery skips with a chat note. |
| Malice costs | Put the cost in the ability's `resource_cost` string (e.g. `"3 Malice"`). Nothing goes in the automation JSON — the runtime parses the first integer. |
| Marks | `applyMark`/`endMark` are passed through but are PC mechanics — prefer `note` unless intentionally sharing mark state. |

## Runtime layer (what the monster tray adds around the runner)

Selecting a monster token opens the monster ability tray (`monster-ability-tray.js`) and summary panel, gated by `window.canViewMonster(placement)` (GM, ally team, or claimed token). Clicking an automated ability calls `window.MonsterAbilityRunner.start(monster, ability, category, placement)` (`monster-ability-runner-glue.js`), which layers on:

| Behavior | When | Effect |
|---|---|---|
| Malice auto-spend | category `villain_action` or `malice` | Parses cost from `resource_cost` (first integer), calls `window.MaliceTracker.spend(cost)`. Confirm dialog if the pool is short. |
| Confirm-fire | category `triggered_action` | "Fire triggered action now?" dialog before the runner opens. |
| Manual trigger resolution | category `triggered_action`, fired without a captured event | The glue sets `manualTriggerResolution`, so the runner **executes** the trigger card's effects (plus any later cards) instead of just arming a listener. |
| Once-per-round gate | non-free triggered actions | `consumeTriggeredAction` marks the token's triggered action used for the round. A `resource_cost` containing "free" makes it a free triggered action (no consumption). |
| PC-only resource skip | `spend`/`resourceGain`/etc. | Chat note + continue; never throws. |

Board callbacks passed through 1:1 to the runner: target/area selection, damage, heal, temporary stamina, conditions, potency, forced movement, teleport, swap, free strikes, persistent zones, marks, scoped flags, auras, floating text, turn starts, trigger events, distance queries. Same surface as PCs (`window.VTTBoardCallbacks`).

## Triggered actions — how they actually fire

Monster trigger blocks are **armed automatically**: whenever a monster placement is in the active scene, the board registers every `trigger` card that has a structured `match` on `window.AbilityTriggerBus` (`registerMonsterAuthoredTriggersForPlacement` in `board-interactions.js`). This happens on ALL clients — player clients keep a stripped `monsterTriggerHooks` field even when the enemy stat block is hidden — because event detection runs on the acting client (the player who pushes or damages the monster).

Flow:

1. Scene loads / placement changes → trigger cards with `match.event` register on the bus. Listener id is `placementId:category:abilityName`.
2. A matching event fires (see event catalog below) → the monster token gets the blue `!` ready marker, the tray row highlights, and chat posts "trigger is READY".
3. GM selects the monster and clicks the highlighted ability → confirm dialog → the runner resolves the trigger card's `effects` with the captured event payload (so `eventActor`, `halveTriggeringDamage`, `amountFrom` all work).
4. The GM can also fire a triggered action manually at any time (no ready marker) — it executes immediately after the confirm dialog.

Ready markers expire at turn end (standard trigger lifetime rules). Trigger cards in ANY category register (a `passive` trait with a `trigger` card arms too); only the `triggered_action` category consumes the round's triggered action, and only when its `resource_cost` doesn't say "free".

Authoring implication: give every monster triggered action a `trigger` card with a structured `match` — that is what makes it light up on its own. A trigger card without `match` only posts a chat reminder.

## Trigger event catalog (condensed — payloads and full filter fields in REGISTRY.md)

| `match.event` | Fires when | Common filters |
|---|---|---|
| `damage` | automated damage lands on a token | `whose` (`self` = this monster), `minAmount`, `damageType` |
| `damageDealt` | a token DEALS automated damage | same, `whose` resolves against the dealer |
| `staminaChange` / `staminaZero` | any stamina delta / drop to 0 (includes manual VTT damage) | `whose`, `direction` |
| `move` | a token finishes normal movement | `whose`, `leavesAdjacency`, `entersAdjacency`, `minDistance`, `maxDistance` |
| `forcedMovement` / `forcedMovementDealt` | automated push/pull/slide resolves | `whose`, `verb`, `minDistance`, `targetWhose` |
| `powerRoll` / `abilityTest` / `abilityRoll` | an automated roll is accepted | `whose`, `actionKind`, `keywordsAny`, `attribute`, `tier`, `minTotal` |
| `potency` | an automated potency check starts | `whose`, `attribute`, `level`, `minTargets` |
| `actionUsed` | an ability automation run starts | `whose`, `actionKind`, `keywordsAny`, `costIncludes` |
| `markApplied` | a mark is applied/transferred | `whose`, `markType`, `source` |
| `turnStart` / `turnEnd` / `roundStart` / `roundEnd` / `combatStart` / `combatEnd` | combat boundaries | `whose` (turn events) |
| *(any event)* | — | `withinSquares` / `minSquares` — distance band between this monster and the event's token |

`whose: "self"` means "the event happened to THIS monster" (it was damaged, it was force-moved). `whose: "enemy"` compares combat teams. Trigger effects default to targeting `eventActor`; override with `effectTarget` on the trigger card. Add `expires` for "until the end of the next round"-style listeners, and `autoResolve: true` to run the trigger's effects immediately with no GM click (use sparingly — the campaign convention is confirm-before-fire).

## Effect kinds — monster quick sheet

Full table in REGISTRY.md. Monster-relevant summary:

- **Fully automatable, use freely:** `damage` (with `amountDice`, `damageType`), `condition`, `forcedMovement` (push/pull/slide), `shift`, `potency` (+ `onFail`), `heal` (flat amount), `temporaryStamina`, `teleport`, `swap`, `freeStrike` (uses the monster's `free_strike` stat), `abilityTest`, `aura` (visual + automated tick rules), `floatingText`, `note`, `ifPrompt`, `ifKeyword`, `ifDistance`, `ifScopedFlag`, `setScopedFlag`, `halveTriggeringDamage`, `usageLimit` (top level), `whenWinded` (modifier).
- **Works but PC-flavored — prefer `note`:** `applyMark`, `endMark`, `ifMark`, `startTurn`.
- **Chat-reminder only on monsters:** `spend`, `resourceGain`, `surgeGain`, `cascade`, `other`.
- **Do NOT automate (post a `note` instead):** summoning/spawning tokens, controlling another creature's actions, terrain-state changes (scree, walls, pits — describe them), effects requiring an ally's choice, faction-wide behavioral constraints. The GM adjudicates these; the note keeps them visible.

## Worked example 1 — action with tiers, potency, and winded override

```json
"automation": {
  "schema": "ability-automation/v3",
  "cards": [
    {
      "type": "target",
      "name": "primary",
      "mode": "token",
      "predicate": "enemy",
      "count": { "value": 1, "mode": "exact" },
      "distance": { "form": "melee", "value": 1 }
    },
    {
      "type": "powerRoll",
      "flatBonus": 2,
      "tiers": {
        "tier1": { "effects": [ { "kind": "damage", "amount": 6 } ] },
        "tier2": { "effects": [
          { "kind": "damage", "amount": 9 },
          { "kind": "forcedMovement", "verb": "push", "distance": 2 }
        ] },
        "tier3": { "effects": [
          { "kind": "damage", "amount": 12 },
          { "kind": "forcedMovement", "verb": "push", "distance": 3 },
          { "kind": "potency", "attribute": "M", "target": 2, "onFail": [
            { "kind": "condition", "name": "prone" }
          ] }
        ] }
      },
      "whenWinded": {
        "flatBonus": 3
      }
    }
  ]
}
```

## Worked example 2 — triggered action (auto-arming)

Stat block: "Trigger: The first push, pull, slide, or area effect used against the Render. Effect: halve the damage, ignore the forced movement, square becomes scree. 1/encounter."

```json
"automation": {
  "schema": "ability-automation/v3",
  "cards": [
    {
      "type": "trigger",
      "condition": "First push/pull/slide or area effect against the Render",
      "match": {
        "event": "forcedMovement",
        "filter": { "whose": "self" }
      },
      "effects": [
        { "kind": "floatingText", "text": "THE STONE DIES INSTEAD", "tone": "danger" },
        { "kind": "note", "text": "SQUANDERER'S MARK: halve the damage from the triggering effect, cancel the forced movement, and turn the Render's square into scree." }
      ]
    }
  ],
  "usageLimit": { "scope": "encounter", "key": "squanderers-mark", "target": "self", "message": "Squanderer's Mark is 1/encounter." }
}
```

When a PC's automated ability force-moves this monster, the `!` marker appears on the token, the tray's Triggered tab row glows, and the GM resolves it with one click. Firing marks the encounter-scoped usage flag; a second fire is blocked with the message.

## Checklist before shipping monster automation JSON

1. Category key is one of the six exact strings; ability sits in that array.
2. `schema` is `ability-automation/v3`; only fields listed in REGISTRY.md.
3. Power rolls use `flatBonus`; all numbers literal; potency targets hard-coded.
4. Triggered actions have a `trigger` card with structured `match` (else they never light up).
5. Malice cost is in `resource_cost`, not in automation.
6. Unsupported mechanics are `note` cards, not invented fields.
7. Per-use limits use `usageLimit`, not prose.
8. **The ability's FULL rules text is written out in the displayed fields** (`effect`, `test.tierN` damage/`tier_effect`/attribute-check fields, `additional_effect`, `trigger`). The GM never sees the automation JSON — every rider (push, condition, potency, zone) that exists in an automation card must also appear in the display text, or the hover card will look like plain damage and be run wrong.
9. **When authoring a whole monster: complete stats are mandatory.** All five `attributes` (`might`, `agility`, `reason`, `intuition`, `presence`) plus `level`, `role`, `ev`, `size`, `speed`, `stamina`, `stability`, and `free_strike` must be present on every monster — a monster without a Might score is invalid. See `dnd/strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`.
