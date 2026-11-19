import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newDraft, evaluate, setPick } from '../../../../../character_sheet/builder/rules.mjs';
import { buildSheet } from '../../../../../character_sheet/builder/build-sheet.mjs';
import { effectiveKit, mergeWithDefaults } from '../../../../../character_sheet/parts/sheet-model.js';
import {
  normalizeHeroicResourceAutomation,
  ruleMatchesHeroicResourceEvent,
} from '../heroic-resource-automation.js';

const db = JSON.parse(
  readFileSync(new URL('../../../../../character_sheet/builder/rules.json', import.meta.url)),
);
function build({
  ancestry = 'Polder',
  classId = 'elementalist',
  specialization = classId === 'null' ? 'Chronokinetic' : 'Fire',
  augmentation = 'Speed Augmentation',
  level = 1,
  career = 'Agent',
  complication,
  preferences = {},
  deityName = '',
} = {}) {
  const draft = { ...newDraft(), name: 'Test hero', classId, level, deityName };
  if (complication) delete draft.picks.complication;
  const known = {
    ancestry,
    subclass: specialization,
    career,
    complication,
    'elementalist-1-7': 'Enchantment of Celerity',
    'null-1-7': augmentation,
    ...preferences,
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
      choices.find((c) => [known[slot.key]].flat().includes(c.name)) ||
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

// The lists below come from the Heroes v1.01b Null chapter, independently of the builder catalog.
const sharedNull = [
  [
    1,
    'Signature abilities',
    [
      'Dance of Blows',
      'Faster Than the Eye',
      'Inertial Step',
      'Joint Lock',
      'Kinetic Strike',
      'Magnetic Strike',
      'Phase Inversion Strike',
      'Pressure Points',
    ],
  ],
  [1, '3-discipline ability', ['Chronal Spike', 'Psychic Pulse', 'Relentless Nemesis', 'Stunning Blow']],
  [1, '5-discipline ability', ['Arcane Disruptor', 'Impart Force', 'Phase Strike', 'A Squad Unto Myself']],
  [
    3,
    '7-discipline ability',
    ['Absorption Field', 'Molecular Rearrangement Field', 'Stabilizing Field', 'Synapse Field'],
  ],
  [5, '9-discipline ability', ['Anticipating Strike', 'Iron Grip', 'Phase Leap', 'Synaptic Reset']],
  [8, '11-discipline ability', ['Arcane Purge', 'Phase Hurl', 'Scalar Assault', 'Synaptic Anchor']],
];
const traditions = {
  Chronokinetic: [
    ['Blur', 'Force Redirected'],
    ['Interphase', 'Phase Step'],
    ['Arrestor Cycle', 'Time Loop'],
  ],
  Cryokinetic: [
    ['Entropic Field', 'Heat Sink'],
    ['Ice Pillars', 'Wall of Ice'],
    ['Absolute Zero', 'Heat Drain'],
  ],
  Metakinetic: [
    ['Gravitic Strike', 'Kinetic Shield'],
    ['Gravitic Charge', 'Iron Body'],
    ['Inertial Absorption', 'Realitas'],
  ],
};
const traditionLevels = [2, 6, 9];
const ids = (sheet) =>
  Object.values(sheet.actions)
    .flat()
    .map((a) => a.id);

test('Null offers the book’s exact shared and tradition lists, counts, costs and earned levels', () => {
  for (const [tradition, pairs] of Object.entries(traditions))
    for (let level = 1; level <= 10; level++) {
      const { draft, model, sheet } = build({ classId: 'null', specialization: tradition, level });
      const spells = model.slots.filter((s) => sharedNull.some(([, title]) => s.title === title));
      assert.equal(spells.length, sharedNull.filter(([at]) => at <= level).length);
      for (const [at, title, names] of sharedNull.filter(([at]) => at <= level)) {
        const slot = spells.find((s) => s.title === title);
        assert.deepEqual(slot.choices.map((c) => c.name).sort(), [...names].sort());
        assert.equal(slot.count, title === 'Signature abilities' ? 2 : 1);
        assert.equal(slot.flexible, false);
        assert.equal(slot.source, 'Null · Level ' + at);
      }
      const restricted = model.slots.filter((s) => s.title.endsWith('Tradition Ability'));
      assert.equal(restricted.length, traditionLevels.filter((at) => at <= level).length);
      for (const [index, slot] of restricted.entries()) {
        assert.equal(slot.count, 1);
        assert.equal(slot.source, tradition + ' · Level ' + traditionLevels[index]);
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), [...pairs[index]].sort());
        for (const id of slot.selected) {
          const a = Object.values(sheet.actions)
            .flat()
            .find((a) => a.id === id);
          assert.equal(a.cost, [5, 9, 11][index] + ' Discipline');
        }
      }
      const selectedTraditionAbilities = restricted.flatMap((slot) => slot.selected);
      assert.deepEqual(
        ids(sheet)
          .filter((id) => id.startsWith('null-sub-'))
          .sort(),
        selectedTraditionAbilities.sort(),
      );
      for (const slot of restricted) {
        const alternate = structuredClone(draft);
        const id = slot.choices.find((choice) => !slot.selected.includes(choice.id)).id;
        assert.ok(setPick(alternate, slot, id));
        const exported = ids(buildSheet(db, alternate));
        assert.ok(exported.includes(id));
        assert.ok(!exported.includes(slot.selected[0]));
      }
      const primary = 2 + [4, 7, 10].filter((l) => l <= level).length;
      assert.equal(sheet.hero.stats.agility, primary);
      assert.equal(sheet.hero.stats.intuition, primary);
      assert.equal(sheet.hero.vitals.staminaMax, 21 + 9 * (level - 1) + (level >= 9 ? 21 : 0));
      assert.equal(sheet.hero.vitals.speed, 5 + 1 + primary);
      assert.ok(model.grants.some((f) => f.name === 'Graceful Retreat'));
      assert.equal(sheet.hero.vitals.disengage, 1 + 1 + 1 + primary);
      assert.equal(sheet.hero.class, 'Null');
      assert.equal(sheet.hero.classTrack, tradition);
      assert.equal(sheet.hero.resource.title, 'Discipline');
      assert.ok(sheet.sidebar.skills.Psionics);
      assert.ok(
        sheet.features.some((f) => f.title === 'Null potency' && f.text.includes('Strong ' + primary)),
      );
      const mastery = sheet.features.filter((f) => /Mastery · (\d+) Discipline$/.test(f.title));
      assert.deepEqual(
        mastery.map((f) => Number(f.title.match(/(\d+) Discipline/)[1])),
        [2, 4, 6, ...[4, 7, 10].flatMap((at, i) => (at <= level ? [8 + i * 2] : []))],
      );
      assert.ok(!ids(sheet).some((id) => id.startsWith('elementalist')));
      const sig = spells[0],
        wrong = 'elementalist-ability-1';
      assert.equal(setPick(draft, sig, wrong, true), false);
      draft.picks[sig.key] = [wrong, wrong];
      draft.exceptions[sig.key] = [wrong];
      assert.throws(() => buildSheet(db, draft));
    }
});

