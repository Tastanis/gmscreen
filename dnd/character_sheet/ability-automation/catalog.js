(function () {
  "use strict";

  const DAMAGE_TYPES = [
    "acid",
    "cold",
    "corruption",
    "fire",
    "holy",
    "lightning",
    "poison",
    "psychic",
    "sonic",
    "void",
  ];

  const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence"];
  const GENERIC_DAMAGE_TYPES = ["", "untyped", "all", "any"];
  const SAVE_ENDS_ALIASES = ["se", "save ends", "save end"];
  const END_OF_TURN_ALIASES = ["eot", "end of turn", "end of next turn"];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeToken(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeDamageType(value) {
    const normalized = normalizeToken(value);
    if (GENERIC_DAMAGE_TYPES.includes(normalized)) return "";
    return DAMAGE_TYPES.includes(normalized) ? normalized : normalized;
  }

  function parseInteger(value) {
    const parsed = parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseDamageExpression(text) {
    const source = String(text || "").trim();
    if (!source) return null;
    const typePattern = DAMAGE_TYPES.map(escapeRegExp).join("|");
    const attrPattern = ATTRIBUTES.map(escapeRegExp).join("|");
    const match = source.match(new RegExp(`^(-?\\d+)(?:\\s*\\+\\s*(${attrPattern}))?(?:\\s+(${typePattern}))?(?:\\s+damage)?$`, "i"));
    if (!match) return null;
    return {
      kind: "damage",
      amount: parseInteger(match[1]) || 0,
      attribute: match[2] || "",
      damageType: normalizeDamageType(match[3] || ""),
      raw: source,
    };
  }

  function parsePushExpression(text) {
    const match = String(text || "").trim().match(/^push\s+(-?\d+)$/i);
    if (!match) return null;
    return {
      kind: "push",
      distance: Math.max(0, parseInteger(match[1]) || 0),
      raw: String(text || "").trim(),
    };
  }

  function parseConditionExpression(text) {
    const source = String(text || "").trim();
    if (!source) return null;
    const lower = normalizeToken(source);
    const duration = SAVE_ENDS_ALIASES.some((alias) => lower.includes(alias))
      ? "saveEnds"
      : END_OF_TURN_ALIASES.some((alias) => lower.includes(alias))
        ? "endOfTurn"
        : "";
    const name = source
      .replace(/\(([^)]*)\)/g, "")
      .replace(/\b(SE|EOT|save ends|end of turn|end of next turn)\b/gi, "")
      .trim();
    if (!name) return null;
    return {
      kind: "condition",
      name,
      duration,
      raw: source,
    };
  }

  function splitEffectText(text) {
    return String(text || "")
      .split(/\s*(?:;|\n|\|)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function parseEffectText(text) {
    const effects = [];
    splitEffectText(text).forEach((part) => {
      const push = parsePushExpression(part);
      if (push) {
        effects.push(push);
        return;
      }
      const damage = parseDamageExpression(part);
      if (damage) {
        effects.push(damage);
        return;
      }
      const condition = parseConditionExpression(part);
      if (condition) effects.push(condition);
    });
    return effects;
  }

  function getTierEffects(tier = {}) {
    const effects = [];
    const damage = parseDamageExpression(`${tier.damage || ""}${tier.damageType ? ` ${tier.damageType}` : ""}`);
    if (damage) effects.push(damage);
    if (Array.isArray(tier.effects)) {
      tier.effects.forEach((effect) => {
        if (!effect || typeof effect !== "object") return;
        if (effect.kind === "damage" && effects.some((existing) => existing.kind === "damage")) return;
        effects.push(normalizeEffect(effect));
      });
    }
    parseEffectText(tier.effect || "").forEach((effect) => {
      if (effect.kind === "damage" && effects.some((existing) => existing.kind === "damage")) return;
      effects.push(effect);
    });
    return effects;
  }

  function normalizeEffect(effect = {}) {
    if (effect.kind === "damage") {
      return {
        kind: "damage",
        amount: parseInteger(effect.amount) || 0,
        attribute: effect.attribute || "",
        damageType: normalizeDamageType(effect.damageType || ""),
        raw: effect.raw || "",
      };
    }
    if (effect.kind === "push") {
      return {
        kind: "push",
        distance: Math.max(0, parseInteger(effect.distance) || 0),
        raw: effect.raw || "",
      };
    }
    if (effect.kind === "condition") {
      return {
        kind: "condition",
        name: effect.name || "",
        duration: effect.duration || "",
        raw: effect.raw || "",
      };
    }
    return { ...effect };
  }

  function getFirstTierEffect(tier, kind) {
    return getTierEffects(tier).find((effect) => effect.kind === kind) || null;
  }

  function hasTierOutput(tier = {}) {
    if (String(tier.damage || "").trim()) return true;
    if (String(tier.effect || "").trim()) return true;
    return getTierEffects(tier).length > 0;
  }

  function describeEffect(effect) {
    if (!effect) return "";
    if (effect.kind === "damage") {
      const attr = effect.attribute ? ` + ${effect.attribute}` : "";
      const type = effect.damageType ? ` ${effect.damageType}` : "";
      return `${effect.amount}${attr}${type} damage`;
    }
    if (effect.kind === "push") return `Push ${effect.distance}`;
    if (effect.kind === "condition") {
      const duration = effect.duration === "saveEnds" ? " SE" : effect.duration === "endOfTurn" ? " EOT" : "";
      return `${effect.name}${duration}`;
    }
    return effect.raw || "";
  }

  window.AbilityAutomationCatalog = {
    ATTRIBUTES,
    DAMAGE_TYPES,
    GENERIC_DAMAGE_TYPES,
    getTierEffects,
    getFirstTierEffect,
    hasTierOutput,
    parseDamageExpression,
    parseEffectText,
    parsePushExpression,
    describeEffect,
    normalizeDamageType,
  };
})();
