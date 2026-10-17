// Marks a wall piece on the board for a moment: the one a refused walk met. Brandon, October 10, 2026, in the
// bathhouse: "keep hitting some wall that won't let me move to the stairs". A drag goes in one straight line
// and is refused if that line touches a wall; the page said only that a wall was in the way, not which or
// where. Now the piece is shown, and the line says how to go round.

/** What the status line says when a walk is refused by a wall. `byDrag`: a drag can be given a corner. */
export function blockedByWallText(byDrag) {
  return byDrag ? 'Blocked by a wall. Right click while dragging to drop a corner and go round.' : 'Blocked by a wall.';
}

/** The same line for the piece that was met: a shut door or a window is named, not called a wall (Brandon, October 16, 2026).
 *  A secret door is never named to anyone it is hidden from: it reads as the wall it looks like. */
export function blockedText(edge, byDrag) {
  if (edge?.interaction === 'door' && edge.secret !== true && edge.open !== true) return edge.locked === true ? 'The door is locked.' : 'The door is shut. Click it to open it.';
  if (edge?.interaction === 'window' && edge.open !== true) return 'A window is in the way.';
  return blockedByWallText(byDrag);
}

/** True when the server's refusal is the wall one (WallMovement::assertAllowed). */
export const isWallRefusal = (message) => /blocked by a wall/i.test(String(message || ''));

/** How long the mark stays, in milliseconds. */
export const WALL_FLASH_MS = 1800;

/**
 * Draws the mark: a bright line along the wall piece, over everything on the map, fading out.
 * `ends` are the piece's two ends as map pixels ({x, y}); `layer` is the element the map is drawn in;
 * `size` the map's pixel size; `grid` one square in pixels. Returns the element, or null when there is
 * nothing to draw on.
 */
export function flashWall(ends, { layer = null, size = null, grid = 64, documentRef = typeof document === 'undefined' ? null : document, ms = WALL_FLASH_MS, later = setTimeout } = {}) {
  if (!documentRef || !layer || !Array.isArray(ends) || ends.length !== 2 || !ends.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  layer.querySelectorAll?.('[data-wall-flash]').forEach((old) => old.remove());
  const ns = 'http://www.w3.org/2000/svg', svg = documentRef.createElementNS(ns, 'svg');
  svg.dataset.wallFlash = '';
  svg.setAttribute('aria-hidden', 'true');
  if (size?.width > 0 && size?.height > 0) { svg.setAttribute('width', String(size.width)); svg.setAttribute('height', String(size.height)); svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`); }
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:100005;transition:opacity 500ms ease-in';
  for (const [colour, width] of [['rgba(8,10,20,0.85)', Math.max(8, grid * 0.2)], ['#ff5a4f', Math.max(5, grid * 0.12)]]) {
    const line = documentRef.createElementNS(ns, 'line');
    line.setAttribute('x1', String(ends[0].x)); line.setAttribute('y1', String(ends[0].y)); line.setAttribute('x2', String(ends[1].x)); line.setAttribute('y2', String(ends[1].y));
    line.setAttribute('stroke', colour); line.setAttribute('stroke-width', String(width)); line.setAttribute('stroke-linecap', 'round');
    svg.append(line);
  }
  layer.append(svg);
  later(() => { svg.style.opacity = '0'; }, Math.max(0, ms - 500));
  later(() => svg.remove(), ms);
  return svg;
}
