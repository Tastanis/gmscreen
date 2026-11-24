import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newDraft, evaluate, setPick } from '../../../../../character_sheet/builder/rules.mjs';
import { buildSheet } from '../../../../../character_sheet/builder/build-sheet.mjs';
import {
  SKILL_GROUPS,
  effectiveKit,
  getSkillGroup,
  heroResourceFloor,
  mergeWithDefaults,
} from '../../../../../character_sheet/parts/sheet-model.js';
import { parseDefenseText } from '../automation-resistance.js';
import {
  normalizeHeroicResourceAutomation,
  resolveHeroicResourceAmount,
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

const tacticianPools = [
  [1, 3, ['Battle Cry', 'Concussive Strike', 'Inspiring Strike', 'Squad! Forward!']],
  [1, 5, ['Hammer and Anvil', 'Mind Game', 'Now!', 'This Is What We Planned For']],
  [3, 7, ['Frontal Assault', 'Hit ’Em Hard!', 'Rout', 'Stay Strong and Focus!']],
  [
    5,
    9,
    [
      'Squad! Gear Check!',
      'Squad! Remember Your Training!',
      'Win This Day!',
      'You’ve Still Got Something Left',
    ],
  ],
  [8, 11, ['Go Now and Speed Well', 'Finish Them!', 'Floodgates Open', 'I’ll Open and You’ll Close']],
];
const doctrines = {
  Insurgent: {
    skill: 'Intrigue',
    trigger: 'Advanced Tactics',
    features: [
      [1, 'Covert Operations'],
      [2, 'Infiltration Tactics'],
      [5, 'Distracted'],
      [5, 'Leave No Trace'],
      [7, 'Asymmetric Warfare'],
      [8, 'Bait and Ambush'],
    ],
    pairs: [
      ['Fog of War', 'Try Me Instead'],
      ['Coordinated Execution', 'Panic in Their Lines'],
      ['Squad! Hit and Run!', 'Their Lack of Focus Is Their Undoing'],
    ],
  },
  Mastermind: {
    skill: 'Lore',
    trigger: 'Overwatch',
    features: [
      [1, 'Studied Commander'],
      [2, 'Goaded'],
      [5, 'Anticipation'],
      [5, 'I Predicted That'],
      [7, 'Grand Strategy'],
      [8, 'Pincer Movement'],
    ],
    pairs: [
      ['I’ve Got Your Back', 'Targets of Opportunity'],
      ['Battle Plan', 'Hustle!'],
      ['Blot Out the Sun!', 'Counterstrategy'],
    ],
  },
  Vanguard: {
    skill: 'Interpersonal',
    trigger: 'Parry',
    features: [
      [1, 'Commanding Presence'],
      [2, 'Melee Superiority'],
      [5, 'Shake It Off'],
      [5, 'Tactical Offensive'],
      [7, 'Shock and Awe'],
      [8, 'See Your Enemies Driven Before You'],
    ],
    pairs: [
      ['No Dying on My Watch', 'Squad! On Me!'],
      ['Instant Retaliation', 'To Me Squad!'],
      ['No Escape', 'That One Is Mine!'],
    ],
  },
};
const tactician = (level, specialization = 'Vanguard', preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'tactician',
    level,
    specialization,
    ancestry,
    preferences: {
      'tactician-kits': ['Shining Armor', 'Sniper'],
      'tactician-perk-2': 'Brawny',
      'tactician-perk-4': 'Expert Artisan',
      ...preferences,
    },
  });

test('Tactician grants two kit signatures and exactly the earned shared and doctrine abilities at every level', () => {
  for (const [doctrine, info] of Object.entries(doctrines)) {
    const { draft } = tactician(10, doctrine);
    for (let level = 1; level <= 10; level++) {
      draft.level = level;
      const model = evaluate(db, draft),
        sheet = buildSheet(db, draft);
      assert.ok(model.complete && !model.warnings.length);
      assert.equal(sheet.hero.classTrack, doctrine);
      assert.ok(sheet.sidebar.skills.Lead);
      assert.ok(!model.slots.some((s) => s.key === 'tactician-ability-signature'));
      assert.deepEqual(
        ids(sheet)
          .filter((id) => id.startsWith('kit-'))
          .sort(),
        ['kit-shining-armor-signature', 'kit-sniper-signature'].sort(),
      );
      const mark = sheet.actions.maneuvers.find((a) => a.name === 'Mark');
      assert.equal(
        mark.target,
        doctrine === 'Mastermind' && level >= 5 ? 'Up to two creatures' : 'One creature',
      );
      assert.ok(
        sheet.actions.mains.some((a) => a.name === 'Strike Now!' && a.description.includes('Spend 5 focus')),
      );
      for (const [name, other] of Object.entries(doctrines)) {
        assert.equal(
          sheet.actions.triggers.some((a) => a.name === other.trigger),
          name === doctrine,
        );
        for (const [at, feature] of other.features)
          assert.equal(
            model.grants.some((g) => g.name === feature),
            name === doctrine && level >= at,
          );
      }
      for (const [at, cost, key, names] of [
        ...tacticianPools.map(([at, cost, names]) => [at, cost, 'tactician-ability-' + cost, names]),
        ...info.pairs.map((names, i) => [
          [2, 6, 9][i],
          [5, 9, 11][i],
          'tactician-' + doctrine.toLowerCase() + '-ability-' + [2, 6, 9][i],
          names,
        ]),
      ]) {
        const slot = model.slots.find((s) => s.key === key);
        assert.equal(!!slot, level >= at, key);
        if (!slot) continue;
        assert.equal(slot.count, 1);
        assert.equal(slot.flexible, false);
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
        if (level !== at) continue;
        for (const option of slot.choices) {
          const copy = structuredClone(draft);
          copy.picks[key] = [option.id];
          const spells = Object.values(buildSheet(db, copy).actions)
            .flat()
            .filter((a) => names.includes(a.name));
          assert.deepEqual(
            spells.map((a) => [a.name, a.cost]),
            [[option.name, cost + ' Focus']],
          );
        }
      }
      const stat = 2 + [4, 7, 10].filter((at) => level >= at).length;
      assert.equal(sheet.hero.stats.might, stat);
      assert.equal(sheet.hero.stats.reason, stat);
      assert.equal(sheet.hero.vitals.recoveriesMax, 10);
      assert.equal(
        sheet.hero.vitals.staminaMax,
        21 + 9 * (level - 1) + model.kit.stamina * Math.ceil(level / 3),
      );
      const { rules, warnings } = normalizeHeroicResourceAutomation(sheet.hero.resource.automation);
      assert.deepEqual(warnings, []);
      assert.equal(sheet.hero.resource.title, 'Focus');
      assert.equal(
        rules.find((r) => r.event === 'turnStart').effect.amount.amount,
        level === 10 ? 4 : level >= 7 ? 3 : 2,
      );
      assert.equal(rules.find((r) => r.event === 'combatStart').effect.amount.from, 'victories');
      assert.equal(rules.find((r) => r.event === 'combatEnd').effect.amount.amount, 0);
      assert.ok(
        sheet.sidebar.resource.text.includes(
          'add ' + (level >= 4 ? 2 : 1) + ' Focus the first time you or an ally',
        ),
      );
      assert.ok(sheet.sidebar.resource.text.includes('ally within 10 squares uses a heroic ability'));
      assert.equal(ids(sheet).length, new Set(ids(sheet)).size);
      const check = sheet.actions.mains.find((a) => a.name === 'Patient Shot').description;
      for (const [at, text] of [
        [4, 'Improved Field Arsenal'],
        [6, 'Master of Arms'],
        [9, 'Grandmaster of Arms'],
      ]) {
        assert.equal(check.includes(text), level >= at);
        assert.equal(sheet.actions.freeStrikes[0].description.includes(text), level >= at);
      }
    }
  }
});