test('Null tradition, class and level changes remove stale abilities, including in older browser drafts', () => {
  const { draft } = build({ classId: 'null', specialization: 'Metakinetic', level: 10 });
  const taken = evaluate(db, draft).slots.find((s) => s.title.endsWith('Tradition Ability')).selected[0];
  draft.picks.subclass = ['null-sub-2'];
  draft.level = 2;
  let r = evaluate(db, draft);
  const cryo = r.slots.find((s) => s.title.endsWith('Tradition Ability'));
  draft.picks[cryo.key] = [taken];
  draft.exceptions[cryo.key] = [taken];
  r = evaluate(db, draft);
  assert.ok(!r.complete);
  assert.equal(
    r.actions.some((a) => a.id === taken),
    false,
  );
  assert.equal(r.slots.find((s) => s.key === cryo.key).selected.length, 0);
  assert.ok(!r.grants.some((f) => f.name === 'Order'));
  draft.classId = 'elementalist';
  assert.ok(!evaluate(db, draft).actions.some((a) => a.id.startsWith('null-')));
  const legacy = build().draft;
  delete legacy.classId;
  assert.equal(buildSheet(db, legacy).hero.class, 'Elementalist');
  legacy.classId = 'invalid';
  assert.throws(() => buildSheet(db, legacy));
});
test('Null augmentations, resource rules and action costs are present in the portable sheet', () => {
  const { sheet, draft } = build({
    classId: 'null',
    specialization: 'Cryokinetic',
    augmentation: 'Density Augmentation',
    level: 10,
  });
  assert.equal(sheet.hero.vitals.stability, 1);
  assert.equal(sheet.hero.vitals.staminaMax, 21 + 81 + 21 + 24);
  assert.ok(sheet.sidebar.lists.immunity.includes('Cold 10'));
  const all = Object.values(sheet.actions).flat();
  const field = all.find((a) => a.name === 'Null Field'),
    shield = all.find((a) => a.name === 'Inertial Shield');
  assert.ok(field.description.includes('Enhanced Null Field'));
  assert.ok(field.automation.cards.length);
  assert.ok(shield.description.includes('Elemental Absorption'));
  assert.ok(shield.description.includes('Grab'));
  assert.ok(!shield.description.includes('Knockback'));
  const resource = sheet.hero.resource.automation.rules;
  assert.equal(resource.find((r) => r.event === 'actionUsed').filter.insideAura, 'Null Field');
  assert.equal(resource.find((r) => r.event === 'maliceSpent').limit.scope, 'round');
  assert.deepEqual(
    resource.find((r) => r.event === 'turnStart').effect.amount.amountByLevel.map((e) => e.amount),
    [2, 3, 4],
  );
  const r = evaluate(db, draft);
  for (const [title, name, label] of [
    ['9-discipline ability', 'Phase Leap', 'Move action'],
    ['11-discipline ability', 'Synaptic Anchor', 'Free triggered action'],
  ]) {
    const slot = r.slots.find((s) => s.title === title);
    draft.picks[slot.key] = [slot.choices.find((o) => o.name === name).id];
    assert.equal(
      Object.values(buildSheet(db, draft).actions)
        .flat()
        .find((a) => a.name === name).actionLabel,
      label,
    );
  }
  const force = build({ classId: 'null', augmentation: 'Force Augmentation' }).sheet;
  assert.equal(force.actions.mains.find((a) => a.name === 'Dance of Blows').tests[0].tiers.low.damage, '4');
});

const sharedCensor = [
  [
    1,
    'signature',
    ['Back Blasphemer!', 'Every Step … Death!', 'Halt Miscreant!', 'Your Allies Cannot Save You!'],
  ],
  [1, 3, ['Behold a Shield of Faith!', 'Driving Assault', 'The Gods Punish and Defend', 'Repent!']],
  [1, 5, ['Arrest', 'Behold the Face of Justice!', 'Censored', 'Purifying Fire']],
  [
    3,
    7,
    [
      'Edict of Disruptive Isolation',
      'Edict of Perfect Order',
      'Edict of Purifying Pacifism',
      'Edict of Stillness',
    ],
  ],
  [5, 9, ['Gods Grant Thee Strength', 'Orison of Victory', 'Righteous Judgment', 'Shield of the Righteous']],
  [8, 11, ['Excommunication', 'Hand of the Gods', 'Pillar of Holy Fire', 'Your Allies Turn on You!']],
];
const orders = {
  Exorcist: [
    'Read Person',
    ['It Is Justice You Fear', 'Revelator'],
    ['Begone!', 'Pain of Your Own Making'],
    ['Banish', 'Terror Manifest'],
  ],
  Oracle: [
    'Magic',
    ['Prescient Grace', 'With My Blessing'],
    ['Burden of Evil', 'Edict of Peace'],
    ['Blessing and a Curse', 'Fulfill Your Destiny'],
  ],
  Paragon: [
    'Lead',
    ['Blessing of the Faithful', 'Sentenced'],
    ['Congregation', 'Intercede'],
    ['Apostate', 'Edict of Unyielding Resolve'],
  ],
};
const censor = (level = 1, preferences = {}, specialization = 'Paragon') =>
  build({
    classId: 'censor',
    specialization,
    level,
    preferences: {
      'censor-1-2': 'Cavall',
      'censor-domain': 'War',
      'censor-1-5': 'Warrior Priest',
      ...preferences,
    },
  });
