import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { BREAK_TYPES, BREAK_STAMINA, BREAK_EXTRA, wallBreakFields, squareMarks, wallKind, wallStamina, wallRubble, breakChoice, breakSetting, breakSummary, markCubes, cubeRubble } from '../wall-break.mjs';
import { wallCubeModel, wallMaterial } from '../wall-cubes.js';
import { normalizeTemplateEntry } from '../../state/normalize/templates.js';
import { createTemplateGeometry } from '../template-geometry.js';

// A wall made during play (the template tool, or an ability) can be given what it takes to break
// it: one of the book's materials, or a Stamina for each square. The server's side of the same
// rules is summoned-walls.test.php.
const wall = (extra = {}, squares = [{ column: 10, row: 5 }, { column: 10, row: 6 }, { column: 10, row: 7 }]) => ({ id: 'summoned', type: 'wall', levelId: 'level-0', squares, ...extra });

test('what it takes to break a wall: a type, a number, or nothing', () => {
  assert.equal(wallStamina(wall()), null, 'given neither, it does not break');
  assert.deepEqual(BREAK_TYPES.map((wallType) => wallStamina(wall({ wallType }))), [1, 3, 6, 9], 'a type is shorthand for the book\'s number');
  assert.equal(wallStamina(wall({ wallStamina: 15 })), 15);
  assert.equal(wallStamina(wall({ wallType: 'wood', wallStamina: 15 })), 15, 'a stated number is used over the type');
  assert.equal(wallStamina(wall({ wallColor: 'fire', wallType: 'wood' })), null, 'fire never breaks');
  assert.equal(wallStamina(wall({ wallColor: 'red', wallStamina: 5 })), null);
  // Only what the server would accept is kept.
  assert.deepEqual(wallBreakFields({ wallType: 'stone', wallStamina: 20, wallColor: 'gray' }), { wallType: 'stone', wallStamina: 20 });
  for (const bad of [{ wallType: 'ice' }, { wallStamina: 0 }, { wallStamina: 1000 }, { wallStamina: 2.5 }, { wallStamina: '15' }, {}, null]) assert.deepEqual(wallBreakFields(bad), {});
  assert.deepEqual(BREAK_STAMINA, { glass: 1, wood: 3, stone: 6, metal: 9 });
  assert.equal(BREAK_EXTRA, 2, 'the damage is the Stamina plus 2, as in every row of the book\'s table');
});

test('the colour says what a wall is, the same list the cubes are drawn by', () => {
  for (const value of ['gray', 'brown', 'green', 'purple', 'blue', 'cyan', 'red', 'stone', 'dirt', 'metal', 'ice', 'fire', '', undefined, 'pink']) assert.equal(wallKind(value), wallMaterial(value), String(value));
});

test('the rubble a broken cube leaves: its type, or else what its colour says', () => {
  const cases = [[{ wallType: 'glass', wallColor: 'stone' }, 'glass'], [{ wallStamina: 15 }, 'stone'], [{ wallStamina: 15, wallColor: 'metal' }, 'metal'], [{ wallStamina: 15, wallColor: 'ice' }, 'glass'], [{ wallStamina: 15, wallColor: 'blue' }, 'glass'], [{ wallStamina: 15, wallColor: 'dirt' }, 'wood'], [{ wallStamina: 15, wallColor: 'green' }, 'wood']];
  for (const [extra, rubble] of cases) assert.equal(wallRubble(wall(extra)), rubble, JSON.stringify(extra));
});

test('the GM\'s choice, and the words that go with it', () => {
  assert.equal(breakChoice(wall()), 'none');
  assert.equal(breakChoice(wall({ wallType: 'stone' })), 'stone');
  assert.equal(breakChoice(wall({ wallType: 'stone', wallStamina: 15 })), 'stamina');
  assert.deepEqual(breakSetting('none', 9), {});
  assert.deepEqual(breakSetting('wood', 9), { wallType: 'wood' });
  assert.deepEqual(breakSetting('stamina', '15'), { wallStamina: 15 });
  assert.deepEqual(breakSetting('stamina', 15.9), { wallStamina: 15 });
  assert.deepEqual(breakSetting('stamina', ''), {}, 'no number is no setting');
  assert.deepEqual(breakSetting('stamina', 5000), {});
  assert.equal(breakSummary(wall()), 'Not breakable');
  assert.equal(breakSummary(wall({ wallType: 'stone' })), 'Stone: 6 squares of push, 8 damage');
  assert.equal(breakSummary(wall({ wallType: 'glass' })), 'Glass: 1 square of push, 3 damage');
  assert.equal(breakSummary(wall({ wallStamina: 15 })), 'Stamina 15: 15 squares of push, 17 damage');
  assert.equal(breakSummary(wall({ wallColor: 'fire', wallType: 'stone' })), 'Fire: never breaks');
});

