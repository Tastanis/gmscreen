# VTT automation audit — October 2026

Report only: nothing in the code was changed. Read on main at Build 545 (`570e2d1c`, October 21, 2026). Example
abilities were checked against the live data in the sandbox made from Brandon's capture of October 21.

---

## Summary for Brandon (one page)

**What is good.**
- **One engine already runs heroes and monsters.** Both go through the same runner, the same JSON format and the
  same board actions. Most of the plumbing you'd want for a single system is already built.
- **The format is readable and forgiving.** Mistakes produce warnings, not refusals.
- **Large coverage:**
  - 31 effect kinds and 19 trigger events
  - auras, zones, marks, forced movement with straight-line pushes, requested tests
  - captain bonuses, Malice, and heroic-resource rules kept as data on each sheet
- **It's in real use:** 205 of the 550 abilities in your monster library are automated, plus most of Cal's.

**The five worst problems.**
1. **Triggered actions can be clicked any time, and it costs you.** On a hero's Triggers tab, clicking a triggered
   action that isn't ready still spends its resource and marks the triggered action used. Then it hits nobody.
   Monsters ask first; heroes don't.
2. **"End of turn" conditions put on by an ability never come off.** The board sets the condition up to end on a
   turn, but nothing ever checks that. Only conditions you add by hand expire. Cal's Protective Attack shows it.
3. **Damage you apply by hand is invisible to automation.** Triggers and resource rules that wait for "takes
   damage" only hear damage that came from an automated ability. Damage from the Damage/Heal tool, or from typing
   a new Stamina, never reaches them.
4. **Some features accepted by the JSON quietly do nothing.** Examples:
   - "first time each round" flags
   - "count: all" targets
   - spend timing
   - line-of-effect filters
   - the effects nested inside a potency result, which lose their named targets

   The paste box accepts all of these without a warning, so you can't tell they won't work.
5. **Malice and villain actions follow the wrong rules.**
   - Ordinary actions that cost Malice don't take any Malice.
   - Any number in the cost is read as Malice ("30 stamina" would try to spend 30 Malice).
   - Villain actions are charged Malice, which they shouldn't be.
   - Nothing keeps villain actions to one per round, three per fight, in order.

**Players versus monsters.** Don't build a second engine, and don't merge the data files. The engine is already
shared. What differs is the data each side hands it (sheet vs monster card, heroic resource vs Malice, attribute vs
flat bonus) and a few extras one side has and the other lacks. The right move is one shared "who is acting" adapter
that both sides fill in. Then heroes gain the confirm step, and monsters gain resource spends and surges, without
touching anything already pasted or imported.

**The first build I'd do.** One small bug-fix build for problems 1–3:
- the confirm step before a triggered action
- ability-applied end-of-turn conditions expiring on the right turn
- hand-applied damage reaching triggers and resource rules

Each fix is a few lines, can be tested on its own, and changes no saved data. It removes the three things most
likely to go wrong silently at the table.

---

## 1. The system as it is

### What talks to what

```
 Hero sheet (character_sheet/sheet.js)            Monster Creator (strixhaven/monster-creator)
   ability.automation  (ability-automation/v3)       ability.automation  (same v3 format)
   hero.resource.automation (heroic-resource/v1)     resource_cost text ("2 Malice")
          |                                                   |  copied onto the token at placement
          v                                                   v      (placement.monster: a snapshot)
 character-summary-panel.js                        monster-ability-tray.js
   startAbilityAutomation: hero context              monster-ability-runner-glue.js: monster context,
   (sheet stats, kit/feature modifiers,              Malice reserve/refund, confirm before triggered
    heroic resource spend, surges)                   actions, captain bonus as a feature
          \_______________________   _______________________/
                                  v v
               ability-automation/runner.js  (AbilityAutomationRunner.open)
               target -> powerRoll / requestedTest -> effects -> trigger / persistent cards
                                  |
                 board callbacks: 'vtt:automation-*' events
                                  v
 board-interactions.js (VTTBoardCallbacks, ~line 13562; handlers ~2865-2891, 6009, 17034-18900)
   select target/area, apply damage/condition, check potency, force move, auras, zones, marks,
   scoped flags, requested tests, chat
                                  |
   board events -> triggerFire (B:3343) -> standing triggers, ready "!" markers, auras (B:4385),
                                           heroic-resource rules (B:3749)
```

(B = `dnd/vtt/assets/js/ui/board-interactions.js`, R = `dnd/character_sheet/ability-automation/runner.js`.)

