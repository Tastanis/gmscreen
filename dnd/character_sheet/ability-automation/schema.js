// Ability Automation — v3 Schema.
//
// JSON shape (saved on action.automation):
//   {
//     schema: "ability-automation/v3",
//     version: 3,
//     warnings: [string, ...],
//     cards: [
//       { type: "target",     id, name, mode, predicate, count, optional, distance, range, ... },
//       { type: "powerRoll",  id, attribute, bonus, target, tiers: { tier1, tier2, tier3 } },
//       { type: "effect",     id, target, effects: [Effect, ...] },
//       { type: "trigger",    id, condition, match, target, effects: [Effect, ...] },
//       { type: "persistent", id, cost, resource, effects: [Effect, ...] },
//       { type: "branch",     id, condition, then: [Block, ...], else: [Block, ...] },
//       { type: "choice",     id, prompt, options: [{ id, label, keywords, cards }] }
//     ]
//   }
//
// `cards` (the top-level array) is the runtime execution order. Block types are
// orthogonal — multiple targets, multiple effects, etc. are all allowed.
//
// Effect kinds: damage, heal, temporaryStamina, condition, forcedMovement,
// teleport, swap, resourceGain, surgeGain, freeStrike, cascade, note, potency,
// spend, floatingText, startTurn, other. Damage effects use either one
// `damageType` or a `damageTypeOptions` array when resolution requires a choice.
//
// Lenient by design: unknown fields are kept under `_extra` so the inspector can
// surface them; missing fields default; warnings are collected but never block save.

