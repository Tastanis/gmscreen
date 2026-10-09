import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateProperties, groupName, withGroups, GROUP_NAME } from '../wall-properties.mjs';
import { rubblePieces } from '../wall-rubble.mjs';

// A free-standing object (a pillar, a crate, a crystal) is a ring of walls that share a group
// name. It breaks as one thing and is drawn as one heap of rubble per square it stood on.
const ringOf = (id, column, row, wide, extra) => {
  const c = [[column + 0.04, row + 0.04], [column + wide - 0.04, row + 0.04], [column + wide - 0.04, row + 0.96], [column + 0.04, row + 0.96]];
  return {
    nodes: c.map(([x, y], k) => ({ id: `${id}-n${k}`, x, y })),
    segments: [0, 1, 2, 3].map((k) => ({ id: `${id}-w${k}`, a: `${id}-n${k}`, b: `${id}-n${(k + 1) % 4}`, baseMode: 'fixed', base: 0, height: 2, ...extra })),
  };
};
const modelOf = (...things) => ({ version: 1, nodes: things.flatMap((t) => t.nodes), segments: things.flatMap((t) => t.segments), roofs: [] });

test('a group name: what is allowed, and how a typed name is tidied', () => {
  validateProperties({ material: 'stone', group: 'orchard-break-T6' });
  validateProperties({ material: 'wood', group: 'crate_1.a:b' });
  assert.throws(() => validateProperties({ material: 'stone', group: '' }), /Invalid wall group name/);
  assert.throws(() => validateProperties({ material: 'stone', group: 'two words' }), /Invalid wall group name/);
  assert.throws(() => validateProperties({ material: 'stone', group: 7 }), /Invalid wall group name/);
  assert.throws(() => validateProperties({ material: 'stone', group: 'x'.repeat(129) }), /Invalid wall group name/);
  assert.throws(() => validateProperties({ group: 'crate-1' }), /A wall group needs a material/);
  assert.equal(groupName('  Big crate #2  '), 'Big-crate-2');
  assert.equal(groupName(''), '');
  assert.equal(groupName(null), '');
  assert.ok(GROUP_NAME.test(groupName('x'.repeat(300))));
});

test('an object\'s walls are found from any one of them', () => {
  const model = modelOf(ringOf('crate', 4, 4, 1, { material: 'wood', group: 'crate-1' }), ringOf('tooth', 8, 4, 1, { material: 'stone', group: 'tooth-1' }), ringOf('loose', 12, 4, 1, { material: 'wood' }));
  const ids = (edges) => edges.map((e) => e.id).sort();
  assert.deepEqual(ids(withGroups(model, [model.segments[0]])), ['crate-w0', 'crate-w1', 'crate-w2', 'crate-w3']);
  assert.deepEqual(ids(withGroups(model, [model.segments[1], model.segments[5]])), ['crate-w0', 'crate-w1', 'crate-w2', 'crate-w3', 'tooth-w0', 'tooth-w1', 'tooth-w2', 'tooth-w3']);
  const loose = model.segments.find((e) => e.id === 'loose-w2');
  assert.deepEqual(ids(withGroups(model, [loose])), ['loose-w2'], 'a wall with no group is only itself');
});

test('rubble: a broken object is one heap per square, not a strip per side', () => {
  const broken = { material: 'stone', group: 'tooth-1', broken: true };
  const one = rubblePieces(modelOf(ringOf('tooth', 24, 20, 1, broken)));
  assert.deepEqual(one.map((p) => [p.id, p.kind, p.heap, p.a, p.b]), [['tooth-1@24,20', 'heap-stone', true, { x: 24, y: 20.5 }, { x: 25, y: 20.5 }]]);
  const wide = rubblePieces(modelOf(ringOf('crate', 21, 20, 2, { material: 'wood', group: 'crate-1', broken: true })));
  assert.deepEqual(wide.map((p) => [p.id, p.kind]), [['crate-1@21,20', 'heap-wood'], ['crate-1@22,20', 'heap-wood']]);
  // The same ring with no group name is four walls: four strips.
  const strips = rubblePieces(modelOf(ringOf('loose', 4, 4, 1, { material: 'stone', broken: true })));
  assert.deepEqual(strips.map((p) => [p.kind, p.heap]), [['stone', undefined], ['stone', undefined], ['stone', undefined], ['stone', undefined]]);
  // Standing objects have no rubble; a broken one beside a standing one has only its own.
  const mixed = modelOf(ringOf('a', 4, 4, 1, { material: 'glass', group: 'a', broken: true }), ringOf('b', 6, 4, 1, { material: 'glass', group: 'b' }));
  assert.deepEqual(rubblePieces(mixed).map((p) => p.id), ['a@4,4']);
  assert.deepEqual(rubblePieces(modelOf(ringOf('b', 6, 4, 1, { material: 'glass', group: 'b' }))), []);
});

