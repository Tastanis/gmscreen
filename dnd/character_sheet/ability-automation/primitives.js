// Ability Automation — Registry of vocabulary used by schema, runner, paste UI,
// and inspector. Single source of truth for every enum the JSON references.
//
// When adding a new effect kind, condition, damage type, etc., add it here first.
// Then update AUTHORING.md and REGISTRY.md so LLM-authored JSON stays in sync.

(function (global) {
  "use strict";

  const BLOCK_TYPES = ["target", "powerRoll", "effect", "trigger", "persistent", "branch"];

  const EFFECT_KINDS = [
    "damage",
    "heal",
    "temporaryStamina",
    "condition",
    "forcedMovement",
    "shift",
    "teleport",
    "swap",
    "abilityTest",
    "resourceGain",
    "surgeGain",
    "freeStrike",
    "cascade",
    "note",
    "potency",
    "spend",
    "ifKeyword",
    "ifStrained",
    "ifPrompt",
    "ifMark",
    "ifScopedFlag",
    "setScopedFlag",
    "applyMark",
    "endMark",
    "halveTriggeringDamage",
    "other",
  ];

  // Standard Draw Steel ability keywords. Authors can use any string, but the
  // ones below are recognized for canonical casing and as the registry seed.
  const KEYWORDS = [
    "Melee",
    "Ranged",
    "Strike",
    "Weapon",
    "Magic",
    "Psionic",
    "Area",
    "Charge",
    "Persistent",
    "Resistance",
    "Routine",
    "Free",
    "FreeStrike",
    "FreeTriggered",
  ];

  function normalizeKeyword(value) {
    if (value === null || value === undefined) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    // Case-insensitive canonicalization against the standard registry.
    const match = KEYWORDS.find((kw) => kw.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
  }

  function normalizeKeywordList(value) {
    if (value === null || value === undefined) return [];
    const raw = Array.isArray(value)
      ? value
      : String(value).split(/[,;|]/g);
    const seen = new Set();
    const result = [];
    for (const item of raw) {
      const kw = normalizeKeyword(item);
      if (!kw) continue;
      const lower = kw.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      result.push(kw);
    }
    return result;
  }

  function keywordsMatch(have, query) {
    // `have` is the ability's keywords (case-insensitive list).
    // `query` may have: { all: [...], any: [...], none: [...] }
    if (!query || typeof query !== "object") return true;
    const lower = (have || []).map((k) => String(k).toLowerCase());
    const hasAll = (list) => (list || []).every((k) => lower.includes(String(k).toLowerCase()));
    const hasAny = (list) => !list?.length || list.some((k) => lower.includes(String(k).toLowerCase()));
    const hasNone = (list) => !list?.length || list.every((k) => !lower.includes(String(k).toLowerCase()));
    if (query.all && !hasAll(query.all)) return false;
    if (query.any && !hasAny(query.any)) return false;
    if (query.none && !hasNone(query.none)) return false;
    return true;
  }

  const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence", "Strongest"];
  const ATTRIBUTE_SHORT = { M: "Might", A: "Agility", R: "Reason", I: "Intuition", P: "Presence" };

  const POTENCY_LEVELS = ["weak", "average", "strong"];

  const DAMAGE_TYPES = [
    "untyped",
    "acid",
    "cold",
    "corruption",
    "fire",
    "holy",
    "lightning",
    "poison",
    "psychic",
    "sonic",
  ];

  const CONDITIONS = [
    "bleeding",
    "dazed",
    "dying",
    "frightened",
    "grabbed",
    "prone",
    "restrained",
    "slowed",
    "taunted",
    "weakened",
    // Numeric / typed riders. Carry `amount` and (optionally) `damageType` on
    // the condition object; the VTT damage handler reads them when computing
    // adjusted damage. Empty `damageType` = applies to every type.
    "damageWeakness",
    "damageImmunity",
    "other",
  ];

  // Conditions that carry numeric / typed fields beyond the base shape. Used by
  // the normalizer to know NOT to discard `amount` / `damageType` on save.
  const NUMERIC_CONDITIONS = ["damageWeakness", "damageImmunity"];

  const DURATIONS = [
    "instantaneous",
    "endOfTurn",
    "saveEnds",
    "endOfEncounter",
    "untilDying",
  ];

  const FORCED_MOVEMENT_VERBS = [
    "push",
    "pull",
    "slide",
    "verticalPush",
    "verticalPull",
    "verticalSlide",
  ];

  const TARGET_PREDICATES = [
    "creature",
    "enemy",
    "ally",
    "object",
    "creatureOrObject",
    "self",
    "selfOrAlly",
    "selfAndAlly",
  ];

  const TARGET_MODES = ["token", "area"];
  const AREA_SHAPES = ["cube", "rectangle", "burst", "aura", "line", "wall"];

  const DISTANCE_FORMS = [
    "self",
    "melee",
    "ranged",
    "meleeOrRanged",
    "burst",
    "aura",
    "cube",
    "line",
    "wall",
  ];

  const SPEND_TIMINGS = ["preRoll", "postResult"];
  const TIER_KEYS = ["tier1", "tier2", "tier3"];
  const TIER_RANGES = { tier1: "<= 11", tier2: "12-16", tier3: "17+" };
  const LEGACY_TIER_KEYS = { low: "tier1", mid: "tier2", high: "tier3" };

  function normalizeAttribute(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    if (ATTRIBUTES.includes(trimmed)) return trimmed;
    const upper = trimmed.toUpperCase();
    if (ATTRIBUTE_SHORT[upper]) return ATTRIBUTE_SHORT[upper];
    const titled = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    if (ATTRIBUTES.includes(titled)) return titled;
    return trimmed;
  }

  // Accept either a single attribute string or an array. When an array is
  // returned, callers should treat it as "use the highest bonus among these
  // attributes" — e.g. `["Might", "Agility"]` means "highest of M or A
  // only", which is the free-strike rule.
  function normalizeAttributeOrList(value) {
    if (Array.isArray(value)) {
      const list = value.map(normalizeAttribute).filter(Boolean);
      if (list.length <= 1) return list[0] || "";
      return list;
    }
    return normalizeAttribute(value);
  }

  function normalizeDamageType(value) {
    if (!value) return "untyped";
    const lower = String(value).trim().toLowerCase();
    if (!lower) return "untyped";
    return lower;
  }

  function normalizeCondition(value) {
    if (!value) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    // CONDITIONS uses canonical casing (e.g. "damageWeakness"). Match by
    // lowercase and return the canonical form so downstream consumers can
    // compare with === instead of toLowerCase() each time.
    const canonical = CONDITIONS.find((name) => name.toLowerCase() === lower);
    return canonical || "other";
  }

  function normalizeDuration(value) {
    if (!value) return "instantaneous";
    const raw = String(value).trim();
    if (!raw) return "instantaneous";
    const map = {
      "save ends": "saveEnds",
      saveends: "saveEnds",
      se: "saveEnds",
      "end of turn": "endOfTurn",
      endofturn: "endOfTurn",
      eot: "endOfTurn",
      "end of encounter": "endOfEncounter",
      endofencounter: "endOfEncounter",
      eoe: "endOfEncounter",
      "until dying": "untilDying",
      untildying: "untilDying",
      instant: "instantaneous",
      instantaneous: "instantaneous",
      endofturn_target: "endOfTurn",
    };
    const lower = raw.toLowerCase();
    if (map[lower]) return map[lower];
    if (DURATIONS.includes(raw)) return raw;
    return "instantaneous";
  }

  function normalizePotencyLevel(value) {
    if (!value) return "weak";
    const lower = String(value).trim().toLowerCase();
    const map = { w: "weak", v: "average", s: "strong", weak: "weak", average: "average", avg: "average", strong: "strong" };
    return map[lower] || "weak";
  }

  function normalizeForcedMovementVerb(value) {
    if (!value) return "push";
    const trimmed = String(value).trim();
    if (FORCED_MOVEMENT_VERBS.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    const map = {
      push: "push",
      pull: "pull",
      slide: "slide",
      "vertical push": "verticalPush",
      "vertical-push": "verticalPush",
      verticalpush: "verticalPush",
      "vertical pull": "verticalPull",
      "vertical-pull": "verticalPull",
      verticalpull: "verticalPull",
      "vertical slide": "verticalSlide",
      "vertical-slide": "verticalSlide",
      verticalslide: "verticalSlide",
    };
    return map[lower] || "push";
  }

  function normalizeTargetPredicate(value) {
    if (!value) return "creature";
    const trimmed = String(value).trim();
    if (TARGET_PREDICATES.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase().replace(/\s+/g, "");
    const map = {
      creature: "creature",
      enemy: "enemy",
      ally: "ally",
      object: "object",
      creatureorobject: "creatureOrObject",
      self: "self",
      selforally: "selfOrAlly",
      selfandally: "selfAndAlly",
      selfandallies: "selfAndAlly",
    };
    return map[lower] || "creature";
  }

  function normalizeTierKey(key) {
    if (!key) return "";
    const value = String(key).trim();
    if (TIER_KEYS.includes(value)) return value;
    if (LEGACY_TIER_KEYS[value]) return LEGACY_TIER_KEYS[value];
    return "";
  }

  function tierLabel(key) {
    return TIER_RANGES[key] || key || "";
  }

  function tierFromTotal(total) {
    if (total <= 11) return "tier1";
    if (total <= 16) return "tier2";
    return "tier3";
  }

  function shiftTierKey(key, shift) {
    const index = TIER_KEYS.indexOf(key);
    if (index === -1 || !shift) return key;
    return TIER_KEYS[Math.min(TIER_KEYS.length - 1, Math.max(0, index + shift))];
  }

  // Resolve a damage amount given character context (adds attribute bonus).
  function resolveDamageAmount(effect, ctx) {
    const base = Number.parseInt(effect.amount, 10) || 0;
    if (!effect.attribute || !ctx || typeof ctx.getAttributeBonus !== "function") return base;
    const bonus = Number.parseInt(ctx.getAttributeBonus(effect.attribute), 10) || 0;
    return base + bonus;
  }

  // Resolve a potency level (weak/average/strong) to its integer threshold using
  // the same formula the board uses: highest characteristic minus offset.
  function resolvePotencyThreshold(level, ctx) {
    if (!ctx || typeof ctx.getPotencyThreshold !== "function") return null;
    const value = ctx.getPotencyThreshold(level);
    return Number.isFinite(value) ? value : null;
  }

  // Describe an effect WITHOUT character context — the JSON-level form.
  // Use describeEffectResolved when the runtime/inspector has the source character.
  function describeEffect(effect) {
    if (!effect || typeof effect !== "object") return "";
    switch (effect.kind) {
      case "damage": {
        const amount = effect.amount || 0;
        const attr = effect.attribute ? ` + ${effect.attribute}` : "";
        const type = effect.damageType && effect.damageType !== "untyped" ? ` ${effect.damageType}` : "";
        return `${amount}${attr}${type} damage`;
      }
      case "heal":
        if (effect.recoveries) return `spend ${effect.recoveries} recovery → heal`;
        return `heal ${effect.amount || 0}`;
      case "temporaryStamina":
        return `${effect.amount || 0} temporary Stamina`;
      case "condition": {
        const dur = effect.duration && effect.duration !== "instantaneous" ? ` (${effect.duration})` : "";
        if (effect.name === "damageWeakness" || effect.name === "damageImmunity") {
          const verb = effect.name === "damageWeakness" ? "weakness" : "immunity";
          const amount = effect.amount || 0;
          const type = effect.damageType && effect.damageType !== "untyped" ? ` ${effect.damageType}` : "";
          return `${verb} ${amount}${type}${dur}`;
        }
        const name = effect.name === "other" && effect.text ? effect.text : effect.name || "condition";
        return `${name}${dur}`;
      }
      case "forcedMovement": {
        const verb = effect.verb || "push";
        const upTo = effect.upTo ? "up to " : "";
        return `${verb} ${upTo}${effect.distance || 0}`;
      }
      case "teleport":
        return `teleport ${effect.distance || 0}`;
      case "swap":
        return "swap places";
      case "abilityTest":
        return `${effect.label || "Test"} (${effect.attribute || "Strongest"})`;
      case "resourceGain": {
        const amount = effect.amount || 0;
        const sign = amount >= 0 ? "+" : "";
        return `${sign}${amount} ${effect.resource || "resource"}`;
      }
      case "surgeGain": {
        const amount = effect.amount || 0;
        const sign = amount >= 0 ? "+" : "";
        return `${sign}${amount} surge${Math.abs(amount) === 1 ? "" : "s"}`;
      }
      case "freeStrike":
        return effect.text ? `free strike — ${effect.text}` : "free strike";
      case "shift": {
        const distance = effect.distance === "speed" ? "speed" : effect.distance || 0;
        return `shift up to ${distance}`;
      }
      case "cascade":
        return `cascade → ${effect.ability || "another ability"}`;
      case "note":
        return effect.text || "(note)";
      case "potency": {
        const inner = (effect.onFail || []).map(describeEffect).filter(Boolean).join(", ");
        return `${effect.attribute || "?"}<${effect.level || "?"} → ${inner || "(no effect)"}`;
      }
      case "spend": {
        const inner = (effect.effects || []).map(describeEffect).filter(Boolean).join(", ");
        return `Spend ${effect.amount || 1} ${effect.resource || ""}: ${inner}`;
      }
      case "ifStrained": {
        const thenText = (effect.then || []).map(describeEffect).filter(Boolean).join(", ");
        const elseText = (effect.else || []).map(describeEffect).filter(Boolean).join(", ");
        if (elseText) return `If strained → ${thenText || "(no effect)"} else → ${elseText}`;
        return `If strained → ${thenText || "(no effect)"}`;
      }
      case "ifPrompt": {
        const thenText = (effect.then || []).map(describeEffect).filter(Boolean).join(", ");
        const elseText = (effect.else || []).map(describeEffect).filter(Boolean).join(", ");
        const question = effect.question || "Confirm?";
        if (elseText) return `Ask "${question}" -> yes: ${thenText || "(no effect)"}; no: ${elseText}`;
        return `Ask "${question}" -> yes: ${thenText || "(no effect)"}`;
      }
      case "ifMark": {
        const thenText = (effect.then || []).map(describeEffect).filter(Boolean).join(", ");
        const elseText = (effect.else || []).map(describeEffect).filter(Boolean).join(", ");
        const label = effect.predicate || "targetJudgedBySelf";
        if (elseText) return `If ${label}: ${thenText || "(no effect)"} else: ${elseText}`;
        return `If ${label}: ${thenText || "(no effect)"}`;
      }
      case "applyMark":
        return `apply ${effect.markType || "mark"}`;
      case "endMark":
        return `end ${effect.markType || "mark"}`;
      case "halveTriggeringDamage":
        return "halve the triggering damage";
      case "other":
        return effect.text || "(other)";
      default:
        return effect.kind ? `(${effect.kind})` : "";
    }
  }

  // Describe an effect WITH character context. Resolves attribute bonuses and
  // potency thresholds to integers. Used by the runner's tier preview and the
  // inspector when a hero is supplied.
  function describeEffectResolved(effect, ctx) {
    if (!effect || typeof effect !== "object") return "";
    if (!ctx) return describeEffect(effect);
    switch (effect.kind) {
      case "damage": {
        const total = resolveDamageAmount(effect, ctx);
        const type = effect.damageType && effect.damageType !== "untyped" ? ` ${effect.damageType}` : "";
        return `${total}${type} damage`;
      }
      case "potency": {
        const threshold = resolvePotencyThreshold(effect.level, ctx);
        const inner = (effect.onFail || []).map((eff) => describeEffectResolved(eff, ctx)).filter(Boolean).join(", ");
        const tag = threshold !== null ? `${effect.attribute || "?"}<${threshold}` : `${effect.attribute || "?"}<${effect.level || "?"}`;
        return `${tag} → ${inner || "(no effect)"}`;
      }
      case "spend": {
        const inner = (effect.effects || []).map((eff) => describeEffectResolved(eff, ctx)).filter(Boolean).join(", ");
        return `Spend ${effect.amount || 1} ${effect.resource || ""}: ${inner}`;
      }
      // Everything else has no character-dependent fields — fall back to the raw form.
      default:
        return describeEffect(effect);
    }
  }

  global.AbilityAutomationPrimitives = {
    BLOCK_TYPES,
    EFFECT_KINDS,
    ATTRIBUTES,
    ATTRIBUTE_SHORT,
    POTENCY_LEVELS,
    DAMAGE_TYPES,
    CONDITIONS,
    NUMERIC_CONDITIONS,
    DURATIONS,
    FORCED_MOVEMENT_VERBS,
    TARGET_PREDICATES,
    TARGET_MODES,
    AREA_SHAPES,
    DISTANCE_FORMS,
    SPEND_TIMINGS,
    TIER_KEYS,
    TIER_RANGES,
    LEGACY_TIER_KEYS,
    normalizeAttribute,
    normalizeAttributeOrList,
    normalizeDamageType,
    normalizeCondition,
    normalizeDuration,
    normalizePotencyLevel,
    normalizeForcedMovementVerb,
    normalizeTargetPredicate,
    normalizeTierKey,
    tierLabel,
    tierFromTotal,
    shiftTierKey,
    describeEffect,
    describeEffectResolved,
    resolveDamageAmount,
    resolvePotencyThreshold,
    KEYWORDS,
    normalizeKeyword,
    normalizeKeywordList,
    keywordsMatch,
  };
})(window);
