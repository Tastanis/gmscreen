# VTT movement fix list — for the GM coder (November 9, 2026)

From the VTT tester chat. Brandon read the movement audit (`docs/vtt-movement-audit-2026-11-09.md`, written by a
cloud chat against Build 617) and ruled on each item on November 9. He asked that the GM coder make the fixes.
This file is the whole brief: his ruling in his own words, what to change, where, and what to be careful of.

**Build on your uncommitted Build 618.** The audit never saw it. Every line number below is from the working
tree as it stood on November 9 with Build 618 in place; `board-interactions.js` drifts, so find by function name.
The tester re-checked every audit item against that working tree (by reading and by running the pure modules;
nothing was tried in a browser). Where the audit and this file disagree, this file is the later one.

Standing rules still apply: warn, never block; a test beside each fix; browser and server changed together where
both work a thing out; nothing built for one map.

## Fixes Brandon asked for

### A. Forced movement does not count as movement (audit 2)
> "yup this can be fixed by not counting force movement against the player being moved."

- `token-movement-controller.js`: `recordCommittedMove` (128) records every kind. `handleDragCommitted` (165)
  passes `movementKind` through. A `forced` move must not be recorded, and the live "Moved X / speed" text
  during a forced drag (`moveCost`, 277) should not suggest it will be.
- Consequence Brandon accepted: a Director who moves monsters by Ctrl-drag gets no count for those moves.
- **Teleports do not count either.** Final ruling, November 9: "oops teleports should not count as movement."
  (An earlier "no" to "should teleports also stop counting?" was a slip; this replaces it.) Today a teleport is
  charged the straight distance because `measureMovementRoute` (`board-interactions.js` 1522) returns null for a
  teleport and `moveCost` (122–126) falls back. Record nothing for `teleport`, the same as for `forced`.

### B. Ctrl+Z gives the movement back, and the fall-through is closed (audit 3)
> "easy fix? and fix the side problem too"

- The window capture handler (`board-interactions.js` 2273–2288) runs `performTurnUndo` (2225–2272) and stops
  the event. `performTurnUndo` never touches `tokenMovementController`, so the token goes back and the counter
  does not. The "Undo move" button (`undoSelectedMove`, controller 345–349) refunds correctly.
- Refund inside `performTurnUndo`, and only when the undone step was a move of that token in the running turn.
  Redo (Ctrl+Shift+Z) should charge it again. Undoing damage or a condition must refund nothing.
- **Do not let the event through to the controller.** `ui/__tests__/turn-undo.test.mjs` 74–77 pins
  `stopImmediatePropagation(); performTurnUndo(event.shiftKey)`.
  `token-system/__tests__/turn-undo.test.mjs` 40 pins the controller's own undo when called directly.
- Side problem, three ways in, all the same mechanism: the window handler returns early without stopping the
  event on `event.repeat` (2275), on `event.altKey` (2274) and when the wall panel is open (2279). The
  controller's `handleKeydown` (300–333, listening on `document` capture, 354) has no check for any of them and
  runs its undo-every-move loop. Ran it: a keydown with `repeat` and `altKey` restored two recorded moves.
  Close all three.

### C. Slowed, Grabbed, Restrained, Prone and grabbing change the ring and the count (audit 4)
> "Those should change speed for calculating how far they have moved, but of course still let you move them it
> just changes the ring you can move in"

Display and count only. Nothing is refused. The server does not check speed and should not start.
Book text: `dnd/ai-reference/source/rules-v1.01b/chapters/chapter-05-classes.md` 780–823.

- **Slowed:** "has speed 2 unless their speed is already lower".
- **Grabbed:** "has speed 0".
- **Restrained:** "has speed 0".
- **Prone:** "must crawl ... which costs 1 additional square of movement for every square crawled". That is a
  cost, not a speed: one more per square, like difficult terrain. Check with Brandon whether it stacks with
  difficult terrain or an enemy's square before assuming (618's table says water and difficult do not stack).
- **Grabbing:** "If a creature's size is equal to or less than the size of a creature they have grabbed, their
  speed is halved". Only then. The book gives no rounding; ask Brandon or round down and say so.
- Today speed is `speedResolver` plus `getSpeedBonus` (`board-interactions.js` 2120–2121; controller
  `getMovementLeft`, 155). `speed-resolver.js` never reads conditions. The hook `movementRulesFor`
  (17375–17410) already lets a condition's rider carry `speedBonus`; these four standard conditions do not use it.
