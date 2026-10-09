// The pop-up asked when a push drives a creature into a wall it could break (the book's Hurling
// Through Objects). Nothing breaks unless the answer is yes. What would break, what it costs and
// where the creature would end up all come from the server (ForcedMovement::through), so the
// pop-up shows exactly what the move will do.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const list = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const distance = (a, b) => Math.max(Math.abs(a.column - b.column), Math.abs(a.row - b.row));

/** The words on the pop-up. Pure, so the wording is tested without a page. */
export function breakThroughText({ name = 'Token', offer, others = [] } = {}) {
  const lines = [];
  for (const [index, step] of (offer?.steps || []).entries()) {
    const parts = Object.entries(step.materials || {}), many = parts.some(([, squares]) => squares > 1);
    const what = `${many ? '' : 'a '}${list(parts.map(([material, squares]) => (squares > 1 ? `${plural(squares, 'square')} of ${material}` : material)))} wall`;
    lines.push(`${index ? 'Then' : `${name} hits`} ${what} with ${plural(step.left, 'square')} of the push left. Breaking it uses ${step.cost} and does ${step.damage} damage.`);
  }
  const on = offer ? distance(offer.destination, offer.stopped) : 0;
  let after = `Break through: ${offer?.breakDamage ?? 0} damage, then moves on ${plural(on, 'square')}.`;
  if (offer?.damage > 0) after += offer.collidedIds?.length ? ` Then hits ${list(others.length ? others : ['another creature'])}: ${offer.damage} more.` : ` Then slams into a wall: ${offer.damage} more.`;
  lines.push(after, `Stop at the wall: ${offer?.stopped?.damage ?? 0} damage.`);
  return { title: 'Break through?', lines, yes: 'Break through', no: 'Stop at the wall' };
}

/** Asks the server what this push would break. Null when it would break nothing, or on any failure. */
export async function forcedBreakOffer(sceneId, placementId, destination, { fetchRef = typeof fetch === 'undefined' ? null : fetch } = {}) {
  if (!fetchRef || !sceneId || !placementId || !destination) return null;
  try {
    const response = await fetchRef('/dnd/vtt/api/v2/forced-break.php', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId, placementId, destination: { column: destination.column, row: destination.row } }),
    });
    const data = await response.json();
    return response.ok && data.success && data.result?.steps?.length ? data.result : null;
  } catch { return null; }
}

let open = null;

/**
 * Ask once. Resolves true to break through, false to stop at the wall. Escape stops at the wall.
 * Enter does nothing: a wall is never broken by a stray key. A second request while one is open
 * is answered "no" rather than stacking pop-ups.
 */
export function askBreakThrough(info, { documentRef = typeof document === 'undefined' ? null : document, anchor = null } = {}) {
  if (!documentRef || open) return Promise.resolve(false);
  const text = breakThroughText(info);
  return new Promise((resolve) => {
    const panel = documentRef.createElement('div');
    panel.className = 'vtt-climb-prompt vtt-break-prompt';
    panel.dataset.breakPrompt = '';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Break through');
    const title = documentRef.createElement('strong');
    title.className = 'vtt-climb-prompt__title';
    title.textContent = text.title;
    panel.append(title);
    for (const line of text.lines) {
      const row = documentRef.createElement('p');
      row.textContent = line;
      panel.append(row);
    }
    const actions = documentRef.createElement('div');
    actions.className = 'vtt-climb-prompt__actions';
    const no = documentRef.createElement('button');
    const yes = documentRef.createElement('button');
    no.type = yes.type = 'button';
    no.textContent = text.no;
    no.dataset.breakAnswer = 'no';
    yes.textContent = text.yes;
    yes.dataset.breakAnswer = 'yes';
    yes.className = 'vtt-climb-prompt__yes';
    actions.append(no, yes);
    panel.append(actions);

    const finish = (answer) => {
      if (open !== panel) return;
      open = null;
      documentRef.removeEventListener('keydown', onKey, true);
      panel.remove();
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    };
    no.addEventListener('click', () => finish(false));
    yes.addEventListener('click', () => finish(true));
    documentRef.addEventListener('keydown', onKey, true);
    open = panel;
    documentRef.body.append(panel);

    // Beside the token when there is room, like the fall review.
    const bounds = anchor?.getBoundingClientRect?.();
    const box = panel.getBoundingClientRect?.();
    const view = documentRef.defaultView;
    if (bounds && box && view) {
      let left = bounds.right + 12;
      if (left + box.width > view.innerWidth - 12) left = bounds.left - box.width - 12;
      panel.style.left = `${Math.max(12, Math.min(view.innerWidth - box.width - 12, left))}px`;
      panel.style.top = `${Math.max(12, Math.min(view.innerHeight - box.height - 12, bounds.top))}px`;
      panel.style.transform = 'none';
    }
  });
}

/**
 * The whole question for one push that the browser has found ends at a wall: ask the server, then
 * the person. Resolves the server's offer when the answer is "break through", otherwise null (the
 * push is then made as the ordinary slam it already was).
 */
export async function offerBreakThrough({ sceneId, placement, intent, nameOf = () => '', anchor = null, ask = askBreakThrough, offerRef = forcedBreakOffer } = {}) {
  const offer = await offerRef(sceneId, placement?.id, intent);
  if (!offer) return null;
  const others = (offer.collidedIds || []).map((id) => nameOf(id)).filter(Boolean);
  return (await ask({ name: placement.name || 'Token', offer, others }, { anchor })) ? offer : null;
}
