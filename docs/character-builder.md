# Table character builder

A finished hero can be kept under **S → My Characters**. Choose **Save to My Characters** on Review to save a read-only snapshot to the signed-in account. Saving the same finished sheet again opens the existing copy. The browser draft and JSON download are still available.

**Send to GM’s PCs** makes that snapshot visible to the GM under **Heroes → Submitted PCs** and **Players & roster → View submitted PCs**. Submissions are available to inspect or download. The library uses its own SQLite file under `dnd/data/.my-characters/` and has no write path to campaign sheets, player accounts, inventory, or the map.

## Implementation plan

1. Open Character builder inside the Table's S menu for either role. Keep the existing Diablo typography, parchment lettering, brass controls, and dark panels.
2. Choose the class and intended level up front. Offer Censor, Conduit, Elementalist, Fury, Null, Shadow, Tactician, Talent, and Troubadour at levels 1–10. Ancestry, including Polder, is chosen independently of class. Existing drafts without a class field open as Elementalists.
3. Choose ancestry and spend its trait points. Resolve any nested traits and a Revenant's former ancestry. Choose culture (environment, organization, upbringing and language), career, incident, and an optional complication. Offer the published background choices and record deliberate exceptions.
4. Pick one elemental specialization, assign the four non-Reason characteristics from a legal array, and resolve the class features earned at each level. Starting Reason is 2. Grant the specialization's own features. Shared Elementalist spells remain available across all four specializations. For Null, start Agility and Intuition at 2, assign a three-score array, and choose one augmentation. Grant shared Null choices at levels 1, 3, 5 and 8. At levels 2, 6 and 9, grant one of the two abilities from the chosen tradition. Each slot enforces its cost, count, level and uniqueness.
5. Resolve skills and languages after their sources are known. Show the whole list for flexible choices. Mark out-of-pool choices, require an explicit house-rule confirmation, and keep the reason on review. A duplicate specifically granted skill earns a legal replacement from any group.
6. Derive vitals, potency, grants, abilities, features and background from the current choices. Recompute on edits, ignore choices belonging to a former branch, and check every required slot before finishing. Offer a standalone JSON download in the native sheet format. Keep unfinished choices as an account-scoped browser draft. The builder has no sheet selector and never loads or writes a player sheet.
7. Verify all three Censor orders, all 66 Conduit domain pairs, all four elemental specializations, all three Fury aspects, all three Null traditions, all three Shadow colleges, all three Tactician doctrines, and all three Talent traditions, ancestry point budgets, every ability tier, skill exceptions, changes of earlier selections, and native-format exports. Exercise the S menu, resume, review and download using disposable player and Director sessions. Verify no sheet-handler calls occur.

## Censor

Choose an order (Exorcist, Oracle, or Paragon), assign Might and Presence at 2 and the remaining three scores from a legal array, then choose a deity, one domain from its portfolio, and a kit. The 38 published gods and saints use their chapter 14 portfolios. The custom-deity option requires a name and four distinct domains approved by the Director.

At level 1, select one class signature, one 3-Wrath ability and one 5-Wrath ability. The kit grants its own signature. The shared 7-, 9-, and 11-Wrath choices unlock at levels 3, 5, and 8. The order offers one of its own two abilities at each of levels 2, 6, and 9. The chosen domain grants features at levels 1, 4, and 7. Level 10 adds Templar and the rules for temporarily accessing other domains with Virtue.

The downloaded sheet includes its equipment, kit-adjusted vitals and attacks, the active order’s Judgment benefit, and Wrath tracking. When the kit gives different melee and ranged damage bonuses, a dual-range attack has a separate roll for each. Kit signatures use the values printed on their cards. Optional or situational play effects, including respite blessings, are described on the sheet.

## Conduit

Choose a god or saint, then two distinct domains from that portfolio. Each grants its own Piety trigger and prayer effect. At levels 1, 4, and 7 choose which domain feature to learn first. At levels 2, 5, and 8 the other domain grants the corresponding feature. The two level-1 features each supply one skill when learned. At levels 2, 6, and 9 choose one domain ability from the two offered. Each of these three choices is independent of the previous feature or ability selections.

