// A question the page has asked and nobody has answered yet: the climbing question, the
// break-through question, the fall panel, the teleport choice.
//
// Since arrow keys and drags take their turn one behind another (keyboard-movement-queue.js), a
// move that is waiting on an unanswered question holds every move after it. A player who did not
// see the question, or dragged it out of sight, was left stuck: the ruler read, the token did not
// move, and nothing said why. Brandon: "a flash and repopup of the question in case it got moved
// or didn't pop up so that they don't get stuck."
//
// So when a move is held behind an open question, the question is brought back to the front, put
// back on the screen if it is off it, and flashed. It is not answered and not cancelled, and the
// held move is not made.
const QUESTIONS = [
  ['[data-climb-prompt]', 'the climbing question'],
  ['[data-break-prompt]', 'the break-through question'],
  ['[data-fall-review]', 'the fall'],
  ['dialog[data-teleport-choice][open]', 'the teleport choice'],
];

/** The open question, with what to call it: { element, name }. Null when none is open. */
export function openQuestion(documentRef = typeof document === 'undefined' ? null : document) {
  for (const [selector, name] of QUESTIONS) {
    const element = documentRef?.querySelector?.(selector);
    if (element) return { element, name };
  }
  return null;
}

/** What the status line says when a move is held behind a question. */
export const heldMessage = (name) => `Answer ${name} first. That move was not made.`;

/**
 * Brings a question back where it can be seen and flashes it. Returns what it did, for tests:
 * { raised, moved, flashed }.
 */
export function callAttention(element, { view = typeof window === 'undefined' ? null : window } = {}) {
  const done = { raised: false, moved: false, flashed: false };
  if (!element) return done;
  if (element.hidden) element.hidden = false;
  // To the front of its own layer. A <dialog> is already in the top layer and must not be moved.
  const parent = element.parentNode;
  if (parent && element.tagName !== 'DIALOG' && parent.lastElementChild !== element) { parent.append(element); done.raised = true; }
  // Back onto the screen: at least a strip of it must be inside the window, and it must have a size.
  const box = element.getBoundingClientRect?.();
  const wide = view?.innerWidth ?? 0, high = view?.innerHeight ?? 0, margin = 12;
  if (box && wide && high && element.tagName !== 'DIALOG') {
    const lost = box.width < 1 || box.height < 1 || box.right < margin * 4 || box.bottom < margin * 4 || box.left > wide - margin * 4 || box.top > high - margin * 4;
    if (lost) {
      element.style.left = `${Math.max(margin, Math.round((wide - (box.width || 264)) / 2))}px`;
      element.style.top = `${margin * 2}px`;
      element.style.right = 'auto'; element.style.bottom = 'auto'; element.style.transform = 'none';
      done.moved = true;
    }
  }
  // A flash the eye goes to. With "reduce motion" set it is one steady ring instead of a pulse.
  if (typeof element.animate === 'function') {
    const calm = view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const ring = '0 0 0 6px rgba(255, 214, 102, 0.95)', none = '0 0 0 0 rgba(255, 214, 102, 0)';
    element.animate(calm ? [{ boxShadow: ring }, { boxShadow: ring }, { boxShadow: none }] : [{ boxShadow: none }, { boxShadow: ring }, { boxShadow: none }],
      calm ? { duration: 1400 } : { duration: 380, iterations: 3 });
    done.flashed = true;
  }
  return done;
}
