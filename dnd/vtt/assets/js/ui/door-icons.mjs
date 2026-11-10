// The door and window marks on the map (Brandon, November 8, 2026: distinct symbols for a closed door, an open door,
// a secret door closed and a secret door open). A player is never sent a closed secret door: it reaches him as plain
// wall (SceneEnvironment::project), so he sees one only while it is open. Pure: returns SVG markup.

const DOOR_CLOSED = '<path d="M3 14V2h10v12M2 14h12"/><path d="M5 13V4h6v9"/><circle cx="9.5" cy="8.5" r=".6" fill="currentColor"/>';
// Open: the frame, and the door swung out on its hinge.
const DOOR_OPEN = '<path d="M3 14V2h10v12M2 14h12"/><path d="M5 13V4l5 -1.5v12z"/>';
const WINDOW_CLOSED = '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M8 3v10M3 8h10"/>';
const WINDOW_OPEN = '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M3 3l4 2v8l-4-2zM13 3l-4 2v8l4-2z"/>';

/** Which mark a door or window gets: 'door-closed', 'door-open', 'secret-closed', 'secret-open', 'window-closed', 'window-open'. */
export function portalKind(edge) {
  const open = edge?.open === true;
  if (edge?.secret === true) return open ? 'secret-open' : 'secret-closed';
  if (edge?.interaction === 'window') return open ? 'window-open' : 'window-closed';
  return open ? 'door-open' : 'door-closed';
}

/** The inside of the 16 by 16 mark. A secret door is drawn dashed, so the Director tells it from an ordinary one at a glance. */
export function portalIcon(edge) {
  const kind = portalKind(edge);
  const window = edge?.interaction === 'window';
  const shape = { 'door-closed': DOOR_CLOSED, 'door-open': DOOR_OPEN, 'secret-closed': window ? WINDOW_CLOSED : DOOR_CLOSED, 'secret-open': window ? WINDOW_OPEN : DOOR_OPEN, 'window-closed': WINDOW_CLOSED, 'window-open': WINDOW_OPEN }[kind];
  const dash = kind.startsWith('secret') ? ' stroke-dasharray="1.6 1.2"' : '';
  return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="pointer-events:none;display:block;margin:auto" fill="none" stroke="currentColor" stroke-width="1.3"${dash}>${shape}</svg>`;
}

/** The words on the mark (its tooltip and label). */
export function portalTitle(edge) {
  const what = { 'door-closed': 'door — closed', 'door-open': 'door — open', 'secret-closed': `secret ${edge?.interaction === 'window' ? 'window' : 'door'} — closed (players see a wall)`, 'secret-open': `secret ${edge?.interaction === 'window' ? 'window' : 'door'} — open`, 'window-closed': 'window — closed', 'window-open': 'window — open' }[portalKind(edge)];
  return edge?.locked === true ? what.replace(/ — closed.*/, ' — locked') : what;
}
