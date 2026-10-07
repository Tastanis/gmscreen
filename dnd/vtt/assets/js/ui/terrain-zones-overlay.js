// Draws tagged terrain zones on the board and answers "which zones is this
// token in". Reads the canonical scene environment; display choice is local.
import {sceneZones, buildZoneIndex, zonesForFootprint, zoneTags, squareCostMultiplier, zoneGeometry, zoneColor, zoneSurface, summarizeRoute, zonesHiddenFromPlayers, BASE_LEVEL_ID, placeCornerControl, hasMovementType, standsOnPlate} from './terrain-zones.mjs';
import {routeSteps, groundSquare, stepCost, climbSurcharge} from './terrain-math.mjs';
import {saveShared} from './environment-sync.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';

const NS = 'http://www.w3.org/2000/svg';
const transform = document.querySelector('#vtt-map-transform');
const svg = document.createElementNS(NS, 'svg');
svg.id = 'terrain-zone-overlay';
svg.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2';
svg.setAttribute('aria-hidden', 'true');
let visible = true, preferenceKey = '', signature = '', builds = 0, saving = false;
let cache = {key: '', zones: [], index: new Map(), hiddenFromPlayers: false};

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function sceneOf(c) { return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId] || null; }

function current(c = context()) {
  const sceneId = c?.state.boardState.activeSceneId || '', field = sceneOf(c)?.environment?.zones || null;
  const key = sceneId + ':' + (field?.revision ?? 'none') + ':' + (field?.value?.zones?.length ?? 0);
  if (key !== cache.key) { const zones = sceneZones(c?.state.boardState.sceneState, sceneId); cache = {key, zones, index: buildZoneIndex(zones), hiddenFromPlayers: zonesHiddenFromPlayers(field)}; }
  return cache;
}
function elevations(c = context()) { return floorElevations(sceneOf(c)?.mapLevels); }

/** Absolute height of a token's feet: terrain, deck or flight when the map has height; the floor otherwise. */
function standingHeight(placement, c = context()) {
  const active = terrain();
  if (active) return active.groundFor(placement);
  const base = elevations(c).get(placement.levelId || BASE_LEVEL_ID) ?? 0;
  if (['fly', 'hover'].includes(placement.movementMode)) return Math.max(base, Number.isFinite(placement.flightHeight) ? placement.flightHeight : base + 1);
  return base;
}
function placementOf(target, c = context()) {
  if (target && typeof target === 'object') return target;
  const list = c?.state.boardState.placements?.[c.state.boardState.activeSceneId];
  return (Array.isArray(list) ? list : Object.values(list || {})).find((p) => p?.id === target) || null;
}
function zonesForPlacement(target) {
  const c = context(), placement = placementOf(target, c);
  if (!placement) return [];
  const floors = elevations(c);
  const feet = standingHeight(placement, c);
  return zonesForFootprint(current(c).index, placement, feet, (levelId) => floors.get(levelId) ?? 0, {onPlate: onPlate(placement, feet, c)});
}
/** Decks, planks and other floor plates: a token standing on one is out of the liquid under it. */
function onPlate(mover, feet, c = context()) {
  const active = terrain();
  if (!active || ['fly', 'hover'].includes(mover?.movementMode)) return false;
  return standsOnPlate(mover, feet, active.design ?? sceneOf(c)?.environment?.walls?.value, sceneOf(c)?.mapLevels);
}
/** Who is charged for a climb: anyone walking, except fliers and creatures with "climb" in their movement. */
function paysForClimb(actor, kind = 'walk') {
  return kind !== 'forced' && kind !== 'teleport' && !['fly', 'hover'].includes(actor?.movementMode) && !hasMovementType(actor, 'climb');
}

/** Movement multiplier for a mover entering this square (1 on ordinary ground, or when it is above the zone). */
function stepMultiplier(actor, column, row, rawHeight) {
  const c = context(), index = current(c).index;
  if (!index.size) return 1;
  const floors = elevations(c), levelId = actor?.levelId || c?.levelId || BASE_LEVEL_ID;
  const mover = {column, row, width: actor?.width || 1, height: actor?.height || 1, levelId, movementMode: actor?.movementMode, flightHeight: actor?.flightHeight};
  const airborne = ['fly', 'hover'].includes(mover.movementMode);
  const feet = airborne ? standingHeight({...(actor || {}), ...mover}, c) : Number.isFinite(rawHeight) ? rawHeight : floors.get(levelId) ?? 0;
  let cost = 1;
  for (const zone of zonesForFootprint(index, mover, feet, (id) => floors.get(id) ?? 0, {onPlate: !airborne && onPlate(mover, feet, c)})) cost = Math.max(cost, zone.cost);
  return cost;
}
function moverFor(c) {
  const id = c?.selectedIds?.[0] || window.visionPrototype?.viewerTokenId || c?.followId || null;
  return id ? placementOf(id, c) : null;
}
/**
 * Distance and true movement cost of a route through waypoints ({column,row} squares).
 * kind: 'walk' or 'shift' pay for difficult terrain; 'forced' and 'teleport' do not.
 */
