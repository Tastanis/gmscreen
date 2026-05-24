# Monster Creator JSON Import Template

Use this format when creating a complete monster for the Strixhaven Monster Creator. The Import JSON button accepts either the object below directly or wrapped as `{ "monster": { ... } }`.

The import creates a new monster in editor mode. Review it, then use **Save to Tab**.

```json
{
  "id": "ember_hulk_optional_unique_id",
  "name": "Ember Hulk",
  "level": 5,
  "role": "Brute",
  "types": "Elemental, Fire",
  "ev": 24,
  "size": "2",
  "speed": 6,
  "movement": "climb 4",
  "stamina": 96,
  "stability": 2,
  "free_strike": 8,
  "immunities": [
    { "type": "fire", "value": 5 },
    { "type": "poison", "value": 3 }
  ],
  "weaknesses": [
    { "type": "cold", "value": 5 }
  ],
  "attributes": {
    "might": 3,
    "agility": 0,
    "reason": -1,
    "intuition": 1,
    "presence": 2
  },
  "traits": [
    {
      "name": "Molten Hide",
      "text": "An adjacent creature who deals melee damage to the hulk takes 3 fire damage."
    }
  ],
  "abilities": {
    "passive": [],
    "maneuver": [],
    "action": [
      {
        "name": "Cinder Maul",
        "keywords": "Melee, Weapon, Fire",
        "range": "Melee 2",
        "targets": "1 creature",
        "effect": "The hulk slams a burning fist into the target.",
        "has_test": true,
        "test": {
          "tier1": { "damage_amount": "5", "damage_type": "fire" },
          "tier2": { "damage_amount": "9", "damage_type": "fire" },
          "tier3": { "damage_amount": "13", "damage_type": "fire", "attribute": "might", "attribute_threshold": 2, "attribute_effect": "prone" }
        },
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            {
              "type": "target",
              "target": { "kind": "single", "range": 2, "within": "melee" }
            },
            {
              "type": "powerRoll",
              "flatBonus": 5,
              "tiers": {
                "tier1": { "effects": [{ "kind": "damage", "amount": 5, "damageType": "fire" }] },
                "tier2": { "effects": [{ "kind": "damage", "amount": 9, "damageType": "fire" }] },
                "tier3": { "effects": [{ "kind": "damage", "amount": 13, "damageType": "fire" }, { "kind": "condition", "name": "prone" }] }
              }
            }
          ]
        }
      }
    ],
    "triggered_action": [
      {
        "name": "Flare Back",
        "trigger": "A creature within 3 squares damages the hulk.",
        "keywords": "Fire",
        "range": "3",
        "targets": "Triggering creature",
        "effect": "The target takes 4 fire damage.",
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            {
              "type": "effect",
              "effects": [{ "kind": "damage", "amount": 4, "damageType": "fire" }]
            }
          ]
        }
      }
    ],
    "villain_action": [
      {
        "name": "The Floor Becomes Flame",
        "resource_cost": "3 Malice",
        "keywords": "Area, Fire",
        "range": "Burst 3",
        "targets": "Each enemy in the burst",
        "effect": "Each target takes 8 fire damage.",
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            {
              "type": "target",
              "target": { "kind": "area", "shape": "burst", "size": 3 }
            },
            {
              "type": "effect",
              "effects": [{ "kind": "damage", "amount": 8, "damageType": "fire" }]
            }
          ]
        }
      }
    ],
    "malice": []
  }
}
```

## Field Notes

- `abilities` categories: `passive`, `maneuver`, `action`, `triggered_action`, `villain_action`, `malice`.
- The importer also accepts common aliases such as `actions`, `triggeredActions`, and `villainActions`.
- For monster automation, use static numbers and `flatBonus`. Do not write PC-style `7 + M` formulas for monsters.
- `immunities` and `weaknesses` are arrays of `{ "type": "<damage type>", "value": <int> }` entries. Use one entry per damage type — e.g. an undead with "Immunity: corruption 1, poison 1" becomes two entries. Empty `type` matches any incoming damage type. The legacy single-field form (`immunity_type`/`immunity_value`/`weakness_type`/`weakness_value`) is still accepted for back-compat; the importer auto-promotes it to a one-entry array.
- The VTT automation damage adjuster sums **all matching entries** in the list. Multiple immunities/weaknesses against the same incoming damage type stack additively.
- To create a temporary weakness or immunity that automation damage does apply, use condition effects named `damageWeakness` or `damageImmunity`.