- Say why on the ring or the counter ("Slowed: speed 2"), so a short ring is not a mystery.

### D. A flier's height change counts, but movement is counted once (audit 5)
> "The game counts movement only once. so from you starting position to where you go, it only counts height or
> horizontal movement, whichever is higher. ... if i move up 3. it would spend three, but then if i move over 2,
> it would still just say 3. only when i moved to 4 squares over would it tick up to 4."

- For a creature flying or hovering on its own turn: spent = the larger of horizontal squares this turn and
  height squares this turn.
- None of the three height routes reaches the counter today: `saveFlight` (2692), the settings height input
  (23906–23915) and the 3D height drag `setHeight` (30085–30096). All submit a `placement.update`.
- Count only during that creature's own turn in combat, so setting a height during setup costs nothing.
- Going up and coming back down, final ruling, November 9 (this replaces an earlier, looser answer):
  "lets make thme have to do some other move first. so no, up and down doesnt do it. they have to complete the
  move. like drop the token not just stop scrolling it up. and then they have to make a sideways move to begin
  counting the down movement again"
  - Height is counted only when the move is finished (the token is dropped), never while the height is still
    being scrolled.
  - Up 3, dropped, is 3. Straight back down 3 with no sideways move in between adds nothing: still 3.
  - Once the flier has finished a sideways move, a height change in the other direction counts again: up 3,
    over, down 3 is 6 of height.
  - The tester's reading for the code: keep the height the flier had at turn start or at its last finished
    sideways move. Until the next sideways move, height spent in that stretch is the furthest it has been
    dropped from that height, not the sum of ups and downs. A finished sideways move closes the stretch and
    starts a new one. Total spent is still the larger of horizontal and height.
- Leave 618's walking and climbing prices alone; this is about fliers changing height.

### E. "Moves through creatures" is honoured, and the Director's outline stops at a closed secret door (audit 6)
> "you can move through creatures they just slow you down" · "it can just be done with json if there's a way to
> make an ability that ignores the move through others." · "it shouldnt find ways through closed secret doors."

- 618 already makes the outline go round walls and prices an enemy's square at one more. The audit's item 6 is
  otherwise done.
- `moveThroughCreatures` is collected (`movementRulesFor`, 17375–17410; `applyConditionRule`, 2669) and never
  used. `window.vttEnemySquares` (795) should return no squares for a mover that has it, so a trait or ability
  written in JSON switches the surcharge off.
- Secret doors: players are safe, because a closed secret door reaches them as a plain wall
  (`SceneEnvironment.php` 20–24). On the Director's own screen the outline's wall check
  (`terrain-zones-overlay.js` 151) stops only at `kind === 'wall'`, so it passes a closed secret door as an
  ordinary door. Make it stop there too. Worth one check that nothing else in the player's data gives the door
  away to the outline.

### F. A no-corner walk costs the same in both directions (audit 7) — lowest priority
> "ok. As long as that doesnt cause isues like, i want to jump off this bridge one square away and it makes me
> run a mile around. And same if i want to go down these stairs 1 square away but it jumps me off the clif 4
> squares away because thats faster."

- `routeSteps` (`terrain-math.mjs`) walks a leg diagonal-first, so with one x2 square at (3,3), (2,2)→(5,3)
  costs 4 and (5,3)→(2,2) costs 3. Still true on the 618 working tree (ran it).
- Brandon's condition is the whole point: **no detours, ever.** The only freedom is the order of diagonal and
  straight steps inside the direct line between the two squares. Never choose a line that changes what the
  creature drops off, climbs or steps onto compared with what the player drew. The drawn line, the price and the
  submitted path must stay the same thing.
- If that cannot be met simply, leave item 7 alone and say so. It is off by one, now and then.

### G. A creature right behind a wall is not hit through it (audit 9)
> "that is obviously a problem" · "fix as well" (the missing break-through question)

- `ForcedMovement.php` 18–32 and `forced-drag.js` 14–25, same on both sides. The creature loop cuts the stop
  point to the contact with the creature first; the wall is then probed only up to that point, where the mover
  touches the wall without crossing it, so `wall` stays false.
- Ran, wall on x=7, mover (5,5)→(9,5):
  - creature at (7,5): `{"column":6,"row":5,"damage":3,"collidedIds":["c"],"wall":false}` — wrong
  - nobody: `{"column":6,"row":5,"damage":5,"collidedIds":[],"wall":true}` — right
  - creature at (8,5): damage 5, wall true — right. Only "directly behind" fails.
