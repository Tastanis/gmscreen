# Draw Steel AI Reference

This folder is the repo-local lookup system for Draw Steel rules, class abilities, monster text, monster JSON import shape, ability automation JSON, and VTT automation hooks.

Use this folder before authoring or changing Draw Steel abilities, monsters, automation JSON, or automation hooks.

## Start Here

1. Read `INDEX.md` to choose the smallest useful source file.
2. For class abilities, open the matching whole-class file in `source/rules-v1.01b/classes/`.
3. For monsters, open `source/monsters/INDEX.md`, then one coarse chunk in `source/monsters/chunks/`.
4. For JSON, use the canonical implementation docs in `../character_sheet/ability-automation/AUTHORING.md`, `../character_sheet/ability-automation/REGISTRY.md`, and `../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`.
5. If the code changes a supported field, hook, effect kind, trigger event, monster import field, or runtime behavior, update the relevant docs listed in `UPDATE-GUIDE.md`.

## Design

The books are split coarsely so an LLM does not need to load the full extracted text. Current Heroes rules are in `source/rules-v1.01b/`. Classes are one file per class. Monsters are grouped by nearby book sections instead of one file per monster or ability.

The code-derived docs in this folder are intentionally thin. They route future work to the canonical source files already maintained by the app, instead of copying schema tables into multiple places.
