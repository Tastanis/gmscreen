// Draws tagged terrain zones on the board and answers "which zones is this
// token in". Reads the canonical scene environment; display choice is local.
import {sceneZones, abilityTerrainZones, buildZoneIndex, zonesForFootprint, zoneTags, squareCostMultiplier, summarizeRoute, zonesHiddenFromPlayers, BASE_LEVEL_ID, placeCornerControl, hasMovementType, standsOnPlate, movementWaiver, zoneCostFor, movementText, zonesAtSquare} from './terrain-zones.mjs';
import {routeSteps, groundSquare, stepCost, climbSurcharge, stepRise, isClimb} from './terrain-math.mjs';
import {saveShared} from './environment-sync.mjs';
import {MOVEMENT_RULES} from './movement-rules.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';
import {fallSquares} from './ruler-label-layout.mjs';
import {resolveForcedDrag} from './forced-drag.js';

let visible = true, preferenceKey = '', saving = false;
let cache = {key: '', zones: [], index: new Map(), hiddenFromPlayers: false};

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function sceneOf(c) { return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId] || null; }

function current(c = context()) {
  const sceneId = c?.state.boardState.activeSceneId || '', field = sceneOf(c)?.environment?.zones || null;
  // Ability zones that are difficult terrain count for movement like painted terrain (they draw themselves).
  const fromAbilities = abilityTerrainZones(c?.state.boardState.placements?.[sceneId]);
  const key = sceneId + ':' + (field?.revision ?? 'none') + ':' + (field?.value?.zones?.length ?? 0) + ':' + fromAbilities.map((zone) => zone.id + zone.cost + zone.squares.length).join(',');
  if (key !== cache.key) { const zones = [...sceneZones(c?.state.boardState.sceneState, sceneId), ...fromAbilities]; cache = {key, zones, index: buildZoneIndex(zones), hiddenFromPlayers: zonesHiddenFromPlayers(field)}; }
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
/** The zones a token is in. With {adjacent: true}: the zones it is in or next to. */
function zonesForPlacement(target, {adjacent = false} = {}) {
  const c = context(), placement = placementOf(target, c);
  if (!placement) return [];
  const floors = elevations(c);
  const feet = standingHeight(placement, c);
  return zonesForFootprint(current(c).index, placement, feet, (levelId) => floors.get(levelId) ?? 0, {onPlate: onPlate(placement, feet, c), reach: adjacent ? 1 : 0});
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
  // An enemy's square costs one more, like difficult terrain, and does not stack with it (Brandon, November 8, 2026).
  let enemy = 1;
  try { const squares = window.vttEnemySquares?.(actor); if (squares?.size) for (let dx = 0; dx < Math.max(1, Math.round(actor?.width || 1)) && enemy === 1; dx++) for (let dy = 0; dy < Math.max(1, Math.round(actor?.height || 1)); dy++) if (squares.has(`${Math.floor(column) + dx},${Math.floor(row) + dy}`)) { enemy = 1 + MOVEMENT_RULES.cost.enemy; break; } } catch (error) { enemy = 1; }
  // A prone creature crawls: one more for every square crawled (book, chapters 5 and 10), on top of what the square
  // itself costs (Brandon, November 10, 2026: follow the book; crawling into difficult terrain costs 3).
  let crawl = 0;
  try { if (!['fly', 'hover'].includes(actor?.movementMode) && window.vttIsProne?.(actor)) crawl = 1; } catch (error) { /* no board */ }
  if (!index.size) return enemy + crawl;
  const floors = elevations(c), levelId = actor?.levelId || c?.levelId || BASE_LEVEL_ID;
  const mover = {column, row, width: actor?.width || 1, height: actor?.height || 1, levelId, movementMode: actor?.movementMode, flightHeight: actor?.flightHeight};
  const airborne = ['fly', 'hover'].includes(mover.movementMode);
  const feet = airborne ? standingHeight({...(actor || {}), ...mover}, c) : Number.isFinite(rawHeight) ? rawHeight : floors.get(levelId) ?? 0;
  let cost = 1;
  // A swimmer, or a creature that walks on the liquid, is in the zone but pays nothing extra for it.
  const waiver = movementWaiver(actor);
  for (const zone of zonesForFootprint(index, mover, feet, (id) => floors.get(id) ?? 0, {onPlate: !airborne && onPlate(mover, feet, c)})) cost = Math.max(cost, zoneCostFor(zone, waiver));
  return Math.max(cost, enemy) + crawl;
}
function moverFor(c) {
  const id = c?.selectedIds?.[0] || c?.followId || null;
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
  // A creature with a climb speed climbs for the squares it climbs, with nothing more (the rules table).
  const climbFree = ignoreClimb && (kind === 'walk' || kind === 'shift') && !['fly', 'hover'].includes(mover?.movementMode) && hasMovementType(mover, 'climb');
  const carry = {}; // the previewed walker, handed from one leg to the next
  const stepsBetween = (a, b) => active
    ? active.route(a, b, {ignoreZones, ignoreClimb, climbFree, actor: mover || undefined, carry})
    : routeSteps(a, b, () => 0, ignoreZones ? null : (column, row) => stepMultiplier(mover, column, row, undefined));
  const summary = summarizeRoute(points, stepsBetween);
  const start = points?.[0];
  summary.startsInDifficult = !ignoreZones && !!start && stepMultiplier(mover, start.column, start.row, active ? active.heightAt((c.view.gridOffsets?.left || 0) + (start.column + .5) * (c.view.gridSize || 64), (c.view.gridOffsets?.top || 0) + (start.row + .5) * (c.view.gridSize || 64)) : undefined) > 1;
  // The rules do not allow shifting into or within difficult terrain.
  summary.shiftInDifficult = kind === 'shift' && (summary.difficult.length > 0 || summary.startsInDifficult);
  return summary;
}
// True when the last leg of a forced move runs into a wall, a rail or rising ground: the push stops there, so the ruler
// says so and does not promise the fall beyond it (Brandon, October 16, 2026: the ruler said "Fall 3" for a push into
// a parapet that the server stopped). Paired with WallMovement / ForcedMovement on the server.
function forcedStops(points, {actor = undefined} = {}) {
  const c = context(), walls = window.wallPrototype;
  const mover = actor === undefined ? moverFor(c) : actor;
  if (!mover || !walls?.forcedBlockedMove || !(points?.length > 1) || ['fly', 'hover'].includes(mover.movementMode)) return false;
  const at = (p) => ({...mover, column: p.column, row: p.row});
  const start = points[points.length - 2], end = points[points.length - 1];
  const from = start.column === mover.column && start.row === mover.row ? mover : at(start);
  try { return Boolean(walls.forcedBlockedMove(from, at(end))); } catch { return false; }
}
/**
 * What a hand push to the end of `points` will do, worked out as the drop itself is (resolveForcedDrag, a straight
 * push from where the creature stands): the squares it really moves, and the damage if it is stopped by a wall
 * (2 + the squares left over) or a creature (the squares left over). Null when it cannot be worked out. The ruler
 * shows it (Brandon, November 25, 2026: a creature against a wall pushed 1 moves 0 and takes 3; the ruler said
 * "Forced movement 1 · Stops at a wall" and no more).
 */
function forcedOutcome(points, {actor = undefined} = {}) {
  const c = context(), walls = window.wallPrototype;
  const mover = actor === undefined ? moverFor(c) : actor;
  if (!mover || !(points?.length > 1)) return null;
  const end = points[points.length - 1];
  const list = c?.state.boardState.placements?.[c.state.boardState.activeSceneId];
  const others = Array.isArray(list) ? list : Object.values(list || {});
  try {
    const drag = resolveForcedDrag(mover, {column: end.column, row: end.row}, others, {
      wallBlocked: (from, to) => walls?.forcedBlockedMove?.(from, to) || false,
      height: (token) => window.terrainPrototype?.groundFor(token) ?? 0,
      moverHeight: (from, at) => walls?.moverHeight?.(from, at, 'forced') ?? window.terrainPrototype?.groundFor(at) ?? 0,
    });
    const moved = Math.round(Math.max(Math.abs(drag.destination.column - mover.column), Math.abs(drag.destination.row - mover.row)));
    return {moved, damage: Number(drag.damage) || 0, wall: Boolean(drag.wall), collided: (drag.collidedIds || []).length};
  } catch { return null; }
}
/**
 * How far a forced move drops at its end, in whole squares: from the height the creature
 * travels at (travel-height.mjs) down to where it lands, a plate under it or the ground. The
 * ruler shows it apart from the squares moved. Fliers do not fall. On a bent route it is the
 * last leg that is read.
 */
function forcedFall(points, {actor = undefined} = {}) {
  const c = context(), active = terrain(), walls = window.wallPrototype;
  const mover = actor === undefined ? moverFor(c) : actor;
  if (!active || !mover || !walls?.moverHeight || !(points?.length > 1) || ['fly', 'hover'].includes(mover.movementMode)) return 0;
  const at = (p) => ({...mover, column: p.column, row: p.row});
  const start = points[points.length - 2], end = points[points.length - 1];
  // The mover itself where the leg starts from its own square: the board keeps one path per mover.
  const from = start.column === mover.column && start.row === mover.row ? mover : at(start);
  const travelling = walls.moverHeight(from, at(end), 'forced');
  const standing = {...at(end), movementMode: 'ground'}, ground = active.groundFor(standing);
  const caught = active.landingHeight ? active.landingHeight(standing, travelling) : null;
  return fallSquares(travelling, caught === null ? ground : Math.max(ground, caught));
}
/**
 * Per-square lookup for the reach outline: the rounded ground height and the
 * movement multiplier a mover meets on each square. Null when the scene has
 * neither height nor zones, so the plain square outline is already exact.
 */
function cellInfoFor(target) {
  const c = context(), active = terrain(), state = current(c), actor = placementOf(target, c), walls = window.wallPrototype;
  if (!active && !state.zones.length && typeof walls?.question !== 'function') return null;
  const airborne = ['fly', 'hover'].includes(actor?.movementMode);
  return {
    key: [state.key, active?.revision ?? 0, active?.key ?? '', actor?.levelId || '', actor?.width || 1, airborne ? actor.flightHeight ?? 'air' : 'ground', paysForClimb(actor) ? 'climbs' : 'climber', movementText(actor), walls?.revision ?? 0, walls?.key ?? ''].join('|'),
    // The walls, as the walk will be asked (wall-properties wallQuestion): a wall stops the outline, a shut door does
    // not (it is opened), a climbable face is climbed at a climb's price (Brandon, November 8, 2026).
    wall: typeof walls?.question === 'function' && !airborne ? (from, column, row) => {
      const q = walls.question({...(actor || {}), column: from.column, row: from.row, ...(from.ghost || {}), column: from.column, row: from.row}, {column, row, path: []});
      // A closed secret door is a wall to the outline, on the Director's screen too (a player's copy has it as plain wall).
      if (q?.kind === 'wall' || (q?.kind === 'door' && q.edge?.secret === true && q.edge?.open !== true)) return null;
      if (q?.kind === 'climb') { const r = Math.round(q.rise || 0); return Math.max(1, r) - 1 + (paysForClimb(actor) ? climbSurcharge(r) : 0); }
      return 0;
    } : null,
    at(column, row) {
      const raw = active ? active.route({column, row}, {column, row}, {ignoreZones: true}).points[0].rawHeight : undefined;
      return {column, row, height: active ? groundSquare(raw) : 0, rawHeight: active ? raw : 0, multiplier: stepMultiplier(actor, column, row, raw)};
    },
    // Near a deck or bridge the outline walks square by square as the move will, so a square
    // reached along a bridge and the same square waded under it are told apart (`state`).
    // Away from any plate it uses the plain per-square lookup above.
    enter: active?.walkerNear && !airborne ? (() => {
      let walker, plain = null;
      const costs = new Map();
      const multiplierAt = (column, row, raw) => { const key = `${column},${row},${Math.round(raw * 100)}`; let m = costs.get(key); if (m === undefined) { m = stepMultiplier(actor, column, row, raw); costs.set(key, m); } return m; };
      return (from, column, row) => {
        if (walker === undefined) walker = active.walkerNear(actor, column, row);
        if (!walker) { plain ||= new Map(); const key = `${column},${row}`; let cell = plain.get(key); if (!cell) { const raw = active.route({column, row}, {column, row}, {ignoreZones: true, actor}).points[0].rawHeight; cell = {height: groundSquare(raw), rawHeight: raw, multiplier: stepMultiplier(actor, column, row, raw)}; plain.set(key, cell); } return cell; }
        let ghost, raw;
        if (!from?.ghost) { ghost = {...actor, column, row}; raw = walker.plainHeight(column, row, actor); }
        else ({ghost, height: raw} = walker.step(from.ghost, column, row));
        return {height: groundSquare(raw), rawHeight: raw, multiplier: multiplierAt(column, row, raw), state: ghost._supportSurfaceId || '', ghost};
      };
    })() : null,
    // The reach outline charges each step exactly as the ruler does, climbs included.
    stepCost: (from, to) => {
      // The same measure of a step's height as the ruler: the real change, to the nearest square.
      const rise = Number.isFinite(from.rawHeight) && Number.isFinite(to.rawHeight) ? stepRise(from.rawHeight, to.rawHeight) : to.height - from.height;
      const raw = Number.isFinite(from.rawHeight) && Number.isFinite(to.rawHeight) ? to.rawHeight - from.rawHeight : rise, free = !paysForClimb(actor);
      const climb = !!active && rise > 0 && climbSurcharge(rise) > 0 && !['fly', 'hover'].includes(actor?.movementMode) && isClimb(raw, 1, raw < MOVEMENT_RULES.climbGrade - 1e-6 && active.climbFace(actor, from, to));
      return stepCost({horizontal: 1, rise, multiplier: to.multiplier, climb, free});
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
  showSwitches();
}
ownButton.addEventListener('click', () => setVisible(!visible));
// The players switch shows its new state at once, while the save is on its way; a save that fails puts it back.
// A click during a save is kept and sent after it, so two quick clicks end where the last one left it.
let wantedHidden = null, wantedAt = 0;
async function setHiddenFromPlayers(hidden) {
  const c = context(), field = sceneOf(c)?.environment?.zones;
  if (!c?.isGM || !field?.value) return false;
  wantedHidden = !!hidden; wantedAt = Date.now(); showSwitches();
  if (saving) return true;
  saving = true;
  try {
    let sentFrom = null;
    while (true) {
      // The board may not have the last save back yet: wait for it (up to 3 s) before deciding what to send next.
      for (let i = 0; i < 30 && sentFrom !== null && sceneOf(context())?.environment?.zones?.revision === sentFrom; i++) await new Promise((resolve) => setTimeout(resolve, 100));
      const latest = sceneOf(context())?.environment?.zones, want = wantedHidden;
      if (!latest?.value || zonesHiddenFromPlayers(latest) === want || latest.revision === sentFrom) break;
      sentFrom = latest.revision;
      const value = JSON.parse(JSON.stringify(latest.value));
      delete value.hiddenFromPlayers;
      if (want) delete value.shownToPlayers; else value.shownToPlayers = true;
      await saveShared('zones', value, latest.revision, c.state.boardState.activeSceneId);
      if (wantedHidden === want) break;
    }
    return true;
  } catch (error) { console.error('[terrain zones] could not change the players switch', error); wantedHidden = null; return false; }
  finally { saving = false; showSwitches(); }
}
playersButton.addEventListener('click', () => setHiddenFromPlayers(!playersHidden()));
// The players switch as last asked for, else as saved. Kept until the saved switch catches up, so it never flickers back for a moment after the save.
function playersHidden(state = current()) { if (!saving && (wantedHidden === state.hiddenFromPlayers || Date.now() - wantedAt > 5000)) wantedHidden = null; return wantedHidden ?? state.hiddenFromPlayers; }
function showSwitches() { const c = context(); if (c) { try { syncControl(c, current(c)); } catch {} } }

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
  const lockedOff = !c.isGM && state.hiddenFromPlayers, hidden = c.isGM ? playersHidden(state) : state.hiddenFromPlayers;
  ownButton.setAttribute('aria-pressed', String(visible && !lockedOff));
  ownButton.disabled = lockedOff;
  ownButton.title = lockedOff ? 'The GM has hidden terrain zones' : visible ? 'Hide terrain zones on your screen' : 'Show terrain zones on your screen';
  playersButton.hidden = !c.isGM;
  playersButton.setAttribute('aria-pressed', String(!hidden));
  playersButton.title = hidden ? 'Players cannot see terrain zones. Click to show them.' : 'Players can see terrain zones. Click to hide them from players.';
  placeControl();
}

function draw() {
  const c = context();
  if (!c?.view?.mapLoaded) { control.hidden = true; return; }
  // Off by default for the Director (Brandon, November 17, 2026); a player follows the Director's switch unless they
  // turn zones off for themselves. A new key, so the old saved "on" is not read.
  const pref = 'terrain-zones-shown:' + String(c.userId || 'viewer'), byDefault = !c.isGM;
  if (pref !== preferenceKey) { preferenceKey = pref; try { const saved = localStorage.getItem(pref); visible = saved === null ? byDefault : saved === 'true'; } catch { visible = byDefault; } }
  syncControl(c, current(c));
}

window.terrainZones = {
  get zones() { return current().zones; },
  zonesForPlacement,
  tagsForPlacement: (target, options) => zoneTags(zonesForPlacement(target, options)),
  costAt: (column, row, levelId = BASE_LEVEL_ID) => squareCostMultiplier(current().index, column, row, levelId),
  // A square the map labels no-climb (bumpy ground that is always a plain walk; MapLabels::KINDS).
  noClimb: (column, row, levelId = BASE_LEVEL_ID) => zonesAtSquare(current().index, column, row, levelId).some((zone) => zone.kind === 'no-climb'),
  stepMultiplier,
  routeCost,
  forcedFall,
  forcedStops,
  forcedOutcome,
  paysForClimb,
  cellInfoFor,
  standingHeight: (target) => { const placement = placementOf(target); return placement ? standingHeight(placement) : null; },
  get visible() { return visible; },
  setVisible,
  get hiddenFromPlayers() { return current().hiddenFromPlayers; },
  setHiddenFromPlayers,
};
setInterval(() => { try { draw(); } catch (error) { console.error('[terrain zones]', error); } }, 200);
window.addEventListener('resize', () => { try { placeControl(); } catch {} });
