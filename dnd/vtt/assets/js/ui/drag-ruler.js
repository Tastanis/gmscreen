// Terrain sandbox ruler integration
import { placeLegLabels, rulerWording, forcedOutcomeWording, WORDING_SEPARATOR } from './ruler-label-layout.mjs';
import { claimActiveTool, publishActiveTool } from './active-tool.js';
import { forcedLabel } from './forced-line.mjs';
import { teleportDistance } from './teleport-choice.js';
import { heightNote, straightWords } from './measure-straight.mjs';
const MAX_MEASUREMENT_POINTS = 21; // 20 segments

let sharedState = null;
let teleportSpaceHeld = false;
// Hold M to measure: held now, and whether holding it turned the tool on (it goes off again on release).
let mHeld = false;
let mTurnedOn = false;

export function dragMovementKind(event) {
  return teleportSpaceHeld ? 'teleport' : event.ctrlKey ? 'forced' : event.shiftKey ? 'shift' : 'walk';
}

export function mountDragRuler() {
  const ruler = document.getElementById('vtt-distance-ruler');
  const rulerValue = ruler?.querySelector('.vtt-board__ruler-value');
  const measureButton = document.querySelector('[data-action="measure-distance"]');
  const mapSurface = document.getElementById('vtt-map-surface');
  const mapTransform = document.getElementById('vtt-map-transform');

  if (!ruler || !rulerValue || !measureButton || !mapSurface || !mapTransform) {
    return;
  }

  const state = {
    active: false,
    measuring: false,
    pointerId: null,
    points: [],
    hoverPoint: null,
    ruler,
    rulerValue,
    rulerDetail: ensureRulerDetail(ruler),
    measureButton,
    mapSurface,
    mapTransform,
    mode: null,
    movementLabel: 'Move',
    // Click, then click: let go on the square pressed and the line follows the pointer until the next click.
    following: false,
    pressSquare: null,
  };

  sharedState = state;
  // Match release priority, and update even while the pointer is stationary.
  const updateMovementLabel = event => {
    if (event.code === 'Space' || event.key === ' ') {
      if (event.type === 'keyup') teleportSpaceHeld = false;
      else if (event.type === 'keydown') {
        if (event.target?.closest?.('input,textarea,select,[contenteditable],button,[role="button"],dialog')) return;
        if (!mapSurface.getClientRects().length) return;
        teleportSpaceHeld = true;
        event.preventDefault();
      }
    }
    state.movementLabel = {teleport:'Teleport',forced:'Forced movement',shift:'Shift',walk:'Move'}[dragMovementKind(event)];
    if (state.mode === 'external' && state.measuring) updateOverlay(state);
    // The Measure tool's own ruler on the 3D board: Space held is the walking route, let go the straight line.
    else if (state.mode !== 'external' && state.points.length && window.vtt3dActive && state.walkShown !== teleportSpaceHeld) updateOverlay(state);
  };
  document.addEventListener('keydown', updateMovementLabel, true);
  document.addEventListener('keyup', updateMovementLabel, true);
  mapSurface.addEventListener('pointerdown', updateMovementLabel, true);
  mapSurface.addEventListener('pointermove', updateMovementLabel, true);
  window.addEventListener('blur', () => { teleportSpaceHeld = false; state.movementLabel = 'Move'; });


  state.measureButton.setAttribute('aria-pressed', 'false');

  if (typeof MutationObserver === 'function') {
    const visibilityObserver = new MutationObserver(() => {
      if (mapTransform.hasAttribute('hidden')) {
        clearMeasurement(state);
      }
    });
    visibilityObserver.observe(mapTransform, { attributes: true, attributeFilter: ['hidden'] });
  }

  measureButton.addEventListener('click', () => {
    toggleMeasureMode(state, !state.active);
  });

  mapSurface.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.active || event.button !== 0 || state.mode === 'external') {
        return;
      }

      if (isPointerOverToken(event)) {
        return;
      }

      const snapPoint = getSnappedPoint(state, event);
      if (!snapPoint) {
        return;
      }
      pressMeasure(state, event, snapPoint);
    },
    true
  );

  // 3D board: a token is a measuring point, measured from its own space and height (Brandon, October 2026: "how high
  // our players are compared to another player", "from a monster to another monster"). The board's capture runs
  // before the 3D board's token handler, which would take the press as a grab.
  const boardCanvas = document.getElementById('vtt-board-canvas') ?? mapSurface;
  boardCanvas.addEventListener('pointerdown', (event) => {
    if (!state.active || event.button !== 0 || state.mode === 'external' || !window.vtt3d?.active) return;
    const snapPoint = tokenUnderPointer(state, event);
    if (!snapPoint) return;
    event.stopImmediatePropagation();
    pressMeasure(state, event, snapPoint);
  }, true);

  // While a measurement is being made: dragged with the button held, or following the pointer after a click. Over the
  // whole board, the 3D board's tokens included (they sit beside the map surface, not in it).
  boardCanvas.addEventListener('pointermove', (event) => {
    if (!state.measuring || state.mode !== 'pointer' || event.pointerId !== state.pointerId) {
      return;
    }

    const snapPoint = getSnappedPoint(state, event);
    if (!snapPoint) {
      return;
    }

    if (!state.following) {
      event.preventDefault();
      event.stopPropagation();
    }
    updateHoverPoint(state, snapPoint);
  });

  mapSurface.addEventListener('pointerup', (event) => {
    if (!state.measuring || state.mode !== 'pointer' || event.pointerId !== state.pointerId || state.following) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const snapPoint = getSnappedPoint(state, event);
    mapSurface.releasePointerCapture?.(event.pointerId);
    // Let go on the square it was pressed on: a click. The line follows the pointer until the next click ends it.
    if (snapPoint && state.pressSquare && pointsShareCell(snapPoint, state.pressSquare)) {
      state.following = true;
      return;
    }
    if (snapPoint) {
      commitHoverPoint(state, snapPoint);
    }
    endMeasurement(state);
  });

  // The height under the pointer, in a note beside it, while the Measure tool is on (3D board).
  const note = document.createElement('div');
  note.className = 'vtt-measure-height-note';
  note.setAttribute('aria-hidden', 'true');
  note.hidden = true;
  document.body.append(note);
  state.heightNote = note;
  let notePending = null;
  document.addEventListener('pointermove', (event) => {
    if (!state.active || !window.vtt3d?.active || state.mode === 'external') {
      if (!note.hidden) note.hidden = true;
      return;
    }
    const first = !notePending;
    notePending = { clientX: event.clientX, clientY: event.clientY, target: event.target };
    if (first) requestAnimationFrame(() => { const at = notePending; notePending = null; showHeightNote(state, at); });
  }, { passive: true });

  mapSurface.addEventListener('pointercancel', (event) => {
    if (state.measuring && state.mode === 'pointer' && event.pointerId === state.pointerId) {
      event.stopPropagation();
      endMeasurement(state);
      mapSurface.releasePointerCapture?.(event.pointerId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.active) {
      // A measurement following the pointer is dropped; otherwise the tool is put away.
      if (state.measuring && state.mode === 'pointer') clearMeasurement(state);
      else toggleMeasureMode(state, false);
      return;
    }
    // Hold M to measure, let go to stop (Brandon, November 4, 2026; it was press on, press off). Not while typing,
    // nor with Ctrl, Alt or Cmd, nor while a token is being dragged.
    if (event.code === 'KeyM' && mHeld) { event.preventDefault(); return; }
    if (event.code === 'KeyM' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
      && !event.target?.closest?.('input,textarea,select,[contenteditable],dialog,[role="dialog"]')
      && mapSurface.getClientRects().length && state.mode !== 'external') {
      event.preventDefault();
      mHeld = true;
      mTurnedOn = !state.active;
      toggleMeasureMode(state, true);
      return;
    }

    // Shift drops a corner on the Measure tool's own ruler, where it means nothing else. While a
    // token is held Shift is the shift move, and a corner there is a quick right click
    // (addExternalMeasurementNode, right-press.mjs).
    if (event.key === 'Shift' && !event.repeat && state.mode === 'pointer') {
      addMeasurementNode(state);
    }
  });

  // M let go (anywhere, even over a text box), or the window left while it was held: the measuring stops. The tool
  // goes away again unless the Measure button had it on before.
  const releaseM = () => {
    if (!mHeld) return;
    mHeld = false;
    if (mTurnedOn) toggleMeasureMode(state, false);
    else clearMeasurement(state);
  };
  document.addEventListener('keyup', (event) => { if (event.code === 'KeyM') releaseM(); }, true);
  window.addEventListener('blur', releaseM);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      teleportSpaceHeld = false;
      releaseM();
      clearMeasurement(state);
    }
  });

}

