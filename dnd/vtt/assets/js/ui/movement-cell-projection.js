// Presentation only: retain canonical cells and movement authority unchanged.
export function projectedMovementCell(cell, grid, project = p => p) {
  const size = grid.size, width = Math.max(1, cell.width || 1), height = Math.max(1, cell.height || 1);
  const left = grid.left + cell.column * size, top = grid.top + cell.row * size;
  const points = [];
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % 4];
    for (let step = 0; step < 8; step++) {
      const t = step / 8;
      points.push(project({x: left + (a[0] + (b[0] - a[0]) * t) * size, y: top + (a[1] + (b[1] - a[1]) * t) * size}));
    }
  }
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
  const maxX = Math.max(...points.map(p => p.x)), maxY = Math.max(...points.map(p => p.y));
  const area = Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
  const thickness = area / Math.max(maxX - minX, maxY - minY, 1);
  return {points, minX, minY, width: Math.max(.1, maxX - minX), height: Math.max(.1, maxY - minY),
    center: project({x: left + width * size / 2, y: top + height * size / 2}),
    compressed: thickness < size * Math.min(width, height) * .4};
}

export function movementCellContains(shape, point) {
  let inside = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const a = shape.points[i], b = shape.points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The offered square that is drawn under a point on the screen, read from the squares as they
 * were painted: the last painted one whose outline holds the point wins, as it is the one on top.
 * `nodes` are the painted cells (paintProjectedMovementCell); the point is in screen pixels.
 *
 * What is drawn is what is picked. Working the outlines out again at the moment of the click can
 * disagree with what was painted, and a click on a square hanging over a drop then fell through
 * to "the ground under the pointer": a square or two away, the height times the slant.
 */
export function paintedCellAt(nodes, clientX, clientY) {
  const list = Array.from(nodes || []);
  for (let i = list.length - 1; i >= 0; i--) {
    const node = list[i], box = node.getBoundingClientRect?.();
    if (!box || !(box.width > 0 && box.height > 0) || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) continue;
    const polygon = node.querySelector?.('polygon'), view = node.querySelector?.('svg')?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
    if (polygon && view?.length === 4 && view[2] > 0 && view[3] > 0) {
      const point = {x: (clientX - box.left) / box.width * view[2], y: (clientY - box.top) / box.height * view[3]};
      const points = (polygon.getAttribute('points') || '').trim().split(/\s+/).map(pair => { const [x, y] = pair.split(',').map(Number); return {x, y}; });
      if (points.length >= 3 && !movementCellContains({points}, point)) continue;
    }
    const column = Number(node.dataset?.column), row = Number(node.dataset?.row);
    if (Number.isFinite(column) && Number.isFinite(row)) return {column, row};
  }
  return null;
}

export function paintProjectedMovementCell(node, cell, shape) {
  node.dataset.column = cell.column;
  node.dataset.row = cell.row;
  node.dataset.compressed = String(shape.compressed);
  node.style.left = `${shape.minX}px`; node.style.top = `${shape.minY}px`;
  node.style.width = `${shape.width}px`; node.style.height = `${shape.height}px`;
  node.classList.add('is-terrain-shaped');
  let svg = node.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(document.createElementNS(svg.namespaceURI, 'polygon'));
    node.prepend(svg);
  }
  svg.setAttribute('viewBox', `0 0 ${shape.width} ${shape.height}`);
  svg.firstElementChild.setAttribute('points', shape.points.map(p => `${p.x - shape.minX},${p.y - shape.minY}`).join(' '));
}

// Freeze the loupe beside its activation point so the user can move into it.
// Only cell outlines are enlarged; never copy map imagery or fog-hidden tokens.
export function updateMovementLoupe(overlay, {event, cell, shape, scale, localPoint, clampCell, legalCells}) {
  let lens = overlay.querySelector('[data-movement-loupe]');
  if (lens) {
    const bounds = lens.getBoundingClientRect();
    if (event.clientX >= bounds.left - 20 && event.clientX <= bounds.right + 20 && event.clientY >= bounds.top - 20 && event.clientY <= bounds.bottom + 20) return;
    lens.remove();
  }
  if (!shape.compressed || !Number.isFinite(scale) || scale <= 0) return;
  lens = document.createElement('div');
  lens.className = 'vtt-movement-loupe'; lens.dataset.movementLoupe = '';
  lens.setAttribute('role', 'group'); lens.setAttribute('aria-label', 'Magnified destination squares');
  const extent = 120, gap = 12;
  const dx = event.clientX + gap + extent > window.innerWidth - 8 ? -extent - gap : gap;
  const dy = Math.min(gap, window.innerHeight - 8 - extent - event.clientY);
  lens.style.left = `${localPoint.x + dx / scale}px`;
  lens.style.top = `${localPoint.y + dy / scale}px`;
  lens.style.transform = `scale(${1 / scale})`;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const target = {column: cell.column + dx, row: cell.row + dy};
    const bounded = clampCell(target);
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.movementCell = ''; button.dataset.column = target.column; button.dataset.row = target.row;
    button.disabled = bounded.column !== target.column || bounded.row !== target.row;
    button.dataset.inRange = String(legalCells.some(c => c.column === target.column && c.row === target.row));
    button.setAttribute('aria-label', `Column ${target.column + 1}, row ${target.row + 1}`);
    button.setAttribute('aria-pressed', String(dx === 0 && dy === 0));
    lens.append(button);
  }
  overlay.append(lens);
}