test('Field Arsenal offers each overlapping benefit independently and recalculates both signatures for all 210 kit pairs', () => {
  const { draft } = tactician(1);
  for (const [i, first] of db.kits.entries())
    for (const second of db.kits.slice(i + 1)) {
      const pair = [first, second];
      draft.picks['tactician-kits'] = pair.map((k) => k.id);
      const initial = evaluate(db, draft);
      for (const field of [
        'stamina',
        'speed',
        'stability',
        'disengage',
        'meleeDistance',
        'rangedDistance',
        'meleeDamage',
        'rangedDamage',
      ]) {
        const values = pair.map((k) => k[field]);
        const slot = initial.slots.find((s) => s.key === 'tactician-kits-' + field);
        assert.equal(
          !!slot,
          values.every(Boolean) && String(values[0]) !== String(values[1]),
          first.name + ' and ' + second.name + ' ' + field,
        );
        if (slot) {
          assert.deepEqual(
            slot.choices.map((o) => o.id),
            pair.map((k) => k.id),
          );
          assert.equal(slot.flexible, false);
          draft.picks[slot.key] = [second.id];
        }
      }
      const sheet = mergeWithDefaults(buildSheet(db, draft));
      const gear = effectiveKit(sheet).values;
      assert.equal(gear.name, pair.map((k) => k.name).join(' and '));
      for (const f of ['speed', 'stamina', 'stability', 'disengage', 'meleeDistance', 'rangedDistance'])
        assert.equal(Number(gear[f]), second[f] || first[f] || 0);
      for (const k of pair) {
        const record = Object.values(sheet.actions)
          .flat()
          .find((a) => a.id === k.ability.id);
        for (const d of k.ability.distance) {
          const mode = d.kind.toLowerCase(),
            distance = mode + 'Distance',
            bon = mode + 'Damage';
          assert.ok(
            record.range.includes(
              d.kind + ' ' + (d.args[0] + (second[distance] || first[distance] || 0) - k[distance]),
            ),
          );
          const roll = k.ability.sections.find((s) => s.kind === 'PowerRoll');
          const test = record.tests.find((t) => t.label.includes(d.kind)) || record.tests[0];
          for (const [index, tier] of ['low', 'mid', 'high'].entries()) {
            const printed = roll['tier' + (index + 1)];
            const chars = (
              printed
                .split(' damage')[0]
                .split(';')[0]
                .match(/\b[MARIP]\b/g) || []
            ).map(
              (key) =>
                sheet.hero.stats[
                  { M: 'might', A: 'agility', R: 'reason', I: 'intuition', P: 'presence' }[key]
                ],
            );
            const flat = Number.parseInt(printed, 10) + (chars.length ? Math.max(...chars) : 0);
            assert.equal(
              Number(test.tiers[tier].damage),
              flat + (second[bon] || first[bon] || [])[index] - (k[bon]?.[index] || 0),
              k.name + ' ' + d.kind + ' ' + tier,
            );
          }
        }
      }
      assert.equal(sheet.actions.mains.filter((a) => a.id.startsWith('kit-')).length, 2);
    }
});

test('the printed Field Arsenal examples, illegal picks, skills and perk restrictions survive a draft edit', () => {
  const { draft, model } = tactician(10, 'Mastermind', { 'tactician-kits-stamina': 'Shining Armor' });
  const kit = model.kit;
  assert.deepEqual(
    [kit.stamina, kit.stability, kit.speed, kit.rangedDistance, kit.disengage],
    [12, 1, 1, 10, 1],
  );
  assert.deepEqual(kit.meleeDamage, [2, 2, 2]);
  assert.deepEqual(kit.rangedDamage, [0, 0, 4]);
  const skill = model.slots.find((s) => s.key === 'tactician-skills');
  assert.equal(skill.count, 2);
  for (const o of skill.choices) {
    const record = db.skills.find((s) => s.name === o.name);
    assert.equal(
      !o.warning,
      record.list === 'Exploration' ||
        [
          'Alertness',
          'Architecture',
          'Blacksmithing',
          'Brag',
          'Culture',
          'Empathize',
          'Fletching',
          'Mechanics',
          'Monsters',
          'Search',
          'Strategy',
        ].includes(o.name),
    );
  }
  for (const [name, info] of Object.entries(doctrines)) {
    const { model } = tactician(10, name);
    const trained = model.slots.find((s) => s.key === 'tactician-' + name.toLowerCase() + '-skill');
    assert.ok(
      trained.choices.every(
        (o) => !!o.warning === (db.skills.find((s) => s.name === o.name).list !== info.skill),
      ),
    );
    for (const at of [2, 6, 10]) {
      const slot = model.slots.find((s) => s.key === 'tactician-perk-' + at);
      assert.ok(
        slot.choices.every((o) =>
          ['Exploration', 'Interpersonal', 'Intrigue'].includes(db.perks.find((p) => p.id === o.id).list),
        ),
      );
    }
  }
  const pairs = model.slots.find((s) => s.key === 'tactician-kits');
  assert.equal(pairs.choices.length, 21);
  for (const pick of [
    ['kit-shining-armor', 'kit-shining-armor'],
    ['kit-shining-armor', 'kit-boren'],
  ]) {
    const copy = structuredClone(draft);
    copy.picks[pairs.key] = pick;
    copy.exceptions[pairs.key] = pick;
    assert.throws(() => buildSheet(db, copy));
  }
  const slot = model.slots.find((s) => s.key === 'tactician-mastermind-ability-2');
  for (const id of ['tactician-fog-of-war', 'tactician-now', 'tactician-battle-plan', 'shadow-sticky-bomb']) {
    assert.equal(setPick(draft, slot, id, true), false);
    const copy = structuredClone(draft);
    copy.picks[slot.key] = [id];
    copy.exceptions[slot.key] = [id];
    assert.throws(() => buildSheet(db, copy));
  }
  const changed = tactician(10, 'Insurgent', {
    'tactician-kits': ['Martial Artist', 'Mountain'],
    'tactician-kits-meleeDamage': 'Mountain',
  }).draft;
  changed.level = 1;
  const grace = () =>
    buildSheet(db, changed).actions.mains.find((a) => a.name === 'Battle Grace').tests[0].tiers;
  const stat = 2;
  assert.deepEqual(
    Object.values(grace()).map((t) => Number(t.damage) - stat),
    [3, 6, 13],
  );
  changed.picks['tactician-kits-meleeDamage'] = ['kit-martial-artist'];
  assert.deepEqual(
    Object.values(grace()).map((t) => Number(t.damage) - stat),
    [5, 8, 11],
  );
  changed.picks['tactician-kits-meleeDamage'] = ['kit-sniper'];
  changed.exceptions['tactician-kits-meleeDamage'] = ['kit-sniper'];
  assert.throws(() => buildSheet(db, changed));
  changed.classId = 'shadow';
  assert.ok(
    !evaluate(db, changed).actions.some((a) => a.id.startsWith('tactician-') || a.name === 'Battle Grace'),
  );
  for (const a of db.ancestries) assert.ok(tactician(1, 'Insurgent', {}, a.name).model.complete);
});

