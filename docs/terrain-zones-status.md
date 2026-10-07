# Terrain zones and difficult terrain: status

Plain-language progress for Brandon. Updated at the end of each stage.

**Where the work is:** a separate copy of the code at
`.claude/worktrees/terrain-zones`, on the branch `claude/terrain-zones`.
Nothing is on `main`, nothing is pushed, and the live site is untouched.

## What this feature is

Parts of a map can be marked as a zone: "blood", "water", "mud". A zone has a
tag the VTT can read and a movement cost (times 2, times 4, or no extra cost
at all). Later stages draw the zones, make the drag ruler and the movement
counter charge for them, and let abilities ask "is this creature in blood?".

## Stage 1: zones can be stored in a scene. Done (October 7, 2026)

What works now:

- A scene, and a scene package, can carry a list of zones. Each has a name, a
  tag, a floor, a surface height, a cost and its squares.
- The server checks zones strictly and refuses bad data: an unknown field, a
  cost that is not a whole number from 1 to 10, a tag with spaces or capitals,
  a square listed twice, a zone on a floor that does not exist.
- Only the GM can save zones.
- A zone marked GM-only is never sent to a player's browser.
- Importing or copying a scene keeps its zones and points them at the new
  copies of the floors. Exporting keeps them too.
- Deleting a floor deletes the zones on that floor.
- Old scenes and old packages behave exactly as before.

What you will notice in the VTT: nothing yet. Stage 1 is storage only.

Checks run:

- 5 new server test groups and 4 new browser-code tests, all passing.
- The full existing suite: 138 test files, 973 checks, 0 failures.
- A sandbox import of a test scene with five zones through the real Scenes
  screen. See "Sandbox check" below.

The format the Map maker should write is in `docs/terrain-zones-format.md`.

## Stage 2: show the zones. Done (October 7, 2026)

What works now:

- Zone squares are tinted and outlined on the map, with a short label such as
  "Blood ×2". The colour follows the tag: red for blood, blue for water, brown
  for mud, amber for anything else. A GM-only zone has a dashed outline and
  "(GM)" after its name.
- On maps with height the overlay follows the ground the same way tokens do.
- The GM has a new **Zones** button next to Height. It hides or shows the
  zones on the GM's own screen and remembers the choice. Players always see
  the zones they were sent, and never the GM-only ones.
- The VTT can now answer "which zones is this token in". A token is in a zone
  when it is on the zone's floor, part of it is on a zone square, and its feet
  are less than half a square above the zone's surface. So a flier, or a token
  on a bridge, deck or walkway over the blood, is not in the blood.
- Fog still covers zones in places a player has not seen.

Checks run:

- 2 more browser-code tests (6 in all for zones), all passing, and the full
  suite again with 0 failures.
- Sandbox, flat test scene: the GM sees four zones on the ground floor (the
  fifth is on the bridge floor), the player sees three. The Zones button hides
  and shows them. Token checks: wading in blood gives "blood"; on the bridge
  floor above it gives only "oil"; a flier one square up gives nothing; deep
  mud gives "mud"; a size 2 token with one square in the canal gives "blood";
  the GM-only pit is "pit" for the GM and nothing for the player.
- Sandbox, Dead Root Node with a test blood zone of 99 squares: the outline
  follows the canal; a token wading at (35.5, 15.5) is in "blood" and a token
  on the B2 deck over the same square is not; a flier over the canal is not.

One thing to decide later: the Zones button only changes the GM's own screen.
If you want a switch that hides zones from the players too, say so and I will
add it as a scene setting.

## Stage 3: movement. Done (October 7, 2026)

What works now:

- **Cost.** Entering a difficult square costs its multiplier instead of 1. A
  x2 square costs 2 and a x4 square costs 4. A climb is paid as well.
  Overlapping zones charge the highest multiplier, not the sum. A tag-only
  zone (cost 1) is free.
- **Who pays.** A walk or a shift pays. Forced movement and teleports do not.
  A flier above the zone, or a token on a bridge, deck or walkway over it,
  does not. A large token pays if any of its squares enters the zone.
- **Ruler colours on maps with height.** Black on the flat, yellow uphill,
  green downhill. Red is now used only for difficult terrain.
