(function () {
  "use strict";

  const RUNNER_ID = "ability-automation-runner";
  const schema = window.AbilityAutomationSchema;

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

  function parseDamage(value) {
    const match = String(value || "").match(/-?\d+/);
    if (!match) return 0;
    return Math.max(0, parseInt(match[0], 10) || 0);
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

  function makeHost(title, eyebrow) {
    closeRunner();
    const host = document.createElement("div");
    host.id = RUNNER_ID;
    host.className = "power-roll-runner";
    host.innerHTML = `
      <div class="power-roll-runner__modal" role="dialog" aria-modal="true" aria-labelledby="power-roll-title">
        <header class="modal__header power-roll-runner__header">
          <div>
            <p class="automation-builder__eyebrow">${escapeHtml(eyebrow || "Automation")}</p>
            <h2 class="modal__title" id="power-roll-title">${escapeHtml(title || "Ability Automation")}</h2>
          </div>
          <button class="icon-btn" type="button" data-close-power-roll aria-label="Close automation">X</button>
        </header>
        <div class="power-roll-runner__body" data-power-roll-body></div>
      </div>
    `;
    document.body.appendChild(host);
    host.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target === host || target?.closest("[data-close-power-roll]")) {
        closeRunner();
      }
    });
    return host;
  }

  function showTargetPrompt(state, card) {
    const host = makeHost("Pick Target", state.action.name || "Ability Automation");
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(schema.summarizeCard(card))}</p>
        </div>
      </section>
      <pre class="power-roll-runner__log">Click an enemy token on the map.</pre>
    `;
    return host;
  }

  function renderTierCards(actionCard, selectedTier, hasRolled) {
    const tiers = actionCard?.data?.tiers || {};
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

  function renderPowerRoll(host, state, actionCard) {
    const data = actionCard.data || {};
    const attribute = data.attribute || "Might";
    const attributeBonus = parseInteger(state.context.getAttributeBonus?.(attribute));
    const bonus = parseInteger(data.bonus);
    const edgeCount = parseInteger(state.edgeCount);
    const baneCount = parseInteger(state.baneCount);
    const netEdge = edgeCount - baneCount;
    const edgeBonus = netEdge > 0 ? 2 : netEdge < 0 ? -2 : 0;
    const total = state.roll ? state.roll.total + attributeBonus + bonus + edgeBonus : null;
    const edgeText = netEdge > 0 ? "Edge +2" : netEdge < 0 ? "Bane -2" : "No edge/bane";
    const targetName = state.target?.name || "No target selected";

    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(state.action.description || "No ability text entered.")}</p>
          <div class="power-roll-runner__meta">
            <span>Target: ${escapeHtml(targetName)}</span>
            ${state.action.range ? `<span>Range: ${escapeHtml(state.action.range)}</span>` : ""}
            ${state.action.cost ? `<span>Cost: ${escapeHtml(state.action.cost)}</span>` : ""}
          </div>
        </div>
      </section>
      <section class="power-roll-runner__dice" aria-live="polite">
        <div class="power-roll-runner__screen">
          <span class="power-roll-runner__expression">${escapeHtml(`${data.rollFormula || "2d10"} + ${attribute}${bonus ? ` + ${bonus}` : ""}`)}</span>
          <strong>${total === null ? "--" : total}</strong>
          <span>${state.roll ? `Dice: ${state.roll.rolls.join(" + ")} | ${attribute} ${attributeBonus >= 0 ? "+" : ""}${attributeBonus} | ${edgeText}` : "Ready"}</span>
        </div>
        <div class="power-roll-runner__edge-row">
          <label><span>Edges</span><input type="number" min="0" step="1" data-power-roll-edge value="${escapeHtml(state.edgeCount)}" /></label>
          <label><span>Banes</span><input type="number" min="0" step="1" data-power-roll-bane value="${escapeHtml(state.baneCount)}" /></label>
        </div>
        <div class="power-roll-runner__controls">
          <button class="dice-roll-btn" type="button" data-power-roll-roll>${state.roll ? "Reroll" : "Roll"}</button>
          <button class="dice-clear-btn" type="button" data-close-power-roll>Cancel</button>
          <button class="dice-project-roll-btn" type="button" data-power-roll-accept ${state.roll ? "" : "disabled"}>Accept</button>
        </div>
      </section>
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__tiers">
          ${renderTierCards(actionCard, state.selectedTier, Boolean(state.roll))}
        </div>
        <div class="power-roll-runner__details">
          <strong>Additional details</strong>
          <p>Effects, conditions, and follow-up choices will land here as automation grows.</p>
        </div>
      </section>
      <pre class="power-roll-runner__log">${escapeHtml(state.resultText || "Roll, pick a tier if needed, then accept.")}</pre>
    `;
  }

  function wirePowerRoll(host, state, actionCard, resolve) {
    const onClick = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-power-roll-roll]")) {
        state.edgeCount = parseInteger(host.querySelector("[data-power-roll-edge]")?.value);
        state.baneCount = parseInteger(host.querySelector("[data-power-roll-bane]")?.value);
        state.roll = rollFormula(actionCard.data.rollFormula || "2d10");
        const attribute = actionCard.data.attribute || "Might";
        const attributeBonus = parseInteger(state.context.getAttributeBonus?.(attribute));
        const bonus = parseInteger(actionCard.data.bonus);
        const edgeBonus = state.edgeCount > state.baneCount ? 2 : state.baneCount > state.edgeCount ? -2 : 0;
        const total = state.roll.total + attributeBonus + bonus + edgeBonus;
        state.selectedTier = getTierKey(total);
        state.manualTier = false;
        state.resultText = `Rolled ${total}. Auto-selected ${tierLabel(state.selectedTier)}.`;
        await postChat(state.context, buildRollChatEntry(state, actionCard, total, attributeBonus, bonus, edgeBonus));
        renderPowerRoll(host, state, actionCard);
        return;
      }
      const tierButton = target.closest("[data-select-tier]");
      if (tierButton && state.roll) {
        state.selectedTier = tierButton.getAttribute("data-select-tier");
        state.manualTier = true;
        state.resultText = `Manual tier selected: ${tierLabel(state.selectedTier)}.`;
        renderPowerRoll(host, state, actionCard);
        return;
      }
      if (target.closest("[data-power-roll-accept]") && state.roll && state.selectedTier) {
        host.removeEventListener("click", onClick);
        const tierData = actionCard.data.tiers?.[state.selectedTier] || {};
        state.selectedTierData = tierData;
        closeRunner();
        resolve();
      }
    };

    host.addEventListener("click", onClick);
  }

  function buildRollChatEntry(state, actionCard, total, attributeBonus, bonus, edgeBonus) {
    const data = actionCard.data || {};
    const numericModifiers = [
      attributeBonus ? `${attributeBonus >= 0 ? "+" : "-"} ${Math.abs(attributeBonus)}` : "",
      bonus ? `${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "",
      edgeBonus ? `${edgeBonus >= 0 ? "+" : "-"} ${Math.abs(edgeBonus)}` : "",
    ].filter(Boolean);
    const expression = [state.roll.notation, ...numericModifiers].join(" ");
    return {
      message: `${state.heroName} - ${state.action.name || "Power Roll"} rolled ${total} (${tierLabel(state.selectedTier)}).`,
      type: "dice_roll",
      payload: {
        expression,
        components: [state.roll.notation, ...numericModifiers],
        breakdown: [
          { type: "dice", notation: state.roll.notation, rolls: state.roll.rolls, total: state.roll.total },
          ...(attributeBonus ? [{ type: "modifier", notation: String(attributeBonus), value: attributeBonus }] : []),
          ...(bonus ? [{ type: "modifier", notation: String(bonus), value: bonus }] : []),
          ...(edgeBonus ? [{ type: "modifier", notation: String(edgeBonus), value: edgeBonus }] : []),
        ],
        total,
      },
    };
  }

  async function runTargetCard(state, card) {
    if (card.data.optional) {
      return;
    }
    const host = showTargetPrompt(state, card);
    try {
      if (typeof state.context.selectTarget !== "function") {
        throw new Error("Target selection is not available.");
      }
      const target = await state.context.selectTarget(card.data);
      state.target = target || null;
      state.targetName = target?.name || "";
    } finally {
      host.remove();
    }
  }

  async function runPowerRollAction(state, card) {
    const host = makeHost("Power Roll", state.action.name || "Ability Automation");
    renderPowerRoll(host, state, card);
    await new Promise((resolve) => wirePowerRoll(host, state, card, resolve));
  }

  async function runDealStaminaDamageAction(state, card) {
    const tier = state.selectedTierData || {};
    const amount = parseDamage(tier.damage);
    const damageType = String(tier.damageType || "").trim();
    const note = String(card.data.note || "").trim();
    if (!amount) {
      await postChat(state.context, {
        message: `${state.action.name || "Ability"} has no ${state.selectedTier || "selected"} tier stamina damage configured.`,
      });
      return;
    }
    if (!state.target?.id) {
      await postChat(state.context, {
        message: `${state.action.name || "Ability"} has no selected target for ${amount} stamina damage.`,
      });
      return;
    }
    const result = typeof state.context.applyDamage === "function"
      ? await state.context.applyDamage({
          placementId: state.target.id,
          amount,
          damageType,
          abilityName: state.action.name || "Ability",
        })
      : null;
    const targetName = result?.name || state.target.name || "Target";
    const remaining = result?.max !== null && result?.max !== undefined
      ? ` (${result.current}/${result.max} stamina remaining)`
      : result?.current !== undefined
        ? ` (${result.current} stamina remaining)`
        : "";
    const message = `${state.heroName} - ${state.action.name || "Ability"}: ${targetName} takes ${amount}${damageType ? ` ${damageType}` : ""} stamina damage${remaining}.${note ? `\n${note}` : ""}`;
    await postChat(state.context, { message });
  }

  async function runActionCard(state, card) {
    if (card.data.actionType === "powerRoll") {
      await runPowerRollAction(state, card);
      return;
    }
    if (card.data.actionType === "dealStaminaDamage") {
      await runDealStaminaDamageAction(state, card);
      return;
    }
    if (card.data.actionType === "note" && card.data.text) {
      await postChat(state.context, { message: card.data.text });
    }
  }

  async function open(options) {
    const automation = schema.normalizeAutomation(options?.automation);
    const state = {
      action: options?.action || {},
      automation,
      context: options || {},
      heroName: options?.hero?.name || options?.heroName || "Hero",
      target: null,
      targetName: "",
      selectedTier: null,
      selectedTierData: null,
      manualTier: false,
      edgeCount: 0,
      baneCount: 0,
      roll: null,
      resultText: "",
    };

    try {
      for (const card of automation.cards || []) {
        if (card.type === "target") {
          await runTargetCard(state, card);
        } else if (card.type === "action") {
          await runActionCard(state, card);
        }
      }
    } catch (error) {
      closeRunner();
      await postChat(state.context, {
        message: `${state.action.name || "Ability"} automation stopped: ${error?.message || "unknown error"}.`,
      });
    }
  }

  window.AbilityAutomationRunner = { open };
})();