function toggleMeasureMode(state, nextActive) {
  if (state.active === nextActive) {
    return;
  }

  if (nextActive) claimActiveTool('measure', () => toggleMeasureMode(state, false));
  state.active = nextActive;
  publishActiveTool('measure', state.active ? 'Measure' : null);
  state.measureButton?.classList.toggle('is-active', state.active);
  if (state.measureButton) {
    state.measureButton.setAttribute('aria-pressed', state.active ? 'true' : 'false');
  }

  if (!state.active) {
    clearMeasurement(state);
  }
}

// A press with the Measure tool, on the ground or (3D board) on a token. A press while the line follows the pointer
// ends it there (click, then click); any other starts a measurement, or carries one on from its end square.
function pressMeasure(state, event, snapPoint) {
  event.preventDefault();
  event.stopPropagation();
  if (state.measuring && state.mode === 'pointer' && state.following) {
    commitHoverPoint(state, snapPoint);
    endMeasurement(state);
    return;
  }
  if (canExtendExistingMeasurement(state, snapPoint)) {
    resumeMeasurement(state, event.pointerId, snapPoint);
  } else {
    beginMeasurement(state, event.pointerId, snapPoint);
  }
  state.following = false;
  state.pressSquare = { column: snapPoint.column, row: snapPoint.row };
  try {
    state.mapSurface.setPointerCapture(event.pointerId);
  } catch (error) {
    // Ignore pointer capture errors – measurement will still function without it.
  }
}

/** 3D board: the token under the pointer as a measuring point (its space and the height it stands at), or null. */
function tokenUnderPointer(state, event) {
  if (!window.vtt3d?.active || !Number.isFinite(event?.clientX)) return null;
  const node = document.elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element.matches?.('#vtt-token-layer [data-placement-id]') || element.closest?.('#vtt-token-layer [data-placement-id]'));
  const id = node?.closest?.('[data-placement-id]')?.dataset.placementId;
  const token = id ? window.vtt3dBridge?.measurePoint?.(id) : null;
  if (!token) return null;
  const metrics = getGridMetrics();
  const grid = metrics && metrics.size > 0 ? metrics.size : 64, left = metrics?.offsets.left ?? 0, top = metrics?.offsets.top ?? 0;
  return {
    mapX: left + (token.column + 0.5) * grid,
    mapY: top + (token.row + 0.5) * grid,
    column: token.column,
    row: token.row,
    width: token.width,
    height: token.height,
    surfaceElevation: token.z,
    tokenId: token.id,
    tokenName: token.name,
  };
}

