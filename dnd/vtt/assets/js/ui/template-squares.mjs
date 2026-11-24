/** The squares a template covers: a radius as a square block (Chebyshev, centres within), a rectangle turned in quarter turns. */
export function templateSquares(shape) {
  const out = [];
  if (shape.type === 'circle') {
    const cx = Number(shape.center?.column) || 0,
      cy = Number(shape.center?.row) || 0,
      r = Math.max(0.5, Number(shape.radius) || 0.5);
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++)
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++)
        if (Math.abs(x + 0.5 - cx) <= r + 1e-6 && Math.abs(y + 0.5 - cy) <= r + 1e-6)
          out.push({ column: x, row: y });
    return { squares: out, height: 2 * r + 1 };
  }
  if (shape.type === 'rectangle') {
    const L = Math.max(1, Number(shape.length) || 1),
      W = Math.max(1, Number(shape.width) || 1),
      turn = ((Math.round((Number(shape.rotation) || 0) / 90) % 4) + 4) % 4;
    const cx = (Number(shape.start?.column) || 0) + L / 2,
      cy = (Number(shape.start?.row) || 0) + W / 2,
      hw = (turn % 2 ? W : L) / 2,
      hh = (turn % 2 ? L : W) / 2;
    // Half-open, so a rectangle turned about its middle onto half squares still covers W x D squares.
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++)
      for (let y = Math.floor(cy - hh); y < Math.ceil(cy + hh); y++)
        if (
          x + 0.5 >= cx - hw - 1e-6 &&
          x + 0.5 < cx + hw - 1e-6 &&
          y + 0.5 >= cy - hh - 1e-6 &&
          y + 0.5 < cy + hh - 1e-6
        )
          out.push({ column: x, row: y });
    return { squares: out, height: Math.min(L, W) <= 1 ? 1 : Math.min(L, W) };
  }
  return { squares: out, height: 1 };
}
