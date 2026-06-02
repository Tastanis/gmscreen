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
// teleport, swap, resourceGain, surgeGain, freeStrike, cascade, note, potency, spend, other.
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

  function pickExtras(input, knownKeys) {
    if (!input || typeof input !== "object") return null;
    const extras = {};
    let count = 0;
    for (const key of Object.keys(input)) {
      if (!knownKeys.has(key)) {
        extras[key] = input[key];
        count += 1;
      }
    }
    return count ? extras : null;
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
    const type = rawType.toLowerCase() === "rollmodifier" ? "rollModifier" : rawType;
    if (type !== "rollModifier") {
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
    if (!modifier) {
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
    const rider = { type: "rollModifier", modifier: modifier || rawModifier || "edge" };
    if (Object.keys(appliesTo).length) rider.appliesTo = appliesTo;
    rider.consume = pickKnown(consume, ["manual", "nextMatchingRoll"], consume);
    return rider;
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
    const target = normalizeTargetRef(input?.target);
    if (Array.isArray(target) ? target.length : target) {
      effect.target = target;
    }
    return effect;
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
    const rawSource = asTrimmedString(input.source) || "triggeringDamage";
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
        const known = new Set(["kind", "amount", "amountDice", "markBonusDice", "markPredicate", "attribute", "multiplier", "damageType", "raw", "amountFrom"]);
        const attribute = input.attribute !== undefined && input.attribute !== null
          ? (P.normalizeAttributeOrList ? P.normalizeAttributeOrList(input.attribute) : P.normalizeAttribute(input.attribute))
          : "";
        const effect = {
          kind: "damage",
          amount: asInt(input.amount, 0),
          amountDice: asTrimmedString(input.amountDice),
          markBonusDice: asTrimmedString(input.markBonusDice),
          markPredicate: asTrimmedString(input.markPredicate),
          attribute,
          damageType: P.normalizeDamageType(input.damageType || "untyped"),
        };
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
        if (input.amountFrom !== undefined && input.amountFrom !== null) {
          const amountFrom = normalizeAmountFrom(input.amountFrom, warnings, `${path}.amountFrom`);
          if (amountFrom) effect.amountFrom = amountFrom;
        }
        const attrValid = !attribute
          || (Array.isArray(attribute) ? attribute.every((a) => P.ATTRIBUTES.includes(a)) : P.ATTRIBUTES.includes(attribute));
        if (!attrValid) {
          warnings.push(`${path}: damage attribute "${JSON.stringify(input.attribute)}" not in registry.`);
        }
        if (!P.DAMAGE_TYPES.includes(effect.damageType)) {
          warnings.push(`${path}: damage type "${input.damageType}" not in registry.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "heal": {
        const known = new Set(["kind", "amount", "recoveries", "attribute", "amountFrom"]);
        const recoveries = asNonNegInt(input.recoveries, 0);
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
      case "condition": {
        const known = new Set([
          "kind",
          "name",
          "duration",
          "text",
          "label",
          "amount",
          "damageType",
          "hidden",
          "rider",
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
          effect.amount = asNonNegInt(input.amount, 0);
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
          const sourceId = asTrimmedString(input.sourceId);
          const sourceName = asTrimmedString(input.sourceName);
          const sourceAbility = asTrimmedString(input.sourceAbility);
          if (sourceId) effect.sourceId = sourceId;
          if (sourceName) effect.sourceName = sourceName;
          if (sourceAbility) effect.sourceAbility = sourceAbility;
          if (!effect.rider) {
            warnings.push(`${path}: hiddenEffect has no supported rider; it will display as a removable effect only.`);
          }
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "forcedMovement": {
        const known = new Set(["kind", "verb", "distance", "upTo", "attribute", "multiplier"]);
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
        const known = new Set(["kind", "label", "attribute", "bonus", "rollFormula", "text"]);
        const effect = {
          kind: "abilityTest",
          label: asTrimmedString(input.label) || "Test",
          attribute: P.normalizeAttributeOrList
            ? P.normalizeAttributeOrList(input.attribute || "Strongest")
            : P.normalizeAttribute(input.attribute || "Strongest"),
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
        const known = new Set(["kind", "against", "text"]);
        const effect = {
          kind: "freeStrike",
          against: asTrimmedString(input.against),
          text: asTrimmedString(input.text),
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
        const known = new Set(["kind", "attribute", "level", "onFail"]);
        const attribute = P.normalizeAttribute(input.attribute || "Might");
        if (!P.ATTRIBUTES.includes(attribute) || attribute === "Strongest") {
          warnings.push(`${path}: potency attribute should be M/A/R/I/P (got "${input.attribute}").`);
        }
        const level = P.normalizePotencyLevel(input.level || input.threshold || "weak");
        const onFail = normalizeEffectList(input.onFail || input.effects || [], warnings, `${path}.onFail`);
        const effect = { kind: "potency", attribute, level, onFail };
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
        const known = new Set(["kind", "enabled", "radius", "color", "target", "text"]);
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
          mode: pickKnown(value.mode, ["exact", "upTo"], "exact"),
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
      "distance", "range", "shape", "size", "width", "height", "length", "note",
      "promptTitle", "promptText", "excludeGroups", "excludeGroup",
      "structure", "wallColor",
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
    const excludeGroups = Array.isArray(input.excludeGroups)
      ? input.excludeGroups.map((group) => asTrimmedString(group)).filter(Boolean)
      : asTrimmedString(input.excludeGroup)
        ? [asTrimmedString(input.excludeGroup)]
        : [];
    if (excludeGroups.length) block.excludeGroups = excludeGroups;
    const distance = normalizeDistance(input.distance, warnings, `${path}.distance`);
    if (distance) block.distance = distance;
    const range = asNonNegInt(input.range, 0);
    if (range) block.range = range;
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
  ];

  // The `whose` filter answers "whose event is this?" relative to the caster
  // and the runner's previously-named target groups.
  const WHOSE_VALUES = ["self", "ally", "enemy", "target", "judgedTarget", "markSource", "any"];
  const TRIGGER_LIFETIME_WHOSE_VALUES = ["self", "ally", "enemy", "target", "any"];
  const STAMINA_DIRECTIONS = ["down", "up", "either"];
  const TRIGGER_LIFETIME_EVENTS = ["turnStart", "turnEnd", "roundStart", "roundEnd", "combatStart", "combatEnd"];

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

  function normalizeTriggerBlock(input, warnings, path) {
    const known = new Set(["type", "id", "condition", "match", "target", "effectTarget", "resolveTarget", "effects", "note", "expires", "lifetime"]);
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
    if (!block.condition && !match) {
      warnings.push(`${path}: trigger has no condition text or match config.`);
    }
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizePersistentBlock(input, warnings, path) {
    const known = new Set(["type", "id", "cost", "resource", "tickAt", "expiresAt", "triggers", "effects", "note", "target"]);
    const validTriggers = new Set(["onEnter", "onOccupantTurnStart"]);
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
      expiresAt: pickKnown(input.expiresAt, ["startOfTurn", "endOfTurn", "never"], "never"),
      triggers,
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (input.target) block.target = asTrimmedString(input.target);
    if (input.note) block.note = asTrimmedString(input.note);
    if (!block.cost && !block.triggers.length) {
      warnings.push(`${path}: persistent has cost 0 with no triggers; reads as "always-on at owner turn".`);
    }
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  const BRANCH_CONDITION_KINDS = ["strained", "winded", "keyword", "prompt", "mark", "scopedFlag", "distance"];
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
    if (input.note) out.note = asTrimmedString(input.note);
    return out;
  }

  // ---------- top-level ----------

  function emptyAutomation() {
    return {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards: [],
      modifiers: [],
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

    if (input.schema && input.schema !== SCHEMA_ID && input.schema !== "ability-automation/v2") {
      warnings.push(`Unknown schema "${input.schema}" — treating as v3.`);
    }
    if (input.schema === "ability-automation/v2") {
      warnings.push("v2 automation data was discarded. Re-author this ability as v3 JSON.");
      return emptyAutomation();
    }

    const cards = rawCards
      .map((block, index) => normalizeBlock(block, warnings, index))
      .filter(Boolean);

    const rawModifiers = Array.isArray(input.modifiers) ? input.modifiers : [];
    const modifiers = rawModifiers
      .map((mod, index) => normalizeModifier(mod, warnings, `modifiers[${index}]`))
      .filter(Boolean);

    // Top-level ability keywords. Optional. The runner uses these for
    // ifKeyword predicates and feature-modifier matching. If absent, the
    // runner falls back to the action's `keywords` / `tags` field on the
    // character sheet.
    const keywords = P.normalizeKeywordList
      ? P.normalizeKeywordList(input.keywords)
      : Array.isArray(input.keywords) ? input.keywords.filter(Boolean).map(String) : [];

    return {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards,
      modifiers,
      keywords,
      warnings,
    };
  }

  function hasAutomation(input) {
    return Boolean(
      input &&
        typeof input === "object" &&
        ((Array.isArray(input.cards) && input.cards.length) ||
          (Array.isArray(input.modifiers) && input.modifiers.length))
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
        return `Pick ${count} ${block.predicate}${distance}${block.optional ? " (optional)" : ""}.`;
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
