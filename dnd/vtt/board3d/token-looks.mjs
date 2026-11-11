// Token looks on the 3D board: the settings and the plain math behind them, kept apart from three.js so they can be
// tested (assets/js/ui/__tests__/token-looks.test.mjs).
//
// Every tunable lives in TOKEN_LOOKS, as plain JSON with defaults (Brandon's rule: limits and settings are JSON fields
// with a default, never constants scattered through the code). A page or a console can override any field through
// window.vttTokenLooks (same shape, partial); tokenLookSettings() merges and clamps.

export const TOKEN_LOOKS = Object.freeze({
 // Brandon, November 10, 2026: "there needs to be a light square around where a creature sits. This is helpful for
 // creatures that are like four wide, because they're often a circle. But their body extends out, so there needs to
 // be a box showing where this creature actually stands ... It should be faint, but visible."
 // A thin light line over a wider dark band, both faint, so it reads on light maps and on dark ones.
 footprint: Object.freeze({
  show: true,
  minSize: 1,             // squares: creatures this wide or wider get the square (2 would leave size-1 tokens bare)
  lineColor: '#ffffff',
  lineOpacity: 0.42,
  lineWidth: 0.03,        // squares
  haloColor: '#0b1218',
  haloOpacity: 0.26,
  haloWidth: 0.075,       // squares
  lift: 0.05,             // squares above the ground or the floor it stands on
 }),
 // Brandon, November 10, 2026 (the Thorn Briar): "its HP and its HP bar were both shrunken down, and the conditions
 // on top of it were shrunken down so small I couldn't even see them when I zoomed in. And it didn't get any bigger
 // when I zoomed in." Bars, numbers and conditions are sized per square on screen, whatever the creature's size.
 tokenScreen: Object.freeze({
  minSquarePx: 25,        // one square's width on screen is held between these for the token box and its bars
  maxSquarePx: 110,
  unitBoost: 1.25,        // bars a quarter bigger than on the flat board (Brandon, October 2026)
 }),
});

const num = (value, fallback, lo, hi) => { const n = Number(value); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim()) ? value.trim() : fallback;

/** TOKEN_LOOKS with `overrides` (same shape, any part) merged in; bad values fall back to the defaults. */
export function tokenLookSettings(overrides = globalThis.window?.vttTokenLooks) {
 const d = TOKEN_LOOKS, f = overrides?.footprint || {}, s = overrides?.tokenScreen || {};
 const minSquarePx = num(s.minSquarePx, d.tokenScreen.minSquarePx, 4, 400);
 return {
  footprint: {
   show: typeof f.show === 'boolean' ? f.show : d.footprint.show,
   minSize: num(f.minSize, d.footprint.minSize, 1, 20),
   lineColor: color(f.lineColor, d.footprint.lineColor),
   lineOpacity: num(f.lineOpacity, d.footprint.lineOpacity, 0, 1),
   lineWidth: num(f.lineWidth, d.footprint.lineWidth, 0.005, 0.5),
   haloColor: color(f.haloColor, d.footprint.haloColor),
   haloOpacity: num(f.haloOpacity, d.footprint.haloOpacity, 0, 1),
   haloWidth: num(f.haloWidth, d.footprint.haloWidth, 0, 0.5),
   lift: num(f.lift, d.footprint.lift, 0, 1),
  },
  tokenScreen: {
   minSquarePx,
   maxSquarePx: num(s.maxSquarePx, d.tokenScreen.maxSquarePx, minSquarePx, 1000),
   unitBoost: num(s.unitBoost, d.tokenScreen.unitBoost, 0.25, 4),
  },
 };
}

/**
 * A token's box size (px) and its --tok-unit (px) on the 3D board.
 * `footprintPx`: the creature's whole width on screen (its widest side, `squares` squares across).
 * The box is the footprint, held per square between minSquarePx and maxSquarePx. The unit is per square, as the flat
 * board's --tok-unit is (grid size / 64): a size-4 creature's bars and conditions read like a size-1 creature's at the
 * same zoom, and grow with the zoom up to the same cap. Before (to November 10, 2026) the whole box was held under
 * 110 px and the unit divided by the size, so a size-4 creature's bars were a quarter size and stopped growing early.
 */
export function tokenScreenMetrics(footprintPx, squares, screen = TOKEN_LOOKS.tokenScreen) {
 const n = Math.max(1, Number(squares) || 1), px = Number(footprintPx);
 const perSquare = Math.max(screen.minSquarePx, Math.min(screen.maxSquarePx, Number.isFinite(px) ? px / n : 0));
 return { size: perSquare * n, tokUnit: screen.unitBoost * perSquare / 64, perSquare };
}

/**
 * The squares a creature stands on, as a rect in squares ({column,row,width,height}), or null for a creature under
 * the footprint's minimum size. `held` ({id,x,y}, x/y its centre in squares) moves it with a token being dragged.
 */
export function footprintRect(placement, held = null, minSize = 1) {
 if (!placement) return null;
 const width = Math.max(1, Number(placement.width) || 1), height = Math.max(1, Number(placement.height) || 1);
 if (Math.max(width, height) < minSize) return null;
 const holding = held && held.id === placement.id && Number.isFinite(held.x) && Number.isFinite(held.y);
 const column = holding ? held.x - width / 2 : Number(placement.column), row = holding ? held.y - height / 2 : Number(placement.row);
 if (!Number.isFinite(column) || !Number.isFinite(row)) return null;
 return { column, row, width, height };
}