function showHeightNote(state, at) {
  const note = state.heightNote;
  if (!note || !at) return;
  const onBoard = at.target?.closest?.('#vtt-board-canvas') && !at.target.closest('button,input,select,textarea,dialog,[role="dialog"],[role="menu"]');
  let text = '';
  if (onBoard && state.active && window.vtt3d?.active) {
    const node = document.elementsFromPoint(at.clientX, at.clientY).find((element) => element.closest?.('#vtt-token-layer [data-placement-id]'));
    const id = node?.closest('[data-placement-id]')?.dataset.placementId;
    const token = id ? window.vtt3dBridge?.measurePoint?.(id) : null;
    const hit = token ? null : window.vtt3d.clientToMap?.(at.clientX, at.clientY);
    text = heightNote(token ? { token } : hit ? { ground: hit.height } : null);
  }
  if (!text) {
    note.hidden = true;
    return;
  }
  if (note.textContent !== text) note.textContent = text;
  note.style.left = `${at.clientX + 16}px`;
  note.style.top = `${at.clientY + 18}px`;
  note.hidden = false;
}

function beginMeasurement(state, pointerId, startPoint) {
  state.measuring = true;
  state.pointerId = pointerId;
  state.points = [startPoint];
  state.hoverPoint = startPoint;
  state.rawHover = startPoint;
  state.heightOffset = 0;
  state.heightNodeDropped = false;
  state.mode = 'pointer';
  updateOverlay(state);
}

// The Measure tool's end raised above what the pointer is over (Z held, the wheel turned: nudgeMeasureHeight). The
// raise is in whole squares and stays as the pointer moves on, so a line can go up and then across at that height.
function raised(state, point) {
  const offset = Number(state.heightOffset) || 0;
  if (!point || !offset) return point;
  const base = Number.isFinite(point.surfaceElevation) ? point.surfaceElevation : (window.terrainPrototype?.heightAt?.(point.mapX, point.mapY) ?? 0);
  // No longer the surface or the token that was under the pointer: a point in the air over it.
  return { ...point, surfaceElevation: base + offset, tokenId: undefined, tokenName: undefined, width: undefined, height: undefined, raisedBy: offset };
}
// The same square raised by a different amount is another spot (straight up, then across); otherwise a square is one spot.
const sameMeasuredSpot = (a, b) => a.column === b.column && a.row === b.row && (Number(a.raisedBy) || 0) === (Number(b.raisedBy) || 0);

function resumeMeasurement(state, pointerId, snapPoint) {
  state.measuring = true;
  state.pointerId = pointerId;
  state.hoverPoint = snapPoint;
  state.mode = 'pointer';
  updateOverlay(state);
}

function updateHoverPoint(state, hoverPoint) {
  state.rawHover = hoverPoint;
  state.hoverPoint = state.mode === 'pointer' ? raised(state, hoverPoint) : hoverPoint;
  updateOverlay(state);
}

function commitHoverPoint(state, snapPoint) {
  if (state.mode === 'pointer') snapPoint = raised(state, snapPoint);
  if (!state.points.length) {
    state.points = [snapPoint];
  } else {
    const lastPoint = state.points[state.points.length - 1];
    if (!sameMeasuredSpot(lastPoint, snapPoint) && state.points.length < MAX_MEASUREMENT_POINTS) {
      state.points.push(snapPoint);
    }
  }
  state.hoverPoint = snapPoint;
  updateOverlay(state);
}

function endMeasurement(state) {
  state.measuring = false;
  state.following = false;
  state.pressSquare = null;
  state.pointerId = null;
  state.hoverPoint = null;
  if (state.mode === 'pointer') {
    state.mode = null;
  }
  updateOverlay(state);
}

function clearMeasurement(state) {
  state.measurementActor = null;
  state.plannedRoute = null;
  if (state.pointerId !== null) {
    state.mapSurface.releasePointerCapture?.(state.pointerId);
  }
  state.assumed = null;
  state.measuring = false;
  state.following = false;
  state.pressSquare = null;
  state.pointerId = null;
  state.points = [];
  state.hoverPoint = null;
  state.mode = null;
  updateOverlay(state);
}

function addMeasurementNode(state) {
  if (
    !state.measuring ||
    (state.mode !== 'pointer' && state.mode !== 'external')
  ) {
    return;
  }

  const snapshot = state.hoverPoint ?? state.points[state.points.length - 1];
  if (!snapshot) {
    return;
  }

  // The same square at another height is another corner (straight up, then across).
  const duplicate = state.points.find((point) => sameMeasuredSpot(point, snapshot));
  if (!duplicate && state.points.length < MAX_MEASUREMENT_POINTS) {
    state.points.push({ ...snapshot });
    updateOverlay(state);
    return true;
  }
  return false;
}

function canExtendExistingMeasurement(state, snapPoint) {
  if (!state.points.length) {
    return false;
  }

  const lastPoint = state.points[state.points.length - 1];
  if (!lastPoint) {
    return false;
  }

  return pointsShareCell(lastPoint, snapPoint) && state.points.length < MAX_MEASUREMENT_POINTS;
}

function pointsShareCell(a, b) {
  if (!a || !b) {
    return false;
  }

  return a.column === b.column && a.row === b.row;
}

function isPointerOverToken(event) {
  const tokenLayer = document.getElementById('vtt-token-layer');
  if (!tokenLayer || tokenLayer.hidden) {
    return false;
  }

  const { clientX, clientY } = event;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }

  const tokens = tokenLayer.querySelectorAll('.vtt-token');
  if (!tokens.length) {
    return false;
  }

  for (const token of tokens) {
    if (!(token instanceof Element)) {
      continue;
    }
    const rect = token.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }

  return false;
}

