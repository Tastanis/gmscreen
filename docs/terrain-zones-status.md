# Terrain zones and difficult terrain: status

Plain-language progress for Brandon. Updated at the end of each stage.

**Where the work is:** stages 1 to 3 and the follow-up are on `main` in the
shared folder on this PC (`C:/Users/tasta/Desktop/gmscreen`), as of October
7, 2026. **Nothing is pushed and the live site is untouched.** It goes to
GitHub and the live site only when you say so. The work was built in a
separate copy at `.claude/worktrees/terrain-zones` (branch
`claude/terrain-zones`), which is still there.

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
- A **Zones** button hides or shows the zones. It started beside Height and
  was GM-only; it is now a small button in the bottom left corner for
  everyone (see "Follow-up" below).
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
- **Labels.** When the true cost is different from the distance, the ruler
  shows both: "Move 5 · Cost 8". (The wording was settled later; see
  "Follow-up" below.)
- **Per-turn counter.** "Moved 8 / 5" now charges the same cost as the ruler,
  through the waypoints of the drag. Arrow-key moves are counted too (they
  were not counted at all before).
- **Shifting.** Holding Shift through or inside difficult terrain warns. It
  is a warning only; the move is not blocked. The warning is now a pop-up
  (see "Follow-up" below).

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

- Nothing is blocked. The server does not check distance, speed or shifting.

## Follow-up after your answers. Done (October 7, 2026)

You answered three of the four questions, and asked for the labels to be
tidied. All four are built, on the same branch.

**1. Shift warning is a pop-up.** Shifting into or through difficult terrain
shows a red box near the top of the screen: "No shifting in difficult
terrain. The rules do not allow a shift into or inside it. The move is not
blocked." It appears while you drag, stays for about four seconds after you
let go, and then goes away by itself. There is only ever one, it never stacks,
there is nothing to click, and you can click straight through it. The move is
still allowed.

**2. The "how far can I move" outline is accurate.** During a turn the outline
now follows the real cost of every square: x2 and x4 terrain, and climbing on
maps with height. It pulls in where the ground is expensive and it finds the
cheap way round an obstacle. Where nothing nearby changes the cost it is the
same plain square as before. It was not slow: the VTT only looks at the
squares inside the old box (121 squares for speed 5), so no cheaper
substitute was needed.

- It follows the same rules as the ruler: a flier or a token on a deck over
  the blood is not charged, and a big token is charged if any part of it
  enters.
- It does not know about walls. Neither did the old box.
- The outline is also thicker on maps drawn with large squares (Dead Root),
  where it used to be about one pixel wide.

**3. Zones button in the bottom left corner.** The button beside Height is
gone. There is now a small "Zones" button in the bottom left corner of the
map for the GM and for every player.

- Everyone can switch zones on and off on their own screen. The choice is
  remembered per person on that browser.
- The GM has a second button beside it, "Players". Switching it off hides the
  zones on every player's screen. A player's own button is then greyed out
  ("The GM has hidden terrain zones") and cannot bring them back. Switching
  it on again gives each player back whatever they had chosen.
- This is a scene setting, so it is remembered with the scene.
- Hiding is display only. Movement through a hidden zone still costs extra
  for the player, so the ruler and the counter stay honest.
- GM-only zones are still never sent to players, whatever the switches say.
- **It moves out of the way of panels.** When a slide-out covers the corner
  (Scenes, Tokens, a monster's stat block, a hero's sheet with its details
  opened), the button slides to the right of it. If a bar ran along the whole
  bottom it would rise above it.
- **The one case where it hides:** in a narrow window (about 700 pixels) the
  Scenes, Tokens and hero panels and the chat fill nearly the whole window,
  map included. There is nowhere left to put the button, so it waits out of
  sight and comes back when the panel closes.

**4. Labels tidied, and the wording you chose.**

- The ruler now reads "Move 5", and "Move 5 · Cost 8" when the ground makes
  the move cost more than its distance. It is one line, with the cost part in
  light red. The same words are in the box at the bottom right. Shift,
  forced movement and teleport read the same way ("Shift 4 · Cost 7").
- The plain Measure tool is not a move, so it still says "5 squares".
- The label sits under the destination square, clear of the token and its
  Stamina bar. When the route comes up from below it goes above the bar
  instead, so it never lies along the route.
