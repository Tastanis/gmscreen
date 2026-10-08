# Terrain zones and difficult terrain: status

Plain-language progress for Brandon. Updated at the end of each stage.

**Where the work is:** everything here is on `main` in the shared folder on
this PC (`C:/Users/tasta/Desktop/gmscreen`). Work up to the first October 8
section is on GitHub. The second October 8 section (fixes from the final test)
is on `main` on this PC only until it is pushed. The live site changes only
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

**7. Not fixed: the range outline beside the bridge.** From (36,24) on Dead
Root the ruler prices (31,24) at 5 and the outline leaves it out. Reading the
code, the ruler and the outline price each step the same way, so I could not
find the cause without watching it run. The height rule above changed the
outline's sums and may have moved it. It needs the tester to look again.

Checks run: full suite 152 files, 1099 checks, 0 failures; every server test
passes. Not yet seen in a browser: any of it. The tester re-runs these checks
next.

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
