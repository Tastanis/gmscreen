# Automation Hooks Reference

The canonical hook registry is `../../character_sheet/ability-automation/REGISTRY.md`. This file maps the registry to the code that implements the hooks.

## Main Flow

1. Ability JSON is normalized by `../../character_sheet/ability-automation/schema.js`.
2. The runner in `../../character_sheet/ability-automation/runner.js` walks `automation.cards`.
3. PC abilities get VTT callbacks through `../../vtt/assets/js/ui/character-summary-panel.js`.
4. Monster abilities get the same board callbacks through `../../vtt/assets/js/ui/monster-ability-runner-glue.js`.
5. Board-side CustomEvents are handled in `../../vtt/assets/js/ui/board-interactions.js`.

## Board Callback Surface

`window.VTTBoardCallbacks` is exported from `board-interactions.js` and includes target selection, area selection, damage, healing, PC recovery spending, conditions, potency checks, forced movement, teleport, swap, free strikes, persistent zones, token auras, marks, trigger events, scoped flags, floating combat text, automation-driven turn starts, board-state power-roll suggestions, and hidden roll-rider consumption through `consumeRollRiders`.

`showFloatingText` drives the giant centered VTT banner. `audience:"all"` syncs the banner through combat turn effects; `audience:"self"` stays in the current browser. `startTurn` requests a combat turn start and supports a preflight mode. For Hesitation Is Weakness, either team's open pick phase is valid; an active combatant blocks the ability before resource spending and tells the player to wait. A successful Hesitation start records the special centered banner as a shared combat effect so every connected client displays it. Other confirmed player overrides can force-start allied combatants; enemy starts remain GM-only. The PC runner's `getSurges` context hook refreshes the live sheet value before rendering a power-roll surge control.

Board damage and healing callbacks may return exact stamina values to the local runner, but player-facing status text must not display current/maximum stamina for placements whose canonical combat team is `enemy`. The GM and allied placements retain exact totals. This is presentation privacy, not an automation JSON field.

Token stamina floats are transient synced combat effects. The initiating client displays the float immediately, then shares the same stable effect ID with other clients. The final renderer rejects a second delivery of that ID while allowing separate effects with the same amount, so multi-hit abilities are not collapsed.

`setAura` can be visual-only or carry automation metadata from an `aura` effect. Automated token auras store `affects`, `triggers`, `effects`, and optional `expires` on the placement. Multiple automated auras can coexist on one token, keyed by source/ability and toggled separately from token right-click settings. They move with the owner token and check live occupants when timing triggers fire, when an occupant starts their turn, when a token enters the aura, or when an event-bus trigger such as `actionUsed` fires.

Check `REGISTRY.md` before authoring against a hook. If it is not listed there, treat it as unsupported.

## Trigger Bus

`window.AbilityTriggerBus` lives in `board-interactions.js`. Authored trigger blocks use `match.event` and `match.filter`; PC trigger actions in the active scene are registered by the board as passive listeners. The runner's `registerTrigger` context hook still exists as a fallback/debug path. PC triggered actions are always-on once the character token is present in the active VTT scene; the player does not click the ability or open the character summary to start listening. Triggered abilities light the ready marker and are resolved manually unless the trigger block has `autoResolve:true`, in which case the trigger block's own `effects` run immediately. The triggered-action tray dot is also a manual override: clicking a spent/red dot makes the token ready again and clears the round-used flag so non-free authored triggers can arm before the round resets.

## VTT Automation Prompt UI

PC heroic-resource spends use draggable in-app VTT modals, not native browser `prompt`/`confirm` dialogs. Variable spends (`maxAmount`) show stepper buttons. Free-strike target selection uses the board picker plus a small draggable target prompt; right-click map panning remains available because these dialogs do not use a blocking backdrop.

Target-selection prompts can be customized from ability JSON with `promptTitle` and `promptText` on a `target` card. The runner also supplies a generic damage prompt when a target card is immediately followed by damage against that same target group. Token target cards with custom or inferred prompt text use the board picker as the single visible prompt, including `Skip` for optional target cards.

