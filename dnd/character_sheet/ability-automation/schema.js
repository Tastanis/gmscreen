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
//       { type: "trigger",    id, condition, effects: [Effect, ...] },
//       { type: "persistent", id, cost, resource, effects: [Effect, ...] }
//     ]
//   }
//
// `cards` (the top-level array) is the runtime execution order. Block types are
// orthogonal — multiple targets, multiple effects, etc. are all allowed.
//
// Effect kinds: damage, heal, temporaryStamina, condition, forcedMovement,
// teleport, swap, resourceGain, freeStrike, cascade, note, potency, spend, other.
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

  // ---------- effects ----------

  function normalizeEffectList(input, warnings, path) {
    if (!Array.isArray(input)) return [];
    return input
      .map((effect, index) => normalizeEffect(effect, warnings, `${path}[${index}]`))
      .filter(Boolean);
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
        const known = new Set(["kind", "amount", "attribute", "damageType", "raw"]);
        const effect = {
          kind: "damage",
          amount: asInt(input.amount, 0),
          attribute: input.attribute ? P.normalizeAttribute(input.attribute) : "",
          damageType: P.normalizeDamageType(input.damageType || "untyped"),
        };
        if (effect.attribute && !P.ATTRIBUTES.includes(effect.attribute)) {
          warnings.push(`${path}: damage attribute "${input.attribute}" not in registry.`);
        }
        if (!P.DAMAGE_TYPES.includes(effect.damageType)) {
          warnings.push(`${path}: damage type "${input.damageType}" not in registry.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "heal": {
        const known = new Set(["kind", "amount", "recoveries"]);
        const recoveries = asNonNegInt(input.recoveries, 0);
        const amount = asNonNegInt(input.amount, 0);
        if (!recoveries && !amount) {
          warnings.push(`${path}: heal has no amount or recoveries; runtime will skip.`);
        }
        const effect = { kind: "heal" };
        if (recoveries) effect.recoveries = recoveries;
        if (amount) effect.amount = amount;
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "temporaryStamina": {
        const known = new Set(["kind", "amount"]);
        const effect = { kind: "temporaryStamina", amount: asNonNegInt(input.amount, 0) };
        if (!effect.amount) warnings.push(`${path}: temporary stamina has no amount.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "condition": {
        const known = new Set(["kind", "name", "duration", "text"]);
        const rawName = asTrimmedString(input.name);
        const name = P.normalizeCondition(rawName) || "other";
        const effect = {
          kind: "condition",
          name,
          duration: P.normalizeDuration(input.duration || "instantaneous"),
        };
        if (name === "other") effect.text = asTrimmedString(input.text || rawName);
        if (rawName && !P.CONDITIONS.includes(rawName.toLowerCase()) && name === "other" && !effect.text) {
          warnings.push(`${path}: condition "${rawName}" mapped to "other" with no description.`);
        }
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "forcedMovement": {
        const known = new Set(["kind", "verb", "distance", "upTo"]);
        const verb = P.normalizeForcedMovementVerb(input.verb || "push");
        const effect = {
          kind: "forcedMovement",
          verb,
          distance: asNonNegInt(input.distance, 0),
          upTo: asBool(input.upTo),
        };
        if (!effect.distance) warnings.push(`${path}: forced movement has 0 distance.`);
        const extras = pickExtras(input, known);
        if (extras) effect._extra = extras;
        return effect;
      }
      case "teleport": {
        const known = new Set(["kind", "distance"]);
        const effect = { kind: "teleport", distance: asNonNegInt(input.distance, 0) };
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
        const known = new Set(["kind", "resource", "amount", "timing", "effects"]);
        const effect = {
          kind: "spend",
          resource: asTrimmedString(input.resource),
          amount: asPosInt(input.amount, 1),
          timing: pickKnown(input.timing, P.SPEND_TIMINGS, "postResult"),
          effects: normalizeEffectList(input.effects || [], warnings, `${path}.effects`),
        };
        if (!effect.resource) warnings.push(`${path}: spend missing resource name.`);
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
    const known = new Set(["type", "id", "attribute", "bonus", "target", "tiers", "rollFormula", "note"]);
    const tiersInput = input.tiers && typeof input.tiers === "object" ? input.tiers : {};
    const tiers = {};
    for (const key of P.TIER_KEYS) {
      const legacy = Object.entries(P.LEGACY_TIER_KEYS).find(([, mapped]) => mapped === key)?.[0];
      const source = tiersInput[key] || (legacy && tiersInput[legacy]) || {};
      tiers[key] = normalizeTier(source, warnings, `${path}.tiers.${key}`);
    }
    const block = {
      type: "powerRoll",
      id: input.id || createId("powerroll"),
      attribute: P.normalizeAttribute(input.attribute || "Strongest"),
      bonus: asInt(input.bonus, 0),
      target: asTrimmedString(input.target),
      rollFormula: asTrimmedString(input.rollFormula) || "2d10",
      tiers,
    };
    if (input.note) block.note = asTrimmedString(input.note);
    if (!P.ATTRIBUTES.includes(block.attribute)) {
      warnings.push(`${path}: attribute "${block.attribute}" not in registry.`);
    }
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeEffectBlock(input, warnings, path) {
    const known = new Set(["type", "id", "target", "effects", "note"]);
    const block = {
      type: "effect",
      id: input.id || createId("effect"),
      target: asTrimmedString(input.target),
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (!block.effects.length) warnings.push(`${path}: effect block has no effects.`);
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeTriggerBlock(input, warnings, path) {
    const known = new Set(["type", "id", "condition", "target", "effects", "note"]);
    const block = {
      type: "trigger",
      id: input.id || createId("trigger"),
      condition: asTrimmedString(input.condition),
      target: asTrimmedString(input.target),
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (!block.condition) warnings.push(`${path}: trigger has no condition text.`);
    if (input.note) block.note = asTrimmedString(input.note);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizePersistentBlock(input, warnings, path) {
    const known = new Set(["type", "id", "cost", "resource", "tickAt", "effects", "note"]);
    const block = {
      type: "persistent",
      id: input.id || createId("persistent"),
      cost: asNonNegInt(input.cost, 0),
      resource: asTrimmedString(input.resource),
      tickAt: pickKnown(input.tickAt, ["startOfTurn", "endOfTurn"], "startOfTurn"),
      effects: normalizeEffectList(input.effects, warnings, `${path}.effects`),
    };
    if (input.note) block.note = asTrimmedString(input.note);
    if (!block.cost) warnings.push(`${path}: persistent has cost 0; reads as "always-on".`);
    const extras = pickExtras(input, known);
    if (extras) block._extra = extras;
    return block;
  }

  function normalizeBlock(input, warnings, index) {
    const path = `cards[${index}]`;
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
      default:
        return null;
    }
  }

  // ---------- top-level ----------

  function emptyAutomation() {
    return {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards: [],
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

    return {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      cards,
      warnings,
    };
  }

  function hasAutomation(input) {
    return Boolean(
      input &&
        typeof input === "object" &&
        Array.isArray(input.cards) &&
        input.cards.length
    );
  }

  function summarizeBlock(block) {
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
        const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join(", ");
        return `Effect: ${inner || "(none)"}`;
      }
      case "trigger":
        return `Trigger: ${block.condition || "(no condition)"}`;
      case "persistent":
        return `Persistent ${block.cost || 0}${block.resource ? ` ${block.resource}` : ""}: ${(block.effects || []).map(P.describeEffect).filter(Boolean).join(", ") || "(no effects)"}`;
      default:
        return "";
    }
  }

  function describeBlockSteps(block) {
    if (!block || typeof block !== "object") return [];
    switch (block.type) {
      case "target": {
        const summary = summarizeBlock(block);
        return [summary];
      }
      case "powerRoll": {
        const lines = [`Roll ${block.rollFormula || "2d10"} + ${block.attribute || "Strongest"}.`];
        for (const tier of P.TIER_KEYS) {
          const effects = block.tiers?.[tier]?.effects || [];
          const text = effects.map(P.describeEffect).filter(Boolean).join("; ");
          lines.push(`  ${P.tierLabel(tier)}: ${text || "(no effects)"}`);
        }
        return lines;
      }
      case "effect":
        return [`Apply: ${(block.effects || []).map(P.describeEffect).filter(Boolean).join("; ") || "(no effects)"}`];
      case "trigger":
        return [
          `Trigger: ${block.condition || "(no condition)"}`,
          `  → ${(block.effects || []).map(P.describeEffect).filter(Boolean).join("; ") || "(no effects)"}`,
        ];
      case "persistent":
        return [
          `Persistent ${block.cost || 0} ${block.resource || ""} at ${block.tickAt}:`,
          `  ${(block.effects || []).map(P.describeEffect).filter(Boolean).join("; ") || "(no effects)"}`,
        ];
      default:
        return [];
    }
  }

  function describeAutomationSteps(automation) {
    const norm = normalizeAutomation(automation);
    const lines = [];
    norm.cards.forEach((block, index) => {
      lines.push(`${index + 1}. [${block.type}] ${summarizeBlock(block)}`);
      describeBlockSteps(block).slice(1).forEach((line) => lines.push(`   ${line}`));
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
