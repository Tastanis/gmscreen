const MIN_CIRCLE_RADIUS = 0.5;
const MIN_RECT_DIMENSION = 1;

/** Paint already-normalized circle/rectangle geometry without editor state. */
export function paintTemplateArea(shape, view = {}) {
  const {root,node,label}=shape.elements;
  const offsets=view.gridOffsets ?? {};
  const offsetLeft=Number.isFinite(offsets.left)?offsets.left:0;
  const offsetTop=Number.isFinite(offsets.top)?offsets.top:0;
  const gridSize=Math.max(8,Number.isFinite(view.gridSize)?view.gridSize:64);
  root.style.setProperty('--vtt-grid-size',`${gridSize}px`);
  if (shape.type === 'circle') {
    const radius = Math.max(MIN_CIRCLE_RADIUS, shape.radius);
    const diameter = radius * 2;
    const boundsColumn = shape.center.column - radius;
    const boundsRow = shape.center.row - radius;
    const left = offsetLeft + boundsColumn * gridSize;
    const top = offsetTop + boundsRow * gridSize;
    const size = diameter * gridSize;

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.width = `${size}px`;
    root.style.height = `${size}px`;

    const nodeOffset = Math.max(0, (radius - 0.5) * gridSize);
    node.style.left = `${nodeOffset}px`;
    node.style.top = `${nodeOffset}px`;
    node.style.width = `${gridSize}px`;
    node.style.height = `${gridSize}px`;

    label.textContent = `Radius: ${radius.toFixed(1)}`;
    return;
  }

  const lengthUnits = Math.max(MIN_RECT_DIMENSION, shape.length);
  const widthUnits = Math.max(MIN_RECT_DIMENSION, shape.width);
  const rotation = normalizeAngle(shape.rotation ?? 0);
  const centerColumn = shape.start.column + lengthUnits / 2;
  const centerRow = shape.start.row + widthUnits / 2;
  const radians = toRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const spanWidth = Math.abs(lengthUnits * cos) + Math.abs(widthUnits * sin);
  const spanHeight = Math.abs(lengthUnits * sin) + Math.abs(widthUnits * cos);

  const left = offsetLeft + (centerColumn - spanWidth / 2) * gridSize;
  const top = offsetTop + (centerRow - spanHeight / 2) * gridSize;
  const width = Math.max(gridSize, spanWidth * gridSize);
  const height = Math.max(gridSize, spanHeight * gridSize);

  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.setProperty('--vtt-rect-width', `${lengthUnits * gridSize}px`);
  root.style.setProperty('--vtt-rect-height', `${widthUnits * gridSize}px`);
  root.style.setProperty('--vtt-rect-rotation', `${rotation}deg`);

  const nodeSize = gridSize;
  const anchorColumn = Number.isFinite(shape.anchor?.column) ? shape.anchor.column : null;
  const anchorRow = Number.isFinite(shape.anchor?.row) ? shape.anchor.row : null;
  if (anchorColumn !== null && anchorRow !== null) {
    const anchorLocal = gridPointToLocal(anchorColumn + 0.5, anchorRow + 0.5, view);
    const nodeLeft = anchorLocal.x - left - nodeSize / 2;
    const nodeTop = anchorLocal.y - top - nodeSize / 2;
    node.style.left = `${nodeLeft}px`;
    node.style.top = `${nodeTop}px`;
  } else {
    const anchorDistance = widthUnits / 2 + 0.5;
    const offsetXUnits = 0;
    const offsetYUnits = -anchorDistance;
    const rotatedXUnits = offsetXUnits * cos - offsetYUnits * sin;
    const rotatedYUnits = offsetXUnits * sin + offsetYUnits * cos;
    const relativeXUnits = spanWidth / 2 + rotatedXUnits;
    const relativeYUnits = spanHeight / 2 + rotatedYUnits;
    node.style.left = `${relativeXUnits * gridSize - nodeSize / 2}px`;
    node.style.top = `${relativeYUnits * gridSize - nodeSize / 2}px`;
  }
  node.style.width = `${nodeSize}px`;
  node.style.height = `${nodeSize}px`;

  label.textContent = `${lengthUnits.toFixed(1)} × ${widthUnits.toFixed(1)}`;
}


function normalizeAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  let normalized=angle%360;
  if(normalized<0)normalized+=360;
  return normalized;
}
function toRadians(angle) { return angle * Math.PI / 180; }
function gridPointToLocal(column,row,view) {
  const offsets=view.gridOffsets ?? {};
  const size=Math.max(8,Number.isFinite(view.gridSize)?view.gridSize:64);
  return {x:(Number.isFinite(offsets.left)?offsets.left:0)+column*size,
    y:(Number.isFinite(offsets.top)?offsets.top:0)+row*size};
}
