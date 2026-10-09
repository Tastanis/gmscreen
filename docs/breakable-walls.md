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

It is on `main` on this PC and not pushed. The rubble drawing has been looked at in a real
browser over the bathhouse map. The whole feature has not yet been tried in the running app.

### How to try it

1. Open a scene that has walls, as the GM. Click **Edits**, then **Walls**.
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

### Fixed after the tester's browser run (October 8, evening)

The tester ran Stage A in a browser on the bathhouse and Dead Root. Marking, breaking,
repairing, movement, sight, fog, what players are told and Dead Root's one-way walls all
passed. It found these, now fixed and waiting for its re-test:

- **A player saw no rubble on the bathhouse.** The bathhouse floors have their own pictures,
  and the rubble was being drawn underneath them. It is now kept above the floor pictures.
- **The GM never saw rubble on those floors.** The GM looks down from a chosen height, not from
  a floor, and the rubble was waiting for the GM to be "on" the floor. The GM is now shown the
  rubble on every floor at or below the viewing height that no higher floor in view covers.
- **Ctrl+Z did nothing straight after ticking Broken**, because the cursor was still in the tick
  box. It now undoes the break from a tick box or a list in the Walls panel.
- **The Broken box could show the last wall's state** when you went from one wall to another
  with the cursor still in the box. It now always shows the selected wall.

Also from that run, and decided since: **a door or window breaks as one thing.** A door two
squares long used to be cut into two halves when marked, and ticking Broken broke one half; the
other still stood, with its own door button. Doors and windows are no longer cut. One breaks
whole, loses its button whole, and its rubble runs its whole length. Walls are still cut into
one-square pieces. A door that was already cut in two by the old rule stays in two pieces.

### Checks run

- New tests: 18 browser-code checks and 5 server checks (what may be stored, what a player is
  told, movement and sight through a broken wall, the rubble's place, size and picture choice).
- The whole suite, October 8 after the rubble sizing change: 154 browser-code files, 1121
  checks, none failing; all 40 server test files pass.
- Not done yet: trying break and repair in the running app.

## Falling onto an object. Built (October 8, 2026, night). Not yet seen in a browser

Your ruling: "if it is breakable, it should break the object like a wall or pillar or box or
something."

An object here means walls that run through a square instead of along its edge: a pillar, a
crate, a crystal, a stone tooth. Before this, a creature that fell onto one was left inside it,
and a player could not walk out in any direction.

- **Onto something breakable.** The creature lands in that square. The Fall pop-up has a new
  line, "Lands on and breaks: stone". When the fall is applied, the object's walls break and
  its rubble is drawn. Dismiss the fall and nothing breaks.
- **Onto something that cannot be broken.** The creature lands in the nearest free square
  beside it, the same way it does when another creature is in the way.
- **Damage is the fall's own.** Nothing is added for the object. The book has a falling rule
  and a rule for landing on a creature, and none for landing on an object. Its breaking damage
  (3, 5, 8, 11) is for forced movement that is still going, which a fall is not.
- **Who confirms.** Whoever owns the fall's pop-up: you for a push you made, a player for
  their own walk off an edge or their own ability's push. That is how fall damage already
  works. The player's pop-up names the material of the thing about to break.
- Walls that share a group name break together (see Stage D).

**This changes existing maps a little.**

- A fall onto a square with a wall running through it now lands beside the wall instead of
  astride it. A wall along a grid line is not affected.
- When a falling creature has to be put in a free square, a square counts as level with the
  landing if it is within half a square of it. It used to need to be exactly level, so on
  uneven ground the app gave up and asked you to place the creature.
- A free square is never one that a wall runs through.

Limit: an object three squares wide or more has a middle square that none of its walls
touch. A creature falling exactly there is not seen as landing on it.

Checks run: 6 new groups of server checks through the real store, one new pop-up check, and
on the islands map the Anvil push onto stone tooth T6 and the Crown push onto crystals B16
(both break on confirming; the hero then walks out).

## Stage B: forced movement breaks walls by the book. Not started

## Stage C: map packages carry the material. Not started

The package format is already able to carry it: a wall segment may have
`"material": "glass" | "wood" | "stone" | "metal"` and `"broken": true`. Import refuses a
material on a one-way wall. The converter and the import guide are still to do.

## Stage D: free-standing objects (pillars, spires). Not started