Recovery-style heals (`{ "kind": "heal", "recoveries": N }`) call `spendRecoveryForTarget`, which acts on the **target's** sheet: for a matched PC target it decrements `hero.vitals.currentRecoveries` before applying stamina healing. This works regardless of whether the caster is a PC or a monster, so a monster ability can heal or drain a PC target's recoveries. Targets with no recovery pool (e.g. another monster) skip or fall back to a chat reminder.

Known current limitation: manual/non-automation damage does not fire typed `damage`/`damageDealt` trigger payloads, but manual VTT damage, token HP edits, and character-sheet stamina syncs do fire `staminaChange` and `staminaZero`. Use the registry for the latest limitation list.

## Monster-Specific Runtime Notes

The full monster authoring reference is `monster-automation.md` (this folder). Monster ability execution is bridged by `monster-ability-runner-glue.js`.

- Villain and malice categories spend from `window.MaliceTracker`.
- Monster trigger blocks with a structured `match` are auto-armed on the bus whenever the placement is in the active scene (`registerMonsterAuthoredTriggersForPlacement` in `board-interactions.js`). Player clients arm them too via the stripped `monsterTriggerHooks` placement field, so events caused by a player's own client still mark enemy triggers ready.
- Firing a triggered action from the tray prompts for confirmation, then resolves: a ready trigger passes the captured event payload; a manual fire sets `manualTriggerResolution` so the trigger card's effects execute instead of arm-only. Non-free triggered actions consume the round's triggered action via `consumeTriggeredAction` (a `resource_cost` containing "free" is exempt).
- Monsters should use `flatBonus`; attribute lookup exists as a fallback.
- Monster heroic `spend` falls back to a native `confirm()` dialog (the monster context omits `spendHeroicResource`); `resourceGain` and `surgeGain` post manual chat reminders (`applyResourceGain` / `applySurgeGain` are not passed). Recovery heals are NOT monster-blocked — `spendRecoveryForTarget` is wired and acts on the target's sheet.
- `showFloatingText` and `startTurn` are passed through to monsters like PCs.
- Winded state is based on token HP at or below half max HP.

Zone-entry correlation: locally acknowledged normal `vtt:token-moved` hooks include
movementOperationId and movementRevision. Server movement receipts are built by
`../../vtt/lib/ZoneEntryReceipt.php` and stripped from player event projection.
Canonical entry reservations are available through api/v2/zone-entries.php.
Normal walking entries now reserve before applying supported damage/condition effects,
then acknowledge completion. Condition callbacks await canonical persistence, just
as damage callbacks do. Failed or uncertain effects leave a GM recovery record;
completed or reviewed entries cannot receive a second execution grant after reload.
Unsupported zone effects require manual review. Forced movement, teleport and swap entries use accepted operation IDs and durable claims. No authored JSON fields changed.
Walking claims bypass the legacy local round cache; server boundaries decide.
Granted effects on the same creature execute sequentially per client, preventing
overlapping zones from racing their own placement saves.
Claimed zone effects validate the latest received zone record before dispatch.
Ended or materially changed zones leave review status instead of executing stale
queued effects. Already dispatched callbacks cannot be cancelled by this check.

`vtt:automation-apply-swap` exchanges both tokens' columns, rows and floors in one
forced placement batch. It requires actual scene placements and awaits acceptance
before reporting success or checking zone entry. Save failure rejects the callback
(or resolves skipped/save-failed when no reject callback exists). Normal walking
hooks do not fire. Forced/swap zone claims use the same durable authority.

Teleport/swap check zone entry at the destination; forced movement checks its path.
Claimed zone damage waits for queued character stamina synchronization. Rejected
sheet updates leave needs_review even if board damage was accepted.

Forced-move, teleport and swap callbacks now wait for their zone-entry outcomes.
Unresolved entries reject instead of reporting success to a later ability step;
the movement itself remains accepted. Swaps wait for both tokens' entry checks.