function getSnappedPoint(state, event) {
  // 3D board, Measure tool: pointing at a token measures to the token.
  const token = state.active && state.mode !== 'external' ? tokenUnderPointer(state, event) : null;
  if (token) return token;
  const mapCoords = window.vtt3d?.clientToMap(event.clientX, event.clientY);
  if (!mapCoords) {
    return null;
  }

  const gridMetrics = getGridMetrics();
  if (!gridMetrics) {
    return null;
  }


  const { size, offsets, columns, rows } = gridMetrics;
  if (size <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }

  const relativeX = mapCoords.x - offsets.left;
  const relativeY = mapCoords.y - offsets.top;

  const clampedColumn = clamp(Math.floor(relativeX / size), 0, columns - 1);
  const clampedRow = clamp(Math.floor(relativeY / size), 0, rows - 1);

  const centerX = offsets.left + (clampedColumn + 0.5) * size;
  const centerY = offsets.top + (clampedRow + 0.5) * size;

  return {
    mapX: centerX,
    mapY: centerY,
    column: clampedColumn,
    row: clampedRow,
    // 3D board: the surface the pointer is on, so the ruler measures to it.
    ...(Number.isFinite(mapCoords.height) ? { surfaceElevation: mapCoords.height } : {}),
    ...(typeof mapCoords.levelId === 'string' ? { levelId: mapCoords.levelId } : {}),
    ...(typeof mapCoords.surfaceId === 'string' ? { surfaceId: mapCoords.surfaceId } : {}),
    ...(typeof mapCoords.rampId === 'string' ? { rampId: mapCoords.rampId } : {}),
  };
}

function getGridMetrics() {
  const view = window.terrainContext?.()?.view;
  const size = view?.gridSize || 64;
  const offsets = view?.gridOffsets || {left:0, right:0, top:0, bottom:0};
  const pixels = view?.mapPixelSize || {};
  return {size, offsets,
    columns: Math.max(0, Math.floor(((pixels.width || 0) - offsets.left - offsets.right) / size)),
    rows: Math.max(0, Math.floor(((pixels.height || 0) - offsets.top - offsets.bottom) / size)),
  };
}

function updateOverlay(state) {
  // One redraw is one pass: the terrain walks each leg once and remembers ground heights for all of it.
  const terrain = window.terrainPrototype;
  return terrain?.active && typeof terrain.rulerPass === 'function' ? terrain.rulerPass(() => drawOverlay(state)) : drawOverlay(state);
}

