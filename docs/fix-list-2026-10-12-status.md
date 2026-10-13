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

## Build 488: Malice comes and goes correctly (item 6)

Your words: "Malace sometimes pops back or doenst work right. make sure it comes and goes correctly. and doesnt
pop back."

**Why it popped back.** Every Malice change was sent as "set Malice to N", N being that page's own copy of the
number. Two things followed. Any combat news that reached the page before the server's answer overwrote the
copy with the old number: the pop back you saw. And if the page sent any other combat change in that moment,
it carried the old number with it and the server kept it: the pop back that stayed. A second Director page did
the same to the first.

**What is different now.**
- A change is sent as an amount: "take 3", "add 2". The server applies it to the number it holds. Two pages, or
  two quick changes, can no longer undo each other.
- While a change of yours is on its way, the pips keep the number you mean. When the server has answered, they
  show what it holds, which has your change in it and anything done on another page meanwhile.
- Malice never rides along on another combat change.
- End Round says which round it is ending. A second End Round for the same round (another Director page, a
  double click) is refused, so the round's Malice is gained once and no round is skipped.
- An End Round or a turn start pressed while another combat change was still saving used to be dropped without
  a word. It now waits its turn and goes.
- After End Combat the pips are cleared. The tester found the stored number at 0 with both Director pages still
  showing 5.
- A change the server refuses puts the pips back to the stored number and tells you.

**Not changed, as you said:** cancelling a Malice ability does not refund it.

**To know:** a Director page left open from before this build still sends the old "set to N" until it is
reloaded. The server still takes that, so reload your pages after the deploy.

## Build 489: a test asked of a player reaches him (item 5)

Your words: "Popup tests for others, liike for other people to roll a test. those arent working. does it have
the code for it to make it happen already and it just didnt work? or does that functionality not exist yet?"