test('Censor enforces the printed common and order choices and Wrath progression at every level', () => {
  for (const [order, [skill, ...pairs]] of Object.entries(orders))
    for (let level = 1; level <= 10; level++) {
      const { model, sheet, draft } = censor(level, {}, order);
      const expected = sharedCensor.filter(([at]) => at <= level);
      const shared = model.slots.filter(
        (s) => s.title === 'Signature abilities' || s.title.endsWith('-wrath ability'),
      );
      assert.equal(shared.length, expected.length);
      const actionIds = ids(sheet);
      for (const [i, [at, cost, names]] of expected.entries()) {
        const slot = shared[i];
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
        assert.equal(slot.count, 1);
        assert.equal(slot.source, 'Censor · Level ' + at);
        assert.equal(model.actions.find((a) => a.id === slot.selected[0]).cost, cost);
      }
      const restricted = model.slots.filter((s) => s.title.endsWith(order + ' Ability'));
      assert.equal(restricted.length, [2, 6, 9].filter((l) => l <= level).length);
      assert.deepEqual(
        actionIds.filter((id) => id.startsWith('censor-sub-')).sort(),
        restricted.flatMap((s) => s.selected).sort(),
      );
      for (const [i, slot] of restricted.entries()) {
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), pairs[i].toSorted());
        assert.equal(slot.count, 1);
        assert.equal(slot.source, order + ' · Level ' + [2, 6, 9][i]);
        for (const choice of slot.choices) {
          const alternate = structuredClone(draft);
          alternate.picks[slot.key] = [choice.id];
          const a = Object.values(buildSheet(db, alternate).actions)
            .flat()
            .find((a) => a.id === choice.id);
          assert.equal(a.cost, [5, 9, 11][i] + ' Wrath');
        }
      }
      assert.equal(model.warnings.length, 0);
      assert.ok(sheet.sidebar.skills[skill]);
      assert.equal(sheet.hero.stats.might, sheet.hero.stats.presence);
      assert.equal(sheet.hero.stats.might, 2 + [4, 7, 10].filter((at) => level >= at).length);
      assert.equal(sheet.hero.vitals.staminaMax, 21 + (level - 1) * 9 + 9 * Math.ceil(level / 3));
      assert.equal(sheet.hero.vitals.recoveriesMax, 12);
      const rules = sheet.hero.resource.automation.rules;
      assert.equal(
        rules.find((r) => r.event === 'turnStart').effect.amount.amount,
        level >= 10 ? 4 : level >= 7 ? 3 : 2,
      );
      const dealt = rules.find((r) => r.event === 'damageDealt'),
        taken = rules.find((r) => r.event === 'damage');
      assert.equal(dealt.effect.amount.amount, level >= 4 ? 2 : 1);
      assert.equal(taken.effect.amount.amount, 1);
      assert.equal(dealt.filter.targetWhose, 'judgedTarget');
      assert.equal(taken.filter.sourceWhose, 'judgedTarget');
      assert.equal(dealt.limit.scope, 'round');
      assert.notEqual(taken.limit.key, dealt.limit.key);
      const judge = sheet.actions.maneuvers.find((a) => a.name === 'Judgment');
      assert.ok(
        judge.description.includes(
          { Oracle: 'deal holy damage equal', Paragon: 'vertical pull', Exorcist: 'closer to the judged' }[
            order
          ],
        ),
      );
      assert.equal(judge.automation.cards[1].effects[0].kind, 'applyMark');
    }
});
const domainFeatures = {
  Creation: ['Hands of the Maker', 'Improved Hands of the Maker', 'Divine Quartermaster'],
  Death: ['Grave Speech', 'Seance', 'Word of Death Deferred'],
  Fate: ['Oracular Visions', 'Oracular Warning', 'Word of Fate Denied'],
  Knowledge: ['Blessing of Comprehension', 'Saint’s Epiphany', 'Gods’ Library'],
  Life: ['Revitalizing Ritual', 'Blessing of Life', 'Font of Grace'],
  Love: ['Blessing of Compassion', 'Invocation of the Heart', 'Covenant of the Heart'],
  Nature: ['Faithful Friend', 'Wode Road', 'Nature’s Bounty'],
  Protection: ['Protective Circle', 'Impervious Touch', 'Blessing of Iron'],
  Storm: ['Blessing of Fortunate Weather', 'Windwalk', 'Ride the Lightning'],
  Sun: ['Inner Light', 'Light of Revelation', 'Light of the Burning Sun'],
  Trickery: ['Inspired Deception', 'Blessing of Secrets', 'Trinity of Trickery'],
  War: ['Sanctified Weapon', 'Improved Sanctified Weapon', 'Your Triumphs Are Remembered'],
};
test('only the chosen deity’s domain grants features at levels 1, 4 and 7; Templar and Virtue unlock at 10', () => {
  assert.equal(db.deities.length, 38);
  for (const [domain, titles] of Object.entries(domainFeatures)) {
    const deity = db.deities.find((d) => d.domains.includes(domain));
    for (const level of [1, 4, 7, 10]) {
      const { model, sheet } = censor(level, { 'censor-1-2': deity.name, 'censor-domain': domain });
      const exported = [
        ...sheet.features.map((f) => f.title),
        ...Object.values(sheet.actions)
          .flat()
          .map((a) => a.name),
      ];
      assert.deepEqual(
        model.slots
          .find((s) => s.key === 'censor-domain')
          .choices.map((o) => o.name)
          .sort(),
        deity.domains.toSorted(),
      );
      for (const [other, list] of Object.entries(domainFeatures))
        for (const [i, title] of list.entries())
          assert.equal(exported.includes(title), other === domain && level >= [1, 4, 7][i], title);
      assert.equal(exported.includes(domain + ' domain effect'), level === 10);
      if (domain === 'Sun' && level >= 7) assert.ok(sheet.sidebar.lists.immunity.includes('Fire ' + level));
      if (domain === 'Knowledge' && level >= 7) {
        const lore = db.skills.filter((s) => s.list === 'Lore');
        assert.ok(lore.every((s) => sheet.sidebar.skills[s.name]));
        const oldLore = lore.filter((s) => model.skills.get(s.name) !== 'Gods’ Library');
        assert.equal(model.slots.find((s) => s.key === 'censor-library-skills').count, oldLore.length);
      }
      if (domain === 'Trickery' && level >= 7)
        assert.equal(sheet.actions.maneuvers.find((a) => a.name === 'Trinity of Trickery').cost, '9 Wrath');
    }
  }
});
test('Censor exports all 21 kit signatures with published bonuses once; dual modes and area distance use the correct kit', () => {
  assert.equal(db.kits.length, 21);
  for (const kit of db.kits) {
    const { sheet } = censor(1, { 'censor-1-5': kit.name });
    assert.equal(sheet.hero.kit.name, kit.name);
    assert.deepEqual(
      ids(sheet).filter((id) => id.startsWith('kit-')),
      [kit.ability.id],
    );
    const record = Object.values(sheet.actions)
      .flat()
      .find((a) => a.id === kit.ability.id);
    for (const t of Object.values(record.tests[0].tiers)) assert.ok(t.damage || t.notes);
  }
  const { sheet } = censor(1, { 'censor-1-10': 'Purifying Fire' });
  const brand = sheet.actions.mains.find((a) => a.name === 'Weakening Brand');
  assert.deepEqual(
    Object.values(brand.tests[0].tiers).map((t) => t.damage),
    ['5', '7', '10'],
  );
  const fire = sheet.actions.mains.find((a) => a.name === 'Purifying Fire');
  assert.deepEqual(
    fire.tests.map((t) => t.tiers.low.damage),
    ['8', '7'],
  );
  assert.deepEqual(
    sheet.actions.freeStrikes.map((a) => a.tests[0].tiers.low.damage),
    ['5', '4'],
  );
  const reach = censor(1, { 'censor-1-5': 'Guisarmier' }).sheet;
  assert.equal(reach.actions.mains.find((a) => a.name === 'Back Blasphemer!').range, '2 Cube within 2');
  assert.equal(reach.actions.mains.find((a) => a.name === 'Forward Thrust, Backward Smash').range, 'Melee 2');
  assert.equal(reach.actions.maneuvers.find((a) => a.name === 'Judgment').range, 'Ranged 10');
});
test('stale, forged and cross-class selections cannot grant Censor abilities or domains', () => {
  const { draft, model } = censor(10);
  const order = model.slots.find((s) => s.title === '9th-Level Paragon Ability');
  for (const id of ['null-ability-1', 'elementalist-ability-1', 'censor-sub-1-9-1a', order.selected[0]]) {
    const slot = model.slots.find((s) => s.title === 'Signature abilities');
    draft.picks[slot.key] = [id];
    draft.exceptions[slot.key] = [id];
    assert.throws(() => buildSheet(db, draft));
    assert.deepEqual(evaluate(db, draft).slots.find((s) => s.key === slot.key).selected, []);
  }
  draft.level = 1;
  draft.picks['censor-1-2'] = ['Cyrvis'];
  assert.equal(evaluate(db, draft).domain, undefined);
  draft.picks['censor-1-2'] = ['custom'];
  draft.deityName = 'The Watcher';
  draft.picks['censor-portfolio'] = ['War', 'Life', 'Fate'];
  assert.equal(evaluate(db, draft).domain, undefined);
  draft.picks['censor-portfolio'].push('Sun');
  const custom = evaluate(db, draft);
  assert.equal(custom.deity.name, 'The Watcher');
  assert.equal(custom.domain.name, 'War');
  assert.ok(!custom.actions.some((a) => a.id === order.selected[0]));
  draft.classId = 'null';
  const changed = evaluate(db, draft);
  assert.equal(changed.kit, undefined);
  assert.equal(changed.deity, undefined);
  assert.ok(!changed.actions.some((a) => /^(censor|kit|domain)-/.test(a.id)));
});
test('all core ancestries finish a Censor and the native sheet reader preserves its kit, order and mark', () => {
  for (const ancestry of db.ancestries) {
    const { sheet } = build({ classId: 'censor', specialization: 'Oracle', ancestry: ancestry.name });
    const imported = mergeWithDefaults(JSON.parse(JSON.stringify(sheet)));
    assert.equal(effectiveKit(imported).values.name, sheet.hero.kit.name);
    assert.equal(imported.hero.classTrack, 'Oracle');
    assert.deepEqual(imported.hero.resource.automation, sheet.hero.resource.automation);
    assert.equal(
      imported.actions.maneuvers.find((a) => a.name === 'Judgment').automation.cards[1].effects[0].markType,
      'judgment',
    );
  }
  const { model } = censor(8, {
    'censor-1-2': 'Ord',
    'censor-domain': 'Knowledge',
    'censor-8-1': 'Eidetic Memory',
  });
  assert.ok(model.grants.some((f) => f.name === 'Eidetic Memory'));
  assert.equal(model.warnings.length, 0);
  assert.ok(!model.slots.some((s) => s.key === 'perk-eidetic-memory-skill'));
});

