// Draws tagged terrain zones on the board and answers "which zones is this
// token in". Reads the canonical scene environment; display choice is local.
import {sceneZones, buildZoneIndex, zonesForFootprint, zoneTags, squareCostMultiplier, zoneGeometry, zoneColor, zoneSurface, BASE_LEVEL_ID} from './terrain-zones.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';

const NS = 'http://www.w3.org/2000/svg';
const transform = document.querySelector('#vtt-map-transform');
const svg = document.createElementNS(NS, 'svg');
svg.id = 'terrain-zone-overlay';
svg.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2';
svg.setAttribute('aria-hidden', 'true');
let button = null, visible = true, preferenceKey = '', signature = '', builds = 0;
let cache = {key: '', zones: [], index: new Map()};

function context() { return window.terrainContext?.() || null; }
function terrain() { return window.terrainPrototype?.active ? window.terrainPrototype : null; }
function sceneOf(c) { return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId] || null; }

function current(c = context()) {
  const sceneId = c?.state.boardState.activeSceneId || '', field = sceneOf(c)?.environment?.zones || null;
  const key = sceneId + ':' + (field?.revision ?? 'none') + ':' + (field?.value?.zones?.length ?? 0);
  if (key !== cache.key) { const zones = sceneZones(c?.state.boardState.sceneState, sceneId); cache = {key, zones, index: buildZoneIndex(zones)}; }
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
  return zonesForFootprint(current(c).index, placement, standingHeight(placement, c), (levelId) => floors.get(levelId) ?? 0);
}

function setVisible(value) {
  visible = !!value;
  try { if (preferenceKey) localStorage.setItem(preferenceKey, String(visible)); } catch {}
  signature = '';
}
function ensureButton(c, hasZones) {
  if (!c?.isGM) { button?.remove(); button = null; return; }
  if (!button) {
    const anchor = document.querySelector('[data-action="terrain-height"]') || document.querySelector('[data-action="measure-distance"]');
    if (!anchor) return;
    button = document.createElement('button');
    button.type = 'button'; button.className = 'btn'; button.textContent = 'Zones'; button.dataset.action = 'terrain-zones';
    button.title = 'Show or hide terrain zones (blood, water, difficult terrain) on your screen';
    button.addEventListener('click', () => setVisible(!visible));
    anchor.after(button);
  }
  button.hidden = !hasZones;
  button.setAttribute('aria-pressed', String(visible));
}

function draw() {
  const c = context();
  if (!c?.view?.mapLoaded) { if (svg.childNodes.length) { svg.replaceChildren(); signature = ''; } return; }
  if (!svg.isConnected && transform) transform.insertBefore(svg, document.querySelector('#terrain-cost-markers') || document.querySelector('#vtt-grid-overlay'));
  const pref = 'terrain-zones-visible:' + String(c.userId || 'viewer');
  if (pref !== preferenceKey) { preferenceKey = pref; try { const saved = localStorage.getItem(pref); visible = saved === null ? true : saved === 'true'; } catch { visible = true; } }
  const {zones, key} = current(c), active = terrain(), v = c.view, g = v.gridSize || 64, ox = v.gridOffsets?.left || 0, oy = v.gridOffsets?.top || 0;
  ensureButton(c, zones.length > 0);
  // Players always see the zones they were sent; the GM may hide them locally.
  const show = zones.length > 0 && (visible || !c.isGM);
  const next = JSON.stringify([key, show, c.levelId, g, ox, oy, v.mapPixelSize, !!active, active?.revision ?? 0, active?.key ?? '']);
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
  standingHeight: (target) => { const placement = placementOf(target); return placement ? standingHeight(placement) : null; },
  get visible() { return visible; },
  setVisible,
  get builds() { return builds; },
};
setInterval(() => { try { draw(); } catch (error) { console.error('[terrain zones]', error); } }, 200);