const talentPools = [
  [
    1,
    'signature',
    [
      'Entropic Bolt',
      'Hoarfrost',
      'Incinerate',
      'Kinetic Grip',
      'Kinetic Pulse',
      'Materialize',
      'Optic Blast',
      'Spirit Sword',
    ],
  ],
  [1, 3, ['Awe', 'Choke', 'Precognition', 'Smolder']],
  [1, 5, ['Flashback', 'Inertia Soak', 'Iron', 'Perfect Clarity']],
  [3, 7, ['Fling Through Time', 'Force Orbs', 'Reflector Field', 'Soul Burn']],
  [5, 9, ['Exothermic Shield', 'Hypersonic', 'Mind Snare', 'Soulbound']],
  [8, 11, ['Doubt', 'Mindwipe', 'Rejuvenate', 'Steel']],
];
const talentTraditions = {
  Chronopathy: {
    features: [
      [1, 'Accelerate'],
      [1, 'Again'],
      [2, 'Ease the Hours'],
      [5, 'Distortion Temporal'],
      [5, 'Speed of Thought'],
      [8, 'Doubling the Hours'],
      [8, 'Stasis Shield'],
    ],
    pairs: [
      ['Applied Chronometrics', 'Slow'],
      ['Fate', 'Stasis Field'],
      ['Acceleration Field', 'Borrow From the Future'],
    ],
  },
  Telekinesis: {
    features: [
      [1, 'Minor Telekinesis'],
      [1, 'Repel'],
      [2, 'Ease Their Fall'],
      [5, 'Kinetic Amplifier'],
      [5, 'Triangulate'],
      [8, 'Levitation Field'],
      [8, 'Low Gravity'],
    ],
    pairs: [
      ['Gravitic Burst', 'Levity and Gravity'],
      ['Gravitic Well', 'Greater Kinetic Grip'],
      ['Fulcrum', 'Gravitic Nova'],
    ],
  },
  Telepathy: {
    features: [
      [1, 'Remote Assistance'],
      [1, 'Feedback Loop'],
      [2, 'Ease the Mind'],
      [5, 'Compulsion'],
      [5, 'Remote Amplification'],
      [8, 'Mindlink'],
      [8, 'Universal Connection'],
    ],
    pairs: [
      ['Overwhelm', 'Synaptic Override'],
      ['Synaptic Conditioning', 'Synaptic Dissipation'],
      ['Resonant Mind Spike', 'Synaptic Terror'],
    ],
  },
};
const talent = (level, specialization = 'Telepathy', preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'talent',
    level,
    specialization,
    ancestry,
    preferences: {
      'talent-augmentation': 'Force Augmentation',
      'talent-ward': 'Repulsive Ward',
      'talent-perk-2': 'Charming Liar',
      'talent-perk-4': 'Expert Artisan',
      ...preferences,
    },
  });

test('Talent grants only the selected tradition at each level while allowing all published shared psionic powers', () => {
  for (const [name, trad] of Object.entries(talentTraditions)) {
    const { draft } = talent(10, name);
    for (let level = 1; level <= 10; level++) {
      draft.level = level;
      const model = evaluate(db, draft),
        sheet = buildSheet(db, draft);
      assert.ok(model.complete && !model.warnings.length);
      assert.equal(sheet.hero.classTrack, name);
      const available = new Set([...model.grants, ...model.actions].map((f) => f.name));
      for (const [other, info] of Object.entries(talentTraditions))
        for (const [at, feature] of info.features)
          assert.equal(available.has(feature), other === name && level >= at, feature);
      const stat = 2 + [4, 7, 10].filter((at) => level >= at).length;
      assert.equal(sheet.hero.stats.reason, stat);
      assert.equal(sheet.hero.stats.presence, stat);
      assert.equal(sheet.hero.vitals.staminaMax, 18 + 6 * (level - 1));
      assert.equal(sheet.hero.vitals.recoveriesMax, 8);
      assert.equal(sheet.sidebar.lists.immunity.includes('Psychic 10'), level >= 9);
      assert.ok(sheet.sidebar.skills.Psionics && sheet.sidebar.skills['Read Person']);
      assert.equal(sheet.sidebar.lists.languages.filter((l) => l === 'Mindspeech').length, 1);
      const speech = sheet.features.find((f) => f.title === 'Telepathic Speech');
      if (name === 'Telepathy' && level >= 5)
        assert.ok(speech.text.endsWith(level >= 8 ? 'anywhere on the same world' : '1 mile'));
      for (const [at, cost, key, names] of [
        ...talentPools.map(([at, cost, names]) => [at, cost, 'talent-ability-' + cost, names]),
        ...trad.pairs.map((names, i) => [
          [2, 6, 9][i],
          [5, 9, 11][i],
          'talent-' + name.toLowerCase() + '-ability-' + [2, 6, 9][i],
          names,
        ]),
      ]) {
        const slot = model.slots.find((s) => s.key === key);
        assert.equal(!!slot, level >= at, key);
        if (!slot) continue;
        assert.equal(slot.count, cost === 'signature' ? 2 : 1);
        assert.equal(slot.flexible, false);
        assert.deepEqual(slot.choices.map((o) => o.name).sort(), names.toSorted());
        if (level !== at) continue;
        const selections =
          cost === 'signature'
            ? slot.choices.flatMap((a, i) => slot.choices.slice(i + 1).map((b) => [a, b]))
            : slot.choices.map((a) => [a]);
        for (const options of selections) {
          const copy = structuredClone(draft);
          copy.picks[key] = options.map((o) => o.id);
          const cards = Object.values(buildSheet(db, copy).actions)
            .flat()
            .filter((a) => names.includes(a.name));
          assert.deepEqual(cards.map((c) => c.name).sort(), options.map((o) => o.name).sort());
          assert.ok(cards.every((c) => c.cost === (cost === 'signature' ? '' : cost + ' Clarity')));
        }
      }
      assert.equal(ids(sheet).length, new Set(ids(sheet)).size);
    }
  }
});