The level-1 build includes Healing Grace, Ray of Wrath, one triggered action, one prayer, one ward, two different signatures, one 3-Piety ability, and one 5-Piety ability. Shared 7-, 9-, and 11-Piety abilities unlock at levels 3, 5, and 8. At level 6 select Burgeoning Saint’s holy or corruption immunity. At level 10 Avatar allows one to three different prayers. Divine Power’s permission to use other Conduit abilities during play is recorded on the sheet.

The export provides a Piety die at turn start, an encounter reset, and event-based gain prompts for Creation, Knowledge, Nature, Storm, and Sun. Each chosen domain can grant Piety once per encounter. Use the Piety feature to resolve an optional prayer on the original die result. The other seven domains’ triggers and all prayer effects are resolved at the table. Only the hero’s selected domains appear in its domain rules.

## Fury

Choose Berserker, Reaver, or Stormwight. Might and Agility start at 2. All Furies learn Nature and choose two exploration or intrigue skills. The aspect grants Lift, Hide, or Track, respectively, and its own triggered action. Start with one class signature and one ability each costing 3 and 5 Ferocity. At levels 3, 5, and 8 choose a shared 7-, 9-, and 11-Ferocity ability, respectively. At levels 2, 6, and 9 choose one of the two abilities specific to your aspect.

Berserkers and Reavers choose a standard kit. Stormwights choose Boren (bear, cold), Corven (crow, fire), Raden (rat, corruption), or Vuken (wolf, lightning). The active kit supplies its signature, bonuses, and Growing Ferocity benefits. The Stormwight’s kit also determines its elemental immunity from level 7. Changing kits updates the affected cards and vitals. At level 8 Menagerie lets a Stormwight swap to another kit during a respite.

The downloaded sheet starts in true form. Aspect of the Wild describes the active kit’s animal and hybrid forms, including any movement or ability restrictions. Resolve form changes during play. Ferocity tracking uses Victories at combat start, a die at the start of the Fury’s turn, the first damage taken each round, and one shared gain the first time the Fury becomes winded or is dying in the encounter. Growing Ferocity benefits appear at the levels that unlock them.

## Shadow

Choose the College of Black Ash, the College of Caustic Alchemy, or the College of the Harlequin Mask, then choose a standard kit. Every Shadow starts with Agility 2, Hide, and Sneak. The college grants Magic, Alchemy, or Lie, respectively. Choose five more skills from exploration, interpersonal, intrigue, or the specific lore skill Criminal Underworld. The level-2 perk comes from exploration, interpersonal, or intrigue. Later perk choices can come from any group.

Each college grants its own starting maneuver and triggered action. All Shadows also gain Hesitation Is Weakness, a kit signature, and one class ability from each starting pool (signature, 3 Insight, and 5 Insight). The shared 7-, 9-, and 11-Insight choices unlock at levels 3, 5, and 8. At levels 2, 6, and 9 choose one of the two abilities offered by the selected college.

The export tracks Insight from Victories, turn starts, and the first damage each round that incorporates a surge. A qualifying heroic power roll with an edge or double edge refunds 1 Insight through the sheet’s edge-discount setting. At level 9 a player can decline the turn-start gain to use Gloom Squad. Careful Observation’s target count rises from one to two at level 7 and to three at level 10. Umbral Form, Gloom Squad, and Subterfuge include their rules for use during play.

## Tactician

Choose Insurgent, Mastermind, or Vanguard. Might and Reason start at 2. All Tacticians train in Lead and choose two skills from the class list. The doctrine grants another skill from intrigue, lore, or interpersonal, respectively, and a triggered action. Start with Mark, Strike Now!, one 3-Focus ability, and one 5-Focus ability. Shared 7-, 9-, and 11-Focus abilities unlock at levels 3, 5, and 8. At levels 2, 6, and 9 choose one of the two abilities offered by your doctrine.