### Where each part lives

| Part | Files |
|---|---|
| The format | `ability-automation/schema.js` (normalizer, ~2100 lines), `primitives.js` (lists), `AUTHORING.md`, `REGISTRY.md`, `README.md` |
| Pasting and checking | `paste.js` (raw JSON or `{fields, automation}`), `inspector.js`, `field-map.js` (writes the sheet's display fields from the JSON) |
| Running | `runner.js` (4,261 lines): `open` at R:3999; card loop at R:3598-3640; effects at R:1749-1828 |
| Board side | `board-interactions.js` handlers; `automation-target-prompt.js`, `automation-trigger-predicate.js`, `automation-trigger-lifetime.js`, `automation-trigger-ready.js`, `automation-move-display.js`, `automation-resistance.js` |
| Conditions | `token-conditions.js`, `combat/combat-effects.js` (end-of-turn clearing), save-ends prompt B:11361 |
| Forced movement | `forced-move-cells.js`, `forced-drag.js`, `forced-line.mjs`, `forced-flight-terrain.js` |
| Auras and zones | `token-aura-records.js`, `token-aura-renderer.js`, `board3d/layers/auras.mjs`, persistent zones |
| Requested tests | `requested-test-coordinator.js`, runner `rollRequestedTest` R:4176 |
| Heroic resources | `heroic-resource-automation.js` (rules are data on each sheet), board B:3565, B:3749, B:3916 |
| Monsters | `monster-ability-tray.js`, `monster-ability-runner-glue.js`, `monster-summary-panel.js`, `minion-squads.mjs`, `malice-changes.mjs`, Malice UI B:13473-13560, server `SyncV2Store.php` (start, per-round Malice, change amounts) |

### Board events (the hooks that exist today)

| Event | Fired from |
|---|---|
| `turnStart`, `turnEnd`, `roundStart`, `roundEnd`, `combatStart`, `combatEnd` | `fireTimingBoundary` B:3533 (combat transitions B:1165-1258 and others) |
| `move` | walks B:2986; shifts B:19167 |
| `damage`, `damageDealt` | **automated damage only** (B:17684, B:17698) |
| `staminaChange`, `staminaZero` | hand-applied changes (B:3446) and automated damage (B:17714) |
| `forcedMovement`, `forcedMovementDealt`, `powerRoll`, `abilityTest`, `abilityRoll`, `potency`, `actionUsed` | sent by the runner (R:1588, R:2447, R:2553, R:3773) through B:5636 |
| `markApplied` | B:5477 |

Missing hooks that Draw Steel abilities often care about: a creature **falls**, is **grabbed** or released, is
**targeted** (before the roll), **gains or loses a condition**, **makes a save**, **enters or leaves an aura or
zone** (zones have onEnter; auras don't), **becomes winded**, **is teleported**, and **a hero spends a resource**.

---

## 2. The vocabulary today

### What the JSON can name, and whether it works

| Group | Names | Works? |
|---|---|---|
| Cards (8) | target, powerRoll, requestedTest, effect, trigger, persistent, branch, choice | All run (R:3602-3618). The inspector shows requestedTest as a blank line (schema.js:2071-2106). |
| Effect kinds (31) | damage, heal, temporaryStamina, condition, forcedMovement, shift, teleport, swap, abilityTest, resourceGain, surgeGain, freeStrike, cascade, note, potency, spend, ifKeyword, ifStrained, ifPrompt, ifMark, ifScopedFlag, ifDistance, ifZone, setScopedFlag, applyMark, endMark, halveTriggeringDamage, floatingText, startTurn, aura, other | All are dispatched (R:1766-1828). `cascade` and `other` only post to chat. `abilityTest` rolls with empty tiers (R:3196-3210). |
| Conditions | bleeding, dazed, dying, frightened, grabbed, hidden, hiddenEffect, prone, restrained, slowed, taunted, unconscious, weakened, damageWeakness, damageImmunity, other | Applied (R:2118). Expiry is broken for ability-applied end of turn (§3). |
| Durations | instantaneous, endOfTurn, saveEnds, endOfEncounter, untilDying | Mapped at R:2269. The board then misreads some (§3, bug 8). |
| Forced movement | push, pull, slide, verticalPush, verticalPull, verticalSlide | The vertical forms are flattened to horizontal (B:18287). REGISTRY says "partial". |
| Target predicates, area shapes, distance forms | creature, enemy, ally, object, creatureOrObject, self, selfOrAlly, selfAndAlly; cube, rectangle, burst, aura, line, wall; self, melee, ranged, meleeOrRanged, burst, aura, cube, line, wall | Work, sent to the board's pickers (R:806-890). |
| Trigger events (19) | as in the table above | Matched in `automation-trigger-predicate.js:112-202`. |
| `whose` | self, ally, enemy, target, judgedTarget, markSource, any | Work (predicate.js:34-58). `target` does less than REGISTRY says (§3, bug 14). |
| Trigger filters | excludeSelf, casterHasNotActed, targetWhose, withinSquares, minSquares; damage min/max/type/actionKind/costIncludes/keywordsAny; stamina direction; roll attribute/tier/total; potency level and target count; markType; move leaves/enters adjacency, distance; forced distance and verb | Work. |
| Branch conditions (8), persistent zones (cost, tickAt, expiresAt, onEnter, onOccupantTurnStart), modifiers (match keywords/damageType/attribute; apply damageBonus/rangeBonus/forcedMovementBonus/damageType), passives (`standFirm`), `usageLimit`, scoped flags, marks | | Work, with the exceptions below. |
| Heroic-resource rules (`heroic-resource/v1`) | events: combat/round/turn start and end, damage, damageDealt, forcedMovement(Dealt), actionUsed, powerRoll, abilityTest, abilityRoll; effects gain/set/lose/damage; limits per round/turn/encounter | Work. `move` is not a resource event. |

### Accepted, but nothing acts on it

| Name | Where accepted | What happens |
|---|---|---|
| `spend.timing` (preRoll / postResult) | schema.js:688 | Ignored by `applySpendEffect` (R:2991-3040). AUTHORING:1008 and REGISTRY:258 describe it as working. |
| `filter.lineOfEffectTo` | schema.js:1315 | Never evaluated (REGISTRY:439 admits it). |
| `filter.targetGroup` | schema.js:1253 | Read nowhere. |
| `filter.verb` on `move` | schema.js:1359 | Ignored (predicate.js:182-194). |
| `markApplied` `filter.source` | — | Only `"self"` works (predicate.js:179). |
| Scoped flag `target:"judgedTarget"` | R:2842 | Always keys to nobody. Nothing in the VTT provides `getMarkedTarget`. |
| Target `count:"all"` / `"each"` | schema.js:975 | Picks one token, then becomes "exactly 1" on the next save (§3, bug 6). |
| `catalog.js` | loaded | Never called. Its own vocabulary disagrees with the schema (catalog.js:60-125). |

### Works, but isn't written down

- Target `wallType` / `wallStamina` (schema.js:1079, used by `wall-break.mjs`).
- Aliases: `blocks`, `limit`/`oncePer`, branch `if`, choice `value`/`then`/`set.keywords`, trigger
  `automatic`/`resolveAutomatically`/`lifetime`, aura `creature`.
- The cost discount on an edge (`hero.resource.discountOnPowerRollEdge`, R:3870): only one mention in REGISTRY.
- `powerRoll.edge`/`bane`/`skill`/`rollEvent`: read by the runner (R:410, R:1420), but the schema drops them as
  extras.
- Persistent zone `onOccupantTurnStart`: not in REGISTRY.

---

## 3. Good, bad, bugs

### Good

- One runner, one format, one set of board actions for heroes and monsters.
- Warnings instead of refusals while pasting. The runner normalizes again on load and on run, so old JSON keeps
  working.
- Board actions are a clean list of named events (`vtt:automation-*`). That is the right seam for a hook system.
- Heroic-resource rules are data, not code: Sharon, Indigo, Zepha and Cal each have their own without a build.
- Forced movement is careful: straight-line pushes, slides along legs, falls, walls breaking by material.
- Captain bonuses are parsed from the captain's own text. Anything not understood is posted to chat as "apply by
  hand", which is the right failure.

### Bad (design)

- **The runner is 4,261 lines** with every effect in one switch, and the board side is spread through a
  27,000-line file. Adding a new effect means touching the schema, the primitives list, the runner, the board, the
  describer and the docs: six places.
- **Two hidden rules decide where an effect lands.** Each effect can have its own `target`, but some wrapper
  effects pass it on and others drop it (bug 11). Auto-resolved triggers ignore it entirely (bug 5).
- **"Never block" is broken in places.** README:7 says the app never blocks, yet the runner refuses and refunds
  when a usage limit is spent, a triggered action is used, or a start-of-turn check is declined (R:4085-4130,
  R:1902). A "not enough" spend silently skips its effects (R:3003-3009). Your rule is guide, warn, ask.
- **Three ways of writing potency.** The Creator shows "Might ≤2", the tray "M<2", the stat block
  "Check: might 2". The engine uses a strict `<` (B:17981).
- **Monster tokens are snapshots.** Editing a monster in the Creator doesn't reach tokens already placed.

### Bugs

Severity: **H** = wrong result at the table, **M** = feature silently does nothing, **L** = cosmetic or docs.

| # | Sev | What | Where | How to see it |
|---|---|---|---|---|
| 1 | H | A hero's triggered action can be used any time. It spends its cost, is marked used, and hits nobody. | `character-summary-panel.js:934` (`manualTriggerResolution` for any Triggers-tab click with no payload); no gate in `renderAbilityItem` (CSP:1347); R:4059, 4102, 4116; empty `eventActor` R:597-604. Monsters confirm (`monster-ability-runner-glue.js:344-346`). | Click any automated triggered action without the "!". The resource drops and the action is marked used. |
| 2 | H | Ability-applied end-of-turn conditions never expire. | B:17918 sets `condition.endsOn`, which nothing reads. `token-conditions.js:30-80, 131-150` keeps only `duration.targetTokenId`. `combat-effects.js:180-206` clears only on that. | Land Cal's Protective Attack (or any `endOfTurn` condition) and end turns: it stays. |
| 3 | H | Damage applied by hand never fires `damage`/`damageDealt`. Triggers and resource rules waiting for it stay silent. | `fireManualStaminaTriggers` B:3446 fires only `staminaChange`. Called from B:19692, 20230, 20609. | Give Zepha or Indigo a "when you take damage" resource rule, then hurt them with the Damage/Heal tool: no offer. |
| 4 | H | Effects nested in a potency result lose every named target group, and a stop inside them doesn't stop the ability. | R:2591, R:2601 run onFail/onResist on `{...state, groups:{_potency}}`. | Any onFail effect that targets a named group (or `ifStrained`/`spend` that falls back to the current group) does nothing. |
| 5 | M | Auto-resolved triggers ignore a per-effect `target`, which is used everywhere else. | B:3411 → `applyOngoingAutomationEffects` B:5101 with one list from `resolveAutoTriggerPlacements` B:3391. The schema warns (schema.js:1528). | An autoResolve trigger whose effect says `"target":"eventSource"` hits the trigger's own target instead. |
| 6 | M | `count:"all"`/`"each"` targets pick one token, and become "exactly 1" after saving. | R:910; schema.js:964-968. | Author a target with count all and select: only one is taken. |
| 7 | M | "First time this round" flags never hold. | The schema defaults `target:"target"` (schema.js:782, 846). `applyEffects` treats that as a group name (R:1753). `scopedFlagKey` returns '' (B:3091). | The AUTHORING:1145 example fires every time. |
| 8 | M | Durations misread on tokens. `endOfEncounter` becomes end of turn (never clears). `instantaneous` and `untilDying` become save ends (raise a save prompt). | `normalizeConditionDurationValue`, `token-conditions.js:279-290`. | Apply an until-dying condition by ability: a save prompt appears at turn end. |
| 9 | M | Monster actions and maneuvers that cost Malice take none. Any number in the cost is read as Malice. Villain actions are charged Malice. | `MALICE_CATEGORIES` and `parseMaliceCost`, glue.js:31-45. Template example `MONSTER_JSON_IMPORT_TEMPLATE.md:156`. | Kragen Thornwhisper's Bone-Salt Jar (2 Malice, an action): no Malice spent. |
| 10 | M | Villain actions have no limits (once each per fight, one per round, in order, at the end of a hero's turn). | Glue only reserves Malice. | Click a villain action twice. |
| 11 | M | Wrapper effects disagree on routing. ifKeyword, ifStrained, spend and ifScopedFlag drop their own `target`; ifPrompt, ifMark, ifDistance and ifZone honour it. | R:2138, 2617, 3039, 2863. | A `spend` effect with `"target":"self"` applies to the card's targets. |
| 12 | M | Aura effects with `target:"target"` find no token and say "apply manually". | R:2942-2953. | An aura effect authored with the default target. |
| 13 | M | The sheet throws away an automation that has only passives (Stand Firm), or uses the `blocks` alias. | `hasAbilityAutomation`, `character_sheet/sheet.js:255-263` (the schema's own check, schema.js:2026, counts passives). | Paste a passives-only automation on a feature and save: it is gone on reload. |
| 14 | M | Trigger `whose:"target"` with no named target never matches. REGISTRY:447 promises a fallback. | R:1614-1625. | — |
| 15 | M | Only the first of several ready triggers sharing an event can be resolved. | `findReadyTriggerBlock` R:3568-3576. | Cal's "My Life for Yours" has four trigger cards. |
| 16 | M | A shift that needs a climb asks the walking question ("Only Y movement left"). | Ability shift → `commitCanonicalTokenMoves({movementKind:'shift'})` B:18878 → walk branch `askClimb` B:1554-1566. `climbPromptText` (`climb-prompt.js:12-17`) knows no movement kind. Low barriers the same (B:1581). | An ability's shift up a ledge. |
| 17 | M | Monster `spend` effects only pretend. They confirm and post "spent N" but change nothing. | The glue has no `spendHeroicResource`; R:3017-3039. | — |
| 18 | M | Feature modifiers miss damage nested in `ifStrained`, aura effects, requested-test tiers and winded tiers. | `walkEffectList` R:3914-3944; `effectListContainsKind` R:660. | A kit damage bonus doesn't apply to a requested-test tier's damage. |
| 19 | M | `autoResolve` checks `amountFrom` sources that can't exist. The normalizer has already turned them into `triggeringDamage`. | schema.js:1533 vs schema.js:286-291. | — |
| 20 | L | "Then: 0 psychic damage + triggering movement". | `describeEffect` uses `effect.amount \|\| 0`, ignoring `amountDice`/`amountFrom` (primitives.js:415-424). `describeTriggerValue` calls every source "triggering damage" (primitives.js:398). | Cal's Thorn In Foot. |
| 21 | L | Aura-only abilities say nothing in chat when cast. | `applyAuraEffect` R:2939-2989 posts only on failure; `handleAutomationSetAuraRequest` B:5495-5561 is silent. | Cast an aura ability. |
| 22 | L | Damage-type questions are asked for branches that may never run. | R:3836-3843. | — |
| 23 | L | Normalizing an area card twice resets its distance to "ranged" (with a warning). | schema.js:1044, 986-989. | — |
| 24 | L | Data, not code: **Morelia**'s extra heal is a fixed 3 rather than Presence. **Kragen** (the older entry) has conditions typed into the damage type ("10 grabbed damage") and no automation. (Corrected: Cal's Purifying Fire is right. Its JSON has the book's 5/9/12 + Might, and his Shining Armor kit feature adds +2 to Melee + Weapon abilities, giving the 7/11/14 + Might on his card. The first draft compared the JSON with the card without folding in the kit.) | live `character_sheets.json` (cal) and `gm-monsters.json` | — |
| 25 | L | Docs out of date: AUTHORING says there is no auto-detection for monster triggered actions (there is); README's runtime flow leaves out requestedTest; mojibake in one chat line (R:2515). | — | — |

### Kit bonuses in melee and at range

A kit's melee damage bonus should apply when an ability is used in melee, and a ranged bonus only at range. How it
works today: feature modifiers are matched once, when the ability starts, against the ability's keywords
(`collectMatchingModifiers`, runner.js:3690, called at runner.js:4096). A leading `choice` card's option can set its
own keywords first (`setSelectedChoice`, runner.js:3500-3507).

- **Already right when the ability has a melee/ranged choice.** Cal's Purifying Fire ("Melee 1 or Ranged 5") opens
  with a choice. The melee option's keywords are Magic, Melee, Strike, Weapon; the ranged option's are Magic,
  Ranged, Strike, Weapon. The Shining Armor modifier asks for Melee + Weapon, so the +2 applies only when he picks
  melee. Nothing to build for abilities written this way.
- **Wrong when one keyword list carries both** (Melee and Ranged with no choice): the melee bonus is added at range
  too. Two fixes:
  - **No build:** give such abilities a melee/ranged choice card, as Purifying Fire has.
  - **One small build:** a modifier field `match.reach: "melee" | "ranged"`, checked per target when the damage is
    dealt (distance from the caster to that target against the ability's melee distance), not once at the start.
    The bonus would be kept beside the damage instead of folded into the amount when the ability opens. About a
    day's work. It touches the schema (one field), the runner's damage step and the board's distance callback
    (which exists), and needs a test per case. It changes nothing for kits without `reach`.

### The sheet's Kit box

The Kit box on the sheet (`hero.kit`: name, weapon, armor, speed, disengage, stamina, stability, melee and ranged
distance and damage) is read only by:
- the sheet itself (shown and edited, `sheet.js:1235-1421`);
- **Export Character Sheet** (copied into the export, `sheet.js:4406`);
- the print sheet (shown, `sheet.js:4749`).

**No automation, VTT or monster code reads it.** Damage bonuses, stamina and stability on the board come from the
kit's **feature card** (its automation modifiers) and the sheet's own vitals, not from the Kit box. The box being
blank for all five heroes since October 7 changes nothing at the table. Fill it only if you want it on the print
sheet.

Already fixed: **pushes offered as a fan** (`forced-move-cells.js:79-88` trims the squares to the straight line,
October 12). One leftover: when pusher and target share a centre, the full fan still comes back (line 81).

---

## 4. Players and monsters

### Where they split

| | Heroes | Monsters |
|---|---|---|
| Starts the run | `character-summary-panel.js` `startAbilityAutomation` (CSP:2691-2850) | `monster-ability-tray.js` → `monster-ability-runner-glue.js` (glue:169-287) |
| Engine | `AbilityAutomationRunner.open` | the same |
| Display data | `tags[]`, `cost`, `target`, `tests[].tiers.low/mid/high.{damage:"5 + M", …}` | `keywords` string, `resource_cost`, `targets`, `test.tier1-3.{damage_amount, …}` |
| Roll bonus | attribute (`"attribute":"Might"`) | `flatBonus` |
| Potency | by level (weak/average/strong) | literal `threshold` also allowed |
| Resource | heroic resource spend and gain, surges | Malice reserve and refund; no spend effects, no surges |
| Extras only heroes have | kit and feature modifiers, skill bonuses, formula damage, the paste field-map | — |
| Extras only monsters have | — | confirm before a triggered action, captain bonuses, Malice |
| Live updates | the sheet is read when the ability is used | a snapshot copied onto the token at placement |

### Recommendation

- **Keep the one engine.**
- **Don't merge the two data files** (the sheets and `gm-monsters.json`). Their display shapes serve different
  pages, and changing them puts 205 automated monster abilities and every hero sheet at risk for no gain.
- **Add one "actor" adapter** that both sides fill in: stats, roll bonus, potency, resource
  (spend/gain/refund/discount), surges, feature modifiers, confirm-before-trigger, live data source. The hero panel
  and the monster glue would each build an adapter, and the runner would call only that.

**What it gives:**
- heroes get the confirm step (bug 1);
- monsters get real `spend` effects through Malice (bug 17) and surges;
- one place to add the next shared rule.

**What could break:** the runner's calls into the two contexts. A test suite that runs each existing hero JSON and
a sample of monster JSON through the adapter, before and after, catches any change. **What carries over:**
everything already pasted or imported. The automation JSON itself doesn't change, and nobody re-pastes anything.

Placed monster tokens should also read the monster's current abilities when the Director clicks them, falling back
to the snapshot if the monster has since been deleted. Then Creator edits reach the board.

---

## 5. The design Brandon is after: hooks, labels, conditions, awareness

The current format already has most of the pieces: events (hooks), keywords and marks (labels), conditions, and
filters and branches (awareness). They're named inconsistently, spread across six files, and some are only half
there. The proposal is to name them as four small lists, put each list in one module, and let any ability's JSON
call them.

### Hooks: events the board announces

| Hook | Exists today? | Payload |
|---|---|---|
| `turnStart` / `turnEnd` / `roundStart` / `roundEnd` / `combatStart` / `combatEnd` | yes | whose turn |
| `move` (walk, shift, fly, climb, teleport; with `kind`) | partly (no fly/teleport kind) | mover, from, to, distance, kind |
| `forcedMove` (push/pull/slide; vertical) | yes as `forcedMovement` | mover, source, distance, verb |
| `fall` | **no** | creature, squares fallen, landed on |
| `targeted` (chosen as a target, before the roll) | **no** | source, target, ability |
| `damaged` / `dealtDamage` (any source, hand-applied too) | automated only | target, source, amount, type, keywords |
| `staminaChange`, `winded`, `dying`, `dead` | change/zero only | before, after |
| `conditionGained` / `conditionLost` (grabbed, prone…) | **no** | creature, condition, source |
| `saveMade` / `saveFailed` | **no** | creature, condition |
| `enters` / `leaves` (aura, zone, square label) | zones on enter only | creature, area |
| `rolled` (power roll, test; tier) | yes | roller, tier, total |
| `abilityUsed` (with cost and keywords) | yes as `actionUsed` | user, ability |
| `resourceSpent` / `resourceGained` (heroic resource, Malice, surges) | **no** | who, kind, amount |

### Labels: tags any ability can read or set

- **On creatures:** team (hero/ally/enemy), role, organization (minion/captain/leader/solo), size, keywords
  ("undead", "construct"), marks (judged, taunted by), and scoped flags ("struck this round").
- **On squares:** difficult, hazard, high ground, cover, a zone or aura covering it, floor or level, and a map
  label set by the Director ("blood", "basin").
- **On abilities:** keywords (Melee, Ranged, Magic, Strike…), category (main, maneuver, triggered, free strike,
  villain), cost.

One storage idea covers all three: a label is a short name plus an optional value, kept on the creature, the square
or the ability. Today these are four separate mechanisms (keywords, marks, scoped flags, zone types).

### Conditions

Keep the 13 Draw Steel conditions plus the typed ones (weakness, immunity). Fix the durations first (bugs 2 and 8).
Duration should name **whose** turn ends it: `endOfTurn` of the target (the Draw Steel default), of the source, or
of the current turn.

### Awareness: questions an ability can ask about the board

| Question | Today |
|---|---|
| distance between two creatures (with height; Draw Steel's larger of across and up) | `ifDistance` (flat only) |
| adjacent to, flanked, surrounded (count of enemies adjacent) | adjacency only in move filters |
| in an aura or zone (whose, which) | `ifZone` |
| on high ground / higher than | **no** (the measure tool's height math exists now) |
| line of effect to | accepted, never checked |
| winded, dying, has condition X, has label X, is marked by me | `ifStrained`, `ifMark`, partly |
| which floor / same floor | **no** |
| has acted this turn / first time this round | `casterHasNotActed`; scoped flags (broken, bug 7) |
| how much damage / distance triggered this | `amountFrom` (two sources) |

Every question returns yes/no or a number, so it can drive a `branch` card or a trigger filter.

### Four real abilities rewritten in it (sketches, not final JSON)

**Cal: Judgment, Wrath: Stop Shift** (today a trigger whose only effect is a note):
```json
{ "on": { "hook": "move", "kind": "shift", "who": { "label": "judgedBy:self" }, "leaves": "adjacentTo:self" },
  "cost": { "resource": "wrath", "amount": 1 },
  "ask": "Spend 1 Wrath to stop the shift?",
  "do": [ { "freeStrike": { "target": "eventActor", "range": "melee" } },
          { "setSpeed": { "target": "eventActor", "value": 0, "until": "endOfTurn:current" } } ] }
```
New pieces: `setSpeed`, and `kind` on the move hook. Everything else exists today under other names.

**Kragen Thornwhisper: Bone-Salt Jar** (2 Malice, action, 3 cube within 5):
```json
{ "cost": { "resource": "malice", "amount": 2 },
  "target": { "area": "cube", "size": 3, "within": 5 },
  "test": { "attribute": "Might", "tiers": {
    "low":  [ { "condition": "weakened", "duration": "saveEnds" } ],
    "mid":  [ { "condition": "weakened", "duration": "endOfTurn:target" } ],
    "high": [] } } }
```
This works today except that the Malice isn't taken (bug 9) and end of turn never clears (bug 2).

**Kragen Thornwhisper: The Blood Answers** (villain action 1, 10 burst, enemies in or adjacent to blood):
```json
{ "villain": { "order": 1 },
  "target": { "area": "burst", "size": 10, "who": "enemy",
              "where": { "any": [ { "squareLabel": "blood" }, { "adjacentToSquareLabel": "blood" } ] } },
  "do": [ { "forcedMove": { "verb": "slide", "distance": 2, "toward": { "squareLabel": "basin" } } },
          { "note": "A Drowner rises from the nearest basin (place it by hand)." } ] }
```
New pieces:
- square labels set by the Director on the map ("blood", "basin")
- `toward` for forced movement
- villain-action order and limits

The spawn stays a note: summoning is a table call.

**Cal: Morelia Punish and Defend** (strike, then may spend a Recovery to heal self or an ally within 10):
```json
{ "cost": { "resource": "wrath", "amount": 3 },
  "target": { "creature": 1, "range": "melee 1" },
  "roll": { "attribute": "Might", "tiers": { "low": [{"damage": "5+M holy"}], "mid": [{"damage": "8+M holy"}], "high": [{"damage": "11+M holy"}] } },
  "then": [ { "ask": "Spend a Recovery?",
              "do": [ { "pick": { "who": "selfOrAlly", "within": 10 } },
                      { "heal": { "recoveries": 1, "from": "self", "plus": "P" } } ] } ] }
```
This works today, except the "+3" should read Presence (`"plus":"P"`), so it follows the sheet.

### What it still couldn't express (and shouldn't try to)

- **Story and table calls:** objectives, NPC choices, summons and where they appear, "the basin opens", any
  "Director decides". These stay as notes, as in the run sheets' "by hand" lists.
- **Ongoing rules that rewrite other rules** ("your allies' abilities gain…", "enemies can't benefit from cover"):
  these need a modifier on someone else's rolls. Possible later as labels with `modifies`, but rare, and best left
  as a note until it comes up twice.
- **Choices that depend on reading the room:** "the creature that most recently harmed an ally", "the most
  dangerous target". Keep these as an `ask` with a picker.
- **Exact timing races** (two triggers on one event, who goes first): the app should list them and let the table
  pick, not decide.
- **Anything map-specific:** a hazard unique to one map belongs in that map's square labels, never in code. The
  Gravity Orchard stays frozen. Its zones keep working as they are, and none of the stages below change how they
  play.

---

## 6. Staged plan

Each stage is a small build that is safe on its own, changes no saved data, and keeps everything already pasted or
imported working.

| Stage | What | The tester checks |
|---|---|---|
| **1. Silent-wrong fixes** (most value for least) | Confirm before a hero's triggered action isn't ready (bug 1). End-of-turn conditions from abilities end on the target's turn (bug 2). Hand-applied damage fires `damaged` (bug 3). | Click a not-ready triggered action: you're asked, and nothing is spent if you decline. Protective Attack's condition clears at the end of the target's next turn. The Damage/Heal tool triggers a "take damage" resource offer. |
| 2. Silent-nothing fixes | Potency results keep their targets (4). Scoped flags key correctly (7). count all/each (6). Duration mapping (8). Passives-only automations kept (13). Several ready triggers on one event (15). Auto-resolve honours per-effect targets (5). The paste box warns about accepted-but-dead fields. | A JSON test file per fix. Cal's My Life for Yours resolves each trigger. The "first time this round" example fires once. |
| 3. Monster rules | Malice taken for any category whose cost says Malice; "stamina" costs not read as Malice; villain actions free of Malice, once each, one per round, in order (with a warning, not a block). Placed tokens read current monster abilities. | Bone-Salt Jar takes 2 Malice. Kragen's "30 stamina" takes none. A second villain action in a round warns. A Creator edit shows on an already-placed token. |
| 4. One actor adapter | Hero and monster contexts become one adapter. Monsters gain real spends and surges; heroes keep everything. | Every hero JSON and a sample of monster JSON give the same rolls and effects before and after (an automated comparison). |
| 5. New hooks | `fall`, `targeted`, `conditionGained/Lost`, `saveMade/Failed`, `enters/leaves` aura, `winded`, `resourceSpent`. Emitted from the existing code paths; nothing listens until an ability asks. | A test ability per hook posts to chat when it fires. Nothing else changes. |
| 6. Labels | One label store on creatures, squares and abilities. Director square labels on the map ("blood", "basin"). Keywords, marks and flags readable through it (the old names keep working). | Label a square, then an ability that asks "on a labelled square" picks the right targets. |
| 7. Awareness | Distance with height (from the measure tool), flanked or surrounded, high ground, same floor, line of effect. Each as a branch condition and a trigger filter. | One test ability per question, on a test map, never on a map in play. |
| 8. Tidy | Split `runner.js` by effect family. Fix the chat describers (20, 21). Make "never block" true: replace refusals with warnings plus "use anyway". Bring docs up to date. | The full suite passes. Chat lines read right. A spent usage limit warns and lets you go on. |

**The most for the least:** stage 1. Three short fixes, each testable at the table, removing the errors that cost
resources or leave conditions stuck without anyone noticing. Stage 3 comes next for the Director, since Malice and
villain actions come up in every boss fight.

Stages 5–7 are where the hook/label/awareness system grows. They only add things, so nothing already written needs
to change, and each new word becomes available to every hero and monster at once.
