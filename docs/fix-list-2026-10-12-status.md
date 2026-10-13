# The fix list of October 12, 2026: status

Plain-language progress for Brandon on the list he gave that day ("I need the following things fixed and
checked. some can just get fixed. but some need some investigation first."). One section per build, newest
last. Each build is on `main` in the shared folder on this PC until it is pushed, and the live site changes
only when you deploy from cPanel.

## Build 481: a forced move over a long drop no longer freezes (item 9)

Your words: "Force moving over a long drop, like 20 squares down, is freezing. Its like its calculating all
sorts of movement variations. but a force move should get to ignore the drops and stuff and just move in a
straight line. It usually works fine but on the gravity orchard map it froze the game pushing them from one
platform over another."

**The rule was already yours and is not changed.** A pushed creature goes in a straight line, travels on level
once it has left its footing, and falls when the move ends. Nothing on the ground far below its path stops it.

**What froze was the working out.** When a push is stopped by something, the app finds the stopping square by
trying the push about thirty times, shorter and longer. Every try read the footing at every place along the
path again, and each reading walked the path from its start. On a map with many plates, rocks and cut-outs
that multiplied up: on the Gravity Orchard one stopped push took the server 4 to 16 seconds, and the page did
the same sum in the browser at every movement of the pointer while a forced move was being aimed.

**What is different now:** the same answers, without the repeats.
- A place's footing is read once per push and remembered, on the server and in the page.
- The server no longer works out where the creature would stand after a leg of a move that nothing follows.
- The server knows a plate's outline when it sees it again, and no longer writes it out and hashes it at every
  eighth of a square.
- The page only lays out the floor cut-outs that reach the square being asked about. A floor with a hundred
  cut-outs was laying all of them over every square.

**Measured on the live Gravity Orchard package** (a creature on every platform pushed 3, 6, 10 and 16 squares
in all eight directions, with and without other creatures in the way; 503 pushes on the server, 384 in the
page's own rule):
- Every plan is identical before and after: the same stopping square, the same damage, the same creature hit.
- Server: slowest push 15.9 seconds before, 0.36 after. All 503 together: 397 seconds before, 26 after.
- Page: slowest 3.8 seconds before, 0.05 after.

**Not in this build:** ability pushes offered in a straight line only (you said yes to that on the same day);
it changes what the picker offers, so it is the next build and not mixed into this one.

## Build 482: an ability's push or pull goes in one straight line

Your words: "Ability pushes go in a straight line, yes."

**Before:** when an ability pushed a creature, the picker lit up a fan: every square that was further from the
pusher. A push could go off at an angle.

**Now:**
- A push lights up one line of squares: from the pusher, through the target, and on, as far as the push goes.
  A pull lights up the line from the target toward the puller, ending beside the puller.
- Straight ahead, straight to the side and a true diagonal are plain rows of squares. At any other angle (a
  pusher two across and one up from the target, say) the line steps over as it goes.
- You may still stop short: any square on the line can be picked.
- A click anywhere else is taken as the nearest square on the line, so aiming is forgiving.
- Clicking a creature that stands on the line slams the target into it with the whole distance, as before.
  A creature off the line is only a place to aim at.
- The server holds an ability's push or pull to that line and refuses one that is off it ("A push goes in a
  straight line away from the pusher.").

**Not changed:**
- A slide. It may go round things and is offered any square, as before.
- Your own forced drag by hand (Ctrl-drag). It goes where you put it; that is how you overrule the line.
- What stops a push: walls, creatures, slopes, breaking through, the fall at the end.

## Build 483: undoing a push mends the wall it broke (item 1)

Your words: "I need a way to undo a breakthrough or to reset the broken walls on a map."

**Undo a breakthrough.** When a push breaks through a wall, Undo Move on that push now does both halves: the
creature goes back where it was pushed from, and the wall (or the whole object, or the cubes of a summoned
wall) it broke is whole again. Everyone's page hears the wall mended, then the move back.
- It is the mover's own Undo, with the same limits as any Undo Move: the person who made the push, and only
  while the creature has not been moved again.
- Damage already applied from the slam or the break is not taken back. That is as it was for any undone move.
- An undo that is refused mends nothing.

**Reset the broken walls on a map.** This was there already, and I have not moved it:
- Open the Walls panel. When anything on the map is broken, a button at the bottom reads "Repair all N broken
  walls" (or "Repair the broken wall"). One press mends every broken wall of the map's own design on that scene.
- One wall or object by itself: select it in the Walls panel and untick Broken.
- A summoned wall (a wall an ability made) is repaired from its own small panel, with its Repair button.

**Not in this build:** a reset button anywhere outside the Walls panel. Say if you want one, and where.

## Build 484: the site download no longer fails on the database

Not on your list: found on October 12 when a fresh copy of the live site was asked for and the download stopped
with "HTTP Error 500" at the store's database, twice.

**What happened.** The export checked the database (that worked) and then sent it with a command that, when
the server holds output in a buffer, puts the WHOLE file in memory before sending any of it. Past PHP's memory
limit that is a fatal error, and the server answers with a bare 500. The database grew when its layout was
split (the old row is kept beside the new ones), which is the likely reason it worked on October 10 and not
now. Nothing on the site was harmed: the export only reads.

**What is different now.** The export sends every file a megabyte at a time, straight out, closing or
flushing any buffer first, so the size of a file no longer matters. It also allows itself five minutes for
the slow part (copying and checking a large database).

**How sure this is the cause.** The mechanism is proven on this PC, by the tester on a real database of 148 MB
and by a test that sends a file larger than PHP's memory both ways (the old way dies, the new way arrives
whole). That it is what happened on the host is not proven from here. One line in the host's PHP error log
would settle it: "Allowed memory size ... exhausted" in sandbox-export/index.php. The fix is right either way.

**It needs a deploy.** The export is part of the site, so the download works again only after this build is
deployed from cPanel.

## Build 485: pings and auras at the right height, and a find-my-token button (items 11, 7, 10)

Your words: "The pings have the same issue, being drawn on the lowest part of the map instead of the level you
click on." "Auras appear on the ground instead of tied to a token. so if a token is in the air... the aura is on
the ground way under them." "There needs to be a tiny button in the top right that causes a ping to emit from
your token so you can find where it is on the map and it centers your screen on your token."

**Why it happened.** The board leans, so a floor above is drawn up and across from the ground under it. A ping
kept only its place on the flat map, and an aura was placed by its token's square and never lifted with it.
Both were drawn on the ground however high the thing they belonged to.

**Pings.** A ping now keeps the height of what was clicked (a floor, a stair, the ground, the bottom of a pit)
and every page draws it there. A focus ping (the one that moves everyone's view) centres on that spot as drawn.

**Auras.** An aura is drawn lifted exactly as its token is: on a floor above, in the air, on a stair.

**Find my token.** The button was already in the top right for players ("My token": it centres the view on
your hero and goes to its floor). It now also sends a ping out from the token it finds, on your page only, so
the eye lands on it. The Director has the same button now, labelled "Find token": select one token, press it,
and the view centres on that token with a ping. With none or several selected it says "Select one token to
find it."

**Not in this build:** drawings (item 3). They are next, as a build of their own.

## Build 486: players open doors; Escape and a drop off the map cancel a drag (items 12, 13, 14)

The three small changes you released together on October 12.

**Players open ordinary doors by clicking them.**
- A player's door symbol is live now. One click opens the door, another closes it.
- The rule, kept by the server: it must be a door (not a window), not broken, not locked, and one of the heroes
  must stand within a square of it, on the door's own floor. From across the room or from the floor below,
  nothing happens and a small word appears by the door: "Too far".
- A locked door: the word is "Locked" and it does not move. You unlock it, as before.
- A secret door: exactly as now. Closed, it is plain wall to players, with no symbol and no click. Opened by
  you, they see a doorway, but they still cannot work it, so they cannot shut it away again.
- You are asked none of this: you work any door or window from anywhere.

**Escape cancels a token drag.** The token goes back where it was, nothing is sent, and the corners dropped
during the drag go with it. One token, several at once, or a forced drag. A right click still drops a corner
and the right-button pan is untouched. That Escape is spent on the drag: it does not also close a panel.

**Dropping a token off the map cancels the move.** Let go over the side character sheet, the top bar or any
panel, and it is the same as Escape. Only letting go over the map itself makes the move.

**An old rule changed on purpose:** one test said a player's door symbol "grants no portal command control".
It now says a player may click a door he can see.

## Build 487: two things the tester found in forced moves

**A push into a cliff no longer leaves the creature up on the cliff.** On your own Gravity Orchard a creature on
a platform 12 up, pushed 10 west, ended standing about 17 up on the crater wall, higher than it started, and no
fall was offered. The wall was right to stop the push. But a stopped push is rounded to a whole square, and it
rounded up into the wall's own face. Now a push stopped by rising ground ends in the last square whose ground
is less than a square above the height the creature came in at: the foot of the cliff. From there the usual
fall applies. One more square of the push is left over, so the slam is one higher.
- A push stopped by a wall standing on level ground ends where it always did.
- A push up a gentle slope goes the whole way, as before.
- On the Gravity Orchard package, 7 of the 503 test pushes change, each ending one square earlier.

**A large creature pushes straight.** In Build 482 the line of a push was measured from the pusher's middle. For
a two-by-two creature beside the upper half of its target that tilted the line: the push drifted up a row.
The line is now measured from the pusher's square nearest the target, to the target's square nearest the
pusher. Beside it is straight; off its corner is the diagonal. Creatures of one square are unchanged.

**Still open from the same check:** on two of your four Orchard platforms a forced drag still pauses the page
for a second or so at a time (it was eight seconds before Build 481). That needs a measurement from a real
browser, which the tester is taking; it is the next forced-move work.
