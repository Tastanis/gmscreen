// The movement rules table: one set of numbers for the server and the browser (Brandon, November 8, 2026: "one
// rules table shared by server and browser"). The server reads the JSON between the two marks below
// (lib/MovementRules.php), so keep it plain JSON: double quotes, no comments inside, no trailing commas.
// Heights and distances are in squares.
export const MOVEMENT_RULES = Object.freeze(/*rules*/{
  "stepUp": 1.5,
  "climbGrade": 2,
  "bodyHeight": 1,
  "deckSnap": 0.5,
  "boxFoot": 0.5,
  "groundClearance": 0.125,
  "sunkPlate": 0.1,
  "boxOnPlate": 0.13,
  "stairMeetsPlate": 0.55,
  "objectSightPass": 1.5,
  "detourLimit": 2,
  "fallBreakSquares": 1,
  "fallBreakDamage": 1,
  "cost": {
    "square": 1,
    "climb": 1,
    "climbDown": 1,
    "water": 1,
    "difficult": 1,
    "enemy": 1
  }
}/*end*/);

// What each row means, for whoever reads this file:
// stepUp           a rise this high or lower is a plain step: a box, a low wall, a rail, bumpy ground. No question, no extra cost.
// climbGrade       ground rising this much (or more) for each square across is a cliff face; gentler is a slope, walked.
// bodyHeight       how tall a creature's body is for walls in its way. Anything above that and under its size is head room: a warning only.
// deckSnap         a deck, bridge or floor plate this close above or below the walker's feet is stepped onto (a gap fix, not a climb).
// boxFoot          a box or object standing on rough ground: its base may sit this far above the walker's feet and still be stepped onto.
// groundClearance  a floor plate this little above the ground counts as lying on it.
// sunkPlate        a floor plate sunk this little into the ground still counts as the floor.
// boxOnPlate       a box whose base is this close to a floor plate's height stands on that plate.
// stairMeetsPlate  a stair end this close to a plate's height joins it.
// objectSightPass  a labelled object this tall or lower lets sight over it unless it says otherwise.
// detourLimit      the route goes round a ledge only when that is at most this many squares longer than going off it.
// fallBreakSquares a fall breaks through a breakable object it lands on when it fell at least this many squares for each
//                  point of the object's Stamina (glass 1, wood 3, stone 6, metal 9). 0 = falls never break things.
// fallBreakDamage  the book's damage for breaking it (Stamina + 2) is added to the fall's, times this. 0 = none.
// cost             extra movement for each square: climbing, climbing down, water (free with a swim speed), difficult
//                  terrain, an enemy's square. Water and difficult terrain together cost one extra, not two.

export const rule = (name) => MOVEMENT_RULES[name];