const conduitPools = [
  [
    1,
    'signature',
    [
      'Blessed Light',
      'Drain',
      'Holy Lash',
      'Lightfall',
      'Sacrificial Offer',
      'Staggering Curse',
      'Warrior’s Prayer',
      'Wither',
    ],
  ],
  [1, 3, ['Call the Thunder Down', 'Font of Wrath', 'Judgment’s Hammer', 'Violence Will Not Aid Thee']],
  [1, 5, ['Corruption’s Curse', 'Curse of Terror', 'Faith Is Our Armor', 'Sermon of Grace']],
  [3, 7, ['Fear of the Gods', 'Saint’s Raiment', 'Soul Siphon', 'Words of Wrath and Grace']],
  [5, 9, ['Beacon of Grace', 'Penance', 'Sanctuary', 'Vessel of Retribution']],
  [8, 11, ['Arise!', 'Blessing of Steel', 'Blessing of the Blade', 'Drag the Unworthy']],
];
// Published Conduit domain ability tables at levels 2, 6 and 9.
const conduitDomainAbilities = {
  Creation: ['Statue of Power', 'Gods’ Machine', 'Divine Dragon'],
  Death: ['Reap', 'Aura of Souls', 'Word of Final Redemption'],
  Fate: ['Blessing of Fate and Destiny', 'Your Story Ends Here', 'Bend Fate'],
  Knowledge: ['The Gods Command You Obey', 'Invocation of Undoing', 'Word of Weakening'],
  Life: ['Wellspring of Grace', 'Revitalizing Grace', 'Radiance of Grace'],
  Love: ['Our Hearts Your Strength', 'Lauded by God', 'Alacrity of the Heart'],
  Nature: ['Nature Judges Thee', 'Spirit Stampede', 'Thorn Cage'],
  Protection: ['Sacred Bond', 'Cuirass of the Gods', 'Blessing of the Fortress'],
  Storm: ['Saint’s Tempest', 'Lightning Lord', 'Godstorm'],
  Sun: ['Morning Light', 'Blessing of the Midday Sun', 'Solar Flare'],
  Trickery: ['Divine Comedy', 'Invocation of Mystery', 'Night Falls'],
  War: ['Blessing of Insight', 'Blade of the Heavens', 'Righteous Phalanx'],
};
const conduit = (level, preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'conduit',
    level,
    ancestry,
    deityName: 'The Witness',
    preferences: {
      'conduit-deity': 'Adûn',
      'conduit-domain': ['Life', 'Protection'],
      'conduit-perk-2': 'Expert Artisan',
      ...preferences,
    },
  });
test('Conduit shared ability pools, characteristics, Piety and native export follow every printed level', () => {
  for (let level = 1; level <= 10; level++) {
    const { draft, model, sheet } = conduit(level);
    assert.ok(model.complete && !model.warnings.length);
    for (const [at, cost, names] of conduitPools) {
      const slot = model.slots.find((s) => s.key === 'conduit-' + cost);
      assert.equal(!!slot, at <= level);
      if (!slot) continue;
      assert.equal(slot.count, cost === 'signature' ? 2 : 1);
      assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
      for (const id of slot.selected) assert.equal(model.actions.find((a) => a.id === id).cost, cost);
      assert.equal(setPick(draft, slot, 'elementalist-ability-1', true), false);
    }
    const actual = mergeWithDefaults(JSON.parse(JSON.stringify(sheet)));
    assert.equal(actual.hero.classTrack, 'Life and Protection');
    assert.equal(actual.hero.stats.intuition, 2 + [4, 7, 10].filter((at) => at <= level).length);
    assert.equal(actual.hero.vitals.staminaMax, 18 + (level - 1) * 6);
    assert.equal(actual.hero.vitals.recoveriesMax, 8);
    assert.equal(
      actual.actions.freeStrikes.find((a) => a.name === 'Ray of Wrath').tests[0].tiers.low.damage,
      String(2 + actual.hero.stats.intuition + 1),
    ); // Prayer of Destruction
    const rules = actual.hero.resource.automation.rules;
    assert.deepEqual(rules.find((r) => r.event === 'turnStart').effect.amount, {
      dice: '1d3',
      bonus: level >= 7 ? 1 : 0,
    });
    assert.equal(rules.find((r) => r.event === 'combatStart').effect.amount.from, 'victories');
    assert.equal(actual.sidebar.resource.text.includes('additional Piety whenever you pray'), level === 10);
    assert.ok(!ids(actual).some((id) => /^(censor|null|elementalist|kit)-/.test(id)));
  }
});
test('every Conduit domain pair grants only its earned features and offers exactly its two domain abilities per tier', () => {
  const all = Object.keys(conduitDomainAbilities);
  for (const [i, first] of all.entries())
    for (const second of all.slice(i + 1)) {
      const pair = [first, second],
        portfolio = [...pair, ...all.filter((s) => !pair.includes(s)).slice(0, 2)];
      const { draft, sheet } = conduit(10, {
        'conduit-deity': 'Custom deity (Director-approved)',
        'conduit-portfolio': portfolio,
        'conduit-domain': pair,
        'conduit-feature-1': second,
        'conduit-feature-4': first,
        'conduit-feature-7': second,
      });
      for (const level of [1, 2, 4, 5, 6, 7, 8, 9, 10]) {
        const model = evaluate(db, { ...draft, level });
        for (const [j, at] of [2, 6, 9].entries()) {
          const slot = model.slots.find((s) => s.key === 'conduit-domain-ability-' + at);
          assert.equal(!!slot, level >= at);
          if (!slot) continue;
          assert.deepEqual(
            slot.choices.map((o) => o.name).sort(),
            pair.map((d) => conduitDomainAbilities[d][j]).sort(),
          );
          assert.equal(slot.count, 1);
          assert.equal(slot.flexible, false);
          assert.equal(model.actions.find((a) => a.id === slot.selected[0]).cost, [5, 9, 11][j]);
        }
        const named = new Set([...model.grants.map((f) => f.name), ...model.actions.map((a) => a.name)]);
        for (const [d, titles] of Object.entries(domainFeatures))
          for (const [j, title] of titles.entries()) {
            const at = [1, 4, 7][j],
              takeFirst = j === 1 ? first : second;
            const expected = pair.includes(d) && level >= at + (d === takeFirst ? 0 : 1);
            assert.equal(
              named.has(title === 'Ride the Lightning' ? 'Thunderstruck' : title),
              expected,
              d + ' ' + title + ' at ' + level,
            );
          }
      }
      assert.equal(sheet.hero.resource.title, 'Piety');
      const middle = evaluate(db, draft).slots.find((s) => s.key === 'conduit-domain-ability-6');
      draft.picks[middle.key] = [middle.choices.find((o) => !middle.selected.includes(o.id)).id];
      const changed = buildSheet(db, draft);
      assert.ok(ids(changed).includes(draft.picks[middle.key][0]));
      assert.ok(!ids(changed).includes(middle.selected[0]));
    }
});
test('Conduit rejects out-of-portfolio, duplicate and stale choices even in an edited browser draft', () => {
  const { draft, model } = conduit(10);
  const slot = model.slots.find((s) => s.key === 'conduit-domain');
  assert.deepEqual(slot.choices.map((o) => o.name).sort(), ['Creation', 'Life', 'Love', 'Protection']);
  draft.picks[slot.key] = ['domain-sun', 'domain-sun'];
  draft.exceptions[slot.key] = ['domain-sun'];
  assert.equal(evaluate(db, draft).domains.length, 0);
  assert.throws(() => buildSheet(db, draft));
  draft.picks[slot.key] = ['domain-life', 'domain-life'];
  assert.equal(evaluate(db, draft).domains.length, 1);
  draft.picks[slot.key] = ['domain-love', 'domain-creation'];
  const changed = evaluate(db, draft);
  assert.ok(!changed.actions.some((a) => a.name === 'Wellspring of Grace'));
  assert.equal(changed.slots.find((s) => s.key === 'conduit-domain-ability-2').selected.length, 0);
  draft.picks['conduit-domain-ability-2'] = ['conduit-curse-of-terror']; // Same cost, different pool.
  assert.throws(() => buildSheet(db, draft));
  draft.classId = 'censor';
  assert.ok(!evaluate(db, draft).actions.some((a) => a.id.startsWith('conduit-')));
});
test('Conduit prayers, ward, immunity and domain Piety bonuses apply once and respect their limits', () => {
  const { draft, model } = conduit(10, {
    'conduit-deity': 'Salorna',
    'conduit-domain': ['Nature', 'Sun'],
    'conduit-prayer': 'Prayer of Steel',
    'conduit-saint-immunity': 'Holy immunity',
  });
  const prayer = model.slots.find((s) => s.key === 'conduit-prayer');
  assert.equal(prayer.count, 3);
  assert.ok(prayer.complete);
  draft.picks[prayer.key] = [
    'conduit-prayer-of-steel',
    'conduit-prayer-of-speed',
    'conduit-prayer-of-distance',
    'conduit-prayer-of-destruction',
  ];
  const sheet = buildSheet(db, draft);
  assert.equal(sheet.hero.vitals.staminaMax, 18 + 9 * 6 + 24);
  assert.equal(sheet.hero.vitals.stability, 1);
  assert.equal(sheet.hero.vitals.save, 5);
  assert.ok(sheet.sidebar.lists.immunity.includes('Holy 10'));
  assert.ok(sheet.sidebar.lists.immunity.includes('Fire 10'));
  assert.equal(sheet.actions.maneuvers.find((a) => a.name === 'Healing Grace').range, 'Ranged 12');
  assert.equal(sheet.actions.mains.find((a) => a.name === 'Ray of Wrath').tests[0].tiers.low.damage, '7');
  const rules = sheet.hero.resource.automation.rules.filter((r) => r.event === 'damage');
  assert.equal(rules.find((r) => r.id.endsWith('domain-nature')).filter.whose, undefined);
  assert.equal(rules.find((r) => r.id.endsWith('domain-sun')).filter.whose, 'enemy');
  assert.ok(rules.every((r) => r.effect.amount.amount === 3 && r.limit.scope === 'encounter'));
  draft.level = 9;
  assert.equal(evaluate(db, draft).slots.find((s) => s.key === prayer.key).selected.length, 1);
  const soldier = conduit(4, { 'conduit-prayer': 'Prayer of Soldier’s Skill' });
  assert.equal(soldier.sheet.hero.kit.armor, 'Light armor');
  soldier.draft.picks['conduit-gear-armor'] = ['no'];
  soldier.draft.picks['conduit-gear-weapon'] = ['no'];
  const unarmored = buildSheet(db, soldier.draft);
  assert.equal(soldier.sheet.hero.vitals.staminaMax - unarmored.hero.vitals.staminaMax, 6);
  assert.equal(
    Number(soldier.sheet.actions.freeStrikes[0].tests[0].tiers.low.damage) -
      Number(unarmored.actions.freeStrikes[0].tests[0].tiers.low.damage),
    1,
  );
  for (const ancestry of db.ancestries) assert.ok(conduit(1, {}, ancestry.name).model.complete);
});

