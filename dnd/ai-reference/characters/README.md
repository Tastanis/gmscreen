# Character Automations

Saved, paste-ready automation JSON for each player character — so VTT abilities and heroic resources can be re-pasted, audited, or regenerated without rebuilding from scratch.

## Files

| Character | Class | File |
|---|---|---|
| Cal | Censor (Wrath / Judgment) | `cal-automations.md` |
| Sharon | Shadow (College of Black Ash) | `sharon-automations.md` |
| Indigo | — | _(not yet built)_ |
| Zepha | — | _(not yet built)_ |

## Convention

- **One file per character**, named `<name>-automations.md`.
- Each file holds every paste-ready block for that character: ability automation (one block per ability) and the heroic-resource automation block.
- Lead with an **"authoring decisions"** note so the *why* behind the JSON is captured (attribute scaling, kit/feature handling, baked ranges, known caveats).
- Each ability block maps to one **Automate** button on the live character sheet. Where known, record the live `action id` and the book rules source next to the block (see `cal-automations.md`).
- List anything **left manual** (no automation hook) at the bottom so it's clear it was a decision, not an omission.

## How to use a block

1. Open the character's file here.
2. Copy one ability's JSON object.
3. Paste it into that ability's **Automate** popup on the character sheet (heroic-resource JSON goes in the sheet's heroic-resource automation field).

## Schema references

- Ability automation format: `../../character_sheet/ability-automation/AUTHORING.md`
- Supported fields/effects/hooks: `../../character_sheet/ability-automation/REGISTRY.md`
- Heroic-resource format: `../../character_sheet/heroic-resource-automation/README.md`