function routeCost(points, {kind = 'walk', actor = undefined} = {}) {
  const c = context(), active = terrain(), ignoreZones = kind === 'forced' || kind === 'teleport';
  const mover = actor === undefined ? moverFor(c) : actor;
  const ignoreClimb = !paysForClimb(mover, kind);
  const stepsBetween = (a, b) => active
    ? active.route(a, b, {ignoreZones, ignoreClimb, actor: mover || undefined})
    : routeSteps(a, b, () => 0, ignoreZones ? null : (column, row) => stepMultiplier(mover, column, row, undefined));
  const summary = summarizeRoute(points, stepsBetween);
  const start = points?.[0];
  summary.startsInDifficult = !ignoreZones && !!start && stepMultiplier(mover, start.column, start.row, active ? active.heightAt((c.view.gridOffsets?.left || 0) + (start.column + .5) * (c.view.gridSize || 64), (c.view.gridOffsets?.top || 0) + (start.row + .5) * (c.view.gridSize || 64)) : undefined) > 1;
  // The rules do not allow shifting into or within difficult terrain.
  summary.shiftInDifficult = kind === 'shift' && (summary.difficult.length > 0 || summary.startsInDifficult);
  return summary;
}
/**
 * Per-square lookup for the reach outline: the rounded ground height and the
 * movement multiplier a mover meets on each square. Null when the scene has
 * neither height nor zones, so the plain square outline is already exact.
 */
function cellInfoFor(target) {
  const c = context(), active = terrain(), state = current(c), actor = placementOf(target, c);
  if (!active && !state.zones.length) return null;
  const airborne = ['fly', 'hover'].includes(actor?.movementMode);
  return {
    key: [state.key, active?.revision ?? 0, active?.key ?? '', actor?.levelId || '', actor?.width || 1, airborne ? actor.flightHeight ?? 'air' : 'ground', paysForClimb(actor) ? 'climbs' : 'climber'].join('|'),
    at(column, row) {
      const raw = active ? active.route({column, row}, {column, row}, {ignoreZones: true}).points[0].rawHeight : undefined;
      return {column, row, height: active ? groundSquare(raw) : 0, multiplier: stepMultiplier(actor, column, row, raw)};
    },
    // The reach outline charges each step exactly as the ruler does, climbs included.
    stepCost: (from, to) => {
      const rise = to.height - from.height;
      const climb = !!active && rise > 0 && climbSurcharge(rise) > 0 && paysForClimb(actor) && active.climbFace(actor, from, to);
      return stepCost({horizontal: 1, rise, multiplier: to.multiplier, climb});
    },
  };
}

// ---- Corner toggle ---------------------------------------------------------
// A tiny control at the bottom left of the board. Everyone can hide or show
// zones on their own screen; the GM can also hide them from the players.
const control = document.createElement('div');
control.id = 'terrain-zone-toggle';
control.hidden = true;
const ownButton = document.createElement('button');
ownButton.type = 'button'; ownButton.dataset.action = 'terrain-zones'; ownButton.textContent = 'Zones';
const playersButton = document.createElement('button');
playersButton.type = 'button'; playersButton.dataset.action = 'terrain-zones-players'; playersButton.textContent = 'Players';
control.append(ownButton, playersButton);
const toggleStyle = document.createElement('style');
toggleStyle.textContent = `
 #terrain-zone-toggle{position:fixed;z-index:2147480000;display:flex;gap:4px;pointer-events:auto}
 #terrain-zone-toggle[hidden]{display:none}
 #terrain-zone-toggle button{font:700 10px/1 system-ui,sans-serif;letter-spacing:.03em;text-transform:uppercase;padding:4px 6px;border-radius:5px;border:1px solid rgba(255,255,255,.35);background:rgba(17,24,39,.82);color:#fff;cursor:pointer;opacity:.9}
 #terrain-zone-toggle button[aria-pressed="false"]{background:rgba(17,24,39,.55);color:rgba(255,255,255,.55);text-decoration:line-through}
 #terrain-zone-toggle button[disabled]{cursor:not-allowed;opacity:.6}
 #terrain-zone-toggle button[hidden]{display:none}
 #terrain-zone-toggle button:hover:not([disabled]){opacity:1;border-color:#fff}
`;
document.head.append(toggleStyle);
document.body.append(control);

