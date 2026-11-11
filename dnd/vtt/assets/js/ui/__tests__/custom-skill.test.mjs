import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { openSkillsEditor, customSkillName } from '../../../../../character_sheet/parts/sheet-editor.js';
import { groupSkills } from '../../../../../character_sheet/parts/sheet-parts.js';

// Brandon, November 10, 2026: "I need to be able to add custom skills on the pcs' so make a custom skill where if
// clicked you can type in the name of the skill and make it a skill." The Skills form of the sheet the Table opens.

test('a typed custom skill name: tidied, a book skill in any case is the book one, one the hero has is refused', () => {
  assert.deepEqual(customSkillName('  Basket   Weaving '), { name: 'Basket Weaving' });
  assert.deepEqual(customSkillName('read person'), { name: 'Read Person' });
  assert.deepEqual(customSkillName('juggling', ['Juggling']), { error: 'Already has it.' });
  assert.deepEqual(customSkillName('   '), { error: 'Type a name.' });
});

test('+ Custom skill opens a name box; Enter adds it; it saves and shows under Other', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  let saved = null;
  const sheet = { sidebar: { skills: { Hide: { level: 'Trained', bonus: '' } } } };
  openSkillsEditor({ sheet, doc, onSave: (result) => { saved = result; return true; } });
  assert.ok(doc.querySelector('[data-custom-box]').hidden, 'the box is shut until clicked');
  doc.querySelector('[data-custom-open]').click();
  assert.equal(doc.querySelector('[data-custom-box]').hidden, false);
  const name = doc.querySelector('[data-custom-name]');
  name.value = 'hide';
  name.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(doc.querySelector('[data-custom-hint]').textContent, 'Already has it.');
  doc.querySelector('[data-custom-name]').value = 'Juggling';
  doc.querySelector('[data-custom-add]').click();
  const rows = [...doc.querySelectorAll('[data-row="skill"]')].map((r) => r.dataset.skill);
  assert.deepEqual(rows, ['Hide', 'Juggling']);
  doc.querySelector('[data-row][data-skill="Juggling"] [data-f="bonus"]').value = '1';
  doc.querySelector('[data-go]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(saved?.sidebar?.skills, { Hide: { level: 'Trained', bonus: '' }, Juggling: { level: 'Trained', bonus: '1' } });
  assert.deepEqual(groupSkills(saved.sidebar.skills).map(([g]) => g), ['Intrigue', 'Other']);
  dom.window.close();
});
