# Floating plates: what it would take

Scoping only. Nothing here is built. Written October 8, 2026 for Brandon to decide, from the
Map maker's Gravity Orchard test and a read of the drawing code. Times are for the coder; each
also needs a look in a browser by the tester.

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
