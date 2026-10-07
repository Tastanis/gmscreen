# Terrain zones: package format

A terrain zone is a named group of grid squares on a map, such as "blood" or
"water". Each zone carries a tag the VTT can read and a movement cost. This
page is the contract for anything that writes zones into a scene package,
first of all the map converter.

Status: the VTT stores, validates, imports, copies and exports zones (stage 1).
Drawing them, charging movement for them and letting abilities read them come
in later stages. See `docs/terrain-zones-status.md`.

## Where zones live

Zones are a fourth map-design field beside terrain, walls and exploration:

```
package.domains.sceneConfig.environment.zones = {
  "revision": 1,
  "value": { "version": 1, "zones": [ ...zone records... ] }
}
```

A scene with no `zones` field has no zones. Nothing else changes for old
scenes and old packages.

### Optional display switch

`value` may also carry `"hiddenFromPlayers": true`. The GM sets it from the
"Players" button in the VTT; a package normally leaves it out. It only hides
the drawing on players' screens. Players still receive the zones, and movement
through them still costs extra. Any value other than `true` or `false` is
refused.

## A zone record

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | yes | text, 1 to 128 characters, unique in the scene | Stable name for this zone, for example `blood-canal-1`. |
| `tag` | yes | lowercase letters, digits, `-` or `_`, 1 to 32 characters, starting with a letter or digit | What the zone is: `blood`, `water`, `mud`. Abilities will test this. Several zones may share a tag. |
| `label` | no | text, up to 80 characters | Name shown to people, for example "Blood canal". |
| `levelId` | no | text | The floor the zone lies on. Leave it out, or use `level-0`, for the ground floor. Any other value must be the `id` of a floor in the same package. |
| `surfaceHeight` | no | number, in squares | Height of the zone's surface. A token standing higher than this (on a bridge, or flying) is not in the zone. Leave it out to mean "the floor's own height". |
| `cost` | no | whole number, 1 to 10 | Movement multiplier for entering a square of the zone. `2` is ordinary difficult terrain (the default). `4` is "times four". `1` means the zone is only a tag and does not slow anyone. |
| `gmOnly` | no | `true` or `false` | When `true` the zone is never sent to players' browsers. |
| `squares` | yes | list of `[column, row]` pairs | The squares in the zone. Whole numbers, each from 0 to 10000, no square listed twice in one zone, at least one square. |

No other fields are allowed in a zone record. A misspelt field such as
`"costs"` is refused rather than silently ignored.

### Coordinates

`[column, row]` is the same square a token occupies: column counts from the
left edge of the VTT grid, row counts from the top, both starting at 0. For a
map built by the Dungeon Alchemist converter, with its one-square border and
its south-up native axes, a native tile `(x, y)` on a map `H` native squares
tall is:

```
column = x + 1
row    = H - y          (Dead Root Node: row = 30 - y for tile y, i.e. floor(31 - y) for a point)
```

Use the converter's own tile-to-token helper rather than this formula if it
has one. The rule is only that a zone square and a token standing on that tile
must have the same `column` and `row`.

### Limits

- At most 200 zones in a scene.
- At most 20,000 squares in one zone and 50,000 across all zones.
- The usual 16 MB limit on the whole scene package still applies.

## Worked example

Two blood squares at cost 2, a patch of deep mud at cost 4, a tag-only zone,
a GM-only zone, and a zone on an upper floor:

```json
"environment": {
  "terrain": { "revision": 1, "value": { "...": "unchanged" } },
  "walls":   { "revision": 1, "value": { "...": "unchanged" } },
  "zones": {
    "revision": 1,
    "value": {
      "version": 1,
      "zones": [
        { "id": "blood-canal", "tag": "blood", "label": "Blood canal",
          "levelId": "level-0", "surfaceHeight": 0, "cost": 2,
          "squares": [[4, 2], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3]] },
        { "id": "deep-mud", "tag": "mud", "label": "Deep mud",
          "levelId": "level-0", "surfaceHeight": 0, "cost": 4,
          "squares": [[9, 5], [10, 5], [9, 6], [10, 6]] },
        { "id": "holy-ground", "tag": "holy", "label": "Consecrated ground",
          "cost": 1, "squares": [[1, 1], [2, 1]] },
        { "id": "hidden-pit", "tag": "pit", "label": "Hidden pit",
          "cost": 2, "gmOnly": true, "squares": [[12, 2]] },
        { "id": "deck-oil", "tag": "oil", "label": "Spilled oil on the bridge",
          "levelId": "bridge-deck", "surfaceHeight": 2, "cost": 2,
          "squares": [[5, 2], [5, 3]] }
      ]
    }
  }
}
```

The full package this comes from is the test fixture
`dnd/vtt/api/v2/tests/fixtures/terrain-zones-scene.json`.

## Notes for the map converter

- One zone per connected body of blood or water is tidy, but one zone holding
  every blood square is equally valid. The VTT treats squares, not shapes.
- Set `surfaceHeight` to the height of the liquid's surface in VTT squares
  (0 for the Dead Root canal). The VTT will use it, together with the deck and
  walkway surfaces already in `walls.roofs`, to decide that a token on a
  bridge is not in the blood.
- Overlapping zones are allowed. Where two zones cover the same square the VTT
  will charge the higher cost, not the sum, and report both tags.
- When a scene is imported, every floor gets a new id and each zone's
  `levelId` is rewritten to match. The converter does not need to do anything
  for that; it only has to name a floor that exists in the package.
- Keep the first `revision` at 1 or higher. The importer refuses 0.

## Tags the app reads

Any tag is allowed. A few have a meaning in the app:

- **Liquid tags:** `water`, `blood`, `liquid`, `oil`, `acid`, `slime`,
  `sewage`. A creature with "swim" in its movement pays no extra movement in a
  zone with one of these tags. Use one of them for anything a creature could
  swim through. `mud` and `lava` are not liquid.
- **Colour** follows the tag (red for blood, blue for water, brown for mud,
  amber for anything else).
- A creature whose movement says "walks on X" ignores the cost of zones tagged
  X, whatever X is.

A token standing on a floor plate (a deck, plank or barge) is out of the zone
under it whatever the gap, so squares under a plate can stay in the zone.
Squares under something standable that is not a plate should be left out.

## What the server checks

`SceneEnvironment::validate('zones', value)` enforces everything in the table
above. Import (`SceneImportValidation`) and the GM's own save
(`environment.set` with `field: "zones"`) also refuse a zone whose `levelId`
is not the ground floor or a floor of that scene. Only the GM can save zones.
Deleting a floor removes the zones on it.
