// Every screen and the sheet writer use this evaluator. Only reachable choices contribute.
export const STEPS = ['Identity', 'Ancestry', 'Background', 'Class', 'Training', 'Review'];
export const STATS = ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'];
export const ARRAYS = [
  [2, 2, -1, -1],
  [2, 1, 1, -1],
  [2, 1, 0, 0],
  [1, 1, 1, 0],
];
const martialArrays = [
  [2, -1, -1],
  [1, 1, -1],
  [1, 0, 0],
];
export const CLASSES = {
  censor: {
    name: 'Censor',
    subclassLabel: 'Censor order',
    primary: ['Might', 'Presence'],
    potency: 'Presence',
    arrays: martialArrays,
    resource: 'Wrath',
  },
  conduit: {
    name: 'Conduit',
    primary: ['Intuition'],
    potency: 'Intuition',
    arrays: ARRAYS,
    resource: 'Piety',
  },
  elementalist: {
    name: 'Elementalist',
    subclassLabel: 'Elemental specialization',
    primary: ['Reason'],
    potency: 'Reason',
    arrays: ARRAYS,
    resource: 'Essence',
  },
  fury: {
    name: 'Fury',
    subclassLabel: 'Primordial aspect',
    primary: ['Might', 'Agility'],
    potency: 'Might',
    arrays: martialArrays,
    resource: 'Ferocity',
  },
  null: {
    name: 'Null',
    subclassLabel: 'Null tradition',
    primary: ['Agility', 'Intuition'],
    potency: 'Intuition',
    arrays: martialArrays,
    resource: 'Discipline',
  },
};
export const newDraft = () => ({
  version: 1,
  classId: 'elementalist',
  name: '',
  level: 1,
  picks: { complication: ['none'] },
  exceptions: {},
});
const distinct = (values) => [...new Set(values)];
const option = (id, name, description = '', extra = {}) => ({ id, name, description, ...extra });
const entry = (x) => option(x.id ?? x.name, x.name, x.description);
const escapeWord = (value) => String(value ?? '').trim();
const plus = (n) => (n >= 0 ? '+' + n : String(n));
const labelWords = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2');
const perms = (a) =>
  a.length
    ? distinct(a).flatMap((n) => {
        const rest = a.slice();
        rest.splice(rest.indexOf(n), 1);
        return perms(rest).map((t) => [n, ...t]);
      })
    : [[]];

