// The questions a walk is asked instead of being refused (Brandon, November 8, 2026: "every hard refusal becomes a
// question or a warning ... warn and ask, never block, for players as well"). Same look as the climb pop-up
// (climb-prompt.js), and the same taste: the fact, no reasons.
//   wall        "Wall in the way."            Move anyway / Cancel
//   door        "Door shut."                  Open and go / Go anyway / Cancel
//   locked door "Door locked."                Go anyway / Cancel
//   reach       "Not next to the door."      Open anyway / Cancel
//   fly         "Can't fly right now."        Fly anyway / Cancel
//   drop        "Drop of N squares."          Climb down / Fall / Cancel

/** The words and buttons for one question. Pure, so the wording is tested without a page. `names`: who it is about, when more than one. */
export function moveQuestionText({ kind = 'wall', names = [], locked = false, squares = 0, why = '' } = {}) {
  const who = names.length > 1 ? ` (${names.join(', ')})` : '';
  if (kind === 'door' && locked) return { title: `Door locked${who}.`, lines: [], answers: [['anyway', 'Go anyway'], ['cancel', 'Cancel']] };
  if (kind === 'door') return { title: `Door shut${who}.`, lines: [], answers: [['open', 'Open and go'], ['anyway', 'Go anyway'], ['cancel', 'Cancel']] };
  // Ending a grab is asked, not done unseen (Brandon, November 9, 2026). The suggested answer comes first (Enter takes it).
  if (kind === 'grab') { const end = ['end', 'End the grab'], keep = ['keep', 'Keep it']; return { title: why || 'End the grab?', lines: [], answers: squares === 0 ? [keep, end] : [end, keep] }; }
  if (kind === 'reach') return { title: 'Not next to the door.', lines: [], answers: [['anyway', 'Open anyway'], ['cancel', 'Cancel']] };
  if (kind === 'fly') return { title: `Can't fly right now${who}.`, lines: why ? [why] : [], answers: [['anyway', 'Fly anyway'], ['cancel', 'Cancel']] };
  if (kind === 'drop') return { title: `Drop of ${squares} ${squares === 1 ? 'square' : 'squares'}${who}.`, lines: [], answers: [['climb', 'Climb down'], ['fall', 'Fall'], ['cancel', 'Cancel']] };
  return { title: `Wall in the way${who}.`, lines: [], answers: [['anyway', 'Move anyway'], ['cancel', 'Cancel']] };
}

/** "Climb down how many squares?": a number from 1 to `max`, the whole drop to begin with. Resolves the number, or null. */
export function askClimbDownSquares({ max = 1 } = {}, { documentRef = typeof document === 'undefined' ? null : document, anchor = null } = {}) {
  if (!documentRef) return Promise.resolve(null);
  return inTurn(() => new Promise((resolve) => {
    const panel = documentRef.createElement('div');
    panel.className = 'vtt-climb-prompt vtt-move-question';
    panel.dataset.moveQuestion = 'climb-down';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Climb down');
    const title = documentRef.createElement('strong');
    title.className = 'vtt-climb-prompt__title';
    title.textContent = 'Climb down how many squares?';
    const input = documentRef.createElement('input');
    input.type = 'number'; input.min = '1'; input.max = String(max); input.step = '1'; input.value = String(max);
    input.dataset.climbDownSquares = '';
    input.style.cssText = 'width:5em;margin:6px 0';
    const note = documentRef.createElement('p');
    note.textContent = `All the way is ${max}. Fewer leaves it clinging to the wall.`;
    const actions = documentRef.createElement('div');
    actions.className = 'vtt-climb-prompt__actions';
    const cancel = documentRef.createElement('button'), go = documentRef.createElement('button');
    cancel.type = go.type = 'button'; cancel.textContent = 'Cancel'; go.textContent = 'Climb down'; go.className = 'vtt-climb-prompt__yes';
    const finish = (value) => { documentRef.removeEventListener('keydown', onKey, true); panel.remove(); resolve(value); };
    const read = () => { const n = Math.round(Number(input.value)); return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : max; };
    const onKey = (event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(read()); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
    };
    cancel.addEventListener('click', () => finish(null));
    go.addEventListener('click', () => finish(read()));
    actions.append(cancel, go);
    panel.append(title, input, note, actions);
    documentRef.addEventListener('keydown', onKey, true);
    documentRef.body.append(panel);
    const bounds = anchor?.getBoundingClientRect?.(), box = panel.getBoundingClientRect?.(), view = documentRef.defaultView;
    if (bounds && box && view) {
      let left = bounds.right + 12;
      if (left + box.width > view.innerWidth - 12) left = bounds.left - box.width - 12;
      panel.style.left = `${Math.max(12, Math.min(view.innerWidth - box.width - 12, left))}px`;
      panel.style.top = `${Math.max(12, Math.min(view.innerHeight - box.height - 12, bounds.top))}px`;
      panel.style.transform = 'none';
    }
    input.focus?.(); input.select?.();
  }));
}

// One question at a time: a second one waits its turn (it is never answered "no" for the mover). Shown at once when
// nothing else is asked.
let waiting = null;
function inTurn(show) {
  const asked = waiting ? waiting.then(show, show) : show();
  const done = () => { if (waiting === asked) waiting = null; };
  waiting = asked; asked.then(done, done);
  return asked;
}

/** Asks; resolves with the chosen answer's key ('cancel' on Escape). Enter takes the first answer. */
export function askMoveQuestion(info, { documentRef = typeof document === 'undefined' ? null : document, anchor = null } = {}) {
  if (!documentRef) return Promise.resolve('cancel');
  return inTurn(() => showQuestion(info, documentRef, anchor));
}

function showQuestion(info, documentRef, anchor) {
  const text = moveQuestionText(info);
  return new Promise((resolve) => {
    const panel = documentRef.createElement('div');
    panel.className = 'vtt-climb-prompt vtt-move-question';
    panel.dataset.moveQuestion = info?.kind || 'wall';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', text.title);
    const title = documentRef.createElement('strong');
    title.className = 'vtt-climb-prompt__title';
    title.textContent = text.title;
    panel.append(title);
    for (const line of text.lines) { const row = documentRef.createElement('p'); row.textContent = line; panel.append(row); }
    const actions = documentRef.createElement('div');
    actions.className = 'vtt-climb-prompt__actions';
    const finish = (answer) => { documentRef.removeEventListener('keydown', onKey, true); panel.remove(); resolve(answer); };
    const onKey = (event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(text.answers[0][0]); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish('cancel'); }
    };
    let firstButton = null;
    for (const [key, label] of text.answers) {
      const button = documentRef.createElement('button');
      button.type = 'button'; button.textContent = label; button.dataset.moveAnswer = key;
      if (key !== 'cancel' && !firstButton) { button.className = 'vtt-climb-prompt__yes'; firstButton = button; }
      button.addEventListener('click', () => finish(key));
      actions.append(button);
    }
    panel.append(actions);
    documentRef.addEventListener('keydown', onKey, true);
    documentRef.body.append(panel);
    const bounds = anchor?.getBoundingClientRect?.(), box = panel.getBoundingClientRect?.(), view = documentRef.defaultView;
    if (bounds && box && view) {
      let left = bounds.right + 12;
      if (left + box.width > view.innerWidth - 12) left = bounds.left - box.width - 12;
      panel.style.left = `${Math.max(12, Math.min(view.innerWidth - box.width - 12, left))}px`;
      panel.style.top = `${Math.max(12, Math.min(view.innerHeight - box.height - 12, bounds.top))}px`;
      panel.style.transform = 'none';
    }
    firstButton?.focus?.();
  });
}
