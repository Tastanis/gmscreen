// The pop-up asked when a walk goes up a cliff: climb (and pay for it), or do not move.
// A cliff is a face steep enough to stop forced movement; see terrain-prototype's climbFace.

/**
 * The words on the pop-up: the fact and the cost, no reasons (Brandon, October 10, 2026: "I dont need an
 * explanation. just say like Climb railing cost 1."). Pure, so the wording is tested without a page.
 * `over` (a height) is a low barrier, a rail or fence one square high or less; with `onto`, a low object
 * that fills a square, which he climbs onto; `tall` is a thing set climbable that is more than a square high.
 * Otherwise it is a cliff, `squares` high. `cost` is the move's
 * cost as the ruler counts it. What is left this turn is said only when it is not enough.
 */
export function climbPromptText({ squares = 0, cost = 0, left = null, others = 0, over = null, onto = false, tall = false } = {}) {
  const lines = Number.isFinite(cost) && cost > 0 ? [`Cost ${cost}.`] : [];
  if (Number.isFinite(left) && Number.isFinite(cost) && cost > left) lines.push(`Only ${left} movement left.`);
  const title = over !== null ? (onto ? 'Climb onto it?' : tall ? 'Climb over it?' : 'Climb over railing?')
    : `Climb ${squares} ${squares === 1 ? 'square' : 'squares'}${others > 0 ? `, with ${others} more` : ''}?`;
  return { title, lines, yes: 'Climb', no: 'Don’t climb' };
}

let open = null;

/**
 * Ask once. Resolves true to climb, false to stay put. Enter climbs, Escape does not.
 * A second request while one is open is answered "no" rather than stacking pop-ups.
 */
export function askClimb(info, { documentRef = typeof document === 'undefined' ? null : document, anchor = null } = {}) {
  if (!documentRef || open) return Promise.resolve(false);
  const text = climbPromptText(info);
  return new Promise((resolve) => {
    const panel = documentRef.createElement('div');
    panel.className = 'vtt-climb-prompt';
    panel.dataset.climbPrompt = '';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Climbing');
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
    no.dataset.climbAnswer = 'no';
    yes.textContent = text.yes;
    yes.dataset.climbAnswer = 'yes';
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
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
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
    yes.focus?.();
  });
}
