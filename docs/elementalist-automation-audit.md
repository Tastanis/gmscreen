# Which Elementalist abilities need VTT code?

## Implemented on the review branch

Modules 1, 2, 3 and 6 now have shared runtime hooks and ten opt-in Elementalist recipes. They cover action values, target eligibility and origins, power rolls with a tier per target, and maintenance of individual casts. The example pack supplies the ten cards listed in the milestone table below. Against the original 56-card audit, that brings 18 cards within JSON coverage, with one Director-resolved card and 37 cards still requiring further runtime work. [Recipes](../dnd/ai-reference/vtt-json/elementalist-shared-hooks.json) · [Authoring guide](../dnd/character_sheet/ability-automation/AUTHORING.md#values-targets-rolls-and-maintained-casts)

## Original audit and implementation plan

**56 class action cards, levels 1–10, across all four specializations.** This audit asks whether a single reusable JSON definition can execute the printed ability on the current 3D VTT. It assumes the definition is supplied. The audited runtime is the local `refactor/table-3d-only` branch at `21b63af9`.

| Verdict | Count | What to do |
|---|---:|---|
| JSON-ready | 8 | Author the card using the existing runner and board hooks. |
| Shared code gap | 10 | The main action or a common case already works. Fix the named shared limitation to cover the full rule across builds and callers. |
| Missing effect support | 37 | At least one printed effect lacks an execution path. Each row names what already works and the smallest reusable extension needed. |
| Director-resolved | 1 | Target selection and a Director prompt are sufficient for the ability’s narrative result. |

**47 of the 56 abilities need runtime work for a reusable, rules-complete card.** This is a count of affected abilities. A single change to multi-target rolls, for example, benefits several cards. Hurl Element itself already runs from JSON, including as a free-strike tray entry. Its outstanding gap is specific to a different ability *granting* a generic free strike. Grasp of Beyond and Ward of Nature’s Affection already work on a fixed sheet if its current Reason is written into the JSON. Their shared gap is reading a changing stat automatically.

A player choosing a legal target, a damage type, a destination, or whether to spend a resource is normal automated play. Existing board warnings and Director overrides are compatible with a JSON-ready rating. A chat line asking someone to hand-edit terrain, resolve damage a second time, or remember a continuing bonus does not execute that mechanic. The class-wide out-of-combat Essence rules and class features are treated separately from individual card execution.

## Shared changes needed for the 56 class cards

**Plan for 21 reusable runtime changes in six groups.** Eight cards already have the necessary JSON execution paths, and Remember Growth and Sun and Rain uses the existing Director prompt. The other 47 cards have at least one missing capability. Fourteen could be completed with one shared change. The other 33 need a combination. A change here means one behavior that JSON authors can call and that we can test independently. A change can span the runner, board UI, persistence and multiplayer sync.

### Which changes to build first

**Start with values from the current action (1), target and origin selection (2), power rolls across targets (3), and maintaining a particular cast (6).** Together they contribute to 35 of the 47 blocked cards and supply every missing capability for 10. Once those ten recipes are authored and tested, 18 of the 56 class cards would be JSON-ready, with one further card handled by its Director prompt. Of all four-change combinations in the matrix below, ten is the most cards completed. This combination reaches the most cards among those tied at ten. This comparison weights each change equally. Maintenance is a larger implementation than exposing numeric values.

| Milestone | Cards that could be completed with JSON at this point |
|---|---|
| Power rolls across targets (3) | Bifurcated Incineration, Behold the Mystery, Conflagration |
| Add values (1) and target/origin selection (2) | Add Ward of Nature’s Affection, Grasp of Beyond, Practical Magic, Earth Rejects You and Translated Through Flame. **8 total.** |
| Add cast maintenance (6) | Add The Flesh, a Crucible and Web of All That’s Come Before. **10 total.** |

Two cards illustrate the boundary. **Bifurcated Incineration** needs one roll that can produce a different tier for each target. Its fire damage already works. **Storm of Sands** uses that same roll but also needs to remember the cast, move its area, price movement differently for enemies and grant concealment to allies. Completing the roll change finishes the first card and advances the second. [Multi-target roll rule](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-05-classes.md#L602) · [Storm of Sands](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L959)

### Shared changes and the cards that call them

Each count is the number of unique class cards using that change. Names in **bold** could be finished after that change alone. The link on each ability in the later readiness tables leads to its printed rule. The numbers below identify planning items. JSON should refer to named operations and facts. Hit and movement reactions can share how a pending choice is opened, accepted and committed, while each resolver owns its rules for damage or movement. Ongoing effects, maintained casts and temporary Stamina can share source and instance IDs. Avoid testing the display name of an ability in a handler.

#### Values, targeting and rolls

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 1. Values from the current action | Read a named stat, Victories, an effective ability range or a captured result in a numeric field. Support bounds and simple arithmetic. Teleport distance and trigger radius are the first consumers. | 10 · **Ward of Nature's Affection** · **Grasp of Beyond** · Practical Magic · The Mountain Does Not Move · Subtle Relocation · Magma Titan · Ripples in the Earth · Wall of Fire · Meteor · Shared Void Sense |
| 2. Target and origin selection | Bind caster, recipient, trigger subject and destination independently. Combine allegiance, creature/object, size, status and role predicates, cap a selection from the roll, and ask the proper chooser. | 9 · Earth Rejects You · Practical Magic · Breath of Dawn Remembered · Erase · Translated Through Flame · Meteor · Return to Oblivion · World Torn Asunder · Shared Void Sense |
| 3. Power rolls across targets | Default to one accepted roll with target-specific modifiers and tiers. Allow an explicitly separate roll per creature, suppression of maneuver criticals, and one per-roll consequence alongside per-target consequences. | 16 · **Bifurcated Incineration** · **Behold the Mystery** · The Flesh, a Crucible · **Conflagration** · Test of Rain · Web of All That's Come Before · Earth Rejects You · Swarm of Spirits · Muse of Fire · Unquiet Ground · Ripples in the Earth · Instantaneous Excavation · Translated Through Flame · Maw of Earth · Storm of Sands · World Torn Asunder |

#### Ongoing effects and their sources

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 4. Ending a qualifying effect | Let the affected recipient optionally end one eligible effect, including a visible benefit stored as a rider. Match save and end-of-turn durations against the correct turn owner. | 3 · **Afflict a Bountiful Decay** · Test of Rain · Heart of the Wode |
| 5. Effects that listen for later events | Attach an effect to a source and recipient or object. Advance, consume, transfer or remove it on a specified event. A main-action removal, a save, death or a turn boundary can each end the right instance. | 7 · **Invigorating Growth** · Erase · **Combustion Deferred** · Earth Accepts Me · Heart of the Wode · There is No Space Between · Summon Source of Earth |
| 6. Maintaining a particular cast | Track each cast, its recipients and its upkeep independently. Let maintenance extend, move, add, reroll, or activate a specified child. Share the roll across eligible maintained targets when required. | 14 · The Flesh, a Crucible · Web of All That's Come Before · Swarm of Spirits · Luminous Champion Aloft · Magma Titan · The Green Defends Its Servants · Instantaneous Excavation · No More than a Breeze · O Flower Aid, O Earth Defend · Wall of Fire · Storm of Sands · The Wode Remembers and Returns · Summon Source of Earth · Subverted Perception of Space |
| 7. Modifiers limited to a particular use | Apply and expire modifiers at the calculation that reads them, including transferred Stability, characteristic substitution, resistance to potency, saving throws and strikes. Restore only the originating grant. | 3 · The Mountain Does Not Move · Swarm of Spirits · Magma Titan |
| 20. Temporary Stamina by source | Identify the specific grant that expired, was displaced or depleted. Remove its linked effect and trigger its consequence once. Preserve unrelated grants. | 1 · The Green Defends Its Servants |

#### Damage and resources

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 8. Spending and gaining resources | Return the accepted spend to the effect, respect the recipient’s available Recoveries, adjust allowed gains once, and prevent prohibited healing. Reuse the existing fixed spend and gain paths. | 4 · Breath of Dawn Remembered · Luminous Champion Aloft · O Flower Aid, O Earth Defend · Summon Source of Earth |
| 9. Changing a pending hit | Amend damage or potency for one target before damage, conditions and zero-Stamina consequences commit. Make the modifier and optional spend resolve once for that hit. | 1 · **Skin Like Castle Walls** |
| 21. Signed Director resource changes | Apply an authorized Malice change to the shared GM pool, allow a negative result when the rule permits it, and synchronize one result to all clients. | 1 · Muse of Fire |

#### Movement and landings

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 10. Changing movement in progress | Identify an attempted move even with zero travel. Let a reaction amend it or interrupt at a legal square, then resume or end it. Preview consequences and commit the final path once. | 4 · The Mountain Does Not Move · **Explosive Assistance** · Subtle Relocation · There is No Space Between |
| 14. Legal placement and movement through solids | Check footprints and clearance. Support phasing, binding to an object, recording an entry square, restoring at the nearest legal square and displacing occupants when size or support changes. | 8 · Erase · Magma Titan · Earth Accepts Me · Ripples in the Earth · Instantaneous Excavation · No More than a Breeze · World Torn Asunder · Summon Source of Earth |
| 15. Fall and landing outcomes | Use the existing 3D fall resolver with ability-specified height reduction, Agility and damage type. Report support, actual landing and resolved damage for follow-up effects. | 4 · Instantaneous Excavation · Maw of Earth · Meteor · World Torn Asunder |

#### Areas, terrain and perception

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 11. Rules for occupants of an area | Query occupancy, allegiance, size, material, entry, turn and round. Use the same rule for preview and committed terrain cost, eligibility and benefits. Filter growth cells by occupancy at creation. Count entered footprint squares and first entries separately. | 9 · Swarm of Spirits · Unquiet Ground · O Flower Aid, O Earth Defend · Wall of Fire · Storm of Sands · The Wode Remembers and Returns · Heart of the Wode · Return to Oblivion · Summon Source of Earth |
| 12. Editing an existing area | Keep one zone identity when its footprint moves, grows or gains only eligible cells. Recompute membership and eligibility, including line-of-effect expiry, without replaying its opening effect. | 3 · O Flower Aid, O Earth Defend · Wall of Fire · Storm of Sands |
| 13. Editing 3D terrain and objects | Query material and object tags. Cut, seal, raise, lower, tunnel or destroy tagged cells or a whole object. Refresh collision, support and line of effect and emit the changed cells. | 8 · **Motivate Earth** · Earth Accepts Me · **Return to Formlessness** · Ripples in the Earth · Instantaneous Excavation · Maw of Earth · World Torn Asunder · Summon Source of Earth |
| 16. Perception and line of effect by observer | Grant or restrict what a specific actor can perceive or target. Cover magical information, ignoring concealment, temporary concealment and directional line-of-effect exceptions. | 5 · Luminous Champion Aloft · Earth Accepts Me · Storm of Sands · Shared Void Sense · Subverted Perception of Space |

#### Scene entities, portals and granted actions

| Change | Behavior the JSON can request | Cards using it |
|---|---|---|
| 17. Lifecycle of a scene creature or object | Create, suspend, restore, dismiss or destroy an entity by ID. A summoned actor also needs a template, controller, turn order, retained encounter state and recharge. A tree needs only the object operations. | 4 · Erase · Heart of the Wode · Return to Oblivion · Summon Source of Earth |
| 18. Linked portal destinations | Extend existing portal traversal with an owned network, legal heights and exits, and a designated exit chooser. Tie additions and removal to the parent effect. | 1 · There is No Space Between |
| 19. Granting or invoking another action | Select eligible known or standard actions on the right actor. Allow declared target, timing and cost exceptions, and enforce shared budgets, sequencing, cancellation and recursion limits. | 5 · The Green Defends Its Servants · Heart of the Wode · Summon Source of Earth · **Subvert the Green Within** · **Prism** |

### All dependencies for a single card

Read across a row to see everything a card still needs. Existing targeting, damage, typed movement, zones, spending, conditions and other supported operations can be composed with these changes. For a card that grants another ability, the row covers selecting, authorizing and invoking it. The selected ability still needs its own runnable recipe.

| Card | Required changes |
|---|---|
| Afflict a Bountiful Decay | 4 |
| Behold the Mystery | 3 |
| Bifurcated Incineration | 3 |
| Breath of Dawn Remembered | 2, 8 |
| Combustion Deferred | 5 |
| Conflagration | 3 |
| Earth Accepts Me | 5, 13, 14, 16 |
| Earth Rejects You | 2, 3 |
| Erase | 2, 5, 14, 17 |
| Explosive Assistance | 10 |
| Grasp of Beyond | 1 |
| Heart of the Wode | 4, 5, 11, 17, 19 |
| Instantaneous Excavation | 3, 6, 13, 14, 15 |
| Invigorating Growth | 5 |
| Luminous Champion Aloft | 6, 8, 16 |
| Magma Titan | 1, 6, 7, 14 |
| Maw of Earth | 3, 13, 15 |
| Meteor | 1, 2, 15 |
| Motivate Earth | 13 |
| Muse of Fire | 3, 21 |
| No More than a Breeze | 6, 14 |
| O Flower Aid, O Earth Defend | 6, 8, 11, 12 |
| Practical Magic | 1, 2 |
| Prism | 19 |
| Return to Formlessness | 13 |
| Return to Oblivion | 2, 11, 17 |
| Ripples in the Earth | 1, 3, 13, 14 |
| Shared Void Sense | 1, 2, 16 |
| Skin Like Castle Walls | 9 |
| Storm of Sands | 3, 6, 11, 12, 16 |
| Subtle Relocation | 1, 10 |
| Subvert the Green Within | 19 |
| Subverted Perception of Space | 6, 16 |
| Summon Source of Earth | 5, 6, 8, 11, 13, 14, 17, 19 |
| Swarm of Spirits | 3, 6, 7, 11 |
| Test of Rain | 3, 4 |
| The Flesh, a Crucible | 3, 6 |
| The Green Defends Its Servants | 6, 19, 20 |
| The Mountain Does Not Move | 1, 7, 10 |
| The Wode Remembers and Returns | 6, 11 |
| There is No Space Between | 5, 10, 18 |
| Translated Through Flame | 2, 3 |
| Unquiet Ground | 3, 11 |
| Wall of Fire | 1, 6, 11, 12 |
| Ward of Nature's Affection | 1 |
| Web of All That's Come Before | 3, 6 |
| World Torn Asunder | 2, 3, 13, 14, 15 |

**Acceptance at the table.** For the first four changes, use a disposable scene with two different target modifiers, two casters or casts with the same ability ID, a changed Reason score and an origin different from the token being teleported. Exercise acceptance, cancellation and reconnect on the player and GM clients. For a late reaction, the movement or hit operation needs its own provisional result and decision point before dependent consequences become final. Only the triggering action stays open during that decision. Allowing revisions after subsequent actions depend on the result would need a separate undo policy. For Muse of Fire, agree how the one Malice loss is selected when enemy tiers differ before authoring its recipe.

### Scope beyond the class cards

The builder also lists 37 optional ability grants across possible Elementalist builds, and the class has passive features. The 21-change estimate covers the 56 class action cards. There is immediate reuse outside them. Draconian Guard and Resist the Unnatural can share pending-hit changes (9), Friend Catapult and I’ve Got You use the landing result (15), and Issue Order uses granted actions (19). These callers are excluded from the reach counts above.

Seven further areas deserve a separate estimate if the target expands to every possible hero build. Each connects a rule to a different part of the game. Existing systems may already supply part of each integration.

| Additional integration to check | Examples that establish the need |
|---|---|
| Install passive rules from the hero’s current build and remove them when the source changes | The four Acolytes, enchantments, wards and Mantles. Feed persistence as structured card data through the builder, so maintenance also works on a fresh export. |
| Offer a reaction before the roller accepts their result | Keeper of Order removes one edge or bane. Foresight imposes a bane on a pending strike. Both must reach the person resolving the roll. |
| Enter, combine and leave forms | Disciple of the Green and Chimeric Manifestation change statistics, equipment and free strikes together. The latter can combine two forms under a level budget. |
| Track time, recharge and relevant campaign events across encounters | Out-of-combat Essence, the uninterrupted fire conversation, the Victory recharge for Friend Catapult, and the nearby deaths during the past day used by Contact Spirits. |
| Deliver information or speech privately across actors and scenes | Psychic Whisper, Share Head and A Conversation With Fire need a recipient, visibility/consent rules and a way to end the link. |
| Give, consume and track durable items and their effects | Master of Green’s Life Fruit can be fed to an ally. Master of Fire grants breath equal to the echelon of a treasure the caster melts. |
| Apply feature exceptions to negotiation and downtime project resolution | Mantle of Quintessence affects starting patience. Master of Void can complete a qualifying research project on its respite roll. |

The appendices list the optional grants and feature rules individually. No full-class estimate for the other eight classes follows from this count.

## Shared code gaps · 10

These are the closest to full coverage. Some already have working JSON for ordinary combat use.

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Ward of Nature's Affection](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L357) | Derived values | The damage event, captured attacker and Reason-scaled slide already work. The trigger distance cap is a literal number. Allow the filter to read the wearer’s current Reason. A JSON recipe with the hero’s present Reason as its range works for that sheet. |
| [Afflict a Bountiful Decay](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L379) | Effect removal | The corruption strike and a separate self-or-ally pick work. A JSON duration choice followed by `endCondition` can remove one ordinary qualifying condition now. For the full rule, let the selected recipient end an eligible effect even when implemented as a visible buff stored under `hiddenEffect`, and match end-of-turn to that recipient’s turn. Current end-condition selectors omit those rider records. No new damage or healing primitive is needed. |
| [Bifurcated Incineration](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L390) | Per-target roll tiers | The two-target fire card runs today and may finish after one pick. Damage and defenses resolve per creature. A single selected tier currently drives both targets even when their individual edges/banes give different tiers. Compute target-specific outcomes from the same accepted dice. No Bifurcated-specific handler is required. |
| [Grasp of Beyond](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L398) | Derived values | Corruption damage, optional self teleport and the board destination picker are wired. Teleport accepts a numeric base distance. Teach that distance to read current Reason. A fixed-Reason hero can use the whole action with JSON today. |
| [Behold the Mystery](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L463) | Per-target roll tiers | With the published `Persistent 1:` wording on the card, a fresh area roll as a maneuver without extra essence uses the existing maintenance path. Its psychic area attack still needs different target tiers when modifiers differ. No bespoke upkeep or psychic-damage handler is needed. |
| [The Flesh, a Crucible](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L473) | Maintained target groups | The fire strike and free turn-start reroll work for one marked target with book-formatted P1 text. The board currently keeps one entry per ability, skips a second maintained cast and can replace target IDs. Track multiple maintained recipients, account for their upkeep and reroll once for eligible, in-range targets with appropriate outcomes. |
| [Conflagration](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L520) | Per-target roll tiers | The saved fire cube already resolves and book-formatted P2 text allows a fresh use as a maneuver without paying the cast cost again. Mixed target modifiers still require the shared roll fix. |
| [Test of Rain](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L560) | Effect removal and per-target rolls | The acid cube works. Offer the caster even outside the cube and each eligible ally their own optional removal. Share the recipient-scoped effect-removal fix with Bountiful Decay and the per-target tier fix with area attacks. |
| [Web of All That's Come Before](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L987) | Per-target rolls and maintenance | JSON can express the opening corruption attack, Agility potency, universally difficult ground, and an enemy occupant-turn-end restraint independent of potency. Use the same area for P1 extension. Shared gaps are mixed target tiers and limiting maintenance to the printed extension so it cannot repeat opening damage. |
| [Earth Rejects You](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1288) | Target filters and per-target rolls | The cube, tier damage and book-formatted P2 maneuver repeat are available. The area filter has no union for enemies plus objects. Add an allegiance-or-object filter that excludes friendly creatures, then resolve mixed tiers on one roll. |

## Missing effect support · 37

Implement the operations in the third column as shared engine or board capabilities. The named ability supplies the parameters in JSON.

### Reactions, resources and ongoing effects

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Practical Magic](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L191) | Derived values, movement | Use a three-way choice, a Reason power roll with tiered pushes, a seven-type Reason damage effect, and the existing spend-per-square teleport. Supply a reusable range expression for the current effective Hurl range, a stat-based teleport allowance, and Knockback’s target-size gate using the applicable stats. A fixed range and teleport cap can be authored for one hero. |
| [Skin Like Castle Walls](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L247) | Pending damage and potency | The trigger and halve-damage refund exist. Refunding after the hit permits zero-Stamina or on-damage consequences to fire first. Add mitigation on the pending target-specific hit and let a one-essence spend lower that hit’s potency before its riders resolve. |
| [The Mountain Does Not Move](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L910) | Forced movement, stat transfer | The level-based Stability can use the builder stat path. Transfer a chosen amount of the Elementalist’s current Stability to the ally within effective Hurl range and recalculate that ally’s original movement. Expire this transfer at round end while preserving other changes to either creature’s Stability. |
| [Explosive Assistance](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L238) | Amend forced movement | Allow the eligible Elementalist to react after seeing the result, including a fully resisted attempt. Add Reason, or twice Reason for one essence, to the original push, pull or slide. Recalculate its total allowance with the original resistance and account for the distance and consequences already resolved. See the proposed table flow under Engineering order. |
| [Breath of Dawn Remembered](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L230) | Variable spending | Turn-start/damage triggers, target Recoveries and optional spends exist. A variable `spend` runs its inner effects once regardless of the amount, and `heal.recoveries` is fixed. Bind Recovery count to accepted essence and the recipient’s available Recoveries. Range-check the triggering ally, including damage from a distant attacker. |
| [Subtle Relocation](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L255) | Movement interruption | Turn and movement events, teleport and an optional spend exist. Pause a voluntary or forced move at an intermediate square, teleport the correct actor up to Reason or twice Reason and resume or end the path as appropriate. The current move event reports a committed move. |
| [Invigorating Growth](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L484) | Target-bound listeners | Poison damage and surge grants exist. Attach a removable mushroom effect to the struck creature so future damage to it grants surges to the original caster and qualifying nearby allies. Expose removal as a main action to the target or one adjacent creature and unregister the listener. |
| [Erase](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L798) | Timed stages and token removal | Select 1/2/3 targets from the roll. Advance each unsaved target from bane to double bane to one-hour absence, ending progression on a save. Restore it at the original or nearest legal square. Use a reversible removal rather than deleting the actor. |
| [Swarm of Spirits](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L823) | Aura stat modifiers | Damage, a following aura and timing are available. Add +1 to allied characteristics only when resisting potency and +1 to allied saves in the aura. P1 repeats enemy damage and extends the allied benefit on its specified boundary. |
| [Combustion Deferred](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L947) | Chained expiring effects | The strike and splash damage are available. Attach a single-use detonation to the target’s next turn end or earlier drop to zero. Pass that effect to every affected enemy and deduplicate the two competing events without suppressing later generations. |
| [Luminous Champion Aloft](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1037) | Timed modifiers and resource gain | The movement buff already supports +3 speed and flight. Add ignore-concealment on the recipient’s abilities and +1 to each qualifying heroic-resource gain with a nonrecursive adjustment. P1 extends the bundle. |
| [Magma Titan](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1046) | Size and stat overlays | Add temporary size growth with fit/displacement, restrained if growth fails, and restoration on expiry. Compose existing immunity and other modifiers with extra typed strike damage, forced movement and highest-stat substitution on Might rolls. P2 extends and offers the Recovery spend. |
| [Muse of Fire](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1202) | Director resource | The fire roll and a Malice-changing hook exist. The GM host/Sync V2 floors the balance at zero, and the player-side fallback is a reminder. Apply one authoritative signed loss per roll, including a negative resulting balance, independently of enemy count. |
| [The Green Defends Its Servants](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1298) | Source-bound temporary Stamina | Add a removable 30-point shield grant with Defend as a maneuver. On loss of that specific grant, whether depleted or expired, remove its rider and explode once. P2 extends the shield. A total temporary-Stamina counter cannot identify which grant disappeared. |

### Terrain, movement and scene objects

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Motivate Earth](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L302) | Scene geometry | The template can already create a five-square structure. Expose a reversible edit of the touched material for the one-square opening and sealing alternatives, including collision and line of effect. Anchor the wall to the touched square. Use a Director material choice where the source geometry is untagged. |
| [Earth Accepts Me](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L775) | Scene geometry, binding | Bind the caster inside the qualifying dirt, metal or stone object. Track motion within it, block line of effect in both directions while preserving observation and speech, and eject and deal ten damage when the object is destroyed. |
| [Return to Formlessness](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L213) | Destructible objects | A generic damage roll cannot destroy just the touched square of a larger object. Expose destruction of a selected object or cell. Read mundane/supernatural/artifact and treasure echelon when tagged, and let Master of Fire grant breath for the eligible treasure. |
| [Unquiet Ground](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L439) | Terrain cost by team | The enemy cube, damage and difficult-terrain cost already exist. Zone occupant targeting can distinguish enemies, but movement prices the zone without checking the mover’s allegiance to the caster. Add that predicate to route costing as well as preview. Preserve the book’s unspecified terrain end time. Also benefits from per-target roll tiers. |
| [Ripples in the Earth](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L497) | Scene geometry | Burst damage and tier-3 Might/prone are available. Add an optional pillar on an eligible ground square, height up to Reason, moving its occupants only with valid clearance. Test a grounded caster, an elevated ally and an obstructing ceiling. |
| [Instantaneous Excavation](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L530) | Scene geometry and falls | Add composable four-deep holes that can join into a wider opening, select grounded creatures that fit and roll separately per creature without a maneuver critical. Resolve the tier’s shift, fall or unmitigated fall. P1 adds one hole at turn start instead of repeating the original two. |
| [No More than a Breeze](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L550) | Phasing | A timed movement buff can already waive difficult terrain and opportunity attacks. Add traversal through solid matter, capture the entry space and eject there if the target ends its turn embedded. P1 should extend the grant without replaying initial effects. |
| [O Flower Aid, O Earth Defend](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L704) | Movable zones | The placed cube and damage on entry/occupant start exist. Add enemy-only terrain cost, first entry per enemy per round, the free maneuver for chosen Recovery counts and a maneuver to move the same zone up to five. End it immediately if caster line of effect breaks. P1 keeps the zone. |
| [Translated Through Flame](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L732) | Teleport origin | Adjacent selection from a landing creature and fire area damage are expressible. The board measures teleport reach from the teleported creature. Allow a separate caster origin for the destination constraint, then target only enemies adjacent to the landing footprint. Also benefits from per-target tiers. |
| [Maw of Earth](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L814) | Scene geometry and falls | The saved area damage works. Lower the surface under the cube by three squares and send unsupported occupants through the 3D fall resolver. The saved note leaves geometry untouched. |
| [Wall of Fire](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L838) | Editable zone footprints | A passable wall footprint and entry/start ticks are possible. Support first entry per enemy per round separately from turn start, count each affected footprint square for damage, and append up to Reason squares to the original wall on P1. |
| [Storm of Sands](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L959) | Movable zones | Area damage works. Combine enemy-only movement cost and allied concealment. P1 keeps the same area, allows moving it up to five without an action, and separately offers a maneuver to reroll there. A whole-card rerun cannot implement those independent choices. |
| [Meteor](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1066) | Landing consequences | Tiered numeric teleports exist. Add an authored fall with effective Agility zero, type its damage as fire, share the resulting amount with enemies near the actual landing and apply difficult terrain there. A teleport to support should skip the fall. |
| [The Wode Remembers and Returns](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1081) | Zone benefits by occupant | Spawn growth in empty cells only, price terrain for enemies and grant cover when an ally ends their turn inside. P2 preserves that area and lets each ally in it spend a Recovery on the caster’s turn start. |
| [Heart of the Wode](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1187) | Interactive scene objects | Spawn an immovable size-5, 100-Stamina tree. Bind free Catch Breath on touch, the start-turn line-of-effect cleanse/stand choice, end-turn restraint and main-action escape to that object. Its destruction must remove its listeners. |
| [Return to Oblivion](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1252) | Round-scoped zone effects | Create a vortex until encounter end. An unoccupied vortex pulls vertically at round start, entry/start knocks enemies prone, and round end destroys an occupying winded enemy only when it is neither leader nor solo. Query live occupancy and roles at each event. |
| [World Torn Asunder](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1263) | Scene geometry and falls | Run the burst and Might/prone first. Cut an adjacent 10 × 2, six-deep fissure, resolve falls for prone creatures size 2 or smaller, and give others the choice of entering or shifting to a legal outside square. |

### Perception, portals, summons and other abilities

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Shared Void Sense](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L282) | Perception grants | The recipient count depends on Victories. Add a bounded target count and a timed observer-specific grant for illusions, invisibility, magical concealment and magical properties. Share the sense without granting recipients the sharing maneuver. |
| [There is No Space Between](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L682) | Temporary portals | Use existing portal traversal and teleport movement. Expose a caster-owned portal network that grows at turn start, enforces legal placement, ends on dying/dismissal/lost range, and lets the force mover select an enemy’s exit while ending the original move. |
| [Summon Source of Earth](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1169) | Summoned actors | Add a template-backed spawn, control and turn after the caster, dismissal and per-encounter Stamina retained across re-summons. Block healing and enforce the zero-Stamina Victory lock. Attach Boulder Bash, Earthwalk, Tunnler and Earth Harness to the summoned actor. P2 grants another turn. |
| [Subvert the Green Within](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L719) | Nested abilities | The existing `useAbility` can execute as another actor with zero additional cost. Add an eligible signature selector and an explicit override for its chosen target, and finish it before applying the caster’s poison roll. Falling back to the target’s first action is incorrect when it has multiple actions. |
| [Subverted Perception of Space](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L973) | Actor-specific line of effect | Apply corruption damage and a timed outgoing line-of-effect cap of four squares or adjacency by tier. Enforce the cap in the affected actor’s target queries. P1 extends the restriction without dealing damage again. |
| [Prism](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1310) | Nested abilities | Compose existing free child execution and shifts. Add a dynamic choice of known heroics, cumulative cost cap of eleven and up to three accepted uses, with optional shifts only between them. Preserve spent steps on cancellation and prevent recursive Prism calls. |

