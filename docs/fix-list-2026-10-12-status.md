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