Field Arsenal grants two distinct standard kits and both of their signatures. Select one bonus for each benefit where both kits offer different values. Each three-tier damage bonus is a single choice. Both signatures replace their printed kit bonuses with the selected ones, including melee and ranged distance. The downloaded sheet shows both kit names, their equipment, and the effective bonuses. Improved Field Arsenal, Master of Arms, and Grandmaster of Arms appear on the signature and weapon free-strike cards as they are earned.

The export tracks Focus at combat start, turn start, and combat end. During play, track Tactician marks and the two independent once-per-round Focus gains on the sheet. One comes from damage to a creature you marked, the other from a nearby ally using a heroic ability. Mark lists the benefits earned from the selected doctrine. A level-5 Mastermind can target two creatures with Mark.

## Talent

Choose Chronopathy, Telekinesis, or Telepathy. Reason and Presence start at 2. All Talents know Mindspeech, train in Psionics and Read Person, and choose two more interpersonal or lore skills. Choose one of five psionic augmentations and one of four wards. Battle Augmentation asks which light gear the Talent is using so its Stamina and weapon damage bonuses apply independently.

Each Talent learns Mind Spike, which also appears as a ranged free strike, and its tradition’s starting maneuver and triggered action. Choose two distinct shared signatures, one 3-Clarity ability, and one 5-Clarity ability. Shared powers are available regardless of their tradition keywords. At levels 3, 5, and 8 the shared 7-, 9-, and 11-Clarity pools unlock. At levels 2, 6, and 9 choose one of the two abilities exclusive to the selected tradition.

The export sets starting Clarity from Victories, grants Clarity at turn start and for the first forced movement each round, and resets Clarity when combat ends. The native sheet allows spending down to −(1 + Reason). Ending a turn with negative Clarity deals damage equal to the deficit. At level 10, Psion lets the player decline that damage. Ability cards describe their own strained effects. Resolve those effects and optional uses of Psi Boost, Cascading Strain, Ancestral Memory, and Vision during play.

## Troubadour

Choose Auteur, Duelist, or Virtuoso, one standard kit, and one Troubadour signature. The kit also grants its own signature. Agility and Presence start at 2. Read Person and the class act’s skill are automatic. Choose two more interpersonal skills and one intrigue or lore skill.

All three acts learn Choreography and Revitalizing Limerick. The act supplies its own starting features and triggered action. Select an invocation at level 2, one of the act’s two features at level 5, and one of its two heroic abilities at each of levels 2, 6, and 9. The shared 3- and 5-Drama abilities are available at level 1, followed by 7, 9, and 11 at levels 3, 5, and 8.

At level 4, make two Melodrama selections in order. Each selection adds an event or increases the Drama from a known event by 1. The second can improve the first. At level 8, a Duelist can name an owned signature as their Masterwork. A named kit signature stays on the sheet after switching kits and uses the equipped kit’s bonuses. At level 10, Dramaturgy extends all performances to targets on the encounter map within line of effect.

The sheet starts Drama at Victories, offers the turn-start roll, and resets Drama at combat end. The resource panel lists the event gains for this build. Resolve those events, Appeal to the Muses, active performances, resurrection, and Applause during play.

## Sources

The local rules are the authority for game mechanics. See Draw Steel Heroes v1.01b chapters 2–10 and 14, especially printed pages 78–93 for Censor, 94–111 for Conduit, 113–129 for Elementalist, 130–145 for Fury, 147–159 for Null, 160–173 for Shadow, 174–185 for Tactician, 186–201 for Talent, 202–216 for Troubadour, 217–226 for kits and 355 for deity portfolios. The class's advancement table distinguishes common ability selections from features granted by elemental specialization.

Forge Steel supplies a reference for the sections of a hero, point-cost choices, source-specific grants, and level-dependent class choices. The catalog notice records the exact source revision. [Hero editor](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/components/pages/heroes/hero-edit) · [Elementalist data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/elementalist) · [Censor data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/censor) · [Conduit data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/conduit) · [Fury data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/fury) · [Null data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/null) · [Shadow data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/shadow) · [Tactician data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/tactician) · [Talent data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/talent) · [Troubadour data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/troubadour)

D&D Beyond also separates class features, background, species, and ability scores, with conditional choices inside each section. [Builder sections](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747202748436-Builder-Sections)