export function featureName(f) {
  return (
    f.name ||
    f.ability?.name ||
    f.characteristic ||
    f.field ||
    (f.modifiers || []).map((m) => m.damageType + ' ' + m.modifierType).join(', ') ||
    (f.conditions || []).join(', ') ||
    labelWords(f.kind)
  );
}
function modifierText(f) {
  return [
    f.value !== undefined && plus(f.value),
    f.valuePerLevel && plus(f.valuePerLevel) + ' for each level after 1st',
    f.valuePerEchelon && plus(f.valuePerEchelon) + ' per echelon',
    f.valueCharacteristics?.length && f.valueCharacteristics.join(' or '),
  ]
    .filter(Boolean)
    .join(', ');
}
export function abilityLines(a) {
  return (a.sections || []).flatMap((s) => {
    if (s.kind === 'PowerRoll')
      return [
        (s.name ? s.name + ' · ' : '') + 'Power roll + ' + (s.characteristic || []).join(' or '),
        '≤11 · ' + s.tier1,
        '12–16 · ' + s.tier2,
        '17+ · ' + s.tier3,
      ];
    if (s.kind === 'AbilitySectionSpend')
      return [
        (s.name || 'Spend') +
          ' ' +
          (s.value ?? 1) +
          ' ' +
          (a.resource || 'Essence').toLowerCase() +
          ' · ' +
          s.effect +
          (s.repeatable ? ' (repeatable)' : ''),
      ];
    return [s.title, s.text, ...(s.args || []), s.effect].filter((x) => typeof x === 'string');
  });
}
export function distanceText(d) {
  return (d || [])
    .map((p) => {
      if (p.kind === 'Melee' && !p.args?.length) return 'Melee 1';
      if (p.type)
        return [
          p.count && p.count + ' ' + p.type.toLowerCase() + ', each',
          p.value,
          p.value2 && '× ' + p.value2,
          !p.count && p.type,
          p.within && 'within ' + p.within,
        ]
          .filter(Boolean)
          .join(' ');
      return [p.kind === 'Special' ? '' : p.kind, ...(p.args || [])].filter(Boolean).join(' ') || 'Special';
    })
    .join(' or ');
}
export function featureText(f) {
  if (f.kind === 'GrantAbility') return abilityText(f.ability);
  const lines = [f.description];
  if (f.kind === 'Multiple')
    lines.push(...(f.features || []).map((x) => featureName(x) + ' · ' + featureText(x)));
  if (f.kind === 'Bonus' || f.kind === 'CharacteristicBonus')
    lines.push(featureName(f) + ' ' + modifierText(f));
  if (f.kind === 'DamageModifier')
    for (const m of f.modifiers)
      lines.push(
        [
          m.damageType,
          m.modifierType,
          m.kind === 'DamagePerLevel'
            ? m.value + ' × level'
            : m.kind === 'DamageCharacteristic'
              ? (m.multiplier > 1 ? m.multiplier + ' × ' : '') + m.characteristics?.join(' or ')
              : modifierText(m) + (m.perLevel ? ' + ' + m.perLevel + ' × level' : ''),
        ].join(' '),
      );
  if (f.id === 'elementalist-resource')
    lines.push(
      'At the start of combat, gain essence equal to your Victories. Remaining essence is lost when the encounter ends. Outside combat, use an essence ability or effect for free once until you earn a Victory or finish a respite. Outside combat, persistent effects last up to your Victories in rounds and unlimited essence spending is capped at your Victories.',
    );
  if (f.kind === 'HeroicResource' || f.kind === 'HeroicResourceGain')
    for (const g of f.gains ?? [f]) lines.push([g.trigger, g.value, g.frequency].filter(Boolean).join(' · '));
  if (f.kind === 'RollModifier')
    lines.push(
      [
        f.modifier,
        f.rollType,
        ...(f.characteristics || []),
        ...(f.skills || []),
        ...(f.skillLists || []),
        f.condition,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  if (/^Ability(Damage|Distance)$/.test(f.kind))
    lines.push(
      plus(f.value) + ' ' + labelWords(f.kind).toLowerCase() + ' · ' + (f.keywords || []).join(', '),
    );
  if (f.kind === 'Proficiency') lines.push([...(f.armor || []), ...(f.weapons || [])].join(', '));
  if (f.kind === 'SurgeGain') lines.push([f.trigger, f.value, f.frequency].filter(Boolean).join(' · '));
  if (f.kind === 'ConditionImmunity') lines.push('Immune to ' + f.conditions.join(', '));
  if (f.kind === 'Size') lines.push('Size ' + f.sizeValue + (f.sizeMod || ''));
  if (f.kind === 'Speed') lines.push('Speed ' + f.speed);
  if (f.kind === 'MovementMode') lines.push(f.mode);
  if (f.kind === 'PotencyResistance')
    lines.push('Potency resistance · ' + (f.characteristics || []).join(', '));
  if (f.kind === 'SaveThreshold') lines.push('Saving throws succeed on ' + f.value + ' or higher.');
  return distinct(lines.filter(Boolean)).join('\n');
}
export function actionLabel(a) {
  if (a.type?.kind === 'Maneuver' && a.type.free) return 'Free maneuver';
  if (a.type?.kind === 'Trigger' && (a.type.free || a.type.args?.[1]?.free)) return 'Free triggered action';
  return { Main: 'Main action', Maneuver: 'Maneuver', Trigger: 'Triggered action', Move: 'Move action' }[
    a.type?.kind
  ];
}
function kitText(kit, level) {
  return [
    kit.description,
    kit.equipment,
    kit.stamina && '+' + kit.stamina + ' Stamina per echelon',
    ...['speed', 'stability', 'disengage'].filter((k) => kit[k]).map((k) => '+' + kit[k] + ' ' + k),
    ...['melee', 'ranged'].flatMap((reach) => [
      kit[reach + 'Damage'] && reach + ' damage ' + kit[reach + 'Damage'].map(plus).join('/'),
      kit[reach + 'Distance'] && reach + ' distance +' + kit[reach + 'Distance'],
    ]),
    kit.ability.name + ' · ' + abilityText(kit.ability),
    ...(kit.featuresByLevel || [])
      .filter((t) => t.level <= level)
      .flatMap((t) => t.features.map((f) => featureName(f) + ' · ' + featureText(f))),
  ]
    .filter(Boolean)
    .join('\n');
}
function stormAbility(a, kit) {
  if (!a.usesStormDamage || !kit?.stormDamage) return a;
  const damage = kit.stormDamage.toLowerCase();
  return {
    ...a,
    description: a.description + ' Your primordial damage type is ' + damage + '.',
    sections: a.sections.map((s) =>
      s.kind === 'PowerRoll'
        ? {
            ...s,
            ...Object.fromEntries(
              ['tier1', 'tier2', 'tier3'].map((k) => [k, s[k].replace(/\bdamage\b/, damage + ' damage')]),
            ),
          }
        : s,
    ),
  };
}
export function abilityText(a) {
  const type = actionLabel(a);
  return [
    a.description,
    [
      type,
      ...(a.keywords || []),
      distanceText(a.distance),
      a.target,
      a.cost === 'signature'
        ? 'Signature'
        : typeof a.cost === 'number'
          ? a.cost + ' ' + (a.resource || 'Essence').toLowerCase()
          : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ...(a.type?.kind === 'Trigger' ? ['Trigger · ' + (a.type.args?.[0] || a.type.trigger || '')] : []),
    ...abilityLines(a),
  ]
    .filter(Boolean)
    .join('\n');
}

export function evaluate(db, draft) {
  const slots = [],
    grants = [],
    actions = [],
    skills = new Map(),
    languages = new Set(['Caelian']);
  const skillQueue = [],
    languageQueue = [],
    cancelQueue = [],
    usedPerks = new Set(),
    usedAbilities = new Set();
  const stats = Object.fromEntries(STATS.map((s) => [s, 0]));
  const errors = [],
    warnings = [];
  const picks = draft.picks || {},
    exceptions = draft.exceptions || {};
  // Drafts created before class selection are Elementalists.
  const requested = draft.classId ?? 'elementalist';
  const classId = Object.hasOwn(CLASSES, requested) ? requested : 'elementalist';
  const heroClass = CLASSES[classId],
    catalog = db[classId];
  if (classId !== requested) errors.push({ step: 'Identity', message: 'Choose a supported class.' });
  const level = Number(draft.level);
  if (!Number.isInteger(level) || level < 1 || level > 10)
    errors.push({ step: 'Identity', message: 'Choose a level from 1 to 10.' });
  if (!escapeWord(draft.name)) errors.push({ step: 'Identity', message: 'Enter your hero’s name.' });
  function choose(step, key, title, choices, config = {}) {
    const {
      count = 1,
      minimum = count,
      source = '',
      points = false,
      flexible = false,
      description = '',
    } = config;
    const byId = new Map(choices.map((o) => [o.id, o]));
    const input = Array.isArray(picks[key]) ? distinct(picks[key]) : [];
    const selected = [];
    let total = 0;
    for (const id of input) {
      const o = byId.get(id);
      if (!o || (o.warning && (!flexible || !exceptions[key]?.includes(id)))) continue;
      const cost = points ? o.cost : 1;
      if (total + cost > count || (o.family && selected.some((v) => byId.get(v)?.family === o.family)))
        continue;
      selected.push(id);
      total += cost;
      if (o.warning)
        warnings.push({ step, key, value: id, message: title + ' · ' + o.name + ' — ' + o.warning });
    }
    const slot = {
      step,
      key,
      title,
      choices,
      source,
      description,
      count,
      minimum,
      points,
      flexible,
      selected,
      total,
      complete: total >= minimum,
    };
    slots.push(slot);
    if (!slot.complete)
      errors.push({
        step,
        key,
        message: title + ' · ' + (minimum - total) + (points ? ' points remaining' : ' to choose'),
      });
    return selected;
  }
  function pickRecord(step, key, title, records, config) {
    const [id] = choose(step, key, title, records.map(entry), config);
    return records.find((x) => (x.id ?? x.name) === id);
  }
  let ancestry, former, career, complication, subclass, incident, deity, kit;
  let domains = [];
  const firstDomainAtTier = new Map();
  function visit(f, step, source, prefix = '', earnedAt = 1) {
    const key = prefix + (f.id || f.ability?.id || f.kind);
    const title = featureName(f),
      description = featureText(f);
    const config = { source, description: f.description || '' };
    if (f.kind === 'SkillChoice') {
      skillQueue.push({ f, key, source, earnedAt });
      return;
    }
    if (f.kind === 'LanguageChoice') {
      languageQueue.push({ f, key, source });
      return;
    }
    if (f.kind === 'SkillCancelChoice') {
      cancelQueue.push({ f, key, source });
      return;
    }
    if (f.kind === 'Ancestry') {
      former = pickRecord(
        step,
        key,
        'Former life',
        db.ancestries.filter((a) => a.id !== ancestry.id),
        config,
      );
      return;
    }
    if (f.kind === 'DomainChoice') {
      const records = db.deities.map((d) => ({ ...d, description: d.domains.join(', ') }));
      deity = pickRecord(
        step,
        key,
        'God or saint',
        [
          ...records,
          {
            id: 'custom',
            name: 'Custom deity (Director-approved)',
            description:
              'Name your deity and choose four domains for their portfolio with your Director’s permission.',
          },
        ],
        config,
      );
      if (!deity) return;
      if (deity.id === 'custom') {
        const name = escapeWord(draft.deityName);
        if (!name) errors.push({ step, message: 'Name your custom deity.' });
        const domains = choose(
          step,
          classId + '-portfolio',
          'Deity’s four domains',
          catalog.domains.map((d) => option(d.name, d.name)),
          { source: name, count: 4 },
        );
        deity = { ...deity, name, domains };
      }
      if (deity.id === 'custom' && deity.domains.length !== 4) return;
      const count = f.count || 1;
      const available = catalog.domains.filter((d) => deity.domains.includes(d.name));
      const selected = choose(
        step,
        classId + '-domain',
        count === 1 ? 'Domain' : 'Your two domains',
        available.map((d) => ({
          id: d.id,
          name: d.name,
          description: [
            d.piety,
            d.prayer && classId === 'conduit' && d.prayer,
            ...d.featuresByLevel.flatMap((t) =>
              t.features.map(
                (f) =>
                  'Level ' +
                  t.level +
                  ' · ' +
                  (f.kind === 'SkillChoice'
                    ? 'One ' + f.listOptions.join(' or ').toLowerCase() + ' skill'
                    : featureName(f) + '\n' + featureText(f)),
              ),
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
        })),
        { source: deity.name, count },
      );
      domains = selected.map((id) => available.find((d) => d.id === id));
      if (domains.length === count) {
        grants.push({
          id: key,
          name: count === 1 ? 'Deity and domain' : 'Deity and domains',
          kind: 'Text',
          source,
          description:
            deity.name +
            ' · ' +
            domains.map((d) => d.name).join(' and ') +
            '\nPortfolio · ' +
            deity.domains.join(', '),
        });
        if (classId === 'conduit')
          for (const d of domains)
            grants.push({
              id: 'conduit-piety-' + d.id,
              name: d.name + ' domain',
              kind: 'Text',
              source: deity.name,
              description: d.piety + '\nPrayer effect · ' + d.prayer,
            });
      }
      return;
    }
    if (f.kind === 'DomainFeature') {
      let domain = domains[0];
      if (classId === 'conduit') {
        if (domains.length !== 2) return;
        if (earnedAt === f.level) {
          const [id] = choose(
            step,
            key,
            'Level ' + f.level + ' domain feature',
            domains.map((d) => {
              const features = d.featuresByLevel.find((t) => t.level === f.level).features;
              return option(
                d.id,
                d.name,
                features
                  .map((child) =>
                    child.kind === 'SkillChoice'
                      ? 'One ' + child.listOptions.join(' or ') + ' skill'
                      : featureName(child) + '\n' + featureText(child),
                  )
                  .join('\n'),
              );
            }),
            config,
          );
          firstDomainAtTier.set(f.level, id);
          domain = domains.find((d) => d.id === id);
        } else {
          const first = firstDomainAtTier.get(f.level);
          domain = first && domains.find((d) => d.id !== first);
        }
      }
      const tier = domain?.featuresByLevel.find((t) => t.level === f.level);
      tier?.features.forEach((child) =>
        visit(child, step, domain.name + ' · Level ' + earnedAt, prefix, earnedAt),
      );
      return;
    }
    if (f.kind === 'DomainAbility') {
      if (domains.length !== 2) return;
      const pool = domains.map((d) => d.abilities.find((v) => v.level === earnedAt).ability);
      const [id] = choose(
        step,
        key,
        'Level ' + earnedAt + ' domain ability',
        pool.map((a, i) => option(a.id, a.name, domains[i].name + '\n' + abilityText(a))),
        config,
      );
      if (id) actions.push(pool.find((a) => a.id === id));
      return;
    }
    if (f.kind === 'KitChoice') {
      const isStormwight = f.group === 'stormwight';
      const kits = isStormwight ? catalog.stormwightKits : db.kits;
      const [id] = choose(
        step,
        key,
        isStormwight ? 'Stormwight kit' : 'Kit',
        kits.map((k) => option(k.id, k.name, kitText(k, level))),
        config,
      );
      kit = kits.find((k) => k.id === id);
      if (kit) {
        actions.push(kit.ability);
        for (const t of kit.featuresByLevel || []) {
          if (t.level <= level) t.features.forEach((child) => visit(child, step, kit.name, prefix, t.level));
        }
      }
      return;
    }
    if (f.kind === 'Choice') {
      const isBudget = f.count === 'ancestry';
      const opts = [];
      for (const { feature: child, value } of f.options) {
        // Previous Life can buy two distinct one-point traits in the same build.
        if (child.kind === 'AncestryFeature') {
          const pool = former?.features.find((x) => x.count === 'ancestry')?.options ?? [];
          for (const o of pool.filter((o) => o.value === child.value))
            opts.push({ child: o.feature, value, id: 'former-' + (o.feature.id || o.feature.ability.id) });
        } else opts.push({ child, value, id: child.id || child.ability?.id });
      }
      const selected = choose(
        step,
        key,
        title,
        opts.map((o) =>
          option(
            o.id,
            featureName(o.child),
            o.child.ability?.usesStormDamage
              ? abilityText(stormAbility(o.child.ability, kit))
              : featureText(o.child),
            {
              cost: o.value,
              family: /^Prismatic Scales/.test(featureName(o.child)) ? 'prismatic' : undefined,
            },
          ),
        ),
        {
          ...config,
          count: isBudget ? ancestry.ancestryPoints : f.count || 1,
          points: isBudget,
          ...(f.id === 'conduit-prayer' && level >= 10 ? { count: 3, minimum: 1 } : {}),
        },
      );
      for (const id of selected) visit(opts.find((o) => o.id === id).child, step, source, prefix, earnedAt);
      return;
    }
    if (f.kind === 'ClassAbilityChoice') {
      const list = catalog.abilities.filter(
        (a) =>
          a.cost === f.cost &&
          (a.minLevel || 1) <= Math.min(earnedAt, f.maxLevel || earnedAt) &&
          (a.minLevel || 1) >= (f.minLevel || 1) &&
          !usedAbilities.has(a.id),
      );
      const label =
        f.cost === 'signature'
          ? 'Signature abilities'
          : f.cost + '-' + heroClass.resource.toLowerCase() + ' ability';
      const selected = choose(
        step,
        key,
        label,
        list.map((a) => option(a.id, a.name, abilityText(a))),
        { ...config, count: f.count || 1 },
      );
      for (const id of selected) {
        usedAbilities.add(id);
        actions.push(list.find((a) => a.id === id));
      }
      return;
    }
    if (f.kind === 'Perk') {
      const available = db.perks.filter((p) => !usedPerks.has(p.id));
      const allowed = (p) => !f.lists?.length || f.lists.includes(p.list);
      const flexible = step === 'Background';
      const choices = available
        .filter((p) => flexible || allowed(p))
        .map((p) =>
          option(p.id, p.name, p.description, {
            warning: allowed(p) ? '' : 'This source grants a ' + f.lists.join(' or ') + ' perk.',
          }),
        );
      for (const id of choose(step, key, 'Perk', choices, { ...config, flexible, count: f.count || 1 })) {
        const perk = available.find((p) => p.id === id);
        usedPerks.add(id);
        grants.push({ id, name: perk.name, description: perk.description, source, kind: 'Perk' });
        perk.features.forEach((child) => visit(child, step, perk.name, prefix, earnedAt));
      }
      return;
    }
    if (f.kind === 'Toggle') {
      grants.push({ id: key, name: title, description, source, kind: f.kind });
      const [state] = choose(
        step,
        key + '-condition',
        f.condition,
        [option('no', 'No'), option('yes', 'Yes')],
        config,
      );
      if (state === 'yes' && f.featureChecked) visit(f.featureChecked, step, title, prefix, earnedAt);
      if (state === 'no' && f.featureUnchecked) visit(f.featureUnchecked, step, title, prefix, earnedAt);
      return;
    }
    if (f.kind === 'ItemChoice') {
      const items = db.items.filter((i) => f.types.includes(i.type));
      for (const id of choose(
        step,
        key,
        title,
        items.map((i) => option(i.name, i.name, i.type)),
        config,
      ))
        grants.push({ id: key, name: id, source, description: f.description, kind: 'Item' });
      return;
    }
    if (f.kind === 'Retainer') {
      grants.push({
        id: key,
        name: 'Butler retainer',
        description: 'The Director and player choose a retainer appropriate to the campaign.',
        source,
        kind: f.kind,
      });
      return;
    }
    if (f.kind === 'GrantAbility') {
      actions.push(stormAbility(f.ability, kit));
      return;
    }
    grants.push({ ...f, id: key, name: title, description, source, earnedAt });
    if (f.id === 'elementalist-1-7a' || f.id === 'conduit-prayer-of-soldiers-skill') {
      const gearKey = classId === 'conduit' ? 'conduit-gear-' : 'battle-';
      const [armor] = choose(
        step,
        gearKey + 'armor',
        'Wearing light armor?',
        [option('yes', 'Light armor'), option('no', 'Unarmored')],
        { source: title },
      );
      const [weapon] = choose(
        step,
        gearKey + 'weapon',
        'Wielding a light weapon?',
        [option('yes', 'Light weapon'), option('no', 'Other weapon or implement')],
        { source: title },
      );
      f.features
        .filter(
          (child) =>
            (child.kind !== 'Bonus' || armor === 'yes') &&
            (child.kind !== 'AbilityDamage' || weapon === 'yes'),
        )
        .forEach((child) => visit(child, step, title, prefix, earnedAt));
    } else if (f.kind === 'Multiple')
      f.features.forEach((child) => visit(child, step, title, prefix, earnedAt));
    const domain = domains[0];
    if (f.id === 'censor-10-4' && domain)
      grants.push({
        id: 'censor-templar-prayer',
        name: domain.name + ' domain effect',
        description: domain.prayer,
        kind: 'Text',
        source: 'Templar',
      });
    if (f.id === 'censor-10-5' && domain) {
      for (const d of catalog.domains.filter((d) => d.id !== domain.id && deity.domains.includes(d.name))) {
        const rules = d.featuresByLevel
          .flatMap((t) => t.features.filter((f) => f.kind !== 'SkillChoice'))
          .map((f) => featureName(f) + ' · ' + featureText(f));
        grants.push({
          id: 'virtue-reference-' + d.id,
          name: 'Virtue option · ' + d.name,
          kind: 'Text',
          source: 'Virtue',
          description: [
            'Spend 3 virtue to access this domain until your next respite.',
            ...rules,
            'Domain effect · ' + d.prayer,
          ].join('\n'),
        });
      }
    }
  }
  ancestry = pickRecord('Ancestry', 'ancestry', 'Ancestry', db.ancestries);
  ancestry?.features.forEach((f) => visit(f, 'Ancestry', ancestry.name));
  const culture = {};
  for (const [key, list] of [
    ['environment', db.environments],
    ['organization', db.organizations],
    ['upbringing', db.upbringings],
  ]) {
    const found = pickRecord('Background', key, labelWords(key[0].toUpperCase() + key.slice(1)), list, {
      source: 'Culture',
    });
    culture[key] = found?.name || '';
    if (found) visit(found, 'Background', found.name);
  }
  grants.push({
    id: 'culture-edge',
    name: 'Culture',
    kind: 'Text',
    source: 'Culture',
    description:
      'Gain an edge on tests to recall lore about your culture and to influence or interact with its people.',
  });
  languageQueue.push({ f: { count: 1 }, key: 'culture-language', source: 'Culture' });
  career = pickRecord('Background', 'career', 'Career', db.careers);
  if (career) {
    incident = pickRecord(
      'Background',
      'incident-' + career.id,
      'Inciting incident',
      [...career.incidents, { id: 'original', name: 'My own incident' }],
      { source: career.name },
    );
    if (incident?.id === 'original' && !escapeWord(draft.incident))
      errors.push({ step: 'Background', message: 'Describe your inciting incident.' });
    career.features.forEach((f) => visit(f, 'Background', career.name));
  }
  const complicationId = choose('Background', 'complication', 'Complication', [
    option('none', 'No complication'),
    ...db.complications.map(entry),
  ])[0];
  complication = db.complications.find((c) => c.id === complicationId);
  complication?.features.forEach((f) => visit(f, 'Background', complication.name));
  if (catalog.subclasses)
    subclass = pickRecord('Class', 'subclass', heroClass.subclassLabel, catalog.subclasses);
  const otherStats = STATS.filter((stat) => !heroClass.primary.includes(stat));
  const statPrefix = classId === 'elementalist' ? '' : classId + '-';
  const [arrayId] = choose(
    'Class',
    statPrefix + 'array',
    'Starting characteristics',
    heroClass.arrays.map((a, i) =>
      option(
        String(i),
        a.map(plus).join(' / '),
        heroClass.primary.join(' and ') +
          (heroClass.primary.length === 1 ? ' starts' : ' start') +
          ' at +2. Assign the remaining scores.',
      ),
    ),
  );
  if (arrayId !== undefined) {
    const arrangements = perms(heroClass.arrays[Number(arrayId)]);
    const [assigned] = choose(
      'Class',
      statPrefix + 'assign-' + arrayId,
      'Assign the array',
      arrangements.map((p) =>
        option(p.join(','), otherStats.map((s, i) => s + ' ' + plus(p[i])).join(' · ')),
      ),
    );
    if (assigned) otherStats.forEach((s, i) => (stats[s] = Number(assigned.split(',')[i])));
  }
  for (const stat of heroClass.primary) stats[stat] = 2;
  for (const tier of catalog.featuresByLevel.filter((t) => t.level <= level)) {
    const source = heroClass.name + ' · Level ' + tier.level;
    for (const f of tier.features) visit(f, 'Class', source, '', tier.level);
    const specialized = subclass?.featuresByLevel.find((t) => t.level === tier.level);
    specialized?.features.forEach((f) =>
      visit(f, 'Class', subclass.name + ' · Level ' + tier.level, '', tier.level),
    );
  }
  for (const f of grants.filter((g) => g.kind === 'CharacteristicBonus')) stats[f.characteristic] += f.value;
  const trainingChoices = (list, already, allowed, why) =>
    list
      .filter((o) => !already.has(o.name))
      .map((o) =>
        option(o.name, o.name, [o.list || o.type, o.description].filter(Boolean).join(' · '), {
          warning: allowed(o) ? '' : why,
        }),
      );
  const openSkill = (q, count, allowed, why) => {
    const choices = trainingChoices(db.skills, skills, allowed, why);
    for (const name of choose(
      'Training',
      q.key,
      q.f.name && !q.f.listOptions ? q.f.name : 'Skill training',
      choices,
      { source: q.source, count, flexible: true, description: why },
    )) {
      skills.set(name, q.source);
    }
  };
  function resolveTraining(queue) {
    const replacements = [];
    for (const q of queue)
      for (const fixed of q.f.selected || []) {
        if (skills.has(fixed))
          replacements.push({
            ...q,
            key: q.key + '-replace-' + fixed,
            source: q.source + ' · duplicate ' + fixed,
          });
        else skills.set(fixed, q.source);
      }
    for (const q of queue.filter((q) => !q.f.selected?.length)) {
      const allowed = (s) =>
        (!q.f.options?.length && !q.f.listOptions?.length) ||
        q.f.options?.includes(s.name) ||
        q.f.listOptions?.includes(s.list);
      if (q.f.selectAt === 'respite' && !db.skills.some((s) => allowed(s) && !skills.has(s.name))) continue;
      openSkill(
        q,
        q.f.count || 1,
        allowed,
        q.f.listOptions?.length || q.f.options?.length
          ? 'Choose from ' + [...(q.f.listOptions || []), ...(q.f.options || [])].join(', ') + '.'
          : 'Choose any available skill.',
      );
    }
    for (const q of replacements)
      openSkill(q, 1, () => true, 'A duplicate fixed grant can be replaced by any skill.');
  }
  const library = grants.find((f) => f.id === 'domain-knowledge-7');
  resolveTraining(library ? skillQueue.filter((q) => q.earnedAt < library.earnedAt) : skillQueue);
  for (const q of cancelQueue) {
    const eligible = db.skills.filter((s) =>
      q.f.knownSkillsOnly
        ? skills.has(s.name) && (q.key !== 'comp-ivoryTower-d' || skills.get(s.name) === q.source)
        : true,
    );
    for (const id of choose('Training', q.key, q.f.name || 'Lose a skill', eligible.map(entry), {
      source: q.source,
    })) {
      skills.delete(id);
      grants.push({
        id: q.key,
        name: featureName(q.f),
        description: q.f.description + ' Lost skill: ' + id,
        source: q.source,
        kind: 'Text',
      });
    }
  }
  if (library) {
    const lore = db.skills.filter((s) => s.list === 'Lore');
    const known = lore.filter((s) => skills.has(s.name)).length;
    for (const s of lore) if (!skills.has(s.name)) skills.set(s.name, library.name);
    if (known)
      openSkill(
        { f: {}, key: classId + '-library-skills', source: library.name },
        known,
        (s) => s.list !== 'Lore',
        'Choose one non-lore skill for each lore skill you already knew.',
      );
    resolveTraining(skillQueue.filter((q) => q.earnedAt >= library.earnedAt));
  }
  for (const [perk, group] of [
    ['perk-area-of-expertise', 'Crafting'],
    ['perk-specialist', 'Lore'],
  ]) {
    if (!usedPerks.has(perk)) continue;
    const record = db.perks.find((p) => p.id === perk),
      available = db.skills.filter((s) => skills.has(s.name) && s.list === group);
    const [skill] = choose('Training', perk + '-focus', record.name + ' focus', available.map(entry), {
      source: record.name,
      description: 'Choose a trained ' + group.toLowerCase() + ' skill.',
    });
    if (skill)
      grants.push({
        id: perk + '-focus',
        name: record.name + ' · ' + skill,
        description: record.description,
        source: record.name,
        kind: 'Text',
      });
  }
  for (const q of languageQueue) {
    const types = q.f.allowedTypes?.length ? q.f.allowedTypes : ['Common', 'Regional', 'Cultural'];
    const choices = trainingChoices(
      db.languages,
      languages,
      (l) => types.includes(l.type),
      'This source grants a language from ' + types.join(', ') + '.',
    );
    for (const id of choose('Training', q.key, 'Language', choices, {
      source: q.source,
      count: q.f.count || 1,
      flexible: true,
    }))
      languages.add(id);
  }
  return {
    slots,
    errors,
    warnings,
    complete: !errors.length,
    level,
    stats,
    ancestry,
    former,
    career,
    incident,
    complication,
    subclass,
    classTrack: subclass?.name || domains.map((d) => d.name).join(' and '),
    deity,
    domain: domains[0],
    domains,
    kit,
    culture,
    skills,
    languages,
    actions: actions.map((a) =>
      a.enhancementTag
        ? {
            ...a,
            sections: [
              ...a.sections,
              ...grants
                .filter((f) => f.tag === a.enhancementTag)
                .map((f) => ({
                  kind: 'AbilitySectionText',
                  args: [f.name + ' · ' + f.description],
                })),
            ],
          }
        : a,
    ),
    heroClass,
    classId,
    grants,
  };
}

export function setPick(draft, slot, id, accepted = false) {
  const o = slot.choices.find((o) => o.id === id);
  if (!o) return false;
  const previous = slot.selected;
  if (previous.includes(id)) {
    draft.picks[slot.key] = previous.filter((v) => v !== id);
    return true;
  }
  if (o.warning && !accepted) return false;
  if (slot.count === 1) {
    draft.picks[slot.key] = [id];
  } else {
    const family = slot.choices.find((c) => previous.includes(c.id) && c.family && c.family === o.family);
    if (family || slot.total + (slot.points ? o.cost : 1) > slot.count) return false;
    draft.picks[slot.key] = [...previous, id];
  }
  if (o.warning) draft.exceptions[slot.key] = distinct([...(draft.exceptions[slot.key] || []), id]);
  return true;
}
