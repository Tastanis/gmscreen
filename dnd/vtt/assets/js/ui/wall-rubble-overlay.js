// Draws rubble over broken walls, for everyone. The rules (what, where, how big, which picture)
// are in wall-rubble.mjs; this file only puts them on the board.
//
// Two layers, because a map can be painted in two places:
//  - rubble on bare ground sits just above the map picture, under the fog and the tokens, the same
//    place terrain zones are drawn;
//  - rubble on a floor plate (an upper floor, or any floor that has its own picture) sits just
//    above the plates, which are painted over the fog. It is drawn only while that floor is being
//    viewed and, for a player, only while the spot is in sight, the test door markers already use.
import { rubblePieces, rubbleLibrary, rubblePicture, rubbleSize, rubbleStrip, standInRubble, plateUnder, stableHash } from './wall-rubble.mjs';
import { wallHeights } from './wall-properties.mjs';
import { resolveSupportSurfaces } from './floor-support.js';

const NS = 'http://www.w3.org/2000/svg';
const transform = document.querySelector('#vtt-map-transform');
function layer(id, zIndex) {
  const svg = document.createElementNS(NS, 'svg');
  svg.id = id;
  svg.style.cssText = `position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:${zIndex}`;
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
const ground = layer('wall-rubble-ground', 2), floors = layer('wall-rubble-floors', 100001);
// The page lists whatever picture files are in assets/images/rubble, with their sizes; a kind with none is drawn.
const library = rubbleLibrary(window.vttRubbleImages);
let signature = '', builds = 0, drawn = [];

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function mount() {
  if (!ground.isConnected) transform.insertBefore(ground, document.querySelector('#terrain-cost-markers') || document.querySelector('#vtt-grid-overlay'));
  if (!floors.isConnected) { const plates = document.querySelector('#roof-prototype'); if (plates) plates.after(floors); else transform.append(floors); }
}
function clear(mark) {
  if (signature === mark) return;
  ground.replaceChildren(); floors.replaceChildren(); signature = mark; drawn = [];
}

const svgNode = (name, attributes = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

/**
 * A strip picture over one piece. The whole picture is scaled evenly until its band of rubble is
 * thicker than the painted wall; only the stretch over this piece is shown, fading out just past
 * each end, so the wall is hidden from end to end and nothing spills over pieces still standing.
 * `unit` is one square in pixels; `mark` makes the fade's name its own.
 */
function stripNodes(picture, piece, squares, unit, mark) {
  const strip = rubbleStrip(squares, picture.aspect, piece.id);
  const along = strip.along * unit, across = strip.across * unit, shown = strip.shown * unit;
  const ramp = svgNode('linearGradient', { id: `wall-rubble-ramp-${mark}`, gradientUnits: 'userSpaceOnUse', x1: -shown / 2, y1: 0, x2: shown / 2, y2: 0 });
  const edge = strip.fade / strip.shown;
  for (const [offset, opacity] of [[0, 0], [edge, 1], [1 - edge, 1], [1, 0]]) ramp.append(svgNode('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }));
  const fade = svgNode('mask', { id: `wall-rubble-fade-${mark}`, maskUnits: 'userSpaceOnUse', x: -shown / 2, y: -across / 2, width: shown, height: across });
  fade.append(svgNode('rect', { x: -shown / 2, y: -across / 2, width: shown, height: across, fill: `url(#wall-rubble-ramp-${mark})` }));
  const image = svgNode('image', { href: picture.url, x: -along / 2 + strip.shift * unit, y: -across / 2, width: along, height: across, preserveAspectRatio: 'none', mask: `url(#wall-rubble-fade-${mark})` });
  return [ramp, fade, image];
}

function pieceNode(entry, g, mark) {
  const { piece, from, to } = entry;
  const lengthPx = Math.hypot(to.x - from.x, to.y - from.y), squares = Math.hypot(piece.b.x - piece.a.x, piece.b.y - piece.a.y);
  const picture = rubblePicture(library, piece.kind, piece.id);
  const size = rubbleSize(squares), along = lengthPx * (size.along / squares), across = size.across * g;
  // Half the pieces are turned end for end, so a run of them does not repeat.
  const turn = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + (stableHash(piece.id) & 1 ? 180 : 0);
  const group = document.createElementNS(NS, 'g');
  group.dataset.rubbleId = piece.id; group.dataset.rubbleKind = piece.kind;
  group.setAttribute('transform', `translate(${((from.x + to.x) / 2).toFixed(2)} ${((from.y + to.y) / 2).toFixed(2)}) rotate(${turn.toFixed(2)})`);
  if (picture) {
    group.dataset.rubbleSource = 'picture';
    // One scale both ways, taken from the piece as it lies on the board, so the picture keeps its shape.
    group.append(...stripNodes(picture, piece, squares, lengthPx / squares, mark));
    return group;
  }
  group.dataset.rubbleSource = 'drawn';
  const drawing = standInRubble(piece.kind, piece.id), scaled = document.createElementNS(NS, 'g');
  scaled.setAttribute('transform', `scale(${along.toFixed(2)} ${across.toFixed(2)})`);
  const band = document.createElementNS(NS, 'path');
  band.setAttribute('d', drawing.band); band.setAttribute('fill', drawing.bandFill); band.setAttribute('fill-opacity', '0.96');
  scaled.append(band);
  for (const bit of drawing.bits) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', bit.d); path.setAttribute('fill', bit.fill);
    path.setAttribute('stroke', drawing.line); path.setAttribute('stroke-width', '1'); path.setAttribute('vector-effect', 'non-scaling-stroke'); path.setAttribute('stroke-linejoin', 'round');
    scaled.append(path);
  }
  group.append(scaled);
  return group;
}

function draw() {
  const c = context();
  if (!c?.view?.mapLoaded || !transform) { clear('no-map'); return; }
  const sceneId = c.state.boardState.activeSceneId, walls = c.state.boardState.sceneState?.[sceneId]?.environment?.walls;
  const model = walls?.value, pieces = model ? rubblePieces(model) : [];
  if (!pieces.length) { clear('none:' + sceneId); return; }
  mount();
  const active = terrain(), v = c.view, g = v.gridSize || 64, ox = v.gridOffsets?.left || 0, oy = v.gridOffsets?.top || 0;
  const groundAt = (x, y) => (active ? active.heightAt(ox + x * g, oy + y * g) : 0);
  const project = (point, height) => { const x = ox + point.x * g, y = oy + point.y * g; return active ? active.project(x, y, height) : { x, y }; };
  const surfaces = resolveSupportSurfaces(model);
  // A player, or the GM looking through a token's eyes, sees floor rubble only where they can see the spot.
  const bySight = !c.isGM || document.documentElement.classList.contains('height-vision-active');
  const viewed = c.levelId || 'level-0';
  const entries = pieces.map((piece) => {
    const middle = { x: (piece.a.x + piece.b.x) / 2, y: (piece.a.y + piece.b.y) / 2 };
    const heights = wallHeights(piece.edge, piece.a, piece.b, middle, groundAt), plate = plateUnder(piece, heights.base, surfaces);
    let shown = true;
    if (plate) shown = (plate.levelId || 'level-0') === viewed && (!bySight || !!window.visionPrototype?.portalVisible({ a: piece.a, b: piece.b, base: heights.base, top: heights.top }));
    return {
      piece, onPlate: !!plate, shown,
      from: project(piece.a, wallHeights(piece.edge, piece.a, piece.b, piece.a, groundAt).base),
      to: project(piece.b, wallHeights(piece.edge, piece.a, piece.b, piece.b, groundAt).base),
    };
  });
  const next = JSON.stringify([sceneId, walls.revision, viewed, g, ox, oy, v.mapPixelSize, !!active, active?.revision ?? 0, active?.key ?? '', entries.map((entry) => (entry.onPlate ? 'p' : 'g') + (entry.shown ? 1 : 0)).join('')]);
  if (next === signature) return;
  signature = next; builds++;
  for (const svg of [ground, floors]) { svg.setAttribute('width', v.mapPixelSize?.width || 0); svg.setAttribute('height', v.mapPixelSize?.height || 0); }
  const low = [], high = [];
  entries.forEach((entry, index) => { if (entry.shown) (entry.onPlate ? high : low).push(pieceNode(entry, g, index)); });
  ground.replaceChildren(...low); floors.replaceChildren(...high);
  drawn = entries.map((entry) => ({ id: entry.piece.id, kind: entry.piece.kind, layer: entry.onPlate ? 'floor' : 'ground', shown: entry.shown }));
}

// For the console and for tests: what is drawn right now.
window.wallRubble = {
  get pieces() { return drawn.map((entry) => ({ ...entry })); },
  get builds() { return builds; },
  get pictures() { return Object.fromEntries(Object.entries(library).map(([kind, urls]) => [kind, urls.length])); },
  redraw: draw,
};
const timer = setInterval(() => { try { draw(); } catch (error) { console.error('[wall rubble]', error); } }, 200);
timer?.unref?.(); // Only matters under test: the page's own timer is a plain number.