const furyPools = [
  [1, 'signature', ['Brutal Slam', 'Hit and Run', 'Impaled!', 'To the Death!']],
  [1, 3, ['Back!', 'Out of the Way!', 'Tide of Death', 'Your Entrails Are Your Extrails!']],
  [1, 5, ['Blood for Blood!', 'Make Peace With Your God!', 'Thunder Roar', 'To the Uttermost End']],
  [3, 7, ['Demon Unleashed', 'Face the Storm!', 'Steelbreaker', 'You Are Already Dead']],
  [5, 9, ['Debilitating Strike', 'My Turn!', 'Rebounding Storm', 'To Stone!']],
  [8, 11, ['Elemental Ferocity', 'Overkill', 'Primordial Rage', 'Relentless Death']],
];
const furyAspects = {
  Berserker: {
    skill: 'Lift',
    trigger: 'Lines of Force',
    abilities: [
      ['Special Delivery', 'Wrecking Ball'],
      ['Avalanche Impact', 'Force of Storms'],
      ['Death Comes for You All!', 'Primordial Vortex'],
    ],
  },
  Reaver: {
    skill: 'Hide',
    trigger: 'Unearthly Reflexes',
    abilities: [
      ['Death … Death!', 'Phalanx-Breaker'],
      ['Death Strike', 'Seek and Destroy'],
      ['Primordial Bane', 'Shower of Blood'],
    ],
  },
  Stormwight: {
    skill: 'Track',
    trigger: 'Furious Change',
    abilities: [
      ['Apex Predator', 'Visceral Roar'],
      ['Pounce', 'Riders on the Storm'],
      ['Death Rattle', 'Deluge'],
    ],
  },
};
const fury = (specialization, level, preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'fury',
    specialization,
    level,
    ancestry,
    preferences: {
      'polder-feature-3': ['Fearless', 'Nimblestep'],
      'fury-perk-2': 'Expert Artisan',
      ...preferences,
    },
  });

