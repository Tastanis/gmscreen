# Floating plates

The record for this feature: what was scoped, what Brandon chose, what is built, what is open.
Written October 8, 2026 from the Map maker's Gravity Orchard test and a read of the drawing code.

## Built so far (October 8, 2026, evening)

Brandon said "go ahead" to three pieces. They are on `main` on this PC, not pushed. They have
been run in the real app in a browser, on a throwaway copy on this PC with the Map maker's
islands test map: imported through the Scenes screen, islands marked, the slant changed (once
through the Walls panel), viewed as GM and as a player. No page errors. Brandon has comparison
pictures of today's look beside slants 0.36, 0.18, 0.12, 0.09 and 0, for the GM and for a
player on the high island, the rim and the crater floor.

1. **The floating mark.** A floor plate marked floating is drawn with a short rock side, two
   squares deep, not a wall down to the ground. An unmarked plate is drawn exactly as before.
   The depth is one number (`FLOATING_SIDE` in `height-view.mjs`). On screen the side is the
   depth times the slant, so one square all but vanished at a third of the usual slant; two
   still shows as a rim of rock.
2. **The shadow.** Each floating plate casts a soft shadow on the ground straight under it, at
   its true place. It is drawn just above the map picture and under the fog, so a player sees it
   only where they can see that ground. It falls on the ground only, not on a lower plate.
   With no islands drawn above a hero on the crater floor, the shadows are how that hero knows
   where the islands are. At a flatter slant the shadow shows less from under its island (the
   island is drawn slant times height north of it), which is one reason not to go to zero.
3. **The slant.** A scene can carry one number for how far a square of height moves a thing up
   the screen: anything from today's 0.36 down to 0. Other scenes keep today's value untouched.
   You can change it in the **Walls** panel ("Height slant") and see it at once; it is saved
   with the map and is the same for every player.

None of the three changes a rule. Sight, movement, falls and climbing use the real heights.

### What the map package carries

In the scene's map design (`environment.walls.value`), which packages already carry:

- On each island's plate, in `roofs`: `"floating": true`. Only floor plates. Leave it off
  buildings.
- For the scene: `"view": {"slant": 0.12}`. A number from 0 to 0.36. Leave `view` out for the
  usual slant.

The server refuses a floating mark that is not true or false, a slant outside 0 to 0.36, and
any other setting under `view`.

The blank band on the picture has to match the slant: north, `slant x tallest height` squares;
east, a third of that. At 0.36 and 18 high that is 7 and 3. At 0.12 it is 3 and 1.

### What happens at a slant of zero

Seen in the browser: nothing breaks. The board becomes a plain view from straight overhead:

- Nothing is moved on screen by its height. Tokens sit on their own squares.
- Side faces have no size, so they are simply not there: no rock side, no building walls, no
  cliff faces. A higher plate covers whatever is under it.
- A shadow lies exactly under its island, so only its soft edge shows round the island.
- Clicks land where they point. The click rule is the drawing rule run backwards, and a test
  checks that it lands on a ramp at five slants, zero included.
- What you lose is any sign of height except the picture itself and the height badges on tokens.

### The shadow on a lower island

Not built. On the islands map the low and mid islands sit under the high ones in places, and
there the shadow falls on the ground beneath them all, where the lower island's picture covers
it. To have it fall on the lower island too, the floor-drawing code would paint, on each plate,
the outline of every floating plate above it. About half a day. It adds one soft fill for each
pair of islands that overlap, every time the view is repainted, so it needs a speed check on the
real map.

### Two viewing settings to try (built October 8, late; not yet seen in a browser)

Brandon, looking at the pictures: from on top he looks down and sees all the islands; from
below he needs to see some of the islands above, without them blocking anything important; and
he wants to settle it by trying. So both are switches, beside "Height slant" in the Walls panel.
They save with the map and are the same for every player. With neither set, every scene draws
exactly as before.

- **Floating plates overhead.** Not shown (as now); see-through shapes; or shapes for the
  nearest tier only. A shape is a see-through dark outline where the island is drawn. Clicks pass
  through it and tokens are drawn over it, so nothing under it is hidden or out of reach.
  "Nearest tier" is the lowest floating plates overhead and any others within half a square of
  that height: from the crater floor, the low islands only.