- A drag with several legs also labels each leg with its length ("3
  squares"), set to the side of the line so it does not sit on the "x2"
  numbers. I kept the word "squares" there because a bare number beside the
  "x2" marks would be confusing. A leg label that would touch the main label
  is left out.
- Labels are sized from the map's squares. On Dead Root, whose squares are
  large, the label used to be too small to read.
- The wording lives in one place in the code (`rulerWording` in
  `ruler-label-layout.mjs`), so it is a one-line change if you want
  different words.
- One limit: tokens are drawn on top of the ruler, so if another token
  stands right where the label goes, it can cover part of it. The box at the
  bottom right always shows the full text.

Checks run:

- 18 more tests (reach outline, label placement and wording, button
  placement, step pricing, the players switch on the server). Full suite:
  141 files, 1000 checks, 0 failures.
- Sandbox, flat test scene, GM at 1600 wide: the button is at the bottom left
  with everything closed, and is on top and uncovered with each of these
  open: Scenes, Tokens, Fog, Stairs, Dice Roller, Templates, Draw, Edits,
  Measure, Damage/Heal, the chat drawer, a token selected. With Scenes or
  Tokens open it moves to the right edge of the panel. With the Draw tools
  open it moves to their right.
- Sandbox, flat test scene, player: same corner; own button hides and shows;
  the choice survives a reload; the player has no "Players" button; the
  GM-only pit is not in the player's data. GM switches Players off: the
  player's zones vanish, the player's button is greyed out and does nothing,
  it stays that way after the player reloads, and a 5-square walk through the
  blood still reads cost 8. GM switches it back on: the zones return.
- Sandbox, Dead Root Node, GM: with a monster selected (stat block down the
  left, ability buttons along the bottom) the button sits between them.
- Sandbox, Dead Root Node, player: with the hero selected the button stays in
  the corner (the sheet stops short of it); with "Character details" opened
  the sheet reaches the bottom and the button moves to its right; with the
  Tokens panel open it moves to its right.
- Narrow window (700 wide), GM and player: in the corner with everything
  closed; hidden while Scenes, Tokens, the hero sheet or the chat fills the
  window.
- Reach outline, flat scene, speed 5, standing beside the blood: checked
  square by square against a hand count. It reaches 5 squares over dry
  ground, stops short in the blood, leaves out the x4 mud, and reaches round
  the canal by the dry row above it. Far from any zone it is the plain
  square. On Dead Root it follows the canal bank.
- Shift pop-up: not shown for a shift on dry ground; shown as soon as the
  drag enters blood; still one pop-up after wiggling the mouse and after a
  second shift; gone six seconds after the drop; the token moved.
- Labels: straight walk, diagonal walk, two legs, three legs, and the Dead
  Root "5 squares north into the canal" case. No label overlapped another,
  and on Dead Root the total did not touch a token.

Something I noticed that is not part of this work: twice the test browser's
page crashed while my script kept trying to click a button that was hidden
behind an open panel (once Templates after Damage/Heal, once a settings
button in a narrow window). It happened with the current `main` scripts as
well, and did not happen when the same steps were done without the stuck
click. I think it is the test tool on this short-of-memory PC, not a VTT
fault, but I have not proved that.

## Where it is now

You said to put it all on `main` on this PC and wait for your word before
pushing. That is done: `main` on this PC has the work, and it is not pushed.

## Questions waiting for you

1. Climbing a tall face at double cost: DND helper is confirming the exact
   rule with you. It is not built yet. All movement pricing now goes through
   one function, so it can be added in one place.
2. On Dead Root, should a token standing on a low deck count as out of the
   blood whatever the deck's height? (See "Things to know".)

## Stage 4: abilities read tags. Not started

"If the target is in blood, deal extra damage." I will pause and show you
stages 1 to 3 before starting this.

## Things to know

- The Map maker has built the real Dead Root Node package with zones (10
  zones, 331 squares) and reports that it imports cleanly on this branch.
  That package also fixes the fallen log, barge and planks (finding M4).
  Today's `main` refuses that package, so it needs this branch on `main`.
- A token counts as in a zone when its feet are less than half a square above
  the zone's surface. The low decks on Dead Root are only about a quarter of a
  square above the blood, so a token on them would count as in blood. The Map
  maker worked round it by leaving those 25 squares out of the blood zones.
  If you would rather the VTT treated "standing on a deck" as out of the
  blood whatever its height, say so.
- This work was built on a branch because three chats share one folder. Your
  instruction on October 7 was to put it on `main` locally and push only on
  your word.

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