test('Fury offers each published shared and aspect pool only at its earned level, and every choice exports', () => {
  for (const [aspect, { abilities, trigger, skill }] of Object.entries(furyAspects)) {
    const { draft } = fury(aspect, 10);
    for (let level = 1; level <= 10; level++) {
      draft.level = level;
      const model = evaluate(db, draft),
        sheet = buildSheet(db, draft);
      assert.ok(model.complete && !model.warnings.length);
      assert.equal(sheet.hero.classTrack, aspect);
      assert.ok(sheet.sidebar.skills[skill] && sheet.sidebar.skills.Nature);
      assert.deepEqual(
        sheet.actions.triggers
          .filter((a) => Object.values(furyAspects).some((s) => s.trigger === a.name))
          .map((a) => a.name),
        [trigger],
      );
      const pools = [
        ...furyPools.map(([at, cost, names]) => [at, cost, 'fury-ability-' + cost, names]),
        ...abilities.map((names, i) => [
          [2, 6, 9][i],
          [5, 9, 11][i],
          'fury-' + aspect.toLowerCase() + '-ability-' + [2, 6, 9][i],
          names,
        ]),
      ];
      for (const [at, cost, key, names] of pools) {
        const slot = model.slots.find((s) => s.key === key);
        assert.equal(!!slot, level >= at, key);
        if (!slot) continue;
        assert.equal(slot.count, 1);
        assert.equal(slot.flexible, false);
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
        if (at !== level) continue;
        for (const option of slot.choices) {
          const alternate = structuredClone(draft);
          alternate.picks[key] = [option.id];
          const cards = Object.values(buildSheet(db, alternate).actions)
            .flat()
            .filter((a) => names.includes(a.name));
          assert.deepEqual(
            cards.map((a) => [a.name, a.cost]),
            [[option.name, cost === 'signature' ? '' : cost + ' Ferocity']],
          );
        }
      }
      const stat = 2 + [4, 7, 10].filter((n) => n <= level).length;
      const v = sheet.hero.vitals,
        kit = model.kit;
      assert.equal(sheet.hero.stats.might, stat);
      assert.equal(sheet.hero.stats.agility, stat);
      assert.equal(v.staminaMax, 21 + 9 * (level - 1) + kit.stamina * Math.ceil(level / 3));
      assert.equal(v.recoveriesMax, 10);
      assert.equal(v.stability, kit.stability + (aspect === 'Berserker' && level >= 3 ? stat : 0));
      assert.equal(v.speed, 5 + kit.speed + (aspect === 'Reaver' && level >= 2 ? stat : 0));
      assert.equal(v.disengage, 1 + kit.disengage + (aspect === 'Reaver' && level >= 8 ? stat : 0));
      if (aspect !== 'Stormwight') {
        assert.equal(sheet.sidebar.lists.immunity.length, level >= 7 ? 7 : 0);
        if (level >= 7)
          for (const type of ['Acid', 'Cold', 'Corruption', 'Fire', 'Lightning', 'Poison', 'Sonic'])
            assert.ok(sheet.sidebar.lists.immunity.includes(type + ' ' + stat * (level === 10 ? 2 : 1)));
      }
      const owner = aspect === 'Stormwight' ? kit.name : aspect;
      for (const [i, n] of [2, 4, 6, 8, 10, 12].entries()) {
        assert.equal(
          model.grants.some((g) => g.name === owner + ' · ' + n + ' Ferocity'),
          level >= [1, 1, 1, 4, 7, 10][i],
        );
      }
      const rules = sheet.hero.resource.automation.rules;
      assert.deepEqual(rules.find((r) => r.event === 'turnStart').effect.amount, {
        dice: '1d3',
        bonus: level >= 7 ? 1 : 0,
      });
      const firstHit = rules.find((r) => r.event === 'damage');
      assert.equal(firstHit.effect.amount.amount, level >= 10 ? 3 : level >= 4 ? 2 : 1);
      assert.deepEqual(firstHit.filter, { whose: 'self', minAmount: 1 });
      assert.equal(firstHit.limit.scope, 'round');
      assert.deepEqual(
        rules.find((r) => r.event === 'winded').limit,
        rules.find((r) => r.event === 'dying').limit,
      );
      assert.equal(rules.find((r) => r.event === 'winded').limit.scope, 'encounter');
      assert.equal(rules.find((r) => r.event === 'combatStart').effect.amount.from, 'victories');
      assert.equal(rules.find((r) => r.event === 'combatEnd').effect.amount.amount, 0);
      assert.equal(new Set(ids(sheet)).size, ids(sheet).length);
    }
  }
});

test('each Stormwight kit supplies its own form rules, signature, Ferocity benefits and primordial damage', () => {
  const { draft } = fury('Stormwight', 10, {
    'fury-stormwight-ability-2': 'Visceral Roar',
    'fury-stormwight-ability-6': 'Riders on the Storm',
    'fury-stormwight-ability-9': 'Deluge',
    'fury-ability-5': 'Make Peace With Your God!',
    'fury-ability-9': 'My Turn!',
  });
  const kits = [
    ['Boren', 'Bear', 'Bear Claws', 'cold', 9, 0, 2, 0, 4],
    ['Corven', 'Crow', 'Wing Buffet', 'fire', 3, 3, 0, 1, 2],
    ['Raden', 'Rat', 'Driving Pounce', 'corruption', 3, 3, 0, 1, 2],
    ['Vuken', 'Wolf', 'Unbalancing Attack', 'lightning', 9, 2, 0, 1, 2],
  ];
  const kitSlot = evaluate(db, draft).slots.find((s) => s.key === 'fury-stormwight-kit');
  assert.deepEqual(
    kitSlot.choices.map((c) => c.name),
    kits.map(([k]) => k),
  );
  for (const [kit, animal, signature, type, stamina, speed, stability, disengage, highBonus] of kits) {
    draft.picks[kitSlot.key] = [kitSlot.choices.find((c) => c.name === kit).id];
    for (const level of [1, 4, 7, 10]) {
      const at = { ...draft, level };
      const model = evaluate(db, at),
        sheet = mergeWithDefaults(JSON.parse(JSON.stringify(buildSheet(db, at))));
      assert.equal(effectiveKit(sheet).values.name, kit);
      assert.equal(sheet.hero.resource.title, 'Ferocity');
      const v = sheet.hero.vitals;
      assert.equal(v.size, '1S');
      assert.equal(v.speed, 5 + speed);
      assert.equal(v.stability, stability);
      assert.equal(v.disengage, 1 + disengage);
      assert.equal(v.staminaMax, 21 + 9 * (level - 1) + Math.ceil(level / 3) * stamina);
      const might = sheet.hero.stats.might;
      assert.deepEqual(
        sheet.sidebar.lists.immunity,
        level >= 7 ? [type[0].toUpperCase() + type.slice(1) + ' ' + (level === 10 ? 3 : 2) * might] : [],
      );
      const shape = sheet.actions.maneuvers.find((a) => a.name === 'Aspect of the Wild');
      assert.ok(shape.description.includes('Animal Form: ' + animal));
      assert.equal(shape.description.includes('At 4th level'), level >= 4);
      if (animal === 'Crow' || animal === 'Rat') assert.match(shape.description, /can’t use any abilities/);
      for (const [name] of kits)
        assert.equal(
          model.grants.some((g) => g.name === name + ' · 2 Ferocity'),
          name === kit,
        );
      assert.deepEqual(
        sheet.actions.mains.filter((a) => kits.some((k) => k[2] === a.name)).map((a) => a.name),
        [signature],
      );
      assert.equal(Number(sheet.actions.freeStrikes[0].tests[0].tiers.high.damage), 7 + might + highBonus);
      if (kit === 'Boren')
        assert.equal(
          Number(sheet.actions.mains.find((a) => a.name === signature).tests[0].tiers.high.damage),
          11 + might,
        );
      if (level >= 2)
        assert.equal(
          sheet.actions.mains.find((a) => a.name === 'Visceral Roar').tests[0].tiers.low.damageType,
          type,
        );
      if (level >= 6)
        assert.ok(
          sheet.actions.maneuvers
            .find((a) => a.name === 'Riders on the Storm')
            .description.includes('primordial damage type is ' + type),
        );
      if (level >= 9)
        assert.equal(
          sheet.actions.mains.find((a) => a.name === 'Deluge').tests[0].tiers.high.damageType,
          type,
        );
      assert.equal(
        sheet.actions.maneuvers.find((a) => a.name === 'Make Peace With Your God!').actionLabel,
        'Free maneuver',
      );
      if (level >= 5)
        assert.equal(
          sheet.actions.triggers.find((a) => a.name === 'My Turn!').actionLabel,
          'Free triggered action',
        );
    }
  }
  const lastSlot = evaluate(db, draft).slots.find((s) => s.key === 'fury-stormwight-ability-9');
  draft.picks[lastSlot.key] = [lastSlot.choices.find((c) => c.name === 'Death Rattle').id];
  assert.equal(
    buildSheet(db, draft).actions.mains.find((a) => a.name === 'Death Rattle').tests[0].tiers.low.damageType,
    'psychic',
  );
});