- **Unseen floating plates below.** Black (as now), or the island's picture dimmed. This is the
  simple version: it is always shown, whether or not that player has looked at it before. The
  version that shows only what a player has already seen is not built.

Floating plates only. A building's floor is never a shape and never dimmed, so the bathhouse
cannot show a lower floor through a stairwell. Creatures are untouched by both: shown or hidden
by line of sight as before.

One thing to know when trying the shapes: an island overhead is shown whether or not the hero
has a clear line to it. That seemed right for something that large hanging in the sky.

In the map package they are two more values under `view`: `"above": "off" | "shape" | "tier"`
and `"below": "black" | "dim"`.

### The empty strip at the south edge (built October 8, late; not yet seen in a browser)

With a slant, raised ground is drawn up the screen and to the right of where it lies. A rim along
the south edge of the map left an empty strip under it, 2 squares at a slant of 0.12; the same
happens on the west edge. That strip is the side of the ground where the map is cut off, so it is
now drawn as one: the ground's own picture at that edge, darkened.

**This also changes existing maps at their edges.** The bathhouse's west edge is 2 to 7 squares
high and Dead Root's is up to 3, so each gets a dark face there where the board's background
showed. It is only seen with fog off: for a player that strip was black and stays black.
It is a separate commit, so it can be left out of a push.

### The map at 30 high

The islands map now tops out at 30. Nothing in the code depends on the height, so these are only
the sums:

| Slant | Top island drawn north of its place | East | Rock side on screen |
|---|---|---|---|
| 0.36 | 10.8 squares | 3.6 | 0.72 |
| 0.18 | 5.4 | 1.8 | 0.36 |
| 0.12 | 3.6 | 1.2 | 0.24 |
| 0.09 | 2.7 | 0.9 | 0.18 |

- The Map maker's band of 6 rows north and 2 columns east fits 0.18 with half a square to spare.
  It does not fit anything steeper.
- The shadow under the top island shows up to 5.4 squares clear of it at 0.18.
- The ground has 15 squares of drawing room on every side at 72 pixels a square. No limit there.
- Tokens are drawn larger or smaller by how far above or below the viewer they are, and that
  stops at double and at half. A hero on the top island sees creatures on the crater floor at
  half size, and it cannot go smaller. That limit is old; 30 squares reaches it.

### Still open, for Brandon to decide by trying

- The number for the slant on the islands map.
- Which setting for plates overhead, and which for unseen plates below.
- Whether "dimmed" should show only what a player has already seen.
- The shadow on lower islands (above).
- (b) is settled: no code. The Map maker leaves a blank band sized for the chosen slant.

## The scoping note as first written

Times are for the coder; each also needs a look in a browser by the tester.

## The problem in one paragraph

The app shows height as a slanted view. Each square of height moves a thing 0.36 of a square up
the screen and 0.12 to the right. That was tuned for heights of 2 to 6 (a bathhouse floor, a
Dead Root cliff). On the islands map the heights are 6, 12 and 18. An island 18 high is drawn
six and a half squares north of where it really is, and the app joins it to the ground with a
solid dark wall, as if it were a building. Islands look like dark towers.

## The four proposals

### a. A plate can be marked floating: no side wall down to the ground

- **Today.** Every edge of every floor plate gets a solid dark face from the plate's height down
  to whatever lies under that edge: the next plate below, or the ground. One flat colour.
- **Change.** A plate may carry a mark in the map package. The app draws a marked plate's side
  only a set depth, not down to the ground. The server has to accept the new mark; the Map
  maker's converter has to write it.
- **Size and risk.** About half a day. Low risk: nothing changes for a plate without the mark.
- **Existing maps, unmarked.** Exactly as now. Dead Root's decks and walkways and the bathhouse
  floors and balcony keep their sides. They should stay unmarked: a balcony with no side would
  let you see under a building.
- **Player knowledge.** No change. Whether the ground behind an island can be seen is already
  decided by line of sight, separately. The wall was only covering the picture.

