import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { CLASSES, evaluate, newDraft } from '../../../../../character_sheet/builder/rules.mjs';

test('the Class step switches a saved Polder draft to each supported class', async (t) => {
  const builder = new URL('../../../../../character_sheet/builder/', import.meta.url);
  const rules = JSON.parse(readFileSync(new URL('rules.json', builder)));
  const dom = new JSDOM('<body data-account="test"><nav id="steps"></nav><main id="main"></main><aside id="summary"></aside></body>', {
    url: 'http://localhost/dnd/character_sheet/builder/',
  });
  const { document, localStorage } = dom.window;
  const globals = { window: dom.window, document, localStorage };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  t.after(() => dom.window.close());
  t.mock.method(dom.window, 'scrollTo', () => {});
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => rules }));

  const key = 'draw-steel.builder.v1.test';
  const draft = newDraft();
  draft.picks.ancestry = ['ancestry-polder'];
  localStorage.setItem(key, JSON.stringify({ draft, step: 'Class' }));
  await import(new URL('builder.mjs', builder));

  const picker = () => document.querySelector('select[name="hero-class"]');
  assert.ok(picker(), 'the Class step must display the class dropdown');
  assert.deepEqual(Array.from(picker().options, (o) => o.value), Object.keys(CLASSES));
  for (const [id, heroClass] of Object.entries(CLASSES)) {
    picker().value = id;
    picker().dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const saved = JSON.parse(localStorage.getItem(key));
    assert.equal(saved.draft.classId, id);
    assert.deepEqual(saved.draft.picks.ancestry, draft.picks.ancestry);
    assert.ok(document.querySelector('#summary').textContent.includes('Polder ' + heroClass.name));
    const slots = evaluate(rules, saved.draft).slots.filter((slot) => slot.step === 'Class');
    const fieldsets = document.querySelectorAll('#main [data-slot]');
    assert.deepEqual(Array.from(fieldsets, (f) => f.dataset.slot), slots.map((s) => s.key));
    for (const [i, field] of fieldsets.entries()) {
      const options = Array.from(field.querySelectorAll('[data-option]'), (o) => o.dataset.option);
      assert.deepEqual(options, slots[i].choices.map((o) => o.id));
    }
  }
  document.querySelector('#steps [data-step="Identity"]').click();
  assert.equal(picker().value, JSON.parse(localStorage.getItem(key)).draft.classId);
});