test('all Talent wards and augmentations grant their own benefits and recalculate when gear or level changes', () => {
  const wards = ['Entropy Ward', 'Repulsive Ward', 'Steel Ward', 'Vanishing Ward'];
  const augmentations = ['Battle', 'Density', 'Distance', 'Force', 'Speed'];
  for (const aug of augmentations)
    for (const ward of wards) {
      const { draft } = talent(10, 'Telepathy', {
        'talent-augmentation': aug + ' Augmentation',
        'talent-ward': ward,
        'talent-gear-armor': 'Light armor',
        'talent-gear-weapon': 'Light weapon',
        'talent-ability-signature': ['Incinerate', 'Spirit Sword'],
        'talent-ability-7': 'Force Orbs',
        'talent-ability-9': 'Hypersonic',
      });
      for (const level of [1, 4, 5, 7, 10]) {
        const at = { ...draft, level },
          model = evaluate(db, at),
          sheet = mergeWithDefaults(buildSheet(db, at));
        const textOf = (name) => sheet.features.find((f) => f.title === name)?.text;
        for (const w of wards) assert.equal(!!textOf(w), w === ward);
        for (const a of augmentations) assert.equal(!!textOf(a + ' Augmentation'), a === aug);
        const trained = model.slots.find((s) => s.key === 'talent-skills');
        assert.equal(trained.count, 2);
        assert.ok(
          trained.choices.every(
            (o) =>
              !o.warning ===
              ['Interpersonal', 'Lore'].includes(db.skills.find((s) => s.name === o.name).list),
          ),
        );
        for (const n of [2, 6, 10].filter((n) => n <= level)) {
          const perk = model.slots.find((s) => s.key === 'talent-perk-' + n);
          assert.ok(
            perk.choices.every((o) =>
              ['Interpersonal', 'Lore', 'Supernatural'].includes(db.perks.find((p) => p.id === o.id).list),
            ),
          );
        }
        const spike = sheet.actions.mains.find((a) => a.name === 'Mind Spike');
        const range = 10 + (aug === 'Distance' ? 2 : 0) + (level >= 5 ? 5 : 0) + (level === 10 ? 10 : 0);
        const free = sheet.actions.freeStrikes.find((a) => a.name === 'Mind Spike');
        assert.equal(spike.range, 'Ranged ' + range);
        assert.equal(free.range, spike.range);
        assert.deepEqual(free.tests[0].tiers, spike.tests[0].tiers);
        assert.equal(
          Number(free.tests[0].tiers.low.damage),
          2 + sheet.hero.stats.reason + Number(aug === 'Force'),
        );
        assert.equal(free.tests[0].tiers.high.damageType, 'psychic');
        assert.match(free.description, /Strained.*extra 2 psychic damage/);
        assert.equal(
          sheet.actions.mains.find((a) => a.name === 'Incinerate').range,
          '3 Cube within ' + range,
        );
        assert.equal(sheet.actions.mains.find((a) => a.name === 'Spirit Sword').range, 'Melee 2');
        if (level >= 5)
          assert.equal(sheet.actions.mains.find((a) => a.name === 'Hypersonic').range, '5 × 2 Line within 1');
        if (level >= 3)
          assert.ok(
            sheet.actions.mains
              .find((a) => a.name === 'Force Orbs')
              .description.includes('within ' + (range - 5) + ' squares as a ranged strike'),
          );
        assert.equal(
          sheet.hero.vitals.staminaMax,
          18 + 6 * (level - 1) + Math.ceil(level / 3) * (aug === 'Density' ? 6 : aug === 'Battle' ? 3 : 0),
        );
        assert.equal(sheet.hero.vitals.stability, Number(aug === 'Density'));
        assert.equal(sheet.hero.vitals.speed, 5 + Number(aug === 'Speed'));
        if (aug === 'Battle') {
          assert.equal(sheet.hero.kit.armor, 'Light armor');
          assert.equal(sheet.hero.kit.weapon, 'Light weapon');
          const unarmored = structuredClone(at);
          unarmored.picks['talent-gear-armor'] = ['no'];
          unarmored.picks['talent-gear-weapon'] = ['no'];
          const empty = buildSheet(db, unarmored);
          assert.equal(empty.hero.vitals.staminaMax, 18 + 6 * (level - 1));
          assert.equal(
            Number(empty.actions.freeStrikes[0].tests[0].tiers.low.damage) + 1,
            Number(sheet.actions.freeStrikes[0].tests[0].tiers.low.damage),
          );
          assert.equal(
            empty.actions.freeStrikes.find((a) => a.name === 'Mind Spike').tests[0].tiers.low.damage,
            free.tests[0].tiers.low.damage,
          );
        } else assert.ok(!model.slots.some((s) => s.key.startsWith('talent-gear-')));
      }
    }
});

test('Talent export uses the native Clarity floor, forced-movement limits, turn gains and optional damage at level 10', () => {
  const { draft } = talent(10, 'Chronopathy', { 'talent-chronopathy-ability-6': 'Fate' });
  for (let level = 1; level <= 10; level++) {
    const sheet = mergeWithDefaults(buildSheet(db, { ...draft, level })),
      resource = sheet.hero.resource;
    assert.equal(resource.title, 'Clarity');
    assert.equal(resource.allowNegative, true);
    assert.equal(heroResourceFloor(sheet.hero), -(1 + sheet.hero.stats.reason));
    const { rules, warnings } = normalizeHeroicResourceAutomation(resource.automation);
    assert.deepEqual(warnings, []);
    assert.equal(rules.find((r) => r.event === 'combatStart').effect.amount.from, 'victories');
    assert.equal(rules.find((r) => r.event === 'combatEnd').effect.amount.amount, 0);
    const turn = rules.find((r) => r.event === 'turnStart');
    assert.equal(turn.effect.amount.dice, '1d3');
    assert.equal(turn.effect.amount.bonus, level === 10 ? 2 : level >= 7 ? 1 : 0);
    const moved = rules.find((r) => r.event === 'forcedMovement');
    assert.equal(moved.limit.scope, 'round');
    assert.equal(moved.effect.amount.amount, level === 10 ? 3 : level >= 4 ? 2 : 1);
    for (const [payload, expected] of [
      [{ distance: 2 }, true],
      [{ distance: 0 }, false],
      [{ distance: 1, resisted: true }, false],
    ])
      assert.equal(
        ruleMatchesHeroicResourceEvent(
          moved,
          'forcedMovement',
          { placementId: 'other', ...payload },
          { casterId: 'hero' },
        ),
        expected,
      );
    const strain = rules.find((r) => r.event === 'turnEnd');
    assert.equal(strain.effect.kind, 'damage');
    assert.equal(strain.autoApply, level < 10);
    for (const clarity of [-3, 0, 4])
      assert.equal(
        resolveHeroicResourceAmount(strain.effect.amount, { currentResource: clarity }).amount,
        Math.max(0, -clarity),
      );
    assert.equal(
      ruleMatchesHeroicResourceEvent(strain, 'turnEnd', { placementId: 'other' }, { casterId: 'hero' }),
      false,
    );
    const boost = sheet.features.find((f) => f.title === 'Psi Boost');
    assert.equal(!!boost, level >= 6);
    if (boost)
      for (const name of [
        'Dynamic',
        'Expanded',
        'Extended',
        'Heightened',
        'Magnified',
        'Shared',
        'Sharpened',
      ])
        assert.ok(boost.text.includes(name + ' Power'));
    if (level >= 6)
      assert.match(sheet.actions.mains.find((a) => a.name === 'Fate').tests[0].label, /While strained/);
  }
});

