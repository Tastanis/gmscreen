(function () {
  "use strict";

  const RUNNER_ID = "ability-automation-runner";
  const schema = window.AbilityAutomationSchema;
  const actions = window.AbilityAutomationActions;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function closeRunner() {
    document.getElementById(RUNNER_ID)?.remove();
  }

  function tierLabel(key) {
    if (key === "low") return "<= 11";
    if (key === "mid") return "12-16";
    return "17+";
  }

  function getTierKey(total) {
    if (total <= 11) return "low";
    if (total <= 16) return "mid";
    return "high";
  }

  function parseInteger(value) {
    const parsed = parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function rollFormula(formula) {
    const clean = String(formula || "2d10").replace(/\s+/g, "").toLowerCase();
    const match = clean.match(/^(\d*)d(\d+)$/);
    const count = match ? parseInt(match[1] || "1", 10) : 2;
    const sides = match ? parseInt(match[2], 10) : 10;
    const rolls = [];
    for (let index = 0; index < Math.max(1, count); index += 1) {
      rolls.push(Math.floor(Math.random() * Math.max(1, sides)) + 1);
    }
    return {
      notation: match ? `${count}d${sides}` : "2d10",
      rolls,
      total: rolls.reduce((sum, roll) => sum + roll, 0),
    };
  }

  function findPowerRollCard(automation) {
    return (automation.cards || []).find((card) => card.type === "powerRollDamage") || null;
  }

  function findTargetCard(automation) {
    return (automation.cards || []).find((card) => card.type === "target") || null;
  }

  function renderTierCards(powerRollCard, selectedTier, hasRolled) {
    const tiers = powerRollCard?.data?.tiers || {};
    return schema.TIER_KEYS.map((key) => {
      const tier = tiers[key] || {};
      const parts = [];
      if (tier.damage || tier.damageType) parts.push(`${tier.damage || "-"} ${tier.damageType || ""}`.trim());
      if (tier.effect) parts.push(tier.effect);
      return `
        <button
          class="power-roll-runner__tier ${selectedTier === key ? "power-roll-runner__tier--selected" : ""}"
          type="button"
          data-select-tier="${key}"
          ${hasRolled ? "" : "disabled"}
        >
          <span class="power-roll-runner__tier-range">${tierLabel(key)}</span>
          <span class="power-roll-runner__tier-body">${escapeHtml(parts.join(" | ") || "No result configured")}</span>
        </button>
      `;
    }).join("");
  }

  async function postChat(context, entry) {
    if (context && typeof context.postChat === "function") {
      return context.postChat(entry);
    }

    if (window.dashboardChat && typeof window.dashboardChat.sendMessage === "function") {
      return window.dashboardChat.sendMessage({
        message: entry.message || "",
        type: entry.type || "text",
        payload: entry.payload || null,
      });
    }

    const params = new URLSearchParams();
    params.append("action", "chat_send");
    params.append("message", entry.message || "");
    if (entry.type && entry.type !== "text") params.append("type", entry.type);
    if (entry.payload) params.append("payload", JSON.stringify(entry.payload));

    const response = await fetch(window.chatHandlerUrl || "/dnd/chat_handler.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await response.json();
    return Boolean(data && data.success);
  }

  function setResult(panel, text, ok) {
    const result = panel.querySelector("[data-power-roll-result]");
    if (!result) return;
    result.textContent = text;
    result.classList.toggle("power-roll-runner__log--error", ok === false);
  }

  function render(panel, state) {
    const powerRollCard = state.powerRollCard;
    const action = state.action || {};
    const targetCard = state.targetCard;
    const attribute = powerRollCard?.data?.attribute || "Might";
    const attributeBonus = parseInteger(state.context.getAttributeBonus?.(attribute));
    const bonus = parseInteger(powerRollCard?.data?.bonus);
    const total = state.roll ? state.roll.total + attributeBonus + bonus : null;
    const expression = `${powerRollCard?.data?.rollFormula || "2d10"} + ${attribute}${bonus ? ` + ${bonus}` : ""}`;

    panel.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(action.description || "No ability text entered.")}</p>
          <div class="power-roll-runner__meta">
            ${action.range ? `<span>Range: ${escapeHtml(action.range)}</span>` : ""}
            ${action.target ? `<span>Target: ${escapeHtml(action.target)}</span>` : ""}
            ${action.cost ? `<span>Cost: ${escapeHtml(action.cost)}</span>` : ""}
            ${targetCard ? `<span>Automation target: ${escapeHtml(targetCard.data.count)} ${escapeHtml(targetCard.data.creature)} ${escapeHtml(targetCard.data.within || "")}</span>` : ""}
          </div>
          <label class="power-roll-runner__target">
            <span>Target enemy</span>
            <input type="text" data-power-roll-target value="${escapeHtml(state.targetName)}" placeholder="Enemy name or token" />
          </label>
        </div>
      </section>
      <section class="power-roll-runner__dice" aria-live="polite">
        <div class="power-roll-runner__screen">
          <span class="power-roll-runner__expression">${escapeHtml(expression)}</span>
          <strong>${total === null ? "--" : total}</strong>
          <span>${state.roll ? `Dice: ${state.roll.rolls.join(" + ")} | ${attribute} ${attributeBonus >= 0 ? "+" : ""}${attributeBonus}` : "Ready"}</span>
        </div>
        <div class="power-roll-runner__controls">
          <button class="dice-roll-btn" type="button" data-power-roll-roll>${state.roll ? "Reroll" : "Roll"}</button>
          <button class="dice-clear-btn" type="button" data-close-power-roll>Cancel</button>
          <button class="dice-project-roll-btn" type="button" data-power-roll-accept ${state.roll ? "" : "disabled"}>Accept</button>
        </div>
      </section>
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__tiers">
          ${renderTierCards(powerRollCard, state.selectedTier, Boolean(state.roll))}
        </div>
        <div class="power-roll-runner__details">
          <strong>Additional details</strong>
          <p>Effects, conditions, and follow-up choices will land here as automation grows.</p>
        </div>
      </section>
      <pre class="power-roll-runner__log" data-power-roll-result>${escapeHtml(state.resultText || "Roll, pick a tier if needed, then accept to run automation.")}</pre>
    `;
  }

  async function rollPower(panel, state) {
    const targetInput = panel.querySelector("[data-power-roll-target]");
    state.targetName = targetInput?.value || state.targetName;
    state.roll = rollFormula(state.powerRollCard?.data?.rollFormula || "2d10");
    const attribute = state.powerRollCard?.data?.attribute || "Might";
    const attributeBonus = parseInteger(state.context.getAttributeBonus?.(attribute));
    const bonus = parseInteger(state.powerRollCard?.data?.bonus);
    const total = state.roll.total + attributeBonus + bonus;
    state.selectedTier = getTierKey(total);
    state.manualTier = false;
    state.resultText = `Rolled ${total}. Auto-selected ${tierLabel(state.selectedTier)}.`;

    const numericModifiers = [
      attributeBonus ? `${attributeBonus >= 0 ? "+" : "-"} ${Math.abs(attributeBonus)}` : "",
      bonus ? `${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "",
    ].filter(Boolean);
    const expression = [state.roll.notation, ...numericModifiers].join(" ");
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Power Roll"} rolled ${total} (${tierLabel(state.selectedTier)}).`,
      type: "dice_roll",
      payload: {
        expression,
        components: [state.roll.notation, ...numericModifiers],
        breakdown: [
          { type: "dice", notation: state.roll.notation, rolls: state.roll.rolls, total: state.roll.total },
          ...(attributeBonus ? [{ type: "modifier", notation: numericModifiers[0], value: attributeBonus }] : []),
          ...(bonus ? [{ type: "modifier", notation: numericModifiers[attributeBonus ? 1 : 0], value: bonus }] : []),
        ],
        total,
      },
    });
    render(panel, state);
  }

  async function acceptAutomation(panel, state) {
    if (!state.roll || !state.selectedTier) {
      setResult(panel, "Roll before accepting.", false);
      return;
    }

    const targetInput = panel.querySelector("[data-power-roll-target]");
    state.targetName = targetInput?.value || state.targetName;
    const tierData = state.powerRollCard?.data?.tiers?.[state.selectedTier] || {};
    const executionContext = {
      heroName: state.heroName,
      abilityName: state.action.name || "Power Roll",
      targetName: state.targetName,
      selectedTier: state.selectedTier,
      selectedTierData: tierData,
      roll: state.roll,
      action: state.action,
    };
    const lines = [];

    for (const card of state.automation.cards || []) {
      if (card.type === "target") {
        lines.push(`Target: ${state.targetName || card.data.creature || "enemy"}`);
      } else if (card.type === "powerRollDamage") {
        lines.push(`Tier: ${tierLabel(state.selectedTier)}${state.manualTier ? " (manual override)" : ""}`);
      } else {
        const result = await actions.executeAction(card, executionContext);
        if (result?.message) lines.push(result.message);
      }
    }

    const message = lines.join("\n");
    state.resultText = message || "Automation ran with no executable effects.";
    await postChat(state.context, { message: state.resultText, type: "text" });
    render(panel, state);
  }

  function open(options) {
    closeRunner();

    const automation = schema.normalizeAutomation(options?.automation);
    const powerRollCard = findPowerRollCard(automation);
    if (!powerRollCard) {
      console.warn("No power roll automation card was found.");
      return;
    }

    const host = document.createElement("div");
    host.id = RUNNER_ID;
    host.className = "power-roll-runner";
    host.innerHTML = `
      <div class="power-roll-runner__modal" role="dialog" aria-modal="true" aria-labelledby="power-roll-title">
        <header class="modal__header power-roll-runner__header">
          <div>
            <p class="automation-builder__eyebrow">${escapeHtml(options?.actionType || "Action")}</p>
            <h2 class="modal__title" id="power-roll-title">Power Roll</h2>
          </div>
          <button class="icon-btn" type="button" data-close-power-roll aria-label="Close power roll">X</button>
        </header>
        <div class="power-roll-runner__body" data-power-roll-body></div>
      </div>
    `;

    const state = {
      action: options?.action || {},
      actionType: options?.actionType || "",
      automation,
      context: options || {},
      heroName: options?.hero?.name || "Hero",
      targetCard: findTargetCard(automation),
      powerRollCard,
      targetName: "",
      selectedTier: null,
      manualTier: false,
      roll: null,
      resultText: "",
    };

    document.body.appendChild(host);
    render(host, state);

    host.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target === host || target.closest("[data-close-power-roll]")) {
        closeRunner();
        return;
      }
      if (target.closest("[data-power-roll-roll]")) {
        await rollPower(host, state);
        return;
      }
      const tierButton = target.closest("[data-select-tier]");
      if (tierButton && state.roll) {
        state.selectedTier = tierButton.getAttribute("data-select-tier");
        state.manualTier = true;
        state.resultText = `Manual tier selected: ${tierLabel(state.selectedTier)}.`;
        render(host, state);
        return;
      }
      if (target.closest("[data-power-roll-accept]")) {
        await acceptAutomation(host, state);
      }
    });

    host.addEventListener("input", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.matches("[data-power-roll-target]")) {
        state.targetName = target.value;
      }
    });
  }

  window.AbilityAutomationRunner = { open };
})();
