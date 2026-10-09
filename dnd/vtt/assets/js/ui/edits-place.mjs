// Where the GM's map-editing panels (Edits, Walls, Height) sit when a token's card is open.
// Pure: rectangles in, a number out.
//
// The panels sit at the left of the board. The selected token's card slides in over the same
// place, in a layer of its own that is above the board whatever the panels' own order is, so a
// click on "Walls" landed on the card. A panel that the card would cover moves to just right of it.

/** The panels' usual distance from the left of the board, and the gap kept beside the card. */
export const PANEL_REST = 58;
export const PANEL_GAP = 12;

/**
 * The panel's left edge, in pixels from the left of its container, or null for its usual place.
 * `card` and `host` are rectangles as getBoundingClientRect gives them (the card may be null);
 * `width` is the panel's own width.
 */
export function panelLeft({ card = null, host, width = 300 }) {
  if (!card || !host || !(card.width > 0) || card.right <= host.left + PANEL_REST) return null;
  // Beside the card, but never off the right of the board.
  return Math.max(PANEL_REST, Math.min(card.right - host.left + PANEL_GAP, host.width - width - PANEL_GAP));
}
