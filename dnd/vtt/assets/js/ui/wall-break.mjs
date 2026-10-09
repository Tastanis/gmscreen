// What it takes to break a wall made during play (the template tool, or an ability). Pure.
// Paired with WallCubes::stamina, rubble, settle and validate on the server.
//
// A summoned wall is a list of cubes. It may be given a type (one of the book's materials) or a
// Stamina for each square; each cube is then one breakable object. A wall given neither cannot be
// broken, as before. Fire is something a creature goes through: it never breaks.
//
// The book's four materials already read as Stamina a square: glass 1, wood 3, stone 6, metal 9.
// Breaking a square costs that many squares of forced movement and does that much plus 2.

export const BREAK_TYPES = ['glass', 'wood', 'stone', 'metal'];
export const BREAK_STAMINA = { glass: 1, wood: 3, stone: 6, metal: 9 };
export const MAX_WALL_STAMINA = 999;
/** Added to a wall's Stamina for the damage a creature hurled through it takes. */
export const BREAK_EXTRA = 2;

/** What a wall is made of, from the colour it is drawn in. The same list as wallMaterial in wall-cubes.js. */
export function wallKind(value) {
  return ({ gray: 'stone', brown: 'dirt', green: 'dirt', purple: 'metal', blue: 'ice', cyan: 'ice', red: 'fire' })[value]
    || (['stone', 'dirt', 'metal', 'ice', 'fire'].includes(value) ? value : 'stone');
}

/** The two settings as they may be stored on a template; anything else is dropped. */
export function wallBreakFields(entry) {
  const out = {}, stamina = entry?.wallStamina;
  if (BREAK_TYPES.includes(entry?.wallType)) out.wallType = entry.wallType;
  if (Number.isInteger(stamina) && stamina >= 1 && stamina <= MAX_WALL_STAMINA) out.wallStamina = stamina;
  return out;
}

/** A cube's own marks: broken, and the rubble it left. A standing cube has none. */
export function squareMarks(square) {
  if (square?.broken !== true) return {};
  return { broken: true, ...(BREAK_TYPES.includes(square.rubble) ? { rubble: square.rubble } : {}) };
}

/** The Stamina of each cube, or null when the wall cannot be broken. */
export function wallStamina(template) {
  if (wallKind(template?.wallColor) === 'fire') return null;
  const fields = wallBreakFields(template);
  return fields.wallStamina ?? BREAK_STAMINA[fields.wallType] ?? null;
}

/** The heap of rubble a broken cube leaves: its type, or else what its colour says it is. */
export function wallRubble(template) {
  const { wallType } = wallBreakFields(template);
  return wallType || { stone: 'stone', dirt: 'wood', metal: 'metal', ice: 'glass', fire: 'stone' }[wallKind(template?.wallColor)];
}

/** The choice shown for a wall: 'none', one of the four types, or 'stamina' for a stated number. */
export function breakChoice(template) {
  const fields = wallBreakFields(template);
  return fields.wallStamina ? 'stamina' : fields.wallType || 'none';
}

/** The settings for a choice. `stamina` is read only when the choice is 'stamina'. */
export function breakSetting(choice, stamina) {
  if (BREAK_TYPES.includes(choice)) return { wallType: choice };
  if (choice === 'stamina') return wallBreakFields({ wallStamina: Math.trunc(Number(stamina)) });
  return {};
}

/** In words, for the GM: "Stone: 6 squares of push, 8 damage", "Stamina 15: 15 squares of push, 17 damage". */
export function breakSummary(template) {
  const stamina = wallStamina(template);
  if (stamina === null) return wallKind(template?.wallColor) === 'fire' ? 'Fire: never breaks' : 'Not breakable';
  const { wallType, wallStamina: stated } = wallBreakFields(template);
  const name = stated ? `Stamina ${stated}` : wallType[0].toUpperCase() + wallType.slice(1);
  return `${name}: ${stamina} ${stamina === 1 ? 'square' : 'squares'} of push, ${stamina + BREAK_EXTRA} damage`;
}

/** The squares with these cubes marked broken (true) or standing again (false). `keys` are 'column,row,elevation'. */
export function markCubes(template, keys, broken) {
  const wanted = new Set(keys), rubble = wallRubble(template);
  return (template?.squares || []).map((square) => {
    if (!wanted.has(`${square.column},${square.row},${square.elevation ?? 0}`)) return square;
    const { broken: _was, rubble: _left, ...rest } = square;
    return broken ? { ...rest, broken: true, rubble } : rest;
  });
}

/** One heap of rubble for each broken cube of each wall, as the rubble layer draws them. */
export function cubeRubble(templates) {
  const pieces = [];
  for (const template of Array.isArray(templates) ? templates : Object.values(templates || {})) {
    if (template?.type !== 'wall') continue;
    for (const square of template.squares || []) {
      if (square?.broken !== true || (square.elevation ?? 0) !== 0) continue;
      const material = BREAK_TYPES.includes(square.rubble) ? square.rubble : wallRubble(template);
      pieces.push({
        id: `cube:${template.id}:${square.column},${square.row}`, kind: `heap-${material}`, heap: true, levelId: template.levelId || 'level-0',
        edge: { id: `cube:${template.id}`, baseMode: 'terrain', base: 0, height: 1, topMode: 'follow' },
        a: { x: square.column, y: square.row + 0.5 }, b: { x: square.column + 1, y: square.row + 0.5 },
      });
    }
  }
  return pieces;
}