test('Fury drafts reject foreign and stale picks even with exceptions, and every core ancestry can finish', () => {
  for (const ancestry of db.ancestries) assert.ok(fury('Reaver', 1, {}, ancestry.name).model.complete);
  const { draft, model } = fury('Berserker', 10);
  const gear = model.slots.find((s) => s.key === 'fury-standard-kit');
  assert.deepEqual(gear.choices.map((o) => o.id).sort(), db.kits.map((k) => k.id).sort());
  const signature = model.slots.find((s) => s.key === 'fury-ability-signature');
  const aspect = model.slots.find((s) => s.key === 'fury-berserker-ability-2');
  for (const [slot, id] of [
    [signature, 'null-ability-1'],
    [aspect, 'fury-visceral-roar'],
    [aspect, 'fury-thunder-roar'],
    [gear, 'kit-boren'],
  ]) {
    const edited = structuredClone(draft);
    assert.equal(setPick(edited, slot, id, true), false);
    edited.picks[slot.key] = [id];
    edited.exceptions[slot.key] = [id];
    assert.deepEqual(evaluate(db, edited).slots.find((s) => s.key === slot.key).selected, []);
    assert.throws(() => buildSheet(db, edited));
  }
  draft.picks.subclass = ['fury-stormwight'];
  draft.level = 1;
  const changed = evaluate(db, draft);
  assert.equal(changed.kit, undefined);
  assert.ok(
    !changed.actions.some(
      (a) =>
        a.name === 'Lines of Force' ||
        a.name === 'Special Delivery' ||
        a.cost >= 7 ||
        a.id === model.kit.ability.id,
    ),
  );
  assert.ok(!changed.grants.some((g) => g.id.startsWith('fury-berserker-')));
  draft.picks['fury-stormwight-kit'] = [model.kit.id];
  assert.throws(() => buildSheet(db, draft));
  draft.classId = 'elementalist';
  assert.ok(!evaluate(db, draft).actions.some((a) => a.id.startsWith('fury-')));
});

const shadowPools = [
  [
    1,
    'signature',
    ['Gasping in Pain', 'I Work Better Alone', 'Teamwork Has Its Place', 'You Were Watching the Wrong One'],
  ],
  [1, 3, ['Disorienting Strike', 'Eviscerate', 'Get In Get Out', 'Two Throats at Once']],
  [1, 5, ['Coup de Grace', 'One Hundred Throats', 'Setup', 'Shadowstrike']],
  [3, 7, ['Dancer', 'Misdirecting Strike', 'Pinning Shot', 'Staggering Blow']],
  [5, 9, ['Blackout', 'Into the Shadows', 'Shadowfall', 'You Talk Too Much']],
  [8, 11, ['Assassinate', 'Shadowgrasp', 'Speed of Shadows', 'They Always Line Up']],
];
const shadowColleges = {
  'College of Black Ash': {
    id: 'black-ash',
    skill: 'Magic',
    maneuver: 'Black Ash Teleport',
    reaction: 'In All This Confusion',
    features: [
      [2, 'Burning Ash'],
      [5, 'Trail of Cinders'],
      [8, 'Cinder Step'],
    ],
    pairs: [
      ['In a Puff of Ash', 'Too Slow'],
      ['Black Ash Eruption', 'Cinderstorm'],
      ['Cacophony of Cinders', 'Demon Door'],
    ],
  },
  'College of Caustic Alchemy': {
    id: 'caustic-alchemy',
    skill: 'Alchemy',
    maneuver: 'Coat the Blade',
    reaction: 'Defensive Roll',
    features: [
      [1, 'Smoke Bomb'],
      [2, 'Trained Assassin'],
      [5, 'Volatile Reagents'],
      [8, 'Time Bomb'],
    ],
    pairs: [
      ['Sticky Bomb', 'Stink Bomb'],
      ['One Vial Makes You Better', 'One Vial Makes You Faster'],
      ['Chain Reaction', 'To the Stars'],
    ],
  },
  'College of the Harlequin Mask': {
    id: 'harlequin-mask',
    skill: 'Lie',
    maneuver: 'I’m No Threat',
    reaction: 'Clever Trick',
    features: [
      [2, 'Friend!'],
      [5, 'Harlequin Gambit'],
      [8, 'Parkour'],
    ],
    pairs: [
      ['Machinations of Sound', 'So Gullible'],
      ['Look!', 'Puppet Strings'],
      ['I Am You', 'It Was Me All Along'],
    ],
  },
};
const shadow = (specialization, level, preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'shadow',
    specialization,
    level,
    ancestry,
    preferences: {
      'shadow-kit': 'Cloak and Dagger',
      'shadow-perk-2': 'Brawny',
      'shadow-perk-4': 'Expert Artisan',
      ...preferences,
    },
  });
