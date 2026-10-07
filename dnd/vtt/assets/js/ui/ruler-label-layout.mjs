// Where the movement ruler's labels go. Pure layout, so it can be tested without a page.
// All distances are map pixels; `mapX`/`mapY` are the centre of a square.

// Labels are sized from the grid, so they stay readable on maps drawn with large squares.
export const totalLabelSize = (gridSize) => Math.max(22, gridSize * 0.44);
export const legLabelSize = (gridSize) => Math.max(18, gridSize * 0.36);
const LABEL_LINE = 1.18; // line height, as a share of the font size
const LABEL_CHARACTER_WIDTH = 0.57; // generous average character width, as a share of the font size

/**
 * The words on the ruler. This is the one place to change the wording.
 * A token drag reads "Move 5", and "Move 5 · Cost 8" when the true cost differs. The plain
 * Measure tool has no movement word, so it keeps "5 squares".
 */
export const WORDING_SEPARATOR = ' · ';
export const legWording = (squares) => (squares === 1 ? '1 square' : `${squares} squares`);
export function rulerWording({ movementLabel = null, squares = 0, cost = squares } = {}) {
  return {
    distance: movementLabel ? `${movementLabel} ${squares}` : legWording(squares),
    cost: cost !== squares ? `Cost ${cost}` : null,
  };
}

/**
 * The total ("Move 5 · Cost 8") sits below the destination square, clear of the
 * token and its Stamina bar. When the route comes up from below, or the map ends there, it goes
 * above the bar instead, so it never lies along the route it describes.
 * `lines` is the text, top line first. `top` is the centre of the first line.
 */
export function placeTotalLabel({ end, previous = null, gridSize = 64, mapHeight = Infinity, lines = [] } = {}) {
  const fontSize = totalLabelSize(gridSize), lineHeight = fontSize * LABEL_LINE, count = Math.max(1, lines.length);
  const fromBelow = !!previous && previous.mapY - end.mapY > Math.abs(previous.mapX - end.mapX) * 0.5;
  const belowTop = end.mapY + gridSize * 0.95;
  const aboveTop = end.mapY - gridSize * 1.15 - (count - 1) * lineHeight;
  const fitsBelow = belowTop + count * lineHeight < mapHeight, fitsAbove = aboveTop - lineHeight > 0;
  const below = fromBelow ? !fitsAbove : fitsBelow || !fitsAbove;
  const top = below ? belowTop : aboveTop;
  const halfWidth = Math.max(0, ...lines.map((line) => String(line).length)) * fontSize * LABEL_CHARACTER_WIDTH / 2;
  return {
    fontSize,
    lineHeight,
    top,
    side: below ? 'below' : 'above',
    box: { left: end.mapX - halfWidth, right: end.mapX + halfWidth, top: top - lineHeight * 0.6, bottom: top + (count - 0.4) * lineHeight },
  };
}

/**
 * One leg: the total already says it, so no leg labels. Several: each leg shows its length, set
 * off to the side of the route so it never sits on the line or on the numbers of difficult
 * squares. The true cost is on the total only. A leg label that would touch the total is left out.
 */
export function placeLegLabels(segments = [], totalBox = null, gridSize = 64) {
  if (segments.length < 2) return [];
  const fontSize = legLabelSize(gridSize), halfLine = fontSize * LABEL_LINE / 2;
  return segments.map((segment) => {
    const dx = segment.end.mapX - segment.start.mapX, dy = segment.end.mapY - segment.start.mapY;
    let x = (segment.start.mapX + segment.end.mapX) / 2, y = (segment.start.mapY + segment.end.mapY) / 2, anchor = 'middle';
    if (Math.abs(dy) < Math.abs(dx) * 0.5) y -= gridSize * 0.62;
    else if (Math.abs(dx) < Math.abs(dy) * 0.5) { x += gridSize * 0.45; anchor = 'start'; }
    else { x += gridSize * 0.5; y += (dx * dy > 0 ? -1 : 1) * gridSize * 0.5; anchor = 'start'; }
    const text = legWording(segment.squares);
    const width = text.length * fontSize * LABEL_CHARACTER_WIDTH, left = anchor === 'middle' ? x - width / 2 : x;
    return { x, y, anchor, text, fontSize, left, right: left + width, top: y - halfLine, bottom: y + halfLine };
  }).filter((label) => !totalBox
    || label.right < totalBox.left || label.left > totalBox.right || label.bottom < totalBox.top || label.top > totalBox.bottom);
}
