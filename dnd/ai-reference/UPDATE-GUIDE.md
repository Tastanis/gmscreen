# AI Reference Update Guide

Update this reference any time code changes touch Draw Steel ability JSON, monster JSON, automation hooks, or runtime behavior.

## Mandatory Update Checklist

When touching `dnd/character_sheet/ability-automation/`:

- Update `../character_sheet/ability-automation/AUTHORING.md` if author-facing JSON shape, examples, fields, or recipes change.
- Update `../character_sheet/ability-automation/REGISTRY.md` if supported block types, effect kinds, hook payloads, trigger events, enums, statuses, or limitations change.
- Update this folder's `vtt-json/INDEX.md` or `hooks/INDEX.md` if the routing guidance changes.

When touching monster creator import or monster ability storage:

- Update `../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`.
- Update `vtt-json/INDEX.md` if categories, fields, import aliases, defenses, or automation storage behavior change.

When touching monster tray or monster runtime:

- Update `hooks/INDEX.md` if callbacks, malice spending, triggered-action behavior, winded logic, stat lookup, or board hook wiring changes.
- Update `../character_sheet/ability-automation/REGISTRY.md` if the behavior changes what authors can rely on.

When touching source-book organization:

- Update `source/rules-v1.01b/INDEX.md` or `source/monsters/INDEX.md`.
- Keep chunking coarse unless there is a clear retrieval problem.

## Rule

Do not invent JSON fields or hook names. If the code does not support a mechanic, use `note` or `other` in automation JSON and document the limitation in the registry.
