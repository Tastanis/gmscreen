(function () {
  "use strict";

  const actions = new Map();

  function formatTarget(targetName) {
    const trimmed = String(targetName || "").trim();
    return trimmed || "the selected target";
  }

  function registerAction(type, action) {
    if (!type || !action || typeof action.execute !== "function") return;
    actions.set(type, action);
  }

  function getAction(type) {
    return actions.get(type) || null;
  }

  async function executeAction(card, context) {
    const action = getAction(card?.type);
    if (!action) {
      return {
        ok: true,
        skipped: true,
        message: `No executable action registered for ${card?.type || "unknown card"}.`,
      };
    }
    return action.execute(card, context || {});
  }

  registerAction("dealStaminaDamage", {
    label: "Deal Stamina Damage",
    execute(card, context) {
      const tier = context.selectedTierData || {};
      const damage = String(tier.damage || "").trim();
      const damageType = String(tier.damageType || "").trim();
      const effect = String(tier.effect || "").trim();
      const note = String(card?.data?.note || "").trim();
      const target = formatTarget(context.targetName);
      const heroName = context.heroName || "Hero";
      const abilityName = context.abilityName || "Ability";

      if (!damage) {
        return {
          ok: false,
          message: `${abilityName} has no ${context.selectedTier || "selected"} tier stamina damage configured.`,
        };
      }

      const parts = [`${heroName} uses ${abilityName}: ${target} takes ${damage}${damageType ? ` ${damageType}` : ""} stamina damage.`];
      if (effect) parts.push(`Tier effect: ${effect}`);
      if (note) parts.push(note);

      return {
        ok: true,
        damage,
        damageType,
        target,
        message: parts.join("\n"),
      };
    },
  });

  registerAction("action", {
    label: "Action",
    execute(card, context) {
      if (card?.data?.actionType === "dealStaminaDamage") {
        return getAction("dealStaminaDamage").execute(card, context);
      }
      return {
        ok: true,
        skipped: true,
        message: "",
      };
    },
  });

  window.AbilityAutomationActions = {
    registerAction,
    getAction,
    executeAction,
  };
})();
