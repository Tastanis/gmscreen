// Build a fresh, portable sheet in memory. No profile ID, storage API, or sheet endpoint is involved.
import { defaultSheet, defaultTestTier, ACTION_LABELS } from '../parts/sheet-model.js';
import { evaluate, featureText, distanceText, abilityLines, actionLabel } from './rules.mjs';

const html = (text) =>
  String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\n/g, '<br>');
const points = (f, r) =>
  (f.value || 0) +
  (f.valuePerLevel || 0) * (r.level - 1) +
  (f.valuePerEchelon || 0) * Math.ceil(r.level / 3) +
  (f.valueCharacteristics?.length ? Math.max(...f.valueCharacteristics.map((c) => r.stats[c])) : 0);
function total(r, field, base = 0) {
  return r.grants
    .filter((f) => f.kind === 'Bonus' && f.field === field)
    .reduce((v, f) => v + points(f, r), base);
}
export function vitals(r) {
  const size = r.grants.find((f) => f.kind === 'Size') || r.former?.features.find((f) => f.kind === 'Size');
  const kit = r.kit;
  const stamina = total(r, 'Stamina') + (kit?.stamina || 0) * Math.ceil(r.level / 3),
    recoveries = total(r, 'Recoveries');
  return {
    size: size ? String(size.sizeValue) + (size.sizeMod || '') : '1M',
    speed: total(r, 'Speed', r.grants.find((f) => f.kind === 'Speed')?.speed || 5) + (kit?.speed || 0),
    stability: total(r, 'Stability') + (kit?.stability || 0),
    disengage: total(r, 'Disengage', 1) + (kit?.disengage || 0),
    save:
      Math.min(6, ...r.grants.filter((f) => f.kind === 'SaveThreshold').map((f) => f.value)) -
      total(r, 'Saving throws'),
    staminaMax: stamina,
    currentStamina: stamina,
    recoveriesMax: recoveries,
    currentRecoveries: recoveries,
    recoveryValue: total(r, 'Recovery Value', Math.floor(stamina / 3)),
  };
}
const types = { Main: 'mains', Maneuver: 'maneuvers', Trigger: 'triggers', Move: 'maneuvers' };
const characteristics = { M: 'Might', A: 'Agility', R: 'Reason', I: 'Intuition', P: 'Presence' };
function tier(text, stats, bonus) {
  const t = defaultTestTier();
  // Conditional damage stays in notes so an ally target isn't assigned the enemy's damage.
  if (/^An enemy takes \d+ damage;/i.test(text)) {
    t.notes = text.replace(/\d+/, (n) => String(Number(n) + bonus));
    return t;
  }
  const match =
    /^(?:(?<dice>\d+d\d+)\s*\+\s*)?(?<base>\d+)(?:\s*\+\s*(?<chars>[MARIP](?:(?:,\s*(?:or\s+)?|\s+or\s+)[MARIP])*))?\s+(?:(?<type>\w+)\s+)?damage\b[;,.:]?\s*(?<notes>.*)$/is.exec(
      text || '',
    );
  if (!match) {
    t.notes = text || '';
    return t;
  }
  const { dice, base, chars, type, notes } = match.groups;
  const modifier = chars ? Math.max(...chars.match(/[MARIP]/g).map((c) => stats[characteristics[c]])) : 0;
  const flat = Number(base) + modifier + bonus;
  t.damage = dice ? dice + ' + ' + flat : String(flat);
  t.damageType = type || '';
  t.notes = notes;
  return t;
}
function matches(f, a) {
  return (f.keywords || []).every((k) => a.keywords?.includes(k));
}
function action(a, r, group) {
  const bonus = r.grants
    .filter((f) => f.kind === 'AbilityDamage' && matches(f, a))
    .reduce((sum, f) => sum + f.value, 0);
  const rangeBonus = r.grants
    .filter((f) => f.kind === 'AbilityDistance' && matches(f, a))
    .reduce((sum, f) => sum + f.value, 0);
  // The published kit signature card already includes that kit's bonuses.
  const isKitSignature = a.id === r.kit?.ability?.id || r.kit?.signatureIds?.includes(a.id);
  const kit = !isKitSignature && a.keywords?.includes('Weapon') ? r.kit : null;
  const reachModes = ['Melee', 'Ranged'].filter((mode) => a.keywords?.includes(mode));
  const kitDistance = (mode) => kit?.[mode?.toLowerCase() + 'Distance'] || 0;
  const distance = (a.distance || []).map((p) => {
    if (p.kind === 'Ranged') return { ...p, args: [(p.args?.[0] || 5) + rangeBonus + kitDistance('Ranged')] };
    if (p.kind === 'Melee') return { ...p, args: [(p.args?.[0] || 1) + kitDistance('Melee')] };
    if (p.within) return { ...p, within: p.within + rangeBonus + kitDistance(reachModes[0]) };
    return p;
  });
  const damage = (mode) => kit?.[mode.toLowerCase() + 'Damage'] || [0, 0, 0];
  const splitRoll =
    kit && reachModes.length === 2 && damage('Melee').some((v, i) => v !== damage('Ranged')[i]);
  const modes = splitRoll ? reachModes : [reachModes[0] || ''];
  const sections = a.sections || [];
  const tests = sections
    .filter((s) => s.kind === 'PowerRoll')
    .flatMap((s, i) =>
      modes.map((mode) => ({
        id: a.id + '-roll-' + i + (splitRoll ? '-' + mode.toLowerCase() : ''),
        label:
          (s.name ? s.name + ' · ' : '') +
          (splitRoll ? mode + ' · ' : '') +
          'Power Roll · ' +
          (s.characteristic || []).join(' or '),
        rollMod: s.characteristic?.length ? String(Math.max(...s.characteristic.map((c) => r.stats[c]))) : '',
        tiers: Object.fromEntries(
          ['low', 'mid', 'high'].map((key, i) => [
            key,
            tier(s['tier' + (i + 1)], r.stats, bonus + damage(mode)[i]),
          ]),
        ),
      })),
    );
  const description = [
    a.description,
    ...abilityLines({ ...a, sections: sections.filter((s) => s.kind !== 'PowerRoll') }, rangeBonus),
  ];
  if (group === 'freeStrikes' && r.classId === 'tactician')
    description.push(
      ...r.grants.filter((f) => f.tag === 'tactician-arsenal').map((f) => f.name + ' · ' + f.description),
    );
  if (tests.some((test) => Object.values(test.tiers).some((tier) => tier.damage))) {
    if (r.grants.some((f) => f.id === 'domain-sun-7'))
      description.push(
        'Light of the Burning Sun · Deal an extra 5 fire damage to another creature, or 15 if it is undead.',
      );
    if (r.grants.some((f) => f.id === 'domain-storm-7'))
      description.push(
        'Ride the Lightning · Deal an extra ' + r.stats.Presence + ' lightning damage to another creature.',
      );
    if (r.grants.some((f) => f.id === 'domain-death-7'))
      description.push('Word of Death Deferred · Deal an extra 5 damage to winded creatures.');
  }
  if (a.name === 'Hurl Element')
    description.push(
      'Can be used as a ranged free strike. Apply fire-specific damage bonuses when choosing fire damage.',
    );
  return {
    id: a.id,
    name: a.name,
    actionLabel:
      a.type?.free || a.type?.args?.[1]?.free || a.type?.kind === 'Move'
        ? actionLabel(a)
        : ACTION_LABELS[group],
    tags: a.keywords || [],
    range: distanceText(distance),
    target: a.target || '',
    cost: typeof a.cost === 'number' ? a.cost + ' ' + (a.resource || r.heroClass.resource) : '',
    description: html(description.filter(Boolean).join('\n')),
    trigger: a.type?.args?.[0] || '',
    useWhen: '',
    ...(a.automation ? { automation: structuredClone(a.automation) } : {}),
    tests,
  };
}
function weaponStrike(r, melee) {
  const name = melee ? 'Melee' : 'Ranged';
  const values = melee ? [2, 5, 7] : [2, 4, 6];
  return action(
    {
      id: 'basic-strike-' + name.toLowerCase(),
      name: name + ' Weapon Free Strike',
      keywords: melee ? ['Charge', 'Melee', 'Strike', 'Weapon'] : ['Ranged', 'Strike', 'Weapon'],
      distance: [{ kind: name, args: [melee ? 1 : 5] }],
      target: 'One creature or object',
      sections: [
        {
          kind: 'PowerRoll',
          characteristic: ['Might', 'Agility'],
          ...Object.fromEntries(values.map((v, i) => ['tier' + (i + 1), v + ' + M or A damage'])),
        },
      ],
    },
    r,
    'freeStrikes',
  );
}
function resourceAutomation(r) {
  const { level, classId } = r;
  if (classId === 'null') return structuredClone(r.grants.find((f) => f.id === 'null-resource').automation);
  const fixed = (amount) => ({ amount });
  const rule = (id, event, filter, kind, amount, autoApply = false, limit = null) => ({
    id,
    event,
    filter,
    effect: { kind, amount },
    limit,
    autoApply,
    enabled: true,
  });
  const oncePerRound = (id, event, filter, amount) =>
    rule(id, event, filter, 'gain', fixed(amount), false, {
      scope: 'round',
      key: id,
      target: 'self',
      markOn: 'offered',
    });
  if (classId === 'talent') {
    return {
      schema: 'heroic-resource/v1',
      rules: [
        rule('talent-combat-start', 'combatStart', {}, 'set', { from: 'victories' }, true),
        rule('talent-turn', 'turnStart', { whose: 'self' }, 'gain', {
          dice: '1d3',
          bonus: level === 10 ? 2 : level >= 7 ? 1 : 0,
        }),
        oncePerRound('talent-force-moved', 'forcedMovement', { minDistance: 1 }, roundGain(level)),
        rule(
          'talent-strain',
          'turnEnd',
          { whose: 'self' },
          'damage',
          { from: 'negativeResource' },
          level < 10,
        ),
        rule('talent-combat-end', 'combatEnd', {}, 'set', fixed(0), true),
      ],
    };
  }
  if (classId === 'fury' || classId === 'shadow') {
    const damageGain = roundGain(level);
    const damageRules = [];
    if (classId === 'shadow') {
      damageRules.push(
        oncePerRound(
          'shadow-surge-damage',
          'damageDealt',
          { whose: 'self', includesSurge: true, minAmount: 1 },
          damageGain,
        ),
      );
    } else {
      damageRules.push(
        oncePerRound('fury-first-damage', 'damage', { whose: 'self', minAmount: 1 }, damageGain),
      );
      const limit = {
        scope: 'encounter',
        key: 'fury-first-winded-or-dying',
        target: 'self',
        markOn: 'offered',
      };
      for (const event of ['winded', 'dying'])
        damageRules.push(
          rule('fury-' + event, event, { whose: 'self' }, 'gain', { dice: '1d3' }, false, limit),
        );
    }
    return {
      schema: 'heroic-resource/v1',
      rules: [
        rule(classId + '-combat-start', 'combatStart', {}, 'set', { from: 'victories' }, true),
        rule(classId + '-turn', 'turnStart', { whose: 'self' }, 'gain', {
          dice: '1d3',
          bonus: level >= 7 ? 1 : 0,
        }),
        ...damageRules,
        rule(classId + '-combat-end', 'combatEnd', {}, 'set', fixed(0), true),
      ],
    };
  }
  if (classId === 'conduit') {
    const domainEvents = {
      Creation: ['actionUsed', { withinSquares: 10, distanceTo: 'actor', keywordsAny: ['area'] }],
      Knowledge: ['maliceSpent', {}],
      Nature: [
        'damage',
        { withinSquares: 10, damageTypeAny: ['acid', 'cold', 'fire', 'lightning', 'poison', 'sonic'] },
      ],
      Storm: ['forcedMovement', { whose: 'enemy', withinSquares: 10 }],
      Sun: ['damage', { whose: 'enemy', withinSquares: 10, damageTypeAny: ['fire', 'holy'] }],
    };
    const domainRules = r.domains
      .filter((d) => domainEvents[d.name])
      .map((d) => {
        const [event, filter] = domainEvents[d.name];
        const id = 'conduit-piety-' + d.id;
        return rule(id, event, filter, 'gain', fixed(level >= 4 ? 3 : 2), false, {
          scope: 'encounter',
          key: id,
        });
      });
    return {
      schema: 'heroic-resource/v1',
      rules: [
        rule('conduit-combat-start', 'combatStart', {}, 'set', { from: 'victories' }, true),
        {
          ...rule('conduit-turn', 'turnStart', { whose: 'self' }, 'gain', {
            dice: '1d3',
            bonus: level >= 7 ? 1 : 0,
          }),
          prompt:
            'Decide whether to pray before rolling. Gain {amount} Piety and apply any prayer outcome from your Piety feature.',
        },
        ...domainRules,
        rule('conduit-combat-end', 'combatEnd', {}, 'set', fixed(0), true),
      ],
    };
  }
  const damageRules =
    classId === 'tactician'
      ? []
      : classId === 'censor'
        ? [
            oncePerRound(
              'censor-damage-dealt',
              'damageDealt',
              { whose: 'self', targetWhose: 'judgedTarget' },
              level >= 4 ? 2 : 1,
            ),
            oncePerRound('censor-damage-taken', 'damage', { whose: 'self', sourceWhose: 'judgedTarget' }, 1),
          ]
        : [
            oncePerRound(
              'elementalist-first-damage',
              'damage',
              { withinSquares: 10, damageTypeNot: ['untyped', 'holy'] },
              level >= 4 ? 2 : 1,
            ),
          ];
  return {
    schema: 'heroic-resource/v1',
    rules: [
      rule(classId + '-combat-start', 'combatStart', {}, 'set', { from: 'victories' }, true),
      rule(
        classId + '-turn',
        'turnStart',
        { whose: 'self' },
        'gain',
        fixed(level >= 10 ? 4 : level >= 7 ? 3 : 2),
      ),
      ...damageRules,
      rule(classId + '-combat-end', 'combatEnd', {}, 'set', fixed(0), true),
    ],
  };
}
function roundGain(level) {
  return level >= 10 ? 3 : level >= 4 ? 2 : 1;
}
function resourceSummary(r) {
  const resource = r.heroClass.resource;
  if (r.classId === 'talent') {
    const gain = r.level === 10 ? '1d3 + 2' : r.level >= 7 ? '1d3 + 1' : '1d3';
    return (
      'Start combat with Clarity equal to Victories. Gain ' +
      gain +
      ' at the start of each turn and ' +
      roundGain(r.level) +
      ' the first time each round a creature is force moved. Your Clarity can fall to −' +
      (1 + r.stats.Reason) +
      '. While below zero, you are strained. At turn end take 1 damage per negative point. Reset Clarity to zero at combat end.' +
      (r.level === 10
        ? ' Psion lets you decline the turn-end damage or use an ability’s strained effect while unstrained.'
        : '')
    );
  }
  if (r.classId === 'tactician')
    return (
      'Start combat with Focus equal to Victories. Gain ' +
      (r.level >= 10 ? 4 : r.level >= 7 ? 3 : 2) +
      ' at the start of each turn. Once each round, add ' +
      (r.level >= 4 ? 2 : 1) +
      ' Focus the first time you or an ally damages a creature you marked. Separately, add 1 Focus the first time each round an ally within 10 squares uses a heroic ability. Lose remaining Focus when combat ends.'
    );
  if (r.classId === 'shadow' || r.classId === 'fury') {
    const turnGain = r.level >= 7 ? '1d3 + 1' : '1d3';
    const start =
      'Start combat with ' +
      resource +
      ' equal to Victories. Gain ' +
      turnGain +
      ' at the start of each turn, and ' +
      roundGain(r.level);
    if (r.classId === 'fury')
      return (
        start +
        ' the first time you take damage each round. Gain 1d3 the first time you become winded or are dying in an encounter. Lose remaining Ferocity when combat ends.'
      );
    return (
      start +
      ' the first time each round you deal damage using one or more surges. A heroic ability with a power roll costs 1 less Insight if you have an edge or double edge against any target. Lose remaining Insight when combat ends.' +
      (r.level >= 9 ? ' You can forgo the turn-start gain to use Gloom Squad.' : '')
    );
  }
  return r.classId === 'conduit'
    ? 'Start combat with Piety equal to Victories. Gain ' +
        (r.level >= 7 ? '1d3 + 1' : '1d3') +
        ' at the start of each turn. Decide whether to pray before rolling. On a natural 1 or 2, gain 1 extra Piety. On a 1, also take 1d6 + level irreducible psychic damage. On a 3, gain 2 extra Piety and you may activate one domain effect.' +
        (r.level >= 10 ? ' Gain 1 additional Piety whenever you pray.' : '') +
        ' Each chosen domain can grant ' +
        (r.level >= 4 ? 3 : 2) +
        ' Piety once per encounter. Lose remaining Piety when combat ends.'
    : 'Start combat with ' +
        resource +
        ' equal to Victories. ' +
        (r.level >= 10 ? 4 : r.level >= 7 ? 3 : 2) +
        ' at the start of each turn. Gain ' +
        (r.level >= 4 ? 2 : 1) +
        (r.classId === 'null'
          ? ' the first time each round an enemy in your Null Field uses a main action. Also gain 1 the first time each round the Director spends Malice on an ability.'
          : r.classId === 'censor'
            ? ' the first time each round you damage a creature judged by you. Gain 1 the first time each round a creature judged by you damages you.'
            : ' the first time each round you or a creature within 10 takes damage other than untyped or holy.') +
        ' Lose remaining ' +
        resource +
        ' at the end of combat.';
}
export function buildSheet(db, draft) {
  const r = evaluate(db, draft);
  if (!r.complete) throw Error('Complete the required choices before downloading.');
  const sheet = defaultSheet(),
    hero = sheet.hero;
  Object.assign(hero, {
    name: draft.name.trim(),
    level: r.level,
    class: r.heroClass.name,
    classTrack: r.classTrack,
    ancestry: r.ancestry.name + (r.former ? ' (' + r.former.name + ')' : ''),
    complication: r.complication?.name || '',
    culture: { culture: draft.cultureName || '', ...r.culture },
    career: {
      career: r.career.name,
      incitingIncident:
        r.incident.id === 'original'
          ? draft.incident
          : [r.incident.name, r.incident.description].filter(Boolean).join(' — '),
    },
    wealth: total(r, 'Wealth', 1),
    renown: total(r, 'Renown'),
    stats: Object.fromEntries(Object.entries(r.stats).map(([k, v]) => [k.toLowerCase(), v])),
  });
  Object.assign(hero.vitals, vitals(r));
  const resource = r.heroClass.resource;
  Object.assign(hero.resource, {
    title: resource,
    automation: resourceAutomation(r),
    ...(r.classId === 'talent' ? { allowNegative: true } : {}),
    ...(r.classId === 'shadow' ? { discountOnPowerRollEdge: true } : {}),
  });
  if (r.battleGear) Object.assign(hero.kit, r.battleGear);
  if (r.kit) {
    const k = r.kit;
    Object.assign(hero.kit, {
      name: k.name,
      armor: k.armor.join(', ') || 'None',
      weapon: k.weapon.join(', '),
    });
    for (const key of ['speed', 'stability', 'disengage', 'meleeDistance', 'rangedDistance'])
      hero.kit[key] = String(k[key]);
    hero.kit.stamina = String(k.stamina * Math.ceil(r.level / 3));
    for (const mode of ['melee', 'ranged'])
      ['Low', 'Mid', 'High'].forEach((t, i) => {
        hero.kit[mode + 'Damage' + t] = String(k[mode + 'Damage']?.[i] || 0);
      });
  }
  sheet.sidebar.resource = { title: resource, text: resourceSummary(r) };
  sheet.sidebar.lists.languages = [...r.languages];
  sheet.sidebar.skills = Object.fromEntries(
    [...r.skills.keys()].map((k) => [k, { level: 'Trained', bonus: '' }]),
  );
  for (const [type, field] of [
    ['Immunity', 'immunity'],
    ['Weakness', 'vulnerability'],
  ]) {
    const values = new Map();
    for (const m of r.grants.flatMap((f) => f.modifiers || []).filter((m) => m.modifierType === type)) {
      const n =
        m.kind === 'DamagePerLevel'
          ? m.value * r.level
          : m.kind === 'DamageValuePlusPerLevel'
            ? m.value + m.perLevel * r.level
            : m.kind === 'DamageCharacteristic'
              ? Math.max(...m.characteristics.map((c) => r.stats[c])) * (m.multiplier || 1)
              : m.value;
      values.set(m.damageType, Math.max(n, values.get(m.damageType) || 0));
    }
    if (type === 'Immunity' && r.grants.some((f) => f.id === 'domain-sun-7'))
      values.set('Fire', (values.get('Fire') || 0) + r.level);
    sheet.sidebar.lists[field] = [...values].map(([k, v]) => k + ' ' + v);
  }
  const feature = (id, title, text, tags = []) => ({ id, title, text: html(text), tags, useWhen: '' });
  sheet.features = r.grants
    .filter((f) => f.kind !== 'Multiple' || f.description)
    .map((f) => feature('builder-' + f.id, f.name, f.description || featureText(f), [f.source]));
  const potency = r.stats[r.heroClass.potency];
  sheet.features.push(
    feature(
      'builder-potency',
      r.heroClass.name + ' potency',
      'Weak ' + (potency - 2) + ' · Average ' + (potency - 1) + ' · Strong ' + potency,
    ),
  );
  if (r.complication)
    sheet.features.push(
      feature('builder-complication', r.complication.name, r.complication.description, ['Complication']),
    );
  if (r.warnings.length)
    sheet.features.push(
      feature('builder-exceptions', 'House rules', r.warnings.map((w) => w.message).join('\n')),
    );
  for (const a of r.actions) {
    const group = types[a.type?.kind] || 'mains';
    sheet.actions[group].push(action(a, r, group));
  }
  sheet.actions.freeStrikes.push(weaponStrike(r, true), weaponStrike(r, false));
  for (const a of r.actions.filter((a) => a.asFreeStrike || a.id === 'conduit-ray-of-wrath'))
    sheet.actions.freeStrikes.push(action({ ...a, id: a.id + '-free-strike' }, r, 'freeStrikes'));
  if (r.classId === 'talent') {
    const speech = sheet.features.find((f) => f.id === 'builder-talent-telepathic-speech');
    const spike = sheet.actions.mains.find((a) => a.id === 'talent-mind-spike');
    const distance = r.grants.some((f) => f.id === 'talent-universal-connection')
      ? 'anywhere on the same world'
      : r.grants.some((f) => f.id === 'talent-remote-amplification')
        ? '1 mile'
        : spike.range.replace(/^Ranged (\d+)$/, '$1 squares');
    speech.text += '<br>Current range · ' + html(distance);
  }
  return sheet;
}