test('Talent rejects foreign powers, duplicate signatures and stale picks across classes, traditions and levels', () => {
  const { draft, model } = talent(10, 'Telekinesis');
  const slot = model.slots.find((s) => s.key === 'talent-telekinesis-ability-2');
  for (const id of ['talent-slow', 'talent-iron', 'talent-gravitic-well', 'null-ability-1']) {
    const copy = structuredClone(draft);
    copy.picks[slot.key] = [id];
    copy.exceptions[slot.key] = [id];
    assert.equal(setPick(copy, slot, id, true), false);
    assert.throws(() => buildSheet(db, copy));
  }
  const bad = structuredClone(draft);
  bad.picks['talent-ability-signature'] = ['talent-hoarfrost', 'talent-hoarfrost'];
  assert.throws(() => buildSheet(db, bad));
  draft.picks.subclass = ['talent-chronopathy'];
  draft.level = 1;
  const changed = evaluate(db, draft);
  assert.ok(changed.complete);
  assert.ok(
    !changed.actions.some((a) =>
      ['Repel', 'Gravitic Well', 'Levitation Field', 'Stasis Shield'].includes(a.name),
    ),
  );
  assert.ok(changed.actions.some((a) => a.name === 'Again'));
  draft.classId = 'null';
  assert.ok(!evaluate(db, draft).actions.some((a) => a.id.startsWith('talent-')));
  for (const a of db.ancestries) assert.ok(talent(1, 'Chronopathy', {}, a.name).model.complete);
});

const troubadour = (specialization, level = 10, preferences = {}, ancestry = 'Polder') =>
  build({
    classId: 'troubadour',
    specialization,
    level,
    ancestry,
    preferences: {
      'troubadour-kit': 'Swashbuckler',
      'troubadour-perk-2': 'Charming Liar',
      'troubadour-perk-4': 'Expert Artisan',
      ...preferences,
    },
  });
const troubadourActs = {
  Auteur: {
    skill: 'Brag',
    initial: ['Blocking', 'Dramatic Monologue', 'Turnabout Is Fair Play'],
    third: ['Missed Cue'],
    fifth: ['Fix It in Post', 'Take Two!'],
    eighth: ['Deleted Scene'],
    pairs: [
      ['Guest Star', 'Twist at the End'],
      ['Here’s How Your Story Ends', 'You’re All My Understudies'],
      ['Epic', 'Rising Tension'],
    ],
  },
  Duelist: {
    skill: 'Gymnastics',
    initial: ['Acrobatics', 'Star Power', 'Riposte'],
    third: ['Foil'],
    fifth: ['Verbal Duel', 'We Can’t Be Upstaged!'],
    eighth: ['Masterwork'],
    pairs: [
      ['Classic Chandelier Stunt', 'En Garde!'],
      ['Blood on the Stage', 'Fight Choreography'],
      ['Expert Fencer', 'Renegotiated Contract'],
    ],
  },
  Virtuoso: {
    skill: 'Music',
    initial: ['Power Chord', 'Thunder Mother', 'Ballad of the Beast', 'Harmonize'],
    third: ['Second Album', 'Fire Up the Night', 'Never-Ending Hero'],
    fifth: ['Bolstering Banter', 'Medley'],
    eighth: ['Crowd Favorites', 'Moonlight Sonata', 'Radical Fantasia'],
    pairs: [
      ['Encore', 'Tough Crowd'],
      ['Feedback', 'Legendary Drum Fill'],
      ['Jam Session', 'Melt Their Faces'],
    ],
  },
};
const troubadourPools = [
  [1, 'signature', ['Artful Flourish', 'Cutting Sarcasm', 'Instigator', 'Witty Banter']],
  [1, 3, ['Harsh Critic', 'Hypnotic Overtones', 'Quick Rewrite', 'Upstage']],
  [1, 5, ['Dramatic Reversal', 'Fake Your Death', 'Flip the Script', 'Method Acting']],
  [3, 7, ['Extensive Rewrites', 'Infernal Gavotte', 'Star Solo', 'We Meet at Last']],
  [5, 9, ['Action Hero', 'Continuity Error', 'Love Song', 'Patter Song']],
  [8, 11, ['Dramatic Reveal', 'Power Ballad', 'Saved in the Edit', 'The Show Must Go On']],
];

