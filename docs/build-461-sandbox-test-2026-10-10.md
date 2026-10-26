# Build 461, the arch-to-island fix — October 10, 2026 (about 1:30 AM)

**Push: yes for `71401308` (Build 461). The two drags that put the hero on the crater floor on Build 460 now land on the island. One edge is left, as the coder expected: from the foot of the arch, a drop on the SECOND island square still walks him off the arch and he falls 12.**

Tester's note. Not committed. Sandbox only (127.0.0.1:18802); the live site was not contacted. About 4 minutes with a browser open in three short runs, one board page at a time (the player's). Commit headroom went as low as 0.9 GB.

As the player Cal on his own page, Gravity Orchard (newest package), arch A3 in column 18 (rows 46 to 51, mid island 12 up to high island 18):

| # | Drag | Build 460 | Build 461 |
|---|---|---|---|
| 1 | On the arch (18,48) to the island at its head (18,52) | "Move 16", ends (19,50) on the crater floor | "Move 4", ghost at 18.00, ends (18,52) standing 18 on the high island, no fall |
| 2 | The whole arch in one drag, foot (18,45) to (18,52) | "Move 16", crater floor | "Move 7", ghost at 18.00, ends (18,52) standing 18 on the high island, no fall |
| 3 | Foot (18,44) to the middle of the arch (18,48) | right | unchanged: "Move 4", standing 14.5 |
| 3 | High island (18,53) down to (18,47), then to the foot (18,45) | right | unchanged: "Move 6" standing 13.5, then "Move 2" standing 12 |
| 4 | Foot (18,45), pointer on the second island square (18,53) | not tried | "Move 17", ghost at 0, ends (19,51) on the crater floor; the player's page shows "Fell 12 squares" |
| 4 | Foot (18,45), pointer on (20,52) beside the arch head | not tried | Read as ground: "Move 20 · Cost 23", and the page asks "Cal climbs 3 squares... Don't climb / Climb". Answered "Don't climb"; he stays put |
| 5 | Vine V1 in one drag, foot (12,31) to its head (12,29) | not tried | "Move 6", ghost at 18.00, ends (12,29) standing 18 on the high island, no fall |

So only the one landing square at the head of the arch is new, as the coder said. A player who aims one square further onto the island, from below, still drops to the floor. That is for Brandon and the coder to weigh; it is the same behaviour Build 460 has for every island square.

No page errors.

Still not judged from the week's list: remembered ground after fast arrows against slow, edits through the Walls panel, a shut window. They need more memory than the PC has free while the ChatGPT app is open.