function drawOverlay(state) {
  // The Measure tool on the 3D board measures in straight lines through the air, Draw Steel's way (measure-straight.mjs);
  // Space held shows the walking route over the ground instead, as below (Brandon, October 2026).
  state.walkShown = teleportSpaceHeld;
  if (state.mode !== 'external' && window.vtt3dActive && !teleportSpaceHeld && drawStraight(state)) return;
  // Distance is the route as before; cost adds difficult terrain for a walk or shift.
  const kind = state.mode === 'external' ? movementKindOf(state) : 'walk';
  // A forced move counts the squares it is moved across the map. How far it then drops is not
  // part of that count; it is shown beside it ("Forced movement 2 · Fall 6"). It goes straight from
  // where the token is to where it is held; with a corner in it, it is a slide, and each leg goes
  // straight (forced-line.mjs).
  const forced = kind === 'forced';
  // A 3D picker can name the actual pointed surface. Teleport range compares
  // endpoints with the existing teleport rule, never a walk over intervening
  // cliffs. Ordinary 2D measurements do not supply this optional height.
  const lastPoint = state.hoverPoint ?? state.points.at(-1);
  const teleport3D = kind === 'teleport' && Number.isFinite(state.points[0]?.surfaceElevation) && Number.isFinite(lastPoint?.surfaceElevation);
  const rawPoints = teleport3D ? [state.points[0], lastPoint] : getRenderablePoints(state);
  const terrain=window.terrainPrototype?.active ? window.terrainPrototype : null;

  const zones = window.terrainZones?.routeCost ? window.terrainZones : null;
  let priorMeasured={distance:0,cost:0,difficult:[],climbs:[]};
  const segments = getSegments(rawPoints).map((segment,index) => {
    const jumpDistance = teleport3D ? teleportDistance(segment.start, segment.end, segment.start.surfaceElevation, segment.end.surfaceElevation) : null;
    const full3D=window.vtt3dActive&&state.measurementActor&&zones&&!forced&&!teleport3D;
    let measured = teleport3D ? { distance: jumpDistance, cost: jumpDistance } : zones&&!full3D ? zones.routeCost([segment.start, segment.end], { kind }) : null;
    if(full3D){
      const full=zones.routeCost(rawPoints.slice(0,index+2),{kind,actor:state.measurementActor});
      measured={...full,distance:full.distance-priorMeasured.distance,cost:full.cost-priorMeasured.cost,difficult:full.difficult.slice(priorMeasured.difficult.length),climbs:full.climbs.slice(priorMeasured.climbs.length)};
      priorMeasured=full;
    }
    const squares = forced ? segment.squares : measured ? measured.distance : terrain ? terrain.route(segment.start, segment.end).cost : segment.squares;
    return { ...segment, squares, cost: forced ? squares : measured ? measured.cost : squares, difficult: measured?.difficult ?? [], climbs: measured?.climbs ?? [], shiftInDifficult: Boolean(measured?.shiftInDifficult), rawStart: segment.start };
  });
  const forcedLegs = forced && segments.length ? rawPoints.map((point) => ({ column: point.column, row: point.row })) : null;
  const stops = Boolean(forcedLegs && zones?.forcedStops?.(forcedLegs));
  const fall = forcedLegs && !stops && zones?.forcedFall ? zones.forcedFall(forcedLegs) : 0;
  const totalSquares = segments.reduce((sum, segment) => sum + segment.squares, 0);
  const totalCost = segments.reduce((sum, segment) => sum + segment.cost, 0);
  const shiftWarning = segments.some((segment) => segment.shiftInDifficult);
  state.lastMeasure = segments.length ? { distance: totalSquares, cost: totalCost, kind, shiftInDifficult: shiftWarning } : null;
  state.lastPresentation = null;
  if (segments.length) {
    const cell = (p, rawHeight) => ({ column:p.column, row:p.row, ...(Number.isFinite(rawHeight)?{rawHeight}:{}) });
    const world = p => ({ x:p.column+.5, y:p.row+.5, z:p.rawHeight??p.surfaceElevation??0 });
    const pieces = teleport3D || !terrain?.movementPresentation ? [{ points:rawPoints.map(p=>world({...p,rawHeight:p.surfaceElevation})), color:'#111111' }]
      : terrain?.movementPresentation?.(rawPoints,forced,state.measurementActor) ?? [];
    const difficult = [], climbs = [];
    for (let index=0;index<segments.length;index++) {
      const segment=segments[index];
      for (const step of segment.difficult) {
        const next=step.next||firstStepOf(segments[index+1]);
        const from=cell(step.from,step.fromHeight),at=cell(step,step.rawHeight),onward=next?cell(next,next===step.next?step.nextHeight:undefined):null;
        const points=terrain?.squarePresentation?.(from,at,onward)??flatSquareSpan(world(from), world(at), onward && world(onward));
        difficult.push({points,at:world(at),multiplier:step.multiplier});
      }
      for (const step of segment.climbs) {
        const samples=terrain?.squarePresentation?.(cell(step.from,step.fromHeight),cell(step,step.rawHeight),null);
        climbs.push({at:samples?.[0]??world(cell(step,step.rawHeight)),label:'×2'});
      }
    }
    state.lastPresentation={pieces,difficult,climbs};
  }

  if (!segments.length) {
    hideShiftWarning();
    state.ruler.setAttribute('hidden', 'hidden');
    state.rulerValue.textContent = '0 squares';
    return;
  }

  state.ruler.removeAttribute('hidden');
  const wording = rulerWording({
    movementLabel: state.mode === 'external' && state.measuring ? (forced ? forcedLabel(rawPoints) : state.movementLabel) : null,
    squares: totalSquares,
    cost: totalCost,
    fall,
  });
  // The true movement cost follows the distance only when they differ.
  const readout = [wording.distance];
  if (wording.fall) readout.push(wording.fall);
  if (stops) readout.push('Stops at a wall');
  // Stopped short by a wall or a creature: the squares it really moves, and what it takes for it.
  const slam = forcedOutcomeWording(forcedLegs && zones?.forcedOutcome ? zones.forcedOutcome(forcedLegs, state.measurementActor ? { actor: state.measurementActor } : {}) : null);
  readout.push(...slam);
  if (shiftWarning) readout.push('No shift in difficult terrain');
  if (wording.cost) readout.push(wording.cost);
  state.rulerValue.textContent = readout.join(WORDING_SEPARATOR);

  // 3D board: the dots at the route's corners, each leg's length and the total,
  // where the route actually runs, for the 3D route drawing.
  if (state.lastPresentation) {
    const heights = new Map();
    for (const piece of state.lastPresentation.pieces || []) for (const q of piece.points || []) heights.set(`${q.x.toFixed(2)},${q.y.toFixed(2)}`, q.z);
    const at = (p) => {
      const x = p.column + 0.5, y = p.row + 0.5, known = heights.get(`${x.toFixed(2)},${y.toFixed(2)}`);
      const z = Number.isFinite(known) ? known : Number.isFinite(p.surfaceElevation) ? p.surfaceElevation : (window.terrainPrototype?.heightAt?.(p.mapX, p.mapY) ?? 0);
      return { x, y, z };
    };
    const gridForLabels = getGridMetrics()?.size || 64;
    state.lastPresentation.nodes = rawPoints.map(at);
    state.lastPresentation.total = { text: wording.distance + (wording.fall ? WORDING_SEPARATOR + wording.fall : '') + (stops ? WORDING_SEPARATOR + 'Stops at a wall' : '') + slam.map((words) => WORDING_SEPARATOR + words).join('') + (wording.cost ? WORDING_SEPARATOR + wording.cost : ''), at: at(rawPoints[rawPoints.length - 1]) };
    state.lastPresentation.legs = placeLegLabels(segments, null, gridForLabels).map((label, index) => {
      const a = at(rawPoints[index]), b = at(rawPoints[index + 1] ?? rawPoints[index]);
      return { text: label.text, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 } };
    });
  }
  if (shiftWarning) showShiftWarning(); else hideShiftWarning();
}

