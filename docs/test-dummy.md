# Test dummies (Build 632, November 17, 2026)

Brandon: a test button in the tokens; drag out any PC and get a copy that behaves exactly as the hero (rules,
resistances, abilities, automation) but never touches the hero's sheet or anything of the player's. Only the
Director sees it; it uses its own abilities; its Stamina starts full.

## Using it

Tokens panel → **Test dummy: on** → drag a hero from the PC's folder. The token is "Test · <name>", hidden from
the players, Stamina and Recoveries full, no surges, Heroic Resource and Victories as the hero has them now.
Select it: the side panel shows "Test · <hero>" with the dummy's numbers; its abilities and buttons work as the hero's.

## How it is kept apart

- The token carries `metadata.testDummy = {hero, resource, surges, recoveries, victories}` and no PC's-folder metadata.
- Every hero link the board writes through answers "no hero" for it (`getCharacterSheetProfileIdForPlacement`,
  folder/owned checks, `extractProfileIdFromPlacement`; server `SyncV2Store::linkedPlayerProfileForPlacement`;
  `map-levels.js resolvePlacementLinkedProfileId`). So it is never the player's token, never followed, never counted.
- Where a hero id goes (panel, abilities, automation) it goes by `dummy:<token id>`. `assets/js/ui/test-dummy.mjs`
  sits in front of the page's fetch (loaded first by `bootstrap.js`) and answers every sheet request carrying such an
  id on the page: reads from the hero's sheet (read only) with the dummy's own numbers in place; writes to the token.
  Stamina changes go through the board's own damage and healing. Writes it has no part in (sheet fields, respite,
  the party's hero tokens, sheet conditions) are refused. The sheet server refuses unknown character ids as well.
- Its conditions are its token's. Prompts of its triggers come to the Director.

Checked in a browser on a throwaway app: placing, a fire hit, Heroic Resource, a surge and a recovery from the
panel: no sheet request left the page and the sheet file stayed byte-for-byte the same; a normal hero token still
writes its sheet. Tests: `assets/js/ui/__tests__/test-dummy.test.mjs`.
