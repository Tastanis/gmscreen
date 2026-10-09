# Rubble pictures for broken walls

Pictures in this folder are laid over a wall when it is broken. The app finds them by name;
adding or replacing a file needs no code change.

## Names

`rubble-<kind>-<number>.webp` (or `.png`), lowercase, numbered from 1:

| Kind | Used for |
|---|---|
| `stone`, `wood`, `glass`, `metal` | A strip laid along a broken wall of that material |
| `door` | A strip for a broken door. Until one exists, a door uses a `wood` strip. |
| `window` | A strip for a broken window. Until one exists, a window uses a `glass` strip. |
| `heap-stone`, `heap-wood`, `heap-glass`, `heap-metal` | A heap over a broken free-standing object (a pillar, a spire) of that material. Not used until that stage is built. |

Any number of versions per kind. Each wall piece always shows the same version, on every screen.
A kind with no picture here, and nothing to borrow, is drawn by the app as a stand-in.

## Shape

- See-through background, viewed from straight overhead, even light with no shadow cast to one
  side: the app turns the picture to match the wall.
- Strips: the rubble runs left to right through the exact middle. The app scales a strip by its
  long side to a little more than one wall piece and keeps the picture's own shape, so nothing is
  stretched. The band in the middle has to be wider than the wall painted on the map, or the
  painted wall shows beside it.
- Heaps: roughly square, a round heap in the middle with clear corners.
- Keep a few clear pixels all round the outer edge.

## Size, and how the files get here

Large originals stay outside the repository. `dnd/vtt/tools/shrink-rubble-art.py` reads a folder
of originals and writes the small copies: strips 600 pixels wide, heaps 512 on the long side,
with the coloured fringe left by background removal cleaned off the edges.

    python dnd/vtt/tools/shrink-rubble-art.py "<folder of originals>" dnd/vtt/assets/images/rubble

Each file here should stay under 200 KB; a test checks it.