function setVisible(value) {
  visible = !!value;
  try { if (preferenceKey) localStorage.setItem(preferenceKey, String(visible)); } catch {}
  signature = '';
}
ownButton.addEventListener('click', () => setVisible(!visible));
async function setHiddenFromPlayers(hidden) {
  const c = context(), field = sceneOf(c)?.environment?.zones;
  if (!c?.isGM || !field?.value || saving) return false;
  const value = JSON.parse(JSON.stringify(field.value));
  if (hidden) value.hiddenFromPlayers = true; else delete value.hiddenFromPlayers;
  saving = true;
  try { await saveShared('zones', value, field.revision, c.state.boardState.activeSceneId); return true; }
  catch (error) { console.error('[terrain zones] could not change the players switch', error); return false; }
  finally { saving = false; signature = ''; }
}
playersButton.addEventListener('click', () => setHiddenFromPlayers(!current().hiddenFromPlayers));

const board = document.querySelector('#vtt-board-canvas'), mapSurface = document.querySelector('#vtt-map-surface');
/** True when this element is ordinary board (map, tokens, the canvas itself), not a panel over it. */
function isBoard(element) {
  return !element || element === document.documentElement || element === document.body || element === board
    || !!mapSurface?.contains(element) || element.contains(board) || control.contains(element);
}
/** The outermost box of a panel sitting over a point: its highest ancestor that does not also hold the board. */
function panelRoot(element) {
  let root = element;
  while (root.parentElement && root.parentElement !== document.body && !root.parentElement.contains(board)) root = root.parentElement;
  return root;
}
/** Keeps the control at the bottom left of the board, stepping aside from any panel that opens over that corner. */
function placeControl() {
  if (control.hidden || !board) return;
  const width = control.offsetWidth || 60, height = control.offsetHeight || 22;
  const place = placeCornerControl({
    frame: board.getBoundingClientRect(),
    viewport: {width: window.innerWidth, height: window.innerHeight},
    size: {width, height},
    blockerAt: (left, top) => {
      for (const [x, y] of [[left + 2, top + 2], [left + width - 2, top + 2], [left + 2, top + height - 2], [left + width - 2, top + height - 2], [left + width / 2, top + height / 2]]) {
        const hit = document.elementsFromPoint(x, y).find((element) => !control.contains(element));
        if (hit && !isBoard(hit)) return panelRoot(hit).getBoundingClientRect();
      }
      return null;
    },
  });
  if (!place) { control.style.visibility = 'hidden'; return; }
  control.style.visibility = '';
  const nextLeft = place.left + 'px', nextBottom = place.bottom + 'px';
  if (control.style.left !== nextLeft) control.style.left = nextLeft;
  if (control.style.bottom !== nextBottom) control.style.bottom = nextBottom;
}
function syncControl(c, state) {
  const hasZones = state.zones.length > 0;
  control.hidden = !hasZones;
  if (!hasZones) return;
  const lockedOff = !c.isGM && state.hiddenFromPlayers;
  ownButton.setAttribute('aria-pressed', String(visible && !lockedOff));
  ownButton.disabled = lockedOff;
  ownButton.title = lockedOff ? 'The GM has hidden terrain zones' : visible ? 'Hide terrain zones on your screen' : 'Show terrain zones on your screen';
  playersButton.hidden = !c.isGM;
  playersButton.setAttribute('aria-pressed', String(!state.hiddenFromPlayers));
  playersButton.title = state.hiddenFromPlayers ? 'Players cannot see terrain zones. Click to show them.' : 'Players can see terrain zones. Click to hide them from players.';
  placeControl();
}