test('Troubadour awards the right class act, class abilities, skills, and performances at each level', () => {
  for (const [name, act] of Object.entries(troubadourActs)) {
    const { draft } = troubadour(name, 10, { 'troubadour-masterwork': 'Fancy Footwork' });
    for (let level = 1; level <= 10; level++) {
      const at = { ...draft, level },
        model = evaluate(db, at),
        sheet = buildSheet(db, at),
        actions = Object.values(sheet.actions).flat();
      const slots = new Map(model.slots.map((s) => [s.key, s]));
      assert.ok(model.complete && !model.warnings.length);
      assert.ok(sheet.sidebar.skills[act.skill] && sheet.sidebar.skills['Read Person']);
      const classStat = 2 + [4, 7, 10].filter((x) => x <= level).length;
      assert.equal(sheet.hero.stats.agility, classStat);
      assert.equal(sheet.hero.stats.presence, classStat);
      assert.equal(sheet.hero.vitals.recoveriesMax, 8);
      assert.equal(
        sheet.hero.vitals.staminaMax,
        18 + 6 * (level - 1) + model.kit.stamina * Math.ceil(level / 3),
      );
      assert.equal(sheet.hero.vitals.save, level >= 7 ? 5 : 6);
      assert.equal(slots.get('troubadour-interpersonal').count, 2);
      assert.equal(slots.get('troubadour-intrigue-lore').count, 1);
      for (const [slot, groups] of [
        ['troubadour-interpersonal', ['Interpersonal']],
        ['troubadour-intrigue-lore', ['Intrigue', 'Lore']],
      ]) {
        for (const o of slots.get(slot).choices)
          assert.equal(!o.warning, groups.includes(db.skills.find((s) => s.name === o.name).list));
      }
      const owned = new Set([...model.grants, ...model.actions].map((f) => f.name));
      for (const [other, info] of Object.entries(troubadourActs))
        for (const [min, features] of [
          [1, info.initial],
          [3, info.third],
          [8, info.eighth],
        ])
          for (const f of features)
            assert.equal(owned.has(f), other === name && level >= min, name + ' ' + level + ' ' + f);
      for (const routine of ['Choreography', 'Revitalizing Limerick', 'Spotlight'])
        assert.equal(
          actions.some((a) => a.name === routine && a.actionLabel === 'No action'),
          routine !== 'Spotlight' || level >= 6,
        );
      const routines = actions.filter((a) => a.tags.includes('Performance'));
      for (const a of routines) {
        assert.equal(a.actionLabel, 'No action');
        assert.equal(a.range === 'Encounter map within line of effect', level === 10);
      }
      if (name === 'Virtuoso') {
        const thunder = actions.find((a) => a.name === 'Thunder Mother');
        assert.equal(thunder.range, level === 10 ? 'Encounter map within line of effect' : 'Ranged 10');
        assert.deepEqual(
          Object.values(thunder.tests[0].tiers).map((t) => [Number(t.damage), t.damageType]),
          [level, level + 5, level + 10].map((n) => [n, 'lightning']),
        );
      }
      const fifth = slots.get('troubadour-' + name.toLowerCase() + '-feature-5');
      assert.equal(!!fifth, level >= 5);
      if (fifth) {
        assert.deepEqual(
          fifth.choices.map((o) => o.name),
          act.fifth,
        );
        for (const o of fifth.choices) {
          const swapped = structuredClone(at);
          swapped.picks[fifth.key] = [o.id];
          const result = evaluate(db, swapped);
          assert.deepEqual(
            [...result.actions, ...result.grants]
              .filter((f) => act.fifth.includes(f.name))
              .map((f) => f.name),
            [o.name],
          );
        }
      }
      for (const [min, cost, key, names] of [
        ...troubadourPools.map(([min, cost, names]) => [min, cost, 'troubadour-ability-' + cost, names]),
        ...act.pairs.map((names, i) => [
          [2, 6, 9][i],
          [5, 9, 11][i],
          'troubadour-' + name.toLowerCase() + '-ability-' + [2, 6, 9][i],
          names,
        ]),
      ]) {
        const slot = slots.get(key);
        assert.equal(!!slot, level >= min, key);
        if (!slot) continue;
        assert.equal(slot.count, 1);
        assert.equal(slot.flexible, false);
        assert.deepEqual(slot.choices.map((c) => c.name).sort(), names.toSorted());
        if (level === min)
          for (const o of slot.choices) {
            const copy = structuredClone(at);
            copy.picks[key] = [o.id];
            const cards = Object.values(buildSheet(db, copy).actions)
              .flat()
              .filter((a) => names.includes(a.name));
            assert.deepEqual(
              cards.map((a) => a.name),
              [o.name],
            );
            assert.equal(cards[0].cost, cost === 'signature' ? '' : cost + ' Drama');
          }
      }
      for (const n of [2, 4, 6, 8, 10].filter((x) => x <= level)) {
        const lists = new Set(
          slots.get('troubadour-perk-' + n).choices.map((o) => db.perks.find((p) => p.id === o.id).list),
        );
        if ([2, 6, 10].includes(n))
          assert.deepEqual([...lists].sort(), ['Interpersonal', 'Lore', 'Supernatural']);
        else assert.ok(lists.has('Crafting'));
      }
      const invocation = slots.get('troubadour-invocation');
      assert.equal(!!invocation, level >= 2);
      if (level === 2)
        for (const o of invocation.choices) {
          const copy = structuredClone(at);
          copy.picks[invocation.key] = [o.id];
          const s = buildSheet(db, copy);
          assert.deepEqual(
            s.features.filter((f) => invocation.choices.some((c) => c.name === f.title)).map((f) => f.title),
            [o.name],
          );
        }
    }
  }
});

test('Melodrama resolves two ordered choices, including improving a newly learned event, and exports the exact Drama gains', () => {
  const { draft } = troubadour('Auteur');
  for (const level of [1, 4, 7, 10]) {
    const sheet = buildSheet(db, { ...draft, level });
    const { rules, warnings } = normalizeHeroicResourceAutomation(sheet.hero.resource.automation);
    assert.deepEqual(warnings, []);
    assert.deepEqual(
      rules.map((r) => r.event),
      ['combatStart', 'turnStart', 'combatEnd'],
    );
    assert.equal(rules[0].effect.amount.from, 'victories');
    assert.equal(rules[1].effect.amount.dice, '1d3');
    assert.equal(rules[1].effect.amount.bonus, level >= 7 ? 1 : 0);
    assert.equal(rules[2].effect.amount.amount, 0);
    assert.equal(
      sheet.features.some((f) => f.title === 'Appeal to the Muses'),
      level >= 2,
    );
    assert.equal(
      sheet.features.some((f) => f.title === 'Applause'),
      level === 10,
    );
  }
  const at = { ...draft, level: 4 },
    first = 'troubadour-melodrama-1',
    second = 'troubadour-melodrama-2';
  const base = { ensemble: 2, winded: 2, roll: 3, death: 10 };
  const fresh = ['natural-two', 'villain', 'fall', 'surges', 'recovery'];
  function expected(values) {
    return [
      ...Object.keys(values).map((k) => 'improve-' + k),
      ...fresh.filter((k) => !(k in values)).map((k) => 'add-' + k),
    ].sort();
  }
  function apply(values, id) {
    const key = id.slice(id.indexOf('-') + 1);
    return { ...values, [key]: id.startsWith('add-') ? 2 : values[key] + 1 };
  }
  for (const a of expected(base)) {
    const plan = structuredClone(at);
    plan.picks[first] = [a];
    const model = evaluate(db, plan),
      slot = model.slots.find((s) => s.key === second),
      one = apply(base, a);
    assert.deepEqual(
      model.slots
        .find((s) => s.key === first)
        .choices.map((o) => o.id)
        .sort(),
      expected(base),
    );
    assert.deepEqual(slot.choices.map((o) => o.id).sort(), expected(one));
    for (const b of expected(one)) {
      plan.picks[second] = [b];
      const result = evaluate(db, plan),
        s = buildSheet(db, plan);
      assert.deepEqual(Object.fromEntries(result.dramaEvents.map((e) => [e.id, e.value])), apply(one, b));
      for (const e of result.dramaEvents)
        assert.ok(s.sidebar.resource.text.includes(e.trigger + ' · +' + e.value + ' Drama'));
    }
  }
  const invalid = structuredClone(at);
  invalid.picks[first] = ['improve-roll'];
  invalid.picks[second] = ['improve-fall'];
  invalid.exceptions[second] = ['improve-fall'];
  assert.throws(() => buildSheet(db, invalid));
});

