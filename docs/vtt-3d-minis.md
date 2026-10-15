# 3D minis

A monster can stand on the 3D board as a 3D model (a "mini") instead of as its picture. The mini
belongs to the monster in the Monster Creator, so every token made from that monster comes out as
the mini, for the Director and for every player. The token keeps everything else: its HP bar,
badges, conditions, turn, movement rules, and the monster's abilities and their automation.

## The short version (Brandon)

1. **Get the model.** Ask a chat to build the mini for a creature. It gives you a `.glb` file
   (and the `.mini.json` recipe it was made from). Any `.glb` from elsewhere works too, as long as
   everything is inside the one file (see "What files are accepted").
2. **Put it on the monster.** Either:
   - **Upload tool:** put the `.glb` next to the creature's `.json` with the same name
     (`werewolf.json` + `werewolf.glb`) and upload as usual:
     `node dnd/tools/site-upload.mjs creature "C:\creatures\werewolf.json" --replace`.
     The tool checks the model, sends it, then sends the creature pointing at it.
   - **Monster Creator:** open the monster (✏️ Edit). Under its picture is **3D mini**: **Add .glb**,
     then **Preview** to see it standing on its squares. **Scale**, **Turn°** and **Lift** fine-tune it.
     Save as usual.
3. **Use it.** Drag the monster's token from the token library onto the board, as always. It comes
   out as the mini. Tokens already on the board: right-click → tick **Show as 3D mini** (untick it
   to go back to the picture for that token).

A monster whose mini is changed later (new file, new scale): tokens dragged out from then on get
the new one; a token already on the board gets it when **Show as 3D mini** is ticked again.

## What happens, piece by piece

| Step | Where | What it does |
|---|---|---|
| Rules | `dnd/vtt/assets/js/ui/mini-model.js` | The model's one saved shape, which `.glb` files are accepted, and how a model is fitted to a token. The board, the Monster Creator and the upload tool all use it. |
| Server rules | `dnd/strixhaven/monster-creator/includes/model-store.php` | The same checks in PHP; stores a model under `monster-creator/models/mini_<24 hex>.glb`, named from its own content. `models/.htaccess` runs nothing. |
| Monster Creator | `js/monster-mini.js`, `upload-model.php` | The card's **3D mini** part, the Director-only upload, and the preview (`dnd/vtt/board3d/mini-preview.mjs`). |
| Upload tool | `dnd/tools/site-upload.mjs` → `creature-model` action | Sends each creature's `.glb` before the creature. |
| VTT monster list | `dnd/vtt/api/monster_helpers.php` | Passes `model` through the monster list and record (GM only, as before). |
| Dropping a token | `board-interactions.js` (`calculateTokenPlacement`), `monster-models.js` | Puts the monster's current model on the new placement as `placement.model`. |
| Token menu | `board-interactions.js` (`data-token-settings-toggle="mini"`) | **Show as 3D mini**, Director only. |
| On the board | `dnd/vtt/board3d/minis.mjs`, wired in `integration.mjs` | Loads each model once, stands a copy on each token's base, fitted to its footprint. The token's card stays for the HP bar, badges and picking, without its picture. |

The model is on the placement, not only inside the monster's stat block, because players never
receive a monster's stat block. Only the Director may set or change a placement's `model`
(`SyncV2Store::assertPlayerPatchAllowed`). Only a stored model's own address is ever loaded:
anything else in `model` is dropped, so a placement cannot send a player's browser elsewhere.

### The saved shape

On a monster (Monster Creator, creature `.json` once uploaded) and on a placement:

```json
"model": { "file": "mini_6ddba2b6b81b5bf323329687.glb", "scale": 1, "yaw": 0, "lift": 0 }
```

- `file`: a stored model's name. Only the site makes these.
- `scale`: 0.25–4, multiplies the automatic fit.
- `yaw`: degrees, -180–180; turns the model from facing +Z toward +X.
- `lift`: squares, -2–4; raises or sinks the model on its base.

In a creature file **before** upload, `model.file` may name the `.glb` beside it
(`"model": {"file": "werewolf.glb", "scale": 1.1}`), or `model` can be left out when the `.glb` has
the creature file's name. The upload tool replaces it with the stored name. The Monster Creator's
**Import JSON** keeps a model only when it already names a stored file.

### Fitting

A model may be made at any size. On the board it is centred on its token, its lowest point on
the base, and scaled so that its widest side across the ground fills 92% of the token's
footprint, unless that would make it taller than 1.5 squares per square of footprint; then its
height decides. `scale` multiplies that. The Preview shows exactly this, on a grid of the
monster's own squares.

## What files are accepted

A binary glTF 2.0 (`.glb`) with everything inside it:

- At most 12 MB, 200,000 triangles and 16 textures.
- Textures PNG or JPEG, packed in the file (no separate image files, no addresses).
- No Draco or meshopt compression (export without it).
- At least one mesh. Materials are glTF's PBR materials. A first animation, or one named "idle",
  plays on a loop. Skinned (rigged) models are fine.

