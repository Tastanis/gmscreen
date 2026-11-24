import { CLASSES, STEPS, STATS, newDraft, evaluate, setPick, abilityText } from './rules.mjs';
import { buildSheet, vitals } from './build-sheet.mjs';

const $ = (selector) => document.querySelector(selector);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const storageKey = 'draw-steel.builder.v1.' + document.body.dataset.account;
let db,
  draft = newDraft(),
  step = 'Identity',
  model,
  status = '',
  storageProblem = false;
const filters = new Map();
const instructions = {
  Identity: 'Name your hero and choose a class and level.',
  Ancestry: 'Choose an ancestry, then spend its trait points. Open a rule to read what a trait does.',
  Background: 'Choose the community and career that shaped your hero. A complication is optional.',
  Training: 'Choose skills and languages from each source. Muted choices require a house rule.',
  Review: 'Check the grants and choices before downloading your new hero.',
};
const classInstructions = {
  conduit:
    'Choose a deity and two of its domains. Choose which domain feature you learn first at each tier, then select your prayer, ward, and abilities.',
  censor:
    'Choose your order, deity, domain, and kit. Your order grants its own ability choices at levels 2, 6, and 9.',
  elementalist:
    'Choose your specialization and the features earned at each level. Shared spells are available to every Elementalist.',
  fury: 'Choose your primordial aspect and kit. At levels 2, 6, and 9, choose one ability from your aspect.',
  null: 'Choose your tradition, augmentation, and abilities. At levels 2, 6, and 9, choose one ability from your tradition.',
  shadow: 'Choose a college and a kit. At levels 2, 6, and 9, choose one of your college’s two abilities.',
  tactician:
    'Choose a tactical doctrine and two kits. Both kits grant their signatures. Choose which bonus to use when the kits overlap.',
  talent:
    'Choose a tradition, one augmentation, one ward, and two different signatures. At levels 2, 6, and 9, choose one ability from your tradition.',
  troubadour:
    'Choose a class act, a kit, and one Troubadour signature. Your act grants performances or features and its own ability choices at levels 2, 6, and 9.',
};
function store() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ draft, step }));
    storageProblem = false;
  } catch {
    storageProblem = true;
  }
}
function load() {
  try {
    const old = JSON.parse(localStorage.getItem(storageKey));
    if (old?.draft?.version === 1 && old.draft.picks && old.draft.exceptions) {
      draft = old.draft;
      step = STEPS.includes(old.step) ? old.step : 'Identity';
    }
  } catch {
    storageProblem = true;
  }
}
function clean() {
  const result = evaluate(db, draft),
    picks = {},
    exceptions = {};
  for (const slot of result.slots) {
    if (slot.selected.length) picks[slot.key] = slot.selected;
    const accepted = slot.selected.filter((id) => slot.choices.find((o) => o.id === id)?.warning);
    if (accepted.length) exceptions[slot.key] = accepted;
  }
  draft.picks = picks;
  draft.exceptions = exceptions;
  if (!picks['troubadour-masterwork']) {
    delete draft.masterworkKitId;
    delete draft.masterworkName;
  }
}
const stepBtn = (s, text = s) =>
  `<button type="button" data-step="${esc(s)}"${step === s ? ' aria-current="step"' : ''}>${esc(text)}</button>`;