test('Duelist Masterwork names an owned signature and preserves only the named kit ability when equipment changes', () => {
  const key = 'troubadour-masterwork';
  const { draft } = troubadour('Duelist', 8, { 'troubadour-kit': 'Arcane Archer', [key]: 'Exploding Arrow' });
  const sheet = buildSheet(db, draft);
  const archer = db.kits.find((k) => k.name === 'Arcane Archer');
  const spike = sheet.actions.mains.find((a) => a.id === archer.ability.id);
  assert.equal(spike.name, 'Test hero’s Exploding Arrow');
  assert.equal(spike.range, 'Ranged 15');
  draft.masterworkName = 'Sol’s Last Arrow';
  const swash = db.kits.find((k) => k.name === 'Swashbuckler');
  const slot = evaluate(db, draft).slots.find((s) => s.key === 'troubadour-kit');
  assert.ok(setPick(draft, slot, swash.id));
  const saved = JSON.parse(JSON.stringify(draft)),
    next = buildSheet(db, saved);
  const named = next.actions.mains.find((a) => a.id === archer.ability.id);
  assert.equal(named.name, 'Sol’s Last Arrow');
  assert.match(named.description, /Exploding Arrow.*Masterwork/);
  assert.equal(named.range, 'Ranged ' + (15 - archer.rangedDistance + swash.rangedDistance));
  for (const [i, k] of ['low', 'mid', 'high'].entries())
    assert.equal(
      Number(named.tests[0].tiers[k].damage),
      Number(spike.tests[0].tiers[k].damage) - archer.rangedDamage[i] + (swash.rangedDamage?.[i] || 0),
    );
  assert.ok(next.actions.mains.some((a) => a.id === swash.ability.id));
  const master = evaluate(db, saved).slots.find((s) => s.key === key);
  assert.ok(!master.choices.some((o) => o.name === 'Protective Attack'));
  assert.ok(setPick(saved, master, swash.ability.id));
  assert.ok(!buildSheet(db, saved).actions.mains.some((a) => a.id === archer.ability.id));
  const lowered = buildSheet(db, { ...draft, level: 7 });
  assert.ok(!lowered.actions.mains.some((a) => a.id === archer.ability.id));
  const forged = structuredClone(draft);
  forged.picks[key] = ['troubadour-encore'];
  forged.exceptions[key] = ['troubadour-encore'];
  assert.throws(() => buildSheet(db, forged));
  const dragon = troubadour('Duelist', 8, {}, 'Dragon Knight');
  const dragonSlot = dragon.model.slots.find((s) => s.key === key);
  for (const a of dragon.model.actions.filter((a) => a.cost === 'signature'))
    assert.ok(dragonSlot.choices.some((o) => o.id === a.id));
});

test('Troubadour rejects other acts, late abilities and stale class choices, and works with every ancestry and standard kit', () => {
  const { draft, model } = troubadour('Virtuoso');
  const slot = model.slots.find((s) => s.key === 'troubadour-virtuoso-ability-2');
  for (const id of [
    'troubadour-guest-star',
    'troubadour-jam-session',
    'troubadour-dramatic-reversal',
    'talent-mind-spike',
  ]) {
    const forged = structuredClone(draft);
    forged.picks[slot.key] = [id];
    forged.exceptions[slot.key] = [id];
    assert.equal(setPick(forged, slot, id, true), false);
    assert.throws(() => buildSheet(db, forged));
  }
  draft.picks.subclass = ['troubadour-auteur'];
  draft.level = 1;
  const actions = evaluate(db, draft).actions;
  assert.ok(actions.some((a) => a.name === 'Blocking'));
  assert.ok(!actions.some((a) => ['Encore', 'Harmonize', 'Thunder Mother'].includes(a.name)));
  const { draft: trained } = troubadour('Auteur', 1);
  for (const k of db.kits) {
    const at = structuredClone(trained);
    at.picks['troubadour-kit'] = [k.id];
    const sheet = buildSheet(db, at);
    assert.equal(sheet.hero.kit.name, k.name);
    assert.equal(
      Object.values(sheet.actions)
        .flat()
        .filter((a) => a.id === k.ability.id).length,
      1,
    );
  }
  for (const a of db.ancestries) assert.ok(troubadour('Virtuoso', 1, {}, a.name).model.complete);
});

// ---------------------------------------------------------------- rules audit, November 23, 2026
const damageOf = (sheet, name) => {
  const tiers = Object.values(sheet.actions)
    .flat()
    .find((a) => a.name === name).tests[0].tiers;
  return [tiers.low.damage, tiers.mid.damage, tiers.high.damage].map(Number);
};

test('a Null chooses an exploration, interpersonal or intrigue perk at levels 2, 6 and 10, and any perk at 4 and 8', () => {
  const { model } = build({ classId: 'null', level: 10 });
  const lists = (key) => [
    ...new Set(
      model.slots.find((s) => s.key === key).choices.map((o) => db.perks.find((p) => p.id === o.id).list),
    ),
  ];
  for (const key of ['null-2-1', 'null-6-3', 'null-10-5'])
    assert.deepEqual(lists(key).sort(), ['Exploration', 'Interpersonal', 'Intrigue'], key);
  for (const key of ['null-4-3', 'null-8-1']) assert.equal(lists(key).length, 6, key);
});

test('Master of Fire raises the Acolyte of Fire bonus to +5 for every magic ability, and replaces the +1', () => {
  const preferences = { 'elementalist-1-9': ['Viscous Fire', 'Unquiet Ground'] };
  const nine = build({ specialization: 'Fire', level: 9, preferences }).sheet;
  const ten = build({ specialization: 'Fire', level: 10, preferences }).sheet;
  // Reason is 4 at level 9 and 5 at level 10. Level 9: +1, on abilities with Fire and Magic only.
  assert.deepEqual(damageOf(nine, 'Viscous Fire'), [2 + 4 + 1, 5 + 4 + 1, 7 + 4 + 1]);
  assert.deepEqual(damageOf(nine, 'Unquiet Ground'), [2, 5, 7]);
  assert.deepEqual(damageOf(nine, 'Hurl Element'), [2 + 4, 4 + 4, 6 + 4]);
  // Level 10: +5 on every magic ability, and the +1 is not added on top of it.
  assert.deepEqual(damageOf(ten, 'Viscous Fire'), [2 + 5 + 5, 5 + 5 + 5, 7 + 5 + 5]);
  assert.deepEqual(damageOf(ten, 'Unquiet Ground'), [2 + 5, 5 + 5, 7 + 5]);
  assert.deepEqual(damageOf(ten, 'Hurl Element'), [2 + 5 + 5, 4 + 5 + 5, 6 + 5 + 5]);
  // A weapon free strike is not a magic ability.
  const strike = (sheet) =>
    damageOf(sheet, 'Melee Weapon Free Strike')[0] - Math.max(sheet.hero.stats.might, sheet.hero.stats.agility);
  assert.equal(strike(nine), 2);
  assert.equal(strike(ten), 2);
  const acolyte = (sheet) => sheet.features.find((f) => f.id === 'builder-elementalist-sub-2-1-1').text;
  assert.doesNotMatch(acolyte(nine), /Replaced by/);
  assert.match(acolyte(ten), /Replaced by One: Master of Fire\./);
  // The other specializations gain nothing from it.
  for (const specialization of ['Earth', 'Green', 'Void'])
    assert.deepEqual(
      damageOf(build({ specialization, level: 10, preferences }).sheet, 'Unquiet Ground'),
      [2, 5, 7],
    );
});