Blender: File → Export → glTF 2.0, Format **glTF Binary (.glb)**, Compression off. Front of the
creature toward +Y in Blender (which is +Z in glTF), feet at the origin.

## Building a mini (for a chat)

`dnd/tools/mini-build.mjs` turns a **mini recipe** into a `.glb` with no other software. It uses the
VTT's own three.js shapes and checks the result by the site's rules.

```powershell
node dnd/tools/mini-build.mjs dnd\tools\minis\werewolf.mini.json
node dnd/tools/mini-build.mjs C:\creatures\orchard-tender.mini.json --out C:\creatures\orchard-tender.glb
```

Without `--out` the `.glb` is written beside the recipe, with its name (`werewolf.mini.json` →
`werewolf.glb`). For the upload tool, name it as the creature's `.json`.

### The recipe

Units are squares (1 = one 5-foot square), **y is up, the feet are at y = 0, and the creature
faces +Z**. Proportion matters more than size: the board fits the mini to its token (see
"Fitting"), so a man is about 0.35 wide and 1.2 tall, a wolf about 0.4 wide, 0.7 tall and 1 long.

```json
{
  "name": "Werewolf",
  "materials": {
    "fur": { "color": "#4b3828", "roughness": 0.95 },
    "eye": { "color": "#ffb21f", "emissive": "#ff8a00", "emissiveIntensity": 2.5 }
  },
  "parts": [
    { "name": "torso", "shape": "capsule", "radius": 0.17, "length": 0.28, "material": "fur",
      "position": [0, 0.93, 0.04], "rotation": [22, 0, 0], "scale": [1.15, 1, 0.9] },
    { "name": "arm", "mirror": "x", "position": [0.24, 0, 0], "parts": [ ... ] }
  ]
}
```

**Materials** (by name): `color` (`"#rrggbb"`), `roughness` 0–1 (default 0.7), `metalness` 0–1,
`emissive` (a colour that glows) with `emissiveIntensity`, `opacity` 0–1, `doubleSided`, and
`flat: true` for faceted, low-poly shading. A part with no `material` uses a grey `default`.

**Parts**: every part may have `position` [x, y, z], `rotation` [x, y, z] in degrees (applied x,
then y, then z), `scale` [x, y, z] or one number, `name`, and `mirror: "x"` to add its reflection
across x = 0 (one recipe entry for both arms, both ears). A part with `parts` is a **group**: its
transform applies to everything inside it. Otherwise it is a shape:

| shape | sizes (squares) | notes |
|---|---|---|
| `box` | `size` [w, h, d] | centred on its position |
| `sphere` | `radius`; `segments`, `rings` | squash with `scale` for eggs, bellies, skulls |
| `capsule` | `radius`, `length` (the straight middle) | along y; limbs, torsos, fingers, tails |
| `cylinder` | `radiusTop`, `radiusBottom` (or `radius`), `height`; `open` | along y |
| `cone` | `radius`, `height`; `open` | points up (+y); turn it for claws, horns, ears |
| `torus` | `radius`, `tube`, `arc` (degrees) | a ring in the x–y plane; rings, halos, coils |
| `lathe` | `points` [[radius, height], ...] | a profile spun around y: hats, robes, vases, horns |

Defaults keep a mini light (about 10,000 triangles for the werewolf); raise a shape's `segments`
only where it shows. One mesh is made per material, so a few materials are better than many.

**Working well:** build the body from the ground up (feet, legs, hips, torso, arms, neck, head),
overlap parts generously so no gaps show, and give the head the most detail: it is what is seen
at the table. Use 3–6 materials, with one strong accent (eyes, a weapon, a glow). Then put the
`.glb` in the Monster Creator and look at it in **Preview**, or ask for screenshots.

`dnd/tools/minis/werewolf.mini.json` is a worked example (the Werewolf in
`monster-creator/imports/werewolf-level-3-solo.json`).

## Checks

- `node dnd/vtt/tools/run-regression-suite.cjs` includes `ui/__tests__/mini-models.test.mjs`
  (rules, fitting, placements, the Director's model list, the builder, the upload tool) and runs
  `api/v2/tests/mini-models.test.php` (accepted files, storage, naming, the saved shape, re-upload).
- In the sandbox, browser checks covered:
  - **Board:** the creature uploaded with its `.glb` by the upload tool; a library token dropped
    on the board; the model drawn for the Director and a player; the token moved; the menu toggle
    both ways; an older token; a player refused.
  - **Monster Creator:** the card, Preview, the sliders, the upload, a non-model refused, Save, Remove.

## Not done yet

- Animations beyond one looping clip (walk, attack) and per-creature poses.
- A model of its own per token (one token of a monster wearing a different mini). Today the
  model is the monster's; a token can only show it or not.
- Changing a monster's mini does not change tokens already on the board until **Show as 3D
  mini** is ticked again for them.
- Stored models are never deleted, since several monsters may share one file. They are small.
