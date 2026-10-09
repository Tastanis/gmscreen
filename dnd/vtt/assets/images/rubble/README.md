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
- Strips: about three times as long as high, the rubble running left to right through the exact
  middle in a band about a third of the picture's height, unbroken from end to end. The app
  draws a strip three quarters of a square high, scaled evenly (never stretched), so that band
  is thicker than the wall painted on the map and hides it. Only the stretch of the picture
  lying over the broken wall piece is shown, fading out just past each end; the outer twelfth
  of the picture at each end is never used, so a taper there is fine but is not seen.
- Heaps: roughly square, a round heap in the middle with clear corners.
- Keep a few clear pixels all round the outer edge.

## Size, and how the files get here

Large originals stay outside the repository. `dnd/vtt/tools/shrink-rubble-art.py` reads a folder
of originals and writes the small copies: strips 600 pixels wide, heaps 512 on the long side,
with the coloured fringe left by background removal cleaned off the edges.

    python dnd/vtt/tools/shrink-rubble-art.py "<folder of originals>" dnd/vtt/assets/images/rubble

Each file here should stay under 200 KB; a test checks it.