Character-stamina writes require an explicit success acknowledgment and have a
15-second deadline covering HTTP and JSON-body completion. Timeout aborts the
request and rejects confirmation without retrying an uncertain write. Claimed zone
effects therefore enter GM review instead of holding movement callbacks forever.
This does not make board/sheet writes atomic or prove that an aborted server write
did not commit; inspect both values before resolving an uncertain outcome.

Zone claim outcome acknowledgments now retain reporting actor, server timestamp
and a bounded reason in private ledger evidence. The client sends up to 500
characters; the server validates string type and a 2000-byte maximum. The first
acknowledgment survives idempotent retries; original movement/effect evidence and
terminal-outcome restrictions remain intact. Recovery renders the report as text
and identifies its author, with a missing-details fallback for older/pending rows.
These are client reports, not server proof of which effects committed.

Persistent-zone registration reports registered: true only after its placement
save is acknowledged. Rejection calls the supplied reject callback, or returns
registered: false with save-unconfirmed for resolve-only callers. Sequential
registrations therefore read the previously accepted zone list instead of racing
optimistic arrays. Concurrent callers still use normal revision conflict handling;
there is no blind retry or alternate shared-state writer.

All zones for one caster expiring at the same boundary are removed with one
combined placement patch, preserving nonmatching zones. Manual single-zone End
uses the same helper. Local zone bookkeeping is cleared only after accepted
persistence. Turn-start processing can produce one confirmed revision conflict
(HTTP 409), followed by the existing one-time retry (HTTP 200). The expiration
browser test verifies exactly one accepted write, not merely request count.
Tick/expiration ordering and interrupted boundary recovery remain separate work.

Placement-batch conflict retries compare each edited field with its pre-submit
confirmed value. Retry is allowed only if the conflict snapshot retains that
value or already contains the desired value. Same-field concurrent changes reject
after applying the authoritative snapshot, preserving the other edit. Adds retry
only when the ID remains absent; removals require an unchanged entity revision.
The existing one-retry limit remains. This guard covers placement batches; walking
movement and other domain command policies remain separate.

Canonical turn zone processing is ordered: at start, await owner expiration,
then owner ticks, then occupant triggers; at end, await owner ticks before
expiration. Failed expiration or a scene change stops subsequent zone stages and
reports that review is needed. This ordering does not serialize all other turn
automation, add durable boundary-effect outcomes, or change legacy tick handlers
that currently tolerate individual effect failures. Those remain limitations.

Canonical owner ticks and occupant-turn-start effects now use strict effect
acknowledgments, active-zone checks and confirmed character-stamina synchronization.
Failures propagate to the ordered boundary stages instead of being swallowed. A
failed final tick prevents expiration and leaves the zone for review; failed
removal after unpaid upkeep also stops subsequent work. Already committed effects
are retained. Review is currently a status message: durable boundary-effect
recovery records and transactional upkeep still remain to implement.

Zone upkeep now calls sync-resource with spend and optional resourceName using
the linked character profile. Under the existing character-sheet write lock, the
server validates a positive integer cost (maximum 1000000), checks the current
resource name/balance and deducts only that field. Confirmed insufficient funds
return paid: false without writing; malformed/mismatched requests or failed saves
reject. The client requires an explicit paid result, bounds HTTP/body waiting to
15 seconds and never retries uncertain payment. Missing linked resources require
manual review; they no longer grant free upkeep. Failed payment preserves the
zone and stops its effects; only confirmed insufficient funds trigger removal.

Heroic-resource rule saves now use narrow sync-resource writes for GM, owner and
other authorized VTT users. Rule writes include expectedValue; under the existing
write lock the server rejects a stale balance before mutation. Successful resource
saves alone mark applied resource-rule limits and announce success. Failed saves
invalidate the cached sheet and ask for review. Resource-only refund routing also
uses the narrow endpoint, though its separate read/modify/refund lifecycle still
needs stronger concurrency and interruption guarantees. Recovery full-sheet saves
and damage-rule limit behavior are unchanged by this milestone.

