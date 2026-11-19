# Table character builder

## Implementation plan

1. Open Character builder inside the Table's S menu for either role. Keep the existing Diablo typography, parchment lettering, brass controls, and dark panels.
2. Choose the class and intended level up front. Offer Elementalist and Null at levels 1–10. Ancestry, including Polder, is chosen independently of class. Existing drafts without a class field open as Elementalists.
3. Choose ancestry and spend its trait points. Resolve any nested traits and a Revenant's former ancestry. Choose culture (environment, organization, upbringing and language), career, incident, and an optional complication. Offer the published background choices and record deliberate exceptions.
4. Pick one elemental specialization, assign the four non-Reason characteristics from a legal array, and resolve the class features earned at each level. Starting Reason is 2. Grant the specialization's own features. Shared Elementalist spells remain available across all four specializations. For Null, start Agility and Intuition at 2, assign a three-score array, and choose one augmentation. Grant shared Null choices at levels 1, 3, 5 and 8. At levels 2, 6 and 9, grant one of the two abilities from the chosen tradition. Each slot enforces its cost, count, level and uniqueness.
5. Resolve skills and languages after their sources are known. Show the whole list for flexible choices. Mark out-of-pool choices, require an explicit house-rule confirmation, and keep the reason on review. A duplicate specifically granted skill earns a legal replacement from any group.
6. Derive vitals, potency, grants, abilities, features and background from the current choices. Recompute on edits, ignore choices belonging to a former branch, and check every required slot before finishing. Offer a standalone JSON download in the native sheet format. Keep unfinished choices as an account-scoped browser draft. The builder has no sheet selector and never loads or writes a player sheet.
7. Verify all four elemental specializations and three Null traditions, ancestry point budgets, every ability tier, skill exceptions, changes of earlier selections, and native-format exports. Exercise the S menu, resume, review and download using disposable player and Director sessions. Verify no sheet-handler calls occur.

## Sources

The local rules are the authority for game mechanics. See Draw Steel Heroes v1.01b chapters 2–5 and 7–10, especially printed pages 113–129 for Elementalist and 147–159 for Null. The class's advancement table distinguishes common ability selections from features granted by elemental specialization.

Forge Steel supplies a reference for the sections of a hero, point-cost choices, source-specific grants, and level-dependent class choices. The catalog notice records the exact source revision. [Hero editor](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/components/pages/heroes/hero-edit) · [Elementalist data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/elementalist) · [Null data](https://github.com/andyaiken/forgesteel/tree/01c962b262ac6419e5e261871ababab53c58f995/src/data/classes/null)

D&D Beyond also separates class features, background, species, and ability scores, with conditional choices inside each section. [Builder sections](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747202748436-Builder-Sections)
