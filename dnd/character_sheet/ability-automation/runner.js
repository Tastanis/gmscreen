// Ability Automation — v3 Runtime.
//
// Walks `automation.cards` in order. For each block:
//   target     → asks the VTT board to select tokens or place an area template
//   powerRoll  → rolls 2d10 + attribute, pauses for tier confirm, applies tier effects
//   effect     → applies a list of effects without a roll
//   trigger    → posts a chat reminder (no auto-detect this pass)
//   persistent → posts a chat reminder (no zone tracking this pass)
//
// Effects dispatch through context callbacks (applyDamage, applyCondition, forceMove,
// checkPotency). Effect kinds that the runtime can't apply on the board produce chat
// reminders so the GM can apply them manually.

(function (global) {
  "use strict";

  const RUNNER_ID = "ability-automation-runner";
  const schema = global.AbilityAutomationSchema;
  const P = global.AbilityAutomationPrimitives;

  if (!schema || !P) {
    console.error("AbilityAutomationRunner requires schema.js and primitives.js to load first.");
    return;
  }

  // ---------- DOM helpers ----------

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function plainText(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return div.textContent || div.innerText || String(value ?? "");
  }

  function closeRunner() {
    document.getElementById(RUNNER_ID)?.remove();
  }

  function getRunnerDefaultPosition(modal, variant) {
    const panel = document.querySelector(".vtt-character-summary--open, .vtt-character-summary");
    const panelRect = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null;
    const panelRight =
      panelRect && panelRect.width > 40 && panelRect.left < window.innerWidth ? panelRect.right : 0;
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
      const position = constrainRunnerPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
        modal
      );
      modal.style.left = `${position.left}px`;
      modal.style.top = `${position.top}px`;
    };

    header.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || target?.closest("[data-close-power-roll]")) return;
      const rect = modal.getBoundingClientRect();
      dragState = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      modal.classList.add("power-roll-runner__modal--dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", stopDrag);
      document.addEventListener("pointercancel", stopDrag);
      event.preventDefault();
    });
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
        host.dispatchEvent(new CustomEvent("automation-cancel"));
        closeRunner();
      }
    });
    makeRunnerDraggable(host);
    positionRunnerWindow(host, variant);
    return host;
  }

  // ---------- numeric helpers ----------

  function asInt(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function rollFormula(formula) {
    const clean = String(formula || "2d10").replace(/\s+/g, "").toLowerCase();
    const match = clean.match(/^(\d*)d(\d+)$/);
    const count = match ? asInt(match[1] || "1", 1) : 2;
    const sides = match ? asInt(match[2], 10) : 10;
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

  function formatModifier(value) {
    const number = asInt(value);
    return `${number >= 0 ? "+" : "-"}${Math.abs(number)}`;
  }

  function getEdgeState(edgeCount, baneCount) {
    const edge = Math.max(0, asInt(edgeCount));
    const bane = Math.max(0, asInt(baneCount));
    const net = edge - bane;
    if (net === 0) return { edge, bane, net, bonus: 0, tierShift: 0, label: "Normal roll" };
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

  function resolveAttribute(state, attribute) {
    const requested = String(attribute || "Strongest").trim();
    if (!requested || requested.toLowerCase() === "strongest") {
      const strongest = state.context.getStrongestAttribute?.();
      if (strongest && typeof strongest === "object") {
        return { attribute: strongest.attribute || "Strongest", bonus: asInt(strongest.bonus) };
      }
      return { attribute: "Strongest", bonus: 0 };
    }
    return { attribute: requested, bonus: asInt(state.context.getAttributeBonus?.(requested)) };
  }

  // Build a resolution context that primitives.describeEffectResolved can use
  // to convert "9 + Intuition" into "11" and "A<weak" into "A<2".
  function buildResolveCtx(state) {
    const stats = state.hero?.stats && typeof state.hero.stats === "object" ? state.hero.stats : {};
    return {
      getAttributeBonus(attr) {
        if (typeof state.context.getAttributeBonus === "function") {
          return asInt(state.context.getAttributeBonus(attr), 0);
        }
        return 0;
      },
      getPotencyThreshold(level) {
        const values = ["might", "agility", "reason", "intuition", "presence"]
          .map((key) => asInt(stats[key], 0));
        const highest = values.length ? Math.max(...values) : 0;
        const normalized = String(level || "weak").trim().toLowerCase();
        if (normalized === "strong") return highest;
        if (normalized === "average") return highest - 1;
        return highest - 2;
      },
    };
  }

  function describeEffectFor(effect, state) {
    return P.describeEffectResolved
      ? P.describeEffectResolved(effect, buildResolveCtx(state))
      : P.describeEffect(effect);
  }

  // ---------- chat ----------

  async function postChat(context, entry) {
    if (context && typeof context.postChat === "function") {
      return context.postChat(entry);
    }
    if (global.dashboardChat && typeof global.dashboardChat.sendMessage === "function") {
      return global.dashboardChat.sendMessage({
        message: entry.message || "",
        type: entry.type || "text",
        payload: entry.payload || null,
      });
    }
    return false;
  }

  // ---------- target group resolution ----------

  function getTargetGroup(state, name) {
    const groupName = name || state.currentGroup || "primary";
    return state.groups[groupName] || [];
  }

  function setTargetGroup(state, name, tokens) {
    const groupName = name || "primary";
    state.groups[groupName] = Array.isArray(tokens) ? tokens : [];
    state.currentGroup = groupName;
  }

  // ---------- target block ----------

  function showTargetPrompt(state, block) {
    const host = makeHost("Pick Target", state.action.name || "Ability Automation", "target");
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--compact">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(schema.summarizeBlock(block))}</p>
        </div>
      </section>
      <div class="power-roll-runner__inline-actions">
        <p class="power-roll-runner__instruction">${escapeHtml(
          block.mode === "area"
            ? "Place the area template on the map."
            : "Click a token on the map."
        )}</p>
        ${block.optional ? '<button class="dice-clear-btn" type="button" data-skip-target>Skip</button>' : ""}
        <button class="dice-clear-btn" type="button" data-cancel-automation>Cancel</button>
      </div>
    `;
    return host;
  }

  function getTokenTargetCount(block) {
    const count = block.count;
    if (!count) return 1;
    if (count.mode === "all") return Infinity;
    return Math.max(1, asInt(count.value, 1));
  }

  async function runTargetBlock(state, block) {
    const host = showTargetPrompt(state, block);
    const finish = () => host.remove();

    const cancelPromise = new Promise((resolve) => {
      const onCancel = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-cancel-automation]")) {
          host.removeEventListener("click", onCancel);
          resolve({ canceled: true });
        }
      };
      host.addEventListener("click", onCancel);
      host.addEventListener("automation-cancel", () => resolve({ canceled: true }));
    });

    const skipPromise = block.optional
      ? new Promise((resolve) => {
          const onSkip = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-skip-target]")) {
              host.removeEventListener("click", onSkip);
              resolve({ skipped: true });
            }
          };
          host.addEventListener("click", onSkip);
        })
      : new Promise(() => {});

    try {
      if (block.mode === "area") {
        if (typeof state.context.selectAreaTarget !== "function") {
          throw new Error("Area targeting is not available.");
        }
        const result = await Promise.race([
          state.context.selectAreaTarget({
            ...block,
            // The board's existing filter reads `creature` (legacy v2 field). Send
            // both shapes so v3 `predicate` and v2 `creature` both work.
            creature: block.predicate,
            affects: block.predicate,
            sourcePlacement: state.sourcePlacement || null,
          }),
          skipPromise,
          cancelPromise,
        ]);
        if (result?.canceled) {
          state.context.cancelAreaSelection?.();
          state.aborted = true;
          return;
        }
        if (result?.skipped) {
          state.context.cancelAreaSelection?.();
          setTargetGroup(state, block.name, []);
          return;
        }
        const tokens = Array.isArray(result?.targets) ? result.targets : [];
        setTargetGroup(state, block.name, tokens);
        return;
      }

      if (typeof state.context.selectTarget !== "function") {
        throw new Error("Target selection is not available.");
      }

      const desired = getTokenTargetCount(block);
      const upTo = block.count?.mode === "upTo";
      const selected = [];
      const seen = new Set();

      for (let pickIndex = 0; pickIndex < desired; pickIndex += 1) {
        const promptConfig = {
          ...block,
          // Send predicate under the v2 field name the board still reads.
          creature: block.predicate,
          affects: block.predicate,
          pickIndex: pickIndex + 1,
          pickTotal: Number.isFinite(desired) ? desired : 0,
          allowDone: upTo,
        };
        const result = await Promise.race([
          state.context.selectTarget(promptConfig),
          skipPromise,
          cancelPromise,
        ]);
        if (result?.canceled) {
          state.context.cancelTargetSelection?.();
          state.aborted = true;
          return;
        }
        if (result?.skipped || result?.done) {
          state.context.cancelTargetSelection?.();
          break;
        }
        if (result?.id && !seen.has(result.id)) {
          seen.add(result.id);
          selected.push(result);
        }
        if (!Number.isFinite(desired)) break;
      }
      setTargetGroup(state, block.name, selected);
    } finally {
      finish();
    }
  }

  // ---------- power roll block ----------

  function renderTierCards(block, selectedTier, hasRolled, state) {
    const tiers = block.tiers || {};
    const ctx = state ? buildResolveCtx(state) : null;
    return P.TIER_KEYS.map((key) => {
      const tier = tiers[key] || { effects: [] };
      const text = (tier.effects || [])
        .map((eff) => (ctx && P.describeEffectResolved ? P.describeEffectResolved(eff, ctx) : P.describeEffect(eff)))
        .filter(Boolean)
        .join(" | ") || "No effects";
      return `
        <button
          class="power-roll-runner__tier ${selectedTier === key ? "power-roll-runner__tier--selected" : ""}"
          type="button"
          data-select-tier="${key}"
          ${hasRolled ? "" : "disabled"}
        >
          <span class="power-roll-runner__tier-range">${P.tierLabel(key)}</span>
          <span class="power-roll-runner__tier-body">${escapeHtml(text)}</span>
        </button>
      `;
    }).join("");
  }

  function getPowerRollTotal(state, block) {
    const resolved = resolveAttribute(state, block.attribute);
    const attributeBonus = resolved.bonus;
    const bonus = asInt(block.bonus);
    const manualBonus = asInt(state.manualBonus);
    const edgeState = getEdgeState(state.edgeCount, state.baneCount);
    const total = state.roll
      ? state.roll.total + attributeBonus + bonus + manualBonus + edgeState.bonus
      : null;
    return {
      total,
      attribute: resolved.attribute,
      attributeBonus,
      bonus,
      manualBonus,
      edgeState,
    };
  }

  function renderPowerRoll(host, state, block) {
    const { total, attribute, attributeBonus, bonus, manualBonus, edgeState } = getPowerRollTotal(state, block);
    const formulaParts = [`${block.rollFormula || "2d10"} + ${attribute}`];
    if (bonus) formulaParts.push(formatModifier(bonus));
    if (manualBonus) formulaParts.push(formatModifier(manualBonus));
    if (edgeState.net) formulaParts.push(edgeState.label);
    const detail = state.roll
      ? `Dice: ${state.roll.rolls.join(" + ")} | ${attribute} ${formatModifier(attributeBonus)} | ${edgeState.label}`
      : formulaParts.join(" ");

    const targetGroup = getTargetGroup(state, block.target);
    const targetName =
      targetGroup.length > 1
        ? `${targetGroup.length} targets`
        : targetGroup[0]?.name || "No target selected";

    const tierDetail = state.roll
      ? `Tier: ${P.tierLabel(state.selectedTier)}${
          state.baseTier && state.baseTier !== state.selectedTier ? ` from ${P.tierLabel(state.baseTier)}` : ""
        }`
      : "Ready";

    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--ability">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(plainText(state.action.description || "No ability text entered."))}</p>
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
          <button class="dice-clear-btn" type="button" data-cancel-automation>Cancel</button>
          ${state.roll ? '<button class="dice-project-roll-btn" type="button" data-power-roll-accept>Accept</button>' : ""}
        </div>
      </section>
      <section class="power-roll-runner__section">
        <div class="power-roll-runner__tiers">
          ${renderTierCards(block, state.selectedTier, Boolean(state.roll), state)}
        </div>
        <div class="power-roll-runner__details">
          <strong>Tier preview</strong>
          <p>${escapeHtml(state.resultText || "Roll, pick a tier if needed, then accept.")}</p>
        </div>
      </section>
    `;
  }

  function buildRollChatEntry(state, block, total, attributeBonus, bonus, edgeBonus) {
    const manualBonus = asInt(state.manualBonus);
    const numericModifiers = [
      attributeBonus ? `${attributeBonus >= 0 ? "+" : "-"} ${Math.abs(attributeBonus)}` : "",
      bonus ? `${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "",
      manualBonus ? `${manualBonus >= 0 ? "+" : "-"} ${Math.abs(manualBonus)}` : "",
      edgeBonus ? `${edgeBonus >= 0 ? "+" : "-"} ${Math.abs(edgeBonus)}` : "",
    ].filter(Boolean);
    const expression = [state.roll.notation, ...numericModifiers].join(" ");
    return {
      message: `${state.heroName} - ${state.action.name || "Power Roll"} rolled ${total} (${P.tierLabel(state.selectedTier)}).`,
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

  function wirePowerRoll(host, state, block, resolve) {
    const onClick = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-cancel-automation]")) {
        host.removeEventListener("click", onClick);
        state.aborted = true;
        closeRunner();
        resolve();
        return;
      }
      if (target.closest("[data-power-roll-edge-adjust]")) {
        state.edgeCount = asInt(state.edgeCount) + 1;
        state.resultText = state.roll ? "Edge added. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-bane-adjust]")) {
        state.baneCount = asInt(state.baneCount) + 1;
        state.resultText = state.roll ? "Bane added. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, block);
        return;
      }
      const bonusButton = target.closest("[data-power-roll-bonus-adjust]");
      if (bonusButton) {
        state.manualBonus =
          asInt(state.manualBonus) + asInt(bonusButton.getAttribute("data-power-roll-bonus-adjust"));
        state.resultText = state.roll ? "Modifier changed. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-clear-adjustments]")) {
        state.edgeCount = 0;
        state.baneCount = 0;
        state.manualBonus = 0;
        state.resultText = state.roll ? "Adjustments cleared. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-roll]")) {
        state.roll = rollFormula(block.rollFormula || "2d10");
        const { total, attributeBonus, bonus, edgeState } = getPowerRollTotal(state, block);
        state.baseTier = P.tierFromTotal(total);
        state.selectedTier = P.shiftTierKey(state.baseTier, edgeState.tierShift);
        state.resultText = `Rolled ${total}. Auto-selected ${P.tierLabel(state.selectedTier)}${
          state.baseTier !== state.selectedTier
            ? ` from ${P.tierLabel(state.baseTier)} (${edgeState.label}).`
            : "."
        }`;
        await postChat(state.context, buildRollChatEntry(state, block, total, attributeBonus, bonus, edgeState.bonus));
        renderPowerRoll(host, state, block);
        return;
      }
      const tierButton = target.closest("[data-select-tier]");
      if (tierButton && state.roll) {
        state.selectedTier = tierButton.getAttribute("data-select-tier");
        state.resultText = `Manual tier selected: ${P.tierLabel(state.selectedTier)}.`;
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-accept]") && state.roll && state.selectedTier) {
        host.removeEventListener("click", onClick);
        closeRunner();
        resolve();
      }
    };

    host.addEventListener("click", onClick);
  }

  async function runPowerRollBlock(state, block) {
    state.edgeCount = 0;
    state.baneCount = 0;
    state.manualBonus = 0;
    state.roll = null;
    state.selectedTier = null;
    state.baseTier = null;
    state.resultText = "";

    const host = makeHost("Power Roll", state.action.name || "Ability Automation", "power");
    renderPowerRoll(host, state, block);
    await new Promise((resolve) => wirePowerRoll(host, state, block, resolve));

    if (state.aborted) return;
    if (!state.selectedTier) return;

    const tier = block.tiers?.[state.selectedTier] || { effects: [] };
    const targetGroupName = block.target;
    await applyEffects(state, tier.effects || [], targetGroupName, {
      sourceLabel: `${state.action.name || "Ability"} (${P.tierLabel(state.selectedTier)})`,
    });
  }

  // ---------- effect block ----------

  async function runEffectBlock(state, block) {
    await applyEffects(state, block.effects || [], block.target, {
      sourceLabel: state.action.name || "Effect",
    });
    if (block.note) {
      await postChat(state.context, { message: `${state.heroName} - ${state.action.name || "Ability"}: ${block.note}` });
    }
  }

  // ---------- trigger / persistent (chat reminders only this pass) ----------

  async function runTriggerBlock(state, block) {
    const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join("; ");
    const lines = [`${state.heroName} - ${state.action.name || "Ability"} trigger:`];
    if (block.condition) lines.push(`When: ${block.condition}`);
    if (inner) lines.push(`Then: ${inner}`);
    if (block.note) lines.push(block.note);
    await postChat(state.context, { message: lines.join("\n") });
  }

  async function runPersistentBlock(state, block) {
    const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join("; ");
    const lines = [
      `${state.heroName} - ${state.action.name || "Ability"} persistent zone:`,
      `Cost ${block.cost || 0}${block.resource ? ` ${block.resource}` : ""} at ${block.tickAt}.`,
    ];
    if (inner) lines.push(`Each tick: ${inner}`);
    if (block.note) lines.push(block.note);
    await postChat(state.context, { message: lines.join("\n") });
  }

  // ---------- effect dispatch ----------

  async function applyEffects(state, effects, targetGroupName, ctx = {}) {
    if (!Array.isArray(effects) || !effects.length) return;
    const targets = getTargetGroup(state, targetGroupName);
    for (const effect of effects) {
      if (state.aborted) return;
      await applyEffect(state, effect, targets, ctx);
    }
  }

  async function applyEffect(state, effect, targets, ctx) {
    if (!effect || typeof effect !== "object") return;
    switch (effect.kind) {
      case "damage":
        return applyDamageEffect(state, effect, targets, ctx);
      case "condition":
        return applyConditionEffect(state, effect, targets, ctx);
      case "forcedMovement":
        return applyForcedMovementEffect(state, effect, targets, ctx);
      case "potency":
        return applyPotencyEffect(state, effect, targets, ctx);
      case "spend":
        return applySpendEffect(state, effect, targets, ctx);
      case "ifKeyword":
        return applyIfKeywordEffect(state, effect, targets, ctx);
      case "heal":
        return applyHealEffect(state, effect, targets, ctx, false);
      case "temporaryStamina":
        return applyHealEffect(state, effect, targets, ctx, true);
      case "teleport":
        return reminderEffect(state, effect, targets, "Teleport");
      case "swap":
        return reminderEffect(state, effect, targets, "Swap");
      case "freeStrike":
        return reminderEffect(state, effect, targets, "Free Strike");
      case "cascade":
        return reminderEffect(state, effect, targets, "Cascade");
      case "resourceGain":
        return reminderEffect(state, effect, targets, "Resource");
      case "note":
        return noteEffect(state, effect);
      case "other":
        return reminderEffect(state, effect, targets, "Note");
      default:
        return null;
    }
  }

  async function applyDamageEffect(state, effect, targets, ctx) {
    if (!targets.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} (no target).`,
      });
      return;
    }
    const baseAmount = asInt(effect.amount, 0);
    const attributeBonus = effect.attribute
      ? asInt(state.context.getAttributeBonus?.(effect.attribute), 0)
      : 0;
    const amount = Math.max(0, baseAmount + attributeBonus);
    const damageType = effect.damageType && effect.damageType !== "untyped" ? effect.damageType : "";
    const lines = [];
    let visibleHidden = 0;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result =
        typeof state.context.applyDamage === "function"
          ? await state.context.applyDamage({
              placementId: target.id,
              amount,
              damageType,
              abilityName: state.action.name || "Ability",
            })
          : null;
      const hidden = Boolean(result?.hidden || target.hidden || target.placement?.hidden);
      if (hidden) {
        visibleHidden += 1;
        continue;
      }
      const targetName = result?.name || target.name || "Target";
      const finalAmount = Number.isFinite(result?.amount) ? result.amount : amount;
      const adjustments = [];
      if (Number.isFinite(result?.vulnerability) && result.vulnerability > 0) adjustments.push(`+${result.vulnerability} vulnerability`);
      if (Number.isFinite(result?.immunity) && result.immunity > 0) adjustments.push(`-${result.immunity} immunity`);
      const adjustmentText = adjustments.length
        ? ` (${amount}${damageType ? ` ${damageType}` : ""} ${adjustments.join(" ")} = ${finalAmount})`
        : "";
      const remaining = result?.max !== null && result?.max !== undefined
        ? ` (${result.current}/${result.max} stamina remaining)`
        : result?.current !== undefined
          ? ` (${result.current} stamina remaining)`
          : "";
      lines.push(`${targetName} takes ${finalAmount}${damageType ? ` ${damageType}` : ""} damage${adjustmentText}${remaining}.`);
    }
    const visible = lines.length ? lines.join("\n") : visibleHidden ? "Hidden targets are affected." : "No damage applied.";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}:\n${visible}`,
    });
  }

  async function applyConditionEffect(state, effect, targets) {
    if (!targets.length) return;
    const duration = mapConditionDuration(effect.duration);
    const name = effect.name === "other" && effect.text ? effect.text : effect.name;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      await state.context.applyCondition?.({
        placementId: target.id,
        condition: { name, duration },
        sourceId: state.sourcePlacement?.id || "",
      });
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: applies ${P.describeEffect(effect)}.`,
    });
  }

  function mapConditionDuration(duration) {
    switch (duration) {
      case "saveEnds": return "save-ends";
      case "endOfTurn": return "end-of-turn";
      case "endOfEncounter": return "end-of-encounter";
      case "untilDying": return "until-dying";
      default: return "instantaneous";
    }
  }

  async function applyHealEffect(state, effect, targets, ctx, allowTempHp) {
    if (!targets.length) return;
    const recoveries = asInt(effect.recoveries, 0);
    const flatAmount = asInt(effect.amount, 0);

    // "recoveries" requires a per-character recovery value we don't yet plumb;
    // surface as a chat reminder so the GM can apply manually for now.
    if (recoveries && !flatAmount) {
      await reminderEffect(state, effect, targets, allowTempHp ? "Temporary Stamina" : "Heal");
      return;
    }
    if (!flatAmount) return;

    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result = typeof state.context.applyHeal === "function"
        ? await state.context.applyHeal({
            placementId: target.id,
            amount: flatAmount,
            allowTempHp,
            abilityName: state.action.name || "Ability",
          })
        : null;
      if (!result) {
        lines.push(`${target.name || "Target"}: heal not applied (no hook).`);
        continue;
      }
      const targetName = result.name || target.name || "Target";
      const max = result.max;
      const current = result.current;
      const display = max !== null && max !== undefined ? `${current}/${max}` : `${current}`;
      const overage = allowTempHp && Number.isFinite(max) && current > max ? ` (+${current - max} temp)` : "";
      lines.push(`${targetName} recovers ${result.change || flatAmount} stamina${overage} (${display}).`);
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
    });
  }

  async function applyForcedMovementEffect(state, effect, targets) {
    if (!targets.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} (no target).`,
      });
      return;
    }
    const verb = effect.verb || "push";
    const distance = asInt(effect.distance, 0);
    if (!distance) return;
    if (typeof state.context.forceMove !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — forced movement not available.`,
      });
      return;
    }

    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result = await state.context.forceMove({
        movement: verb,
        verb,
        distance,
        upTo: Boolean(effect.upTo),
        targetId: target.id,
        target,
        sourcePlacement: state.sourcePlacement || null,
        sourceTraits: state.sourceTraits || {},
        abilityName: state.action.name || "Ability",
      });
      if (!result || result.skipped) {
        lines.push(`${target.name || "Target"}: ${verb} ${distance} skipped.`);
        continue;
      }
      const moved = result.movedDistance ?? distance;
      lines.push(`${result.name || target.name || "Target"} is ${verb}ed ${moved} square${moved === 1 ? "" : "s"}.`);
      if (result.collision) {
        lines.push(
          `Collision: ${result.collision.targetName || "Target"} and ${result.collision.collidedName || "the other token"} each take ${result.collision.damage} untyped damage.`
        );
      }
    }
    if (lines.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
      });
    }
  }

  async function applyPotencyEffect(state, effect, targets, ctx) {
    if (!targets.length) return;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result =
        typeof state.context.checkPotency === "function"
          ? await state.context.checkPotency({
              placementId: target.id,
              attribute: effect.attribute,
              threshold: effect.level,
              sourceStats: state.hero?.stats || {},
            })
          : { passes: true };
      if (!result?.passes) {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: ${target.name || "Target"} resisted ${effect.attribute}<${effect.level}.`,
        });
        continue;
      }
      const failedTargets = [target];
      await applyEffects(
        { ...state, groups: { _potency: failedTargets } },
        effect.onFail || [],
        "_potency",
        ctx
      );
    }
  }

  async function applyIfKeywordEffect(state, effect, targets, ctx) {
    const keywords = getAbilityKeywords(state);
    const matched = P.keywordsMatch
      ? P.keywordsMatch(keywords, { all: effect.all, any: effect.any, none: effect.none })
      : true;
    const branch = matched ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    // Reuse the current target group for the branch.
    await applyEffects(state, branch, null, ctx);
  }

  async function applySpendEffect(state, effect, targets, ctx) {
    const cost = `${effect.amount || 1} ${effect.resource || "resource"}`;
    const inner = (effect.effects || []).map(P.describeEffect).filter(Boolean).join("; ");
    const proceed = global.confirm(
      `Spend ${cost} for ${state.action.name || "this ability"}?\n${inner || "(no listed effect)"}`
    );
    if (!proceed) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: declined to spend ${cost}.`,
      });
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: spent ${cost}.`,
    });
    await applyEffects(state, effect.effects || [], null, ctx);
  }

  async function reminderEffect(state, effect, targets, label) {
    const targetLabel = targets.length
      ? targets.map((t) => t.name).filter(Boolean).join(", ") || `${targets.length} target(s)`
      : "(no target)";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${label} — ${P.describeEffect(effect)} → ${targetLabel}.`,
    });
  }

  async function noteEffect(state, effect) {
    if (!effect.text) return;
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${effect.text}`,
    });
  }

  // ---------- main loop ----------

  async function runBlock(state, block) {
    switch (block.type) {
      case "target":
        return runTargetBlock(state, block);
      case "powerRoll":
        return runPowerRollBlock(state, block);
      case "effect":
        return runEffectBlock(state, block);
      case "trigger":
        return runTriggerBlock(state, block);
      case "persistent":
        return runPersistentBlock(state, block);
      default:
        return null;
    }
  }

  // Single source of truth for ability keywords. Priority:
  //   1. automation.keywords (LLM-authored JSON) — most specific
  //   2. action.keywords (character sheet)
  //   3. action.tags (legacy field name)
  function getAbilityKeywords(state) {
    const auto = state?.automation;
    if (auto && Array.isArray(auto.keywords) && auto.keywords.length) return auto.keywords;
    const action = state?.action;
    if (action && Array.isArray(action.keywords) && action.keywords.length) return action.keywords;
    if (action && Array.isArray(action.tags) && action.tags.length) return action.tags;
    return [];
  }

  // ---------- feature modifier application (pre-roll) ----------

  // Collect every modifier from every feature on the source character that
  // matches THIS ability's keywords/damage/attribute. Returns an array of
  // matching `apply` blocks (already extracted from features).
  function collectMatchingModifiers(automation, action, features) {
    if (!Array.isArray(features) || !features.length) return [];
    const keywords = Array.isArray(automation?.keywords) && automation.keywords.length
      ? automation.keywords
      : Array.isArray(action?.keywords)
        ? action.keywords
        : Array.isArray(action?.tags) ? action.tags : [];
    const matched = [];
    for (const feature of features) {
      const featureAutomation = feature?.automation;
      const featureMods = Array.isArray(featureAutomation?.modifiers) ? featureAutomation.modifiers : null;
      if (!featureMods?.length) continue;
      for (const mod of featureMods) {
        if (modifierMatches(mod, keywords, automation, action)) {
          matched.push({ apply: mod.apply || {}, source: feature.title || feature.name || "Feature", label: mod.label || "" });
        }
      }
    }
    return matched;
  }

  function modifierMatches(modifier, abilityKeywords, automation, action) {
    if (!modifier || !modifier.match) return false;
    const match = modifier.match;
    // Keyword filters.
    if (P.keywordsMatch) {
      const ok = P.keywordsMatch(abilityKeywords, {
        all: match.keywordsAll,
        any: match.keywordsAny,
        none: match.keywordsNone,
      });
      if (!ok) return false;
    }
    // Damage-type filter — match if ANY damage effect in the automation uses
    // this type (or no type filter set).
    if (match.damageType) {
      let foundType = false;
      walkAutomationEffects(automation, (effect) => {
        if (effect.kind === "damage" && String(effect.damageType || "").toLowerCase() === match.damageType.toLowerCase()) {
          foundType = true;
        }
      });
      if (!foundType) return false;
    }
    // Attribute filter — match against the power roll's attribute.
    if (match.attribute) {
      const prAttr = findPowerRollAttribute(automation);
      if (!prAttr) return false;
      const ok = P.normalizeAttribute
        ? P.normalizeAttribute(prAttr).toLowerCase() === P.normalizeAttribute(match.attribute).toLowerCase()
        : prAttr.toLowerCase() === match.attribute.toLowerCase();
      if (!ok) return false;
    }
    return true;
  }

  function findPowerRollAttribute(automation) {
    const blocks = automation?.cards || [];
    for (const block of blocks) {
      if (block?.type === "powerRoll" && block.attribute) return block.attribute;
    }
    return "";
  }

  function walkAutomationEffects(automation, visit) {
    const blocks = automation?.cards || [];
    for (const block of blocks) {
      walkBlockEffects(block, visit);
    }
  }

  function walkBlockEffects(block, visit) {
    if (!block || typeof block !== "object") return;
    if (block.type === "powerRoll" && block.tiers) {
      for (const key of P.TIER_KEYS) {
        const effects = block.tiers[key]?.effects || [];
        walkEffectList(effects, visit);
      }
    } else if (Array.isArray(block.effects)) {
      walkEffectList(block.effects, visit);
    }
  }

  function walkEffectList(list, visit) {
    if (!Array.isArray(list)) return;
    for (const effect of list) {
      if (!effect || typeof effect !== "object") continue;
      visit(effect);
      // Recurse into wrapper effects.
      if (effect.kind === "potency" && Array.isArray(effect.onFail)) walkEffectList(effect.onFail, visit);
      if (effect.kind === "spend" && Array.isArray(effect.effects)) walkEffectList(effect.effects, visit);
      if (effect.kind === "ifKeyword") {
        walkEffectList(effect.then || [], visit);
        walkEffectList(effect.else || [], visit);
      }
    }
  }

  // Mutate the (pre-cloned) automation by applying each matched modifier's
  // bonus fields. Runs ONCE at the start of open() so all UI rendering and
  // damage calculations see the post-modifier values.
  function applyModifiersInPlace(automation, matchedModifiers, state) {
    if (!matchedModifiers.length) return;
    const totals = matchedModifiers.reduce((acc, m) => {
      const a = m.apply || {};
      acc.damageBonus += Number.parseInt(a.damageBonus, 10) || 0;
      acc.rangeBonus += Number.parseInt(a.rangeBonus, 10) || 0;
      acc.forcedMovementBonus += Number.parseInt(a.forcedMovementBonus, 10) || 0;
      if (a.damageType) acc.damageTypeOverride = String(a.damageType).trim().toLowerCase();
      return acc;
    }, { damageBonus: 0, rangeBonus: 0, forcedMovementBonus: 0, damageTypeOverride: "" });

    // Add range bonus to every target block's distance.value.
    if (totals.rangeBonus) {
      for (const block of automation.cards || []) {
        if (block?.type === "target" && block.distance && Number.isFinite(block.distance.value)) {
          block.distance.value = Math.max(0, block.distance.value + totals.rangeBonus);
        }
      }
    }

    // Add damage / forced-movement bonuses to every relevant effect.
    walkAutomationEffects(automation, (effect) => {
      if (effect.kind === "damage") {
        if (totals.damageBonus) {
          effect.amount = (Number.parseInt(effect.amount, 10) || 0) + totals.damageBonus;
        }
        if (totals.damageTypeOverride) {
          effect.damageType = totals.damageTypeOverride;
        }
      } else if (effect.kind === "forcedMovement") {
        if (totals.forcedMovementBonus && Number.isFinite(effect.distance)) {
          effect.distance = Math.max(0, effect.distance + totals.forcedMovementBonus);
        }
      }
    });

    // Stash a summary on state for the inspector / chat to reference.
    state.appliedModifiers = matchedModifiers;
  }

  async function open(options) {
    const automation = schema.normalizeAutomation(options?.automation);
    // Apply feature modifiers BEFORE rendering anything. Tier preview, dice
    // modal, and chat output all see the post-modifier values.
    const features = Array.isArray(options?.features) ? options.features : [];
    const matchedModifiers = collectMatchingModifiers(automation, options?.action, features);
    const state = {
      action: options?.action || {},
      automation,
      context: options || {},
      hero: options?.hero || {},
      heroName: options?.hero?.name || options?.heroName || "Hero",
      sourcePlacement: options?.sourcePlacement || options?.sourceToken || null,
      sourceTraits: options?.sourceTraits || {},
      groups: {},
      currentGroup: null,
      selectedTier: null,
      baseTier: null,
      edgeCount: 0,
      baneCount: 0,
      manualBonus: 0,
      roll: null,
      resultText: "",
      aborted: false,
      appliedModifiers: [],
    };
    if (matchedModifiers.length) {
      applyModifiersInPlace(automation, matchedModifiers, state);
      // Post a brief note to chat naming which features kicked in.
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: applied ${matchedModifiers.length} feature modifier${matchedModifiers.length === 1 ? "" : "s"} (${matchedModifiers.map((m) => m.source).join(", ")}).`,
      });
    }

    try {
      if (typeof state.context.spendResource === "function") {
        const spendResult = await state.context.spendResource(state.action);
        if (spendResult?.canceled) {
          closeRunner();
          return;
        }
      }
      const blocks = automation.cards || [];
      if (!blocks.length) {
        await postChat(state.context, {
          message: `${state.action.name || "Ability"} has no automation configured.`,
        });
        return;
      }
      for (const block of blocks) {
        if (state.aborted) break;
        await runBlock(state, block);
      }
      if (state.aborted) {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"} automation canceled.`,
        });
      }
    } catch (error) {
      closeRunner();
      console.error("[AbilityAutomationRunner] error", error);
      await postChat(state.context, {
        message: `${state.action.name || "Ability"} automation stopped: ${error?.message || "unknown error"}.`,
      });
    }
  }

  global.AbilityAutomationRunner = { open, close: closeRunner };
})(window);
