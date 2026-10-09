// Draws the shadow of each floating floor plate on the ground straight under it, for everyone.
// What a floating plate is, and the shape of its shadow, are in height-view.mjs; this file only
// puts the shadows on the board.
//
// A floating plate is drawn up the screen from where it really is, with no wall joining it to the
// ground. The shadow marks its true place: the squares that are under it. It sits just above the
// map picture, under the fog and the tokens, where terrain zones and ground rubble are drawn, so
// the fog hides it wherever the ground itself is hidden. It falls on the ground only, not on a
// lower plate.
import { shadowRings, castsShadow, isFloating } from './height-view.mjs';
import { resolveSupportSurfaces } from './floor-support.js';

const NS = 'http://www.w3.org/2000/svg';
const transform = document.querySelector('#vtt-map-transform');
const svg = document.createElementNS(NS, 'svg');
svg.id = 'floating-shadows';
svg.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2';
svg.setAttribute('aria-hidden', 'true');
/** How dark the shadow is, and how soft its edge is, in squares. */
const DARKNESS = 0.55, SOFT = 0.14;
let signature = '', builds = 0, drawn = [];

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function mount() {
  // Under the ground rubble and the zone outlines, which lie on the ground the shadow falls on.
  if (!svg.isConnected) transform.insertBefore(svg, document.querySelector('#wall-rubble-ground') || document.querySelector('#terrain-cost-markers') || document.querySelector('#vtt-grid-overlay'));
}
function clear(mark) {
  if (signature === mark) return;
  svg.replaceChildren(); signature = mark; drawn = [];
}

function draw() {
  const c = context();
  if (!c?.view?.mapLoaded || !transform) { clear('no-map'); return; }
  const sceneId = c.state.boardState.activeSceneId, scene = c.state.boardState.sceneState?.[sceneId], walls = scene?.environment?.walls;
  const hidden = new Set((scene?.mapLevels?.levels || []).filter((level) => level?.hidden === true).map((level) => level.id));
  const plates = walls?.value ? resolveSupportSurfaces(walls.value).filter((surface) => isFloating(surface) && !hidden.has(surface.levelId)) : [];
  if (!plates.length) { clear('none:' + sceneId); return; }
  mount();
  const active = terrain(), v = c.view, g = v.gridSize || 64, ox = v.gridOffsets?.left || 0, oy = v.gridOffsets?.top || 0;
  const next = JSON.stringify([sceneId, walls.revision, [...hidden], g, ox, oy, v.mapPixelSize, !!active, active?.revision ?? 0, active?.key ?? '', active?.slant ?? null]);
  if (next === signature) return;
  signature = next; builds++;
  svg.setAttribute('width', v.mapPixelSize?.width || 0); svg.setAttribute('height', v.mapPixelSize?.height || 0);
  const groundAt = (x, y) => (active ? active.heightAt(ox + x * g, oy + y * g) : 0);
  const project = (point) => { const x = ox + point.x * g, y = oy + point.y * g; return active ? active.project(x, y, point.z) : { x, y }; };
  const blur = document.createElementNS(NS, 'filter');
  blur.id = 'floating-shadow-soft';
  // Room round each shadow for its soft edge, whatever the shadow's size.
  for (const [name, value] of [['x', '-25%'], ['y', '-25%'], ['width', '150%'], ['height', '150%']]) blur.setAttribute(name, value);
  const soften = document.createElementNS(NS, 'feGaussianBlur');
  soften.setAttribute('stdDeviation', (g * SOFT).toFixed(2));
  blur.append(soften);
  const nodes = [blur]; drawn = [];
  for (const plate of plates) {
    const rings = shadowRings(plate, groundAt);
    if (!castsShadow(rings, plate)) continue;
    const path = document.createElementNS(NS, 'path');
    path.dataset.shadowOf = plate.id ?? '';
    path.setAttribute('d', rings.map((ring) => 'M' + ring.map((point) => { const q = project(point); return `${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('L') + 'Z').join(''));
    path.setAttribute('fill', '#000'); path.setAttribute('fill-opacity', String(DARKNESS)); path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('filter', 'url(#floating-shadow-soft)');
    nodes.push(path); drawn.push({ id: plate.id ?? '', height: plate.height, levelId: plate.levelId });
  }
  svg.replaceChildren(...nodes);
}

// For the console and for tests: what is drawn right now.
window.floatingShadows = {
  get plates() { return drawn.map((entry) => ({ ...entry })); },
  get builds() { return builds; },
  redraw: draw,
};
const timer = setInterval(() => { try { draw(); } catch (error) { console.error('[floating shadows]', error); } }, 200);
timer?.unref?.(); // Only matters under test: the page's own timer is a plain number.
