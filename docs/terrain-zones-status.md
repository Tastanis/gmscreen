# Terrain zones and difficult terrain: status

Plain-language progress for Brandon. Updated at the end of each stage.

**Where the work is:** everything here is on `main` in the shared folder on
this PC (`C:/Users/tasta/Desktop/gmscreen`). Everything up to and including
"fixes from the final test" is on GitHub. The last section, "after the
re-check", is on this PC only until it is pushed. The live site changes only
when you deploy from cPanel.

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
- **Ruler colours on maps with height.** Black on the flat, green uphill,
  yellow downhill. Red is now used only for difficult terrain. (Uphill and
  downhill were the other way round until October 8; see "October 8" below.)
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
  drew yellow, down it drew green (the colours before the October 8 swap).

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

## Climbing, swimming and decks. Built (October 7, 2026)

Built and checked in the sandbox after stages 1 to 3, on the branch
`claude/climbing`. It joins `main` together with the push you approved.

### What a cliff is

A cliff is a face steep enough to stop forced movement. It is the same test
the push, pull and slide code already uses, so the two cannot disagree. A ramp
or a staircase is never a cliff, however long.

### What a climb costs

The rulebook's rule, as you decided: each square climbed costs 2 squares of
movement, and a one-square vertical is not a climb.

- A 2-high face costs 4, a 3-high costs 6, a 4-high costs 8.
- A 1-square ledge costs 1 and is never asked about.
- A climb into difficult terrain adds the two costs; it does not multiply.

The one setting is `CLIMB_MIN_HEIGHT` in `terrain-math.mjs` (2).

### Going up

When a walk or a shift goes up a cliff, a pop-up appears after you let go of
the token and before the move is sent:

> **Climbing.** Walker climbs 4 squares. This move costs 8 (4 extra for the
> climb). Only 5 movement left this turn.

- **Climb** (or Enter): the move goes through and the counter is charged.
- **Don't climb** (or Escape): the move is never sent and the token goes back.
- One pop-up per move, never one per square. Arrow-key moves are asked too.
- On the ruler the climb keeps its green uphill line and gets a small amber
  "x2". Red stays for difficult terrain. The range outline prices climbs too.
- Nothing is enforced. Answer Climb without enough movement and the token
  still moves; the counter shows it over.

### Going down

When a creature walks or shifts off an edge and the fall would do damage, the
fall review you already have gains a third button:

- **Apply**: take the fall damage, as before.
- **Climbing**: no damage, not prone, and the climb's extra movement is added
  to this turn (walking off a 4-high edge: 4 already counted, 4 more).
- **Dismiss**: no damage and no extra movement. This is your "cancel".

A creature that was pushed, pulled or slid over the edge gets the ordinary
review with no Climbing button. Whoever made the move gets the pop-up, as
before: a player for their own hero, the GM for a monster.

### Who is not asked and not charged

- A creature with "climb" in its movement ("Climb", "Burrow, Climb", "Spider
  climb"). All the ghouls and rootgnawers in the Dead Root fight qualify.
  Going up it is never asked. Walking off an edge it simply climbs down: no
  pop-up, no damage, no Climbing button. Pushed off an edge it falls like
  anyone else. If it lands on another creature the fall review still opens.
- A flier (fly or hover mode).
- Forced movement and teleports.
- Heroes are always asked.

### Swimming

- A zone is **liquid** when its tag is one of: water, blood, liquid, oil,
  acid, slime, sewage. That list lives in one place (`LIQUID_TAGS` in
  `terrain-zones.mjs`). Mud and lava are not on it. Nothing in the map format
  changed and the Map maker's converter needs no change.
- A creature with **"swim"** in its movement pays no extra movement in any
  liquid zone. Everyone else pays the zone's cost (the book's double).
- A creature whose movement says **"walks on X"** or **"walks on X and Y"**
  pays nothing extra in zones with those tags. Kragen Thornwhisper's "Walks on
  water and blood" works as written.
- Only the cost is waived. The creature is still in the zone and still has its
  tag, so "is it in blood?" still answers yes.
- It applies to the ruler, the turn counter and the range outline alike.

Exactly what the movement text understands, for whoever writes monsters:

| Text | Effect |
|---|---|
| the word `swim` anywhere: "Swim", "Swim 4", "5 swim", "Swim, Climb" | no extra cost in any liquid zone |
| the word `climb` anywhere: "Climb", "Burrow, Climb", "Spider climb" | never asked about climbs, never surcharged |
| `walks on water`, `walks on water and blood`, `walk on mud or oil` | no extra cost in zones with exactly those tags |
| anything else ("Ignores difficult stone terrain", "Hover") | no effect on zones or climbs |

Separate items with commas. Join the tags after "walks on" with "and", not
with a comma: "Walks on water, blood" is read as water only. Two words become
one tag with a hyphen ("deep water" matches a zone tagged `deep-water`).

### Decks

A token standing on a deck, plank or any other floor plate is out of the
liquid zone under it, whatever the gap. Before, a deck less than half a square
above the liquid still counted as wading. A plate that is at or under the
surface still counts as in the liquid. Ground that is not a plate (a rock that
is only a bump in the terrain) still uses the half-square rule, so the map
should either make it a plate or leave its squares out of the zone.

