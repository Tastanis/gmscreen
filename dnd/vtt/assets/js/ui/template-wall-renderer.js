import {createTemplateGeometry} from './template-geometry.js';
import {getWallDiagonalConnectorSides} from './wall-diagonal.js';
const {clampWallSquares,getMapGridBounds}=createTemplateGeometry();

export function paintWallTemplate(shape, view = {}) {
  const squares = clampWallSquares(shape.squares, view);
  if (!view.mapLoaded || squares.length === 0) {
    shape.elements.root.hidden = true;
    shape.elements.root.setAttribute('aria-hidden', 'true');
    return;
  }

  shape.squares = squares;
  const bounds = getMapGridBounds(view);
  if (!bounds) {
    shape.elements.root.hidden = true;
    shape.elements.root.setAttribute('aria-hidden', 'true');
    return;
  }

  const minColumn = Math.min(...squares.map((square) => square.column));
  const maxColumn = Math.max(...squares.map((square) => square.column)) + 1;
  const minRow = Math.min(...squares.map((square) => square.row));
  const maxRow = Math.max(...squares.map((square) => square.row)) + 1;

  const left = bounds.offsetLeft + minColumn * bounds.gridSize;
  const top = bounds.offsetTop + minRow * bounds.gridSize;
  const width = Math.max(bounds.gridSize, (maxColumn - minColumn) * bounds.gridSize);
  const height = Math.max(bounds.gridSize, (maxRow - minRow) * bounds.gridSize);

  const root = shape.elements.root;
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.setProperty('--vtt-wall-grid', `${bounds.gridSize}px`);

  const container = shape.elements.tileContainer;
  if (!container) {
    return;
  }

  const tilesMap = shape.elements.tiles ?? new Map();
  const connectorsMap = shape.elements.connectors ?? new Map();
  shape.elements.tiles = tilesMap;
  shape.elements.connectors = connectorsMap;

  const activeTileKeys = new Set();
  squares.forEach((square) => {
    const key = `${square.column},${square.row}`;
    activeTileKeys.add(key);
    let tile = tilesMap.get(key);
    if (!tile) {
      tile = document.createElement('div');
      container.appendChild(tile);
      tilesMap.set(key, tile);
    }
    tile.className = `vtt-wall__tile vtt-wall__tile--${resolveWallTileOrientation(square, squares)}`;
    const localLeft = (square.column - minColumn) * bounds.gridSize;
    const localTop = (square.row - minRow) * bounds.gridSize;
    tile.style.left = `${localLeft}px`;
    tile.style.top = `${localTop}px`;
    tile.style.width = `${bounds.gridSize}px`;
    tile.style.height = `${bounds.gridSize}px`;
  });

  tilesMap.forEach((tile, key) => {
    if (!activeTileKeys.has(key)) {
      tile.remove();
      tilesMap.delete(key);
    }
  });

  const connectorKeys = new Set();
  const squareKeySet = new Set(squares.map((square) => `${square.column},${square.row}`));
  squares.forEach((square) => {
    const southEastKey = `${square.column + 1},${square.row + 1}`;
    if (squareKeySet.has(southEastKey)) {
      const startSquare = { column: square.column, row: square.row };
      const endSquare = { column: square.column + 1, row: square.row + 1 };
      const connectorSides = getWallDiagonalConnectorSides(startSquare, endSquare, squareKeySet);
      const key = connectorSides.before || connectorSides.after
        ? ensureWallConnector(shape, bounds, startSquare, endSquare, 'se', minColumn, minRow, connectorSides)
        : null;
      if (key) {
        connectorKeys.add(key);
      }
    }

    const northEastKey = `${square.column + 1},${square.row - 1}`;
    if (squareKeySet.has(northEastKey)) {
      const startSquare = { column: square.column, row: square.row };
      const endSquare = { column: square.column + 1, row: square.row - 1 };
      const connectorSides = getWallDiagonalConnectorSides(startSquare, endSquare, squareKeySet);
      const key = connectorSides.before || connectorSides.after
        ? ensureWallConnector(shape, bounds, startSquare, endSquare, 'ne', minColumn, minRow, connectorSides)
        : null;
      if (key) {
        connectorKeys.add(key);
      }
    }
  });

  connectorsMap.forEach((element, key) => {
    if (!connectorKeys.has(key)) {
      element.remove();
      connectorsMap.delete(key);
    }
  });

  if (shape.elements.label) {
    const count = squares.length;
    shape.elements.label.textContent = `${count} square${count === 1 ? '' : 's'}`;
  }
}

function ensureWallConnector(shape, bounds, startSquare, endSquare, orientation, minColumn, minRow, sides = {}) {
  const container = shape.elements.tileContainer;
  if (!container) {
    return null;
  }

  const connectorsMap = shape.elements.connectors ?? new Map();
  shape.elements.connectors = connectorsMap;

  const baseColumn = Math.min(startSquare.column, endSquare.column);
  const baseRow = Math.min(startSquare.row, endSquare.row);
  const key = `diag:${baseColumn},${baseRow}:${orientation}`;
  let connector = connectorsMap.get(key);
  if (!connector) {
    connector = document.createElement('div');
    container.appendChild(connector);
    connectorsMap.set(key, connector);
  }
  connector.className = [
    'vtt-wall__connector',
    `vtt-wall__connector--${orientation}`,
    sides.before === false ? 'vtt-wall__connector--hide-before' : '',
    sides.after === false ? 'vtt-wall__connector--hide-after' : '',
  ].filter(Boolean).join(' ');

  const localLeft = (baseColumn - minColumn) * bounds.gridSize;
  const localTop = (baseRow - minRow) * bounds.gridSize;

  connector.style.width = `${bounds.gridSize * 2}px`;
  connector.style.height = `${bounds.gridSize * 2}px`;
  connector.style.left = `${localLeft}px`;
  connector.style.top = `${localTop}px`;

  return key;
}

function resolveWallTileOrientation(square, squares = []) {
  if (!square || !Array.isArray(squares)) {
    return 'se';
  }

  const diagonalNeighbor = squares.find((candidate) => {
    if (!candidate || candidate === square) {
      return false;
    }
    return Math.abs(candidate.column - square.column) === 1 && Math.abs(candidate.row - square.row) === 1;
  });

  if (!diagonalNeighbor) {
    return 'se';
  }

  return (diagonalNeighbor.column - square.column) * (diagonalNeighbor.row - square.row) > 0 ? 'se' : 'ne';
}