/** The Measure tool's straight line on the 3D board. False when there is nothing to measure yet. */
function drawStraight(state) {
  const raw = getRenderablePoints(state);
  if (raw.length < 2) return false;
  const points = raw.map((p) => ({ ...p, z: Number.isFinite(p.surfaceElevation) ? p.surfaceElevation : (window.terrainPrototype?.heightAt?.(p.mapX, p.mapY) ?? 0) }));
  const words = straightWords(points);
  // A token's line runs from the middle of its space.
  const nodes = points.map((p) => ({ x: p.column + (p.width || 1) / 2, y: p.row + (p.height || 1) / 2, z: p.z }));
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  state.lastMeasure = { distance: words.total, cost: words.total, kind: 'walk', shiftInDifficult: false };
  state.lastPresentation = {
    pieces: [{ points: nodes, color: '#111111' }],
    difficult: [],
    climbs: [],
    nodes,
    total: { text: words.text, at: nodes.at(-1) },
    legs: nodes.length > 2 ? words.legs.map((leg, index) => ({ text: String(leg.distance), at: middle(nodes[index], nodes[index + 1]) })) : [],
  };
  hideShiftWarning();
  state.ruler.removeAttribute('hidden');
  state.rulerValue.textContent = words.text;
  return true;
}

function ensureRulerDetail(ruler) {
  if (!ruler) {
    return null;
  }
  let detail = ruler.querySelector('.vtt-board__ruler-detail');
  if (!detail) {
    detail = document.createElement('span');
    detail.className = 'vtt-board__ruler-detail';
    detail.hidden = true;
    ruler.appendChild(detail);
  }
  return detail;
}

// The app's own corners for the drag in hand: by a stair the hero stands at the end of (stair-assume.mjs, asked
// of terrain-prototype.js). Only while he has dropped no corner of his own, and never for a forced move.
function assumedCorners(state) {
  state.noRoute = false;
  if (state.mode !== 'external' || !state.measuring || !state.points.length || !state.hoverPoint) return null;
  // Alt held while dragging: a straight line, no route-finding (Brandon, November 8, 2026).
  if (state.straight) { state.plannedRoute = null; return null; }
  const start = state.points[0], metrics = getGridMetrics(), grid = metrics && metrics.size > 0 ? metrics.size : 64;
  const at = (corner) => ({ ...start, column: corner.column, row: corner.row, mapX: start.mapX + (corner.column - start.column) * grid, mapY: start.mapY + (corner.row - start.row) * grid });
  // 3D board: a square-by-square walking search supplies the corners, so the drawn line, the ruler's cost and the
  // submitted move are one route. Each leg between his own corners is searched too: a corner never turns it off.
  const planner = window.vtt3dActive && state.measurementActor ? window.vtt3dPlanner : null;
  if (planner) {
    try {
      const actor = state.measurementActor, dx = actor.column - start.column, dy = actor.row - start.row, ends = [...state.points.slice(1), state.hoverPoint];
      const out = [];let from = start, status = 'found', cost = 0, last = null;
      for (const [index, end] of ends.entries()) {
        const mover = index ? { ...actor, column: from.column + dx, row: from.row + dy, _floorTraversal: null, _supportSurfaceId: null } : actor;
        const planned = planner.plan(mover, { column: end.column + dx, row: end.row + dy, surfaceElevation: end.surfaceElevation, levelId: end.levelId ?? null, surfaceId: end.surfaceId ?? null, rampId: end.rampId ?? null }, movementKindOf(state));
        last = planned;
        if (planned?.status === 'found') { out.push(...planned.corners.map((p) => ({ column: p.column - dx, row: p.row - dy }))); cost += Number(planned.cost) || 0; }
        else if (planned?.status === 'pending') status = 'pending';
        else if (status !== 'pending') { status = planned?.status || 'none'; state.noRoute = planned?.status === 'unreachable'; }
        if (index < ends.length - 1) out.push({ column: end.column, row: end.row });
        from = end;
      }
      state.plannedRoute = ends.length === 1 ? last : { ...(last || {}), status, cost };
      if (status === 'found' || out.length) return out.length ? out.map(at) : null;
    } catch (error) { console.error('[VTT 3D] route planner', error); state.plannedRoute = null; }
  }
  if (state.points.length !== 1) return null;
  let corners = null;
  if (state.plannedRoute?.status !== 'found') {
    try { corners = window.terrainPrototype?.stairRoute?.(state.points[0], state.hoverPoint, state.measurementActor) || null; } catch (error) { corners = null; }
  }
  if (!corners?.length) return null;
  return corners.map(at);
}

/** The route's fixed points: where it starts and its corners, his own and the app's (which include his own, in order). */
function routePoints(state) {
  return state.assumed?.length ? [state.points[0], ...state.assumed] : state.points;
}

function getRenderablePoints(state) {
  if (!state.points.length) {
    return [];
  }
  const points = routePoints(state);

  if (state.measuring && state.hoverPoint) {
    const lastPoint = points[points.length - 1];
    if (!lastPoint || !sameMeasuredSpot(lastPoint, state.hoverPoint)) {
      return [...points, state.hoverPoint];
    }
  }

  return points.slice();
}

function getSegments(points) {
  if (points.length < 2) {
    return [];
  }

  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const squares = Math.max(
      Math.abs(end.column - start.column),
      Math.abs(end.row - start.row)
    );
    segments.push({ start, end, squares });
  }
  return segments;
}

/**
 * Build an SVG path `d` attribute that follows D&D king-move semantics:
 * from each source point, travel `min(|dx|,|dy|)` diagonal squares first,
 * then `||dx|-|dy||` cardinal squares into the destination, with a smooth
 * quadratic bend at the corner. Pure cardinal or pure diagonal segments
 * collapse to a straight line (the bend point coincides with an endpoint).
 *
 * @param {Array<{mapX:number, mapY:number, column:number, row:number}>} points
 * @param {number} gridSize  Pixel size of one grid square (used for bend radius).
 * @returns {string} SVG path data, or empty string if fewer than 2 points.
 */
