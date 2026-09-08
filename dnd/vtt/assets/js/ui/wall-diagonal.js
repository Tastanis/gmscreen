export function shouldRenderWallDiagonalConnector(startSquare, endSquare, squareKeySet) {
  const sides = getWallDiagonalConnectorSides(startSquare, endSquare, squareKeySet);
  return sides.before || sides.after;
}

export function getWallDiagonalConnectorSides(startSquare, endSquare, squareKeySet) {
  if (!startSquare || !endSquare || !squareKeySet || typeof squareKeySet.has !== 'function') {
    return { before: false, after: false };
  }

  const dx = endSquare.column - startSquare.column;
  const dy = endSquare.row - startSquare.row;
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
    return { before: false, after: false };
  }

  const orientation = dx * dy > 0 ? 'se' : 'ne';
  const beforeCell = orientation === 'se'
    ? { column: startSquare.column + 1, row: startSquare.row }
    : { column: startSquare.column, row: startSquare.row - 1 };
  const afterCell = orientation === 'se'
    ? { column: startSquare.column, row: startSquare.row + 1 }
    : { column: startSquare.column + 1, row: startSquare.row };

  return {
    before: shouldRenderWallConnectorHalf(beforeCell, squareKeySet),
    after: shouldRenderWallConnectorHalf(afterCell, squareKeySet),
  };
}

function shouldRenderWallConnectorHalf(cell, squareKeySet) {
  if (!cell || squareKeySet.has(`${cell.column},${cell.row}`)) {
    return false;
  }

  let neighborCount = 0;
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (columnOffset === 0 && rowOffset === 0) {
        continue;
      }
      if (squareKeySet.has(`${cell.column + columnOffset},${cell.row + rowOffset}`)) {
        neighborCount += 1;
      }
    }
  }
  return neighborCount === 2;
}

