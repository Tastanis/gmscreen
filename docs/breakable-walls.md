# Breakable walls: status

Plain-language progress for Brandon. Updated at the end of each stage.

## What this feature is

A wall can be marked breakable. When it is broken, that piece of wall stops blocking movement
and sight for everyone, and rubble is drawn over the wall painted on the map. A broken wall can
be repaired.

The book's rule (combat chapter, "Hurling Through Objects") is for a creature force moved into a
wall. It breaks if enough forced movement is left, and that movement is spent:

| Material | Movement it costs | Damage to the creature |
|---|---|---|
| Glass | 1 | 3 |
| Wood | 3 | 5 |
| Stone | 6 | 8 |
| Metal | 9 | 11 |

If the wall does not break, the creature stops and takes 2 plus 1 per square left.

## Your decisions (October 8, 2026)

1. A push into a breakable wall asks first with a pop-up. Nothing breaks automatically.
2. A large creature that hits two wall squares pays the cost and the damage per square, as the book says.
3. Movement left after a break carries the creature on, shown in the pop-up before you confirm.
4. You are making the rubble pictures. Until they arrive the app draws its own.
5. Only you see which walls are breakable, and only while walls are showing.
6. Doors and windows can be broken too, with their own rubble pictures.
7. Attacks do not break walls automatically. You break the wall by hand.

## Stage A: break and repair by hand. Built (October 8, 2026)

Not yet seen in a browser. It is on `main` on this PC and not pushed.

### How to try it

1. Open a scene that has walls, as the GM. Click **Walls**.
2. Double-click a wall piece. Its properties open.
3. At the bottom, set **Breakable** to Stone (or Glass, Wood, Metal). A small diamond appears
   on that wall. Only you see it.
4. Tick **Broken**. Rubble appears over the wall. Tokens can walk through and see through.
5. Untick **Broken** to repair it. Or use **Repair all broken walls** at the bottom of the
   Walls panel to put every broken wall in the scene back at once.

Shift-click selects several wall pieces, so several can be marked or broken together.

### What works

- A broken wall lets movement and sight through for the GM and every player at once, and the
  fog opens the way it does when a door is opened.
- It is saved with the scene. It is still broken after a reload.
- Doors and windows can be marked and broken the same way. A broken door has no door button.
- Rubble: your pictures for stone, wood, glass and metal walls (first set, October 8). A
  broken door uses the wood picture and a broken window the glass one until they have their own.
  Each wall piece always shows the same rubble, on every screen.
- A kind with no picture is drawn by the app as a stand-in. When a picture file is put in
  `dnd/vtt/assets/images/rubble/`, the app uses it. No code change. The names and shape are in
  the README in that folder.
- Your four heap pictures (stone, wood, glass, metal) are in the app, ready for free-standing
  objects in Stage D. Nothing draws them yet.
- A wall longer than a square and a half is covered by several rubble pictures end to end.
- The rubble hides the whole painted wall (your instruction, October 8). Each strip picture is
  drawn three quarters of a square high, scaled evenly, never stretched. That makes its band of
  rubble thicker than the painted wall. Only the stretch of the picture lying over the broken
  piece is shown; it fades out about a tenth of a square past each end, so rubble does not run
  on over wall that still stands. Neighbouring pieces show different stretches of the picture.
  Measured on every one-square wall of the bathhouse ground floor: none of the painted wall
  shows through, for all four materials.

### What you can rely on

- A wall with no material can never be broken.
- A one-way wall (the cliff edges on Dead Root) can never be given a material. The app refuses,
  and so does the server.
- Players are never told which standing walls are breakable. They learn a wall's material only
  when it is broken, because their screen needs it to draw the right rubble.
- Only the GM can break or repair.

### Limits to know about

- **Very thick painted walls.** The rubble hides a painted wall up to about a fifth of a square
  thick (the bathhouse walls are about an eighth). A map painted with thicker walls would show
  an edge of wall beside the rubble; the size is one number in the code if that ever comes up.
- **Only the middle of each strip picture is used.** The tapered ends you drew are not shown,
  because the picture is drawn larger than one wall piece. The ends of a breach fade out instead.
- **Long walls.** A break removes one wall piece. Your map packages cut walls into one-square
  pieces already. A long wall you drew by hand is cut into one-square pieces at the moment you
  mark it breakable, so you can then break one square of it. Only the first piece stays
  selected after the cut.
- **Tall painted walls.** The rubble is flat. On a map painted with walls leaning in
  perspective it reads as broken but does not hide the whole painted wall.
- **Upper floors.** Rubble on a floor that has its own picture (the bathhouse floors) shows
  while you are viewing that floor. A player sees it only while the spot is in sight; it is not
  remembered under fog the way ground rubble is.
- **Old-style scenes** that stack whole map pictures per level, without floor plates: rubble on
  an upper level may be drawn under that level's picture. None of the current maps is built that
  way.
- **Undo** in the Walls panel undoes a break like any other wall edit.

### Checks run

- New tests: 15 browser-code checks and 5 server checks (what may be stored, what a player is
  told, movement and sight through a broken wall, the rubble's place, size and picture choice).
- Not run yet: the whole suite (waiting for the tester's browser run to finish) and any look in
  a real browser.

## Stage B: forced movement breaks walls by the book. Not started

## Stage C: map packages carry the material. Not started

The package format is already able to carry it: a wall segment may have
`"material": "glass" | "wood" | "stone" | "metal"` and `"broken": true`. Import refuses a
material on a one-way wall. The converter and the import guide are still to do.

## Stage D: free-standing objects (pillars, spires). Not started