test('breaking and repairing cubes by hand', () => {
  const stone = wall({ wallType: 'stone' });
  const one = markCubes(stone, ['10,6,0'], true);
  assert.deepEqual(one, [{ column: 10, row: 5 }, { column: 10, row: 6, broken: true, rubble: 'stone' }, { column: 10, row: 7 }]);
  const all = markCubes(stone, ['10,5,0', '10,6,0', '10,7,0'], true);
  assert.ok(all.every((square) => square.broken === true && square.rubble === 'stone'));
  assert.deepEqual(markCubes({ ...stone, squares: all }, ['10,5,0', '10,6,0', '10,7,0'], false), stone.squares, 'repaired, they are plain cubes again');
  // A cube up on another cube has its own key.
  const stacked = wall({ wallStamina: 4, wallColor: 'ice' }, [{ column: 3, row: 2 }, { column: 3, row: 2, elevation: 1 }]);
  assert.deepEqual(markCubes(stacked, ['3,2,1'], true), [{ column: 3, row: 2 }, { column: 3, row: 2, elevation: 1, broken: true, rubble: 'glass' }]);
  assert.deepEqual(squareMarks({ column: 1, row: 1 }), {});
  assert.deepEqual(squareMarks({ broken: true, rubble: 'wood' }), { broken: true, rubble: 'wood' });
  assert.deepEqual(squareMarks({ broken: true, rubble: 'lava' }), { broken: true });
  assert.deepEqual(squareMarks({ broken: 'yes' }), {});
});

test('the settings and the broken cubes survive every place a wall is copied', () => {
  const stored = wall({ wallType: 'stone', wallStamina: 20, wallColor: 'gray', authorId: 'gm' }, [{ column: 10, row: 5, broken: true, rubble: 'stone' }, { column: 10, row: 6 }, { column: 10, row: 7, elevation: 1, broken: true, rubble: 'stone' }]);
  const state = normalizeTemplateEntry(stored);
  assert.deepEqual([state.wallType, state.wallStamina, state.squares], ['stone', 20, stored.squares], 'in the board\'s state');
  const view = { mapLoaded: true, gridSize: 64, mapPixelSize: { width: 6400, height: 6400 }, gridOffsets: {} };
  const geometry = createTemplateGeometry(() => view);
  const saved = geometry.normalizeSerializedTemplate(stored);
  assert.deepEqual([saved.wallType, saved.wallStamina, saved.squares], ['stone', 20, stored.squares], 'in the template tool\'s copy');
  assert.deepEqual(geometry.sanitizeWallSquares(stored.squares), stored.squares);
  assert.deepEqual(geometry.clampWallSquares(stored.squares, view), stored.squares);
  const shape = geometry.geometryForTemplate('wall', saved, view);
  assert.deepEqual([shape.wallType, shape.wallStamina, shape.squares], ['stone', 20, stored.squares], 'on the wall as drawn');
  // A player's copy has no settings, and that is not mistaken for a change to the wall.
  const player = normalizeTemplateEntry({ ...stored, wallType: undefined, wallStamina: undefined });
  assert.ok(!('wallType' in player) && !('wallStamina' in player));
  assert.deepEqual(player.squares, stored.squares, 'a player still sees which cubes are broken');
});