- `through()` returns the same wrong plan, so no break-through is offered for a breakable wall with a creature
  right behind it. Fixing the order fixes both.
- Tests to add on both sides: wall with a creature directly behind (slam, creature untouched); breakable wall
  with a creature directly behind (break-through offered; what happens to the creature after the break).
- The tester reviewed the whole break-through system separately; see "Break-through review" below.

### H. A hand slide with corners is announced once, as a slide, with its total (audit 11)
> "ok"

- The slide loop (`commitCanonicalTokenMovesNow`, 1641–1661) makes one full commit per leg, and each reaches
  1849–1857, which fires `forcedMovement` and `forcedMovementDealt` with that leg's distance and a hard-coded
  `verb: 'push'`.
- Listeners: authored triggers filtered on `minDistance`, `maxDistance` and `verb`
  (`automation-trigger-predicate.js` 249–254), automation auras (`fireAutomationAurasForEvent`, 5574) and
  heroic-resource rules (`processHeroicResourceAutomationEvent`, 4791).
- Fire once after the last leg that moved, with the total squares and `verb: 'slide'` when the drag had corners.
  A straight Ctrl-drag stays a push.

### I. Opportunity-attack reminders follow the real route (audit 12)
> "some minor fixes here."

- The audit overstated this. `movementAdjacencyChanges` (`movement-adjacency.js` 20–35) is given only the two
  ends (`board-interactions.js` 3598) but walks square by square between them, so a straight walk past an enemy
  is flagged; `movement-adjacency.test.mjs` pins that.
- Missed today: an enemy reached only at a corner of the drawn route; leaving and coming back to a different
  adjacent square; leaving and coming back to the same square (`confirmed-movement.js` 22 returns null, so no
  event at all).
- Wrongly flagged today: a route drawn wide round an enemy, when the straight line between its ends passes that
  enemy.
- Fix: walk `detail.path` leg by leg instead of interpolating between the ends. Reminders only, as now.
- Unchecked lead: the multi-token batch event (`SyncV2Store.php` 1920–1933) may carry no top-level
  `movementKind`; if so `confirmed-movement.js` 6 returns null and a group walk raises no reminders at all.

### J. A captive does not raise a reminder against its own grabber (audit 13)
> "YEAH"

- `vtt:token-moved` is dispatched (1006–1010) before `grabsAfterMove` (1886) brings the captive along, so the
  captive, still on its old square, counts as a watcher the grabber is leaving. In the listener (3596–3610),
  skip watchers the mover has grabbed.

### K. Ask before ending a grab (audit 14)
> "it should probably ask to end the grabbed condition instead of doing it wihout knowing"

- `grabsAfterMove` 2843–2845: `if (grabbedMoved && !grabberMoved) { endGrab(grab, 'it was moved away'); continue; }`
  with no adjacency test and no question. The forced or teleported-apart branch (2849) ends it too.
- Ask whoever made the move ("End the grab?") instead of ending it silently, in the style of 618's questions.
  Suggest "end" when they are no longer adjacent and "keep" when they still are.
- Related, not ruled: when grabber and captive are dragged together the grab is kept with no test even if they
  end apart.

### L. Teleport falls round like every other fall (audit 18)
> "Okay it can change to match."

- `TeleportLanding.php` 41 uses `floor(height − landing + 1e-6)`. `FallOutcome.php` 35–37 uses nearest
  (`floor(x + .5 + 1e-6)`, at least 1), and its comment names nearest as the rule.
- Ran: a 2.6 drop is 2 by teleport and 3 otherwise; 3.5 is 3 against 4. Every drop with .5 or more differs.
- `teleport-landing.test.php` uses whole drops only; add a fractional one. Check the browser's teleport height
  choice reports the same number.

## Brandon ruled: leave these as they are

- **Audit 8, diagonal push clipping a creature beside the path.** He was shown the picture (mover (5,5) pushed
  to (8,8), bystander at (6,5), hit at once): "a should be hit that is fine as is." Body width counts.
  `forced-whole-squares.test.php` 43–46 already pins this for pulls. Not a bug.
- **Audit 10, an ability's slide goes straight from the picker.** "making a striaght line is fine."
- **Audit 16, a walk can end on another creature's square.** "this is fine."
- **Audit 17, a walk across a gap that ends at the same height is not a fall.** "i think this is intentional."
- **Audit 15, arrow keys.** No change asked. (With a token selected they walk it one square, camera-relative
  on the 3D board; `movementFromKey`, 30156.)
