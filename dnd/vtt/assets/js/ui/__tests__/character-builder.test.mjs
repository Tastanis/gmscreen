import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newDraft, evaluate, setPick } from '../../../../../character_sheet/builder/rules.mjs';
import { buildSheet } from '../../../../../character_sheet/builder/build-sheet.mjs';

const db = JSON.parse(
  readFileSync(new URL('../../../../../character_sheet/builder/rules.json', import.meta.url)),
);
function build({
  ancestry = 'Polder',
  specialization = 'Fire',
  level = 1,
  career = 'Agent',
  complication,
} = {}) {
  const draft = { ...newDraft(), name: 'Test hero', level };
  if (complication) delete draft.picks.complication;
  const known = {
    ancestry,
    subclass: specialization,
    career,
    complication,
    'elementalist-1-7': 'Enchantment of Celerity',
  };
  for (let i = 0; i < 160; i++) {
    const model = evaluate(db, draft);
    if (model.complete) return { draft, model, sheet: buildSheet(db, draft) };
    const slot = model.slots.find((s) => !s.complete);
    assert.ok(slot, JSON.stringify(model.errors));
    const choices = slot.choices.filter(
      (c) =>
        !c.warning &&
        !slot.selected.includes(c.id) &&
        (!c.family || !slot.choices.some((x) => x.family === c.family && slot.selected.includes(x.id))),
    );
    const candidate =
      choices.find((c) => c.name === known[slot.key]) ||
      choices.find((c) => !slot.points || c.cost <= slot.count - slot.total);
    assert.ok(candidate, slot.source + ' · ' + slot.title);
    assert.ok(setPick(draft, slot, candidate.id), slot.key + ' ' + candidate.name);
  }
  assert.fail('No completed build');
}
test('new builds include only earned class and specialization abilities, at every level', () => {
  for (const sub of db.elementalist.subclasses)
    for (let level = 1; level <= 10; level++) {
      const { model, sheet } = build({ specialization: sub.name, level });
      const byId = new Set(model.actions.map((a) => a.id));
      assert.equal(byId.size, model.actions.length);
      for (const s of db.elementalist.subclasses)
        for (const t of s.featuresByLevel)
          for (const f of t.features.filter((f) => f.kind === 'GrantAbility')) {
            assert.equal(byId.has(f.ability.id), s.id === sub.id && t.level <= level, f.ability.name);
          }
      const slots = model.slots.filter((s) => s.key.startsWith('elementalist') && s.title.includes('abilit'));
      const spellCount = slots.reduce((n, s) => n + s.selected.length, 0);
      assert.equal(spellCount, 4 + [2, 3, 5, 6, 8, 9].filter((l) => l <= level).length);
      assert.equal(sheet.hero.stats.reason, 2 + [4, 7, 10].filter((l) => l <= level).length);
      assert.equal(
        sheet.hero.vitals.staminaMax,
        18 + 6 * (level - 1) + (sub.name === 'Earth' && level >= 2 ? level * 3 : 0),
      );
      assert.equal(sheet.hero.vitals.recoveryValue, Math.floor(sheet.hero.vitals.staminaMax / 3));
      assert.equal(sheet.hero.vitals.size, '1S');
      assert.equal(sheet.actions.freeStrikes.length, 2);
      assert.ok(sheet.sidebar.skills.Magic);
      assert.ok(sheet.hero.resource.automation.rules.length);
      assert.equal(model.warnings.length, 0);
      for (const slot of slots)
        for (const o of slot.choices) {
          const a = db.elementalist.abilities.find((a) => a.id === o.id);
          assert.ok(a && (a.minLevel || 1) <= Number(slot.source.match(/\d+/)[0]), o.name);
        }
    }
});
test('every core ancestry and career can finish without an exception', () => {
  for (const ancestry of db.ancestries) assert.ok(build({ ancestry: ancestry.name }).model.complete);
  for (const career of db.careers) assert.ok(build({ career: career.name }).model.complete);
});
test('every published complication has a route to a finished hero', () => {
  for (const c of db.complications) assert.ok(build({ complication: c.name }).model.complete, c.name);
});
test('soft exceptions require consent, are recorded, and never unlock class abilities', () => {
  const { draft } = build();
  const skill = evaluate(db, draft).slots.find((s) => s.flexible && s.choices.some((o) => o.warning));
  draft.picks[skill.key] = [];
  const slot = evaluate(db, draft).slots.find((s) => s.key === skill.key),
    out = slot.choices.find((o) => o.warning);
  assert.equal(setPick(draft, slot, out.id), false);
  assert.equal(setPick(draft, slot, out.id, true), true);
  assert.ok(evaluate(db, draft).warnings.some((w) => w.value === out.id));
  delete draft.exceptions[slot.key];
  assert.ok(
    !evaluate(db, draft)
      .slots.find((s) => s.key === slot.key)
      .selected.includes(out.id),
  );
  const spell = evaluate(db, draft).slots.find((s) => s.title === 'Signature abilities');
  assert.equal(setPick(draft, spell, 'null-ability-1', true), false);
  draft.picks[spell.key] = ['null-ability-1'];
  assert.ok(!evaluate(db, draft).complete);
  assert.throws(() => buildSheet(db, draft));
});
test('changing specialization and lowering level drops stale grants and picks from the export', () => {
  const { draft } = build({ specialization: 'Earth', level: 10 });
  draft.level = 1;
  draft.picks.subclass = [db.elementalist.subclasses.find((s) => s.name === 'Void').id];
  const { grants, actions } = evaluate(db, draft);
  assert.ok(!grants.some((f) => f.source.startsWith('Earth ·') || f.id === 'elementalist-10-1'));
  assert.ok(actions.some((a) => a.name === 'A Shared Dislocation' || a.id.startsWith('elementalist-sub-4-')));
  assert.ok(!actions.some((a) => a.id.startsWith('elementalist-sub-1-')));
});