function classPicker() {
  return `<label>Class<select name="hero-class">${Object.entries(CLASSES)
    .map(
      ([id, c]) => `<option value="${id}" ${id === model.classId ? 'selected' : ''}>${esc(c.name)}</option>`,
    )
    .join('')}</select></label>`;
}
function identity() {
  return `<fieldset><legend>Hero</legend><label>Name<input name="hero-name" maxlength="90" autocomplete="off" value="${esc(draft.name)}"></label>
  ${classPicker()}<label>Level<select name="hero-level">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${draft.level === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label></fieldset>`;
}
function cultures() {
  return `<fieldset><legend>Culture</legend><label>Use a published culture<select name="culture-preset"><option value="">Build your own</option>${db.cultures.map((c) => `<option ${draft.preset === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
  <label>Culture name <small>(optional)</small><input name="culture-name" maxlength="100" value="${esc(draft.cultureName)}"></label></fieldset>`;
}
function card(o, slot) {
  const on = slot.selected.includes(o.id),
    full =
      slot.count !== 1 &&
      !on &&
      (slot.total + (slot.points ? o.cost : 1) > slot.count ||
        (o.family && slot.choices.some((v) => v.family === o.family && slot.selected.includes(v.id))));
  const meta = [
    o.summary,
    slot.points ? o.cost + ' pt' : '',
    o.warning ? 'House rule' : '',
    on ? 'Selected' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const query = (filters.get(slot.key) || '').trim().toLowerCase();
  return `<div class="choice${on ? ' marked' : ''}${o.warning ? ' soft' : ''}" data-term="${esc(o.name.toLowerCase())}" ${query && !o.name.toLowerCase().includes(query) ? 'hidden' : ''}>
    <button type="button" data-option="${esc(o.id)}" aria-pressed="${on}" ${full ? 'disabled' : ''}>${esc(o.name)}${meta ? '<small>' + esc(meta) + '</small>' : ''}</button>
    ${o.description || o.warning ? `<details><summary>Rule</summary><p>${esc([o.description, o.warning].filter(Boolean).join('\n'))}</p></details>` : ''}</div>`;
}
function field(slot) {
  const masterwork =
    slot.key === 'troubadour-masterwork' && slot.selected.length
      ? '<label>Name your masterwork<input name="masterwork-name" value="' +
        esc(draft.masterworkName || '') +
        '" placeholder="' +
        esc(model.actions.find((a) => a.id === slot.selected[0])?.name) +
        '"></label>'
      : '';
  const desc =
    slot.description && slot.description !== slot.title ? `<p class="hint">${esc(slot.description)}</p>` : '';
  return `<fieldset data-slot="${esc(slot.key)}"><legend>${esc(slot.title)}<small>${slot.total}/${slot.count}${slot.points ? ' pts' : ''}</small></legend>
    <p class="source">${esc(slot.source)}</p>${desc}${slot.choices.length > 14 ? `<label class="hint">Filter ${esc(slot.title.toLowerCase())}<input type="search" value="${esc(filters.get(slot.key) || '')}"></label>` : ''}
    <div class="choices">${slot.choices.map((o) => card(o, slot)).join('')}</div>${masterwork}${!slot.choices.length ? '<p>Complete the earlier choices to unlock this selection.</p>' : ''}</fieldset>`;
}
function review() {
  const boxes = [];
  if (model.errors.length)
    boxes.push(
      `<section class="review-box"><h3>Still to choose</h3><ul>${model.errors.map((e) => `<li>${stepBtn(e.step, e.message)}</li>`).join('')}</ul></section>`,
    );
  if (model.warnings.length)
    boxes.push(
      `<section class="review-box"><h3>Accepted house rules</h3><ul>${model.warnings.map((w) => '<li>' + esc(w.message) + '</li>').join('')}</ul></section>`,
    );
  for (const [name, items] of [
    [
      'Ancestry & background',
      [
        model.ancestry?.name,
        model.former?.name,
        ...Object.values(model.culture),
        model.career?.name,
        model.incident?.name,
        model.complication?.name,
      ],
    ],
    ['Skills', [...model.skills.keys()]],
    ['Languages', [...model.languages]],
  ]) {
    boxes.push(
      `<section class="review-box"><h3>${esc(name)}</h3><p>${esc(items.filter(Boolean).join(' · ') || '—')}</p></section>`,
    );
  }
  if (model.deity)
    boxes.push(
      '<section class="review-box"><h3>' +
        (model.classId === 'censor' ? 'Order, faith, and kit' : 'Deity and domains') +
        '</h3><p>' +
        [model.subclass?.name, model.deity.name, ...model.domains.map((d) => d.name), model.kit?.name]
          .filter(Boolean)
          .map(esc)
          .join(' · ') +
        '</p></section>',
    );
  const kitHeading = {
    fury: 'Aspect and kit',
    shadow: 'College and kit',
    tactician: 'Doctrine and Field Arsenal',
    troubadour: 'Class act and kit',
  }[model.classId];
  if (kitHeading)
    boxes.push(
      '<section class="review-box"><h3>' +
        kitHeading +
        '</h3><p>' +
        [model.classTrack, model.kit?.name].filter(Boolean).map(esc).join(' · ') +
        '</p></section>',
    );
  for (const [title, entries] of [
    ['Abilities', model.actions.map((a) => [a.name, abilityText(a)])],
    ['Features', model.grants.map((f) => [f.name, f.description])],
  ]) {
    const details = entries
      .map(
        ([name, rule]) => '<details><summary>' + esc(name) + '</summary><p>' + esc(rule) + '</p></details>',
      )
      .join('');
    boxes.push('<section class="review-box details-list"><h3>' + title + '</h3>' + details + '</section>');
  }
  return (
    boxes.join('') +
    `<button class="primary" type="button" data-save-character ${model.complete ? '' : 'disabled'}>Save to My Characters</button>
    <button type="button" data-download ${model.complete ? '' : 'disabled'}>Download hero JSON</button>
    <p class="hint block">Save a private character sheet to your account or download a copy.</p><button type="button" data-new>Start another hero</button>`
  );
}
function summary() {
  const v = vitals(model);
  $('#summary').innerHTML =
    `<div class="eyebrow">Hero</div><h3>${esc(draft.name || 'Unnamed hero')}</h3><p>${esc([model.ancestry?.name, model.classTrack, model.heroClass.name].filter(Boolean).join(' '))} · Level ${esc(draft.level)}</p>
  <dl>${[...STATS.map((k) => [k, model.stats[k]]), ['Stamina', v.staminaMax], ['Recoveries', v.recoveriesMax], ['Speed', v.speed]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="hint">${model.complete ? 'Ready to download' : model.errors.length + ' unfinished choices'}</p>
  <p class="hint">${storageProblem ? 'Browser storage is unavailable. Keep this window open.' : 'Draft saved in this browser.'}</p>`;
}
function draw() {
  model = evaluate(db, draft);
  $('#steps').innerHTML = STEPS.map((s) => stepBtn(s)).join('');
  const fields = model.slots
    .filter((s) => s.step === step)
    .map(
      (s) =>
        field(s) +
        (s.key.startsWith('incident-') && model.incident?.id === 'original'
          ? `<label>Your inciting incident<textarea name="incident">${esc(draft.incident)}</textarea></label>`
          : '') +
        (['censor-1-2', 'conduit-deity'].includes(s.key) && model.deity?.id === 'custom'
          ? `<label>Custom deity name<input name="deity-name" maxlength="100" value="${esc(draft.deityName)}"></label>`
          : ''),
    )
    .join('');
  const n = STEPS.indexOf(step);
  $('#main').innerHTML =
    `<h2>${step}</h2>${step === 'Class' ? classPicker() : ''}<p>${step === 'Class' ? classInstructions[model.classId] : instructions[step]}</p>${step === 'Identity' ? identity() : step === 'Background' ? cultures() : ''}${fields}${step === 'Review' ? review() : ''}
    <div class="controls">${n ? stepBtn(STEPS[n - 1], 'Back') : ''}${n < STEPS.length - 1 ? stepBtn(STEPS[n + 1], 'Next · ' + STEPS[n + 1]) : ''}</div><p class="status" role="status">${esc(status)}</p>`;
  summary();
}
function jump(s) {
  step = s;
  status = '';
  store();
  draw();
  window.scrollTo(0, 0);
  $('#main h2').setAttribute('tabindex', '-1');
  $('#main h2').focus({ preventScroll: true });
}
async function confirmException(text) {
  const d = $('#house');
  $('#house-text').textContent = text + ' This exception will appear on your hero’s review.';
  d.returnValue = 'cancel';
  const result = new Promise((resolve) =>
    d.addEventListener('close', () => resolve(d.returnValue === 'accept'), { once: true }),
  );
  d.showModal();
  return result;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !db) return;
  if (b.dataset.step) {
    jump(b.dataset.step);
    return;
  }
  if (b.hasAttribute('data-new')) {
    if (
      window.confirm(
        'Start a new hero and replace this browser draft? Download this hero first to keep a copy.',
      )
    ) {
      draft = newDraft();
      filters.clear();
      jump('Identity');
    }
    return;
  }
  if (b.hasAttribute('data-save-character')) {
    if (!model.complete || b.disabled) return;
    b.disabled = true;
    try {
      const response = await fetch('save.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Character-Token': document.body.dataset.libraryToken },
        body: JSON.stringify(buildSheet(db, draft)),
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw Error(result.error || 'Could not save your hero.');
      window.location.assign('library.php?id=' + encodeURIComponent(result.id));
    } catch (error) {
      status = error.message || 'Could not save your hero. Try again.';
      draw();
    }
    return;
  }
  if (b.hasAttribute('data-download')) {
    if (!model.complete) return;
    const a = document.createElement('a'),
      sheet = buildSheet(db, draft);
    const url = URL.createObjectURL(new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' }));
    a.href = url;
    a.download = (draft.name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') || model.classId) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status = 'Your hero file is ready.';
    draw();
    return;
  }
  if (!b.hasAttribute('data-option')) return;
  const key = b.closest('[data-slot]').dataset.slot,
    slot = model.slots.find((s) => s.key === key),
    id = b.dataset.option;
  const choice = slot.choices.find((o) => o.id === id);
  const needs = !slot.selected.includes(id) && choice.warning;
  if (needs && !(await confirmException(choice.name + ' · ' + choice.warning))) return;
  if (!setPick(draft, slot, id, Boolean(needs))) return;
  if (['environment', 'organization', 'upbringing'].includes(key) && draft.preset) {
    if (draft.cultureName === draft.preset) draft.cultureName = '';
    draft.preset = '';
  }
  const offset = b.getBoundingClientRect().top;
  clean();
  status = '';
  store();
  draw();
  const root = [...document.querySelectorAll('[data-slot]')].find((x) => x.dataset.slot === key);
  const next = [...(root?.querySelectorAll('[data-option]') || [])].find((x) => x.dataset.option === id);
  if (next) {
    next.focus({ preventScroll: true });
    window.scrollBy(0, next.getBoundingClientRect().top - offset);
  }
});
document.addEventListener('input', (e) => {
  const f = e.target;
  if (f.type === 'search') {
    const group = f.closest('[data-slot]');
    filters.set(group.dataset.slot, f.value);
    group.querySelectorAll('.choice').forEach((c) => {
      c.hidden = !c.dataset.term.includes(f.value.trim().toLowerCase());
    });
    return;
  }
  const property = {
    'hero-name': 'name',
    'masterwork-name': 'masterworkName',
    'culture-name': 'cultureName',
    'deity-name': 'deityName',
    incident: 'incident',
  }[f.name];
  if (property) {
    draft[property] = f.value;
    model = evaluate(db, draft);
    store();
    summary();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'hero-level') draft.level = Number(e.target.value);
  else if (e.target.name === 'hero-class') draft.classId = e.target.value;
  else if (e.target.name === 'culture-preset') {
    const culture = db.cultures.find((c) => c.name === e.target.value);
    draft.preset = culture?.name || '';
    draft.cultureName = draft.preset;
    if (culture) for (const k of ['environment', 'organization', 'upbringing']) draft.picks[k] = [culture[k]];
  } else return;
  clean();
  store();
  draw();
  if (e.target.name === 'hero-class') $('[name="hero-class"]').focus({ preventScroll: true });
});
try {
  const response = await fetch('rules.json?v=' + encodeURIComponent(document.body.dataset.build), {
    credentials: 'same-origin',
  });
  if (!response.ok) throw Error('Rules unavailable');
  db = await response.json();
  load();
  clean();
  store();
  draw();
} catch (err) {
  $('#main').textContent = 'The rulebook could not open. Reload the builder to try again.';
  console.error(err);
}