test('the heap is drawn whole over its square, in its own shape', async () => {
  const dom = new JSDOM('<div id="vtt-map-transform"><canvas id="roof-prototype"></canvas></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  window.vttRubbleImages = [{ url: 'assets/images/rubble/rubble-heap-stone-1.webp?v=5', width: 512, height: 442 }, { url: 'assets/images/rubble/rubble-stone-1.webp?v=5', width: 600, height: 200 }];
  const walls = { revision: 1, value: modelOf(ringOf('tooth', 3, 2, 1, { material: 'stone', group: 'tooth-1', broken: true })) };
  window.terrainContext = () => ({ isGM: true, levelId: 'level-0', userId: 'gm',
    view: { mapLoaded: true, gridSize: 64, gridOffsets: { left: 0, top: 0 }, mapPixelSize: { width: 640, height: 640 } },
    state: { boardState: { activeSceneId: 'scene', sceneState: { scene: { environment: { walls } } } } } });
  await import('../wall-rubble-overlay.js');
  window.wallRubble.redraw();
  const heaps = [...document.querySelectorAll('#wall-rubble-ground > g')];
  assert.equal(heaps.length, 1, 'one heap, not four strips');
  const heap = heaps[0], image = heap.querySelector('image');
  assert.deepEqual([heap.dataset.rubbleId, heap.dataset.rubbleKind, heap.dataset.rubbleSource], ['tooth-1@3,2', 'heap-stone', 'picture']);
  assert.match(image.getAttribute('href'), /rubble-heap-stone-1\.webp/);
  // A little larger than the square (64 pixels), keeping the picture's own shape, with no mask.
  const width = Number(image.getAttribute('width')), height = Number(image.getAttribute('height'));
  assert.ok(Math.abs(width - 64 * 1.12) < 0.01, `${width} wide`);
  assert.ok(Math.abs(height / width - 442 / 512) < 0.001, 'not stretched');
  assert.equal(image.getAttribute('mask'), null);
  assert.match(heap.getAttribute('transform'), /^translate\(224\.00 160\.00\)/, 'centred on the middle of the square');
  assert.deepEqual(window.wallRubble.pieces, [{ id: 'tooth-1@3,2', kind: 'heap-stone', layer: 'ground', shown: true }]);
});

test('the Walls panel breaks, repairs and re-marks an object whole, and can name one', () => {
  const editor = readFileSync(new URL('../wall-editor.mjs', import.meta.url), 'utf8');
  assert.match(editor, /const edges=k==='broken'\|\|k==='material'\?withGroups\(model\(\),picked\):picked;/, 'Broken and Breakable apply to every wall of the object');
  assert.match(editor, /group:'Object name'/);
  assert.match(editor, /else if\(k==='group'\)\{if\(named&&shared&&edge\.material&&!isOneWay\(edge\)\)\{edge\.group=named;edge\.material=shared;\}else delete edge\.group;\}/, 'naming gives the walls one name and one material');
  assert.match(editor, /delete edge\.material;delete edge\.broken;delete edge\.group;\}else\{edge\.material=value;/, 'a wall that stops being breakable leaves its object');
  assert.match(editor, /\(k==='broken'\|\|k==='group'\)&&!chosen\.every\(e=>e\.material&&!isOneWay\(e\)\)/, 'the name is offered only for breakable walls');
});
