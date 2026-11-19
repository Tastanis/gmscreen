# Table character builder

## Implementation plan

1. Open Character builder inside the Table's S menu for either role. Keep the existing Diablo typography, parchment lettering, brass controls, and dark panels.
2. Choose the class and intended level up front. Offer Censor, Conduit, Elementalist, Fury, Null, and Shadow at levels 1–10. Ancestry, including Polder, is chosen independently of class. Existing drafts without a class field open as Elementalists.
3. Choose ancestry and spend its trait points. Resolve any nested traits and a Revenant's former ancestry. Choose culture (environment, organization, upbringing and language), career, incident, and an optional complication. Offer the published background choices and record deliberate exceptions.
4. Pick one elemental specialization, assign the four non-Reason characteristics from a legal array, and resolve the class features earned at each level. Starting Reason is 2. Grant the specialization's own features. Shared Elementalist spells remain available across all four specializations. For Null, start Agility and Intuition at 2, assign a three-score array, and choose one augmentation. Grant shared Null choices at levels 1, 3, 5 and 8. At levels 2, 6 and 9, grant one of the two abilities from the chosen tradition. Each slot enforces its cost, count, level and uniqueness.
5. Resolve skills and languages after their sources are known. Show the whole list for flexible choices. Mark out-of-pool choices, require an explicit house-rule confirmation, and keep the reason on review. A duplicate specifically granted skill earns a legal replacement from any group.
6. Derive vitals, potency, grants, abilities, features and background from the current choices. Recompute on edits, ignore choices belonging to a former branch, and check every required slot before finishing. Offer a standalone JSON download in the native sheet format. Keep unfinished choices as an account-scoped browser draft. The builder has no sheet selector and never loads or writes a player sheet.
7. Verify all three Censor orders, all 66 Conduit domain pairs, all four elemental specializations, all three Fury aspects, all three Null traditions, and all three Shadow colleges, ancestry point budgets, every ability tier, skill exceptions, changes of earlier selections, and native-format exports. Exercise the S menu, resume, review and download using disposable player and Director sessions. Verify no sheet-handler calls occur.

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

## Sources

The local rules are the authority for game mechanics. See Draw Steel Heroes v1.01b chapters 2–10 and 14, especially printed pages 78–93 for Censor, 94–111 for Conduit, 113–129 for Elementalist, 130–145 for Fury, 147–159 for Null, 160–173 for Shadow, 217–226 for kits and 355 for deity portfolios. The class's advancement table distinguishes common ability selections from features granted by elemental specialization.

Forge Steel supplies a reference for the sections of a hero, point-cost choices, source-specific grants, and level-dependent class choices. The catalog notice records the exact source revision. [Hero editor](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/components/pages/heroes/hero-edit) · [Elementalist data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/elementalist) · [Censor data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/censor) · [Conduit data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/conduit) · [Fury data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/fury) · [Null data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/null) · [Shadow data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/shadow)

D&D Beyond also separates class features, background, species, and ability scores, with conditional choices inside each section. [Builder sections](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747202748436-Builder-Sections)
