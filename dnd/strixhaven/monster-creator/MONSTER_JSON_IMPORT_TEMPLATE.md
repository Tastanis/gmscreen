# Monster Creator JSON Import Template

Use this format when creating a complete monster for the Strixhaven Monster Creator. The Import JSON button accepts either the object below directly or wrapped as `{ "monster": { ... } }`.

The import creates a new monster in editor mode. Review it, then use **Save to Tab**.

---

## ⚠️ Two non-negotiable requirements (read before anything else)

**1. Every ability's FULL rules text must appear in the displayed fields.** The GM reads the stat block and the ability hover card at the table — they can NEVER see the `automation` JSON. If a rider (a push, a condition, a potency line, an all-tiers effect) exists only inside `automation`, the displayed ability looks like it "just does damage" and the GM will run it wrong. So: every single thing the ability does must be written out in the display channels — `effect`, `test.tierN.damage_amount` / `tier_effect` / attribute-check fields, `additional_effect`, and `trigger` for triggered actions. `automation` is a *copy* of that text in executable form, never the only home of a mechanic. Before you finish, re-read each ability and confirm a GM who sees ONLY the displayed fields (never the automation) would run it exactly as intended.

**2. Every monster must have COMPLETE stats.** A monster with a missing Might score (or any other stat) is invalid. Always include ALL of the following, even when a value is 0:

- `name`, `level`, `role`, `types`, `ev`, `size`, `speed`, `stamina`, `stability`, `free_strike`
- `attributes` with **all five** keys: `might`, `agility`, `reason`, `intuition`, `presence` (use explicit numbers; `0` and negatives are fine, omission is not)

If the source material doesn't state a value, derive a sensible one from the monster's level and role — do not leave it out and do not leave it blank.

---

## Read this first: where each piece of an ability goes

Every ability has **three channels**, and each owns a different job. The #1 mistake LLMs make is dumping the whole ability into the prose `effect` field — restating the power-roll tiers as a sentence — and then *also* filling `test` and `automation`. That writes the tiers two or three times, the copies drift apart, and the structured stat block ends up missing the bits that only got typed into prose. Don't do that. Follow the ownership table:

| Channel | Field(s) | What it OWNS | What must NEVER go here |
|---|---|---|---|
| **Prose** | `effect` | Flavor / lead-in only ("The hulk slams a burning fist."). For abilities with **no** power roll, the full rules text. | The tier breakdown. Do not write "Tier 1: 5 damage. Tier 2: …" in `effect`. |
| **Structured power roll** | `roll_bonus` + `test.tier1/2/3` | The whole 2d10 roll: per-tier damage, per-tier rider text, per-tier potency check. This is what renders the tier table. | Flavor prose. |
| **All-tiers rider** | `additional_effect` | One effect that applies on every tier ("All tiers: the square becomes scree."), shown after the tier table. | Anything tier-specific. |
| **Automation** | `automation.cards` | The executable version the VTT runs. | — |

### Hard rules

1. **`effect` is flavor, not tiers.** If the ability has a power roll, the tier numbers live ONLY in `test.tierN`. `effect` is one sentence of flavor (or empty). Restating the tiers in prose is the bug we are fixing.
2. **Write every tier piece into `test`.** Each tier carries up to three things, and each has its own field — none should be dropped:
   - **damage** → `damage_amount` + `damage_type`
   - **a flat rider** ("pull 2 toward the cluster", "prone", "slide 3") → `tier_effect`
   - **a potency-gated effect** ("M<2 prone") → `has_attribute_check` + `attribute` + `attribute_threshold` + `attribute_effect`
3. **`roll_bonus` must equal the automation `flatBonus`.** They are the same number in two places (display vs. execution). Set both. If you set one and forget the other, the printed roll says "2d10+0" while the VTT rolls the real bonus.
4. **Before/after and all-tiers effects are their own thing.** A rider that happens regardless of tier goes in `additional_effect` (display) **and** as a separate `{ "type": "effect" }` card placed *before* or *after* the `powerRoll` card in automation (a precondition goes before, a consequence goes after). Do not fold it into the prose or into a tier.
5. **Keep the book's exact wording.** Put the source text verbatim into the field that owns it — `tier_effect` gets "pull 2 toward the cluster", not a paraphrase. Same words, correct field.
6. **`test` and `automation` must agree.** Every tier's damage/rider in `test` has a matching effect in the same tier of `automation.tiers`, and vice versa. They are the display copy and the executable copy of the same thing.
7. **Nothing may live ONLY in `automation`.** The GM never sees automation JSON — they see the displayed fields. Any effect present in an `automation` card (forced movement, condition, potency, zone, note) must also be written out in the matching display field (`tier_effect`, attribute-check fields, `additional_effect`, `effect`, or `trigger`). An automation-only rider is a bug: the hover card will look like plain damage.
8. **All five attributes, always.** `attributes.might/agility/reason/intuition/presence` are all required on every monster, along with `level`, `role`, `ev`, `size`, `speed`, `stamina`, `stability`, and `free_strike`. Never omit a stat.

---

