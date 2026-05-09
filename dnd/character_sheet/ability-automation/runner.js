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

  function getRunnerDefaultPosition(modal, variant) {
    const panel = document.querySelector(".vtt-character-summary--open, .vtt-character-summary");
    const panelRect = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null;
    const panelRight = panelRect && panelRect.width > 40 && panelRect.left < window.innerWidth
      ? panelRect.right
      : 0;
    const left = Math.max(16, panelRight ? panelRight + 16 : 24);
    const top = variant === "target" ? 76 : 72;
    return constrainRunnerPosition(left, top, modal);
  }

  function constrainRunnerPosition(left, top, modal) {
    const rect = modal?.getBoundingClientRect();
    const width = rect?.width || 360;
    const height = rect?.height || 220;
    const padding = 12;
    const maxLeft = Math.max(padding, window.innerWidth - width - padding);
    const maxTop = Math.max(padding, window.innerHeight - height - padding);
    return {
      left: Math.min(Math.max(padding, left), maxLeft),
      top: Math.min(Math.max(padding, top), maxTop),
    };
  }

  function positionRunnerWindow(host, variant) {
    const modal = host.querySelector(".power-roll-runner__modal");
    if (!(modal instanceof HTMLElement)) return;
    requestAnimationFrame(() => {
      const position = getRunnerDefaultPosition(modal, variant);
      modal.style.left = `${position.left}px`;
      modal.style.top = `${position.top}px`;
    });
  }

  function makeRunnerDraggable(host) {
    const modal = host.querySelector(".power-roll-runner__modal");
    const header = host.querySelector(".power-roll-runner__header");
    if (!(modal instanceof HTMLElement) || !(header instanceof HTMLElement)) return;

    let dragState = null;
    const stopDrag = () => {
      if (!dragState) return;
      dragState = null;
      modal.classList.remove("power-roll-runner__modal--dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stopDrag);
      document.removeEventListener("pointercancel", stopDrag);
    };
    const onMove = (event) => {
      if (!dragState) return;
      const position = constrainRunnerPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY, modal);
      modal.style.left = `${position.left}px`;
      modal.style.top = `${position.top}px`;
    };

    header.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || target?.closest("[data-close-power-roll]")) return;
      const rect = modal.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      modal.classList.add("power-roll-runner__modal--dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", stopDrag);
      document.addEventListener("pointercancel", stopDrag);
      event.preventDefault();
    });
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

  function shiftTierKey(key, shift) {
    const keys = ["low", "mid", "high"];
    const index = keys.indexOf(key);
    if (index === -1 || !shift) return key;
    return keys[Math.min(keys.length - 1, Math.max(0, index + shift))];
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

  function makeHost(title, eyebrow, variant = "power") {
    closeRunner();
    const host = document.createElement("div");
    host.id = RUNNER_ID;
    host.className = `power-roll-runner power-roll-runner--${variant}`;
    host.innerHTML = `
      <div class="dice-modal dice-modal--vtt power-roll-runner__modal" role="dialog" aria-modal="false" aria-labelledby="power-roll-title">
        <header class="dice-modal-header power-roll-runner__header">
          <div class="dice-modal-heading-group power-roll-runner__heading">
            <h2 class="dice-modal-title" id="power-roll-title">${escapeHtml(title || "Ability Automation")}</h2>
            <span class="dice-modal-project-label">${escapeHtml(eyebrow || "Automation")}</span>
          </div>
          <button class="dice-modal-close" type="button" data-close-power-roll aria-label="Close automation">&times;</button>
        </header>
        <div class="dice-modal-content power-roll-runner__body" data-power-roll-body></div>
      </div>
    `;
    document.body.appendChild(host);
    host.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-close-power-roll]")) {
        closeRunner();
      }
    });
    makeRunnerDraggable(host);
    positionRunnerWindow(host, variant);
    return host;
  }

  function showTargetPrompt(state, card) {
    const host = makeHost("Pick Target", state.action.name || "Ability Automation", "target");
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--compact">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(schema.summarizeCard(card))}</p>
        </div>
      </section>
      <p class="power-roll-runner__instruction">Click an enemy token on the map.</p>
    `;
    return host;
  }

  function renderTierCards(actionCard, selectedTier, hasRolled) {
    const tiers = actionCard?.data?.tiers || {};
    return schema.TIER_KEYS.map((key) => {
      const tier = tiers[key] || {};
      const parts = [];
      if (tier.damage || tier.damageType) {
        const damageLabel = tier.damageType
          ? `${tier.damage || "-"} ${tier.damageType}`
          : `${tier.damage || "-"} stamina damage`;
        parts.push(damageLabel.trim());
      }
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

  function getEdgeState(edgeCount, baneCount) {
    const edge = Math.max(0, parseInteger(edgeCount));
    const bane = Math.max(0, parseInteger(baneCount));
    const net = edge - bane;
    if (net === 0) {
      return { edge, bane, net, bonus: 0, tierShift: 0, label: "Normal roll" };
    }
    if (net > 0) {
      return {
        edge,
        bane,
        net,
        bonus: 2,
        tierShift: net >= 2 ? 1 : 0,
        label: net >= 2 ? "Double Edge (+2, tier up)" : "Edge (+2)",
      };
    }
    return {
      edge,
      bane,
      net,
      bonus: -2,
      tierShift: net <= -2 ? -1 : 0,
      label: net <= -2 ? "Double Bane (-2, tier down)" : "Bane (-2)",
    };
  }

  function getPowerRollTotal(state, actionCard) {
    const data = actionCard.data || {};
    const attribute = data.attribute || "Might";
    const attributeBonus = parseInteger(state.context.getAttributeBonus?.(attribute));
    const bonus = parseInteger(data.bonus);
    const manualBonus = parseInteger(state.manualBonus);
    const edgeCount = parseInteger(state.edgeCount);
    const baneCount = parseInteger(state.baneCount);
    const edgeState = getEdgeState(edgeCount, baneCount);
    const edgeBonus = edgeState.bonus;
    const total = state.roll ? state.roll.total + attributeBonus + bonus + manualBonus + edgeBonus : null;
    return { total, attribute, attributeBonus, bonus, manualBonus, edgeCount, baneCount, edgeBonus, edgeState };
  }

  function formatModifier(value) {
    const number = parseInteger(value);
    return `${number >= 0 ? "+" : "-"}${Math.abs(number)}`;
  }

  function renderPowerRoll(host, state, actionCard) {
    const data = actionCard.data || {};
    const { total, attribute, attributeBonus, bonus, manualBonus, edgeState } = getPowerRollTotal(state, actionCard);
    const formulaParts = [`${data.rollFormula || "2d10"} + ${attribute}`];
    if (bonus) formulaParts.push(formatModifier(bonus));
    if (manualBonus) formulaParts.push(formatModifier(manualBonus));
    if (edgeState.net) formulaParts.push(edgeState.label);
    const detail = state.roll
      ? `Dice: ${state.roll.rolls.join(" + ")} | ${attribute} ${formatModifier(attributeBonus)} | ${edgeState.label}`
      : formulaParts.join(" ");
    const targetName = state.target?.name || "No target selected";
    const tierDetail = state.roll
      ? `Tier: ${tierLabel(state.selectedTier)}${state.baseTier && state.baseTier !== state.selectedTier ? ` from ${tierLabel(state.baseTier)}` : ""}`
      : "Ready";

    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--ability">
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
      <section class="power-roll-runner__dice dice-view dice-view--standard" aria-live="polite">
        <div class="dice-result-screen power-roll-runner__screen">
          <div class="dice-queue-display">${escapeHtml(detail)}</div>
          <div class="dice-result-total">${total === null ? "--" : total}</div>
          <div class="dice-result-detail">${escapeHtml(tierDetail)}</div>
        </div>
        <div class="dice-row dice-row--edge-bane power-roll-runner__edge-buttons">
          <button class="dice-btn dice-btn--edge" type="button" data-power-roll-edge-adjust="1">Edge (+2)</button>
          <button class="dice-btn dice-btn--bane" type="button" data-power-roll-bane-adjust="1">Bane (-2)</button>
          <button class="dice-btn" type="button" data-power-roll-bonus-adjust="1">+1</button>
          <button class="dice-btn" type="button" data-power-roll-bonus-adjust="-1">-1</button>
        </div>
        <div class="power-roll-runner__adjustments">
          <span>${escapeHtml(edgeState.label)}</span>
          <span>Manual: ${escapeHtml(formatModifier(state.manualBonus))}</span>
          <button class="power-roll-runner__mini-btn" type="button" data-power-roll-clear-adjustments>Clear</button>
        </div>
        <div class="dice-actions__controls power-roll-runner__controls">
          <button class="dice-roll-btn" type="button" data-power-roll-roll>${state.roll ? "Reroll" : "Roll"}</button>
          <button class="dice-clear-btn" type="button" data-close-power-roll>Cancel</button>
          ${state.roll ? '<button class="dice-project-roll-btn" type="button" data-power-roll-accept>Accept</button>' : ""}
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
      <p class="power-roll-runner__instruction">${escapeHtml(state.resultText || "Roll, pick a tier if needed, then accept.")}</p>
    `;
  }

  function wirePowerRoll(host, state, actionCard, resolve) {
    const onClick = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-power-roll-edge-adjust]")) {
        state.edgeCount = parseInteger(state.edgeCount) + 1;
        state.resultText = state.roll ? "Edge added. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, actionCard);
        return;
      }
      if (target.closest("[data-power-roll-bane-adjust]")) {
        state.baneCount = parseInteger(state.baneCount) + 1;
        state.resultText = state.roll ? "Bane added. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, actionCard);
        return;
      }
      const bonusButton = target.closest("[data-power-roll-bonus-adjust]");
      if (bonusButton) {
        state.manualBonus = parseInteger(state.manualBonus) + parseInteger(bonusButton.getAttribute("data-power-roll-bonus-adjust"));
        state.resultText = state.roll ? "Modifier changed. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, actionCard);
        return;
      }
      if (target.closest("[data-power-roll-clear-adjustments]")) {
        state.edgeCount = 0;
        state.baneCount = 0;
        state.manualBonus = 0;
        state.resultText = state.roll ? "Adjustments cleared. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, actionCard);
        return;
      }
      if (target.closest("[data-power-roll-roll]")) {
        state.roll = rollFormula(actionCard.data.rollFormula || "2d10");
        const { total, attributeBonus, bonus, edgeBonus, edgeState } = getPowerRollTotal(state, actionCard);
        state.baseTier = getTierKey(total);
        state.selectedTier = shiftTierKey(state.baseTier, edgeState.tierShift);
        state.manualTier = false;
        state.resultText = `Rolled ${total}. Auto-selected ${tierLabel(state.selectedTier)}${state.baseTier !== state.selectedTier ? ` from ${tierLabel(state.baseTier)} because of ${edgeState.label}.` : "."}`;
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
    const manualBonus = parseInteger(state.manualBonus);
    const numericModifiers = [
      attributeBonus ? `${attributeBonus >= 0 ? "+" : "-"} ${Math.abs(attributeBonus)}` : "",
      bonus ? `${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "",
      manualBonus ? `${manualBonus >= 0 ? "+" : "-"} ${Math.abs(manualBonus)}` : "",
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
          ...(manualBonus ? [{ type: "modifier", notation: String(manualBonus), value: manualBonus }] : []),
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
    state.edgeCount = parseInteger(card.data.edges);
    state.baneCount = parseInteger(card.data.banes);
    state.manualBonus = 0;
    const host = makeHost("Power Roll", state.action.name || "Ability Automation", "power");
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
    state.dealtStaminaDamage = true;
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
      baseTier: null,
      manualTier: false,
      edgeCount: 0,
      baneCount: 0,
      manualBonus: 0,
      roll: null,
      resultText: "",
      dealtStaminaDamage: false,
    };

    try {
      const cards = automation.cards || [];
      const hasExplicitDamageAction = cards.some(
        (card) => card?.type === "action" && card?.data?.actionType === "dealStaminaDamage"
      );
      for (const card of cards) {
        if (card.type === "target") {
          await runTargetCard(state, card);
        } else if (card.type === "action") {
          await runActionCard(state, card);
        }
      }
      if (!hasExplicitDamageAction && !state.dealtStaminaDamage && state.selectedTierData && state.target?.id) {
        await runDealStaminaDamageAction(state, { data: { note: "" } });
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
