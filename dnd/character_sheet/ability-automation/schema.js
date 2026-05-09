(function () {
  "use strict";

  const AUTOMATION_SCHEMA_VERSION = 1;
  const AUTOMATION_SCHEMA_ID = "ability-automation/v1";
  const TIER_KEYS = ["low", "mid", "high"];

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function emptyTier() {
    return {
      range: "",
      damage: "",
      damageType: "",
      effect: "",
    };
  }

  function tierRange(key) {
    if (key === "low") return "<= 11";
    if (key === "mid") return "12-16";
    return "17+";
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
          },
        },
        {
          id: createId("card"),
          type: "powerRollDamage",
          data: {
            rollFormula: "2d10",
            attribute: "Might",
            bonus: "",
            tiers: {
              low: { ...emptyTier(), range: tierRange("low") },
              mid: { ...emptyTier(), range: "12-16" },
              high: { ...emptyTier(), range: "17+" },
            },
          },
        },
        {
          id: createId("card"),
          type: "dealStaminaDamage",
          data: {
            source: "selectedPowerRollTier",
            target: "selectedTarget",
            note: "",
          },
        },
      ],
    };
  }

  function normalizeCard(card) {
    const id = card?.id || createId("card");
    const type = card?.type || "target";
    const data = card?.data && typeof card.data === "object" ? card.data : {};

    if (type === "powerRollDamage") {
      const tiers = data.tiers && typeof data.tiers === "object" ? data.tiers : {};
      return {
        id,
        type,
        data: {
          rollFormula: data.rollFormula || "2d10",
          attribute: data.attribute || "Might",
          bonus: data.bonus || "",
          tiers: Object.fromEntries(
            TIER_KEYS.map((key) => [
              key,
              {
                ...emptyTier(),
                range: tierRange(key),
                ...(tiers[key] || {}),
              },
            ])
          ),
        },
      };
    }

    if (type === "note") {
      return {
        id,
        type,
        data: {
          text: data.text || "",
        },
      };
    }

    if (type === "dealStaminaDamage") {
      return {
        id,
        type,
        data: {
          source: data.source || "selectedPowerRollTier",
          target: data.target || "selectedTarget",
          note: data.note || "",
        },
      };
    }

    return {
      id,
      type: "target",
      data: {
        count: data.count || "one",
        creature: data.creature || "enemy",
        within: data.within || "",
      },
    };
  }

  function normalizeAutomation(input) {
    if (!input || typeof input !== "object") {
      return defaultAutomation();
    }

    const cards = Array.isArray(input.cards) ? input.cards.map(normalizeCard) : [];
    return {
      schema: input.schema || AUTOMATION_SCHEMA_ID,
      version: Number(input.version) || AUTOMATION_SCHEMA_VERSION,
      cards: cards.length ? cards : defaultAutomation().cards,
    };
  }

  function hasAutomation(input) {
    return Boolean(input && typeof input === "object" && Array.isArray(input.cards) && input.cards.length);
  }

  function validateAutomation(input) {
    const automation = normalizeAutomation(input);
    const warnings = [];
    const hasTarget = automation.cards.some((card) => card.type === "target");
    const powerRollCards = automation.cards.filter((card) => card.type === "powerRollDamage");
    const hasDamageAction = automation.cards.some((card) => card.type === "dealStaminaDamage");

    if (!hasTarget) {
      warnings.push("Add a target card so play mode will know who the ability affects later.");
    }

    if (!powerRollCards.length) {
      warnings.push("Add a power roll damage card to describe tiered damage.");
    }

    if (powerRollCards.length && !hasDamageAction) {
      warnings.push("Add a deal stamina damage card if this power roll should apply tier damage in play mode.");
    }

    powerRollCards.forEach((card, index) => {
      if (!card.data.attribute) {
        warnings.push(`Power roll card ${index + 1} is missing an attribute.`);
      }
      TIER_KEYS.forEach((key) => {
        const tier = card.data.tiers[key];
        if (!tier.damage) {
          warnings.push(`Power roll card ${index + 1} ${key} tier has no damage value.`);
        }
      });
    });

    return warnings;
  }

  window.AbilityAutomationSchema = {
    AUTOMATION_SCHEMA_ID,
    AUTOMATION_SCHEMA_VERSION,
    TIER_KEYS,
    createId,
    tierRange,
    defaultAutomation,
    normalizeAutomation,
    validateAutomation,
    hasAutomation,
  };
})();
