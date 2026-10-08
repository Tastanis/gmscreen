# Minion squads and captains

How squads and captains work in the VTT, for the GM and for whoever writes creatures.

## At the table

**Form a squad.** Select the minions of one kind and press **G**. They share one
Stamina pool, shown on every member. A hit on any member comes off the pool, on
every browser. When minions drop, the player or GM who dealt the damage sees the
"Minions Drop" pop-up, and chat tells the table how many dropped and how many are
left. Remove the dropped tokens from the board by hand.

**Give it a captain.** Select the creature that will lead plus at least one minion
of the squad. A button appears at the top of the map: **Make (name) captain of this
squad**. Click it, or press **C**. Chat says what the minions gain.

- Grouping minions with **G** together with exactly one creature that is not a
  minion does the same thing in one step.
- Selecting a different leader plus a minion offers **Make (name) captain,
  replacing (old captain)**.
- Selecting the captain (alone, or with its squad) offers **Detach captain**.
- A squad has one captain and a captain leads one squad. Attaching a captain to a
  second squad takes it off the first.
- The captain joins the squad's entry in the combat tracker, so they act together.
  Its Stamina stays its own. A detached captain acts by itself again.

**Badges.** The captain shows a "C" in its bottom-left corner, and each minion it
leads shows a small chevron. Players see the same badges. When the captain is at 0
Stamina its "C" turns grey and struck through, and the chevrons disappear.

**The bonus comes and goes by itself.** It is worked out at the moment it is
needed, so it stops the moment the captain is at 0 Stamina, removed from the map,
or detached, and it returns if the captain is healed. Nothing is enforced about
*when* a new captain may be attached; the rulebook says the start of the next
round.

## Writing the "With Captain" line

In the Monster Creator, a creature whose organization is Minion, Horde or Platoon
has a **With Captain** field. Write the line the way the monster book does. The
Monster Creator shows underneath what the VTT will do with it.

| Write | The VTT does |
|---|---|
| `+2 damage bonus to strikes` | adds 2 to the rolled damage of Strike abilities |
| `Gain an edge on strikes` | switches on an edge on the roll (the GM can switch it off) |
| `Have a double edge on strikes` | the same, as a double edge |
| `+5 bonus to ranged distance` | adds 5 to the distance of Ranged abilities |
| `+3 bonus to melee distance` | adds 3 to the distance of Melee abilities |
| `+2 bonus to speed` | adds 2 to the movement counter |
| `+2 bonus to forced movement` | adds 2 to pushes, pulls and slides |
| `+2 bonus to Stamina`, or anything else | nothing by itself: chat reminds the GM to apply it by hand |

Several bonuses can share the line, separated by `;` or "and".

The line must be in the **With Captain** field. Text such as "With Captain: +2
bonus to speed" written inside a trait is only text.

Tokens placed before this feature do not carry the line; the GM's browser looks it
up in the monster's record when a captain is attached.

## Where the rules live

- `dnd/vtt/assets/js/ui/minion-squads.mjs`: every rule above, with no page needed.
  Tests: `dnd/vtt/assets/js/ui/__tests__/minion-squads.test.mjs`.
- A squad is stored on its member tokens as a `squad` marker (`id`, `monsterId`,
  `perMinionStamina`, `maxPool`, `initialMemberCount`, and for a led squad
  `captainId` and `withCaptain`). The shared pool is each member's own Stamina.
  There is no separate squad record and nothing is kept only in one browser.