- **Audit 1, bent 2D drags charged as a straight line.** Not being fixed: Brandon wants the 2D board removed
  altogether, as a separate job later. Do not start that now.
- The flier airborne mismatch and the "smaller pushes larger" rules question are closed: 618 removed the
  "Collision changed" refusal, and the book says the distance does not change
  (`chapter-10-combat.md` 583–587), which is what the code does.

## Not ruled — do not change without asking

- "Undo move" on a group: a keyboard group move charges every token and refunds only the first selected; a group
  drag charges only the dragged token. A grabber undone in a group goes back while its captive stays, still
  Grabbed (`restoreTokenMovement` 10171–10180 skips `undoGrabFollows` for a group).
- Unchecked lead: `measurementPointFromToken` (17951–17962) returns a token's centre, which for a 2x2 token is
  `column + 0.5`, so the `< 0.01` origin tests at 1528 and 1636 may fail and drop the route's corners for
  even-sized tokens. Worth one look, since the 3D path feeds the same ruler.

## Break-through review

Brandon asked the tester for a review of the break-through-walls system ("IDK if its any good at all"). Done
read-only on the working tree as it stood about 21:25 on November 9, after your fix G landed. 37 push cases were
run through both `resolveForcedDrag` and `ForcedMovement::resolve` / `through`, and a handful through
`new SyncV2Store(':memory:')`. Nothing was tried in a browser, on the 3D board, with summoned cubes, or with a
fall after a break. Line numbers are as of that time.

**What is sound.** Browser and server agreed on the stop square, damage, wall flag and collided ids in all 37
cases, including a creature directly behind a wall (fix G holds). Costs and damage match the book's table. A
failed break is 2 plus the squares left. The server recomputes the break itself and trusts only the
`breakThrough` flag. Broken walls are skipped by movement and sight. Players' copies have `material` and `group`
stripped from standing walls. The move undo outside a turn mends the wall.

### Plain faults — the tester recommends fixing; Brandon has not ruled on these one by one

**R1. Ctrl+Z during a running turn leaves the wall broken.** The most serious finding.
- `undoTurnSteps` (`SyncV2Store.php` 1465–1541) restores placements through `acceptPlacementBatch`. The only
  `mendWalls(` call is at 2136, inside `acceptTokenMove`. So the turn undo puts the creature back and the wall
  stays rubble. The move undo is then refused, so only the Walls panel can repair it.
- Against `SyncV2Store.php` 2131–2132: (Brandon, October 12, 2026: "I need a way to undo a breakthrough").
- Ran: `after turn undo: t at 8, broken ["w5"]`, then
  `move-undo tried afterwards: REFUSED: This movement can no longer be undone`.
- Also: a player who pushed an enemy through a wall with an ability cannot use the move undo at all
  (`REFUSED: You cannot move this token.`), so a player has no way to mend it.
- Suggested: in `undoTurnSteps`, when a restored step is the token's newest receipt entry and it has `broke`,
  mend those walls. This sits next to fix B (the turn undo and the counter).

**R2. The pop-up's buttons understate the outcome.** `break-through-prompt.js` 11–27.
- One piece breaks and the creature slams the next: lines say "Wood: uses 3 of 4 push, 5 damage" and "Then
  hits a wall: 3 more", but the button says "Break: 5 damage" beside "Stop: 6 damage". The real total is 8.
- Exactly enough to break: "Break: 5 damage" beside "Stop: 5 damage", and nothing says the creature stays on
  the near side.
- Suggested: put the total on the Break button, and say "stays here" when it does not move.

**R3. Undo heals more than the push dealt, for a creature that reduces forced-movement damage.** Read, not run.
- Dealing subtracts the reduction first (`board-interactions.js` 21766–21770). `giveBackCollisionDamage`
  (21800) heals the full recorded amount. A creature that took 2 of a recorded 5 is healed 5.

**R4. A slide with corners cannot pay for a break out of its later legs, and loses them after one.**
- Book, `chapter-10-combat.md` 651–652: "If any forced movement remains after the object is destroyed, you can
  continue to move the creature who destroyed the object."
- `through` counts only the current leg and ignores `beyond` (`ForcedMovement.php` 103). After a break the
  intent is replaced (`SyncV2Store.php` 2126, 1648), dropping `beyond`, and the page ends the slide (1668).
- Ran: a leg with 1 square left and 3 more beyond it (4 in all) into wood: `offer: null`.

