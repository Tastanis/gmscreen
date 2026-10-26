# Monster Upload Files (for AIs)

How to write a `.json` file the Director uploads with **Upload Monsters** in the Monster Creator.
The upload previews every monster (NEW / UPDATE / BLOCKED, target tab, errors, warnings), then
**Import** saves straight into the tabs. No editor step.

- Monster fields (stats, abilities, tiers, automation): `../../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`. This guide covers only the file around them.
- Automation JSON: `../../character_sheet/ability-automation/AUTHORING.md` and `REGISTRY.md`.
- Code: `../../strixhaven/monster-creator/import-monsters.php`, `includes/monster-import.php` (matching, tabs, checks), `js/monster-json-import-normalize.js` (file shapes, required stats).

## File shapes

Any of these:

| Shape | Example |
|---|---|
| One monster | `{ "name": "...", ... }` |
| Wrapped | `{ "monster": { ... } }` |
| List | `[ { ... }, { ... } ]` |
| Package | `{ "tab": "Gravity Orchard", "subTab": "Foes", "monsters": [ { ... }, { ... } ] }` |

Per monster, optional: `"id"`, `"tab"`, `"subTab"`, `"imageUrl"`.

- Where a monster goes: its own `tab` (+ its own `subTab`) → else the package `tab` (+ the monster's `subTab`, else the package `subTab`) → else the tab the Director picks in the preview.
- Tabs and sub-tabs are found by name (capitals ignored) or id. An upload **never makes tabs** (Brandon, October 2026): a named tab or sub-tab that does not exist blocks that monster with "No tab named ..." / "No sub-tab named ...". The Director makes tabs on the Monster Creator page.
- A named tab with several sub-tabs and no `subTab` given → blocked (say which). A tab with no sub-tabs → blocked (make one on the page first).
- Pasting a list or package into **Import JSON** opens the same upload preview.

## Matching: new or update

1. `"id"` equals an existing monster's id → **UPDATE** that monster. Use this whenever you update.
2. Else same name (capitals/extra spaces ignored) **and** same level inside the target tab (any of its sub-tabs) → **UPDATE**. Two such monsters → blocked: add `"id"`.
3. Else **NEW**, with `"id"` if given and free (letters, digits, `_`, `-`), else `monster_<name>`.

- An update keeps the monster's id, created time and picture (unless the file supplies a picture). It stays in its sub-tab unless the file names another tab/sub-tab (then it moves; the preview says from where).
- A NEW monster whose name already exists elsewhere is allowed, with a warning naming the existing one's id.
- The same monster twice in one file → the second is blocked.
- The preview shows each update's id. Re-uploading the same file updates, never duplicates.

## Pictures

- Upload picture files (PNG, JPEG, GIF, WebP, under 5 MB) together with the `.json`. A picture is used when its file name (ignoring case, `-`/`_`/spaces) matches the monster's `id`, its `name`, or — for a one-monster file — the JSON file's name. Example: `radenwight-grand-meddle.json` + `radenwight-grand-meddle.png`.
- Or `"imageUrl"`: the file name of a picture already uploaded in the Monster Creator (`monster_<id>_<time>.png`, or its `/dnd/strixhaven/monster-creator/images/...` address). Anything else → warning, no picture.

## Checks

**Errors (the monster is blocked, the rest still import):**

- A required stat left out or not a number: `name`, `level`, `role`, `types`, `ev`, `size`, `speed`, `stamina`, `stability`, `free_strike`, and all five `attributes` (`might`, `agility`, `reason`, `intuition`, `presence`). `0` and negatives are fine.
- An ability with no displayed rules text (`effect`, the `test` tiers, `additional_effect`, `trigger`), including rules that are only in `automation`.
- A trait with no `text`.
- No tab to put it in; a tab with several sub-tabs and none named; two monsters it could update; the same monster twice in the file; a monster the importer cannot read (no `name`).

**Warnings (allowed, shown):**

- Every ability-automation schema warning.
- `roll_bonus` ≠ the automation `powerRoll` `flatBonus`.
- A tier whose automation has a push/pull/slide, condition, potency, teleport or swap but whose displayed tier has no `tier_effect`/`attribute_effect`.
- `has_test` with an empty tier table; a triggered action with no `trigger`.
- Level below 1, stamina 0, size not like `1M`/`1S`/`2`.
- No abilities or traits; a rename on update; an unused `id` or `imageUrl`; another monster already has the name.

## Minimal complete example

```json
{
  "id": "cinder_whelp",
  "name": "Cinder Whelp",
  "level": 2,
  "role": "Harrier",
  "types": "Elemental, Fire",
  "ev": 8,
  "size": "1S",
  "speed": 7,
  "stamina": 30,
  "stability": 0,
  "free_strike": 3,
  "attributes": { "might": 0, "agility": 2, "reason": -1, "intuition": 1, "presence": 0 },
  "traits": [
    { "name": "Ember Body", "text": "A creature that touches the whelp takes 1 fire damage." }
  ],
  "abilities": {
    "action": [
      {
        "name": "Scorching Nip",
        "keywords": "Melee, Strike, Weapon",
        "range": "Melee 1",
        "targets": "1 creature",
        "roll_bonus": 2,
        "effect": "The whelp snaps with glowing teeth.",
        "has_test": true,
        "test": {
          "tier1": { "damage_amount": "3", "damage_type": "fire", "tier_effect": "" },
          "tier2": { "damage_amount": "5", "damage_type": "fire", "tier_effect": "" },
          "tier3": { "damage_amount": "7", "damage_type": "fire", "tier_effect": "" }
        },
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            { "type": "target", "name": "primary", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 1 } },
            { "type": "powerRoll", "flatBonus": 2, "tiers": {
              "tier1": { "effects": [{ "kind": "damage", "amount": 3, "damageType": "fire" }] },
              "tier2": { "effects": [{ "kind": "damage", "amount": 5, "damageType": "fire" }] },
              "tier3": { "effects": [{ "kind": "damage", "amount": 7, "damageType": "fire" }] }
            } }
          ]
        }
      }
    ]
  }
}
```

## Package example

Puts both in tab "Gravity Orchard" / "Foes" (both must already exist; otherwise "No tab named ..."). The first updates the existing
monster with id `orchard_warden`; if no monster has that id it is created with it.

```json
{
  "tab": "Gravity Orchard",
  "subTab": "Foes",
  "monsters": [
    {
      "id": "orchard_warden",
      "name": "Orchard Warden",
      "level": 3,
      "role": "Elite Defender",
      "types": "Plant",
      "ev": 20,
      "size": "2",
      "speed": 5,
      "stamina": 80,
      "stability": 2,
      "free_strike": 4,
      "attributes": { "might": 2, "agility": 0, "reason": -1, "intuition": 1, "presence": 0 },
      "traits": [{ "name": "Rooted", "text": "The warden can't be knocked prone." }],
      "abilities": {
        "maneuver": [
          { "name": "Bark Shield", "keywords": "-", "range": "Self", "targets": "Self", "effect": "The warden gains 5 temporary Stamina." }
        ]
      }
    },
    {
      "name": "Windfall Sprite",
      "level": 3,
      "role": "Minion Artillery",
      "types": "Fey",
      "ev": 3,
      "size": "1T",
      "speed": 6,
      "stamina": 5,
      "stability": 0,
      "free_strike": 2,
      "with_captain": "Gain an edge on strikes",
      "attributes": { "might": -2, "agility": 2, "reason": 0, "intuition": 1, "presence": 0 },
      "abilities": {
        "action": [
          { "name": "Falling Fruit", "keywords": "Ranged, Strike", "range": "Ranged 5", "targets": "1 creature", "effect": "The target takes 2 damage." }
        ]
      }
    }
  ]
}
```

## Checklist before handing a file over

1. Valid JSON; one of the four shapes above.
2. Every monster: all ten stats and all five attributes, explicit numbers.
3. Every ability: its full rules in the displayed fields; tier damage/riders in `test.tier1-3`; `roll_bonus` = automation `flatBonus`; triggered actions have `trigger`. Automation only copies the displayed text.
4. Automation follows AUTHORING.md/REGISTRY.md (v3, `"schema": "ability-automation/v3"`); no invented fields.
5. Updating an existing monster: put its `id` (from the Director or a previous preview). New monster: a fresh, readable `id` is recommended.
6. Tab/sub-tab names spelled as they are in the Monster Creator (capitals ignored); a name that is not there blocks the monster.
7. Pictures: file named like the `id` or the monster, or `imageUrl` of an already-uploaded picture.
8. Tell the Director: the file name, how many monsters, which are updates (by id), and the tab/sub-tab each goes in.