test('Master of Green adds 2 Recoveries and Master of Earth adds damage immunity 5, at level 10 only', () => {
  for (const sub of db.elementalist.subclasses)
    for (const level of [9, 10]) {
      const { sheet } = build({ specialization: sub.name, level });
      const green = sub.name === 'Green' && level === 10;
      const earth = sub.name === 'Earth' && level === 10;
      assert.equal(sheet.hero.vitals.recoveriesMax, 8 + (green ? 2 : 0), sub.name);
      assert.equal(sheet.hero.vitals.currentRecoveries, sheet.hero.vitals.recoveriesMax);
      assert.equal(sheet.sidebar.lists.immunity.includes('Damage 5'), earth, sub.name);
    }
  // The map reads "Damage 5" as immunity 5 to all damage.
  assert.deepEqual(parseDefenseText('Damage 5'), { type: '', value: 5 });
});

test('a Revenant whose former life was size 1S has 3 ancestry points, and 2 otherwise', () => {
  const revenant = (former) =>
    build({ ancestry: 'Revenant', preferences: { 'revenant-feature-1': former } });
  const traits = (model) => model.slots.find((s) => s.key === 'revenant-feature-4');
  const small = revenant('Polder');
  assert.equal(small.sheet.hero.vitals.size, '1S');
  assert.equal(traits(small.model).count, 3);
  assert.equal(traits(small.model).total, 3);
  for (const former of ['Human', 'Hakaan', 'Dwarf'])
    assert.equal(traits(revenant(former).model).count, 2, former);
  // Changing the former life to a larger ancestry takes the third point away again.
  const changed = structuredClone(small.draft);
  changed.picks['revenant-feature-1'] = ['ancestry-human'];
  const again = traits(evaluate(db, changed));
  assert.equal(again.count, 2);
  assert.ok(again.total <= 2);
});

test('Corrupted Mentor puts holy weakness 1 on the sheet', () => {
  const { sheet } = build({ complication: 'Corrupted Mentor' });
  assert.deepEqual(sheet.sidebar.lists.vulnerability, ['Holy 1']);
  assert.deepEqual(parseDefenseText('Holy 1'), { type: 'holy', value: 1 });
});

test('Shipwrecked makes the hero forget one language they know, of their choice', () => {
  const plain = build({ career: 'Agent' });
  const { draft, model, sheet } = build({ career: 'Agent', complication: 'Shipwrecked' });
  const slot = model.slots.find((s) => s.key === 'comp-shipwrecked-d');
  assert.equal(slot.step, 'Training');
  assert.equal(slot.count, 1);
  // Every language the hero knows is offered, Caelian last.
  assert.deepEqual(
    slot.choices.map((o) => o.name).sort(),
    [...sheet.sidebar.lists.languages, ...slot.selected].sort(),
  );
  assert.equal(slot.choices.at(-1).name, 'Caelian');
  assert.equal(sheet.sidebar.lists.languages.length, plain.sheet.sidebar.lists.languages.length - 1);
  assert.ok(!sheet.sidebar.lists.languages.includes(slot.selected[0]));
  assert.match(
    sheet.features.find((f) => f.id === 'builder-comp-shipwrecked-d').text,
    new RegExp('Forgotten language: ' + slot.selected[0]),
  );
  // The hero is not finished until the language is chosen, and may choose any of them.
  const open = structuredClone(draft);
  delete open.picks['comp-shipwrecked-d'];
  assert.equal(evaluate(db, open).complete, false);
  open.picks['comp-shipwrecked-d'] = ['Caelian'];
  assert.ok(!buildSheet(db, open).sidebar.lists.languages.includes('Caelian'));
});

test('Track is an intrigue skill on the sheet, the classic sheet, the map panel and when a test is asked for', () => {
  assert.equal(getSkillGroup('Track'), 'Intrigue');
  // The sheet's groups are the rulebook's: every skill the builder can grant is in the group the rules give it.
  for (const skill of db.skills) assert.equal(getSkillGroup(skill.name), skill.list, skill.name);
  assert.equal(Object.values(SKILL_GROUPS).flat().length, db.skills.length);
  const file = (path) => readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');
  const groupsIn = (source, end) =>
    new Function(
      source.slice(source.indexOf('const SKILL_GROUPS = {'), end(source)) + '\nreturn SKILL_GROUPS;',
    )();
  const lists = [
    groupsIn(file('character_sheet/sheet.js'), (s) => s.indexOf('const SORTED_SKILL_GROUPS')),
    groupsIn(
      file('vtt/assets/js/ui/character-summary-panel.js'),
      (s) => s.indexOf('};', s.indexOf('const SKILL_GROUPS = {')) + 2,
    ),
  ];
  for (const groups of lists)
    for (const [group, skills] of Object.entries(groups))
      assert.deepEqual([...skills].sort(), [...SKILL_GROUPS[group.replace(/ Skills$/, '')]].sort(), group);
  const php = file('includes/ask-test.php');
  assert.match(php, /'Intrigue' => \[[^\]]*'Track'[^\]]*\]/);
  assert.doesNotMatch(php, /'Exploration' => \[[^\]]*'Track'[^\]]*\]/);
  // A Stormwight's Track is filed under Intrigue.
  const { sheet } = fury('Stormwight', 1);
  assert.ok('Track' in sheet.sidebar.skills);
  assert.equal(getSkillGroup('Track', sheet.sidebar.skills.Track), 'Intrigue');
});

test('the resource text of the Censor, Null and Elementalist says what is gained each turn', () => {
  for (const [classId, resource] of [
    ['censor', 'Wrath'],
    ['null', 'Discipline'],
    ['elementalist', 'Essence'],
  ])
    for (const [level, gain] of [
      [1, 2],
      [7, 3],
      [10, 4],
    ]) {
      const specialization = classId === 'censor' ? 'Paragon' : undefined;
      const text = build({ classId, level, specialization }).sheet.sidebar.resource.text;
      const opening =
        'Start combat with ' + resource + ' equal to Victories. Gain ' + gain + ' at the start of each turn. Gain ';
      assert.ok(text.startsWith(opening), text);
    }
});
