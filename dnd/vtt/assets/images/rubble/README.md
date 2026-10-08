# Rubble pictures for broken walls

Pictures in this folder are laid over a wall when it is broken. The app finds them by name;
adding or replacing a file needs no code change.

## Names

`rubble-<kind>-<number>.png` (or `.webp`), lowercase, numbered from 1:

| Kind | Used for |
|---|---|
| `stone`, `wood`, `glass`, `metal` | A broken wall of that material |
| `door` | A broken door |
| `window` | A broken window |
| `heap` | A broken free-standing object (a pillar, a spire). Not used until that stage is built. |

Any number of versions per kind. Each wall piece always shows the same version, on every screen.
A kind with no picture here is drawn by the app as a stand-in.

## Shape

- See-through background, viewed from straight overhead, even light with no shadow cast to one
  side: the app turns the picture to match the wall.
- Wall, door and window rubble: three long by two high. The rubble runs left to right through the
  exact middle as a rough band, solid in the middle so it hides the painted wall, breaking up
  toward the top and bottom. The band reaches both short ends so neighbouring pieces join.
- Keep a few clear pixels all round the outer edge.
- `heap`: square, a round heap in the middle with clear corners.

## Size

Keep these small. 768 by 512 is plenty for a wall piece (one map square is rarely drawn larger
than about 150 pixels). Large originals stay outside the repository.