**The answer.** The code exists and is complete, but only as part of an ability: a creature's ability that
asks heroes for a test (the Orchard Tender's Gravity Turns is one) sends each player a roll window. There is
no Director tool yet to ask for a test by itself; you have said yes to one, and its design comes to you as a
picture first.

**Why it did not work at the table.** The request is for one player and you, so the copy sent over the channel
all players share is blanked. Every player's page, the one meant to roll included, took that blank as the
whole of it, and never fetched its own copy. You were left on "Waiting for requested tests, 0 of 2 accepted".
It worked in the test sandbox because the sandbox has no live push, which is why it passed earlier.

**What is different now.**
- The blank says "ask", and a page that hears it asks the server for its own copy. The player meant to roll
  gets the roll window; the others get nothing, as before.
- The same fix lets a player who starts a test see it resolved.
- When a player is not on the VTT page (only the character sheet open, or the VTT tab in the background) the
  server sends that test to you, as it did before. The waiting panel now says so in a line: "Not on the VTT
  page, so it came to you: Sharon".

**Not proven from here:** live push itself. The test sandbox does not have it, so this is proven in the page's
own modules and on the server, not at a live table. The first session after the deploy is the real check.

## Build 490: "when the target moves" works from every page; Thorn In Foot lands by itself (item 8)

Your words: "Thorn in foot, isnt triggering the damage when things move. is this a json or code issue". And of how
it should work: "let's have the damage land by itself."

**The answer: code, not the ability's data.** The ability's card was valid. The watch it sets ("when the target
moves") lived only in the memory of the browser tab that used the ability, and a move is announced only in the
tab that makes it. So when you moved the creature, Cal's page, which alone knew of the watch, never heard of
the move. And when a page did hear, it only raised a "!" to click; it never dealt the damage.

**What is different now.**
- A watch an ability sets is also kept on the caster's token, which every page holds. Whoever moves the
  creature, that page knows the watch and answers for it. This mends every "when X moves" ability, not Thorn
  alone.
- A watch may say it lands by itself. Then the effect is applied at once, with no "!" to click, and it does
  not wait on the caster having a triggered action left.
- The amount may be the squares of the move that set it off: "1 psychic for each square they move".
- It counts the creature's own movement only: a walk, a shift, a climb, a fly. A push, a pull or a slide does
  not set it off. A teleport does not either (no squares are moved through); a watch can say otherwise.
- It runs out by itself at the end of Cal's next turn, on every page, and a page that loads part-way picks it
  up where it stands. No watch outlives the combat.
- Any other ability keeps today's behaviour, the "!" to click, unless its card says it lands by itself.

**One thing has to be done on Cal's sheet.** "Lands by itself" is a setting of the ability's card. Thorn In
Foot's watch card on Cal's sheet needs the line `"autoResolve": true` (the reference copy in
dnd/ai-reference/characters/cal-automations.md has it). Until then Thorn In Foot raises the "!" as before, but
now for whoever moves the target.

**Limits to know.**
- The app cannot tell a willing move from one a creature was ordered into; it counts every walk or shift of
  the target while the watch lasts.
- Moves made with the arrow keys count a square at a time: 1 damage each.

## Build 491: a sheet page saves only what it changed (items 2 and 4, first half)

Your words: "Character sheets seem to be changing without permission ... zepha's might and agility were just
randomly reset to zero. and when they did a respite, i think it didnt give him back any of his recoveries or
something. Some weird things seem to not be syncing or staying correctly sometimes."

**The cause was one thing.** Every save from the sheet page sent the whole character as that page held it, and
the server replaced the whole stored character with it. It never checked that the page was up to date. A page
left open in Edit mode, a phone tab that woke up, a second device: any old copy that saved wrote its old values
over newer ones, and a field that was blank on that copy was stored blank. A respite was worked out on the page
from its own copy, so a page with a blank Recoveries maximum set Recoveries to none.

**What is different now.**
- A sheet page sends only the fields it changed. A field nobody touched on that page cannot be rolled back or
  blanked by it, however old the page is. Two people on one sheet: the last one to change a field wins that
  field, and nothing else moves.
- A page that changed nothing sends nothing. Turning Edit off, or a tab going into the background, no longer
  writes the sheet.
- An emptied Might, Agility, Reason, Intuition or Presence is never stored over a number. A blank input is not
  a score.
- Respite is worked out by the server from the record it holds: Victories to XP, Recoveries and Stamina to
  their maximums. A sheet with no Recoveries maximum is left as it is and the page says so.
- A save that did not happen is said on the page ("NOT SAVED ... Reload the page"). It used to go only to the
  browser's hidden log, so a failed respite looked as if it had worked.

**Pages still open from before the update.** The server no longer takes a whole-character save at all. A page
loaded before this build that tries one is refused, nothing is changed, and the answer tells it to reload.
That old page shows no message (its script only writes to the hidden log): its player's edits do not stick
until they reload. Worth telling the table to reload their sheets once after the update.

**The stored file keeps its shape.** Nothing is converted.

**A record of every change, and one copy a day.** Both are in the sheets' own data folder, which the web
server refuses to hand out (every .json there):
- `dnd/character_sheet/data/sheet_changes.json`: one line a write: when, who, which request, each field's old
  and new value. Past two megabytes it is kept once as `sheet_changes_previous.json` and a new one begun.
- `dnd/character_sheet/data/backups/daily_character_sheets_YYYYMMDD.json`: the sheets as they stood before the
  day's first write, kept sixty days.
The next time a sheet "changes by itself", the record says which page did it and when.

**Limits to know.**
- A list (abilities, features, skills, inventory) is one field and is saved whole. Two pages editing the same
  list at once: the last one wins that list.
- The small plus and minus buttons outside Edit mode still send the new number for their one field, not
  "one more". That, Use Recovery, and what the map's side panel writes are the second half.

**Still to come (second half):** Use Recovery, surges, victories and the map side panel's writes as amounts the
server works out; a token never writing a sheet's Stamina maximum from an empty number; the map showing a dash,
never 0, for a sheet it cannot load; sheet changes reaching tokens on other devices; the heroic resource traced
end to end for every class.

## Build 492: Undo Move works on a push that broke through (item 1, mended)

Your words: "I need a way to undo a breakthrough or to reset the broken walls on a map."

**Build 483 did not do what it said.** The server could mend the walls, but the Undo Move button refused the
push: "Select a token or group with an unchanged movement of yours to undo." The tester found it.

**Why.** A move could be undone only while nothing at all had changed on the token since. Breaking through a
wall hurts the pushed creature at once, and that damage counted as a change. So no push that broke through
could ever be taken back. My own test went straight from the push to the undo and left the damage out.

**What is different now.**
- A move can be undone while the token still stands where that move left it: same square, same floor.
- Still only by whoever made the move.
- This holds for every move, not only pushes: a token that was hurt, healed, renamed or given a condition
  after it moved can still have the move undone.
- Undoing a push that broke through puts the creature back and makes the wall whole, as 483 meant.
- Stamina is not given back by the undo. You set that by hand.

**Still refused, as before:** a move somebody else made; a token that has since been moved or put on another
floor; a map whose floors changed since.

## Build 493: the sheet and the map no longer write over each other (items 2 and 4, second half, part one)

Your words: "Some weird things seem to not be syncing or staying correctly sometimes." And: "I also want to make
sure that the VTT character sheet is working correctly and everything is syncing there right."

**The cause.** Stamina, Recoveries, surges, Victories and the heroic resource are changed from four places: the
sheet page, the map's side panel, a hero's token, and abilities. Each holds its own copy of the number, and each
wrote "the number is now N" from its copy. A copy that was behind wrote the sheet back to where it had been.
The clearest case: a player heals on the sheet on a phone; your map never hears of it; you hit the token; the
token's old number minus the hit is written to the sheet and the healing is gone.

**What is different now.**
- Each place says how much it changed the number by. The server adds that to the number it holds. Two pages
  that each take one off take two off, whichever was behind.
- A token never writes a Stamina maximum to a sheet. The maximum is set on the sheet. (A token showing 0 of 0
  used to be able to write that 0.)
- After a token's change, the token takes the sheet's answer, so the two agree again at once.
- A sheet with no Stamina maximum gives its token nothing: the token shows a dash, never 0 of 0.
- Your map page reads the party's Stamina every four seconds, so a change made on a sheet on another device
  reaches the hero's token. It costs one word of traffic while nothing has changed, and stops while the tab is
  hidden.
- Use Recovery, on the sheet and in the side panel, is worked out by the server: one Recovery fewer, Stamina up
  by the recovery value as far as the maximum. On the sheet page it used to lower Stamina that was above the
  maximum, and set Stamina to 0 on a sheet with no maximum.
- A sheet save that gets no answer is asked after before anything is sent again, so "one more" is never added
  twice.
- A number typed in Edit mode is still set as typed.

**Also found and mended.** Every hit on a hero's token left a small receipt in the sheets file, and they were
never cleared, so the file only grew. They are now kept two days.

**Map pages open from before the update** still send numbers the old way until reloaded (their maximum is
ignored by the server from now on). Reload the map once after the update, as with the sheets.

**Not in this build:** the heroic resource rules (start of combat, start of turn, costs). Traced, with real
faults found; next build.

## Build 494: the heroic resource (items 2 and 4, second half, part two)

Your words: "specifically, the heroic resources making sure those are triggering correctly when players start
their turns and stuff".

**What the trace found.** The rules themselves are sound: start of fight, start of turn and "first time each
round" each fire once, on one page, even with two tabs open or after a reload. What went wrong was writing the
number down.

**Mended in this build.**
- **A gain could be refused and lost.** A gain was sent as "the number is now N, and was M" from the page's own
  copy of the sheet. If that copy was behind, the server refused it and the gain was gone, with one line in the
  status bar. That hit: the reset to 0 at the end of a fight (the number stayed until the next fight); a
  player's first turn after the start-of-fight set; a turn's gain for a hero keeping a zone with upkeep. Gains
  and losses are now amounts the server adds. Nothing is refused for being behind.
- **An ability's cost could erase a gain.** An ability keeps the copy of the sheet it was started with for its
  whole run, and wrote "the number is now N" from it. A gain taken meanwhile was wiped. Costs, riders, gains and
  refunds from abilities are now amounts too.
- **"First time this round" was skipped in the next fight.** Each page keeps its own "already had it" marks and
  only your page cleared them. On a player's page they lasted into the next fight. Every page now starts each
  fight clean.
- **A gain meant for another player never showed.** When your page (a monster's fire damage near Zepha) worked
  out a gain that was the player's to accept, it was left on the hero's token, and a page that was already open
  never looked there. It was cleared at the end of the round, unseen. An open page now sees it arrive.

**Found, not changed. Yours to rule on.**
- **A cost is kept when an ability is cancelled.** Click a 5 Wrath ability, cancel at the target picker: the 5
  is spent. You said of Malice that you need no refund on cancel; say if heroes should be the same, or get it
  back when nothing had happened yet.
- **The start-of-turn prompt goes to whoever started the turn.** If you start Sharon's turn, "Gain 1d3 Insight"
  appears on your screen, not hers. Pressing Apply there works.
- **Cancel a turn and start it again, and the gain is offered again.**
- **A hero grouped under another token in the turn order gets no start-of-turn gain.** Only the token that
  stands for the group does.
- **"First time each round" is remembered per page.** A reload in the same round can offer it again.
- **Two ways to gain exist side by side:** the rules, and the roll button on the sheet and panel. A hero with
  both can take the turn's gain twice by hand. The button only reads "d3" or "+2", not "1d3".
- **A cost naming a resource the sheet does not have costs nothing, silently.** "3 Wrath" on a sheet whose
  resource is still titled "Resource" is free.
- **Zone upkeep stops at 0 even for a resource that may go negative.**
- **Forced movement by hand on the map fires no rule.** Only an ability's push or pull does (Indigo's gain).
- **If the one page running a fight's effects is closed in that instant, that step's effects never run.**

**To check on the sheets (data, not code).**
- The reference copy of Cal's abilities has no heroic resource rules at all. If his live sheet is the same,
  nothing sets Wrath at the start of a fight, gives it each turn, or clears it at the end.
- Sharon's, Indigo's and Zepha's start-of-turn gains are prompts to click, by their rules. Say if you want
  them to land by themselves.

## Build 495: drawings belong to the floor you draw on (item 3)

Your words: "Drawings need to be drawn on the level i click on or am looking at."

**The cause.** A stroke was given the floor your page was on, not the floor under the pointer. And each page
showed only the strokes given its own floor. So when you drew on a raised platform while your page was on the
ground floor, the stroke was the ground floor's, and the player standing on the platform never saw it.

**What is different now, on maps with built floors.**
- A stroke belongs to the floor that is under the pointer where the stroke begins.
- It is shown to whoever is shown that floor. A hero on the platform sees what is drawn on it; a hero below,
  who is not shown the platform's top, does not. Anything drawn on the ground is shown to everyone.
- The layer follows the viewer: select another hero, or walk one up a stair, and the strokes shown change with
  the floors shown.
- The eraser and "clear" reach the strokes shown on your page, and still only your own unless you are the
  Director.

**Unchanged.** Maps with no built floors, and strokes drawn before this build, keep the old rule (the floor the
page was on).

**Not checked by eye.** I have no browser; the tester will draw on a platform and look from above and below.

## Build 496: what the tester found on 485 and 483

**Pings (item 11) were right only on the page that made them.** On every other page the ping was still drawn
on the ground under the floor that was clicked. The height was kept by the page and by the server, and thrown
away in between by a tidying step every other page reads pings through. Mended. My first test never took that
path; it does now.

**An aura stayed behind when its token moved (item 7).** Older than these builds: a move redrew the token and
not its aura, on every page, until a reload. Auras are now redrawn when a token moves.

**Undoing a push gives back its damage (item 1).** Your words: "I need a way to undo a breakthrough". Undo Move
on a push now takes back what the push itself did: the wall it broke, and the damage dealt by what it hit or
broke through, to the creature pushed and to any it struck. Never above a creature's maximum.
- Left as they are: a fall's damage and being knocked prone; anything that happened to the creature after the
  push; a minion squad's shared pool (the rules do not let minions regain Stamina).
- A move can still be undone after later changes to the creature. Only the push's own damage is given back.

**The site export** now checks the key before anything else.

## Build 497: the drawing tool, beyond the floor fault (item 3)

You called the drawing system "pretty janky". Read end to end. What I found, mended or left:

**Mended.**
- **Strokes went missing when drawing quickly.** After each stroke the tool refused the next press until the
  server had answered. Write a word or draw an arrow in three strokes and the second and third were simply not
  there. The tool is now free at once; strokes are sent in the order made and all stay on screen meanwhile.
- **Strokes were heavy.** A point was kept for every pixel the pointer crossed: hundreds for one line, slow to
  send, to keep and to draw on every page. One every two map pixels now; it reads the same.
- With Build 495: a stroke belongs to the floor under the pointer; the eraser and "clear" reach the strokes
  shown on your page.

**Left, for you to say.**
- **Others see a stroke only when it is finished**, not while it is being drawn.
- **You cannot start a stroke on top of a token.** A press on a token is left to the token, so it can still be
  dragged in draw mode. On a crowded map that leaves holes you cannot draw in.
- **Undo is this page's last ten changes**, and is cleared when the page changes floor or scene.
- **A stroke that starts on a platform and runs off its edge stays at the platform's height**: the part past
  the edge hangs in the air. It reads as drawn at that level.
- **Drawings made before Build 495 have no height.** They still show where they were, to whoever saw them
  before (by the floor the page was on).
- Colour and width are kept with each stroke and are the same on every page. Width is in map pixels, so it
  grows and shrinks with the zoom.

## Build 498: a drawing's floor survives a page reload (item 3)

After the ping fault of Build 496 I read my other builds for the same mistake, and found one: a page that
loads tidies the drawings it is given and kept a fixed list of details, so a stroke's floor (Build 495) was
dropped on a reload. Mended, with a test of that path.

## Build 499: a hero's Stamina does not flicker back (items 2 and 4)

Found by reading Build 493 again, not seen in play. When a player's page hurt a hero, your token changed at
once and the sheet a moment later. If your page's four-second read of the sheets fell in that moment, the
token would have jumped back to the old number and forward again. Your page now leaves a hero alone for three
seconds after its token changes, and reads it the next time round.

## Build 500: an aura goes with its token while you drag it (item 7)

Your words: "auras appear on the ground instead of tied to a token".

Build 496 made an aura follow its token once a move was done, on every page. While you were dragging the
token, though, the aura still sat where the token had been until you let go. It now moves with the token
during the drag. On other pages a token moves when the move is made, and its aura with it: a walk, a push or
pull, a teleport, a change of floor.

**Why my earlier tests passed while the page was wrong.** For pings, the test handed the height straight to
the part that draws; on a real page the ping passes through a tidying step first, and that step threw the
height away. For auras, I had tested only an aura round a token standing still, never one that moved. Both now
have tests of the path a page takes.

## Build 501: a fault of mine in Build 493, found before it reached you

**What was wrong.** From Build 493 on, your page (the Director's) hit an error as it started up, and part of
its start-up never ran. Players' pages were not affected. It was my mistake in 493: two settings written lower
in the file than the line that needed them. None of Builds 493 to 500 was pushed, so it never reached the site.

**How it was found.** Not by a test. By opening your page myself, as the helper told me to before handing
anything over. Mended, and a test now guards that line.

**Seen with two pages open (yours and Cal's), on Medpilis, with this build:**
- A ping made on Cal's page at height lands on the same spot on your page.
- An aura stays on its token on both pages when the token is moved, with no reload.
- Three strokes drawn one straight after another all stay, and all reach the other page.
- A stroke drawn on the wall-walk is the wall-walk's: Cal sees it standing there and not from the courtyard.
  Strokes on the ground are seen from both.
- Your page reads the party's Stamina every four seconds without error.

**Not yet seen by me:** an aura during a drag, the eraser, a reload with strokes on the map, the sheets.

## Build 502: Thorn In Foot, the rest of it (item 8)

Your words: "Thorn in foot, isnt triggering the damage when things move."

Build 490 made the damage land. The tester then found four things still wrong, and one about the "!".

**Mended.**
- **Arrow keys: three presses, three squares, 1 damage in all.** Every square of a willing move now counts,
  however the move is made: arrow keys, a drag, a drag round corners (counted along the corners, not straight
  across), your own drop.
- **It stopped a turn early.** "Until the end of your next turn" now runs through that turn and ends when that
  turn ends, however many pages are open. Before, each page kept its own count of turn-ends and they drifted.
- **A second use on another creature killed both.** Each use is its own watch on its own creature. A new use on
  another creature leaves the first alone; a new use on the same creature takes the first one's place.
- **A creature moved by its own ability was not counted** (Gintaras's Footwork). It is its own willing move and
  counts. Movement somebody else forces on it still does not.
- **Cal's token was carrying eight of his standing triggers as well**, and one was left after the fight. Only a
  watch set by using an ability is kept on a token now; all are cleared when a fight starts and when it ends.

**The "!".** The "!" on a token only marks the triggered action used or free. It never resolved a trigger, but
the chat line said "click the ! to resolve", and a click threw the waiting trigger away. Now the chat line says
to use the ability from the hero's abilities, and the first click on a "!" with a trigger waiting says the same
and changes nothing. A second click marks the action used, as before. This is for any card not set to land by
itself, the monsters' too.

**Still true on the live site:** Cal's real sheet has the old card. Until it gets the line
`"autoResolve": true`, Thorn In Foot lights the "!" and waits for his player to press the ability again.

**Seen in a browser:** not yet. I look at this one with two pages open before it counts as handed over.

## Build 503: the character sheet page was blank since Build 491. Mended before it reached you

**What was wrong.** From Build 491 on, the character sheet page loaded its frame and tabs and nothing else:
no characteristics, no Stamina, no abilities. For every hero, on every device. My mistake in 491: I made the
page's script wait for a second file, and by the time it had, the browser had already given the signal the
sheet starts on. It never started. Nothing after Build 490 was deployed, so no player met it.

**How it was found.** Not by a test: none of them opens the page. By opening it myself, in the second look the
helper asked for. Mended, and seen working. There is now a test that fails if the sheet's script ever waits at
its top again.

**Seen on the sheet page with this build, as Cal:**
- The sheet fills in.
- A surge up, then down: each saves just that one number, as "one more" and "one fewer".
- Edit mode on and off with nothing typed: nothing is written. (It used to write the Stamina history; mended.)
- Use Recovery: the server worked it out. Stamina up by the recovery value, one Recovery fewer.

**Seen on the map with Build 502 (Thorn In Foot):** three arrow presses on a watched enemy cost it 1 each;
two watches on two enemies both fire; taking one off stops only that one.

**Two faults of this kind in one night** (your page in 493, the sheet page in 491). Both were in what a page
does as it starts, and both passed every test. From now on a build that touches how a page starts is opened in
a browser, as you and as a player, before it is handed over.

## Build 504: a test that opens every page

After two pages failed to start in one night with every test passing, there is now a test that starts each
page in a real browser (with no window) and fails if it does not start: the map as you and as a player, the
character sheet, and the main page. It waits for each page to say it has finished starting, so a page that
comes up empty without any error is caught as well. I put Build 491's fault back on purpose to see it caught:
"the character sheet: DID NOT START."

It is part of the ordinary test run from now on. Nothing in the app itself changes with this build except the
two small marks the pages set when they have started.

## Build 505: three small things from the tester's pass

The tester passed everything from Build 491 to 504 and found six small things on the way. Three were small,
certain and inside your list, so they are mended here. The other three are yours to rule on (below).

**Mended.**
- **A gain offer showed old numbers.** Zepha was offered "0 -> 2" Essence when she had 1. The gain itself was
  right (she ended on 3); only the box was reading an old copy. It now reads the sheet first.
- **Use Recovery at full Stamina** said "heal 31 Stamina", spent the Recovery and healed nothing. The question
  now says what it will really heal, and at full Stamina it says so and asks if you want to spend one anyway.
- **The eraser missed a quick swipe** across a thin line. It now rubs out along the whole sweep.

**Yours to rule on.**
- **A hit you deal by hand with the Damage tool, with a type chosen, does not count as "damage" for the heroes'
  resource rules.** So a Fire hit from you never offers Zepha her Essence; only damage dealt through an ability
  does. Say if hand-dealt typed damage should count.
- **If a sheet's Stamina maximum is cleared, the hero's token keeps its old numbers** rather than showing a
  dash. Hits still land. A dash would lose the running total on the map; I left it.
- **The map's log sometimes notes a refused change ("409") when a player hits their own hero many times
  quickly.** Nothing is lost or shown wrong: two pages touched the same number at the same instant and the page
  took the server's answer. Left as it is unless you see something odd.

## Build 506: a security hole in the Monster Creator's picture upload

Found by the tester's sweep; nothing you would have seen in play.

**What was wrong.** The page where you build monsters is yours alone, but the part of it that takes a
monster's picture let any logged-in player use it. And it kept whatever ending the uploaded file's name had,
checking only that the file started like a picture. So a player who knew how could have put a program on the
site disguised as a picture, and run it.

**What is different now.**
- Only you can upload or delete a monster's picture.
- The site names the stored file itself, with the ending of the kind of picture it really is.
- The folder the pictures are kept in will not run anything.
- Uploading and deleting pictures in the Monster Creator works for you as before.

Nothing was found to have been misused; this closes the door.

## Build 507: the same security hole in the site's other picture uploads

Build 506 closed a hole in the Monster Creator's picture upload. Looking at every other place the site takes a
picture showed the same hole in thirteen more. Nothing you would have seen in play.

**What was wrong.**
- A logged-in player who knew how could put a program on the site disguised as a picture, through the hex map,
  an inventory item, a hireling's picture, or the picture boxes in the students, staff and locations notes.
- The old inventory page would delete, or make a public copy of, any file on the site that a player named.
- A player taking one of your shared pictures off a hex also deleted your own copy of it.

**What is different now.**
- Every upload checks that the file really is a picture, names the stored file itself, and keeps it in a folder
  that will not run anything.
- Pictures in the students, staff and locations notes are yours alone to add, as those pages already were.
- Deleting or sharing anything only ever touches that thing's own picture.
- Adding and removing pictures works as before everywhere. One change you could notice: BMP files are no
  longer accepted (JPEG, PNG, GIF and WebP are).

**After the deploy, one look:** open a student's or staff member's portrait and an inventory item's picture. If
they show, all is well. The folders they live in were given the same protective rule file the character
portraits folder has had since September.

Nothing was found to have been misused; this closes the door. The maps, the Gravity Orchard among them, are
not touched by this build.

## Build 508: a creature's own shift is a move, not a push

**What was wrong.** When an ability let a creature shift or move itself and you picked where it went, the app
treated that like a push. If another creature was on the square you picked, or on the way, your creature
slammed into it and both took collision damage.

**What is different now.**
- A creature moved by its own ability moves the way it does when you drag it with a shift: it never collides and
  never deals or takes collision damage.
- Squares with a creature in them are not highlighted. If you pick one anyway, the status line says who is
  there and you pick again. (A hidden creature is not given away to a player this way.)
- If the move is stopped by a wall, or you say no to a climb, the picker stays open for another square.
- Skip still skips. Watches on "when it moves" (Thorn in Foot) still count it, once.
- Passing through other creatures is not checked: that is the ability's own matter, as before.
- Pushes, pulls and slides of somebody ELSE are unchanged.

**With it:** Algis's Ride Them Down and Gintaras's Footwork and Stand at the Bier have their move step back in
the Medpilis files. Upload those two files only after this build is on the live site.

No map is touched; the Gravity Orchard plays as it does now.

## Build 509: your turn-order strip after a reload

**What was wrong.** If you reloaded your page in the middle of a round, your turn-order strip showed everybody as
not yet having acted, until the next turn ended. The players' pages were right all along. You could start a
creature's turn a second time without knowing. The same could happen when you opened another map for yourself in
mid-fight and came back.

**What is different now.**
- After a reload, your strip shows who has acted and whose turn it is, the same as the players see.
- Opening another map for yourself and coming back keeps the strip right.
- A creature whose token you delete still leaves the list, as before.

Seen in a page: Cal and a goblin done, your page reloaded, both still done from the moment the strip appears; a
kobold's turn under way, reloaded, still its turn with End Turn showing.

No map is touched; the Gravity Orchard plays as it does now.