Ordinary heroic-resource rule writes and zone upkeep share confirmResourceWrite.
Its 15-second deadline includes body parsing, aborts stalled requests and rejects
without retry; only explicit successful acknowledgments allow cache/broadcast
updates. Resource rules report an unconfirmed save and do not mark applied limits
after timeout. Abort does not establish whether a server write committed, so
manual review remains necessary; durable operation receipts are still pending.

The automation recovery-spend hook uses sync-vitals with spendRecoveries. Under
the existing sheet write lock, the server validates a positive integer cost up
to 1000, checks the current count and subtracts only recoveries. It returns spent: 0
for confirmed insufficiency, preserving stamina and resources. The client waits
for a bounded acknowledgment, invalidates its cached sheet and rejects uncertain
saves without retrying. Recovery-value calculation remains the existing client
logic; spending and the subsequent healing action are not one transaction.

Automation sheet lookup, PC classification, character-card context and surge gain
now use getCharacterSheetProfileIdForPlacement. A valid saved profile takes
precedence over the token display name; the existing name-alias fallback remains
for older unlinked tokens. Renaming a linked token cannot redirect these paths to
another character with the same display name. This does not change roster
permissions or infer a new owner from the name.

Surge-gain automation now requires explicit success and an integer saved surge
count. Rejected, malformed or timed-out responses call reject (or return an
unconfirmed skipped result for resolve-only callers), never grant success or
automatically repeat a delta. Surge, recovery-spend and resource-write adapters
share confirmCharacterWrite for a 15-second HTTP/body deadline and no retry.
An aborted request may have committed. Surge gains now persist operation receipts; other character write receipts and recovery UI remain pending.

Surge-gain writes carry a transport operationId (not an ability JSON field).
The handler stores the surge result and receipt in one atomic character-file save.
Reusing that ID with the same actor, character and normalized input returns the
original saved result with replayed=true; the result is historical, not a claim
about the current count after later edits. A different request using the same ID
is rejected. confirmCharacterWrite verifies the returned ID and includes it on
errors, without automatic replay. No ability authoring fields or hooks changed.

Recovery-spend and heroic-resource adapters now carry operation IDs too. The
handler records successful and insufficient spends, as well as state-dependent
resource rejections, atomically with any changed character data. Replaying an ID
returns its original outcome without applying it against a later balance. This
is transport behavior, not a new ability JSON field. The adapters still require
explicit acknowledgement and do not automatically replay interrupted actions;
healing and subsequent zone effects are not part of the character transaction.

Receipt-backed character writes now retain unconfirmed attempts in a per-user,
per-operation browser journal. Action review checks GET operation-status without
replay and can remove a local reminder. Receipt lookup is actor/GM scoped and
never initializes missing storage. A recorded payment does not prove later
healing or zone steps completed; the panel explicitly preserves that boundary.
Confirmed writes leave the journal, so multi-step interruption after confirmation
still needs a separate action lifecycle. No ability JSON fields changed.

A late acknowledgement after the confirmation deadline does not remove its
interrupted-action reminder; the caller already failed and later ability steps
may not have run. Use read-only receipt review to reconcile that outcome.


### Height-aware aura reach and adjacency

canReachFloor combines vertical range with a symmetric exact opening check through
all intervening blocking floors, within the lower creature's occupied footprint.
It must be paired with horizontal footprint/radius checks. Automation aura membership
uses it; player aura painting also rejects floors beyond its radius and removes old
nodes when range changes. GM overview is retained. Roll-suggestion adjacency uses
the same height/opening check; flanking retains planar opposite-side checks.

This is vertical opening reach, not a general wall or diagonal-ray line-of-effect
solver. Existing hidden/opacity/map-image floor blocking semantics are retained.
No new automation JSON fields or trigger payloads. Full suite passed 769 tests;
a real-DOM local browser renderer check passed radius cutoff/reach/stale cleanup
and GM overview. Full gameplay aura-trigger journey, remaining range consumers,
edge/bane auto-selection UI, and remaining goal scope still require work.
