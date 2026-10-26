# Build 460, the wall-press fix, and part of the unjudged list — October 10, 2026 (about 1:20 AM)

**Push: yes for `83050029` (Build 460). The wall-press fix does what it should and all seven of the coder's items pass. Separately, one movement fault found on the Gravity Orchard, not caused by this build as far as I can tell: a player's drag from an arch onto the island at its head lands the hero on the crater floor underneath.**

Tester's note. Not committed. Sandbox only (127.0.0.1:18802), built from the verified capture, with the bathhouse and the newest Dead Root and Orchard packages imported. The live site was not contacted. About 9 minutes with a browser open, in five short runs.

**Memory stopped the run early.** No Chrome was open, but the ChatGPT app and its web views held about 1.9 GB and headroom was 3.4 to 3.8 GB. With two board pages open the PC went down to 0.4 GB of headroom; with one board page on the Orchard, 0.3 GB. I stopped there. Two items of the unjudged list are therefore still unjudged (at the end).

## The fault: an arch dragged up onto its island (Gravity Orchard, newest package)

As the player Cal, own page, arch A3 (column 18, rows 46 to 51, from the mid island at 12 up to the high island at 18):

| Drag | Result |
|---|---|
| Foot (18,44) to the middle of the arch (18,48) | Right: "Move 4", ends (18,48) standing 14.5; the drag ghost was drawn at 14.50 |
| High island (18,53) down to the arch (18,47) | Right: "Move 6", ends (18,47) standing 13.5; ghost 13.50 |
| Arch (18,47) down to the foot (18,45) | Right: "Move 2", ends standing 12 on the mid island |
| **Middle of the arch (18,48) up to the island at its head (18,52)** | **Wrong: the ruler reads "Move 16", the ghost is drawn at height 0, and he ends on (19,50) standing 0, on the crater floor** |
| **The whole arch in one drag, foot (18,45) to (18,52)** | **Wrong in the same way: "Move 16", ghost at 0, ends (19,50) on the crater floor** |

My pointer was on the spot where square (18,52) is drawn at height 18. The page took that spot to be the floor square (19,50) beneath the island. So while the hero stands on the mid tier or on the arch, the island above him cannot be picked as a destination, and a drag that looks like "walk up the arch onto the island" becomes a walk off the arch and a drop of 12 to 14 squares. His Stamina did not change by itself (51 before and after); I had no Director page open to see the fall review.

I do not know whether older builds do the same: an arch dragged upward was on the unjudged list and had never been tried.

## Build 460: a player's arrow press into a wall (bathhouse basement, Cal's own page, the server's answer held back 1.1 s, every frame recorded)

| # | Check | Result | What I saw |
|---|---|---|---|
| 1 | ArrowLeft into the plain wall at (12,14), once, then six times fast | Pass | The token was drawn in one place for all 408 frames. The page sent the move twice (once for the single press, once for the six); the server refused both; the status line read "Movement blocked by a wall or closed door/window." |
| 2 | ArrowLeft into the shut door at (12,11) | Pass | The same, 427 frames. |
| 3 | Nothing beyond is shown or remembered | Pass | In both: the creature beyond never visible or clickable, lit ground not worked out, the square past the wall black in every frame, settled picture before and after 0 pixels different. |
| 4 | A DRAG dropped through the wall (unchanged on purpose) | As before | Drawn on the far square from 20 ms for 70 frames, back at 1.26 s when the refusal arrived. Nothing beyond was shown. |
| 5 | The Director's own ArrowLeft through that wall | Pass | Drawn 21 ms after the press; accepted; server has him on (11,14). |
| 6 | The Director opens the door, then the player's ArrowLeft from (12,11) | Pass | Drawn on the far square and kept; the move accepted; server has him on (11,11). Drawn 209 ms after the press here, on a PC short of memory. |
| 7 | Five fast ArrowDown from (13,17) | Pass | All five accepted; token, page and server agree on (13,22). `groundRuns` rose by 1 and the other counter (`paints`) by 10. Token on the last square 0.65 s after the first press. |

On item 7, my first run read `groundRuns` +4, not +1. That run had two board pages open and no free memory, and the five squares were drawn a quarter of a second apart, so a picture finished between each. With one board page it read +1. I would not call the +4 a fault, but it means "once" holds only while the presses outrun the picture.

## From the unjudged list

**A size 2 token on Dead Root (Director's page, real drags):**

| Move | Result |
|---|---|
| From the ground at (45,22) up the stair to the walkway | "Move 5", ends on the walkway standing 2, no fall |
| From the walkway down the stair | "Move 5", ends on the ground, no fall |
| Off the side of the walkway, 3 west | "Fell 2 squares" |
| Along the west bridge, 2 south | Stays on the deck standing 2, no fall |
| Forced 3 west off the bridge | "Forced movement 3 · Fall 2", "Fell 2 squares", ends on the ground |

(My first try up the stair read "0 squares" because the four heroes were standing on the stair foot; moved away, it works.)

**An Orchard arch dragged:** above. Down is right; up onto the island is the fault.

## Still not judged

- Remembered ground after a fast run of arrows compared with the same squares walked slowly.
- Edits through the Walls panel (a wall point dragged, a material set, break and repair, the slant changed).
- A shut window.

All three need a browser, and that needs about 5 GB of headroom, which means the ChatGPT app closed or something of that size.
