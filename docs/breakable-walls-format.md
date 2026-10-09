# Breakable walls and objects in a map package

For whoever writes map packages (the Map maker's converter). What the app does with these fields
is in `docs/breakable-walls.md`.

## Where they live

On a wall segment, in `domains.sceneConfig.environment.walls.value.segments`:

```json
{ "id": "orchard-break-T6-north", "a": "n1", "b": "n2",
  "baseMode": "fixed", "base": 0, "height": 2,
  "material": "stone", "group": "orchard-break-T6" }
```

| Field | Values | Meaning |
|---|---|---|
| `material` | `glass`, `wood`, `stone`, `metal` | Makes the wall breakable. Leave it out and the wall can never break. |
| `group` | 1 to 128 letters, digits, `-`, `_`, `.`, `:` | The same name on every wall of one object. They break together. |
| `broken` | `true` | The wall starts broken. Normally left out. |

## Two kinds of breakable thing

**A stretch of wall** (a building wall, a window, a door): `material`, no `group`. Cut it into
one-square pieces; each piece breaks on its own. A door or a window is one piece whatever its
length.

**A free-standing object** (a pillar, a crate, a crystal): a ring of four two-way walls just
inside its square or squares, each with the same `material` and the same `group`. Set them in a
little from the grid lines (0.04 of a square is what the islands map uses), so the app can tell
the object stands in the square and is not a wall beside it.

## What the import refuses

- A `material` the app does not know.
- A `material` on a one-way wall (`movementDirection` or `sightDirection` other than `both`).
- A `group` on a wall with no `material`.
- A `group` name with spaces or other characters, or longer than 128.
- Two different materials in one `group`.
- `broken: true` on a wall with no `material`.

## What the app does with them

- A push into a breakable wall asks first, then breaks it by the book: glass costs 1 square of
  the push and does 3 damage, wood 3 and 5, stone 6 and 8, metal 9 and 11, per square of wall
  struck. An object breaks whole for the price of the side that was struck.
- A creature that falls onto a breakable object breaks it when the fall is confirmed. A
  creature that falls onto an object with no `material` lands in the free square beside it.
- A broken stretch of wall is drawn as a strip of rubble along it. A broken object is drawn as
  one heap of its material on each square it stood on.
- Players are never sent `material` or `group` for a wall that still stands.

## Things that catch people out

- **Without a `group`, each side of an object is its own wall.** A creature pushed into it
  breaks the near side and is stopped by the others.
- **A wide object needs its group.** The middle square of an object three squares across is
  touched by none of its walls. The app knows a creature there is on the object only from the
  outline of the walls that share its group name.
- **Solid things that should never break** (bedrock, a cliff face) get neither field.
