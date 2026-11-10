# Breakable map art (3D board)

Built November 10, 2026 for the Thornbriar. This is the art half of plan part 4 ("breakable things in 3D"):
when a breakable thing breaks, its piece of the map's 3D art goes and a heap of rubble shows in its place.
What makes a thing breakable, and what breaks it, is unchanged: `docs/breakable-walls.md` and
`docs/breakable-walls-format.md`.

## What happens in the app

- A map's art may come with a **pieces file**. Its entry in `dnd/vtt/board3d/assets/scenes/index.json` names it:
  `"pieces": "thornbriar/pieces-<checksum>.json"`.
- The board reads which walls are broken from the map's own walls and shows the art to match, on every screen:
  a push that breaks through, the Director's **Broken** box (Edits, Walls), **Repair**, and Undo.
- Nothing is drawn extra while nothing is broken. The art stays the same few merged meshes; a piece is taken
  out by blanking its triangles and put back from a kept copy (`board3d/breakable-art.mjs`).
- A map with no pieces file, or a breakable thing with no piece, works as before: it breaks, and its art stays.

## The pieces file

```json
{ "version": 1, "glbSha256": "<the model's checksum>",
  "pieces": {
    "west-elder": {
      "hide":   { "Weathered woody growth": [[123456, 8100]], "Leaf canopy": [[9000, 30000]] },
      "rubble": { "Weathered woody growth": [[987654, 534]] }
    } } }
```

- A piece is named as the map's label is: a labelled **object's id**, else the **group** its walls share,
  else a single **wall's id**. The first of those that is in the file is used.
- `hide` and `rubble` give, for each mesh of the model (a mesh is named by its material), index ranges
  `[start, count]`. `hide` is drawn until the thing breaks; `rubble` is drawn once it has.
- So the art script puts each piece's triangles together in the index list of each mesh it is in, and adds
  the rubble's triangles after them. No mesh per piece, no extra textures.

## Checking a map before delivery

```
php dnd/vtt/tools/map-label-check.php "<map>.vttmap" "<pieces>.json"
```

It adds two lines to the load check: breakable things with **no piece** in the art, and pieces that
nothing on the map breaks.

## Thornbriar

- All 38 labelled objects are wood and break whole: 7 trees, 3 arch feet and root cores, 3 climbing shoots,
  25 leg steps. A tree goes with its trunk, branches, leaves and the briar wrapped round it. A leg step takes
  the stretch of leg nearest to it, right across the leg, so a break leaves a gap in the leg.
- The crowns and the three crossings are **not** breakable. Floors over open space, the fall "hard enough to
  break through", and the Director's Break button are the rest of plan part 4 and are not built.
- The art is pass 7 unchanged: the builder proves every one of its 1,204,327 triangles is still there
  (`verify_art.py`). 10,393 rubble triangles were added; the file grew from 59.8 MB to 61.4 MB.
- Source and how to rebuild: `C:\Users\tasta\Documents\Codex\2026-11-06\i-need-you-to-build-a\work\thornbriar\rebuild\BREAKABLE.md`.

## Also for art maps (same work)

An entry in `index.json` may also carry `"materials"` (settings for named materials, and the swamp
ripple animation), `"lilyBob"` (lily pads that rock on the water) and `"terrainZoneFills"`
(`{"water": false}` leaves off a zone's coloured fill where the art paints that ground itself; its outline,
name and rules stay). These were written for Thornbriar's sandbox and had not been brought into the app.

## Known limits

- A fall onto a breakable thing that can be stood on (a leg step, a core) lands on it and does not break it.
  The October rule ("it should break the object") met the November rule ("it lands on the highest thing
  below"); the fall break-through pop-up of plan part 4 will settle it.
- A cut through a leg shows open cane ends. They read as torn, not as clean breaks.
- The Director sees the usual pale dashes where a broken wall stood. Players see them too.
- The model is not packed: packing reorders triangles, and the pieces file and the lily file both depend on
  their order. A packer that keeps order would be needed.
