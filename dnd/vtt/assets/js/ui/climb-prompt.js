// The pop-up asked when a walk goes up a cliff: climb (and pay for it), or do not move.
// A cliff is a face steep enough to stop forced movement; see terrain-prototype's climbFace.

/** The words on the pop-up. Pure, so the wording is tested without a page. */
export function climbPromptText({ name = 'Token', squares = 0, cost = 0, extra = 0, left = null, others = 0 } = {}) {
  const lines = [
    `${name} climbs ${squares} ${squares === 1 ? 'square' : 'squares'}${others > 0 ? `, and ${others} more ${others === 1 ? 'token climbs' : 'tokens climb'}` : ''}.`,
    `This move costs ${cost} (${extra} extra for the climb).`,
  ];
  if (Number.isFinite(left)) {
    lines.push(cost > left ? `Only ${left} movement left this turn.` : `${left} movement left this turn.`);
  }
  return { title: 'Climbing', lines, yes: 'Climb', no: 'Don’t climb' };
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
