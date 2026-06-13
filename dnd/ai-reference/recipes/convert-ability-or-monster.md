# Convert Draw Steel Text to App JSON

## Class Ability

1. Open `../source/rules-v1.01b/classes/<class>.md`.
2. Search for the ability name.
3. Capture the visible card fields: name, action label, keywords, range, target, trigger, cost, description, and test tiers.
4. Open `../../character_sheet/ability-automation/AUTHORING.md`.
5. Build a combined paste object with `fields` and `automation`.
6. Confirm every block type, effect kind, condition, distance form, target predicate, and trigger event exists in `../../character_sheet/ability-automation/REGISTRY.md`.
7. Unsupported effects become `note` or `other`.

## Monster Ability

1. Open `../source/monsters/INDEX.md`.
2. Open the chunk that contains the monster.
3. Capture the monster ability card fields.
4. Use the shared `ability-automation/v3` shape.
5. Use `flatBonus` for monster power rolls and literal damage numbers.
6. Put automation on the specific monster ability object.

## Full Monster Import

1. Open the monster chunk and capture the stat block.
2. Open `../../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`.
3. Fill only fields supported by the template and normalizer.
4. Put abilities into one of the six supported categories.
5. Add per-ability `automation` only for mechanics supported by the registry.
6. Use `note` for summons, spawns, manual adjudication, and unsupported mechanics.

## Final Check

Before handing back JSON, verify:

- `schema` is exactly `ability-automation/v3`.
- `cards` are in runtime order.
- No invented fields or effect kinds are present.
- Monster power rolls use `flatBonus`.
- Triggered actions use a `trigger` card only when the event is supported.
- Triggered action JSON describes an always-on listener. Do not add wording or mechanics that require the player to click the ability to start watching for the trigger.
- PC triggered actions in the Triggers list are registered by the VTT for active-scene PC tokens. Opening the character sheet/panel is not part of the rules or JSON contract.
- For self-only triggered resolution effects, use `target: "self"` on the `effect` card instead of adding a target card that makes the player pick themselves.
- Use `surgeGain` for "gain/give surges." Surges are not heroic resources.
- Use embedded `teleport.spend` for text like "spend 1+ Insight to teleport 1 additional square per Insight spent" so the picker range expands before the player chooses a destination.
- Any touched docs are updated according to `../UPDATE-GUIDE.md`.
