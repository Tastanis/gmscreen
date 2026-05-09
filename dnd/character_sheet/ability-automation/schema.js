(function () {
  "use strict";

  const AUTOMATION_SCHEMA_VERSION = 2;
  const AUTOMATION_SCHEMA_ID = "ability-automation/v2";
  const TIER_KEYS = ["low", "mid", "high"];
  const ACTION_TYPES = ["powerRoll", "dealStaminaDamage", "push", "note"];
  const catalog = window.AbilityAutomationCatalog;

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function emptyTier() {
    return {
      range: "",
      damage: "",
      damageType: "",
      effect: "",
      effects: [],
    };
  }

  function tierRange(key) {
    if (key === "low") return "<= 11";
    if (key === "mid") return "12-16";
    return "17+";
  }

  function defaultPowerRollData(data = {}) {
    const tiers = data.tiers && typeof data.tiers === "object" ? data.tiers : {};
    return {
      actionType: "powerRoll",
      rollFormula: data.rollFormula || "2d10",
      attribute: data.attribute || "Might",
      bonus: data.bonus || "",
      edges: data.edges || "",
      banes: data.banes || "",
      tiers: Object.fromEntries(
        TIER_KEYS.map((key) => {
          const tier = {
            ...emptyTier(),
            range: tierRange(key),
            ...(tiers[key] || {}),
          };
          tier.effects = catalog?.getTierEffects ? catalog.getTierEffects(tier) : Array.isArray(tier.effects) ? tier.effects : [];
          return [key, tier];
        })
      ),
    };
  }

  function defaultDealStaminaDamageData(data = {}) {
    return {
      actionType: "dealStaminaDamage",
      source: data.source || "selectedPowerRollTier",
      target: data.target || "selectedTarget",
      note: data.note || "",
    };
  }

  function defaultNoteData(data = {}) {
    return {
      actionType: "note",
      text: data.text || "",
    };
  }

  function defaultPushData(data = {}) {
    return {
      actionType: "push",
      source: data.source || "selectedPowerRollTier",
      target: data.target || "selectedTarget",
      collisionDamageType: data.collisionDamageType || "",
      note: data.note || "",
    };
  }

  function normalizeActionData(data = {}) {
    const actionType = ACTION_TYPES.includes(data.actionType) ? data.actionType : "powerRoll";
    if (actionType === "dealStaminaDamage") return defaultDealStaminaDamageData(data);
    if (actionType === "push") return defaultPushData(data);
    if (actionType === "note") return defaultNoteData(data);
    return defaultPowerRollData(data);
  }

  function createActionCard(actionType = "powerRoll") {
    return normalizeCard({
      type: "action",
      data: { actionType },
    });
  }

  function defaultAutomation() {
    return {
      schema: AUTOMATION_SCHEMA_ID,
      version: AUTOMATION_SCHEMA_VERSION,
      cards: [
        {
          id: createId("card"),
          type: "target",
          data: {
            count: "one",
            creature: "enemy",
            within: "",
            optional: false,
          },
        },
        createActionCard("powerRoll"),
        createActionCard("dealStaminaDamage"),
      ],
    };
  }

  function normalizeCard(card) {
    const id = card?.id || createId("card");
    const type = card?.type || "target";
    const data = card?.data && typeof card.data === "object" ? card.data : {};

    if (type === "powerRollDamage") {
      return {
        id,
        type: "action",
        data: defaultPowerRollData(data),
      };
    }

    if (type === "dealStaminaDamage") {
      return {
        id,
        type: "action",
        data: defaultDealStaminaDamageData(data),
      };
    }

    if (type === "push") {
      return {
        id,
        type: "action",
        data: defaultPushData(data),
      };
    }

    if (type === "note") {
      return {
        id,
        type: "action",
        data: defaultNoteData(data),
      };
    }

    if (type === "action") {
      return {
        id,
        type,
        data: normalizeActionData(data),
      };
    }

    return {
      id,
      type: "target",
      data: {
        count: data.count || "one",
        creature: data.creature || "enemy",
        within: data.within || "",
        optional: Boolean(data.optional),
      },
    };
  }

  function normalizeAutomation(input) {
    if (!input || typeof input !== "object") {
      return defaultAutomation();
    }

    const cards = Array.isArray(input.cards) ? input.cards.map(normalizeCard) : [];
    return {
      schema: AUTOMATION_SCHEMA_ID,
      version: AUTOMATION_SCHEMA_VERSION,
      cards: cards.length ? cards : defaultAutomation().cards,
    };
  }

  function hasAutomation(input) {
    return Boolean(input && typeof input === "object" && Array.isArray(input.cards) && input.cards.length);
  }

  function validateAutomation(input) {
    const automation = normalizeAutomation(input);
    const warnings = [];
    const targetCards = automation.cards.filter((card) => card.type === "target");
    const actionCards = automation.cards.filter((card) => card.type === "action");
    const powerRollCards = actionCards.filter((card) => card.data.actionType === "powerRoll");
    const hasDamageAction = actionCards.some((card) => card.data.actionType === "dealStaminaDamage");
    const hasPushAction = actionCards.some((card) => card.data.actionType === "push");

    if (!targetCards.length) {
      warnings.push("Add a target card if this ability needs a token selected before it resolves.");
    }

    if (!actionCards.length) {
      warnings.push("Add at least one action card so the automation has something to do.");
    }

    if (powerRollCards.length && !hasDamageAction && !hasPushAction) {
      warnings.push("Add a damage, push, or other action after the power roll so the selected tier does something.");
    }

    powerRollCards.forEach((card, index) => {
      if (!card.data.attribute) {
        warnings.push(`Power roll action ${index + 1} is missing an attribute.`);
      }
      TIER_KEYS.forEach((key) => {
        const tier = card.data.tiers[key];
        const hasOutput = catalog?.hasTierOutput ? catalog.hasTierOutput(tier) : Boolean(tier.damage || tier.effect);
        if (!hasOutput) {
          warnings.push(`Power roll action ${index + 1} ${key} tier has no result configured.`);
        }
      });
    });

    return warnings;
  }

  function summarizeCard(card) {
    const normalized = normalizeCard(card);
    if (normalized.type === "target") {
      const data = normalized.data;
      const parts = [`Pick ${data.count} ${data.creature}`];
      if (data.within) parts.push(data.within);
      if (data.optional) parts.push("(optional)");
      return parts.join(" ");
    }

    if (normalized.data.actionType === "powerRoll") {
      return `Roll ${normalized.data.rollFormula} + ${normalized.data.attribute}.`;
    }

    if (normalized.data.actionType === "dealStaminaDamage") {
      return "Deal the selected power-roll tier damage to the selected target.";
    }

    if (normalized.data.actionType === "push") {
      return "Push the selected target using the selected power-roll tier.";
    }

    return normalized.data.text || "Automation note.";
  }

  window.AbilityAutomationSchema = {
    AUTOMATION_SCHEMA_ID,
    AUTOMATION_SCHEMA_VERSION,
    ACTION_TYPES,
    TIER_KEYS,
    createId,
    tierRange,
    defaultAutomation,
    createActionCard,
    normalizeAutomation,
    normalizeCard,
    validateAutomation,
    hasAutomation,
    summarizeCard,
  };
})();