**Your choice:**
1. No side at all. The island is a paper-thin sheet in the air.
2. A short rock side, one or two squares deep. The island reads as a slab of stone. (My pick.)

### b. The drawing area is sized to the tallest thing in the scene

- **Today.** The ground has plenty of spare drawing room on every side. Floor plates, the fog
  and the zone outlines do not: they are cut off at the edge of the map picture. A plate 18 high
  needs six and a half squares of room to the north and about two to the east.
- **Size and risk of doing it in code.** A day to a day and a half. Medium risk: it moves where
  the fog layer starts, and the remembered fog ("where I have been") on every scene would be
  wiped once.

**Your choice:**
1. No code. The Map maker leaves a blank band on the picture: 7 squares along the north edge
   and 3 along the east. It makes the picture about 8% bigger. (My pick.)
2. Code. The app makes the room itself on every scene.

### c. Lower plates the viewer cannot see are dimmed instead of blacked out

- **Today.** A floor plate is painted solid black, then its picture is painted only where the
  viewer has a clear line to it. Sight is true 3D, so the viewer's own island hides most of what
  is below: from the middle of an island a lower island is a black box. Plates are never
  remembered the way the ground is.
- **This changes what a player is shown.** They would see the picture of parts of a lower floor
  they have no line of sight to. Not creatures: a creature is still hidden unless seen.
- **Existing maps.** It must be tied to the floating mark. On the bathhouse it would show the
  layout of rooms on the floor below through a stairwell.

**Your choice:**
1. Leave it black.
2. Always show a floating island below you, dimmed, whether or not you have seen it. Half a
   day, low risk. A hero sees the tops of lower islands they have not looked at yet.
3. Show dimmed only what that player has already seen, like remembered ground. A day and a half
   to two days, medium risk. Tells the player nothing new.

### d. Plates above the viewer are shown faintly to a viewer below

- **Today.** A floor at or above the viewer's head is not drawn at all. A hero on the crater
  floor sees only the crater floor.
- **This changes what a player is shown.** They would see that an island is there and its
  outline. A hero looking up would see that anyway. Creatures on top stay hidden unless there is
  a line of sight to them.
- **Existing maps.** Tied to the floating mark, none change.
- **One catch.** The island is drawn north of where it is, so its shape lies over ground the
  hero may be looking at. It has to be see-through.

**Your choice:**
1. Leave it out.
2. A flat, see-through dark shape: "something is up there, this big". Half a day, low to medium
   risk. (My pick.)
3. The island's own picture, faint. Same work, but it shows what is on top (pillars, pools,
   landing marks), which a hero underneath could not see.

## Simpler ideas

### A shadow on the ground under each floating plate

With the wall gone, an island needs something to say where it really is. A soft shadow straight
below it does that, and it is the true footprint for "who is under the island". Drawn under the
fog, so it shows nothing a player cannot see. About half a day on top of (a). First version:
the shadow falls on the ground only, not on a lower island.

**This plus (a) with a short rock side gets most of the look for about a day.**

### A flatter slant for one scene

One number per scene for how far height moves things on screen. At a third of today's slant an
island 18 high moves 2.2 squares, not 6.5. That removes the cut-off without a blank band, makes
every side wall a third as tall, and keeps things nearer where they really are. About a day,
medium risk: the slant is written into six places, including where a click lands. Other scenes
are untouched. The cost: height looks less dramatic, and cliffs look shorter.

## One limit none of this removes

Creatures are always drawn above every floor. A creature on the crater floor that stands where
a high island is drawn (six and a half squares north of the island's real place) is drawn on
top of the island's picture. With heights of 18 that will happen often. The flatter slant cuts
it by two thirds. Nothing else here touches it.

## What I would do, in order

1. (a) with a short rock side, plus the shadow. About a day. Look at it.
2. (b) by a blank band on the picture. No code.
3. (d) as a see-through shape. Half a day.
4. (c): leave black for now. Decide after seeing the first three.
5. The flatter slant only if it still reads badly after that.

## Other limits the test found (for the record)

- Five floors is the app's maximum.
- A floor's height must be a whole number.
- A floor with no plate acts as an endless floor. Never ship an empty one.
- Every picture in a package must be full map size.