function draw() {
  const c = context();
  if (!c?.view?.mapLoaded) { control.hidden = true; if (svg.childNodes.length) { svg.replaceChildren(); signature = ''; } return; }
  if (!svg.isConnected && transform) transform.insertBefore(svg, document.querySelector('#terrain-cost-markers') || document.querySelector('#vtt-grid-overlay'));
  const pref = 'terrain-zones-visible:' + String(c.userId || 'viewer');
  if (pref !== preferenceKey) { preferenceKey = pref; try { const saved = localStorage.getItem(pref); visible = saved === null ? true : saved === 'true'; } catch { visible = true; } }
  const state = current(c), {zones, key} = state, active = terrain(), v = c.view, g = v.gridSize || 64, ox = v.gridOffsets?.left || 0, oy = v.gridOffsets?.top || 0;
  syncControl(c, state);
  // Each person chooses for their own screen; the GM can also switch zones off for every player.
  const show = zones.length > 0 && visible && (c.isGM || !state.hiddenFromPlayers);
  const next = JSON.stringify([key, show, state.hiddenFromPlayers, c.levelId, g, ox, oy, v.mapPixelSize, !!active, active?.revision ?? 0, active?.key ?? '']);
  if (next === signature) return;
  signature = next; builds++;
  svg.setAttribute('width', v.mapPixelSize?.width || 0); svg.setAttribute('height', v.mapPixelSize?.height || 0);
  svg.style.display = show ? '' : 'none';
  if (!show) { svg.replaceChildren(); return; }
  const floors = elevations(c), nodes = [];
  for (const zone of zones) {
    // Ground zones show from every floor; an upper-floor zone shows while that floor is viewed.
    if (zone.levelId !== BASE_LEVEL_ID && zone.levelId !== c.levelId) continue;
    const surface = zoneSurface(zone, floors.get(zone.levelId) ?? 0);
    const corner = (column, row) => { const x = ox + column * g, y = oy + row * g; return active ? active.project(x, y, zone.levelId === BASE_LEVEL_ID && zone.surfaceHeight === null ? active.heightAt(x, y) : surface) : {x, y}; };
    const shape = zoneGeometry(zone, corner), color = zoneColor(zone.tag);
    const group = document.createElementNS(NS, 'g');
    group.dataset.zoneId = zone.id; group.dataset.zoneTag = zone.tag; group.dataset.zoneCost = String(zone.cost); if (zone.gmOnly) group.dataset.zoneGmOnly = 'true';
    const fill = document.createElementNS(NS, 'path');
    fill.setAttribute('d', shape.fill); fill.setAttribute('fill', color); fill.setAttribute('fill-opacity', zone.cost > 1 ? '0.2' : '0.1'); fill.setAttribute('stroke', 'none');
    const outline = document.createElementNS(NS, 'path');
    outline.setAttribute('d', shape.outline); outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', color); outline.setAttribute('stroke-opacity', '0.85');
    outline.setAttribute('stroke-width', String(Math.max(1.5, g * 0.035))); outline.setAttribute('stroke-linecap', 'round');
    if (zone.gmOnly) outline.setAttribute('stroke-dasharray', `${g * 0.12} ${g * 0.1}`);
    // Dark casing keeps the outline readable on art of the same colour (blood on a blood canal).
    const casing = outline.cloneNode(false);
    casing.setAttribute('stroke', '#000'); casing.setAttribute('stroke-opacity', '0.55'); casing.setAttribute('stroke-width', String(Math.max(3, g * 0.07)));
    const a = corner(shape.labelSquare[0], shape.labelSquare[1]), b = corner(shape.labelSquare[0] + 1, shape.labelSquare[1] + 1);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String((a.x + b.x) / 2)); label.setAttribute('y', String((a.y + b.y) / 2)); label.setAttribute('text-anchor', 'middle'); label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', String(g * 0.2)); label.setAttribute('font-weight', '700'); label.setAttribute('fill', '#fff'); label.setAttribute('stroke', '#000'); label.setAttribute('stroke-width', String(g * 0.045)); label.setAttribute('paint-order', 'stroke');
    const name = zone.label || zone.tag;
    label.textContent = (name.length > 16 ? name.slice(0, 15) + '…' : name) + (zone.cost > 1 ? ' ×' + zone.cost : '') + (zone.gmOnly ? ' (GM)' : '');
    group.append(fill, casing, outline, label);
    nodes.push(group);
  }
  svg.replaceChildren(...nodes);
}

window.terrainZones = {
  get zones() { return current().zones; },
  zonesForPlacement,
  tagsForPlacement: (target) => zoneTags(zonesForPlacement(target)),
  costAt: (column, row, levelId = BASE_LEVEL_ID) => squareCostMultiplier(current().index, column, row, levelId),
  stepMultiplier,
  routeCost,
  paysForClimb,
  cellInfoFor,
  standingHeight: (target) => { const placement = placementOf(target); return placement ? standingHeight(placement) : null; },
  get visible() { return visible; },
  setVisible,
  get hiddenFromPlayers() { return current().hiddenFromPlayers; },
  setHiddenFromPlayers,
  get builds() { return builds; },
};
setInterval(() => { try { draw(); } catch (error) { console.error('[terrain zones]', error); } }, 200);
window.addEventListener('resize', () => { try { placeControl(); } catch {} });
