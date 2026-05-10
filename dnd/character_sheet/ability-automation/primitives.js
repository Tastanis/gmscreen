// Ability Automation — Registry of vocabulary used by schema, runner, paste UI,
// and inspector. Single source of truth for every enum the JSON references.
//
// When adding a new effect kind, condition, damage type, etc., add it here first.
// Then update AUTHORING.md and REGISTRY.md so LLM-authored JSON stays in sync.

(function (global) {
  "use strict";

  const BLOCK_TYPES = ["target", "powerRoll", "effect", "trigger", "persistent"];

  const EFFECT_KINDS = [
    "damage",
    "heal",
    "temporaryStamina",
    "condition",
    "forcedMovement",
    "teleport",
    "swap",
    "resourceGain",
    "freeStrike",
    "cascade",
    "note",
    "potency",
    "spend",
    "other",
  ];

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
    "other",
  ];

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

  function normalizeDamageType(value) {
    if (!value) return "untyped";
    const lower = String(value).trim().toLowerCase();
    if (!lower) return "untyped";
    return lower;
  }

  function normalizeCondition(value) {
    if (!value) return "";
    const lower = String(value).trim().toLowerCase();
    if (!lower) return "";
    return CONDITIONS.includes(lower) ? lower : "other";
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
      case "resourceGain": {
        const amount = effect.amount || 0;
        const sign = amount >= 0 ? "+" : "";
        return `${sign}${amount} ${effect.resource || "resource"}`;
      }
      case "freeStrike":
        return effect.text ? `free strike — ${effect.text}` : "free strike";
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
      case "other":
        return effect.text || "(other)";
      default:
        return effect.kind ? `(${effect.kind})` : "";
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
  };
})(window);