(function (global) {
  "use strict";

  const SCHEMA_ID = "ability-automation/v3";
  const SCHEMA_VERSION = 3;

  const P = global.AbilityAutomationPrimitives;
  if (!P) {
    console.error("AbilityAutomationPrimitives must load before schema.js");
    return;
  }

  function createId(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function asInt(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asNonNegInt(value, fallback = 0) {
    return Math.max(0, asInt(value, fallback));
  }

  function asPosInt(value, fallback = 1) {
    return Math.max(1, asInt(value, fallback));
  }

  function asTrimmedString(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function pickKnown(value, list, fallback) {
    return list.includes(value) ? value : fallback;
  }

  function asBool(value) {
    return Boolean(value);
  }

  function normalizeIgnoredResistance(value, warnings, path) {
    if (value === undefined || value === null || value === false || value === "") return undefined;
    if (value === true || String(value).trim().toLowerCase() === "all") return true;
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0) {
      return numeric > 0 ? numeric : undefined;
    }
    warnings.push(`${path}: use true/"all" to ignore all, or a non-negative integer.`);
    return undefined;
  }

  function isExtraObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function mergeLegacyExtraChain(target, value) {
    if (!isExtraObject(value)) return;
    const layers = [];
    const seen = new Set();
    let current = value;
    while (isExtraObject(current) && !seen.has(current)) {
      seen.add(current);
      layers.push(current);
      current = current._extra;
    }
    // Merge deepest-first so the value closest to the real schema node wins
    // when malformed legacy layers repeat the same unknown key.
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      for (const key of Object.keys(layers[index])) {
        if (key !== "_extra") target[key] = layers[index][key];
      }
    }
  }

  function pickExtras(input, knownKeys) {
    if (!input || typeof input !== "object") return null;
    const extras = {};
    mergeLegacyExtraChain(extras, input._extra);
    for (const key of Object.keys(input)) {
      // `target` is a universal effect-routing field attached after the
      // kind-specific normalizer runs. `_extra` is reserved metadata, never an
      // unknown field; malformed legacy `_extra._extra...` chains are flattened
      // above before direct unknown fields are merged.
      const universalEffectTarget = key === "target" && knownKeys.has("kind");
      if (key !== "_extra" && !universalEffectTarget && !knownKeys.has(key)) {
        extras[key] = input[key];
      }
    }
    return Object.keys(extras).length ? extras : null;
  }

  function normalizeTextList(value) {
    if (Array.isArray(value)) {
      return value
        .map(asTrimmedString)
        .filter(Boolean);
    }
    const text = asTrimmedString(value);
    if (!text) return [];
    return text.split(/[,;]+/).map((entry) => entry.trim()).filter(Boolean);
  }

  function normalizeHiddenEffectRider(input, warnings, path) {
    if (!input || typeof input !== "object") return null;
    const rawType = asTrimmedString(input.type);
    const type = rawType.toLowerCase() === "rollmodifier" ? "rollModifier" : rawType.toLowerCase() === "rollbuff" ? "rollBuff" : rawType;
    if (type !== "rollModifier" && type !== "rollBuff") {
      warnings.push(`${path}: hiddenEffect rider type "${type || "(blank)"}" is not supported yet.`);
      return JSON.parse(JSON.stringify(input));
    }
    const rawModifier = asTrimmedString(input.modifier).toLowerCase();
    const modifierMap = {
      edge: "edge",
      bane: "bane",
      doubleedge: "doubleEdge",
      "double-edge": "doubleEdge",
      doubleEdge: "doubleEdge",
      doublebane: "doubleBane",
      "double-bane": "doubleBane",
      doubleBane: "doubleBane",
    };
    const modifier = modifierMap[rawModifier] || "";
    // A rollBuff (the buff effect) may carry only +damage or +potency.
    if (!modifier && (type === "rollModifier" || rawModifier)) {
      warnings.push(`${path}: rollModifier rider needs modifier edge, bane, doubleEdge, or doubleBane.`);
    }
    const appliesToInput = input.appliesTo && typeof input.appliesTo === "object" ? input.appliesTo : {};
    const appliesTo = {};
    const rollEvent = asTrimmedString(appliesToInput.rollEvent);
    if (rollEvent) {
      appliesTo.rollEvent = pickKnown(rollEvent, ["powerRoll", "abilityTest", "abilityRoll"], rollEvent);
    }
    const actionKind = asTrimmedString(appliesToInput.actionKind);
    if (actionKind) appliesTo.actionKind = actionKind;
    const keywordsAny = normalizeTextList(appliesToInput.keywordsAny);
    if (keywordsAny.length) appliesTo.keywordsAny = keywordsAny;
    const keywordsAll = normalizeTextList(appliesToInput.keywordsAll);
    if (keywordsAll.length) appliesTo.keywordsAll = keywordsAll;
    const target = asTrimmedString(appliesToInput.target);
    if (target) appliesTo.target = target;
    const consume = asTrimmedString(input.consume) || "manual";
    const rider = type === "rollBuff" ? { type } : { type: "rollModifier", modifier: modifier || rawModifier || "edge" };
    if (type === "rollBuff") {
      if (modifier) rider.modifier = modifier;
      const damageBonus = asInt(input.damageBonus, 0);
      if (damageBonus) rider.damageBonus = damageBonus;
      const potencyBonus = asInt(input.potencyBonus, 0);
      if (potencyBonus) rider.potencyBonus = potencyBonus;
    }
    if (asTrimmedString(input.side).toLowerCase() === "against") rider.side = "against";
    if (Object.keys(appliesTo).length) rider.appliesTo = appliesTo;
    rider.consume = pickKnown(consume, ["manual", "nextMatchingRoll"], consume);
    return rider;
  }

  function normalizeConditionRiders(input, warnings, path) {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) {
      warnings.push(`${path}: must be an array.`);
      return [];
    }
    const ids = new Set();
    return input.map((raw, index) => {
      const itemPath = `${path}[${index}]`;
      if (!raw || typeof raw !== "object") {
        warnings.push(`${itemPath}: rider must be an object.`);
        return null;
      }
      const when = pickKnown(raw.when, ["turnStart", "turnEnd"], "");
      if (!when) {
        warnings.push(`${itemPath}.when: use turnStart or turnEnd.`);
        return null;
      }
      const target = pickKnown(raw.target, ["bearer", "source"], "bearer");
      const effects = normalizeEffectList(raw.effects || [], warnings, `${itemPath}.effects`)
        .filter((effect, effectIndex) => {
          if (!["damage", "heal", "temporaryStamina", "surgeGain", "condition", "floatingText", "note", "other"].includes(effect.kind)) {
            warnings.push(`${itemPath}.effects[${effectIndex}]: effect kind "${effect.kind}" is not supported in a condition rider.`);
            return false;
          }
          if (effect.damageTypeOptions?.length) {
            warnings.push(`${itemPath}.effects[${effectIndex}]: condition riders cannot open a damage-type picker; use one damageType.`);
            return false;
          }
          if (effect.attribute || effect.recoveries || effect.amountFrom) {
            warnings.push(`${itemPath}.effects[${effectIndex}]: condition riders support flat/dice amounts, not attributes, recoveries, or captured values.`);
            return false;
          }
          return true;
        });
      if (!effects.length) {
        warnings.push(`${itemPath}: needs at least one supported persistent rider effect.`);
        return null;
      }
      let id = asTrimmedString(raw.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!id) id = `rider-${index + 1}`;
      if (ids.has(id)) {
        warnings.push(`${itemPath}.id: duplicate rider id "${id}" removed.`);
        return null;
      }
      ids.add(id);
      const rider = { id, when, target, effects };
      const label = asTrimmedString(raw.label);
      if (label) rider.label = label;
      // Optional: the bearer must be in (or next to) a terrain zone for the rider to act. Tested
      // each time the rider comes up, so leaving the zone stops it and returning restarts it.
      if (raw.zone != null && raw.zone !== false) {
        const zoneInput = typeof raw.zone === "string" ? { tag: raw.zone } : raw.zone;
        const zoneTags = normalizeZoneTags(zoneInput);
        if (zoneTags.length) rider.zone = zoneInput.adjacent === true ? { tags: zoneTags, adjacent: true } : { tags: zoneTags };
        else warnings.push(`${itemPath}.zone: needs a tag, for example { "tag": "blood" }.`);
      }
      return rider;
    }).filter(Boolean);
  }

  // ---------- effects ----------

  function normalizeEffectList(input, warnings, path) {
    if (!Array.isArray(input)) return [];
    return input
      .map((effect, index) => {
        const normalized = normalizeEffect(effect, warnings, `${path}[${index}]`);
        return normalized ? attachEffectTarget(effect, normalized) : null;
      })
      .filter(Boolean);
  }

  function normalizeTargetRef(value) {
    if (Array.isArray(value)) {
      return value.map((item) => asTrimmedString(item)).filter(Boolean);
    }
    return asTrimmedString(value);
  }

  function attachEffectTarget(input, effect) {
    // Potency historically used numeric `target` for the literal
    // characteristic threshold (M<2, A<1, ...). Keep string/array targets as
    // normal effect-routing references, but do not turn a numeric potency
    // threshold into a target-group name such as "2".
    if (effect?.kind === "potency" && Number.isFinite(Number(input?.target))) {
      return effect;
    }
    const target = normalizeTargetRef(input?.target);
    if (Array.isArray(target) ? target.length : target) {
      effect.target = target;
    }
    return effect;
  }

  // Counting creatures: who counts (predicate relative to the user, keyword = kind of creature), where (within N
  // squares of the user or of each target; or among the ability's targets), what state (condition, Stamina), and
  // whether the user / the centre count. Used by amountFrom { source: "count" } and the ifTarget `nearby` check.
  function normalizeCountSpec(input) {
    const spec = {
      predicate: pickKnownLoose(input.predicate, ["ally", "enemy", "creature"], "creature"),
      within: asNonNegInt(input.within, 1),
      around: pickKnownLoose(input.around, ["self", "target"], "target"),
    };
    if (pickKnownLoose(input.in, ["area", "targets"], "area") === "targets") spec.in = "targets";
    const keyword = normalizeWordList(input.keyword);
    if (keyword.length) spec.keyword = keyword;
    const condition = normalizeWordList(input.condition);
    if (condition.length) spec.condition = condition;
    if (input.stamina !== undefined && input.stamina !== null && input.stamina !== "") spec.stamina = pickKnownLoose(input.stamina, ["winded", "notWinded", "full", "belowFull", "dying"], "winded");
    if (input.includeSelf === true) spec.includeSelf = true;
    if (input.max !== undefined && input.max !== null && input.max !== "") spec.max = asNonNegInt(input.max, 0);
    return spec;
  }

  // `amountFrom` lets a damage/heal amount scale off the captured trigger value
  // (e.g. "the enemy takes half the triggering damage"). The raw captured number
  // is multiplied by `multiplier` and `fraction`, then rounded (default down, the
  // Draw Steel convention). The resulting value is ADDED on top of the effect's
  // own `amount` / `attribute` / `amountDice`, so authors can express "amount + M"
  // or "half the triggering damage + 1d6" purely from existing fields.
  function normalizeAmountFrom(input, warnings, path) {
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: amountFrom must be an object.`);
      return null;
    }
    let rawSource = asTrimmedString(input.source) || "triggeringDamage";
    // The squares of the move that set the trigger off: the same field as forced movement's distance.
    if (rawSource === "triggeringMovement" || rawSource === "movedDistance") rawSource = "triggeringForcedMovement";
    const sourceValid = P.TRIGGER_VALUE_SOURCES.includes(rawSource);
    if (!sourceValid) {
      warnings.push(`${path}.source: "${input.source}" not in ${P.TRIGGER_VALUE_SOURCES.join("/")}. Using triggeringDamage.`);
    }
    const amountFrom = { source: sourceValid ? rawSource : "triggeringDamage" };
    if (input.fraction !== undefined && input.fraction !== null && input.fraction !== "") {
      const fraction = Number(input.fraction);
      if (Number.isFinite(fraction) && fraction > 0) amountFrom.fraction = fraction;
      else warnings.push(`${path}.fraction: must be a positive number.`);
    }
    if (input.multiplier !== undefined && input.multiplier !== null && input.multiplier !== "") {
      const multiplier = Number(input.multiplier);
      if (Number.isFinite(multiplier) && multiplier > 0) amountFrom.multiplier = multiplier;
      else warnings.push(`${path}.multiplier: must be a positive number.`);
    }
    const rounding = asTrimmedString(input.rounding).toLowerCase();
    if (rounding) {
      if (rounding === "up" || rounding === "down") amountFrom.rounding = rounding;
      else warnings.push(`${path}.rounding: "${input.rounding}" must be "up" or "down".`);
    }
    if (amountFrom.source === "count") Object.assign(amountFrom, normalizeCountSpec(input));
    return amountFrom;
  }

  function normalizeEffect(input, warnings, path) {
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: effect must be an object.`);
      return null;
    }
    const kind = String(input.kind || "").trim();
    if (!P.EFFECT_KINDS.includes(kind)) {
      warnings.push(`${path}: unknown effect kind "${kind}". Treating as note.`);
      return { kind: "note", text: kind ? `(unknown kind: ${kind})` : "(empty effect)", _extra: input };
    }
    switch (kind) {
      case "damage": {
        const known = new Set(["kind", "amount", "amountDice", "markBonusDice", "markPredicate", "attribute", "multiplier", "damageType", "damageTypeOptions", "raw", "amountFrom", "ignoreImmunity"]);
        const attribute = input.attribute !== undefined && input.attribute !== null
          ? (P.normalizeAttributeOrList ? P.normalizeAttributeOrList(input.attribute) : P.normalizeAttribute(input.attribute))
          : "";
        const rawDamageTypeOptions = input.damageTypeOptions;
        const damageTypeOptions = P.normalizeDamageTypeOptions
          ? P.normalizeDamageTypeOptions(rawDamageTypeOptions)
          : [];
        if (rawDamageTypeOptions !== undefined && !Array.isArray(rawDamageTypeOptions)) {
          warnings.push(`${path}.damageTypeOptions: must be an array of registered damage types.`);
        } else if (Array.isArray(rawDamageTypeOptions)) {
          const rawNonBlankCount = rawDamageTypeOptions.filter((value) => asTrimmedString(value)).length;
          if (damageTypeOptions.length !== rawNonBlankCount) {
            warnings.push(`${path}.damageTypeOptions: removed blank, duplicate, or unsupported damage types.`);
          }
          if (damageTypeOptions.length < 2) {
            warnings.push(`${path}.damageTypeOptions: needs at least two valid damage types; use damageType for a single type.`);
          }
        }
        const normalizedDamageType = P.normalizeDamageType(input.damageType || "untyped");
        const effect = {
          kind: "damage",
          amount: asInt(input.amount, 0),
          amountDice: asTrimmedString(input.amountDice),
          markBonusDice: asTrimmedString(input.markBonusDice),
          markPredicate: asTrimmedString(input.markPredicate),
          attribute,
          damageType: damageTypeOptions.length === 1 ? damageTypeOptions[0] : normalizedDamageType,
        };
        if (damageTypeOptions.length > 1) {
          effect.damageTypeOptions = damageTypeOptions;
          delete effect.damageType;
          if (input.damageType !== undefined && input.damageType !== null && asTrimmedString(input.damageType)) {
            warnings.push(`${path}.damageType: ignored because damageTypeOptions contains multiple valid types.`);
          }
        }
        // Optional attribute multiplier: total = amount + (attribute bonus × multiplier).
        // e.g. "holy damage equal to twice your Presence score" → attribute:"P", multiplier:2.
        // Only meaningful when an attribute is set; mirrors forcedMovement.
        if (attribute) {
          const mult = asInt(input.multiplier, 1);
          if (mult !== 1) effect.multiplier = mult;
        }
        // `raw` marks damage that ignores feature modifiers (e.g. a Talent's
        // self-inflicted strained backlash should not be boosted by the same
        // augmentation that buffs the attack). Preserved only when truthy.
        if (input.raw) effect.raw = true;
        const ignoreImmunity = normalizeIgnoredResistance(input.ignoreImmunity, warnings, `${path}.ignoreImmunity`);
        if (ignoreImmunity !== undefined) effect.ignoreImmunity = ignoreImmunity;
        if (input.amountFrom !== undefined && input.amountFrom !== null) {
          const amountFrom = normalizeAmountFrom(input.amountFrom, warnings, `${path}.amountFrom`);
          if (amountFrom) effect.amountFrom = amountFrom;
        }
        const attrValid = !attribute
          || (Array.isArray(attribute) ? attribute.every((a) => P.ATTRIBUTES.includes(a)) : P.ATTRIBUTES.includes(attribute));
        if (!attrValid) {
          warnings.push(`${path}: damage attribute "${JSON.stringify(input.attribute)}" not in registry.`);
        }
        if (effect.damageType && !P.DAMAGE_TYPES.includes(effect.damageType)) {
          warnings.push(`${path}: damage type "${input.damageType}" not in registry.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "heal": {
        const known = new Set(["kind", "amount", "recoveries", "recoverySource", "attribute", "amountFrom"]);
        const recoveries = asNonNegInt(input.recoveries, 0);
        const recoverySourceRaw = asTrimmedString(input.recoverySource || "");
        const recoverySource = ["self", "source", "caster"].includes(recoverySourceRaw.toLowerCase())
          ? "self"
          : "target";
        const amount = asNonNegInt(input.amount, 0);
        const attribute = input.attribute !== undefined && input.attribute !== null && input.attribute !== ""
          ? (P.normalizeAttributeOrList ? P.normalizeAttributeOrList(input.attribute) : P.normalizeAttribute(input.attribute))
          : "";
        const amountFrom = (input.amountFrom !== undefined && input.amountFrom !== null)
          ? normalizeAmountFrom(input.amountFrom, warnings, `${path}.amountFrom`)
          : null;
        if (!recoveries && !amount && !attribute && !amountFrom) {
          warnings.push(`${path}: heal has no amount, recoveries, attribute, or amountFrom; runtime will skip.`);
        }
        const effect = { kind: "heal" };
        if (recoveries) effect.recoveries = recoveries;
        if (recoveries && recoverySource !== "target") effect.recoverySource = recoverySource;
        if (amount) effect.amount = amount;
        if (attribute) effect.attribute = attribute;
        if (amountFrom) effect.amountFrom = amountFrom;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "temporaryStamina": {
        const known = new Set(["kind", "amount", "attribute", "amountFrom"]);
        const attribute = input.attribute !== undefined && input.attribute !== null && input.attribute !== ""
          ? (P.normalizeAttributeOrList ? P.normalizeAttributeOrList(input.attribute) : P.normalizeAttribute(input.attribute))
          : "";
        const amountFrom = (input.amountFrom !== undefined && input.amountFrom !== null)
          ? normalizeAmountFrom(input.amountFrom, warnings, `${path}.amountFrom`)
          : null;
        const effect = { kind: "temporaryStamina", amount: asNonNegInt(input.amount, 0) };
        if (attribute) effect.attribute = attribute;
        if (amountFrom) effect.amountFrom = amountFrom;
        if (!effect.amount && !attribute && !amountFrom) warnings.push(`${path}: temporary stamina has no amount.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "floatingText": {
        const known = new Set(["kind", "text", "audience", "tone", "durationMs"]);
        const audienceRaw = asTrimmedString(input.audience || "all").toLowerCase();
        const toneRaw = asTrimmedString(input.tone || "danger").toLowerCase();
        const effect = {
          kind: "floatingText",
          text: asTrimmedString(input.text),
          audience: pickKnown(audienceRaw, ["all", "self"], "all"),
          tone: pickKnown(toneRaw, ["danger", "gold", "ally", "neutral"], "danger"),
        };
        if (!effect.text) {
          warnings.push(`${path}.text: floatingText needs display text.`);
        }
        if (input.durationMs !== undefined && input.durationMs !== null && input.durationMs !== "") {
          effect.durationMs = asPosInt(input.durationMs, 2100);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "startTurn": {
        const known = new Set(["kind", "target", "condition", "confirmOnInvalid", "invalidMessage"]);
        const conditionRaw = asTrimmedString(input.condition || "enemyPickNoActive");
        const effect = {
          kind: "startTurn",
          target: normalizeTargetRef(input.target) || "self",
          condition: pickKnown(conditionRaw, ["enemyPickNoActive", "pickPhase", "any"], "enemyPickNoActive"),
          confirmOnInvalid: input.confirmOnInvalid === undefined ? true : asBool(input.confirmOnInvalid),
        };
        const invalidMessage = asTrimmedString(input.invalidMessage);
        if (invalidMessage) effect.invalidMessage = invalidMessage;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "condition": {
        const known = new Set([
          "kind",
          "name",
          "duration",
          "text",
          "label",
          "amount",
          "damageType",
          "stacks",
          "hidden",
          "rider",
          "riders",
          "consume",
          "sourceId",
          "sourceName",
          "sourceAbility",
        ]);
        const rawName = asTrimmedString(input.name);
        const name = P.normalizeCondition(rawName) || "other";
        const effect = {
          kind: "condition",
          name,
          duration: P.normalizeDuration(input.duration || "instantaneous"),
        };
        if (name === "other") effect.text = asTrimmedString(input.text || rawName);
        if (rawName && !P.CONDITIONS.find((c) => c.toLowerCase() === rawName.toLowerCase()) && name === "other" && !effect.text) {
          warnings.push(`${path}: condition "${rawName}" mapped to "other" with no description.`);
        }
        // damageWeakness / damageImmunity carry numeric riders. Preserve them so
        // the board's damage adjuster can read amount + (optional) damageType.
        if ((P.NUMERIC_CONDITIONS || []).includes(name)) {
          // "all": immune to all of that damage. `stacks`: adds to the highest instead of competing with it.
          effect.amount = String(input.amount ?? "").trim().toLowerCase() === "all" ? "all" : asNonNegInt(input.amount, 0);
          if (input.stacks === true) effect.stacks = true;
          const dt = P.normalizeDamageType(input.damageType || "");
          // Empty / "untyped" means "applies to every type" for these riders.
          effect.damageType = dt === "untyped" ? "" : dt;
          if (!effect.amount) {
            warnings.push(`${path}: ${name} has amount 0 — runtime will ignore.`);
          }
        }
        if (name === "hiddenEffect") {
          effect.hidden = true;
          effect.label = asTrimmedString(input.label || input.text || "Hidden effect");
          const rider = normalizeHiddenEffectRider(input.rider, warnings, `${path}.rider`);
          if (rider) effect.rider = rider;
          const consume = asTrimmedString(input.consume);
          if (consume) effect.consume = consume;
          if (!effect.rider) {
            warnings.push(`${path}: hiddenEffect has no supported rider; it will display as a removable effect only.`);
          }
        }
        if (name !== "hiddenEffect") {
          if (input.rider !== undefined) {
            warnings.push(`${path}.rider: singular rider is reserved for hiddenEffect; use riders[] for timed condition effects.`);
          }
          const riders = normalizeConditionRiders(input.riders, warnings, `${path}.riders`);
          if (riders.length) effect.riders = riders;
        }
        const sourceId = asTrimmedString(input.sourceId);
        const sourceName = asTrimmedString(input.sourceName);
        const sourceAbility = asTrimmedString(input.sourceAbility);
        if (sourceId) effect.sourceId = sourceId;
        if (sourceName) effect.sourceName = sourceName;
        if (sourceAbility) effect.sourceAbility = sourceAbility;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "forcedMovement": {
        const known = new Set(["kind", "verb", "distance", "upTo", "attribute", "multiplier", "ignoreStability", "ignoreRestrained"]);
        const verb = P.normalizeForcedMovementVerb(input.verb || "push");
        const effect = {
          kind: "forcedMovement",
          verb,
          distance: asNonNegInt(input.distance, 0),
          upTo: asBool(input.upTo),
        };
        // Optional attribute scaling: total distance = distance + (attribute bonus × multiplier).
        // e.g. "push twice your Reason score" → distance:0, attribute:"R", multiplier:2.
        const attribute = P.normalizeAttribute ? P.normalizeAttribute(input.attribute) : asTrimmedString(input.attribute);
        if (attribute) {
          effect.attribute = attribute;
          const mult = asInt(input.multiplier, 1);
          if (mult !== 1) effect.multiplier = mult;
        }
        const ignoreStability = normalizeIgnoredResistance(input.ignoreStability, warnings, `${path}.ignoreStability`);
        if (ignoreStability !== undefined) effect.ignoreStability = ignoreStability;
        // "A target restrained by a dwarf can be force moved by this ability": no restrained warning.
        if (input.ignoreRestrained === true) effect.ignoreRestrained = true;
        if (!effect.distance && !effect.attribute) warnings.push(`${path}: forced movement has 0 distance.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "shift": {
        const known = new Set(["kind", "distance", "pool", "label"]);
        const rawDistance = String(input.distance ?? "").trim().toLowerCase();
        const effect = {
          kind: "shift",
          distance: rawDistance === "speed" ? "speed" : asNonNegInt(input.distance, 0),
          pool: asTrimmedString(input.pool),
          label: asTrimmedString(input.label),
        };
        if (!effect.distance) warnings.push(`${path}: shift has 0 distance.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "teleport": {
        const known = new Set(["kind", "distance", "spend"]);
        const effect = { kind: "teleport", distance: asNonNegInt(input.distance, 0) };
        if (input.spend && typeof input.spend === "object") {
          effect.spend = normalizeSpendConfig(input.spend, warnings, `${path}.spend`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "abilityTest": {
        const known = new Set(["kind", "label", "attribute", "skill", "bonus", "rollFormula", "text"]);
        const effect = {
          kind: "abilityTest",
          label: asTrimmedString(input.label) || "Test",
          attribute: P.normalizeAttributeOrList
            ? P.normalizeAttributeOrList(input.attribute || "Strongest")
            : P.normalizeAttribute(input.attribute || "Strongest"),
          skill: asTrimmedString(input.skill),
          bonus: asInt(input.bonus, 0),
          rollFormula: asTrimmedString(input.rollFormula) || "2d10",
          text: asTrimmedString(input.text),
        };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "swap": {
        const known = new Set(["kind"]);
        const effect = { kind: "swap" };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "resourceGain": {
        const known = new Set(["kind", "resource", "amount"]);
        const effect = {
          kind: "resourceGain",
          resource: asTrimmedString(input.resource),
          amount: asInt(input.amount, 0),
        };
        if (!effect.resource) warnings.push(`${path}: resourceGain missing resource name.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "surgeGain": {
        const known = new Set(["kind", "amount"]);
        const effect = {
          kind: "surgeGain",
          amount: asInt(input.amount, 0),
        };
        if (!effect.amount) warnings.push(`${path}: surgeGain amount is 0.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "freeStrike": {
        const known = new Set(["kind", "against", "text", "asPowerRoll"]);
        const effect = {
          kind: "freeStrike",
          against: asTrimmedString(input.against),
          text: asTrimmedString(input.text),
          asPowerRoll: input.asPowerRoll === true,
        };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "cascade": {
        const known = new Set(["kind", "ability", "by", "text"]);
        const effect = {
          kind: "cascade",
          ability: asTrimmedString(input.ability),
          by: asTrimmedString(input.by),
          text: asTrimmedString(input.text),
        };
        if (!effect.ability && !effect.text) {
          warnings.push(`${path}: cascade has no ability name or text.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "note": {
        const known = new Set(["kind", "text"]);
        const effect = { kind: "note", text: asTrimmedString(input.text) };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "potency": {
        const known = new Set(["kind", "attribute", "level", "threshold", "target", "onFail", "onResist"]);
        const attribute = P.normalizeAttribute(input.attribute || "Might");
        if (!P.ATTRIBUTES.includes(attribute) || attribute === "Strongest") {
          warnings.push(`${path}: potency attribute should be M/A/R/I/P (got "${input.attribute}").`);
        }
        const rawThreshold = input.threshold ?? input.target;
        const numericThreshold = rawThreshold !== "" && rawThreshold !== null && rawThreshold !== undefined
          ? Number(rawThreshold)
          : Number.NaN;
        const level = P.normalizePotencyLevel(input.level || "weak");
        const onFail = normalizeEffectList(input.onFail || input.effects || [], warnings, `${path}.onFail`);
        const effect = { kind: "potency", attribute, level, onFail };
        const onResist = normalizeEffectList(input.onResist || [], warnings, `${path}.onResist`);
        if (onResist.length) effect.onResist = onResist;
        if (Number.isFinite(numericThreshold)) effect.threshold = numericThreshold;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "spend": {
        const known = new Set(["kind", "resource", "amount", "maxAmount", "timing", "effects", "prompt"]);
        const effect = {
          kind: "spend",
          resource: asTrimmedString(input.resource),
          amount: asPosInt(input.amount, 1),
          maxAmount: normalizeSpendMaxAmount(input.maxAmount),
          timing: pickKnown(input.timing, P.SPEND_TIMINGS, "postResult"),
          prompt: asTrimmedString(input.prompt),
          effects: normalizeEffectList(input.effects || [], warnings, `${path}.effects`),
        };

        if (!effect.resource) warnings.push(`${path}: spend missing resource name.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifKeyword": {
        const known = new Set(["kind", "all", "any", "none", "then", "else"]);
        const effect = {
          kind: "ifKeyword",
          all: Array.isArray(input.all) ? input.all.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
          any: Array.isArray(input.any) ? input.any.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
          none: Array.isArray(input.none) ? input.none.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.all.length && !effect.any.length && !effect.none.length) {
          warnings.push(`${path}: ifKeyword has no all/any/none — predicate always passes.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifStrained": {
        // Branches on whether the caster is currently strained (heroic resource
        // value < 0). The Talent class uses this — Clarity below 0 = strained.
        // Other classes that overload their resource into negative territory
        // will also trip this.
        const known = new Set(["kind", "then", "else"]);
        const effect = {
          kind: "ifStrained",
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.then.length && !effect.else.length) {
          warnings.push(`${path}: ifStrained has no then/else effects.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifPrompt": {
        const known = new Set(["kind", "question", "yesLabel", "noLabel", "target", "then", "else"]);
        const effect = {
          kind: "ifPrompt",
          question: asTrimmedString(input.question),
          yesLabel: asTrimmedString(input.yesLabel) || "Yes",
          noLabel: asTrimmedString(input.noLabel) || "No",
          target: asTrimmedString(input.target),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.question) warnings.push(`${path}: ifPrompt missing question.`);
        if (!effect.then.length && !effect.else.length) {
          warnings.push(`${path}: ifPrompt has no then/else effects.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifMark": {
        const known = new Set(["kind", "predicate", "markType", "target", "then", "else"]);
        const predicate = pickKnown(input.predicate, [
          "targetJudgedBySelf",
          "targetJudgedByAny",
          "actorIsMyJudgedTarget",
          "sourceIsJudgingTarget",
          "targetInPersistentZoneJudgedByZoneCaster",
        ], "targetJudgedBySelf");
        const effect = {
          kind: "ifMark",
          predicate,
          markType: asTrimmedString(input.markType) || "judgment",
          target: asTrimmedString(input.target),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.then.length && !effect.else.length) {
          warnings.push(`${path}: ifMark has no then/else effects.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifScopedFlag": {
        const known = new Set(["kind", "scope", "key", "source", "target", "mode", "then", "else"]);
        const effect = {
          kind: "ifScopedFlag",
          scope: pickKnown(input.scope, ["round", "turn", "encounter"], "round"),
          key: asTrimmedString(input.key),
          source: pickKnown(input.source, ["self", "eventSource"], "self"),
          target: pickKnown(input.target, ["target", "judgedTarget", "eventTarget"], "target"),
          mode: pickKnown(input.mode, ["set", "notSet"], "notSet"),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.key) warnings.push(`${path}: ifScopedFlag missing key.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifZone": {
        const known = new Set(["kind", "tag", "tags", "adjacent", "who", "target", "question", "then", "else"]);
        const tags = normalizeZoneTags(input);
        const effect = {
          kind: "ifZone",
          tags,
          ...(input.adjacent === true ? { adjacent: true } : {}),
          who: pickKnown(input.who, ["target", "self"], "target"),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const question = asTrimmedString(input.question);
        if (question) effect.question = question;
        if (!tags.length) warnings.push(`${path}: ifZone has no tag; the user will be asked every time.`);
        if (!effect.then.length && !effect.else.length) warnings.push(`${path}: ifZone has no then/else effects.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifTarget": {
        const known = new Set(["kind", ...TARGET_TEST_KEYS, "then", "else"]);
        const effect = {
          kind: "ifTarget",
          ...normalizeTargetTest(input, warnings, path, "ifTarget"),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        if (!effect.then.length && !effect.else.length) warnings.push(`${path}: ifTarget has no then/else effects.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "move": {
        const known = new Set(["kind", "verb", "distance", "bonus", "heroesMove", "then", "target", "alongPath"]);
        const effect = { kind: "move", verb: pickKnownLoose(input.verb, ["shift", "move", "teleport"], "shift") };
        const distanceText = asTrimmedString(input.distance).toLowerCase().replace(/[\s_-]+/g, "");
        if (distanceText === "speed") effect.distance = "speed";
        else if (distanceText === "halfspeed" || distanceText === "half") effect.distance = "halfSpeed";
        else effect.distance = asNonNegInt(input.distance, 0);
        const bonus = asInt(input.bonus, 0);
        if (bonus) effect.bonus = bonus;
        if (input.heroesMove === false) effect.heroesMove = false;
        const then = normalizeEffectList(input.then || [], warnings, `${path}.then`);
        if (then.length) effect.then = then;
        // Trample, blazing charge: effects on each creature the mover went through (`through`) or came next to
        // (`adjacent`). They are shown pre-picked to confirm (click to drop one), unless `confirm: false`.
        if (input.alongPath && typeof input.alongPath === "object") {
          const along = {};
          const through = normalizeEffectList(input.alongPath.through || [], warnings, `${path}.alongPath.through`);
          const adjacent = normalizeEffectList(input.alongPath.adjacent || [], warnings, `${path}.alongPath.adjacent`);
          if (through.length) along.through = through;
          if (adjacent.length) along.adjacent = adjacent;
          if (input.alongPath.predicate) along.predicate = pickKnownLoose(input.alongPath.predicate, ["ally", "enemy", "creature"], "creature");
          if (input.alongPath.confirm === false) along.confirm = false;
          if (through.length || adjacent.length) effect.alongPath = along;
        }
        if (effect.distance === 0 && !bonus) warnings.push(`${path}: move has no distance.`);
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "useAbility": {
        const known = new Set(["kind", "ability", "who", "times", "edge", "sameTargets", "target"]);
        const effect = {
          kind: "useAbility",
          ability: asTrimmedString(input.ability),
          who: pickKnownLoose(input.who, ["self", "target"], "self"),
          times: asPosInt(input.times, 1),
        };
        if (!effect.ability) warnings.push(`${path}: useAbility needs the ability's name (or "signature").`);
        const edge = asInt(input.edge, 0);
        if (edge) effect.edge = Math.max(-2, Math.min(2, edge));
        if (input.sameTargets === true) effect.sameTargets = true;
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "land": {
        const effect = { kind: "land" };
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        return effect;
      }
      case "grantAction": {
        const known = new Set(["kind", "grant", "text", "target"]);
        const effect = { kind: "grantAction", grant: asTrimmedString(input.grant) || "a main action" };
        const text = asTrimmedString(input.text);
        if (text) effect.text = text;
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "counter": {
        const known = new Set(["kind", "name", "label", "op", "amount", "amountDice", "min", "max", "target"]);
        const effect = {
          kind: "counter",
          name: normalizeCounterName(input.name),
          op: pickKnownLoose(input.op, ["add", "set", "spend"], "add"),
          amount: input.op === "set" ? asInt(input.amount, 0) : asInt(input.amount, 1),
        };
        if (!effect.name) warnings.push(`${path}: counter needs a name such as "rage".`);
        const dice = asTrimmedString(input.amountDice);
        if (dice) effect.amountDice = dice;
        const label = asTrimmedString(input.label);
        if (label) effect.label = label;
        if (input.min !== undefined && input.min !== null && input.min !== "") effect.min = asInt(input.min, 0);
        if (input.max !== undefined && input.max !== null && input.max !== "") effect.max = asInt(input.max, 0);
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifCounter": {
        const known = new Set(["kind", "name", "min", "max", "who", "target", "then", "else"]);
        const effect = {
          kind: "ifCounter",
          ...normalizeCounterTest(input, warnings, path, "ifCounter"),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "buff": {
        const known = new Set(["kind", "label", "modifier", "damageBonus", "potencyBonus", "side", "appliesTo", "keywordsAny", "keywordsAll", "duration", "consume", "target", "speedBonus", "ignoreDifficultTerrain", "noOpportunityAttacks", "moveThroughCreatures", "fly"]);
        const effect = { kind: "buff", label: asTrimmedString(input.label) || "Buff" };
        if (input.modifier !== undefined && input.modifier !== null && input.modifier !== "") effect.modifier = pickKnownLoose(input.modifier, ["edge", "bane", "doubleEdge", "doubleBane"], "edge");
        const damageBonus = asInt(input.damageBonus, 0);
        if (damageBonus) effect.damageBonus = damageBonus;
        const potencyBonus = asInt(input.potencyBonus, 0);
        if (potencyBonus) effect.potencyBonus = potencyBonus;
        effect.side = pickKnownLoose(input.side, ["own", "against"], "own");
        effect.appliesTo = pickKnownLoose(input.appliesTo, ["abilityRolls", "strikes", "melee", "ranged", "tests"], "abilityRolls");
        // Any kind of roll: the ability must have one (keywordsAny) or all (keywordsAll) of these keywords as well.
        const buffAny = normalizeTextList(input.keywordsAny);
        if (buffAny.length) effect.keywordsAny = buffAny;
        const buffAll = normalizeTextList(input.keywordsAll);
        if (buffAll.length) effect.keywordsAll = buffAll;
        effect.duration = P.normalizeDuration ? P.normalizeDuration(input.duration || "endOfTurn") : (asTrimmedString(input.duration) || "endOfTurn");
        // Movement in a buff ("+2 speed until the end of your turn"): it lasts its duration, not one roll.
        normalizeMovementFields(input, effect);
        const moves = Boolean(effect.speedBonus || MOVEMENT_FLAGS.some((flag) => effect[flag]));
        effect.consume = pickKnownLoose(input.consume, ["nextRoll", "duration"], moves && !effect.modifier && !effect.damageBonus && !effect.potencyBonus ? "duration" : "nextRoll");
        if (!effect.modifier && !effect.damageBonus && !effect.potencyBonus && !moves) warnings.push(`${path}: buff has no modifier, damageBonus or potencyBonus.`);
        if (!asTrimmedString(input.label)) warnings.push(`${path}: buff has no label; the token and roll window will say "Buff".`);
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "maliceGain": {
        const known = new Set(["kind", "amount", "amountDice", "target"]);
        // A negative amount takes Malice away ("the Director loses 2 Malice").
        const effect = { kind: "maliceGain", amount: asInt(input.amount, 1) || 1 };
        const dice = asTrimmedString(input.amountDice);
        if (dice) effect.amountDice = dice;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "loseRecoveries": {
        const known = new Set(["kind", "amount", "amountDice", "target"]);
        const effect = { kind: "loseRecoveries", amount: asPosInt(input.amount, 1) };
        const dice = asTrimmedString(input.amountDice);
        if (dice) effect.amountDice = dice;
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "endCondition": {
        const known = new Set(["kind", "condition", "conditions", "duration", "pick", "count", "target"]);
        const effect = { kind: "endCondition" };
        const names = normalizeWordList(input.conditions !== undefined ? input.conditions : input.condition);
        if (names.length) effect.condition = names;
        effect.duration = pickKnownLoose(input.duration, ["any", "saveEnds", "endOfTurn", "endOfEncounter"], "any");
        effect.pick = pickKnownLoose(input.pick, ["choose", "all"], "choose");
        effect.count = asPosInt(input.count, 1);
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifRoll": {
        const known = new Set(["kind", ...ROLL_TEST_KEYS, "target", "then", "else"]);
        const effect = {
          kind: "ifRoll",
          ...normalizeRollTest(input, warnings, path, "ifRoll"),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        const target = asTrimmedString(input.target);
        if (target) effect.target = target;
        if (!effect.then.length && !effect.else.length) warnings.push(`${path}: ifRoll has no then/else effects.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "ifDistance": {
        const known = new Set(["kind", "from", "to", "fromGroup", "toGroup", "min", "max", "target", "then", "else"]);
        const effect = {
          kind: "ifDistance",
          from: normalizeDistanceEndpoint(input.from, "self"),
          to: normalizeDistanceEndpoint(input.to, "target"),
          target: asTrimmedString(input.target),
          then: normalizeEffectList(input.then || [], warnings, `${path}.then`),
          else: normalizeEffectList(input.else || [], warnings, `${path}.else`),
        };
        const fromGroup = asTrimmedString(input.fromGroup);
        if (fromGroup) effect.fromGroup = fromGroup;
        const toGroup = asTrimmedString(input.toGroup);
        if (toGroup) effect.toGroup = toGroup;
        if (input.max != null && input.max !== "") effect.max = asNonNegInt(input.max, 0);
        if (input.min != null && input.min !== "") effect.min = asNonNegInt(input.min, 0);
        if (effect.max == null && effect.min == null) {
          warnings.push(`${path}: ifDistance has no min/max; condition always passes when both tokens are on the board.`);
        }
        if (!effect.then.length && !effect.else.length) {
          warnings.push(`${path}: ifDistance has no then/else effects.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "setScopedFlag": {
        const known = new Set(["kind", "scope", "key", "source", "target"]);
        const effect = {
          kind: "setScopedFlag",
          scope: pickKnown(input.scope, ["round", "turn", "encounter"], "round"),
          key: asTrimmedString(input.key),
          source: pickKnown(input.source, ["self", "eventSource"], "self"),
          target: pickKnown(input.target, ["target", "judgedTarget", "eventTarget"], "target"),
        };
        if (!effect.key) warnings.push(`${path}: setScopedFlag missing key.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "applyMark": {
        const known = new Set(["kind", "markType", "target", "duration", "exclusivePerSource", "exclusivePerTarget", "transfer", "text"]);
        const effect = {
          kind: "applyMark",
          markType: asTrimmedString(input.markType) || "judgment",
          target: asTrimmedString(input.target),
          duration: pickKnown(input.duration, ["endOfEncounter"], "endOfEncounter"),
          exclusivePerSource: input.exclusivePerSource !== false,
          exclusivePerTarget: input.exclusivePerTarget !== false,
          transfer: input.transfer !== false,
          text: asTrimmedString(input.text),
        };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "endMark": {
        const known = new Set(["kind", "markType", "scope", "target", "text"]);
        const effect = {
          kind: "endMark",
          markType: asTrimmedString(input.markType) || "judgment",
          scope: pickKnown(input.scope, ["selfOwned", "target"], "selfOwned"),
          target: asTrimmedString(input.target),
          text: asTrimmedString(input.text),
        };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "halveTriggeringDamage": {
        // Used inside a `trigger` block to soak half of the damage that fired
        // the trigger. Requires a `damage`-event match on the trigger block.
        // The runner reads the captured triggering damage payload from state.
        const known = new Set(["kind", "rounding"]);
        const rounding = pickKnown(input.rounding, ["up", "down"], "up");
        const effect = { kind: "halveTriggeringDamage", rounding };
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "aura": {
        // Switches the caster's token aura on (or off) when the ability runs.
        // Token auras are a VTT placement feature; the runner forwards this to
        // the board via the setAura context hook. radius is clamped 1-20.
        const known = new Set(["kind", "enabled", "radius", "color", "target", "text", "affects", "triggers", "trigger", "effects", "expires", "lifetime"]);
        const enabled = input.enabled !== false;
        const radius = Math.min(20, Math.max(1, asPosInt(input.radius, 1)));
        const effect = {
          kind: "aura",
          enabled,
          radius,
          target: pickKnown(input.target, ["self", "target"], "self"),
        };
        const color = asTrimmedString(input.color);
        if (color) effect.color = color;
        const text = asTrimmedString(input.text);
        if (text) effect.text = text;
        const affects = P.normalizeTargetPredicate(input.affects || input.creature || "");
        if (affects) effect.affects = affects;
        const auraTriggers = normalizeAuraTriggers(input.triggers || input.trigger, warnings, `${path}.triggers`);
        if (auraTriggers.length) effect.triggers = auraTriggers;
        if (Array.isArray(input.effects)) {
          effect.effects = normalizeEffectList(input.effects, warnings, `${path}.effects`);
        }
        const expires = normalizeTriggerLifetime(input.expires || input.lifetime, warnings, `${path}.expires`);
        if (expires) effect.expires = expires;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "other": {
        const known = new Set(["kind", "text"]);
        const effect = { kind: "other", text: asTrimmedString(input.text) };
        if (!effect.text) warnings.push(`${path}: "other" effect has no text — runtime will print as "(other)".`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      default:
        return null;
    }
  }

  function normalizeSpendMaxAmount(value) {
    const text = asTrimmedString(value).toLowerCase();
    if (text === "available") return "available";
    const parsed = asPosInt(value, 0);
    return parsed > 0 ? parsed : 0;
  }

  function normalizeSpendConfig(input, warnings, path) {
    const config = {
      resource: asTrimmedString(input.resource),
      amount: asPosInt(input.amount ?? input.minAmount, 1),
      maxAmount: normalizeSpendMaxAmount(input.maxAmount),
      perAmount: asPosInt(input.perAmount, 1),
      prompt: asTrimmedString(input.prompt),
    };
    if (!config.resource) warnings.push(`${path}: spend missing resource name.`);
    return config;
  }

  // ---------- blocks ----------

  function normalizeCount(value) {
    if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(String(value).trim()))) {
      return { value: Math.max(0, asInt(value, 1)), mode: "exact" };
    }
    if (value && typeof value === "object") {
      if (value.upTo !== undefined) return { value: Math.max(0, asInt(value.upTo, 1)), mode: "upTo" };
      if (value.exact !== undefined) return { value: Math.max(0, asInt(value.exact, 1)), mode: "exact" };
      if (value.value !== undefined) {
        return {
          value: Math.max(0, asInt(value.value, 1)),
          mode: pickKnown(value.mode, ["exact", "upTo", "all"], "exact"),
        };
      }
    }
    if (typeof value === "string") {
      const lower = value.trim().toLowerCase();
      if (lower === "one") return { value: 1, mode: "exact" };
      if (lower === "self") return { value: 1, mode: "exact" };
      if (lower === "each" || lower === "all") return { value: 0, mode: "all" };
    }
    return { value: 1, mode: "exact" };
  }

  function normalizeDistance(value, warnings, path) {
    if (!value) return null;
    if (typeof value === "string") {
      return { form: "ranged", value: 0, raw: value.trim() };
    }
    if (typeof value !== "object") return null;
    const form = pickKnown(value.form, P.DISTANCE_FORMS, "ranged");
    if (!P.DISTANCE_FORMS.includes(value.form) && value.form) {
      warnings.push(`${path}: unknown distance form "${value.form}", defaulting to ranged.`);
    }
    return {
      form,
      value: asNonNegInt(value.value, 0),
      secondary: asNonNegInt(value.secondary, 0),
      within: asNonNegInt(value.within, 0),
    };
  }

  function normalizeTargetBlock(input, warnings, path) {
    const known = new Set([
      "type", "id", "name", "mode", "predicate", "creature", "count", "optional",
      "distance", "range", "selectionGuide", "shape", "size", "width", "height", "length", "note",
      "promptTitle", "promptText", "excludeGroups", "excludeGroup",
      "rangeOrigin", "structure", "wallColor", "wallType", "wallStamina", "near",
    ]);
    const mode = pickKnown(input.mode, P.TARGET_MODES, "token");
    const predicateRaw = input.predicate || input.creature || "creature";
    const predicate = P.normalizeTargetPredicate(predicateRaw);
    const count = normalizeCount(input.count);
    const block = {
      type: "target",
      id: input.id || createId("target"),
      name: asTrimmedString(input.name) || "primary",
      mode,
      predicate,
      count,
      optional: asBool(input.optional),
    };
    const promptTitle = asTrimmedString(input.promptTitle);
    const promptText = asTrimmedString(input.promptText);
    if (promptTitle) block.promptTitle = promptTitle;
    if (promptText) block.promptText = promptText;
    // Splash: the creatures near an earlier group ("each enemy adjacent to the target"), pre-picked for the user to
    // confirm. Token mode only.
    if (input.near !== undefined && input.near !== null) {
      if (typeof input.near !== "object" || Array.isArray(input.near)) {
        warnings.push(`${path}.near: must be an object such as { "group": "primary", "within": 1 }.`);
      } else if (mode !== "token") {
        warnings.push(`${path}.near: only works on a token target block.`);
      } else {
        const near = { group: asTrimmedString(input.near.group) || "primary", within: asNonNegInt(input.near.within, 1) };
        if (input.near.includeSelf === true) near.includeSelf = true;
        block.near = near;
      }
    }
    if (input.rangeOrigin !== undefined && input.rangeOrigin !== null) {
      const rangeOrigin = typeof input.rangeOrigin === "string" ? input.rangeOrigin.trim() : "";
      if (rangeOrigin) {
        block.rangeOrigin = rangeOrigin;
      } else if (input.rangeOrigin !== "") {
        warnings.push(`${path}.rangeOrigin: must be "self" or the name of an earlier target/area block.`);
      }
    }
    const excludeGroups = Array.isArray(input.excludeGroups)
      ? input.excludeGroups.map((group) => asTrimmedString(group)).filter(Boolean)
      : asTrimmedString(input.excludeGroup)
        ? [asTrimmedString(input.excludeGroup)]
        : [];
    if (excludeGroups.length) block.excludeGroups = excludeGroups;
    let distance = normalizeDistance(input.distance, warnings, `${path}.distance`);
    const legacyRange = asNonNegInt(input.range, 0);
    const rawGuide = input.selectionGuide && typeof input.selectionGuide === "object"
      ? input.selectionGuide
      : null;
    const guideRange = asNonNegInt(rawGuide?.range, 0);
    if (!distance && (guideRange || legacyRange)) {
      distance = {
        form: mode === "area" ? pickKnown(input.shape, P.AREA_SHAPES, "cube") : "ranged",
        value: mode === "area" ? 0 : (guideRange || legacyRange),
        secondary: 0,
        within: mode === "area" ? (guideRange || legacyRange) : 0,
      };
    }
    if (distance) block.distance = distance;
    if (legacyRange) block.range = legacyRange;
    if (guideRange) {
      block.selectionGuide = {
        range: guideRange,
        form: asTrimmedString(rawGuide?.form) || distance?.form || (mode === "area" ? "cube" : "ranged"),
        enforce: false,
      };
    }
    if (mode === "area") {
      block.shape = pickKnown(input.shape, P.AREA_SHAPES, "cube");
      if (input.shape && !P.AREA_SHAPES.includes(input.shape)) {
        warnings.push(`${path}: unknown area shape "${input.shape}", defaulting to cube.`);
      }
      block.size = asPosInt(input.size, 3);
      if (block.shape === "rectangle") {
        block.width = asPosInt(input.width, block.size);
        block.height = asPosInt(input.height, block.size);
      }
      if (block.shape === "line" || block.shape === "wall") {
        block.length = asPosInt(input.length, block.size);
      }
      if (block.shape === "wall") {
        if (asBool(input.structure)) block.structure = true;
        const wallColor = asTrimmedString(input.wallColor);
        if (wallColor) block.wallColor = wallColor;
        // What it takes to break the wall, when the ability's text says: "a wall of stone" is
        // wallType "stone" (glass, wood, stone or metal); "each square has 15 Stamina" is
        // wallStamina 15. Used only by a wall with structure: true. Neither means not breakable.
        const wallType = asTrimmedString(input.wallType).toLowerCase();
        if (["glass", "wood", "stone", "metal"].includes(wallType)) block.wallType = wallType;
        else if (wallType) warnings.push(`${path}: wallType "${wallType}" is not glass, wood, stone or metal; ignored.`);
        const wallStamina = Number(input.wallStamina);
        if (Number.isInteger(wallStamina) && wallStamina >= 1 && wallStamina <= 999) block.wallStamina = wallStamina;
        else if (input.wallStamina !== undefined && input.wallStamina !== null && input.wallStamina !== "") warnings.push(`${path}: wallStamina must be a whole number from 1 to 999; ignored.`);
      }
    }
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeTier(input, warnings, path) {
    if (!input || typeof input !== "object") return { effects: [] };
    return { effects: normalizeEffectList(input.effects, warnings, `${path}.effects`) };
  }

  function normalizePowerRollBlock(input, warnings, path) {
    const known = new Set(["type", "id", "attribute", "bonus", "flatBonus", "target", "tiers", "rollFormula", "note", "whenWinded"]);
    const tiersInput = input.tiers && typeof input.tiers === "object" ? input.tiers : {};
    const tiers = {};
    for (const key of P.TIER_KEYS) {
      const legacy = Object.entries(P.LEGACY_TIER_KEYS).find(([, mapped]) => mapped === key)?.[0];
      const source = tiersInput[key] || (legacy && tiersInput[legacy]) || {};
      tiers[key] = normalizeTier(source, warnings, `${path}.tiers.${key}`);
    }
    const attribute = P.normalizeAttributeOrList
      ? P.normalizeAttributeOrList(input.attribute || "Strongest")
      : P.normalizeAttribute(input.attribute || "Strongest");
    const block = {
      type: "powerRoll",
      id: input.id || createId("powerroll"),
      attribute,
      bonus: asInt(input.bonus, 0),
      target: normalizeTargetRef(input.target),
      rollFormula: asTrimmedString(input.rollFormula) || "2d10",
      tiers,
    };
    // Monster-friendly: literal roll bonus. When present, runner uses this
    // INSTEAD of resolving `attribute` via context.getAttributeBonus(). PCs
    // continue using the attribute path; they don't author this field.
    if (input.flatBonus !== undefined && input.flatBonus !== null && input.flatBonus !== "") {
      block.flatBonus = asInt(input.flatBonus, 0);
    }
    // Optional override values used when the actor is winded (HP <= floor(maxHP/2)).
    // Shallow-merged over the base block at runtime. Both PCs and monsters can use it.
    const wWinded = normalizeWhenWinded(input.whenWinded, warnings, `${path}.whenWinded`, "powerRoll");
    if (wWinded) block.whenWinded = wWinded;
    if (input.note) block.note = asTrimmedString(input.note);
    const attrValid = Array.isArray(attribute)
      ? attribute.every((a) => P.ATTRIBUTES.includes(a))
      : P.ATTRIBUTES.includes(attribute);
    if (!attrValid) {
      warnings.push(`${path}: attribute "${JSON.stringify(attribute)}" not in registry.`);
    }
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  // Normalize a `whenWinded` override sub-object. Allowed fields differ by host
  // block type. We intentionally keep validation light: unknown fields stay in
  // _extra so authors can experiment, but we surface a warning.
  function normalizeWhenWinded(input, warnings, path, hostType) {
    if (!input || typeof input !== "object") return null;
    const out = {};
    if (hostType === "powerRoll") {
      if (input.bonus !== undefined && input.bonus !== null) out.bonus = asInt(input.bonus, 0);
      if (input.flatBonus !== undefined && input.flatBonus !== null && input.flatBonus !== "") {
        out.flatBonus = asInt(input.flatBonus, 0);
      }
      if (input.attribute) {
        out.attribute = P.normalizeAttributeOrList
          ? P.normalizeAttributeOrList(input.attribute)
          : P.normalizeAttribute(input.attribute);
      }
      if (input.target !== undefined && input.target !== null) out.target = normalizeTargetRef(input.target);
      if (input.tiers && typeof input.tiers === "object") {
        const tiers = {};
        for (const key of P.TIER_KEYS) {
          if (input.tiers[key]) tiers[key] = normalizeTier(input.tiers[key], warnings, `${path}.tiers.${key}`);
        }
        if (Object.keys(tiers).length) out.tiers = tiers;
      }
    } else if (hostType === "effect") {
      if (Array.isArray(input.effects)) {
        out.effects = normalizeEffectList(input.effects, warnings, `${path}.effects`);
      }
      if (input.target !== undefined && input.target !== null) out.target = normalizeTargetRef(input.target);
    }
    return Object.keys(out).length ? out : null;
  }

  function normalizeEffectBlock(input, warnings, path) {
    const known = new Set(["type", "id", "target", "effects", "note", "whenWinded"]);
    const block = {
      type: "effect",
      id: input.id || createId("effect"),
      target: normalizeTargetRef(input.target),
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (!block.effects.length) warnings.push(`${path}: effect block has no effects.`);
    if (input.note) block.note = asTrimmedString(input.note);
    const wWinded = normalizeWhenWinded(input.whenWinded, warnings, `${path}.whenWinded`, "effect");
    if (wWinded) block.whenWinded = wWinded;
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  // Recognized event keys for trigger blocks. The board's AbilityTriggerBus
  // fires these names — keep this list in sync with the fan-out sites in
  // board-interactions.js (handleAutomationDamageRequest, transitionToActiveTurn,
  // end-of-turn flow, vtt:token-moved listener).
  const TRIGGER_EVENTS = [
    "damage",
    "damageDealt",
    "staminaChange",
    "staminaZero",
    "turnStart",
    "turnEnd",
    "roundStart",
    "roundEnd",
    "combatStart",
    "combatEnd",
    "move",
    "forcedMovement",
    "forcedMovementDealt",
    "actionUsed",
    "powerRoll",
    "abilityTest",
    "abilityRoll",
    "potency",
    "markApplied",
    // Phase 6: a creature is picked as a target (before any roll; "when targeted" interrupts); a condition is
    // gained or ends on a creature; a save against a condition fails or succeeds.
    "targeted",
    "conditionGained",
    "conditionEnded",
    "saveFailed",
    "saveSucceeded",
    // A creature moves onto this token's squares (within 0) or comes within N squares of it, by any movement
    // (walks, shifts, pushes, teleports): traps, pressure plates, hazards.
    "entersSpace",
  ];

  // The `whose` filter answers "whose event is this?" relative to the caster
  // and the runner's previously-named target groups.
  const WHOSE_VALUES = ["self", "ally", "enemy", "target", "judgedTarget", "markSource", "any"];
  const TRIGGER_LIFETIME_WHOSE_VALUES = ["self", "ally", "enemy", "target", "any"];
  const STAMINA_DIRECTIONS = ["down", "up", "either"];
  const TRIGGER_LIFETIME_EVENTS = ["turnStart", "turnEnd", "roundStart", "roundEnd", "combatStart", "combatEnd"];
  const AURA_TRIGGER_EVENTS = [...TRIGGER_EVENTS, "enter", "occupantTurnStart", "occupantTurnEnd"];

  function normalizeWhoseValue(value) {
    const raw = asTrimmedString(value);
    if (!raw) return "";
    const match = WHOSE_VALUES.find((item) => item.toLowerCase() === raw.toLowerCase());
    return match || "";
  }

  function normalizeTriggerMatch(input, warnings, path) {
    if (!input || typeof input !== "object") return null;
    const rawEvent = asTrimmedString(input.event).toLowerCase();
    if (!rawEvent) return null;
    const event = TRIGGER_EVENTS.find((e) => e.toLowerCase() === rawEvent);
    if (!event) {
      warnings.push(`${path}.event: unknown trigger event "${input.event}". Known: ${TRIGGER_EVENTS.join(", ")}.`);
      return null;
    }
    const filterInput = input.filter && typeof input.filter === "object" ? input.filter : {};
    const filter = {};
    const whoseRaw = asTrimmedString(filterInput.whose);
    if (whoseRaw) {
      const whose = normalizeWhoseValue(whoseRaw);
      if (whose) {
        filter.whose = whose;
      } else {
        warnings.push(`${path}.filter.whose: "${filterInput.whose}" not in ${WHOSE_VALUES.join("/")}.`);
        filter.whose = "any";
      }
    }
    if (filter.whose === "target") {
      const ref = asTrimmedString(filterInput.targetGroup) || asTrimmedString(filterInput.group);
      if (ref) filter.targetGroup = ref;
    }
    const targetWhoseRaw = asTrimmedString(filterInput.targetWhose);
    if (targetWhoseRaw) {
      const targetWhose = normalizeWhoseValue(targetWhoseRaw);
      if (targetWhose) {
        filter.targetWhose = targetWhose;
      } else {
        warnings.push(`${path}.filter.targetWhose: "${filterInput.targetWhose}" not in ${WHOSE_VALUES.join("/")}.`);
      }
    }
    // Distance band (Layer 1): event fires only when the caster is within /
    // beyond N squares of the other token in the event. Works for any event.
    if (filterInput.withinSquares != null && filterInput.withinSquares !== "") {
      filter.withinSquares = asNonNegInt(filterInput.withinSquares, 0);
    }
    if (filterInput.minSquares != null && filterInput.minSquares !== "") {
      filter.minSquares = asNonNegInt(filterInput.minSquares, 0);
    }
    // Universal caster-state gates (any event). `excludeSelf` skips events the
    // caster themself caused ("another hero..." triggers — whose:"ally" is a
    // pure team check and includes self). `casterHasNotActed` only arms while
    // the caster has not yet taken their turn this combat round.
    if (filterInput.excludeSelf === true) filter.excludeSelf = true;
    if (filterInput.casterHasNotActed === true) filter.casterHasNotActed = true;
    if (event === "damage" || event === "damageDealt") {
      const minAmount = asNonNegInt(filterInput.minAmount, 0);
      if (minAmount) filter.minAmount = minAmount;
      const maxAmount = asNonNegInt(filterInput.maxAmount, 0);
      if (maxAmount) filter.maxAmount = maxAmount;
      const dtList = Array.isArray(filterInput.damageType)
        ? filterInput.damageType
        : filterInput.damageType !== undefined && filterInput.damageType !== null
          ? [filterInput.damageType]
          : [];
      const damageTypes = dtList
        .map((t) => asTrimmedString(t).toLowerCase())
        .filter(Boolean);
      if (damageTypes.length) filter.damageType = damageTypes;
      const actionKind = asTrimmedString(filterInput.actionKind);
      if (actionKind) filter.actionKind = actionKind;
      const costIncludes = asTrimmedString(filterInput.costIncludes || filterInput.resourceCostIncludes);
      if (costIncludes) filter.costIncludes = costIncludes;
      const keywordsAny = Array.isArray(filterInput.keywordsAny)
        ? filterInput.keywordsAny.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean)
        : [];
      if (keywordsAny.length) filter.keywordsAny = keywordsAny;
    }
    if (event === "staminaChange" || event === "staminaZero") {
      const dirRaw = asTrimmedString(filterInput.direction).toLowerCase();
      if (dirRaw && !STAMINA_DIRECTIONS.includes(dirRaw)) {
        warnings.push(`${path}.filter.direction: "${filterInput.direction}" not in ${STAMINA_DIRECTIONS.join("/")}.`);
      }
      filter.direction = STAMINA_DIRECTIONS.includes(dirRaw) ? dirRaw : "either";
    }
    if (event === "actionUsed") {
      const actionKind = asTrimmedString(filterInput.actionKind);
      if (actionKind) filter.actionKind = actionKind;
      const costIncludes = asTrimmedString(filterInput.costIncludes || filterInput.resourceCostIncludes);
      if (costIncludes) filter.costIncludes = costIncludes;
      if (filterInput.lineOfEffectTo) filter.lineOfEffectTo = asTrimmedString(filterInput.lineOfEffectTo);
      const keywordsAny = Array.isArray(filterInput.keywordsAny)
        ? filterInput.keywordsAny.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean)
        : [];
      if (keywordsAny.length) filter.keywordsAny = keywordsAny;
    }
    if (event === "targeted") {
      const actionKind = asTrimmedString(filterInput.actionKind);
      if (actionKind) filter.actionKind = actionKind;
      const costIncludes = asTrimmedString(filterInput.costIncludes || filterInput.resourceCostIncludes);
      if (costIncludes) filter.costIncludes = costIncludes;
      if (filterInput.lineOfEffectTo) filter.lineOfEffectTo = asTrimmedString(filterInput.lineOfEffectTo);
      const keywordsAny = Array.isArray(filterInput.keywordsAny)
        ? filterInput.keywordsAny.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean)
        : [];
      if (keywordsAny.length) filter.keywordsAny = keywordsAny;
    }
    if (event === "entersSpace") {
      filter.within = asNonNegInt(filterInput.within, 0);
    }
    if (["conditionGained", "conditionEnded", "saveFailed", "saveSucceeded"].includes(event)) {
      // Which condition (name, the text of an "other" condition, or a buff's label); none = any.
      const conditionName = normalizeTextList(filterInput.conditionName ?? filterInput.condition);
      if (conditionName.length) filter.conditionName = conditionName;
    }
    if (event === "powerRoll" || event === "abilityTest" || event === "abilityRoll") {
      const actionKind = asTrimmedString(filterInput.actionKind);
      if (actionKind) filter.actionKind = actionKind;
      const costIncludes = asTrimmedString(filterInput.costIncludes || filterInput.resourceCostIncludes);
      if (costIncludes) filter.costIncludes = costIncludes;
      const attribute = asTrimmedString(filterInput.attribute);
      if (attribute) filter.attribute = attribute;
      const tier = asTrimmedString(filterInput.tier);
      if (tier) filter.tier = tier;
      const minTotal = asNonNegInt(filterInput.minTotal, 0);
      if (minTotal) filter.minTotal = minTotal;
      const maxTotal = asNonNegInt(filterInput.maxTotal, 0);
      if (maxTotal) filter.maxTotal = maxTotal;
      const keywordsAny = Array.isArray(filterInput.keywordsAny)
        ? filterInput.keywordsAny.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean)
        : [];
      if (keywordsAny.length) filter.keywordsAny = keywordsAny;
    }
    if (event === "potency") {
      const attribute = asTrimmedString(filterInput.attribute);
      if (attribute) filter.attribute = attribute;
      const level = asTrimmedString(filterInput.level);
      if (level) filter.level = level;
      const maxTargets = asNonNegInt(filterInput.maxTargets, 0);
      if (maxTargets) filter.maxTargets = maxTargets;
      const minTargets = asNonNegInt(filterInput.minTargets, 0);
      if (minTargets) filter.minTargets = minTargets;
    }
    if (event === "markApplied") {
      const markType = asTrimmedString(filterInput.markType);
      if (markType) filter.markType = markType;
      const source = asTrimmedString(filterInput.source);
      if (source) filter.source = source;
    }
    if (event === "move") {
      if (filterInput.leavesAdjacency) filter.leavesAdjacency = true;
      if (filterInput.entersAdjacency) filter.entersAdjacency = true;
    }
    if (event === "move" || event === "forcedMovement" || event === "forcedMovementDealt") {
      const minDistance = asNonNegInt(filterInput.minDistance, 0);
      if (minDistance) filter.minDistance = minDistance;
      const maxDistance = asNonNegInt(filterInput.maxDistance, 0);
      if (maxDistance) filter.maxDistance = maxDistance;
      const verb = asTrimmedString(filterInput.verb);
      if (verb) filter.verb = verb;
    }
    return { event, filter };
  }

  function normalizeTriggerLifetime(input, warnings, path) {
    if (!input || typeof input !== "object") return null;
    const rawEvent = asTrimmedString(input.event).toLowerCase();
    if (!rawEvent) return null;
    const event = TRIGGER_LIFETIME_EVENTS.find((e) => e.toLowerCase() === rawEvent);
    if (!event) {
      warnings.push(`${path}.event: "${input.event}" not in ${TRIGGER_LIFETIME_EVENTS.join("/")}.`);
      return null;
    }
    const expires = {
      event,
      whose: "any",
      count: Math.max(1, asNonNegInt(input.count, 1)),
    };
    const whoseRaw = asTrimmedString(input.whose);
    if (whoseRaw) {
      const whose = normalizeWhoseValue(whoseRaw);
      if (whose && TRIGGER_LIFETIME_WHOSE_VALUES.includes(whose)) {
        expires.whose = whose;
      } else {
        warnings.push(`${path}.whose: "${input.whose}" not in ${TRIGGER_LIFETIME_WHOSE_VALUES.join("/")}.`);
      }
    }
    if (input.skipCurrent === true) expires.skipCurrent = true;
    return expires;
  }

  function normalizeAuraTrigger(input, warnings, path) {
    if (typeof input === "string") {
      input = { event: input };
    }
    if (!input || typeof input !== "object") return null;
    const rawEvent = asTrimmedString(input.event || input.when).toLowerCase();
    const eventAliases = {
      ownerturnstart: "turnStart",
      selfturnstart: "turnStart",
      ownerturnend: "turnEnd",
      selfturnend: "turnEnd",
      occupantturnstart: "occupantTurnStart",
      targetturnstart: "occupantTurnStart",
      occupantturnend: "occupantTurnEnd",
      targetturnend: "occupantTurnEnd",
      onenter: "enter",
      enters: "enter",
      enter: "enter",
    };
    const compact = rawEvent.replace(/[^a-z0-9]/g, "");
    const event = eventAliases[compact] || AURA_TRIGGER_EVENTS.find((item) => item.toLowerCase() === rawEvent);
    if (!event) {
      warnings.push(`${path}.event: "${input.event || input.when || ""}" not in ${AURA_TRIGGER_EVENTS.join("/")}.`);
      return null;
    }
    const trigger = { event };
    const filterInput = input.filter && typeof input.filter === "object" ? input.filter : input;
    const target = asTrimmedString(input.target || input.effectTarget || input.resolveTarget);
    if (target) trigger.target = target;
    const whoseRaw = asTrimmedString(filterInput.whose || input.on || "");
    if (event === "enter" || event === "occupantTurnStart" || event === "occupantTurnEnd") {
      trigger.whose = "occupant";
      return trigger;
    }
    if (whoseRaw) {
      const whose = whoseRaw.toLowerCase() === "occupant" ? "occupant" : normalizeWhoseValue(whoseRaw);
      trigger.whose = whose || "self";
      if (!whose) warnings.push(`${path}.whose: "${whoseRaw}" not in ${WHOSE_VALUES.join("/")}.`);
    } else if (!TRIGGER_LIFETIME_EVENTS.includes(event)) {
      trigger.whose = "occupant";
    } else {
      trigger.whose = "self";
    }
    const filter = {};
    const actionKind = asTrimmedString(filterInput.actionKind);
    if (actionKind) filter.actionKind = actionKind;
    const costIncludes = asTrimmedString(filterInput.costIncludes || filterInput.resourceCostIncludes);
    if (costIncludes) filter.costIncludes = costIncludes;
    const keywordsAny = Array.isArray(filterInput.keywordsAny)
      ? filterInput.keywordsAny.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean)
      : [];
    if (keywordsAny.length) filter.keywordsAny = keywordsAny;
    const minAmount = asNonNegInt(filterInput.minAmount, 0);
    if (minAmount) filter.minAmount = minAmount;
    const maxAmount = asNonNegInt(filterInput.maxAmount, 0);
    if (maxAmount) filter.maxAmount = maxAmount;
    const damageTypes = (Array.isArray(filterInput.damageType)
      ? filterInput.damageType
      : filterInput.damageType !== undefined && filterInput.damageType !== null
        ? [filterInput.damageType]
        : [])
      .map((t) => asTrimmedString(t).toLowerCase())
      .filter(Boolean);
    if (damageTypes.length) filter.damageType = damageTypes;
    const verb = asTrimmedString(filterInput.verb);
    if (verb) filter.verb = verb;
    if (Object.keys(filter).length) trigger.filter = filter;
    return trigger;
  }

  function normalizeAuraTriggers(input, warnings, path) {
    const source = Array.isArray(input) ? input : input ? [input] : [];
    return source
      .map((item, index) => normalizeAuraTrigger(item, warnings, `${path}[${index}]`))
      .filter(Boolean);
  }

  function normalizeRequestedTestBlock(input, warnings, path) {
    const known = new Set([
      "type", "id", "target", "attribute", "rollMode", "rollFormula",
      "label", "prompt", "bonus", "edge", "bane", "tiers", "note", "opposed",
    ]);
    const tiersInput = input.tiers && typeof input.tiers === "object" ? input.tiers : {};
    const tiers = {};
    for (const key of P.TIER_KEYS) {
      const legacy = Object.entries(P.LEGACY_TIER_KEYS).find(([, mapped]) => mapped === key)?.[0];
      tiers[key] = normalizeTier(tiersInput[key] || (legacy && tiersInput[legacy]) || {}, warnings, `${path}.tiers.${key}`);
    }
    const attribute = P.normalizeAttribute(input.attribute || "Might");
    if (!P.ATTRIBUTES.includes(attribute) || attribute === "Strongest") {
      warnings.push(`${path}: requestedTest attribute must be Might, Agility, Reason, Intuition, or Presence.`);
    }
    const rollMode = pickKnown(input.rollMode, ["individual", "singleHighest", "groupByAttribute"], "individual");
    const block = {
      type: "requestedTest",
      id: input.id || createId("requested-test"),
      target: normalizeTargetRef(input.target),
      attribute,
      rollMode,
      rollFormula: asTrimmedString(input.rollFormula) || "2d10",
      label: asTrimmedString(input.label) || `${attribute} test`,
      prompt: asTrimmedString(input.prompt),
      bonus: asInt(input.bonus, 0),
      edge: Math.max(0, Math.min(2, asNonNegInt(input.edge, 0))),
      bane: Math.max(0, Math.min(2, asNonNegInt(input.bane, 0))),
      tiers,
    };
    if (!block.target) warnings.push(`${path}: requestedTest needs a target group.`);
    if (input.note) block.note = asTrimmedString(input.note);
    // Opposed test: the user rolls the same test too; the higher total wins. `win` / `lose` / `tie` effects land on
    // each opponent (instead of the tiers). `true` = compare and say so in chat only.
    if (input.opposed) {
      const raw = input.opposed && typeof input.opposed === "object" ? input.opposed : {};
      block.opposed = {
        win: normalizeEffectList(raw.win || [], warnings, `${path}.opposed.win`),
        lose: normalizeEffectList(raw.lose || [], warnings, `${path}.opposed.lose`),
        tie: normalizeEffectList(raw.tie || [], warnings, `${path}.opposed.tie`),
      };
    }
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  const AUTO_RESOLVE_EFFECT_KINDS = new Set([
    "damage",
    "heal",
    "temporaryStamina",
    "surgeGain",
    "condition",
    "floatingText",
    "note",
    "other",
    "ifMark",
    "maliceGain",
    "counter",
  ]);

  function validateAutoResolveEffects(effects, warnings, path) {
    (Array.isArray(effects) ? effects : []).forEach((effect, index) => {
      const effectPath = `${path}[${index}]`;
      if (!AUTO_RESOLVE_EFFECT_KINDS.has(effect?.kind)) {
        warnings.push(`${effectPath}: "${effect?.kind || "(blank)"}" is not supported by trigger autoResolve; resolve this trigger manually.`);
        return;
      }
      // An amount taken from the squares of the move that set the trigger off IS worked out when it resolves by
      // itself (Thorn In Foot: 1 damage for each square moved). Other amountFrom sources are not.
      const fromTheMove = ["triggeringForcedMovement", "triggeringMovement", "movedDistance"].includes(effect?.amountFrom?.source);
      if ((effect?.kind === "heal" && effect?.recoveries) || (effect?.amountFrom && !fromTheMove)) {
        warnings.push(`${effectPath}: recovery and amountFrom calculations are not supported by trigger autoResolve; resolve this trigger manually.`);
      }
      if (effect?.kind === "ifMark") {
        validateAutoResolveEffects(effect.then, warnings, `${effectPath}.then`);
        validateAutoResolveEffects(effect.else, warnings, `${effectPath}.else`);
      }
    });
  }

  function normalizeTriggerBlock(input, warnings, path) {
    const known = new Set(["type", "id", "condition", "match", "target", "effectTarget", "resolveTarget", "effects", "note", "expires", "lifetime", "autoResolve", "automatic", "resolveAutomatically", "resolve", "usesTriggeredAction"]);
    const block = {
      type: "trigger",
      id: input.id || createId("trigger"),
      condition: asTrimmedString(input.condition),
      target: asTrimmedString(input.target),
      effectTarget: asTrimmedString(input.effectTarget || input.resolveTarget),
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    const match = normalizeTriggerMatch(input.match, warnings, `${path}.match`);
    if (match) block.match = match;
    const expires = normalizeTriggerLifetime(input.expires || input.lifetime, warnings, `${path}.expires`);
    if (expires) block.expires = expires;
    // How a matched trigger is resolved: "click" (the "!" on the token; use it from the abilities list), "popup" (the
    // GM is asked at once; "when it dies" triggers default to this), "auto" (= autoResolve: its effects run by
    // themselves), "run" (the whole ability runs on the GM's page at once, rolls and pickers included, with a chat
    // line: traps). Left out: auto with autoResolve, popup for a creature's own "dies", else click.
    if (input.resolve !== undefined && input.resolve !== null && input.resolve !== "") {
      const resolve = pickKnownLoose(input.resolve, ["click", "popup", "auto", "run"], "click");
      block.resolve = resolve;
      if (resolve === "auto") block.autoResolve = true;
    }
    if (input.autoResolve || input.automatic || input.resolveAutomatically) block.autoResolve = true;
    if (block.autoResolve) validateAutoResolveEffects(block.effects, warnings, `${path}.effects`);
    // A popup trigger does not use up the creature's triggered action unless this says it does.
    if (input.usesTriggeredAction === true) block.usesTriggeredAction = true;
    else if (input.usesTriggeredAction === false) block.usesTriggeredAction = false;
    if (!block.condition && !match) {
      warnings.push(`${path}: trigger has no condition text or match config.`);
    }
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizePersistentBlock(input, warnings, path) {
    const known = new Set(["type", "id", "cost", "resource", "tickAt", "expiresAt", "triggers", "effects", "note", "target", "label", "difficultTerrain", "tag", "expires", "askBeforeEnd"]);
    const validTriggers = new Set(["onEnter", "onOccupantTurnStart", "onOccupantTurnEnd"]);
    const triggers = Array.isArray(input.triggers)
      ? input.triggers.filter((t) => {
          if (validTriggers.has(t)) return true;
          warnings.push(`${path}: unknown persistent trigger "${t}" — dropping.`);
          return false;
        })
      : [];
    const block = {
      type: "persistent",
      id: input.id || createId("persistent"),
      cost: asNonNegInt(input.cost, 0),
      resource: asTrimmedString(input.resource),
      tickAt: pickKnown(input.tickAt, ["startOfTurn", "endOfTurn", "never"], "startOfTurn"),
      expiresAt: pickKnownLoose(input.expiresAt, ["startOfTurn", "endOfTurn", "never"], "never"),
      triggers,
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (input.target) block.target = asTrimmedString(input.target);
    // Shown on the zone instead of the ability's name ("Burning ground").
    const label = asTrimmedString(input.label);
    if (label) block.label = label;
    // The area is difficult terrain: true = costs 2 per square; a number = that cost.
    if (input.difficultTerrain !== undefined && input.difficultTerrain !== false && input.difficultTerrain !== null) {
      const cost = input.difficultTerrain === true ? 2 : Math.min(10, asNonNegInt(input.difficultTerrain, 2));
      if (cost > 1) block.terrainCost = cost;
    }
    // A terrain word for `ifZone` ("fire", "web").
    const tag = asTrimmedString(input.tag).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    if (tag) block.tag = tag;
    // How long it lasts beyond its owner's turn: "endOfRound", "endOfEncounter", or a lifetime
    // { event, whose, count } like an aura's. "expiresAt" takes the same words.
    const lasting = input.expires !== undefined ? input.expires : (input.expiresAt && !["startOfTurn", "endOfTurn", "never"].includes(input.expiresAt) ? input.expiresAt : undefined);
    if (lasting !== undefined && lasting !== null && lasting !== "") {
      const words = { endofround: { event: "roundEnd" }, roundend: { event: "roundEnd" }, startofround: { event: "roundStart" }, endofencounter: { event: "combatEnd" }, endofcombat: { event: "combatEnd" }, combatend: { event: "combatEnd" }, encounter: { event: "combatEnd" } };
      const compact = typeof lasting === "string" ? lasting.toLowerCase().replace(/[^a-z]/g, "") : "";
      if (compact === "startofturn" || compact === "endofturn") block.expiresAt = compact === "startofturn" ? "startOfTurn" : "endOfTurn";
      else {
        const lifetime = normalizeTriggerLifetime(typeof lasting === "string" ? words[compact] || { event: lasting } : lasting, warnings, `${path}.expires`);
        if (lifetime) block.expires = lifetime;
      }
    }
    if (!["startOfTurn", "endOfTurn", "never"].includes(block.expiresAt)) block.expiresAt = "never";
    // When its time is up the Director is asked before it goes; false removes it straight away.
    if (input.askBeforeEnd === false) block.askBeforeEnd = false;
    if (input.note) block.note = asTrimmedString(input.note);
    if (!block.cost && !block.triggers.length) {
      warnings.push(`${path}: persistent has cost 0 with no triggers; reads as "always-on at owner turn".`);
    }
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  const BRANCH_CONDITION_KINDS = ["strained", "winded", "keyword", "prompt", "mark", "scopedFlag", "distance", "zone", "target", "roll", "counter"];

  // ---------- target checks (ifTarget, branch "target") and roll checks (ifRoll, branch "roll") ----------
  const TARGET_STAMINA_STATES = ["winded", "notWinded", "full", "belowFull", "dying"];
  const SIZE_VS_SELF = ["smaller", "sameOrSmaller", "same", "sameOrLarger", "larger"];
  const ROLL_EDGE_STATES = ["edge", "doubleEdge", "anyEdge", "bane", "doubleBane", "anyBane", "none"];
  const TARGET_TEST_KEYS = ["who", "condition", "conditions", "conditionFrom", "sizeMax", "sizeMin", "sizeVsSelf", "stabilityMax", "stabilityMin", "stamina", "keyword", "keywords", "notKeyword", "nearby", "target", "question"];
  const ROLL_TEST_KEYS = ["edge", "critical", "tier"];

  // Matches a word from a list in any case ("Winded" -> "winded").
  function pickKnownLoose(value, list, fallback) {
    const text = asTrimmedString(value).toLowerCase().replace(/[\s_-]+/g, "");
    return list.find((item) => item.toLowerCase() === text) || fallback;
  }

  // A Draw Steel size: 1T, 1S, 1M, 1L, 2, 3... A bare 1 means any size 1.
  function normalizeSizeBound(value) {
    if (value === null || value === undefined || value === "") return "";
    const text = String(value).trim().toUpperCase().replace(/\s+/g, "");
    return /^\d+[TSML]?$/.test(text) ? text : "";
  }

  function normalizeWordList(value) {
    const raw = Array.isArray(value) ? value : value !== null && value !== undefined && value !== "" ? String(value).split(/[,;]+/) : [];
    return [...new Set(raw.map((item) => String(item == null ? "" : item).trim().toLowerCase()).filter(Boolean))];
  }

  function normalizeTargetTest(input, warnings, path, label) {
    const test = { who: pickKnownLoose(input.who, ["target", "self"], "target") };
    const conditions = normalizeWordList(input.conditions !== undefined ? input.conditions : input.condition);
    if (conditions.length) {
      test.condition = conditions;
      const from = pickKnownLoose(input.conditionFrom, ["any", "self"], "any");
      if (from === "self") test.conditionFrom = "self";
    }
    for (const key of ["sizeMax", "sizeMin"]) {
      if (input[key] === undefined || input[key] === null || input[key] === "") continue;
      const size = normalizeSizeBound(input[key]);
      if (size) test[key] = size;
      else warnings.push(`${path}.${key}: write a size such as 1, "1S" or 2.`);
    }
    if (input.sizeVsSelf !== undefined && input.sizeVsSelf !== null && input.sizeVsSelf !== "") {
      test.sizeVsSelf = pickKnownLoose(input.sizeVsSelf, SIZE_VS_SELF, "sameOrSmaller");
    }
    for (const key of ["stabilityMax", "stabilityMin"]) {
      if (input[key] !== undefined && input[key] !== null && input[key] !== "") test[key] = asInt(input[key], 0);
    }
    if (input.stamina !== undefined && input.stamina !== null && input.stamina !== "") {
      test.stamina = pickKnownLoose(input.stamina, TARGET_STAMINA_STATES, "winded");
    }
    const keyword = normalizeWordList(input.keywords !== undefined ? input.keywords : input.keyword);
    if (keyword.length) test.keyword = keyword;
    const notKeyword = normalizeWordList(input.notKeyword);
    if (notKeyword.length) test.notKeyword = notKeyword;
    // "Adjacent to 3 or more ghoul cravers": creatures counted around the checked creature.
    if (input.nearby && typeof input.nearby === "object") {
      const nearby = normalizeCountSpec({ ...input.nearby, around: "target" });
      delete nearby.around;
      nearby.min = asNonNegInt(input.nearby.min, 1);
      if (input.nearby.max !== undefined && input.nearby.max !== null && input.nearby.max !== "") nearby.max = asNonNegInt(input.nearby.max, 0);
      test.nearby = nearby;
    }
    const target = asTrimmedString(input.target);
    if (target) test.target = target;
    const question = asTrimmedString(input.question);
    if (question) test.question = question;
    const checks = ["condition", "sizeMax", "sizeMin", "sizeVsSelf", "stabilityMax", "stabilityMin", "stamina", "keyword", "notKeyword", "nearby"];
    if (!checks.some((key) => test[key] !== undefined)) warnings.push(`${path}: ${label} checks nothing, so it always passes.`);
    return test;
  }

  // Counter names are lower case words: "rage", "deathcount", "charges".
  function normalizeCounterName(value) {
    return asTrimmedString(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function normalizeCounterTest(input, warnings, path, label) {
    const test = { name: normalizeCounterName(input.name), who: pickKnownLoose(input.who, ["self", "target"], "self") };
    if (!test.name) warnings.push(`${path}: ${label} needs a counter name.`);
    if (input.min !== undefined && input.min !== null && input.min !== "") test.min = asInt(input.min, 0);
    if (input.max !== undefined && input.max !== null && input.max !== "") test.max = asInt(input.max, 0);
    if (test.min === undefined && test.max === undefined) warnings.push(`${path}: ${label} has no min or max, so it always passes.`);
    return test;
  }

  function normalizeRollTest(input, warnings, path, label) {
    const test = {};
    if (input.edge !== undefined && input.edge !== null && input.edge !== "") test.edge = pickKnownLoose(input.edge, ROLL_EDGE_STATES, "anyEdge");
    if (input.critical === true) test.critical = true;
    const tiers = (Array.isArray(input.tier) ? input.tier : input.tier !== undefined && input.tier !== null && input.tier !== "" ? [input.tier] : [])
      .map((value) => (P.normalizeTierKey ? P.normalizeTierKey(value) : value)).filter((value) => P.TIER_KEYS.includes(value));
    if (tiers.length) test.tier = [...new Set(tiers)];
    if (!test.edge && !test.critical && !test.tier) warnings.push(`${path}: ${label} checks nothing, so it always passes.`);
    return test;
  }

  // Zone tags as the map writes them: lower case, letters, digits, "-" and "_".
  function normalizeZoneTags(input) {
    const raw = Array.isArray(input?.tags) ? input.tags : input?.tag != null ? [input.tag] : [];
    const seen = new Set();
    for (const value of raw) {
      const tag = String(value == null ? "" : value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
      if (tag) seen.add(tag);
    }
    return [...seen];
  }
  const DISTANCE_ENDPOINTS = ["self", "source", "eventSource", "eventTarget", "target"];

  // A distance endpoint is either a known keyword (self/source/eventSource/
  // eventTarget/target) or an arbitrary target-group name. Keywords are
  // normalized to canonical casing; group names pass through unchanged.
  function normalizeDistanceEndpoint(value, fallback) {
    const raw = asTrimmedString(value);
    if (!raw) return fallback;
    const canonical = DISTANCE_ENDPOINTS.find((k) => k.toLowerCase() === raw.toLowerCase());
    return canonical || raw;
  }

  function normalizeBranchCondition(input, warnings, path) {
    if (typeof input === "string") {
      input = { kind: input };
    }
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: branch condition missing; defaulting to prompt.`);
      return { kind: "prompt", question: "Use the first branch?", yesLabel: "Yes", noLabel: "No" };
    }
    const rawKind = asTrimmedString(input.kind || input.type || input.if).toLowerCase().replace(/\s+/g, "");
    const kindMap = {
      strained: "strained",
      ifstrained: "strained",
      heroicresourcebelowzero: "strained",
      winded: "winded",
      ifwinded: "winded",
      keyword: "keyword",
      ifkeyword: "keyword",
      prompt: "prompt",
      ifprompt: "prompt",
      mark: "mark",
      ifmark: "mark",
      scopedflag: "scopedFlag",
      ifscopedflag: "scopedFlag",
      distance: "distance",
      ifdistance: "distance",
      zone: "zone",
      ifzone: "zone",
      inzone: "zone",
      target: "target",
      iftarget: "target",
      roll: "roll",
      ifroll: "roll",
      counter: "counter",
      ifcounter: "counter",
    };
    const mappedKind = kindMap[rawKind];
    const kind = mappedKind || "prompt";
    if (rawKind && !mappedKind) {
      warnings.push(`${path}.kind: unknown branch condition "${input.kind}". Defaulting to prompt.`);
    }
    if (kind === "strained" || kind === "winded") {
      return { kind };
    }
    if (kind === "keyword") {
      const condition = {
        kind,
        all: Array.isArray(input.all) ? input.all.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean) : [],
        any: Array.isArray(input.any) ? input.any.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean) : [],
        none: Array.isArray(input.none) ? input.none.map((k) => P.normalizeKeyword?.(k) || asTrimmedString(k)).filter(Boolean) : [],
      };
      if (!condition.all.length && !condition.any.length && !condition.none.length) {
        warnings.push(`${path}: keyword branch condition has no all/any/none; predicate always passes.`);
      }
      return condition;
    }
    if (kind === "mark") {
      return {
        kind,
        predicate: pickKnown(input.predicate, [
          "targetJudgedBySelf",
          "targetJudgedByAny",
          "actorIsMyJudgedTarget",
          "sourceIsJudgingTarget",
          "targetInPersistentZoneJudgedByZoneCaster",
        ], "targetJudgedBySelf"),
        markType: asTrimmedString(input.markType) || "judgment",
        target: asTrimmedString(input.target),
      };
    }
    if (kind === "scopedFlag") {
      return {
        kind,
        scope: pickKnown(input.scope, ["round", "turn", "encounter"], "round"),
        key: asTrimmedString(input.key),
        source: pickKnown(input.source, ["self", "eventSource"], "self"),
        target: pickKnown(input.target, ["target", "judgedTarget", "eventTarget"], "target"),
        mode: pickKnown(input.mode, ["set", "notSet"], "notSet"),
      };
    }
    if (kind === "target") {
      return { kind, ...normalizeTargetTest(input, warnings, path, "target branch condition") };
    }
    if (kind === "roll") {
      return { kind, ...normalizeRollTest(input, warnings, path, "roll branch condition") };
    }
    if (kind === "counter") {
      const condition = { kind, ...normalizeCounterTest(input, warnings, path, "counter branch condition") };
      const target = asTrimmedString(input.target);
      if (target) condition.target = target;
      return condition;
    }
    if (kind === "zone") {
      const condition = { kind, tags: normalizeZoneTags(input), who: pickKnown(input.who, ["target", "self"], "target") };
      if (input.adjacent === true) condition.adjacent = true;
      const target = asTrimmedString(input.target);
      if (target) condition.target = target;
      const question = asTrimmedString(input.question);
      if (question) condition.question = question;
      if (!condition.tags.length) warnings.push(`${path}: zone branch condition has no tag; the user will be asked every time.`);
      return condition;
    }
    if (kind === "distance") {
      const condition = {
        kind,
        from: normalizeDistanceEndpoint(input.from, "self"),
        to: normalizeDistanceEndpoint(input.to, "target"),
      };
      const fromGroup = asTrimmedString(input.fromGroup);
      if (fromGroup) condition.fromGroup = fromGroup;
      const toGroup = asTrimmedString(input.toGroup);
      if (toGroup) condition.toGroup = toGroup;
      if (input.max != null && input.max !== "") condition.max = asNonNegInt(input.max, 0);
      if (input.min != null && input.min !== "") condition.min = asNonNegInt(input.min, 0);
      if (condition.max == null && condition.min == null) {
        warnings.push(`${path}: distance branch condition has no min/max; predicate always passes when both tokens are on the board.`);
      }
      return condition;
    }
    return {
      kind: "prompt",
      question: asTrimmedString(input.question) || "Use the first branch?",
      yesLabel: asTrimmedString(input.yesLabel) || "Yes",
      noLabel: asTrimmedString(input.noLabel) || "No",
      target: normalizeTargetRef(input.target),
    };
  }

  function normalizeCardList(input, warnings, path) {
    if (!Array.isArray(input)) return [];
    return input
      .map((block, index) => normalizeBlock(block, warnings, `${path}[${index}]`))
      .filter(Boolean);
  }

  function normalizeBranchBlock(input, warnings, path) {
    const known = new Set(["type", "id", "condition", "if", "then", "else", "note"]);
    const block = {
      type: "branch",
      id: input.id || createId("branch"),
      condition: normalizeBranchCondition(input.condition || input.if, warnings, `${path}.condition`),
      then: normalizeCardList(input.then || [], warnings, `${path}.then`),
      else: normalizeCardList(input.else || [], warnings, `${path}.else`),
    };
    if (!block.then.length && !block.else.length) {
      warnings.push(`${path}: branch has no then/else cards.`);
    }
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeChoiceOption(input, warnings, path) {
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: choice option must be an object.`);
      return null;
    }
    const known = new Set(["id", "value", "label", "description", "keywords", "cards", "then", "set"]);
    const id = asTrimmedString(input.id || input.value || input.label) || createId("option");
    const option = {
      id,
      label: asTrimmedString(input.label || input.value || input.id) || id,
      description: asTrimmedString(input.description),
      keywords: P.normalizeKeywordList ? P.normalizeKeywordList(input.keywords || input.set?.keywords) : [],
      cards: normalizeCardList(input.cards || input.then || [], warnings, `${path}.cards`),
    };
    const extras = pickExtras(input, known);
    if (extras) option._extra = extras;
    return option;
  }

  function normalizeChoiceBlock(input, warnings, path) {
    const known = new Set(["type", "id", "name", "prompt", "question", "options", "note"]);
    const rawOptions = Array.isArray(input.options) ? input.options : [];
    const options = rawOptions
      .map((option, index) => normalizeChoiceOption(option, warnings, `${path}.options[${index}]`))
      .filter(Boolean);
    if (!options.length) warnings.push(`${path}: choice block has no options.`);
    const block = {
      type: "choice",
      id: input.id || createId("choice"),
      name: asTrimmedString(input.name) || asTrimmedString(input.id) || "choice",
      prompt: asTrimmedString(input.prompt || input.question) || "Choose one option.",
      options,
    };
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeBlock(input, warnings, index) {
    const path = typeof index === "string" ? index : `cards[${index}]`;
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: block must be an object — skipping.`);
      return null;
    }
    const type = String(input.type || "").trim();
    if (!P.BLOCK_TYPES.includes(type)) {
      warnings.push(`${path}: unknown block type "${type}" — skipping.`);
      return null;
    }
    switch (type) {
      case "target":
        return normalizeTargetBlock(input, warnings, path);
      case "powerRoll":
        return normalizePowerRollBlock(input, warnings, path);
      case "requestedTest":
        return normalizeRequestedTestBlock(input, warnings, path);
      case "effect":
        return normalizeEffectBlock(input, warnings, path);
      case "trigger":
        return normalizeTriggerBlock(input, warnings, path);
      case "persistent":
        return normalizePersistentBlock(input, warnings, path);
      case "branch":
        return normalizeBranchBlock(input, warnings, path);
      case "choice":
        return normalizeChoiceBlock(input, warnings, path);
      default:
        return null;
    }
  }

  // ---------- feature modifiers ----------

  // A modifier rule on a feature. `match` is the predicate against the
  // running ability; `apply` is the set of bonuses to fold into it. Used
  // by feature.automation.modifiers — applied in-memory at the start of
  // runner.open() BEFORE any UI renders.
  function normalizeModifier(input, warnings, path) {
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: modifier must be an object — skipping.`);
      return null;
    }
    const match = input.match && typeof input.match === "object" ? input.match : {};
    const apply = input.apply && typeof input.apply === "object" ? input.apply : {};
    const out = {
      match: {
        keywordsAll: Array.isArray(match.keywordsAll) ? match.keywordsAll.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
        keywordsAny: Array.isArray(match.keywordsAny) ? match.keywordsAny.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
        keywordsNone: Array.isArray(match.keywordsNone) ? match.keywordsNone.map((k) => P.normalizeKeyword?.(k) || String(k || "").trim()).filter(Boolean) : [],
        damageType: asTrimmedString(match.damageType),
        attribute: asTrimmedString(match.attribute),
        // Melee or ranged only: judged per target when the damage lands (runner reachBonusFor).
        ...(["melee", "ranged"].includes(String(match.reach || "").toLowerCase()) ? { reach: String(match.reach).toLowerCase() } : {}),
      },
      apply: {
        damageBonus: asInt(apply.damageBonus, 0),
        rangeBonus: asInt(apply.rangeBonus, 0),
        forcedMovementBonus: asInt(apply.forcedMovementBonus, 0),
        // Damage-type override (e.g. an elemental kit that recolors all weapon damage):
        damageType: asTrimmedString(apply.damageType),
        // Free-text rider for the inspector — what the modifier intends to do.
        note: asTrimmedString(apply.note),
      },
      label: asTrimmedString(input.label),
    };
    if (match.reach !== undefined && match.reach !== "" && !out.match.reach) {
      warnings.push(`${path}.match.reach: "${match.reach}" is not melee or ranged; the bonus applies at any distance.`);
    }
    if (input.note) out.note = asTrimmedString(input.note);
    const extras = pickExtras(input, new Set(["match", "apply", "label", "note"]));
    if (extras) out._extra = extras;
    return out;
  }

  // Solo/leader End Effect: take `damage` at the end of a turn to end a save-ends effect (the save popup offers it).
  function normalizeEndEffectPassive(input, warnings, path) {
    const passive = {
      kind: "endEffect",
      label: asTrimmedString(input.label || input.name) || "End Effect",
      damage: asNonNegInt(input.damage ?? input.amount, 0),
      count: asPosInt(input.count, 1),
    };
    if (!passive.damage) warnings.push(`${path}: endEffect has no damage.`);
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "damage", "amount", "count"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // Always-on edge/bane traits ("while winded, it has an edge and strikes against it have an edge"; "strikes against
  // allies within 2 take a bane"). The roll window shows them ticked, named after the trait.
  const ROLL_MODIFIERS = ["edge", "bane", "doubleEdge", "doubleBane"];
  const ROLL_MODIFIER_SIDES = ["own", "against", "both"];
  const ROLL_MODIFIER_APPLIES = ["abilityRolls", "strikes", "melee", "ranged", "tests"];
  function normalizeRollModifierPassive(input, warnings, path) {
    const passive = {
      kind: "rollModifier",
      label: asTrimmedString(input.label || input.name),
      modifier: pickKnownLoose(input.modifier, ROLL_MODIFIERS, "edge"),
      side: pickKnownLoose(input.side, ROLL_MODIFIER_SIDES, "own"),
      appliesTo: pickKnownLoose(input.appliesTo, ROLL_MODIFIER_APPLIES, "abilityRolls"),
    };
    if (input.modifier !== undefined && !ROLL_MODIFIERS.some((value) => value.toLowerCase() === asTrimmedString(input.modifier).toLowerCase().replace(/[\s_-]+/g, ""))) {
      warnings.push(`${path}.modifier: use edge, bane, doubleEdge or doubleBane.`);
    }
    const scope = pickKnownLoose(input.scope, ["self", "alliesWithin"], "self");
    if (scope === "alliesWithin") {
      passive.scope = scope;
      passive.within = asNonNegInt(input.within, 1);
      if (passive.side === "own") passive.side = "against";
    }
    const raw = input.when && typeof input.when === "object" ? input.when : {};
    const when = {};
    for (const key of ["winded", "notWinded", "targetWinded", "adjacentAlly"]) if (raw[key] === true) when[key] = true;
    for (const key of ["selfCondition", "targetCondition"]) {
      const names = normalizeWordList(raw[key]);
      if (names.length) when[key] = names;
    }
    const note = asTrimmedString(raw.note);
    if (note) when.note = note;
    if (Object.keys(when).length) passive.when = when;
    const rmAny = normalizeTextList(input.keywordsAny);
    if (rmAny.length) passive.keywordsAny = rmAny;
    const rmAll = normalizeTextList(input.keywordsAll);
    if (rmAll.length) passive.keywordsAll = rmAll;
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "modifier", "side", "appliesTo", "keywordsAny", "keywordsAll", "scope", "within", "when"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // "Rise again": when damage drops the creature to 0 Stamina, it is set back instead. Defaults are the book's usual
  // undead rule (1 Stamina, prone, once per combat); every part can be changed in the JSON.
  function normalizeDeathRulePassive(input, warnings, path) {
    const passive = {
      kind: "deathRule",
      label: asTrimmedString(input.label || input.name) || "Rise Again",
      setStamina: asNonNegInt(input.setStamina ?? input.stamina, 1),
      conditions: input.conditions === undefined && input.condition === undefined
        ? ["prone"]
        : normalizeWordList(input.conditions !== undefined ? input.conditions : input.condition),
      conditionDuration: pickKnownLoose(input.conditionDuration, ["endOfEncounter", "saveEnds", "endOfTurn", "untilDying"], "endOfEncounter"),
    };
    const uses = asTrimmedString(input.uses).toLowerCase();
    passive.uses = uses === "unlimited" || uses === "0" || uses === "always" ? "unlimited" : asPosInt(input.uses, 1);
    passive.resetAt = pickKnownLoose(input.resetAt, ["combatEnd", "never"], "combatEnd");
    const notWhen = normalizeWordList(input.notWhenDamageTypes);
    if (notWhen.length) passive.notWhenDamageTypes = notWhen;
    const onlyWhen = normalizeWordList(input.onlyWhenDamageTypes);
    if (onlyWhen.length) passive.onlyWhenDamageTypes = onlyWhen;
    const banner = asTrimmedString(input.banner);
    if (banner) passive.banner = banner;
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "setStamina", "stamina", "conditions", "condition", "conditionDuration", "uses", "resetAt", "notWhenDamageTypes", "onlyWhenDamageTypes", "banner"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // Movement rules: "+2 speed", "ignores difficult terrain", "moving doesn't provoke opportunity attacks", "can move
  // through creatures"; with gates like an edge/bane trait (winded, its own conditions).
  // `fly` on a buff: the creature flies while the buff lasts (and falls when it ends).
  const MOVEMENT_FLAGS = ["ignoreDifficultTerrain", "noOpportunityAttacks", "moveThroughCreatures", "fly"];
  function normalizeMovementFields(input, into) {
    const speedBonus = asInt(input.speedBonus, 0);
    if (speedBonus) into.speedBonus = speedBonus;
    MOVEMENT_FLAGS.forEach((flag) => { if (input[flag] === true) into[flag] = true; });
    // How many creatures it can have grabbed at once (default 1; more only warns).
    const grabLimit = asNonNegInt(input.grabLimit, 0);
    if (grabLimit) into.grabLimit = grabLimit;
    return into;
  }
  function normalizeMovementPassive(input, warnings, path) {
    const passive = normalizeMovementFields(input, { kind: "movement", label: asTrimmedString(input.label || input.name) || "Movement" });
    const raw = input.when && typeof input.when === "object" ? input.when : {};
    const when = {};
    for (const key of ["winded", "notWinded"]) if (raw[key] === true) when[key] = true;
    const selfCondition = normalizeWordList(raw.selfCondition);
    if (selfCondition.length) when.selfCondition = selfCondition;
    if (Object.keys(when).length) passive.when = when;
    if (!passive.speedBonus && !passive.grabLimit && !MOVEMENT_FLAGS.some((flag) => passive[flag])) warnings.push(`${path}: movement passive changes nothing.`);
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "speedBonus", "grabLimit", ...MOVEMENT_FLAGS, "when"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // Turns a round: a solo monster takes 2 (the default for one whose organization or role is Solo, even with no
  // passive). `turns: 3` for three; `turns: 1` turns it off.
  function normalizeSoloTurnsPassive(input, warnings, path) {
    const passive = { kind: "soloTurns", label: asTrimmedString(input.label || input.name) || "Solo Turns", turns: asPosInt(input.turns, 2) };
    if (input.backToBackReminder === false) passive.backToBackReminder = false;
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "turns", "backToBackReminder"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // A counter this creature keeps (rage, deathcount): shown on its token and panel from the start.
  function normalizeCounterPassive(input, warnings, path) {
    const passive = {
      kind: "counter",
      name: normalizeCounterName(input.name || input.label),
      label: asTrimmedString(input.label || input.name),
      start: asInt(input.start, 0),
      min: input.min === undefined || input.min === null || input.min === "" ? 0 : asInt(input.min, 0),
      resetAt: pickKnownLoose(input.resetAt, ["combatEnd", "roundStart", "turnStart", "never"], "combatEnd"),
    };
    if (input.max !== undefined && input.max !== null && input.max !== "") passive.max = asInt(input.max, 0);
    if (input.showWhenZero === false) passive.showWhenZero = false;
    if (!passive.name) warnings.push(`${path}: counter passive needs a name.`);
    const extras = pickExtras(input, new Set(["kind", "type", "passive", "id", "label", "name", "start", "min", "max", "resetAt", "showWhenZero"]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // A named custom condition's rules ("wet", "slagged", "dragonsealed"), on the monster whose abilities give it.
  // Whenever a condition of that name is put on a creature (by an ability), it carries these: a roll `rider`
  // (edge / bane / +damage / +potency, own rolls or rolls against it), movement fields (speedBonus, fly...),
  // `weakness` / `immunity` ({ type, amount }), and `riders` (effects at the bearer's turn start / end).
  function normalizeConditionRulePassive(input, warnings, path) {
    const name = asTrimmedString(input.name || input.condition);
    if (!name) {
      warnings.push(`${path}: conditionRule needs a name — skipping.`);
      return null;
    }
    const rule = { kind: "conditionRule", name: name.toLowerCase() };
    const description = asTrimmedString(input.description || input.text);
    if (description) rule.description = description;
    if (input.rider && typeof input.rider === "object") {
      const rider = normalizeHiddenEffectRider(input.rider, warnings, `${path}.rider`);
      if (rider) rule.rider = rider;
    }
    const moves = normalizeMovementFields(input, {});
    if (Object.keys(moves).length) rule.rider = { ...(rule.rider || { type: "rollModifier" }), ...moves };
    const defense = (value, label) => {
      if (!value || typeof value !== "object") return null;
      const amount = String(value.amount ?? value.value ?? "").trim().toLowerCase() === "all" ? "all" : asNonNegInt(value.amount ?? value.value, 0);
      if (!amount) { warnings.push(`${path}.${label}: needs an amount.`); return null; }
      const type = asTrimmedString(value.type || value.damageType).toLowerCase();
      return { amount, ...(type && type !== "untyped" ? { type } : {}) };
    };
    const weakness = defense(input.weakness, "weakness");
    if (weakness) rule.weakness = weakness;
    const immunity = defense(input.immunity, "immunity");
    if (immunity) rule.immunity = immunity;
    if (Array.isArray(input.riders)) {
      const riders = normalizeConditionRiders(input.riders, warnings, `${path}.riders`);
      if (riders.length) rule.riders = riders;
    }
    return rule;
  }

  function normalizePassive(input, warnings, path) {
    if (!input || typeof input !== "object") {
      warnings.push(`${path}: passive must be an object — skipping.`);
      return null;
    }
    const rawKind = asTrimmedString(input.kind || input.type || input.passive || input.id || input.label || input.name);
    const key = rawKind.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (key === "endeffect") return normalizeEndEffectPassive(input, warnings, path);
    if (key === "rollmodifier") return normalizeRollModifierPassive(input, warnings, path);
    if (key === "deathrule") return normalizeDeathRulePassive(input, warnings, path);
    if (key === "counter") return normalizeCounterPassive(input, warnings, path);
    if (key === "soloturns") return normalizeSoloTurnsPassive(input, warnings, path);
    if (key === "movement") return normalizeMovementPassive(input, warnings, path);
    if (key === "conditionrule") return normalizeConditionRulePassive(input, warnings, path);
    if (key === "object") {
      // A trap, hazard or siege engine (object-tokens.mjs). `inTracker: true` gives it turns; `object: false` says
      // a creature whose organization reads like an object is not one.
      const passive = { kind: "object", label: asTrimmedString(input.label || input.name) || "Object" };
      if (input.inTracker === true) passive.inTracker = true;
      if (input.object === false) passive.object = false;
      return passive;
    }
    if (key !== "standfirm") {
      warnings.push(`${path}: unknown passive "${rawKind || "(missing)"}" — skipping.`);
      return null;
    }
    const rawPrevented = Array.isArray(input.preventConditions)
      ? input.preventConditions
      : Array.isArray(input.preventedConditions)
        ? input.preventedConditions
        : ["prone", "frightened"];
    const preventConditions = rawPrevented
      .map((name) => P.normalizeCondition?.(name) || asTrimmedString(name).toLowerCase())
      .filter((name) => name === "prone" || name === "frightened");
    const passive = {
      kind: "standFirm",
      label: asTrimmedString(input.label || input.name || "Stand Firm"),
      condition: { kind: "adjacentAlly" },
      stabilityBonus: Math.max(0, asInt(input.stabilityBonus ?? input.stability ?? input.amount, 3)),
      preventConditions: preventConditions.length ? Array.from(new Set(preventConditions)) : ["prone", "frightened"],
    };
    const extras = pickExtras(input, new Set([
      "kind", "type", "passive", "id", "label", "name", "condition",
      "preventConditions", "preventedConditions",
      "stabilityBonus", "stability", "amount",
    ]));
    if (extras) passive._extra = extras;
    return passive;
  }

  // ---------- top-level ----------

  function emptyAutomation() {
    return {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards: [],
      modifiers: [],
      passives: [],
      usageLimit: null,
      warnings: [],
    };
  }

  function normalizeAutomation(input) {
    if (!input || typeof input !== "object") return emptyAutomation();
    const warnings = [];

    const rawCards = Array.isArray(input.cards)
      ? input.cards
      : Array.isArray(input.blocks)
        ? input.blocks
        : [];

    if (!input.schema) {
      warnings.push(`Missing schema id; expected "${SCHEMA_ID}". Treating as v3.`);
    }
    if (input.schema && input.schema !== SCHEMA_ID && input.schema !== "ability-automation/v2") {
      warnings.push(`Unknown schema "${input.schema}" — treating as v3.`);
    }
    if (input.schema === "ability-automation/v2") {
      warnings.push("v2 automation data was discarded. Re-author this ability as v3 JSON.");
      return { ...emptyAutomation(), warnings };
    }

    const cards = rawCards
      .map((block, index) => normalizeBlock(block, warnings, index))
      .filter(Boolean);
    let stateChangingCardSeen = false;
    cards.forEach((block, index) => {
      if (block?.type === "requestedTest" && stateChangingCardSeen) {
        warnings.push(`cards[${index}]: requestedTest must appear before state-changing cards so cancellation can refund and restart the whole ability safely.`);
      }
      if (["powerRoll", "effect", "persistent", "trigger"].includes(block?.type)) {
        stateChangingCardSeen = true;
      }
    });

    const rawModifiers = Array.isArray(input.modifiers) ? input.modifiers : [];
    const modifiers = rawModifiers
      .map((mod, index) => normalizeModifier(mod, warnings, `modifiers[${index}]`))
      .filter(Boolean);

    const rawPassives = Array.isArray(input.passives) ? input.passives : [];
    const passives = rawPassives
      .map((passive, index) => normalizePassive(passive, warnings, `passives[${index}]`))
      .filter(Boolean);

    // Top-level ability keywords. Optional. The runner uses these for
    // ifKeyword predicates and feature-modifier matching. If absent, the
    // runner falls back to the action's `keywords` / `tags` field on the
    // character sheet.
    const keywords = P.normalizeKeywordList
      ? P.normalizeKeywordList(input.keywords)
      : Array.isArray(input.keywords) ? input.keywords.filter(Boolean).map(String) : [];

    const usageLimit = normalizeUsageLimit(input.usageLimit || input.limit || input.oncePer, warnings, "usageLimit");

    const normalized = {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards,
      modifiers,
      passives,
      keywords,
      usageLimit,
      warnings,
    };
    const topLevelKnown = new Set([
      "schema",
      "version",
      "cards",
      "blocks",
      "modifiers",
      "passives",
      "keywords",
      "usageLimit",
      "limit",
      "oncePer",
      "warnings",
    ]);
    const extras = pickExtras(input, topLevelKnown);
    if (extras) normalized._extra = extras;
    return normalized;
  }

  function normalizeUsageLimit(input, warnings, path) {
    if (!input || typeof input !== "object") return null;
    const scopeRaw = asTrimmedString(input.scope || input.per || "round").toLowerCase();
    const scope = ["round", "turn", "encounter"].includes(scopeRaw) ? scopeRaw : "round";
    const key = asTrimmedString(input.key || input.id || input.name);
    const source = pickKnown(input.source, ["self"], "self");
    const target = pickKnown(input.target, ["self"], "self");
    const message = asTrimmedString(input.message || input.blockedMessage);
    if (!key) {
      warnings.push(`${path}.key: usageLimit needs a key.`);
      return null;
    }
    const usageLimit = {
      scope,
      key,
      source,
      target,
      message,
    };
    const extras = pickExtras(input, new Set([
      "scope", "per", "key", "id", "name", "source", "target", "message", "blockedMessage",
    ]));
    if (extras) usageLimit._extra = extras;
    return usageLimit;
  }

  function hasAutomation(input) {
    return Boolean(
      input &&
        typeof input === "object" &&
        ((Array.isArray(input.cards) && input.cards.length) ||
          (Array.isArray(input.modifiers) && input.modifiers.length) ||
          (Array.isArray(input.passives) && input.passives.length))
    );
  }

  function describeOne(effect, ctx) {
    return ctx && P.describeEffectResolved ? P.describeEffectResolved(effect, ctx) : P.describeEffect(effect);
  }

  function describeBranchCondition(condition) {
    if (!condition || typeof condition !== "object") return "condition";
    switch (condition.kind) {
      case "strained":
        return "strained";
      case "winded":
        return "winded";
      case "keyword": {
        const parts = [];
        if (condition.all?.length) parts.push(`all keywords: ${condition.all.join(", ")}`);
        if (condition.any?.length) parts.push(`any keyword: ${condition.any.join(", ")}`);
        if (condition.none?.length) parts.push(`no keywords: ${condition.none.join(", ")}`);
        return parts.join("; ") || "keyword";
      }
      case "prompt":
        return `prompt: ${condition.question || "Use the first branch?"}`;
      case "mark":
        return condition.predicate || "mark";
      case "scopedFlag":
        return `${condition.scope || "round"} flag ${condition.key || "(missing key)"} ${condition.mode || "notSet"}`;
      case "distance": {
        const band = [];
        if (condition.min != null) band.push(`≥${condition.min}`);
        if (condition.max != null) band.push(`≤${condition.max}`);
        return `${condition.from || "self"}→${condition.to || "target"} ${band.join(" & ") || "(any)"} sq`;
      }
      default:
        return condition.kind || "condition";
    }
  }

  function summarizeBlock(block, ctx) {
    if (!block || typeof block !== "object") return "";
    switch (block.type) {
      case "target": {
        if (block.mode === "area") {
          const sizeText =
            block.shape === "rectangle"
              ? `${block.width || block.size}x${block.height || block.size}`
              : block.shape === "line" || block.shape === "wall"
                ? `${block.length || block.size}-square ${block.shape}`
                : `${block.size}-square ${block.shape}`;
          const within = block.distance?.within ? ` within ${block.distance.within}` : "";
          return `Place ${sizeText}${within} affecting ${block.predicate}${block.optional ? " (optional)" : ""}.`;
        }
        const count = block.count?.mode === "upTo" ? `up to ${block.count.value}` : `${block.count?.value ?? 1}`;
        const distance = block.distance?.value ? ` within ${block.distance.value}` : "";
        const origin = block.rangeOrigin && block.rangeOrigin !== "self" ? ` from ${block.rangeOrigin}` : "";
        return `Pick ${count} ${block.predicate}${distance}${origin}${block.optional ? " (optional)" : ""}.`;
      }
      case "powerRoll":
        return `Roll ${block.rollFormula || "2d10"} + ${block.attribute || "Strongest"}${block.bonus ? ` ${block.bonus >= 0 ? "+" : ""}${block.bonus}` : ""}.`;
      case "effect": {
        const inner = (block.effects || []).map((e) => describeOne(e, ctx)).filter(Boolean).join(", ");
        return `Effect: ${inner || "(none)"}`;
      }
      case "trigger":
        return `Trigger: ${block.condition || "(no condition)"}`;
      case "persistent":
        return `Persistent ${block.cost || 0}${block.resource ? ` ${block.resource}` : ""}${block.expiresAt && block.expiresAt !== "never" ? `, expires ${block.expiresAt}` : ""}: ${(block.effects || []).map((e) => describeOne(e, ctx)).filter(Boolean).join(", ") || "(no effects)"}`;
      case "branch":
        return `If ${describeBranchCondition(block.condition)}, run ${block.then?.length || 0} card(s); otherwise run ${block.else?.length || 0} card(s).`;
      case "choice":
        return `Choose ${block.name || "option"}: ${(block.options || []).map((o) => o.label).join(", ") || "(no options)"}.`;
      default:
        return "";
    }
  }

  function describeBlockSteps(block, ctx) {
    if (!block || typeof block !== "object") return [];
    switch (block.type) {
      case "target": {
        return [summarizeBlock(block, ctx)];
      }
      case "powerRoll": {
        const lines = [`Roll ${block.rollFormula || "2d10"} + ${block.attribute || "Strongest"}.`];
        for (const tier of P.TIER_KEYS) {
          const effects = block.tiers?.[tier]?.effects || [];
          const text = effects.map((e) => describeOne(e, ctx)).filter(Boolean).join("; ");
          lines.push(`  ${P.tierLabel(tier)}: ${text || "(no effects)"}`);
        }
        return lines;
      }
      case "effect":
        return [`Apply: ${(block.effects || []).map((e) => describeOne(e, ctx)).filter(Boolean).join("; ") || "(no effects)"}`];
      case "trigger":
        return [
          `Trigger: ${block.condition || "(no condition)"}`,
          `  → ${(block.effects || []).map((e) => describeOne(e, ctx)).filter(Boolean).join("; ") || "(no effects)"}`,
        ];
      case "persistent":
        return [
          `Persistent ${block.cost || 0} ${block.resource || ""} at ${block.tickAt}:`,
          block.expiresAt && block.expiresAt !== "never" ? `  Expires at owner ${block.expiresAt}.` : "",
          `  ${(block.effects || []).map((e) => describeOne(e, ctx)).filter(Boolean).join("; ") || "(no effects)"}`,
        ].filter(Boolean);
      case "branch": {
        const lines = [`Branch on ${describeBranchCondition(block.condition)}.`];
        (block.then || []).forEach((child, index) => {
          lines.push(`  Then ${index + 1}: ${summarizeBlock(child, ctx) || child.type || "card"}`);
        });
        (block.else || []).forEach((child, index) => {
          lines.push(`  Else ${index + 1}: ${summarizeBlock(child, ctx) || child.type || "card"}`);
        });
        return lines;
      }
      case "choice": {
        const lines = [`Choose ${block.name || "option"}: ${block.prompt || "Choose one option."}`];
        (block.options || []).forEach((option, index) => {
          const keywords = option.keywords?.length ? ` [${option.keywords.join(", ")}]` : "";
          lines.push(`  Option ${index + 1}: ${option.label}${keywords}`);
          (option.cards || []).forEach((child, childIndex) => {
            lines.push(`    ${childIndex + 1}: ${summarizeBlock(child, ctx) || child.type || "card"}`);
          });
        });
        return lines;
      }
      default:
        return [];
    }
  }

  function describeAutomationSteps(automation, ctx) {
    const norm = normalizeAutomation(automation);
    const lines = [];
    norm.cards.forEach((block, index) => {
      lines.push(`${index + 1}. [${block.type}] ${summarizeBlock(block, ctx)}`);
      describeBlockSteps(block, ctx).slice(1).forEach((line) => lines.push(`   ${line}`));
    });
    return lines;
  }

  global.AbilityAutomationSchema = {
    SCHEMA_ID,
    SCHEMA_VERSION,
    createId,
    emptyAutomation,
    normalizeAutomation,
    normalizeBlock,
    normalizeEffect,
    summarizeBlock,
    describeBlockSteps,
    describeAutomationSteps,
    hasAutomation,
  };
})(window);