test('fixed Magic from two sources grants an unrestricted replacement, and budgets resist injected choices', () => {
  const { draft, model } = build({ career: 'Mage’s Apprentice' });
  const replacement = model.slots.find((s) => s.key.endsWith('-replace-Magic'));
  assert.ok(replacement.complete);
  assert.ok(replacement.choices.every((o) => !o.warning));
  const points = model.slots.find((s) => s.points);
  draft.picks[points.key] = points.choices.map((o) => o.id);
  const rebuilt = evaluate(db, draft).slots.find((s) => s.key === points.key);
  assert.equal(rebuilt.total, model.ancestry.ancestryPoints);
  assert.ok(rebuilt.selected.length < points.choices.length);
});
test('gear conditions, potency, free strikes and ward grants survive a standalone export', () => {
  const { draft } = build({ specialization: 'Fire', level: 4 });
  draft.picks['elementalist-1-7'] = ['elementalist-1-7a'];
  draft.picks['battle-armor'] = ['yes'];
  draft.picks['battle-weapon'] = ['yes'];
  const equipped = buildSheet(db, draft);
  assert.equal(equipped.hero.vitals.staminaMax, 42);
  assert.equal(equipped.hero.vitals.recoveryValue, 14);
  const strike = equipped.actions.freeStrikes[0].tests[0];
  assert.equal(
    Number(strike.tiers.low.damage),
    3 + Math.max(equipped.hero.stats.might, equipped.hero.stats.agility),
  );
  assert.ok(equipped.features.some((f) => f.title === 'Elementalist potency' && f.text.includes('Strong 3')));
  draft.picks['battle-armor'] = ['no'];
  draft.picks['battle-weapon'] = ['no'];
  const other = buildSheet(db, draft);
  assert.equal(other.hero.vitals.staminaMax, 36);
  assert.equal(
    Number(other.actions.freeStrikes[0].tests[0].tiers.low.damage),
    Number(strike.tiers.low.damage) - 1,
  );
});