test('every Shadow level offers the exact shared and college pools, and all legal abilities export at their printed costs', () => {
  for (const [college, c] of Object.entries(shadowColleges)) {
    const { draft } = shadow(college, 10);
    for (let level = 1; level <= 10; level++) {
      draft.level = level;
      const model = evaluate(db, draft),
        sheet = buildSheet(db, draft);
      assert.ok(model.complete && !model.warnings.length);
      assert.equal(sheet.hero.classTrack, college);
      for (const name of ['Hide', 'Sneak', c.skill]) assert.ok(sheet.sidebar.skills[name]);
      assert.equal(
        sheet.hero.vitals.staminaMax,
        18 + (level - 1) * 6 + model.kit.stamina * Math.ceil(level / 3),
      );
      assert.equal(sheet.hero.vitals.recoveriesMax, 8);
      assert.equal(sheet.hero.stats.agility, 2 + [4, 7, 10].filter((l) => l <= level).length);
      const allNames = new Set([...model.actions.map((a) => a.name), ...model.grants.map((f) => f.name)]);
      assert.equal(ids(sheet).length, new Set(ids(sheet)).size);
      for (const [name, other] of Object.entries(shadowColleges)) {
        for (const ability of [other.maneuver, other.reaction])
          assert.equal(allNames.has(ability), name === college);
        for (const [at, feat] of other.features)
          assert.equal(allNames.has(feat), name === college && level >= at);
      }
      assert.ok(
        sheet.actions.triggers.some(
          (a) =>
            a.name === 'Hesitation Is Weakness' &&
            a.cost === '1 Insight' &&
            a.actionLabel === 'Free triggered action',
        ),
      );
      const observation = sheet.actions.maneuvers.find((a) => a.name === 'Careful Observation');
      assert.equal(
        observation?.target,
        level >= 10
          ? 'Up to three creatures'
          : level >= 7
            ? 'Up to two creatures'
            : level >= 3
              ? 'One creature'
              : undefined,
      );
      for (const [at, cost, key, names] of [
        ...shadowPools.map(([at, cost, names]) => [at, cost, 'shadow-ability-' + cost, names]),
        ...c.pairs.map((names, i) => [
          [2, 6, 9][i],
          [5, 9, 11][i],
          'shadow-' + c.id + '-ability-' + [2, 6, 9][i],
          names,
        ]),
      ]) {
        const slot = model.slots.find((s) => s.key === key);
        assert.equal(!!slot, at <= level, key);
        if (!slot) continue;
        assert.equal(slot.count, 1);
        assert.equal(slot.flexible, false);
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
        if (level !== at) continue;
        for (const option of slot.choices) {
          const copy = structuredClone(draft);
          copy.picks[key] = [option.id];
          const cards = Object.values(buildSheet(db, copy).actions)
            .flat()
            .filter((a) => names.includes(a.name));
          assert.deepEqual(
            cards.map((a) => [a.name, a.cost]),
            [[option.name, cost === 'signature' ? '' : cost + ' Insight']],
          );
        }
      }
    }
  }
});
test('Shadow training, standard kits, conditional effects and Insight survive a native export', () => {
  const { draft, model } = shadow('College of Caustic Alchemy', 10, {
    'shadow-kit': 'Arcane Archer',
    'shadow-ability-5': 'Coup de Grace',
  });
  const gear = model.slots.find((s) => s.key === 'shadow-kit');
  assert.equal(gear.choices.length, 21);
  assert.ok(!gear.choices.some((k) => k.id === 'kit-vuken'));
  const training = model.slots.find((s) => s.key === 'shadow-skills');
  assert.equal(training.count, 5);
  assert.equal(training.flexible, true);
  for (const skill of training.choices) {
    const group = db.skills.find((s) => s.name === skill.name).list;
    assert.equal(
      !skill.warning,
      skill.name === 'Criminal Underworld' || ['Exploration', 'Interpersonal', 'Intrigue'].includes(group),
      skill.name,
    );
  }
  const restricted = model.slots.find((s) => s.key === 'shadow-perk-2');
  assert.ok(
    restricted.choices.every((o) =>
      ['Exploration', 'Interpersonal', 'Intrigue'].includes(db.perks.find((p) => p.id === o.id).list),
    ),
  );
  assert.equal(restricted.flexible, false);
  for (const level of [1, 4, 7, 9, 10]) {
    const sheet = mergeWithDefaults(JSON.parse(JSON.stringify(buildSheet(db, { ...draft, level }))));
    assert.equal(effectiveKit(sheet).values.name, 'Arcane Archer');
    const resource = sheet.hero.resource;
    assert.equal(resource.title, 'Insight');
    assert.equal(resource.discountOnPowerRollEdge, true);
    const { rules, warnings } = normalizeHeroicResourceAutomation(resource.automation);
    assert.deepEqual(warnings, []);
    assert.equal(rules.find((r) => r.event === 'combatStart').effect.amount.from, 'victories');
    assert.equal(rules.find((r) => r.event === 'combatEnd').effect.amount.amount, 0);
    const turn = rules.find((r) => r.event === 'turnStart');
    assert.equal(turn.effect.amount.dice, '1d3');
    assert.equal(turn.effect.amount.bonus, level >= 7 ? 1 : 0);
    assert.equal(turn.autoApply, false);
    const surge = rules.find((r) => r.event === 'damageDealt');
    assert.equal(surge.limit.scope, 'round');
    assert.equal(surge.effect.amount.amount, level === 10 ? 3 : level >= 4 ? 2 : 1);
    const hit = { sourceId: 'hero', targetId: 'foe', amount: 3, surgeSpent: 1 };
    const matches = (patch) =>
      ruleMatchesHeroicResourceEvent(surge, 'damageDealt', { ...hit, ...patch }, { casterId: 'hero' });
    assert.equal(matches({}), true);
    for (const miss of [{ sourceId: 'ally' }, { surgeSpent: 0 }, { amount: 0 }])
      assert.equal(matches(miss), false);
    assert.equal(sheet.sidebar.resource.text.includes('Gloom Squad'), level >= 9);
    const bomb = sheet.actions.maneuvers.find((a) => a.name === 'Time Bomb');
    assert.equal(!!bomb, level >= 8);
    if (bomb) {
      assert.equal(bomb.actionLabel, 'Free maneuver');
      assert.match(bomb.description, /once per round on your turn/);
      assert.match(bomb.description, /Spend 2 insight/);
    }
    assert.equal(
      sheet.actions.triggers.find((a) => a.name === 'Defensive Roll').description.includes('shift up to 5'),
      level >= 5,
    );
    const coup = sheet.actions.mains.find((a) => a.name === 'Coup de Grace');
    assert.equal(coup.tests.length, 2);
    assert.deepEqual(
      coup.tests.map((t) => t.tiers.low.damage),
      [model.kit.meleeDamage, model.kit.rangedDamage].map(
        (bonus) => '2d6 + ' + (7 + sheet.hero.stats.agility + (bonus?.[0] || 0)),
      ),
    );
    assert.ok(!sheet.sidebar.lists.immunity.some((s) => s.startsWith('Area ')));
  }
});
test('Shadow rejects stale, foreign, over-level and same-cost picks even with a house-rule flag', () => {
  const { draft, model } = shadow('College of Black Ash', 10);
  const slot = model.slots.find((s) => s.key === 'shadow-black-ash-ability-2');
  for (const id of [
    'fury-visceral-roar',
    'shadow-coup-de-grace',
    'shadow-sticky-bomb',
    'shadow-demon-door',
    'kit-boren',
  ]) {
    const copy = structuredClone(draft);
    assert.equal(setPick(copy, slot, id, true), false);
    copy.picks[slot.key] = [id];
    copy.exceptions[slot.key] = [id];
    assert.deepEqual(evaluate(db, copy).slots.find((s) => s.key === slot.key).selected, []);
    assert.throws(() => buildSheet(db, copy));
  }
  draft.picks.subclass = ['shadow-harlequin-mask'];
  const changed = evaluate(db, draft);
  assert.equal(changed.slots.find((s) => s.key === 'shadow-harlequin-mask-ability-2').selected.length, 0);
  assert.ok(!changed.actions.some((a) => a.name === 'Black Ash Teleport' || a.name === 'In a Puff of Ash'));
  draft.level = 1;
  assert.ok(!evaluate(db, draft).actions.some((a) => a.name === 'Careful Observation' || a.cost >= 7));
  draft.classId = 'fury';
  assert.ok(!evaluate(db, draft).actions.some((a) => a.id.startsWith('shadow-')));
  for (const ancestry of db.ancestries)
    assert.ok(shadow('College of the Harlequin Mask', 1, {}, ancestry.name).model.complete);
});

test('Shadow advancement caps and kit bonuses hold across the starting arrays and every standard kit', () => {
  const { draft } = shadow('College of Black Ash', 10, {
    'shadow-black-ash-ability-9': 'Cacophony of Cinders',
    'shadow-ability-5': 'Coup de Grace',
    'shadow-increase-4': 'Might',
    'shadow-increase-10': 'Might',
  });
  const slots = evaluate(db, draft).slots;
  for (const key of ['shadow-increase-4', 'shadow-increase-10']) {
    assert.deepEqual(
      slots
        .find((s) => s.key === key)
        .choices.map((c) => c.name)
        .sort(),
      ['Intuition', 'Might', 'Presence', 'Reason'],
    );
  }
  assert.equal(slots.find((s) => s.key === 'shadow-array').choices.length, 4);
  for (const [index, array] of [
    [2, 2, -1, -1],
    [2, 1, 1, -1],
    [2, 1, 0, 0],
    [1, 1, 1, 0],
  ].entries()) {
    draft.picks['shadow-array'] = [String(index)];
    draft.picks['shadow-assign-' + index] = [array.join(',')];
    for (const level of [1, 4, 7, 10]) {
      const sheet = buildSheet(db, { ...draft, level });
      const { might, reason, intuition, presence } = sheet.hero.stats;
      assert.deepEqual(
        [might, reason, intuition, presence],
        array.map(
          (n, i) => n + Number(level >= 7) + (i === 0 ? Number(level >= 4) + Number(level >= 10) : 0),
        ),
      );
    }
  }
  for (const kit of db.kits) {
    draft.picks['shadow-kit'] = [kit.id];
    const sheet = buildSheet(db, draft);
    assert.deepEqual(
      ids(sheet).filter((id) => id.startsWith('kit-')),
      [kit.ability.id],
    );
    const conditional = sheet.actions.mains.find((a) => a.name === 'Cacophony of Cinders').tests[0].tiers
      .high;
    assert.equal(conditional.damage, '');
    assert.ok(
      conditional.notes.startsWith(
        'An enemy takes ' +
          (14 + (kit.meleeDamage?.[2] || 0)) +
          ' damage; an ally can teleport up to 7 squares.',
      ),
    );
    assert.equal(sheet.hero.kit.name, kit.name);
  }
});
