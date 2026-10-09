// The GM's bar for a selected summoned wall: showing it, hiding it, and where it goes.
// Small and free of the board, so it can be tested on a page of its own.
//
// It was always on screen. Its style set `display:flex`, and an element's own `display` wins
// over its `hidden` mark, so marking it hidden did nothing: every GM saw the bar, over the turn
// tracker, on every map. Showing and hiding now set `display` itself, and the bar is not made
// until a wall is first selected.

/** The bar's look. No `display` here: showBar owns that. No place either: placeBar owns that. */
export const WALL_BAR_STYLE = 'position:fixed;z-index:1300;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(680px,calc(100vw - 24px));padding:8px 12px;border:1px solid #777;border-radius:8px;background:var(--panel-bg,#24252b);color:var(--text-color,#eee);box-shadow:0 6px 24px #0007;font-size:12px';

/** Shows or hides an element whose own style or class sets `display`. */
export function showBar(element, shown, display = 'flex') {
  if (!element) return;
  element.hidden = !shown;
  element.style.display = shown ? display : 'none';
}

/**
 * Where the bar goes, in screen pixels: just under the wall it belongs to, or just over it when
 * there is no room below, and never off the screen. Beside the thing it changes, it is clear of
 * the turn tracker and the panels fixed along the top. `wall` and `bar` are rectangles as
 * getBoundingClientRect gives them; `viewport` is {width, height}.
 */
export function placeBar({ wall, bar, viewport, gap = 10, margin = 12 }) {
  const width = bar?.width || 0, height = bar?.height || 0;
  const below = wall.bottom + gap, above = wall.top - gap - height;
  const top = below + height <= viewport.height - margin || above < margin ? below : above;
  return {
    left: Math.round(Math.max(margin, Math.min(viewport.width - width - margin, wall.left))),
    top: Math.round(Math.max(margin, Math.min(viewport.height - height - margin, top))),
  };
}