**R5. `docs/breakable-walls.md` is out of date in two bullets.** It says undo leaves the wall broken (mended
since October 12, outside a turn) and that the server refuses if the board changed since the pop-up (it no
longer does, by the November 8 rule).

**R6. An ability's wall slam is reached only through a warning with the wrong reason.** Traced, not seen in a
browser, so check it first.
- By the November 8 rule, squares past a wall are not offered (21347–21350). Picking the offered square beside
  the wall moves the creature there with no slam and no break question.
- To slam or break, the player clicks a square behind the wall and accepts a warning (21598). For a push that
  warning reads "that square is not farther from … with every step" (`automationMoveWarning`, 21833), which is
  untrue here. Pushing an enemy into a wall is a main use of forced movement, so this path wants to be plain.

### Rules questions — RULED November 9: follow the book

Brandon was asked both questions below and answered: "use the book to decide. follow those answers." So both
are now fixes.

- **Q1, fix:** the material's cost pays for breaking the piece and going through it; no further square is
  charged for the step across. The book's example is the test: a push of 5 moves 1, spends 3 going through the
  first square of wood (5 damage), and has 1 left, which slams the next wall for 2 + 1 = 3. Total 8. With exactly
  enough left, the creature ends through the wall, not on the near side. Correct
  `hurl-through-walls.test.php` 31–39 to the full example, second wall included.
- **Q2, fix:** the book prices "1 square" of material (`chapter-10-combat.md` 643–650). A creature one square
  wide goes through one square of wall whatever the angle, so it pays for one piece. A large creature that
  really meets two squares still pays for each (`docs/breakable-walls.md` decision 2, unchanged). This changes
  only what a break costs; a diagonal push clipping a creature beside the path (audit 8) stays as it is.

The findings as first written, for the evidence:

**Q1. Breaking costs one square more than the book's worked example.**
- Book, `chapter-10-combat.md` 702–711: a push of 5 moves 1, spends 3 to go through the first square of wall,
  and has 1 left, which slams the next wall: 5 + 3 = 8 damage.
- The app (`ForcedMovement.php` 110, `$reach=$distance-$spent`) charges for the break and then again for the
  step through the gap. Same example: total 5, the leftover square and its slam are lost.
- With exactly enough left, the wall breaks and the creature does not move at all; breaking and stopping cost
  the same damage.
- `hurl-through-walls.test.php` 31–39 is titled "the book's own example" but leaves out the second wall.
- The book's walls fill squares and the app's are thin lines, so this is a judgement for Brandon.

**Q2. A diagonal or off-axis push pays for two pieces of wall.**
- A 1x1 creature crossing a wall line at an angle sweeps two one-square pieces (`WallMovement::struck`,
  254–282) and must pay for both. Straight push of 8: cost 3, damage 5. Diagonal push of 8: cost 6, damage 10.
  A shallow angle with 5 left breaks nothing, because it needs 6.
- `docs/breakable-walls.md` decision 2 keeps the two-square price for "a large creature that hits two wall
  squares". This follows from the same body-width sweep Brandon approved for creatures (audit 8), so it may be
  what he wants. Ask.

**Q3. A long door or wide object breaks whole for the price of one square.** By design in the doc; more
generous than the book ("destroy 1 square of wood"). Listed so Brandon knows.

### Lower, for Brandon to know

- A hand-made request from a player's browser can ask what a 60-square push would break and learn every
  material on the line, and can send that push. The normal page never does this. `docs/breakable-walls.md` says
  players are never told which standing walls are breakable.
- Undoing a break rebuilds an object around a creature that has since walked onto its rubble. It can leave by
  "Move anyway".
- Break damage is only recorded as pending by the server; the pushing browser applies it. A dropped connection
  right after the move leaves the wall broken and no damage. This is how all collisions work, not new here.

### No test today for

Turn undo after a break; a player undoing an ability push; the second half of the book's example; any diagonal
break; a slide leg with `beyond` and a break; browser and server parity on break cases; a break followed by a
fall; undo with a creature on the rubble; damage give-back with a reduction; the pop-up's total when a slam
follows.

## Waiting on Brandon

1. Prone with difficult terrain, and the rounding of a halved speed. (fix C)

Answered since this file was first written (both November 9, now folded into fixes A and D above, and both
corrected once by Brandon, so trust the text in A and D over any earlier message): teleports do NOT count as
movement; a flier's height counts only on a finished move, and a reversal counts only after a sideways move.