## Template

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
        "roll_bonus": 5,
        "effect": "The hulk slams a burning fist into the target.",
        "has_test": true,
        "test": {
          "tier1": { "damage_amount": "5", "damage_type": "fire", "tier_effect": "" },
          "tier2": { "damage_amount": "9", "damage_type": "fire", "tier_effect": "push 2" },
          "tier3": { "damage_amount": "13", "damage_type": "fire", "tier_effect": "push 3", "has_attribute_check": true, "attribute": "might", "attribute_threshold": 2, "attribute_effect": "prone" }
        },
        "additional_effect": "The struck square is scorched and becomes difficult terrain until the end of the encounter.",
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            {
              "type": "target",
              "name": "primary",
              "mode": "token",
              "predicate": "enemy",
              "count": { "value": 1, "mode": "exact" },
              "distance": { "form": "melee", "value": 2 }
            },
            {
              "type": "powerRoll",
              "flatBonus": 5,
              "tiers": {
                "tier1": { "effects": [{ "kind": "damage", "amount": 5, "damageType": "fire" }] },
                "tier2": { "effects": [{ "kind": "damage", "amount": 9, "damageType": "fire" }, { "kind": "forcedMovement", "verb": "push", "distance": 2 }] },
                "tier3": { "effects": [{ "kind": "damage", "amount": 13, "damageType": "fire" }, { "kind": "forcedMovement", "verb": "push", "distance": 3 }, { "kind": "condition", "name": "prone" }] }
              }
            },
            {
              "type": "effect",
              "effects": [{ "kind": "note", "text": "The struck square is scorched difficult terrain until the end of the encounter. Mark the map." }]
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
        "roll_bonus": 5,
        "effect": "Fire erupts from the ground around the hulk.",
        "has_test": true,
        "test": {
          "tier1": { "damage_amount": "5", "damage_type": "fire", "tier_effect": "" },
          "tier2": { "damage_amount": "8", "damage_type": "fire", "tier_effect": "" },
          "tier3": { "damage_amount": "11", "damage_type": "fire", "tier_effect": "" }
        },
        "automation": {
          "schema": "ability-automation/v3",
          "cards": [
            {
              "type": "target",
              "name": "flames",
              "mode": "area",
              "predicate": "enemy",
              "shape": "burst",
              "size": 3,
              "distance": { "form": "burst", "value": 3 }
            },
            {
              "type": "powerRoll",
              "flatBonus": 5,
              "tiers": {
                "tier1": { "effects": [{ "kind": "damage", "amount": 5, "damageType": "fire" }] },
                "tier2": { "effects": [{ "kind": "damage", "amount": 8, "damageType": "fire" }] },
                "tier3": { "effects": [{ "kind": "damage", "amount": 11, "damageType": "fire" }] }
              }
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

### Ability-level fields

- `roll_bonus` — integer. The 2d10 bonus shown on the displayed stat block (e.g. "Cinder Maul (2d10+5)"). **Must match the `flatBonus` you set on the ability's `powerRoll` automation card.** Set it on any ability that has a test; omit (or 0) for abilities with no roll.
- `effect` — flavor / lead-in prose only when the ability has a test. For abilities with no test, this holds the full rules text. Never restate the tier breakdown here.
- `has_test` — `true` if the ability has a 2d10 power roll. Required for the tier table to render.
- `additional_effect` — one effect that applies on every tier, rendered after the tier table (e.g. "All tiers: the target's square becomes scree."). Mirror it as a standalone `effect` card before/after the `powerRoll` in automation.

### Per-tier fields (inside `test.tier1` / `tier2` / `tier3`)

- `damage_amount` — the tier's damage as a string (`"11"`, or dice like `"2d6"`). `damage_type` — the damage type (`"fire"`, etc.); omit/empty for untyped.
- `tier_effect` — **free-text rider for a flat (non-potency) effect on that tier**, e.g. `"pull 2 toward the cluster"`, `"prone"`, `"slide 3"`. This is the structured home for tier riders that used to get stranded in prose. Renders right after the damage on the tier line. Mirror it with the matching automation effect (`forcedMovement`, `condition`, etc.) in the same tier.
- `has_attribute_check` + `attribute` + `attribute_threshold` + `attribute_effect` — a **potency-gated** rider for "Attribute ≤ N: effect" lines (the book's `M<2 prone`). The display shows "Might ≤2: prone". Set `has_attribute_check: true`, pick the `attribute`, the numeric `attribute_threshold`, and the `attribute_effect` text. Use `tier_effect` for flat riders and these fields for potency-gated ones — a tier can use both.

### Automation

- For monster automation, use static numbers and `flatBonus`. Do not write PC-style `7 + M` formulas for monsters.
- Effects that happen **before** the roll (a precondition, e.g. "first the hulk shifts") go in an `effect` card *before* the `powerRoll` card. Effects **after** the roll, or that apply regardless of tier, go in an `effect` card *after* the `powerRoll` card. Tier-specific effects go inside that tier's `effects` array.
- Ability automation uses the shared v3 format documented in `../../character_sheet/ability-automation/AUTHORING.md` and `../../character_sheet/ability-automation/REGISTRY.md`. In target cards, put `mode`, `predicate`, `count`, `distance`, `shape`, and `size` directly on the card; do not use the old nested `{ "target": { "kind": ... } }` shape.

### Immunities / weaknesses

- `immunities` and `weaknesses` are arrays of `{ "type": "<damage type>", "value": <int> }` entries. Use one entry per damage type — e.g. an undead with "Immunity: corruption 1, poison 1" becomes two entries. Empty `type` matches any incoming damage type. The legacy single-field form (`immunity_type`/`immunity_value`/`weakness_type`/`weakness_value`) is still accepted for back-compat; the importer auto-promotes it to a one-entry array.
- The VTT automation damage adjuster sums **all matching entries** in the list. Multiple immunities/weaknesses against the same incoming damage type stack additively.
- To create a temporary weakness or immunity that automation damage does apply, use condition effects named `damageWeakness` or `damageImmunity`.