**Bridges that end on the land.** A walker standing level with a deck it
overlaps now counts as on it when it starts to move. Before, it only got onto
a deck by crossing the deck's edge at deck height, so a creature that climbed
up beside a bridge and stood where the bridge meets the land could drop
through the bridge on its next step. "Level" means within a tenth of a square.
So a bridge end can lie over the landing square again; it does not have to
stop exactly on a grid line.

**The ruler follows bridges.** The ruler's preview now walks the route the way
the move itself does, stepping onto a bridge or deck and staying on it. Before,
a walk that entered a bridge from the land was priced as a drop to the ground
under the bridge and a walk along it: four squares out onto a rope bridge read
"Move 6", and a whole crossing would have raised a false Climbing pop-up at
the far bank. Now a crossing costs its length and the line is drawn along the
bridge. One limit: the range outline still does not know about bridges entered
from the land, so near a bridge it can be drawn too small.

### Checks run

- Full suite with the scene-switch fix underneath: 144 files, 1032 checks, 0
  failures.
- Bridges, real drags on the package: from the land out along a rope bridge
  "Move 4" (was 6); a whole land-to-land crossing "Move 9" with no pop-up
  and no fall.
- Sandbox, Dead Root Node, real mouse drags, GM: up a real 4-square cliff the
  ruler read "Move 4 · Cost 8" with the amber mark; the pop-up showed the
  text above; Don't climb left the token where it was; Climb put it on top.
  Walking back off showed Dismiss / Climbing / Apply with "Climbing: no
  damage, 4 more movement"; Climbing left Stamina at 50, not prone; Dismiss
  changed nothing; Apply took 8. Forced over the same edge: Dismiss / Apply
  only. A Sluice Ghoul went straight up with no pop-up and "Move 4", and
  walked back off the same edge with no pop-up and no damage ("Climbed
  down."); pushed off it, the ghoul got the ordinary fall review.
- Bridge landings, checked with the server's own code against the package's
  real geometry: the three rope bridges have six landing squares. With the old
  rule two of them missed the bridge (the land there is one or two hundredths
  of a square higher than the deck); now a walker on any of the six is carried
  two squares out over the drop with no fall.
- Sandbox, player (Cal): the same pop-up for their own hero, Don't climb
  refused the move, Climb moved it, and the fall review with Climbing came to
  the player.
- Sandbox, the Map maker's zoned Dead Root package (10 zones, 331 squares),
  three squares from dry ground into blood and into water: Sluice Drowner
  "Move 3"; Kragen Thornwhisper "Move 3"; Sluice Ghoul "Move 3 · Cost 6"; Cal
  "Move 3 · Cost 6". All four still showed the tag of the liquid they ended
  in.
- Sandbox, the package's two low decks (0.283 and 0.287 above the blood): with
  the deck squares put back into the blood zone for the test, a hero on the
  deck had no blood tag and walked along it for "Move 1" with no extra cost.
  The package's own zones were restored afterwards.

Things you should know:

- A drop that would do no damage raises no fall pop-up at all, as before. A
  2-square drop with Agility 1 or more is one. There is then no Climbing
  choice and nothing is charged.
- The Climbing button is offered for any walked fall, including stepping off a
  bridge or a deck, not only off a rock face.
- Where the 3D view hides the top of a cliff behind its own face, the mouse
  cannot pick the top square. That is how the map already behaved.
- A swimmer in water gets no "No shifting in difficult terrain" warning,
  because for that creature the water costs nothing extra.
- The zoned Dead Root package has one-way walls on every cliff edge (754 of
  them), so on that map players cannot walk up a cliff at all and the climb
  pop-up will only ever appear for the GM, who is not stopped by walls.
  Whether those walls stay is your call.
- Part-way up a cliff (stopping on the face) is not built. The pop-up shows
  the cost and the movement left so the table can see it is a two-turn climb.

## October 8: ruler colours swapped, and three small fixes. Done

Built straight on `main` on this PC. These replace the separate copy of this
feature a cloud chat had built on its own branch
(`claude/gm-screen-coding-mg17mf`). That branch is not merged and is no longer
needed; everything worth having from it is listed here.

**1. Green up, yellow down.** You changed your mind on October 8: "Green up,
yellow down. Red difficult". The drag ruler now draws uphill green and downhill
yellow. Flat is still black and difficult terrain is still flashing red. The
slope arrows painted on the map are untouched, as you asked; they only show
steepness.

**2. Red covers the difficult squares exactly.** The flashing red stretch used
to run from the middle of the square before the blood to the middle of the
blood square, so it started half a square early and stopped half a square
short. It now starts at the edge where the route enters a difficult square and
stops at the edge where it leaves. The "x2" mark is still in the middle of the
square. You did not ask for this one; the cloud chat spotted it and it is
right.

**3. The ruler on flat maps is plain black.** On a map with no height the ruler
used to fade from red at the token to black at the far end. With red now
meaning difficult terrain, it is black all the way. Also not asked for by
name; it follows from "black for flat ground, red for difficult".

**4. An old checkpoint no longer wipes zones.** Restoring a layout checkpoint
that was saved before a scene had zones used to remove the scene's zones. It
now keeps them (less any zone on a floor the checkpoint does not have).

Checks run: 7 new checks. Full suite 150 files, 1081 checks, 0 failures; all
server tests pass. Not yet looked at in a browser: the red stretch on a map
with height (Dead Root). The flat-map drawing is covered by the new tests.

## October 8, later: fixes from the final test. Done, waiting for a re-test

The tester's final run (`docs/final-pass-sandbox-test-2026-10-08.md`) found
eight faults in the app. Seven are fixed on `main` on this PC; one is not.
Each has its own tests. Nothing is pushed.

**1. A refused ability gives its Malice back.** Using Up the Taproot a second
time in an encounter was refused but still took 3 Malice. A monster's Malice
is taken before the ability is checked, so every refusal kept it. Now a
refusal for "once per encounter", "once per round", "once per turn" or
"triggered action already used" returns the Malice, and chat says
"Up the Taproot was not used: 3 malice returned."

**2. A pull never slams the target into the puller.** Drag Under on a hero
already beside the Drowner read "pulled 0 squares, Collision, each take 1".
Now:

- A pull that cannot bring the target any closer does nothing. No square to
  pick, no damage. Chat says "Cal is not moved: there is nowhere to pull them."
- The puller's own square is never offered. Clicking the puller means "as
  close as the pull allows".
- A pull can still slam the target into a *different* creature standing in the
  way. That is the rulebook.

**A token is never left between squares.** A creature in the way of a push,
pull or slide at a slant used to stop the moved token half-way across a square
(row 18.5). It now stops in the last whole square before contact. The damage
is the same as before. This also applies to a GM's Ctrl-drag.

**3. The ruler does less work.** Each time the ruler redrew it walked the same
route three times, and twice more for every red square. It now walks it once
and reuses the answer. What is drawn and priced is the same. I cannot time it
here; the tester will.

**4. A size 2 token uses a narrow stair.** A stair is climbed by the middle
point of the token. A size 2 token's middle runs exactly along the side of a
one-square stair, so it counted as neither on nor off and never changed floor.
The app now uses the part of the token that is on the stair. This was the
app's fault, not the map's: stairs do not need to be wider. Checked against
the real bathhouse stairs, both of them, up and down.

- A token standing fully beside a stair still ignores it.
- **This changes old scenes a little:** a big token with only part of itself
  over a stair will now climb it. Before, it walked across.

**5 and 6. One rule for how high a rock face is.** The real height, to the
nearest whole square.

- Under one and a half squares: a one-square step. Never a climb, no pop-up,
  costs 1.
- One and a half or more: a two-square face. Pop-up, costs 4.
- A 3.75-high face is 4 squares going up **and** 4 coming down. Before, it
  was "climbs 4" up and "fell 3" down.
- The ruler, the pop-up, the range outline and the fall review all use it.
- **This changes falls on uneven ground:** a fall used to round down. A 3.75
  drop is now 4 squares (8 damage before Agility) where it was 3 (6). A drop of
  1.5 to 1.99 is now a 2-square fall where it was 1.

**8. Two small ability fixes.**

- A zone check with nobody targeted (an area placed where nobody stands) no
  longer asks "Is the target in hot spring water?". It does nothing.
- A long teleport no longer lists squares off the map. Elowin's teleport 60
  offered 14,640 squares; it now offers only the map.

**7. The range outline beside the bridge: closed, nothing to fix.** The
tester re-ran it step by step. The ruler and the outline both price (31,24)
at 5 and the outline includes it. The earlier report was a mistake in the
test tool's way of reading the outline.

Checks run: full suite 152 files, 1099 checks, 0 failures; every server test
passes. Not yet seen in a browser: any of it. The tester re-runs these checks
next.

## October 8, after the re-check: two more fixes. Done, waiting for a re-test

The tester re-checked the seven fixes in a browser. All seven passed. It found
two things left over.

**A pull could still clip the puller.** With the target two squares away, the
picker offered the two squares directly beside the puller that are reached at
a slant. Picking one stopped the pull a square short and scored a collision
with the puller.

- The book says each square of a pull must bring the target closer. A step
  that only runs along the puller's side is not closer, so those squares are
  no longer offered. From two squares away, a pull now offers the three squares
  on the target's side of the puller.
- If you click one of those squares by hand anyway, the pull goes to the
  nearest offered square. A pull never damages the puller.
- Pushes are unchanged.

**A bank that is a climb going up was not always a fall coming down.** Of 67
two-square banks on Dead Root, walking or being pushed off 26 of them was no
fall at all, and 5 were a fall of 1. Two causes: the fall only counted where
the ground dropped sharply, and it was measured from the edge the creature
went over, not from the middle of the square it left, which is where a climb
is measured.

- A fall is now measured from the middle of the square the creature left.
- A bank that would be a climb of two squares or more going up is a fall of
  the same number coming down.
- **This changes falls on existing maps:** a creature pushed off a 1.9-high
  bank now falls 2 squares (4 damage before Agility) where it took nothing. A
  few faces change by one square to match their climb, in either direction.
- Under the climb line nothing changed. A bank under one and a half squares is
  still a plain step, and a long hill is still not a fall.

Checks run: new tests on both sides for each. The whole suite was run later
the same day and passed.

## October 8, evening: pushed along a ramp. Done, waiting for a re-test

From the Map maker's test of the floating islands map. A creature pushed along
a sloping arch between two islands dropped through it to the ground ("fell
17"). Walking the same arch worked.

The cause: only a walking creature was ever treated as being on a stair or
ramp. A pushed one was treated as standing over the hole in the floor that the
ramp crosses. That was a rule from September, written before ramps had real
heights.

- A creature pushed, pulled or slid along a ramp or stair now stays on it and
  changes height with it, the same as one that walks it. Pushed past the end,
  it is on the floor at that end. Both directions.
- Pushed off the side, it falls from the height the ramp has at that point.
  That part already worked.
- A size 2 creature half off the side of a two-wide ramp stays on. All the way
  off, it falls.
- **A ramp too steep to be a slope does not carry a pushed creature.** The
  line is a rise of one and a half squares per square, the same line at which
  a step up becomes a climb. The vines on the islands map (a whole floor in
  one square) are over it: a creature shoved off an island where a vine hangs
  falls, the same as over any other edge. Walking a vine is unchanged.
- **This changes the bathhouse.** Its two stairs rise two thirds of a square
  per square, so they carry. Before, a creature pushed up the stairs stayed on
  the lower floor and ended up underneath the upper one, and one pushed down
  from the top was put straight onto the lower floor. Now a push takes it up
  or down the stairs as a walk would, and it arrives on the right floor.
  Checked on the real bathhouse package, both stairs, both directions. Dead
  Root has no stairs or ramps, so nothing changes there.
- A second fault found on the way, also fixed: moving two or more squares from
  a floor plate onto a ramp in one move was recorded as a short fall even
  though the creature was standing on the ramp. This happened to walking too:
  two squares down either bathhouse stair from the top was "fell 1", four
  squares down the islands arch was "fell 2", and one step onto a vine was
  "fell 3". Going down a ramp is no longer a fall, however far one move goes.

One limit left as it was: two creatures on the same ramp that came onto it from
opposite ends are on different floors as far as the app knows, so a push does
not make them collide. A creature pushed up a ramp from the floor at its foot
is also not checked against creatures more than two squares up the ramp.

Checks run: a new server test on a small islands scene (arch, vine, three
islands), every move run through the real server; the floor, fall, stair, wall
and collision tests still pass. One older test said "forced movement never
climbs stairs"; it now says the opposite. The browser shows what the server decides here, so
there is no separate browser rule to keep in step.

## October 8, evening: the ruler on ramps between upper floors. Done, waiting for a re-test

Also from the islands test. The ruler showed 12 for the last step down the arch
and 9 for the last step down the vine, where the step costs 1 and 3. The move
itself was charged correctly.

The cause: the ruler asked "how high is the ground here?" one square at a time,
with the token as it stood when the drag began. It did not know that a walker
who comes off the foot of a ramp is then on the floor at its foot, so it took
that last step to be a drop all the way to the ground under the islands. A whole
drag showed the same fault: 20 down the arch and 21 up it, where both are 9,
and 12 each way on the vine, where both are 6. My test reproduces all five of
those numbers from the old code.

- The ruler now walks a ramp or stair the way the move does. It is carried
  along it, and once it walks off the far end it is on the other floor.
- The arch costs 9 each way, in one drag or square by square. The vine costs
  3 and 3. A size 2 token on the two-wide arch is priced the same way.
- Stepping off the side of a ramp is still priced as the drop it is.
- The reach outline uses the same rule, so from a ramp it now reaches the
  island at the foot.
- **This changes the ruler on the bathhouse stairs.** I first wrote that the
  price there was already right. It was not: the tester measured 5 for each
  4-square stair, both ways (see the next section). Past the top of the stairs
  the ruler line was also drawn at ground height, as if under the upper floor;
  it is now drawn on the upper floor and meets the upper floor's zones.
- A walk that does not touch a ramp is priced exactly as before. Scenes with
  no ramps are untouched.

How the two sides are kept the same: the browser now has its own copy of the
server's stair rule. A test runs 1,598 moves over stairs of five shapes, with
tokens of size 1 to 3, and checks every answer against the answer the server's
own code gave.

Not yet seen in a browser. The part that joins this to the live board cannot be
run outside one; the rule itself and the prices are tested.

## October 8, late: a stair over the floor it rises from. Done, waiting for a re-test

The tester checked the two faults above on the bathhouse, on the build from
before my fixes, and found the ruler charged 5 for each 4-square stair, up and
down. Down was the fault already fixed above. Up was a second one.

The lower floor of a building runs on under its stairs. A token that started on
that floor was held at the floor's height all the way up the stair (0, 0, 0)
and then rose the whole two squares in the last step. The server said the same
thing about where the token stood, so the token was also drawn at floor height
while "on" the stair.

- A creature being carried by a stair now stands at the stair's height, even
  while the floor it came from is still under it. Server and browser.
- Both bathhouse stairs, walking and pushed, up and down, on the real package:
  the heights now run 0, 0.33, 1, 1.67, 2 (and 2 to 4 on the upper stair), with
  no fall. Each stair costs 4.
- A creature standing under the stair that never came onto it, or that walked
  in from the side, still stands on the lower floor.

## October 8, night: dragging tokens on raised floors. Done, waiting for a browser look

Two things from the tester's last look. Both were in how the app works out which square is
under the pointer on a board drawn with a slant.

**The first drag of a token that was not selected could land a row off.** Pressing on the token
selected it and read the start of the drag in the same instant, and the two did not agree about
height. The error was the floor's height times the slant: a row and a half on the bathhouse
balcony, five rows on an island 30 high.

- A drag now starts from the grabbed token's own place, at the height it stands at.

**The pointer was read against the wrong floor.** Only floors at or below the selected token's
feet were considered.

- The pointer is now read against whatever is drawn under it for that viewer: the highest floor
  first, then a ramp, then the ground. For the GM that is every floor up to the viewing height;
  through a token's eyes, every floor below its head.
- An arch or stair can be pointed at along its whole length.
- **This changes the bathhouse a little.** With nothing selected, the GM's clicks, pings,
  templates and tokens dropped from the tray on an upper floor used to be read as points on the
  ground under it, so they landed off by the floor's height times the slant. They now land on the
  floor under the pointer.

**Dragging a hero onto a higher tier: decided, and closed.** When the GM picks up one token with
fog on, the board is drawn through that token's eyes, so tiers over its head are not on the
screen to point at. Making a drag put a hero on another tier would have meant keeping the GM's
own view during the drag and treating the drop as a placement. Brandon, October 8: "I dont want
to change code just for this because I'd have to change it back to make other maps work. So we
will leave it up to me to do." So a drag stays a walk, for the GM and for players. To change a
token's tier the Director uses the floor arrows; a hero walks the vine or arch, or teleports.

Checks run: 17 new tests, with the tester's two cases as tests and heroes on tiers at 6, 18 and
30 at slants of 0.12, 0.18 and 0.36. Not yet seen in a browser.

Also fixed from that look: the GM's height arrows step in whole squares. With a token selected
the view sits at that token's exact height (3.95 on a stair), and the arrows went to 4.95 and
2.95. They now go to 5 and 3. Since the Director moves heroes between tiers with these arrows,
this mattered more than it looked.

The two small ones from that look, done on October 8 (night), waiting for a browser look:

- **The selected token's card covered the Edits menu**, so "Walls" could not be clicked without
  deselecting first. The Edits, Walls and Height panels now move to just right of the card while
  a card is open, and back when it closes.
- **A sliver of painted door and window showed beside their rubble.** Doors and windows are
  painted thicker than walls and to one side of the wall line. Their rubble strip is now drawn
  1.4 squares high instead of 0.75, so its band covers about a fifth of a square either side.
  Walls are unchanged. If a sliver still shows, it is one number to raise.

## October 8, night: pushed or walking off an edge. Done, not yet seen in a browser

Found by the Map maker on the islands map. Not in the push that was cut at build 444.

**The fault.** A creature was measured at the height of the ground under it at every point of a
move. So a creature pushed off an island 18 squares up was "on the crater floor" the moment it
cleared the edge, and a crystal or stone tooth on the floor under its path stopped it. Pushes off
island tips were refused.

**The rule now**, the same for the server and the browser:

- While a mover has footing (ground, a floor, a ramp) it is at the height of that footing.
- When the footing drops away under it faster than a slope could, it has left its footing. From
  there it travels level, at the height it left from, for the rest of the move, however long.
  It falls when the move ends.
- So a wall, an object or a creature on the ground far below is not in its way. Anything that
  reaches its own height still is: a wall on its own floor, a spire that rises past it, a
  creature beside it, a cliff that stands above it.
- A pushed creature leaves its footing at any drop steeper than a slope (one and a half squares
  down per square along). A walker steps down small banks as before and leaves its footing only
  at a real fall (a square and a half or more), so walking off an edge is a step at the walker's
  height, then the fall.
- If the ground comes back up to it (another island at the same height across a gap), it has
  footing again.

**Vines and ladders.** A creature standing within two squares of the foot of any ramp, with no
record of how it got there, was taken to be standing on the ramp. That was meant for stairs. On
a vine it put a shoved creature half-way up the vine: a fall of 5 at the Taproot where it should
be 9. That allowance now applies only to slopes. A climb (anything steeper than one and a half
squares per square) holds only a creature that climbed onto it.

**On the real islands map (v15b), before and after:**

| Case | Before | Now |
|---|---|---|
| Crown (18 up), pushed 2 or 3 west over the floor crystals | 3 refused | lands on the floor, fell 16 |
| Anvil (6 up), pushed 1, 2 or 3 south over the stone tooth | all refused | lands on the floor, fell 6 |
| A low island, pushed 12 west | stopped after 4 at something on the floor | goes the 12, fell 4 |
| Shoved into the square of a vine that reaches the floor | half-way up the vine, fell 5 | on the floor, fell 9 |
| Pushed off the side of an arch | 2 of 5 refused | lands on the floor, fell 11 to 21 |
| A creature on the floor pushed into the stone tooth | stopped | stopped |
| A player on the floor walking into the tooth | blocked | blocked |
| A player walking off the Anvil's edge over the tooth | (not tried) | allowed, fell 6 |

**This changes existing maps**, in these ways only:

- A creature pushed off a balcony, a stair's side or a cliff is no longer stopped by a low wall
  or a creature on the ground under it. It was before, wrongly. It goes its distance and falls.
  A wall that reaches up to the balcony's height still stops it.
- A creature pushed over a sheer drop in the ground itself stays level and falls at the end
  instead of following the ground down. Where it ends and how far it falls are the same; what
  it can hit on the way is not.
- A player who walks off an edge a square and a half or more high is treated the same way.
- No stair on the bathhouse is steep enough to be a climb, so nothing changes on its stairs. Of
  the map packages on this PC only the islands map has climbs.

**Falling onto an object** (a stone tooth, a crystal) was put to you as a ruling, and you gave
it: a breakable object breaks. That is built; see "Falling onto an object" in
`docs/breakable-walls.md`.

Checks run: 2 new test files (10 browser-side checks, 5 groups on the server through the real
store), the 26 related browser-side test files and every server test file. The whole suite has
not been run on this, and it has not been seen in a browser.

## October 9: pushes were very slow on a map of many floors. Fixed, waiting for a re-test

Found by the tester on the islands map: a push along the crater floor sometimes showed no
"Break through?" pop-up, and once did nothing at all.

**The cause was time, not the rule.** One push took the server 13 to 30 seconds on that map.
The pop-up did arrive, far too late, and other requests gave up waiting meanwhile. Every eighth
of a square, the app laid the token's square over the outline of every floor plate on the map,
the islands 6 to 30 squares overhead included, to ask "has it stepped onto this one?".

- A plate at a different height from the walker is now ruled out by its height first, before
  its outline is looked at. The same check, cheapest part first.
- Measured on the islands map: the slow part of one push went from 13.8 seconds to 0.03.
  The tester's two cases now answer in well under a second, with the same offer as before.
- The answers do not change. I compared the old and new check on 4,000 random walks: the same
  result every time. The same change is in the browser's copy, which drag previews use.
- This slowness was there before today's work, on any map with many plates. It only showed
  once a push had to ask the server a question first.

Checks run: 2 new browser-code checks, a new server check (a push under sixty islands in under
five seconds; it takes a fraction of one), every server test file, and the 35 browser-code test
files that touch floors, stairs and walls.

## October 9: an ability's push picker over a drop. Fixed, waiting for a re-test

Found by the tester on the islands map. When an ability pushes or slides a creature, the app
offers the squares it may go to. Clicking an offered square that hung over a drop sent the
creature to a different square: the one whose ground was under the pointer. A push of 3 off a
ledge 18 up moved the hero 4 and past the catch ledge; a push of 2 off the Anvil dropped him
onto the stone tooth instead of past it. On flat ground the picker was exact.

- A click is now tested against the offered squares as they are painted on the screen. The
  square you click is the square that is picked, whatever height it is drawn at.
- A click outside every offered square is read as before: the ground under the pointer.

Checks run: 4 new browser-code checks (squares drawn 6, 8 and 18 up, zoomed and panned, and
overlapping). Not yet seen in a browser.

The tester then found what was really wrong, in two parts.

**The offered squares over a drop were painted in the wrong place.** A square a pushed hero
could reach off a ledge was painted on the ground far below, not on the ledge or island under
it where he would land. Two of them lay nearly on top of each other on the screen, so a click
on one took the other, and you could not tell which square was the ledge.

- An offered square is now painted on the highest floor under it that is not above the
  creature: the catch ledge, the island below, a roof, or the ground when nothing is under it.
  That is the same choice the server makes for where a falling creature lands.
- Squares on the creature's own floor, and all squares on flat ground, are painted as before.
- A teleport's squares are unchanged; its height is chosen afterwards.
- **This changes the bathhouse a little:** a push off the balcony now paints its offered
  squares on the bath floor's own plate or a roof under them, where they used to be painted on
  the bare ground beneath. On that map the two are nearly the same height.

**A click outside the offered squares is acted on, at any distance.** With a slide of 2, a
click three squares away slides the hero 3. That is how the picker was written: its own status
line says "you can still choose a destination". It is put to you as a ruling, not changed.

## October 9: a stair could not be seen from the floor at its top. Fixed, waiting for a browser look

You said that on an island of the Gravity Orchard you could not see the
stairs and vines that hang off it, and saw the crater floor in their place.

**What was wrong.** It was the board, not the map, and it was the island at
the *top* of a stair. From the foot a stair was drawn. From the floor it
leads up to it was not: an arch disappeared once the hero stood more than one
square back from its top step, and a vine never showed at all. Two rules did
it:

- A stair's picture was drawn only for an eye above the stair's slope
  *carried on past its top*. Anyone standing on the upper floor is below that
  imagined slope, so they were treated as if they were under the stair.
- A line of sight to anything lower than your own floor is stopped by your
  own floor. That was applied to the stair hanging off that same floor.

On the bathhouse the same thing happened from an upper floor, but nobody
noticed: its stairs stand in a hole in the floor above, and the picture of
the floor below has the stair painted on it. The Orchard has nothing under
its arches but the crater.

**What happens now**, on every map:

- A hero whose eyes are at or above a stair's top sees its upper face, the
  same rule a flat floor already uses.
- A stair joined to the floor a hero stands on is looked for at that floor's
  height. It shows wherever that spot would show if the floor went on. A wall
  or a rock on the floor between the hero and the stair still hides it, and
  so does another floor in the way.
- Clicks follow the drawing: a click on a stair that is now drawn lands on
  the stair.

**What it changes on maps you already have.** Views through a token standing
on the floor at the top of a stair, or higher than the stair: the stair is
now drawn on its slope. On the bathhouse that is the upper floors looking at
a stair down from more than a square and a half back. Views from the foot,
the GM's height views and creatures are not changed: tokens are hidden or
shown by their own test, which was not touched.

**Checked without a browser**, by running the board's own sight code on the
two map packages: on the Orchard, 53 standing places on the islands at the
top of an arch or vine went from "not drawn" to "all of it drawn", none went
the other way, and every place at a foot is as before. Two places still do
not see a vine because rocks stand between. Tests:
`ramp-from-above.test.mjs`.

**Not changed, to know about:** a hero on a third, higher island sees a stair
between two lower islands only where their own island's edge does not cut
the view, as with the lower islands themselves; the unseen part of such a
stair is not drawn dimmed the way the unseen part of a lower island is.

## October 9: the ruler says the push and the fall apart. Done, waiting for a browser look

You said: "Push and fall should be separate."

When a token is dragged as forced movement (Ctrl held) off an edge, the ruler
used to add the drop to the count: two squares off an island six squares up
read "Forced movement 8". It now reads **"Forced movement 2 · Fall 6"**.

- The first number is the squares moved across the map, and nothing else.
- "Fall" is how far the creature drops when the move ends, in whole squares:
  from the height it travels at down to the island, ledge or ground it lands
  on. A drop of less than one square is not shown. With no drop the label is
  the squares alone, as before.
- A flier shows no fall. On a route with a bend, the fall is read from the
  last leg.
- Walks, shifts and the plain Measure tool are not changed.

The drag has no push, pull or slide of its own, so its word stays "Forced
movement". An ability's push offers squares to click and has no count label,
so there was nothing to change there.

Tests: `ruler-label-layout.test.mjs`. Not seen in a browser yet.

## October 9: moving a token was very slow on Dead Root. Fixed, waiting for a browser look

You said Dead Root was "really slow" when you moved a token. Measured in your
own browser, each move froze the board for about a third of a second.

**What was wrong.** Three things, none of them the map's fault:

- Every move worked out the whole sight picture **twice**. After a move the
  GM's faint wall lines were drawn again (your viewing height follows the
  token, and the ground on Dead Root is never quite level), and each time
  they were drawn they told the rest of the board "the walls have changed",
  which they had not. So sight was worked out again from nothing.
- Drawing those wall lines was slow in itself: for each of about two thousand
  points it asked afresh how high you were viewing from.
- Each line of sight looked at every wall on the map (about eleven thousand
  lines a repaint, against several hundred walls), and made and sorted a list
  of the pieces of ground it crossed.

**What happens now.**

- Sight is worked out once for a move. Zooming no longer works it out at all,
  since zooming does not change what can be seen.
- The wall lines read your viewing height once for each redraw.
- A line of sight looks only at the walls that lie in its own direction, and
  walks the ground it crosses without making a list.

**What you see does not change.** This is the pass mark: the same squares
lit, the same creatures seen, pixel for pixel. Checked without a browser on
Dead Root, the Gravity Orchard and the bathhouse: 105 standing places, the
sight picture and 400 creature checks at each, all identical before and
after. The sight work itself takes about half the time it did on all three
maps (Dead Root 52 to 26 thousandths of a second for each place, the
Orchard 132 to 76).

**What I could not measure.** I have no browser, so I do not have the new
figure for a move on your PC. From the pieces, a move should go from about
300 thousandths of a second to roughly 100. The tester will measure it. If
it is still not smooth, the next thing to look at is the painting itself
(the picture is over four thousand pixels wide), which only a browser
profile can show.

**Maps.** Many small objects are fine. "Pass" walls cost sight nothing. The
Map maker does not need to draw objects differently.

**Later the same day, from your two requests.**

- "It could just check for only doors and windows instead of redrawing
  everything." Done. With the Walls panel closed, the faint wall lines are
  no longer drawn again when a token moves. They are drawn again only when
  your viewing height has moved an eighth of a square from where they were
  drawn (stepping onto a deck, going up a floor), when you zoom, or when a
  wall changes. The door and window buttons are still put back after each
  move, and that now costs nothing on a map with no doors. With the Walls
  panel open the lines follow your height exactly, as before.
  *What this changes:* as GM with a token selected, the faint lines can sit
  up to three pixels off where they were drawn before, because they wait for
  that eighth of a square. Nothing a player sees changes.
- What each viewer has explored was saved a third of a second after every
  move, and saving read back a picture half the size of the map (about 70
  thousandths of a second each time on your PC). It is now saved once the
  board has been still for two and a half seconds, never later than twenty
  seconds, and when the page is hidden or closed.
- "Make the sight calculations faster while minimally reducing accuracy."
  Not built yet; here is what it would buy, measured on the packages:

  | | Sight work left | What it costs |
  |---|---|---|
  | As it is now | 100% | nothing |
  | No half-square detail beyond 12 squares from the viewer | about 60% | about 3% of the lit area wrong on Dead Root (2% on the Orchard): far shadow edges go blocky, up to three quarters of a square out |
  | Skip the "middle of the square" check beyond 12 squares | about 77% | under 1% of the lit area, but a small far object's shadow can vanish |
  | Work sight out in the background | none of it felt | no loss of accuracy; the fog follows a fraction of a second after the token |

  The last one is what I would do, but it has to be built with a browser to
  hand, because it touches the part that keeps the map hidden from players
  until their fog is ready. Say which you want once the new build has been
  measured on your PC.

Tests: `sight-speed.test.mjs`.

## October 9, evening: sight is worked out in the background. Built, waiting for a browser look

Build 452 halved the freeze on a token move but you still felt it. You chose
working sight out in the background: "okay lets do that."

**What happens now when a token moves.**

- The token moves at once. Nothing waits on sight.
- Creatures are shown or hidden in the very frame the token arrives, exactly
  as before. So are doors, windows and the tops of decks and upper floors.
  None of these wait.
- The lit ground follows a moment later. It is worked out a few thousandths
  of a second at a time between frames, so the board keeps answering the
  mouse and the keys while it is done.
- The finished picture is the same picture as before, piece for piece.
  Nothing is approximated.

**Nothing that should be hidden stays up.** While the new picture is being
worked out, the old lit ground stays on the screen. That is allowed only
when it shows nothing the new picture would hide: the same viewer, on the
same scene, floor and walls, and with the old lit ground already in that
viewer's memory of the map. Then the only thing "late" is brightness: ground
the viewer was looking at an instant ago is bright for a moment before it
drops to the dimmer "remembered" look. No creature, door or deck waits.
In every other case (first look at a scene, a change of floor, a wall
changing, a different token, memory switched off or just reset) the picture
is made at once, as it always was, and a player's map stays covered until it
is finished.

**Four quick arrow presses.** Your question: does it work out four moves or
just the last?

- *Before:* four. Each press was held in a queue and made in turn, and each
  one froze the board while its sight was worked out, which also held up the
  next press. That is why a run of arrows crawled.
- *Now:* the token makes its four moves promptly, and sight is worked out for
  where the token is. If a newer position arrives while one is being worked
  out, the older one is set aside and never shown. The same for any run of
  moves.
- *Explored ground is not lost.* The squares passed through are kept in a
  list (up to 32). Once nothing is waiting for the screen, each is finished
  quietly and added to what that viewer remembers, without being shown as
  lit. Walk four squares fast and you still remember what you saw from all
  four.

**Other savings in the same change.**

- Another token moving no longer works your ground out again, or redraws the
  decks: your view does not depend on where an ogre stands. Only the
  creature checks run.
- Going back to the square whose picture is already up costs nothing.

**What I could and could not check.** The answers are identical on Dead
Root, the Orchard and the bathhouse (105 standing places, as before). The
sight layer itself was run frame by frame on a stand-in page: the creature
is hidden in the arriving frame, the ground follows over several frames, one
picture is shown for four fast moves, the three squares passed are added to
memory afterwards, and a player's map stays covered until a finished
picture. What I cannot know without a browser is how long the frames are on
your PC. On your machine the sight sums themselves take about 35
thousandths of a second; the rest of the 142 you measured is something I
could not time, and if it is drawing rather than sums, this change will not
remove it. The page now reports the split itself (`visionPrototype.stats`:
`lastMs` for the arriving frame, `lastGroundMs` for the sums, how many
slices, and the delay before the ground appeared), so one move in the
browser will tell us.

**Not changed:** the second, shorter hitch when the server answers a move
(about 39 thousandths of a second). I could not find its cause without a
browser profile.

Tests: `sight-job.test.mjs`, `vision-tick.test.mjs`.

## Where it is now

You said to put stages 1 to 3 on `main` on this PC and wait for your word
before pushing. That is done: `main` on this PC has that work.

## Questions waiting for you

1. Should climbing down cost double as it does now, and should a plain fall
   still cost its height in movement?

Answered since: the climb cost follows the rulebook, and the cliff-edge walls
are the Map maker's to remove.

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