## JSON-ready · 8

Each of these can be authored using existing v3 fields. The current VTT callbacks cover the distinguishing effects.

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Hurl Element](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L156) | Typed strike and free-strike tray | The seven-type Reason strike already works. Adding `asFreeStrike: true` to the ability data also makes the builder export a runnable free-strike tray entry. The remaining code is in the generic granted `freeStrike` call. The board rolls a PC’s Might/Agility weapon strike directly. Let an eligible ranged grant select the hero’s actual free-strike card and run it once. Explicitly calling Hurl by name or clicking either tray entry works today. |
| [Ward of Surprising Reactivity](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L363) | Reaction, push | Use a damage-to-self trigger checked against the adjacent source, resolve against `eventSource`, and use `forcedMovement` push, `upTo`, Reason ×2. Omit the saved recipe’s extra target picker. The free-trigger flag allows it after an ordinary reaction has been used. A sourced hit from an adjacent creature is enough to run the push. |
| [The Green Within, The Green Without](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L408) | Target-relative selection | Roll damage on the primary creature. Use a second single-creature picker with `rangeOrigin` set to the primary target group and range ten. Apply slide up to two to that group. The second chooser can reach beyond ten from the caster. |
| [Meteoric Introduction](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L423) | Damage and movement | Use the three Reason damage tiers with push 2/3/4. The ordinary forced-movement path owns stability, placement and collision. |
| [Ray of Agonizing Self-Reflection](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L431) | Damage and potency | Apply corruption damage, then a weak/average/strong Reason potency test at the rolled tier. Use `onFail` for slowed, save ends. |
| [Viscous Fire](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L449) | Damage and movement | Use fire damage and a push of 2/3/4 at the rolled tier. Both effects reach the host with the correct target. |
| [Volcano's Embrace](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L743) | Damage and potency | Use the fire strike followed by weak/average/strong Agility potency and restrained, save ends, on failure. |
| [Unquenchable Fire](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1318) | Damage and potency | Set immunity bypass on the rolled fire damage. Check Intuition potency by tier and apply dazed, save ends, on failure. |

## Director-resolved · 1

| Ability | Work item | What the current code can do and what to change |
|---|---|---|
| [Remember Growth and Sun and Rain](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L788) | Story resolution | Target a touched mundane wooden object and prompt the Director for witnessed events within ten squares during the preceding twelve hours. This resolves the printed ability with existing targeting and text. An automatic historical replay would be a separate feature. |

## Engineering order

1. **Fix shared selection and roll semantics.** Keep the common 2d10 result and evaluate modifiers and tiers separately for each target. Exercise Bifurcated Incineration with an edge against only one enemy. Add typed numeric references where teleport distance or trigger radius needs current Reason, and where a picker needs Victories or another ability’s effective range. Keep literal numeric fields usable. Let free-strike grants dispatch an eligible known card. Confirm that Hurl’s choice of damage type reaches the damage pipeline in both entry paths.
2. **Extend selected-recipient and event handling.** The current trigger bus already captures the attacker and target. Give a resolved forced-movement attempt an identity that reactions can reference after the token lands. Preserve the earlier decision point for effects that change a hit or potency before a dependent outcome. Add a selected-recipient cleanse that handles eligible effect instances and their actual turn owner. Pass accepted spend amounts to dependent effects. Test a lethal hit and a move into a collision, declined spends, multiple possible attackers, and an EOT effect tied to a different actor.
3. **Finish ongoing effects and areas.** Add source-owned effect instances with selective extension, replacement, consumption and per-recipient cleanup. Reuse existing zone footprints, entry/start/end events, timed conditions and movement buffs. Implement area movement/editing, per-actor route costs, per-square damage, remaining line of effect and removable granted actions as separate primitives. Use the same state for movement previews and committed moves. Test long paths, large footprints, two maintained targets, retries, expiry and reconnect.
4. **Expose 3D scene operations and nested calls.** Offer JSON operations for editing or removing geometry, controlled summons, linked temporary portals, fall outcomes, original-caster destination constraints, and choosing and executing another actor’s eligible ability. Store costs, eligibility exceptions and child effects under the originating invocation. Test Motivate Earth by walking through and resealing the opening, Meteor by landing on support and in open air, and Prism by canceling after one child resolves.
5. **Connect state modifiers to the consumers that use them.** Examples are sense/line-of-effect checks, actor size, source-owned shield Stamina, and pre-commit heroic-resource and Malice adjustments. Use a narrowly authorized signed Malice change for Muse of Fire. Test it from the player side with GM authority and survive a reload with negative Malice.

### First design discussion · forced movement and reactions at the table

**Feasibility.** During a running turn, the server already groups changes from an ability and stores before/after values for supported operations. A movement receipt can identify the breakable wall segments or cubes the push broke. Undo can put the token back and mend those pieces. The board also has a separate refund path for tracked collision damage. A move undo does not reconstruct every consequence, such as a fall, a condition, a later player's choice, or an attack through the opening. Turn undo checks for changed fields and can skip a conflicting step. Replaying a push as an ordinary reaction would require stronger guarantees than either undo path provides. [Turn undo](turn-undo.md) · [Server movement restore](../dnd/vtt/lib/SyncV2Store.php#L1491) · [Collision refund](../dnd/vtt/assets/js/ui/board-interactions.js#L21169)

**Proposed table flow.** The mover rolls, then chooses or drags the token to a landing as usual. If a relevant reaction could change that move, show the proposed landing and result to the table, including a resisted result with zero travel. Offer eligible options together, with a way for the table to accept the move as shown. Check eligibility at the time of the attempt. Explosive Assistance watches the ally doing the forcing or the Elementalist themself. The Mountain Does Not Move watches the ally being moved. A targeted redirect such as Lines of Force must be decided before anything happens to the original target. A route that could hit a wall, cause a fall, trigger a hazard or pay out damage for squares moved stays a preview until those choices are settled. A player can see and react to the apparent landing without the server having to unbreak a wall. With no relevant optional reaction, keep the ordinary resolution flow.

**Explosive Assistance.** The Elementalist chooses Reason or pays one essence for twice Reason. On the original push, pull or slide, add that bonus to the pre-resistance distance and calculate the legal movement once. With full Stability 3, Push 1 plus 6 permits four squares, Push 3 plus 6 permits six, and Push 5 plus 6 permits eight. If two squares of that last push have already been travelled in open space and nothing has used the landing, the mover can continue up to six more. Preserve the original source, any established push/pull line, intentional shorter movement, and the target’s choice of resistance. When fully resisted, the original mover picks a legal direction if the bonus opens one. Offering Assistance on a fully resisted attempt is the proposed table ruling. A voluntarily skipped push does not offer it.

**Where the reaction window closes.** Treat a plain open-space extension as an optional convenience only while the system can establish that the same target still stands at the landing and no dependent result has been accepted. Otherwise offer the choice before publishing the consequence. Once another action, resource choice, collision, fall or zone effect depends on that outcome, use Director review for a late correction. Do not reroll the original attack or automatically reverse other players’ actions. Two clients accepting the same reaction must produce one spend and one result. Existing manual Ctrl-drags report distance travelled as requested distance. Attach the originating ability’s force and verb when available, and let a mover record a fully resisted manual attempt without dragging. [Manual movement event](../dnd/vtt/assets/js/ui/board-interactions.js#L1615) · [Resisted trigger filter](../dnd/vtt/assets/js/ui/automation-trigger-predicate.js#L114) · [Existing wall-break choice](../dnd/vtt/assets/js/ui/board-interactions.js#L21023)

#### Which abilities use each part?

The survey covered the nine core class chapters and relevant ancestry traits. This table groups the movement rules that drive different design decisions. Each row describes a proposed use of the shared movement resolver. A compound ability can appear at several stages. Values such as the verb, eligible actor, amount, cost and timing belong in JSON. Existing distance bonuses, Stability bypass and captured movement amounts should be reused where they already work.

| When the rule applies | Shared operation | Callers and why timing matters |
|---|---|---|
| Before placing the target | Modify the original move’s allowance. Fixed, stat-based, and per-resource bonuses share the calculation. Apply passive bonuses without a prompt. | **Explosive Assistance** adds Reason or twice Reason. **Kinetic Amplifier** spends up to two surges for Reason per surge. **Ride the Lightning**, **Thunderstruck**, **Radical Fantasia** and **Magma Titan** supply bonuses under their own eligibility rules. [Elementalist](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L238) · [Talent](../dnd/ai-reference/source/rules-v1.01b/classes/talent.md#L786) · [Censor](../dnd/ai-reference/source/rules-v1.01b/classes/censor.md#L1004) · [Conduit](../dnd/ai-reference/source/rules-v1.01b/classes/conduit.md#L1233) · [Troubadour](../dnd/ai-reference/source/rules-v1.01b/classes/troubadour.md#L998) |
| Before displacement | Change the source, target or verb, then recalculate range, legal path and the new target’s resistance. | **Lines of Force** can redirect the move, make the Fury its source, change it to a push and add Might. The **Boren** aspect can turn the user’s push into a pull. **The Mountain Does Not Move** keeps the target and transfers Stability until round end. [Fury reaction](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L232) · [Boren](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L1093) · [Elementalist](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L910) |
| While calculating resistance | Reduce, replace or bypass resistance, and report whether and why the total became zero. | **Machinations of Sound** uses the target’s Intuition in place of Stability. **Black Hole Star** specifies a minimum when Stability reduces its pull and ignores allied Stability. **Repel** can reduce the original move by Reason and allow a new push against its source if reduced to zero. On a hit that deals damage and force moves, Repel allows one of its two benefits. [Shadow](../dnd/ai-reference/source/rules-v1.01b/classes/shadow.md#L480) · [Elementalist](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L1129) · [Talent](../dnd/ai-reference/source/rules-v1.01b/classes/talent.md#L311) |
| Along the actual path | Report cells entered, areas exited, adjacency and remaining force. Identify the target and its movement attempt. | **Drag the Unworthy** offers a Recovery to each ally the target passes adjacent to. **Edict of Stillness** observes leaving an aura. **There Is No Space Between** can stop a forced move at a portal and transfer the target. **Thunder Roar** and **Lightning Lord** settle their targets nearest first, so one target’s landing can change the next collision. [Conduit](../dnd/ai-reference/source/rules-v1.01b/classes/conduit.md#L1307) · [Censor](../dnd/ai-reference/source/rules-v1.01b/classes/censor.md#L627) · [Portal](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L692) · [Fury](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L381) · [Conduit order](../dnd/ai-reference/source/rules-v1.01b/classes/conduit.md#L1109) |
| At impact | Decide what the impact does and whether remaining movement stops, rebounds or carries through. Distinguish a collision, damage to a particular participant, and breaking through an object. | **Rebounding Storm** deals collision damage and bounces with the remaining distance. **Gravitic Charge** resolves damage and continues through the struck creature. **Death Comes for You All!** adds damage for hurling through an object. **Panic in Their Lines** calls a free strike against the creature actually collided with. [Fury rebound](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L658) · [Null](../dnd/ai-reference/source/rules-v1.01b/classes/null.md#L789) · [Fury breakthrough](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L921) · [Tactician](../dnd/ai-reference/source/rules-v1.01b/classes/tactician.md#L688) |
| After resolution | Publish the actual distance, who was hit, the final square and whether an attempt was fully resisted. Start any newly granted action separately. | **Impart Force** counts squares actually pushed. **Phase Hurl** also needs the collision participants. **Metakinetic Mastery** can grant surges even on resistance at the qualifying threshold and frequency. **Reactive Tumble** offers a separate shift after forced movement. **Force of Storms** starts secondary pushes around the final landing. A **Ward of Surprising Reactivity** push is also a new move, triggered by damage. [Null distance](../dnd/ai-reference/source/rules-v1.01b/classes/null.md#L445) · [Null collision](../dnd/ai-reference/source/rules-v1.01b/classes/null.md#L901) · [Null mastery](../dnd/ai-reference/source/rules-v1.01b/classes/null.md#L245) · [Ancestry](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-03-ancestries.md#L2125) · [Fury](../dnd/ai-reference/source/rules-v1.01b/classes/fury.md#L732) · [Ward](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L363) |

**First implementation slice to consider.** Use the existing turn/action grouping, with one forced-movement attempt per target. Preserve source, target, original force, resistance decision, chosen path and final outcome. Prove three very different callers before extending the schema further: Explosive Assistance on a fully resisted push and at a wall, Lines of Force redirecting away from a hazardous square, and Impart Force paying only for final travel. Test two eligible reactors, declined reactions, manual moves and reconnection while a choice is open. Confirm that ordinary pushes with no eligible reaction remain just as quick. The same pattern can later support a pending damage event for **Skin Like Castle Walls** and the damage branch of **Repel**.

### Persistence cuts across 17 cards

The board already offers maintenance, subtracts upkeep, marks recipients and can rerun an ability at turn start. The existing runner recognizes the published **“Persistent N:”** phrase in the card fields. Supplying that text as card data enables this path. The builder currently renders **“Persist N essence”**, which it misses. That formatting issue alone does not make all seventeen abilities require a new engine.

The remaining runtime gaps are specific. The board keys maintenance by ability ID, so a second cast on a different recipient cannot reliably be kept independently. “Use it again” reopens the entire card, which is appropriate for Conflagration and wrong for extending a shield or adding one hole. Expose maintained instances, typed repeat/extend behavior, bound target groups and one shared roll where the rule calls for it. Test budget limits and the cumulative 5 × Reason damage threshold within a turn using the existing warning/override flow. Handle out-of-combat free uses, Victory/respite resets and Victory-limited maintenance at the class resource level.

### Evidence and verification

- **Source of truth.** Reconciled the 56 unique class IDs in the builder with the local Heroes v1.01b chapter. Every class card appears exactly once in the readiness tables. The detailed rule link in each row points to its passage. [Class rules](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md) · [Catalog](../dnd/character_sheet/builder/rules.json)
- **JSON-ready probes.** Ran temporary strict-v3 recipes or the existing Hurl recipe through the real runner harness for all eight JSON-ready cards. All three tiers of Meteoric Introduction, Viscous Fire, Ray of Agonizing Self-Reflection, Volcano’s Embrace and Unquenchable Fire dispatched the expected damage and movement or potency/condition callbacks. A second picker used the struck token as its origin for The Green Within. Ward of Surprising Reactivity pushed the captured attacker six squares at Reason 3 without reopening target selection. The actual trigger predicate accepted an adjacent source and rejected distant and missing sources. [Runner](../dnd/character_sheet/ability-automation/runner.js) · [Trigger matching](../dnd/vtt/assets/js/ui/automation-trigger-predicate.js) · [3D board target entry](../dnd/vtt/assets/js/ui/board-interactions.js#L19058)
- **Boundaries tested.** A data-only Hurl free-strike flag on an in-memory catalog exported a runnable free-strike entry. A direct sonic Hurl at tier 2 and Reason 3 dealt seven. The generic free-strike host separately reads Might/Agility and weapon damage. Bifurcated Incineration applied the same chosen tier to both harness targets. A three-essence variable spend with one Recovery child requested just one Recovery. A shown buff stored as a hidden-effect rider with an eligible end-of-turn duration was skipped by the removal effect. [Builder alias](../dnd/character_sheet/builder/build-sheet.mjs#L512) · [Free-strike host](../dnd/vtt/assets/js/ui/board-interactions.js#L20336) · [Tier dispatch](../dnd/character_sheet/ability-automation/runner.js#L1770) · [Multi-target rule](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-05-classes.md#L602)
- **Other code paths traced.** Characteristic fields are supported on forced movement, while teleport uses a literal base distance. End-condition filters skip hidden-effect records, and variable spend runs its child effects once. Zone movement costs have no team comparison. The teleport destination picker starts from the recipient, and both Malice UI and server normalize the pool to nonnegative values. [Schema](../dnd/character_sheet/ability-automation/schema.js#L567) · [Effect removal](../dnd/character_sheet/ability-automation/runner.js#L3946) · [Spending](../dnd/character_sheet/ability-automation/runner.js#L4327) · [Terrain costs](../dnd/vtt/assets/js/ui/terrain-zones.mjs#L49) · [Teleport host](../dnd/vtt/assets/js/ui/board-interactions.js#L20238) · [Malice UI](../dnd/vtt/assets/js/ui/malice-changes.mjs#L24) · [Sync V2](../dnd/vtt/lib/SyncV2Store.php#L1367)
- **Test scope.** Seven existing suites passed 91 tests covering the runner, end effects, damage-type selection, teleport-adjacent targeting, trigger predicates, maintenance and Malice. The ability probes used a simulated board host. The real board callback paths were checked in source. No live multiplayer encounter was run for this audit. [Harness](../dnd/character_sheet/ability-automation/__tests__/support/automation-harness.mjs) · [PC host callbacks](../dnd/vtt/assets/js/ui/character-summary-panel.js#L3033) · [Maintenance host](../dnd/vtt/assets/js/ui/board-interactions.js#L4544)

## Appendices

The class feature interactions and optional character-creation cards below are preserved for implementation planning. They are outside the 56-card readiness count.

## Features that change how those 56 cards resolve

A feature can work through a native derived statistic, a resource rule, a modifier, a trigger listener or a board effect. Giving it an empty action button would miss the point. The exporter currently reduces ordinary features to display fields, so a new feature recipe also needs a path to the VTT's modifier/passive registration. Attach a fresh listener once per owning actor, including after reload or control changes.

| Feature or grant | Current evidence and planned behavior |
|---|---|
| Elemental specialization and advancement | The builder already controls known signatures, heroic pools, specialization grants, characteristics, skills and perks. Preserve legal substitution at levels 2, 6 and 9. Verify Reason-derived potency thresholds at each increase. The seven primal elements in the lore do not constitute seven selectable specializations. |
| Acolyte of Earth / Fire / the Green / the Mystery | Earth needs a stacking +1 stability on each Earth **and** Magic use, expiring at next caster turn start. Promote the saved Fire modifier with the exact Fire+Magic rolled-damage selector and the separate Hurl/chosen-fire exception. An unrelated spell dealing fire must not match that exception. Green needs a once-per-damaging-ability offer of Reason temporary Stamina to self or one creature within ten for a Green+Magic essence-costing use. Void's +2 Magic+Ranged+Void distance is already reflected in builder output. Verify it in the actual picker as well. |
| Enchantment of Battle / Celerity / Destruction / Distance / Permanence | Preserve native stat grants and the builder’s existing light-gear choices. Verify Battle’s light armor and light weapon conditions, +3 Stamina per echelon, +1 weapon damage including free strikes, treasure access and no-kit restriction. Celerity gives +1 speed and Disengage shift. Destruction is +1 rolled magic damage. Distance is +2 ranged magic distance. Permanence gives +6 Stamina per echelon and +1 stability. Give display, targeting and actual rolls a common source for these values. Test changing enchantment and ward during a respite on a disposable hero. |
| Ward of Delightful Consequences / Ward of Excellent Protection | Add first damage to self per round → one surge, including with two attacking clients. Excellent Protection already offers a single damage-type choice that exports as immunity equal to Reason. Test the damage host against chosen and unchosen types at two Reason scores. The two active wards have readiness rows above. |
| Essence, Font of Essence, Surging Essence and Essential Being | Reuse the four exported combat rules. Start from Victories, gain 2/3/4 at turn start at levels 1/7/10, gain 1 (2 from level 4) on the first qualifying typed damage to self or a creature within ten in a round, and reset at encounter end. Exclude holy and untyped damage. Test a different round, reconnect, owner changes and interaction with the maintenance deduction. |
| Essence outside combat / Persistent Magic | Implement the once-per-costing-ability-or-effect lock until a Victory or respite, zero paid cast cost, unlimited spend valued at Victories and maintenance for up to Victories rounds. In combat, use the maintenance behavior described above. A resource counter alone cannot express either lifecycle. |
| It Is the Soul Which Hears / A Beyonding of Vision | Add the allowed-language and Reason-for-Presence test options for the relevant creature types, with feelings/sensations from a living noncreature plant resolved by the Director. Void recognition includes illusions, invisible creatures, supernatural concealment and the specifics of visible magic. Publish perception facts to eligible observers and reuse the same sense grant for Shared Void Sense. |
| Disciple of Earth / Disciple of Fire | Verify the native Earth Stamina bonus of +6 at level 2 and +3 per later level. Fire's native immunity is 5 + level. Add a source-scoped bypass for outgoing fire versus fire immunity, start-combat surges equal to Victories, and the option to make spent surge damage fire. Keep another caster's damage unaffected. |
| Disciple of the Green / Chimeric Manifestation | Build one level-gated form table. Apply and remove source-bound overrides together, use Reason on melee free strikes, allow equipment to meld or drop, remove form Stamina on exit and revert when dying. Normal change requires true form before entering another. At level 8, first change on a turn can be free, two forms' levels must total ≤12, choose size and overlapping benefits, keep highest speed and both movement modes. See the form checks below. |
| A Conversation With Fire / Distance Is Only Memory | Implement a fire conversation after one uninterrupted minute, with a willing recipient and maneuver dismissal by either participant. Also implement a respite-triggered two-way portal to a previously visited place. Respect the portal's one-hour lifetime and main-action dismissal. Record time and choices, and let the Director resolve off-scene destinations and participants. |
| Mantle of Essence / Mantle of Quintessence | Reuse one caster-following, toggleable aura of radius Reason. At level 4 it requires ≥3 essence and a non-dying caster. Earth offers end-turn pushes up to Reason, Fire deals Reason fire to enemies, Green grants Reason temporary Stamina to allies, Void grants concealment to caster/allies. The saved Burning Grounds aura is a starting point. Gate it by the class feature, and source any fire-immunity bypass from Disciple of Fire. At level 7 remove the essence gate and add +1 starting patience (cap 5) and the Handle Animals edge, increasing to +2/double edge at ≥5 Victories. |
| Hide of Tenfold Shields / Smoldering Step / Pierce the Veil of Substance | Green adds level temporary Stamina to the form's grant on entering in combat and lets an adjacent ally pet as a maneuver to transfer a chosen amount. Fire can spend one square of movement between sufficiently large fires within ten, and deals Reason fire to adjacent enemies on using a Fire ability or being targeted by a fire-damaging ability. Void sees and traces effect through one mundane barrier at most one square thick, and offers self or an ally in range a Reason teleport on using a Void ability. |
| Wyrding / Grand Wyrding | Provide six choices with their own limits: create a mundane object, shelter twenty for 24 hours, repair an object, alter nearby terrain, preserve/rot food or a corpse, or create a private filtered sensor seal that replaces the caster's prior seal. Use a Director prompt for fiction and object properties. The base activity takes ten uninterrupted minutes. Grand Wyrding allows a main action and at ≥5 Victories grants immunity all to one chosen elemental damage type. |
| Black Hole Star / The Flame Primordial | Void end-turn vertical pull up to five uses Hurl range, has a minimum pull of two if reduced by stability, and ignores allied stability. Its mantle reduces enemy and object stability by level. Fire adds 1d6 extra fire on dealing fire damage, offers Return to Formlessness instead against mundane objects, and gives an adjacent enemy starting its turn fire weakness equal to Reason (twice Reason if mostly metal). Prevent extra damage from recursively triggering itself. |
| Breath, One and the four Masters | Respite grants persistent breath equal to XP gained. Allow voluntary conversion of one breath to three essence. **Earth** grants immunity 5 and a Director-resolved one-mile landscape change, with the concurrent-user restriction and ten-day lockout. **Fire** replaces the Acolyte bonus with +5 on all magic, extends Return to Formlessness to supernatural non-artifacts, and grants breath equal to a melted treasure's echelon. **Green** grants two additional Recoveries, including allies finishing the respite with you until their next respite, and 1d6 Life Fruit as a respite activity. Eating or feeding one to a willing adjacent ally restores all Stamina and offers clearing all effects, standing and the nonstacking aging benefit. **Void** can replace willing movement with teleportation and automatically completes a research project on its respite project roll without sources. |
| Source of Earth companion | Reuse the published level-8 Brute block, including 45 Stamina. Author Boulder Bash with melee 2 or ranged 10, tier damage 5/9/12 and push 3/4/5. Earthwalk filters terrain by earth/stone, Tunnler leaves a size-2 tunnel and Earth Harness grants eligible heroes free use of Earth Accepts Me on it. Test dismissal during a meld. These belong to the summon. |

**Green form acceptance cases.** Use the [printed form table](../dnd/ai-reference/source/rules-v1.01b/classes/elementalist.md#L601) for every numeric row, including size, movement, stability, temporary Stamina and all three free-strike modifiers.

| Earliest level | Forms and individual rule to exercise |
|---|---|
| 2 | **Canine** and **Rodent** grant smell edges, with different statistics and climbing on Rodent. **Fish** is swim-only and cannot breathe out of water. |
| 3 | **Bird** grants flight. **Great cat** can jump as a maneuver and on a qualifying landing knock prone and make a free strike. |
| 4 | **Giant frog** has melee-3 free strike and the Advance jump. **Horse** permits maneuver Charge with its once-on-the-turn restriction. **Mohler** burrows and increases melee distance. |
| 5 | **Bear** increases melee distance with its own statistics. **Giant bird** may shift after a melee free strike. |
| 6 | **Giant salamander** changes melee free-strike damage to fire and grants fire immunity 3. **Giant spider** gains a double edge on melee free strikes against creatures from which it is hidden. |
| 7 | **Giant snake** grabs on qualifying melee free-strike tiers and damages grabbed creatures at their turn start. **Kangaroo** has an Advance jump and critical-hit daze. **Spiny armadillo** retaliates against adjacent melee damage. |
| 8 | **Ostrich** moves without provoking opportunity attacks. **Shark** has aquatic breathing restrictions and an edge against bleeding or winded targets. |
| 9 | **Giant octopus** can target two with a melee free strike, grab on qualifying tiers and hold up to eight. **Rhinoceros** gets an edge on a melee free strike made as part of Charge. |
| 10 | **King terror lizard** converts the melee free strike to a one-burst with Area and Strike. Test a form exit after selecting the modified free strike. |

## Optional cards an Elementalist can acquire

The builder has 19 ancestry, seven perk and eleven complication **GrantAbility** records. These are choices across possible builds. Careers, cultures, environments, organizations, upbringings and items in this catalog contribute no additional GrantAbility records. General combat actions, textual traits and rewards earned in play are different sources. The class work above covers the way the Elementalist calls them, including exceptional free strikes, movement, Defend, Knockback and Catch Breath. Use the common action implementation for these calls. Keep optional grants on their originating records so other classes inherit the same fixes.

| Source | Card | Recipe or shared hook needed |
|---|---|---|
| Ancestry | Glowing Eyes | Bind the damaging creature from the triggering hit and deal 1d10 + level psychic damage back to it. |
| Ancestry | Draconian Guard | Reduce incoming strike damage by level on self or an adjacent creature before resolving damage consequences. |
| Ancestry | Remember your Oath | Set the user's saving-throw success threshold to 4 until their next turn starts. |
| Ancestry | Draconic Pride | Apply burst damage and the push only on the tiers that grant it. |
| Ancestry | Dragon Breath | Use the 3-cube within one, Might/Presence roll and six allowed damage types. Pass the chosen type through the damage event. |
| Ancestry | The Wode Defends | Use Might/Agility to roll, then check target Agility against the tier for slowed or restrained, save ends. |
| Ancestry | Glamor of Terror | Bind the damage source and frighten it of this actor until the end of its next turn. |
| Ancestry | Detect the Supernatural | Privately reveal the eligible object/creature facts within five through obstacles, with the stated expiry. |
| Ancestry | Resist the Unnatural | Reuse the saved typed-damage reaction. Test untyped exclusion and true halving before secondary consequences. |
| Ancestry | Determination | Offer exactly one current frightened, slowed or weakened condition to end on self. |
| Ancestry | Keeper of Order | On own/adjacent power roll optionally remove one edge or bane before resolution, once per round. |
| Ancestry | Shadowmeld | The saved entry includes manual resolution. Model attached surface, observer-relative hidden state, movement/action restrictions and exit. Destroying the surface causes one irreducible 1d6. |
| Ancestry | Reactive Tumble | Reuse the saved free reaction and bind shift one to completion of the actual forced movement. |
| Ancestry | Detonate Sigil | Target the caster's sigil-bearing creature, roll damage and slide, then consume the corresponding sigil. |
| Ancestry | Beyondsight | Toggle sight through qualifying mundane obstructions and enforce the adjacent blind/line-of-effect restriction until reverted. |
| Ancestry | Foresight | Bind a pending strike targeting the owner and impose a bane on its power roll. |
| Ancestry | Concussive Slam | Encode roll characteristic choice, damage and the tier-specific push and Might/prone riders. |
| Ancestry | Psionic Bolt | Apply psychic damage and slide at the chosen characteristic and rolled tier. |
| Ancestry | Minor Acceleration | Choose Reason/Intuition/Presence and grant that speed bonus to self or the chosen ally until caster turn start. |
| Perk | Friend Catapult | Check size, willingness and adjacency. Vertical push up to twice Might, reduce the resulting effective fall by that amount, and refresh on a Victory. |
| Perk | I've Got You | Offer a free catch on a willing ally's qualifying landing and suppress fall damage for both actors. |
| Perk | Gum Up The Works | On a mundane trap activating within three, allow the move and jam it if adjacent. Release when adjacency ends or disarming fails. |
| Perk | Arcane Trick | Expose the seven bounded effects as choices. Execute movement, lighting or timed overlays where the scene models them. Send taste, odor, inscriptions and fictional details to the Director as needed. |
| Perk | Creature Sense | Privately return keywords for the selected creature only if it is within ten and at or below the caster's level. |
| Perk | Invisible Force | Choose the characteristic for movement and validate the unattended object's size or eligible movable part. Let the Director resolve manipulation of mechanisms. |
| Perk | Psychic Whisper | Privately send the short message to the chosen ally within ten who understands a language. Preserve the recipient's option to ignore it. |
| Complication | Advanced Study Benefit and Drawback | Respite roll. Resolve a level-eligible hostile summon acting first, no benefit, or a qualifying temporary known class heroic until next respite. |
| Complication | Corrupted Spirit | Until end of turn, optionally add highest-characteristic corruption damage only to a damaging heroic used against a single target. |
| Complication | Share Head | Grant senses and speech through the willing target. Release on replacement, lost consent or separation beyond ten. |
| Complication | Contact Spirits | Apply the conditional roll modifier for nearby friendly/hostile deaths in the last day. Resolve backlash or the tier's number of Director-answered questions. Refresh on a Victory. |
| Complication | Stone Eyes | Check whether the creature can see and is looking, apply damage and Might potency/slow, and petrify only when this ability reduces it to zero. |
| Complication | Psychic Blast | Capture and spend the entire current heroic pool once, then calculate tier damage from that captured value and the tier's cap. |
| Complication | Telekinetic Grasp | Choose push or pull at the rolled distance. Expose its ranged free-strike alias as well as its maneuver. |
| Complication | Issue Order | Let the target use their reaction to choose and perform a main action, maneuver or move. Support the Strike Now exception when the acting hero has it. A chat-only grant cannot complete the action. |
| Complication | Waking Dreams | Respite Reason test. Deduct one Recovery on tier 1, or ask the Director for the short/extended vision on tiers 2/3. |
| Complication | Posthumous Retirement | Deal 5 + level fire damage to each enemy in the burst. Require the one-minute out-of-combat collar reset before reuse. |
| Complication | Rogue Wave | Choose to forgo damage independently of choosing push or pull. Use the rolled tier for both amounts. |

Two textual complications also change access to existing class recipes. **Following in the Footsteps** modifies the cost of two designated known/future abilities. **Getting Too Old for This** can temporarily use a qualifying ability one level ahead, with its cost and a two-Victory recharge. Store the source and limits of these exceptions on the actor. Do not add every higher-level ability to the hero's permanent known list. Combat actions granted in prose, such as a free strike from **Gnoll-Mauled**, should delegate to the same action registry.

Sources for optional grants and shared action rules: [Ancestries](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-03-ancestries.md) · [Perks](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-07-perks.md) · [Complications](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-08-complications.md) · [Combat](../dnd/ai-reference/source/rules-v1.01b/chapters/chapter-10-combat.md) · [Saved ancestry examples](../dnd/ai-reference/characters/pippa-automations.md) · [Saved defensive reaction](../dnd/ai-reference/characters/indigo-automations.md).