function flatSquareSpan(from, at, next) {
  const midpoint = (a, b) => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2, z: (a.z+b.z)/2 });
  const points = [midpoint(from, at), at];
  if (next) points.push(midpoint(at, next));
  return points;
}

let shiftWarningElement = null;
let shiftWarningTimer = null;

function ensureShiftWarning() {
  if (shiftWarningElement?.isConnected) return shiftWarningElement;
  shiftWarningElement = document.createElement('div');
  shiftWarningElement.className = 'vtt-shift-warning';
  shiftWarningElement.setAttribute('role', 'alert');
  shiftWarningElement.hidden = true;
  shiftWarningElement.innerHTML = '<strong>No shifting in difficult terrain</strong><span>The rules do not allow a shift into or inside it. The move is not blocked.</span>';
  document.body.appendChild(shiftWarningElement);
  return shiftWarningElement;
}
function showShiftWarning() {
  const element = ensureShiftWarning();
  if (shiftWarningTimer) { clearTimeout(shiftWarningTimer); shiftWarningTimer = null; }
  element.hidden = false;
}
function hideShiftWarning() {
  if (shiftWarningTimer || !shiftWarningElement || shiftWarningElement.hidden) return;
  shiftWarningElement.hidden = true;
}
/** Shows the shift warning for a few seconds after a shift through difficult terrain has landed. */
export function flashShiftWarning(milliseconds = 4500) {
  const element = ensureShiftWarning();
  element.hidden = false;
  if (shiftWarningTimer) clearTimeout(shiftWarningTimer);
  shiftWarningTimer = setTimeout(() => { shiftWarningTimer = null; element.hidden = true; }, milliseconds);
}

function movementKindOf(state) {
  return { Teleport: 'teleport', 'Forced movement': 'forced', Shift: 'shift', Move: 'walk' }[state?.movementLabel] || 'walk';
}

/** The first square a leg walks into, by the same king-move rule the route uses. */
function firstStepOf(segment) {
  if (!segment) return null;
  const start = segment.rawStart, dx = segment.end.column - start.column, dy = segment.end.row - start.row;
  return { column: start.column + Math.sign(dx) * Math.min(1, Math.abs(dx)), row: start.row + Math.sign(dy) * Math.min(1, Math.abs(dy)) };
}

/** Flashing red over each difficult square on the route, with its multiplier (x2, x4). */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clonePoint(point) {
  if (!point) {
    return null;
  }
  const { mapX, mapY, column, row } = point;
  if (
    !Number.isFinite(mapX) ||
    !Number.isFinite(mapY) ||
    !Number.isFinite(column) ||
    !Number.isFinite(row)
  ) {
    return null;
  }
  return {
    mapX,
    mapY,
    column,
    row,
    ...(Number.isFinite(point.surfaceElevation) ? { surfaceElevation: point.surfaceElevation } : {}),
    ...(typeof point.levelId === 'string' ? { levelId: point.levelId } : {}),
    ...(typeof point.surfaceId === 'string' ? { surfaceId: point.surfaceId } : {}),
    ...(typeof point.rampId === 'string' ? { rampId: point.rampId } : {}),
  };
}

export function isMeasureModeActive() {
  return Boolean(sharedState?.active);
}

export function setMeasureModeActive(active) {
  if (sharedState) toggleMeasureMode(sharedState, Boolean(active));
}

export function beginExternalMeasurement(point, options = {}) {
  const allowInactive = Boolean(options?.allowInactive);
  if (!sharedState || (!sharedState.active && !allowInactive)) {
    return false;
  }
  const snapshot = clonePoint(point);
  if (!snapshot) {
    return false;
  }

  clearMeasurement(sharedState);
  sharedState.measurementActor = options.actor ?? null;
  sharedState.points = [snapshot];
  sharedState.hoverPoint = snapshot;
  sharedState.measuring = true;
  sharedState.mode = 'external';
  sharedState.pointerId = null;
  updateOverlay(sharedState);
  return true;
}

/**
 * Drops a path node where a held token is being held (a quick right click, right-press.mjs).
 * True when one was added: not when no token is held, when a node is there already, or at the most.
 */
/**
 * The Measure tool (hold M, or the Measure button), while its line follows the pointer: a corner where the pointer is.
 * A right click does it, as Shift does (Brandon, November 25, 2026: "I want to be able to right click to create a
 * waypoint"). True when the tool took it, so the click is not also a camera click.
 */
export function addMeasureToolNode() {
  if (!sharedState?.measuring || sharedState.mode !== 'pointer') return false;
  addMeasurementNode(sharedState);
  return true;
}

/**
 * The Measure tool, Z held and the wheel turned ("press z and scroll to make a waypoint and adjust height"): the
 * first notch drops a corner where the pointer is, and each notch then raises (or lowers, never under what the
 * pointer is over) the line's end by one square. The height stays as the pointer moves on; another corner (right
 * click) keeps it. True when the tool took the wheel, so the camera does not zoom.
 */
export function nudgeMeasureHeight(steps) {
  const state = sharedState;
  if (!state?.measuring || state.mode !== 'pointer' || !Number.isFinite(steps) || !steps) return false;
  if (!state.heightNodeDropped) { state.heightNodeDropped = true; addMeasurementNode(state); }
  state.heightOffset = Math.max(0, Math.min(200, (Number(state.heightOffset) || 0) + Math.trunc(steps)));
  state.hoverPoint = raised(state, state.rawHover ?? state.hoverPoint);
  updateOverlay(state);
  return true;
}

/** Whether the Measure tool is drawing a line just now (then Z and the wheel are its own). */
export function isMeasureToolMeasuring() {
  return Boolean(sharedState?.measuring && sharedState.mode === 'pointer');
}

