// Ability Automation — combined paste field map.
//
// JSON keys are camelCase. Setters write to the existing action-card controls
// and dispatch normal edit events so the sheet's capture/save flow sees them.

(function (global) {
  "use strict";

  function dispatchEditEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function coerceValue(value, type) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(", ");
    if (type === "multiline") return String(value).replace(/\r\n/g, "\n");
    return String(value);
  }

  function setValue(el, value, entry) {
    if (!el) return false;
    const next = coerceValue(value, entry.type);
    if (el.isContentEditable) {
      el.innerHTML = next;
    } else if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else {
      el.value = next;
    }
    dispatchEditEvents(el);
    return true;
  }

  function query(card, selector) {
    return card?.querySelector(selector) || null;
  }

  function firstTest(card) {
    return card?.querySelector(".test") || null;
  }

  function ensureFirstTest(actionId, actionType, fields) {
    const needsTest = Object.keys(fields || {}).some((rawKey) => {
      const entry = FIELD_LOOKUP.get(String(rawKey).toLowerCase());
      return entry && TEST_FIELD_KEYS.has(entry.key);
    });
    if (!needsTest) return getActionCard(actionId, actionType);

    let card = getActionCard(actionId, actionType);
    if (!card || firstTest(card)) return card;

    const addButton = card.querySelector("[data-add-test]");
    if (!addButton) return card;
    addButton.click();

    return getActionCard(actionId, actionType) || card;
  }

  function firstTier(card, tier) {
    return firstTest(card)?.querySelector(`.test-tier[data-tier="${tier}"]`) || null;
  }

  function field(key, selector, description, example, options = {}) {
    return {
      key,
      selector,
      type: options.type || "string",
      aliases: options.aliases || [],
      description,
      example,
      getter: options.getter || ((card) => query(card, selector)),
      setter: options.setter || ((card, value, entry) => setValue(entry.getter(card), value, entry)),
    };
  }

  function testField(key, selector, description, example, options = {}) {
    return field(key, selector, description, example, {
      ...options,
      getter: options.getter || ((card) => query(firstTest(card), selector)),
    });
  }

  function tierField(key, tier, selector, description, example, options = {}) {
    return field(key, selector, description, example, {
      ...options,
      getter: options.getter || ((card) => query(firstTier(card, tier), selector)),
    });
  }

  const FIELD_MAP = [
    field("name", '[data-field="name"]', "Ability name.", "Driving Assault", { aliases: ["title"] }),
    field("useWhen", '[data-field="useWhen"]', "Short reminder for when to use the ability.", "Use when an enemy is adjacent.", { aliases: ["whenToUse"] }),
    field("actionLabel", '[data-field="actionLabel"]', "Displayed action type label.", "Main Action", { aliases: ["actionType", "type"], type: "enum" }),
    field("keywords", '[data-field="tags"]', "Comma-separated ability keywords.", "Melee, Strike, Weapon", { aliases: ["tags"] }),
    field("range", '[data-field="range"]', "Range or distance line shown on the card.", "Melee 1", { aliases: ["distance"] }),
    field("target", '[data-field="target"]', "Target line shown on the card.", "One enemy", { aliases: ["targets"] }),
    field("trigger", '[data-field="trigger"]', "Trigger line for triggered actions.", "The target takes damage."),
    field("cost", '[data-field="cost"]', "Resource or heroic resource cost.", "1 Wrath"),
    field("description", '[data-field="description"]', "Main rules/effect text.", "You deal holy damage to the target.", { aliases: ["effect", "effects", "notes", "rulesText"], type: "multiline" }),

    testField("testLabel", '[data-test-field="label"]', "Label for the first power test.", "Power Roll + Might"),
    testField("testRollMod", '[data-test-field="rollMod"]', "Roll modifier for the first power test.", "Might", { aliases: ["rollMod"] }),
    testField("testBeforeEffect", '[data-test-field="beforeEffect"]', "Effects text before the first power test.", "Shift 1 before the strike.", { type: "multiline", aliases: ["beforeEffect"] }),
    testField("testAdditionalEffect", '[data-test-field="additionalEffect"]', "Effects text after the first power test.", "You can shift 1 after the strike.", { type: "multiline", aliases: ["additionalEffect", "afterEffect"] }),

    tierField("tier1Damage", "low", '[data-tier-field="damage"]', "First test tier 1 damage field.", "3 + M"),
    tierField("tier1DamageType", "low", '[data-tier-field="damageType"]', "First test tier 1 damage type.", "holy"),
    tierField("tier1Notes", "low", '[data-tier-field="notes"]', "First test tier 1 other info.", "push 1", { aliases: ["tier1Effect"] }),
    tierField("tier1Attribute", "low", '[data-tier-field="attribute"]', "First test tier 1 attribute-check attribute.", "Agility", { type: "enum" }),
    tierField("tier1Threshold", "low", '[data-tier-field="threshold"]', "First test tier 1 attribute-check threshold.", "11"),
    tierField("tier1AttributeEffect", "low", '[data-tier-field="attr-effect"]', "First test tier 1 attribute-check effect.", "prone"),

    tierField("tier2Damage", "mid", '[data-tier-field="damage"]', "First test tier 2 damage field.", "6 + M"),
    tierField("tier2DamageType", "mid", '[data-tier-field="damageType"]', "First test tier 2 damage type.", "holy"),
    tierField("tier2Notes", "mid", '[data-tier-field="notes"]', "First test tier 2 other info.", "push 2", { aliases: ["tier2Effect"] }),
    tierField("tier2Attribute", "mid", '[data-tier-field="attribute"]', "First test tier 2 attribute-check attribute.", "Agility", { type: "enum" }),
    tierField("tier2Threshold", "mid", '[data-tier-field="threshold"]', "First test tier 2 attribute-check threshold.", "14"),
    tierField("tier2AttributeEffect", "mid", '[data-tier-field="attr-effect"]', "First test tier 2 attribute-check effect.", "prone"),

    tierField("tier3Damage", "high", '[data-tier-field="damage"]', "First test tier 3 damage field.", "9 + M"),
    tierField("tier3DamageType", "high", '[data-tier-field="damageType"]', "First test tier 3 damage type.", "holy"),
    tierField("tier3Notes", "high", '[data-tier-field="notes"]', "First test tier 3 other info.", "push 4", { aliases: ["tier3Effect"] }),
    tierField("tier3Attribute", "high", '[data-tier-field="attribute"]', "First test tier 3 attribute-check attribute.", "Agility", { type: "enum" }),
    tierField("tier3Threshold", "high", '[data-tier-field="threshold"]', "First test tier 3 attribute-check threshold.", "17"),
    tierField("tier3AttributeEffect", "high", '[data-tier-field="attr-effect"]', "First test tier 3 attribute-check effect.", "prone and can't stand"),
  ];

  const FIELD_LOOKUP = new Map();
  for (const entry of FIELD_MAP) {
    FIELD_LOOKUP.set(entry.key.toLowerCase(), entry);
    for (const alias of entry.aliases || []) {
      FIELD_LOOKUP.set(String(alias).toLowerCase(), entry);
    }
  }

  const TEST_FIELD_KEYS = new Set(
    FIELD_MAP
      .filter((entry) => entry.key.startsWith("test") || /^tier\d/.test(entry.key))
      .map((entry) => entry.key)
  );

  function getActionCard(actionId, actionType) {
    if (!actionId || !actionType) return null;
    const escapedId = global.CSS?.escape ? global.CSS.escape(actionId) : String(actionId).replace(/"/g, '\\"');
    const escapedType = global.CSS?.escape ? global.CSS.escape(actionType) : String(actionType).replace(/"/g, '\\"');
    return document.querySelector(`.action-card[data-action-id="${escapedId}"][data-action-type="${escapedType}"]`);
  }

  function snapshotFields(actionId, actionType) {
    const card = getActionCard(actionId, actionType);
    const snapshot = {};
    if (!card) return snapshot;
    for (const entry of FIELD_MAP) {
      const el = entry.getter(card);
      if (!el) continue;
      snapshot[entry.key] = el.isContentEditable ? el.innerHTML : el.type === "checkbox" ? Boolean(el.checked) : el.value;
    }
    return snapshot;
  }

  function applyFields(actionId, actionType, fields) {
    const card = ensureFirstTest(actionId, actionType, fields);
    const result = { touched: [], unknown: [], missing: [] };
    if (!card || !fields || typeof fields !== "object") return result;
    for (const [rawKey, value] of Object.entries(fields)) {
      const entry = FIELD_LOOKUP.get(String(rawKey).toLowerCase());
      if (!entry) {
        result.unknown.push(rawKey);
        continue;
      }
      if (entry.setter(card, value, entry)) {
        result.touched.push(entry.key);
      } else {
        result.missing.push(entry.key);
      }
    }
    result.touched = [...new Set(result.touched)];
    result.missing = [...new Set(result.missing)];
    return result;
  }

  function restoreFields(actionId, actionType, snapshot, keys) {
    const values = {};
    for (const key of keys || Object.keys(snapshot || {})) {
      if (Object.prototype.hasOwnProperty.call(snapshot || {}, key)) {
        values[key] = snapshot[key];
      }
    }
    return applyFields(actionId, actionType, values);
  }

  global.AbilityAutomationFieldMap = {
    fields: FIELD_MAP,
    applyFields,
    restoreFields,
    snapshotFields,
  };
})(window);