test('a broken cube stops nothing and is not drawn as a cube', async () => {
  const half = wall({ wallType: 'stone' }, [{ column: 10, row: 5, broken: true, rubble: 'stone' }, { column: 10, row: 6 }]);
  const model = wallCubeModel({ nodes: [], segments: [], roofs: [] }, [half], {}, () => 0);
  assert.equal(model.segments.length, 4, 'only the standing cube has walls');
  assert.ok(model.segments.every((edge) => edge.id.startsWith('template-cube:summoned:10,6,0')));
  assert.equal(model.roofs.length, 1, 'and only it has a top to stand on');
  // On the page: one cube drawn, the label counts the standing ones, and the wall keeps both.
  const dom = new JSDOM('<div id="root"><div id="tiles"></div><div id="label"></div></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const { paintWallTemplate } = await import('../template-wall-renderer.js');
  const view = { mapLoaded: true, gridSize: 64, mapPixelSize: { width: 6400, height: 6400 }, gridOffsets: {} };
  const shape = { ...half, elements: { root: document.getElementById('root'), tileContainer: document.getElementById('tiles'), label: document.getElementById('label'), tiles: new Map(), connectors: new Map() } };
  paintWallTemplate(shape, view, {});
  assert.deepEqual([...document.querySelectorAll('[data-wall-square]')].map((cube) => cube.dataset.wallSquare), ['10,6,0']);
  assert.equal(document.getElementById('label').textContent, '1 square');
  assert.deepEqual(shape.squares, half.squares, 'the broken cube is still part of the wall');
  // With every cube broken the wall draws nothing, and still keeps its cubes for repair.
  const gone = { ...shape, squares: markCubes(half, ['10,6,0'], true), elements: shape.elements };
  paintWallTemplate(gone, view, {});
  assert.equal(gone.elements.root.hidden, true);
  assert.equal(gone.squares.length, 2);
});

test('rubble: one heap on each broken cube\'s square', async () => {
  const walls = [
    wall({ wallType: 'wood', id: 'a' }, [{ column: 3, row: 2, broken: true, rubble: 'wood' }, { column: 4, row: 2 }]),
    wall({ wallStamina: 15, wallColor: 'ice', id: 'b' }, [{ column: 6, row: 2, broken: true }]),
    { id: 'c', type: 'circle', center: { column: 1, row: 1 }, radius: 2 },
    wall({ id: 'd' }, [{ column: 8, row: 2 }]),
  ];
  const pieces = cubeRubble(walls);
  assert.deepEqual(pieces.map((p) => [p.id, p.kind, p.heap, p.a, p.b]), [
    ['cube:a:3,2', 'heap-wood', true, { x: 3, y: 2.5 }, { x: 4, y: 2.5 }],
    ['cube:b:6,2', 'heap-glass', true, { x: 6, y: 2.5 }, { x: 7, y: 2.5 }],
  ]);
  assert.deepEqual(cubeRubble({ a: walls[0] }).map((p) => p.id), ['cube:a:3,2'], 'the board keeps templates as a list or by id');
  assert.deepEqual(cubeRubble(null), []);
  // On the page, with no broken wall in the map's own design.
  const dom = new JSDOM('<div id="vtt-map-transform"><canvas id="roof-prototype"></canvas></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  window.vttRubbleImages = [{ url: 'assets/images/rubble/rubble-heap-wood-1.webp?v=5', width: 512, height: 512 }];
  window.terrainContext = () => ({ isGM: false, levelId: 'level-0', userId: 'cal',
    view: { mapLoaded: true, gridSize: 64, gridOffsets: { left: 0, top: 0 }, mapPixelSize: { width: 640, height: 640 } },
    state: { boardState: { activeSceneId: 'scene', sceneState: { scene: {} }, templates: { scene: walls } } } });
  await import('../wall-rubble-overlay.js');
  window.wallRubble.redraw();
  const drawn = [...document.querySelectorAll('#wall-rubble-ground > g')];
  assert.deepEqual(drawn.map((g) => [g.dataset.rubbleId, g.dataset.rubbleKind, g.dataset.rubbleSource]), [['cube:a:3,2', 'heap-wood', 'picture'], ['cube:b:6,2', 'heap-glass', 'drawn']]);
  assert.match(drawn[0].getAttribute('transform'), /^translate\(224\.00 160\.00\)/, 'centred on the cube\'s square');
});

test('an ability says what its wall is made of', async () => {
  globalThis.window = globalThis;
  const base = new URL('../../../../../character_sheet/ability-automation/', import.meta.url);
  await import(new URL('primitives.js', base));
  await import(new URL('schema.js', base));
  const target = (extra) => window.AbilityAutomationSchema.normalizeAutomation({ cards: [{ type: 'target', mode: 'area', shape: 'wall', length: 5, structure: true, wallColor: 'stone', ...extra }] });
  const stone = target({ wallType: 'Stone' });
  assert.equal(stone.cards[0].wallType, 'stone');
  assert.equal('wallStamina' in stone.cards[0], false);
  const numbered = target({ wallStamina: 15 });
  assert.equal(numbered.cards[0].wallStamina, 15);
  assert.deepEqual(numbered.warnings.filter((w) => /wall/i.test(w)), []);
  const bad = target({ wallType: 'ice', wallStamina: 0 });
  assert.equal('wallType' in bad.cards[0], false);
  assert.equal('wallStamina' in bad.cards[0], false);
  assert.equal(bad.warnings.filter((w) => /wallType|wallStamina/.test(w)).length, 2, 'a bad value is ignored with a warning, never guessed at');
  assert.equal('wallType' in target({}).cards[0], false, 'an ability that says nothing makes a wall that does not break');
});

test('the board passes the settings from an ability and from the GM, and offers them to the GM only', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /const wallBreak = wallBreakFields\(request\.targetConfig\);/);
  assert.match(board, /startWallPlacementForAutomation\(length, \{ wallColor, persistStructure, \.\.\.wallBreak \}\)/);
  assert.match(board, /createPermanentWallFromSquares\(finalSquares, wallColor, placementValues\);/, 'an ability\'s wall is made with them');
  assert.match(board, /finalizePlacement\(\{ type: 'wall', squares: finalSquares, wallColor, \.\.\.placementValues \}\);/, 'and a wall placed by hand');
  assert.match(board, /Object\.assign\(base, wallBreakFields\(shape\)\);/, 'they are saved with the wall');
  assert.match(board, /\.\.\.\(isGmUser\(\) \? \[wallBreakPicker\.wrapper\] : \[\]\)/, 'only the GM is offered the choice when placing');
  assert.match(board, /\.\.\.\(activeType === 'wall' && isGmUser\(\) \? wallBreakPicker\.value\(\) : \{\}\)/);
  assert.match(board, /function selectedWallForBar\(\) \{\s*if \(!isGmUser\(\)\) return null;/, 'and only the GM gets the bar for a wall that stands (wall-break-bar.test.mjs)');
});
