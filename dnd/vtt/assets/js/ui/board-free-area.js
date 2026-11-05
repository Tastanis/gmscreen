// The part of the screen the board shows uncovered, as two CSS lengths on <html>: --vtt-free-left and --vtt-free-right
// (class vtt-free-area once set). The ability trays centre in it (Brandon, November 4, 2026: "The ability tray buttons
// should be centered. If the side thing pops out they should slide over. If something on the other side like the chat
// then they should slide back the other way").
//   left:  the board's own left edge, or the right edge of an open left panel (settings, hero, monster), whichever is further
//   right: the board's own right edge (the VTT's chat takes room from the board), or what the Table says its drawers cover
// The Table (dnd/table/table-apps.js sendMapInsets) passes its drawers in through window.vttEmbed.setInsets.

const LEFT_PANELS = [
  ['#vtt-settings-panel', 'vtt-settings-panel--open'],
  ['#vtt-character-summary-panel', 'vtt-character-summary--open'],
  ['#vtt-monster-summary-panel', 'vtt-monster-summary--open'],
];

export function mountBoardFreeArea(doc = document) {
  const root = doc.documentElement;
  const win = doc.defaultView || window;
  let outside = { left: 0, right: 0 };
  let frame = 0;
  const watched = new WeakSet();

  const classObserver = new win.MutationObserver(() => schedule());
  function watch(node) {
    if (!node || watched.has(node)) return;
    watched.add(node);
    classObserver.observe(node, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }

  function paint() {
    frame = 0;
    const width = root.clientWidth || win.innerWidth || 0;
    const board = doc.querySelector('.vtt-board__canvas-wrapper');
    const rect = board?.getBoundingClientRect?.();
    let left = rect && rect.width ? Math.max(0, rect.left) : 0;
    let right = rect && rect.width ? Math.max(0, width - rect.right) : 0;
    for (const [selector, openClass] of LEFT_PANELS) {
      const panel = doc.querySelector(selector);
      watch(panel);
      // Where an open panel ends once it has slid out (offsetLeft leaves its slide out of it).
      if (panel?.classList.contains(openClass) && panel.getAttribute('aria-hidden') !== 'true' && panel.offsetWidth) {
        left = Math.max(left, panel.offsetLeft + panel.offsetWidth);
      }
    }
    left = Math.max(left, outside.left);
    right = Math.max(right, outside.right);
    // Too little left between them: the tray goes back over everything rather than into a sliver.
    if (width - left - right < 280) { left = 0; right = 0; }
    root.style.setProperty('--vtt-free-left', `${Math.round(left)}px`);
    root.style.setProperty('--vtt-free-right', `${Math.round(right)}px`);
    root.classList.add('vtt-free-area');
  }

  function schedule() {
    // A short timer, not a frame: the 3D board can hold frames back, and the tray should move as the panel does.
    if (!frame) frame = win.setTimeout(paint, 16);
  }

  watch(doc.body);
  const board = doc.querySelector('.vtt-board__canvas-wrapper');
  if (board && win.ResizeObserver) new win.ResizeObserver(schedule).observe(board);
  win.addEventListener('resize', schedule);
  doc.addEventListener('chat-panel:toggle', schedule);
  schedule();

  return {
    setOutside(next = {}) {
      const left = Math.max(0, Number(next.left) || 0);
      const right = Math.max(0, Number(next.right) || 0);
      if (left === outside.left && right === outside.right) return;
      outside = { left, right };
      schedule();
    },
    refresh: schedule,
  };
}