/** Z let go: the next turn of the wheel with Z held starts from a new corner. */
export function endMeasureHeightNudge() {
  if (sharedState) sharedState.heightNodeDropped = false;
}

export function addExternalMeasurementNode() {
  return Boolean(sharedState && sharedState.mode === 'external' && addMeasurementNode(sharedState));
}

export function updateExternalMeasurement(point) {
  if (!sharedState || sharedState.mode !== 'external' || !sharedState.measuring) {
    return;
  }
  const snapshot = clonePoint(point);
  if (!snapshot) {
    return;
  }
  sharedState.hoverPoint = snapshot;
  sharedState.straight = altHeld;
  sharedState.assumed = assumedCorners(sharedState);
  markNoRoute(sharedState);
  updateOverlay(sharedState);
}

// Alt held while dragging a token: a straight line with no route-finding (Brandon, November 8, 2026).
let altHeld = false;
if (typeof window !== 'undefined') {
  const alt = (event) => {
    const held = event.altKey === true || (event.type === 'keydown' && event.key === 'Alt');
    if (event.key === 'Alt') { if (sharedState?.measuring) event.preventDefault(); if (event.type === 'keyup' && !event.altKey) altHeld = false; }
    if (held === altHeld && event.key !== 'Alt') return;
    altHeld = event.type === 'keyup' && event.key === 'Alt' ? false : held;
    if (sharedState?.measuring && sharedState.mode === 'external' && sharedState.hoverPoint) {
      sharedState.straight = altHeld; sharedState.assumed = assumedCorners(sharedState); markNoRoute(sharedState); updateOverlay(sharedState);
    }
  };
  window.addEventListener('keydown', alt, true);
  window.addEventListener('keyup', alt, true);
  window.addEventListener('blur', () => { altHeld = false; });
}

// No way round: the straight line is drawn, marked as a warning (it can still be dropped; the walk is then asked about).
function markNoRoute(state) {
  const ruler = state?.ruler;
  if (!ruler) return;
  if (state.noRoute) { ruler.dataset.noRoute = 'true'; ruler.title = 'No way round: straight line'; }
  else if (ruler.dataset.noRoute) { delete ruler.dataset.noRoute; ruler.removeAttribute('title'); }
}

export function finalizeExternalMeasurement(point) {
  if (!sharedState || sharedState.mode !== 'external') {
    return;
  }

  const snapshot = clonePoint(point);
  if (snapshot) {
    const lastIndex = sharedState.points.length - 1;
    if (lastIndex < 0) {
      sharedState.points = [snapshot];
    } else {
      const lastPoint = sharedState.points[lastIndex];
      if (
        lastPoint &&
        lastPoint.column === snapshot.column &&
        lastPoint.row === snapshot.row
      ) {
        sharedState.points[lastIndex] = snapshot;
      } else {
        sharedState.points.push(snapshot);
      }
    }
  }

  sharedState.measuring = false;
  sharedState.pointerId = null;
  sharedState.hoverPoint = null;
  sharedState.mode = null;
  updateOverlay(sharedState);
}

export function cancelExternalMeasurement() {
  if (!sharedState) {
    return;
  }
  if (sharedState.mode === 'external') {
    clearMeasurement(sharedState);
  }
}

export function setRulerSupplement(text) {
  if (!sharedState?.ruler) {
    return;
  }
  const detail = sharedState.rulerDetail ?? ensureRulerDetail(sharedState.ruler);
  sharedState.rulerDetail = detail;
  if (!detail) {
    return;
  }
  const value = typeof text === 'string' ? text.trim() : '';
  detail.textContent = value;
  detail.hidden = value === '';
  if (value) {
    sharedState.ruler.removeAttribute('hidden');
  }
}

export function clearRulerSupplement() {
  if (!sharedState?.rulerDetail) {
    return;
  }
  sharedState.rulerDetail.textContent = '';
  sharedState.rulerDetail.hidden = true;
}

/**
 * Read the current measurement waypoints (cell coords) without
 * mutating ruler state. Used by stairs-trigger to evaluate the actual
 * drag path against stair polygons on commit. Returns a fresh array of
 * `{ column, row }` points (may be empty if no measurement is active
 * or recent).
 */
/** Distance and true cost of the measurement on screen, as last drawn ({distance, cost, kind}) or null. */
export function getCurrentMeasurementCost() {
  return sharedState?.lastMeasure ? { ...sharedState.lastMeasure } : null;
}

/** Geometry from the same route pass used by the native ruler; read-only. */
export function getCurrentMeasurementPresentation() {
  return sharedState?.lastPresentation ?? null;
}

/** The 3D board planner's answer for the held route ({status, cost, ...}) or null. */
export function getCurrentPlannedRoute() {
  return sharedState?.plannedRoute ?? null;
}

/** 'walk', 'shift', 'forced' or 'teleport', from the modifier keys held during the current drag. */
export function getCurrentMovementKind() {
  return movementKindOf(sharedState);
}

export function getCurrentMeasurementPoints() {
  if (!sharedState || !Array.isArray(sharedState.points)) return [];
  return routePoints(sharedState)
    .filter((p) => p && Number.isFinite(p.column) && Number.isFinite(p.row))
    .map((p) => ({ column: p.column, row: p.row }));
}

/** The same without the app's own corners: where the route starts and the corners he dropped himself. */
export function getDroppedMeasurementPoints() {
  if (!sharedState || !Array.isArray(sharedState.points)) return [];
  return sharedState.points
    .filter((p) => p && Number.isFinite(p.column) && Number.isFinite(p.row))
    .map((p) => ({ column: p.column, row: p.row }));
}