- **Difficult terrain on the ruler.** Each difficult square on the route gets
  a flashing red stretch and a small "×2" or "×4". This works on flat maps
  too. The flashing stops for anyone whose device asks for reduced motion.
- **Labels.** The distance is still shown as before. When the true cost is
  different, "Cost 8" appears above "5 squares" in light red, on the route
  and in the box at the bottom right ("Move - 5 squares · Cost 8").
- **Per-turn counter.** "Moved 8 / 5" now charges the same cost as the ruler,
  through the waypoints of the drag. Arrow-key moves are counted too (they
  were not counted at all before).
- **Shifting.** Holding Shift through or inside difficult terrain shows "No
  shift in difficult terrain" on the ruler, and the status line says so after
  the move. It is a warning only. The move is not blocked.

Checks run:

- 9 more tests (movement cost, route summary, colours, counter), and the full
  suite: 139 files, 982 checks, 0 failures.
- Sandbox, real mouse drags on the flat test scene: 5 squares through 3 blood
  squares showed "Move - 5 squares · Cost 8" with three flashing "×2"
  stretches; 1 square into x4 mud showed "Cost 4"; dry ground showed nothing
  extra; the same drag with Ctrl (forced) and a flier over the blood showed no
  extra cost; with Shift the warning appeared and the move still went through.
- Sandbox, counter during a combatant's turn: 8 while dragging through the
  blood, then 10 on the next 2-square drag, then 15 after one arrow-key step
  into blood (2) and a 3-square drag.
- Sandbox, Dead Root Node with a test blood zone: 5 squares from the south
  bank into the canal showed "Cost 10" with five "×2"; up the entrance stair
  drew yellow, down it drew green.

Things that changed that you might notice:

- On maps with height, the counter now includes climbing, because it uses the
  ruler's cost. Before, it counted a straight line.
- The counter only adds up during a combatant's turn (double-click their
  portrait in the tracker). That was already the case.

Not done, on purpose:

- **The blue "how far can I move" box is unchanged. It still ignores terrain
  and overstates reach near zones.** Waiting for your decision (question 2).
- Nothing is blocked. The server does not check distance, speed or shifting.

Wording you may want to change: the label says "Cost 8". If you would rather
it said "8 to move" or just showed a symbol, tell me.

## Questions waiting for you

1. Shifting into or inside difficult terrain is not allowed by the rules.
   Today the VTT warns. Do you want it blocked?
2. The blue "how far can I move" box ignores terrain cost. Should it be made
   accurate, or hidden while a zone is nearby?
3. The Zones button hides zones on the GM's screen only. Do you want a switch
   that hides them from the players too?
4. Is "Cost 8" the wording you want on the ruler?

## Stage 4: abilities read tags. Not started

"If the target is in blood, deal extra damage." I will pause and show you
stages 1 to 3 before starting this.

## Things to know

- On the Dead Root Node map, a walking token is never treated as standing on
  the fallen log or the barge (finding M4 in the sandbox test report). Once
  zones are drawn it will count as "in blood" there. The fix belongs in the
  map package.
- Your saved preference for this repository is to commit straight to `main`.
  This work is on a branch only because three chats share one folder and the
  feature is unfinished. How and when it goes onto `main` is your call.

## Sandbox check

Stage 1, run in the disposable sandbox on this PC (never the live site), with
the stage 1 files copied into it:

| Check | Result |
|---|---|
| Import a scene package with five zones through the real Scenes screen | Imported. "Created Terrain zones fixture. Ready to open." No page errors. |
| GM receives the zones | All five: blood x2, mud x4, holy x1, pit x2 (GM only), oil x2 on the upper floor. |
| The upper-floor zone follows the floor's new id after import | Yes. |
| Player receives the zones | Four. The GM-only pit is absent, and its name appears nowhere in the player's data. |
| Player tries to save zones | Refused: "Map design is GM-only." |
| GM changes the mud from x4 to x3 | Saved. GM and player both see x3 at revision 2. The player still has four zones. |
| GM tries a cost of 2.5 | Refused: "Zone cost must be a whole number from 1 to 10." |
| GM tries a zone on a floor that does not exist | Refused: "A zone uses a missing floor." |
| Export the imported scene | The package contains all five zones. |
