import {rubblePieces,plateUnder,coveredAbove} from './wall-rubble.mjs';
import { wallHeights } from './wall-properties.mjs';
import { cubeRubble } from './wall-break.mjs';
import { resolveSupportSurfaces } from './floor-support.js';

let drawn = [];
let lastSignature = null;
let lastView = null;

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function clear(){
  if (drawn.length) window.vtt3d?.setOverlay('rubble', []);
  lastSignature = null;
  drawn = [];
}

function draw() {
  // 3D board: the same pieces, as small stones along each broken wall at its base (window.vtt3d overlay 'rubble').
  if (!window.vtt3d?.active) return;
  const c = context();
  if (!c?.view?.mapLoaded) { clear(); return; }
  const sceneId = c.state.boardState.activeSceneId, walls = c.state.boardState.sceneState?.[sceneId]?.environment?.walls;
  // Broken walls of the map's own design, and broken cubes of walls made during play.
  const cubes = cubeRubble(c.state.boardState.templates?.[sceneId]);
  const model = walls?.value || (cubes.length ? { nodes: [], segments: [] } : null), pieces = model ? [...rubblePieces(model), ...cubes] : [];
  if (!pieces.length) { clear(); return; }
  const active = terrain(), v = c.view, g = v.gridSize || 64, ox = v.gridOffsets?.left || 0, oy = v.gridOffsets?.top || 0;
  const groundAt = (x, y) => (active ? active.heightAt(ox + x * g, oy + y * g) : 0);
  const surfaces = resolveSupportSurfaces(model);
  // A player, or the GM looking through a token's eyes, sees floor rubble only where they can see the spot.
  // The GM with no single token selected looks down from a chosen height. Otherwise the view is a
  // token's: a player's own floor, or the floor of the token the GM is looking through.
  const fromHeight = c.isGM && window.gmVision?.manual ? Number(window.gmVision.height) : null;
  const placements = c.state.boardState.placements?.[sceneId], throughToken = c.isGM && fromHeight === null
    ? (Array.isArray(placements) ? placements : Object.values(placements || {})).find((placement) => placement.id === c.selectedIds?.[0]) : null;
  const viewed = throughToken?.levelId || c.levelId || 'level-0';
  const entries = pieces.map((piece) => {
    const middle = { x: (piece.a.x + piece.b.x) / 2, y: (piece.a.y + piece.b.y) / 2 };
    const heights = wallHeights(piece.edge, piece.a, piece.b, middle, groundAt), plate = plateUnder(piece, heights.base, surfaces);
    let shown = true;
    if (plate && fromHeight !== null) shown = Number(plate.height) <= fromHeight + 0.001 && !coveredAbove(piece, plate, surfaces, fromHeight);
    else if (plate) shown = (plate.levelId || 'level-0') === viewed;
    if (shown && !c.isGM && window.vttSightSees?.(middle.x, middle.y) === false) shown = false;
    return {
      piece, onPlate: !!plate, shown,
    };
  });
  const signature = JSON.stringify([sceneId, walls?.revision, active?.fieldVersion, entries]);
  if (signature === lastSignature && lastView === window.vtt3d.view) return;
  lastSignature = signature;
  lastView = window.vtt3d.view;
  const stones = [];
  entries.forEach((entry, index) => {
    if (!entry.shown) return;
    const { a, b, edge } = entry.piece, from = wallHeights(edge, a, b, a, groundAt).base, to = wallHeights(edge, a, b, b, groundAt).base;
    const count = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 5));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count, noise = Math.sin((index * 31 + i) * 12.9898) * 43758.5453, r = noise - Math.floor(noise), r2 = (r * 7.31) % 1;
      stones.push({ kind: 'dot', x: a.x + (b.x - a.x) * t + (r - 0.5) * 0.16, y: a.y + (b.y - a.y) * t + (r2 - 0.5) * 0.16, z: from + (to - from) * t, r: 0.05 + r * 0.06, color: r > 0.5 ? '#7c7468' : '#9a9184', opacity: 1 });
    }
  });
  window.vtt3d.setOverlay('rubble', stones);
  drawn = entries.map((entry) => ({ id: entry.piece.id, kind: entry.piece.kind, layer: entry.onPlate ? 'floor' : 'ground', shown: entry.shown }));
}

// For the console and for tests: what is drawn right now.
window.wallRubble = {
  get pieces() { return drawn.map((entry) => ({ ...entry })); },
  redraw: draw,
};
const timer = setInterval(() => { try { draw(); } catch (error) { console.error('[wall rubble]', error); } }, 200);
timer?.unref?.(); // Only matters under test: the page's own timer is a plain number.
