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

  // ---------- winded detection (universal) ----------
  //
  // Any actor (PC or monster) is "winded" at half HP rounded down. The runner
  // uses this to apply optional `whenWinded` overrides on blocks. Sources, in
  // priority order:
  //   1. state.context.isWinded() if the host supplies it
  //   2. state.hero.currentStamina / state.hero.maxStamina (PCs)
  //   3. state.hero.hp / state.hero.maxHp (monsters)
  //   4. state.sourceToken.hp / maxHp (board fallback)
  function isActorWinded(state) {
    if (state?.context && typeof state.context.isWinded === "function") {
      try {
        const result = state.context.isWinded();
        if (typeof result === "boolean") return result;
      } catch (_err) { /* fall through */ }
    }
    const candidates = [
      { cur: state?.hero?.currentStamina, max: state?.hero?.maxStamina },
      { cur: state?.hero?.hp, max: state?.hero?.maxHp },
      { cur: state?.hero?.stamina, max: state?.hero?.maxStaminaTotal },
      { cur: state?.sourceToken?.hp, max: state?.sourceToken?.maxHp },
    ];
    for (const c of candidates) {
      const cur = Number(c.cur);
      const max = Number(c.max);
      if (Number.isFinite(cur) && Number.isFinite(max) && max > 0) {
        return cur <= Math.floor(max / 2);
      }
    }
    return false;
  }

  // If the block carries a `whenWinded` override and the actor is winded,
  // produce a shallow-merged block with the override fields applied. Does NOT
  // mutate the original block. Returns the original block if no override or
  // not winded.
  function applyWhenWindedToBlock(state, block) {
    if (!block || typeof block !== "object" || !block.whenWinded) return block;
    if (!isActorWinded(state)) return block;
    const w = block.whenWinded;
    if (block.type === "powerRoll") {
      const merged = { ...block };
      if (w.bonus !== undefined) merged.bonus = w.bonus;
      if (w.flatBonus !== undefined) merged.flatBonus = w.flatBonus;
      if (w.attribute !== undefined) merged.attribute = w.attribute;
      if (w.target !== undefined) merged.target = w.target;
      if (w.tiers && typeof w.tiers === "object") {
        merged.tiers = { ...(block.tiers || {}) };
        for (const key of Object.keys(w.tiers)) {
          merged.tiers[key] = w.tiers[key];
        }
      }
      return merged;
    }
    if (block.type === "effect") {
      const merged = { ...block };
      if (Array.isArray(w.effects)) merged.effects = w.effects;
      if (w.target !== undefined) merged.target = w.target;
      return merged;
    }
    return block;
  }

  function resolveAttribute(state, attribute) {
    // Array form means "highest bonus among these specific attributes" — e.g.
    // ["M", "A"] = highest of Might or Agility only (free strike rule).
    if (Array.isArray(attribute)) {
      if (!attribute.length) return { attribute: "Strongest", bonus: 0 };
      let best = { attribute: attribute[0], bonus: Number.NEGATIVE_INFINITY };
      for (const attr of attribute) {
        const bonus = asInt(state.context.getAttributeBonus?.(attr), 0);
        if (bonus > best.bonus) best = { attribute: attr, bonus };
      }
      if (best.bonus === Number.NEGATIVE_INFINITY) best.bonus = 0;
      return best;
    }
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
        // Array means "highest among these" (e.g. free strike's M or A).
        if (Array.isArray(attr)) {
          if (!attr.length) return 0;
          const bonuses = attr.map((a) => asInt(state.context.getAttributeBonus?.(a), 0));
          return bonuses.length ? Math.max(...bonuses) : 0;
        }
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

  // Resolve a damage effect's attribute to a numeric bonus, supporting either
  // a single attribute string ("Might", "Strongest") or an array of attributes
  // ["M", "A"] meaning "highest of M or A only".
  function resolveAttributeBonusForDamage(state, attribute) {
    if (Array.isArray(attribute)) {
      if (!attribute.length) return 0;
      const bonuses = attribute.map((a) => asInt(state.context.getAttributeBonus?.(a), 0));
      return Math.max(...bonuses);
    }
    return asInt(state.context.getAttributeBonus?.(attribute), 0);
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
        // Persist the placed template area so a later `persistent` block in
        // the same automation can reuse the same cells when registering the
        // zone with the board. Schema's target block carries the shape
        // metadata (shape, size, length, etc.); the result.template carries
        // the placed position.
        if (result?.template && typeof result.template === "object") {
          if (!state.areas) state.areas = {};
          const areaKey = block.name || "primary";
          state.areas[areaKey] = {
            template: { ...result.template },
            shape: block.shape || "cube",
            size: block.size || 0,
            width: block.width || 0,
            height: block.height || 0,
            length: block.length || 0,
            predicate: block.predicate || block.creature || block.affects || "creature",
            blockName: areaKey,
            blockId: block.id || "",
          };
          state.currentArea = areaKey;
        }
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
          // Pre-suggested target (e.g. the mover that triggered an
          // opp-attack). Picker pulses this token red but the player can
          // still click anyone.
          suggestedTargetId: state.suggestedTargetId || "",
          // Source token, used by the board to draw the reach/range box
          // around the caster while the player is picking a target.
          sourcePlacement: state.sourcePlacement || null,
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
    // flatBonus (monster-style literal) takes priority over attribute lookup.
    // When flatBonus is set, attribute is only a label for display.
    const hasFlat = block && typeof block.flatBonus === "number" && Number.isFinite(block.flatBonus);
    const resolved = hasFlat
      ? { attribute: typeof block.attribute === "string" ? block.attribute : "Flat", bonus: asInt(block.flatBonus, 0) }
      : resolveAttribute(state, block.attribute);
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

  // ---------- trigger / persistent ----------
  //
  // Trigger blocks register against the board's AbilityTriggerBus via the
  // host's `registerTrigger` callback. When the matching event fires later,
  // the bus marks the caster's token with the blue "!" overlay (same flow as
  // the built-in opportunity attack). The user clicks it to resolve manually.
  //
  // If the host doesn't expose `registerTrigger` (e.g. the runner is being
  // used outside the VTT), or the block has no structured `match`, we fall
  // back to posting a chat reminder so the GM at least sees what should happen.

  function collectTargetIdsForGroup(state, groupName) {
    if (!groupName) return [];
    const group = state.groups?.[groupName];
    if (!Array.isArray(group)) return [];
    return group.map((entry) => entry?.id).filter(Boolean);
  }

  async function runTriggerBlock(state, block) {
    const ctx = state.context || {};
    const casterId = state.sourcePlacement?.id || "";
    const targetGroupRef = block.target || "";
    const targetIds = collectTargetIdsForGroup(state, targetGroupRef);
    const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join("; ");

    if (block.match && typeof ctx.registerTrigger === "function") {
      try {
        await ctx.registerTrigger({
          casterId,
          abilityId: state.action?.id || `ability_${block.id}`,
          abilityName: state.action?.name || "",
          match: block.match,
          effects: block.effects || [],
          targetGroup: targetGroupRef,
          targetIds,
          condition: block.condition || "",
          note: block.note || "",
        });
        const lines = [`${state.heroName} - ${state.action.name || "Ability"} trigger armed:`];
        if (block.condition) lines.push(`When: ${block.condition}`);
        if (inner) lines.push(`Then: ${inner}`);
        if (block.note) lines.push(block.note);
        await postChat(ctx, { message: lines.join("\n") });
        return;
      } catch (err) {
        console.warn("[AbilityAutomationRunner] registerTrigger failed; falling back to chat reminder.", err);
        // Fall through to chat-only path below.
      }
    }

    const lines = [`${state.heroName} - ${state.action.name || "Ability"} trigger:`];
    if (block.condition) lines.push(`When: ${block.condition}`);
    if (inner) lines.push(`Then: ${inner}`);
    if (block.note) lines.push(block.note);
    await postChat(ctx, { message: lines.join("\n") });
  }

  async function runPersistentBlock(state, block) {
    const ctx = state.context || {};
    const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join("; ");

    // Find the area template to use as the zone footprint. Prefer the area
    // referenced by `block.target`, then the most recent area placed, then
    // fall back to chat-only if no template exists.
    const areaKey = block.target || state.currentArea || "primary";
    const areaRecord = state.areas?.[areaKey] || (state.currentArea ? state.areas?.[state.currentArea] : null);

    if (areaRecord && typeof ctx.registerPersistentZone === "function") {
      try {
        // Snapshot caster attribute bonuses so the zone can resolve damage
        // amounts at tick time without re-reading the caster's sheet.
        const attributeBonuses = {};
        if (typeof ctx.getAttributeBonus === "function") {
          for (const attr of ["Might", "Agility", "Reason", "Intuition", "Presence"]) {
            attributeBonuses[attr] = ctx.getAttributeBonus(attr) || 0;
          }
        }
        const result = await ctx.registerPersistentZone({
          casterId: state.sourcePlacement?.id || "",
          abilityId: state.action?.id || `ability_${block.id}`,
          abilityName: state.action?.name || "",
          area: areaRecord,
          upkeep: {
            cost: Number(block.cost) || 0,
            resource: block.resource || "",
          },
          tickAt: block.tickAt || "startOfTurn",
          // Per-creature triggers (v3.1). Recognized: "onEnter" fires on a
          // creature the first time they enter the zone this round, and
          // "onOccupantTurnStart" fires when a creature inside starts their
          // own turn. Effects apply only to the triggering creature.
          triggers: Array.isArray(block.triggers) ? [...block.triggers] : [],
          effects: block.effects || [],
          attributeBonuses,
          note: block.note || "",
        });
        const zoneId = result?.zoneId || "(zone)";
        const lines = [`${state.heroName} - ${state.action.name || "Ability"} persistent zone armed (${zoneId}):`];
        lines.push(`Cost ${block.cost || 0}${block.resource ? ` ${block.resource}` : ""} at ${block.tickAt || "startOfTurn"}.`);
        if (inner) lines.push(`Each tick: ${inner}`);
        if (block.note) lines.push(block.note);
        await postChat(ctx, { message: lines.join("\n") });
        return;
      } catch (err) {
        console.warn("[AbilityAutomationRunner] registerPersistentZone failed; falling back to chat reminder.", err);
        // Fall through to the chat-only path so the GM at least sees what should happen.
      }
    }

    const lines = [
      `${state.heroName} - ${state.action.name || "Ability"} persistent zone:`,
      `Cost ${block.cost || 0}${block.resource ? ` ${block.resource}` : ""} at ${block.tickAt}.`,
    ];
    if (inner) lines.push(`Each tick: ${inner}`);
    if (!areaRecord) lines.push("(No area placed — manual tracking required.)");
    if (block.note) lines.push(block.note);
    await postChat(ctx, { message: lines.join("\n") });
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
      case "ifStrained":
        return applyIfStrainedEffect(state, effect, targets, ctx);
      case "ifMark":
        return applyIfMarkEffect(state, effect, targets, ctx);
      case "ifScopedFlag":
        return applyIfScopedFlagEffect(state, effect, targets, ctx);
      case "setScopedFlag":
        return applySetScopedFlagEffect(state, effect, targets, ctx);
      case "applyMark":
        return applyMarkEffect(state, effect, targets, ctx);
      case "endMark":
        return applyEndMarkEffect(state, effect, targets, ctx);
      case "halveTriggeringDamage":
        return applyHalveTriggeringDamageEffect(state, effect, targets, ctx);
      case "heal":
        return applyHealEffect(state, effect, targets, ctx, false);
      case "temporaryStamina":
        return applyHealEffect(state, effect, targets, ctx, true);
      case "teleport":
        return applyTeleportEffect(state, effect, targets, ctx);
      case "swap":
        return applySwapEffect(state, effect, targets, ctx);
      case "freeStrike":
        return applyFreeStrikeEffect(state, effect, targets, ctx);
      case "cascade":
        return reminderEffect(state, effect, targets, "Cascade");
      case "resourceGain":
        return applyResourceGainEffect(state, effect, targets, ctx);
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
      ? resolveAttributeBonusForDamage(state, effect.attribute)
      : 0;
    const damageType = effect.damageType && effect.damageType !== "untyped" ? effect.damageType : "";
    const lines = [];
    let visibleHidden = 0;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const diceAmount = rollDiceFormula(effect.amountDice);
      let markBonus = 0;
      if (effect.markBonusDice && typeof state.context.checkMark === "function") {
        const check = await state.context.checkMark({
          predicate: effect.markPredicate || "targetJudgedBySelf",
          markType: "judgment",
          sourceId: state.sourcePlacement?.id || "",
          targetId: target.id,
        });
        if (check?.matched) markBonus = rollDiceFormula(effect.markBonusDice);
      }
      const amount = Math.max(0, baseAmount + attributeBonus + diceAmount + markBonus);
      const result =
        typeof state.context.applyDamage === "function"
          ? await state.context.applyDamage({
              placementId: target.id,
              sourceId: state.sourcePlacement?.id || "",
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
    const isNumeric = effect.name === "damageWeakness" || effect.name === "damageImmunity";
    // For "other" surface the free-text description as the visible condition
    // name. damageWeakness / damageImmunity keep their canonical name so the
    // damage handler can recognize them; their numeric riders flow through
    // the condition object.
    const name = !isNumeric && effect.name === "other" && effect.text ? effect.text : effect.name;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const conditionPayload = { name, duration };
      if (isNumeric) {
        conditionPayload.amount = asInt(effect.amount, 0);
        if (effect.damageType) conditionPayload.damageType = effect.damageType;
      }
      await state.context.applyCondition?.({
        placementId: target.id,
        condition: conditionPayload,
        sourceId: state.sourcePlacement?.id || "",
      });
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: applies ${P.describeEffect(effect)}.`,
    });
  }

  async function applyIfStrainedEffect(state, effect, _targets, ctx) {
    const strained = isCasterStrained(state);
    const branch = strained ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    // Branch reuses the current target group — same convention as ifKeyword.
    await applyEffects(state, branch, null, ctx);
  }

  // Strained = caster's heroic resource has dipped below 0. The Talent class's
  // Clarity rules push the resource into the negatives intentionally; the only
  // engine signal we need is "is the value < 0 right now". Read from the hero
  // snapshot that the panel passed in at runner.open().
  function isCasterStrained(state) {
    const value = state.hero?.resource?.value;
    if (value === null || value === undefined || value === "") return false;
    const parsed = asInt(value, 0);
    return parsed < 0;
  }

  // Soak half of the triggering damage by HEALING the caster back the missing
  // portion. The board has already applied the full damage by the time the
  // trigger resolves (damage flows: applyDamageHealToPlacement → triggerFire
  // → markReady → user clicks → resolves). Healing the difference is the only
  // way to retroactively report "you took half damage" without re-architecting
  // the damage pipeline. `rounding: "up"` means the player still takes the
  // larger half (book-default for Resist the Unnatural / Unearthly Reflexes).
  async function applyHalveTriggeringDamageEffect(state, effect, _targets, _ctx) {
    const payload = state.triggerPayload || null;
    const originalAmount = asInt(payload?.amount, 0);
    if (!payload || !originalAmount) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: half-damage requested but no triggering damage event is in scope.`,
      });
      return;
    }
    const rounding = effect?.rounding === "down" ? "down" : "up";
    const taken = rounding === "down"
      ? Math.floor(originalAmount / 2)
      : Math.ceil(originalAmount / 2);
    const refund = Math.max(0, originalAmount - taken);
    const placementId = payload.placementId || payload.targetId || state.sourcePlacement?.id || "";
    if (!placementId) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: half-damage refund had no placement id; apply manually.`,
      });
      return;
    }
    if (!refund) {
      // Already at minimum (1 damage → ceil = 1 → refund 0). Nothing to do.
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: triggering damage too small to halve further (took ${taken}).`,
      });
      return;
    }
    if (typeof state.context.applyHeal !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: refund ${refund} stamina (heal hook missing — apply manually).`,
      });
      return;
    }
    const result = await state.context.applyHeal({
      placementId,
      amount: refund,
      allowTempHp: false,
      abilityName: state.action.name || "Ability",
    });
    const targetName = result?.name || state.heroName || "Caster";
    const display = result?.max !== null && result?.max !== undefined
      ? `${result.current}/${result.max}`
      : result?.current !== undefined
        ? `${result.current}`
        : "?";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${targetName} takes ${taken} of ${originalAmount} (refunded ${refund} stamina; ${display}).`,
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

    if (!recoveries && !flatAmount) return;

    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;

      // Resolve the actual heal amount for this target. With `recoveries`,
      // each target spends one of their own recoveries (chat reminder, since
      // handler.php has no recovery-decrement endpoint) and heals by their
      // own `recoveryValue`. If we can't read the target's sheet, fall back
      // to the flatAmount or a chat reminder.
      let amount = flatAmount;
      let recoveryValueUsed = 0;
      let recoveryUnknown = false;
      if (recoveries) {
        const resolved = typeof state.context.getRecoveryValueForTarget === "function"
          ? await state.context.getRecoveryValueForTarget({ placementId: target.id })
          : null;
        if (Number.isFinite(resolved?.recoveryValue) && resolved.recoveryValue > 0) {
          recoveryValueUsed = Math.trunc(resolved.recoveryValue) * recoveries;
          amount = recoveryValueUsed + flatAmount;
        } else {
          recoveryUnknown = true;
        }
      }

      if (!amount) {
        if (recoveryUnknown) {
          lines.push(`${target.name || "Target"}: spend ${recoveries} recovery → heal recovery value (apply manually).`);
        }
        continue;
      }

      const result = typeof state.context.applyHeal === "function"
        ? await state.context.applyHeal({
            placementId: target.id,
            amount,
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
      const recoveryNote = recoveries
        ? ` (spent ${recoveries} recovery → ${recoveryValueUsed}${flatAmount ? `+${flatAmount}` : ""}; decrement recoveries on sheet)`
        : "";
      lines.push(`${targetName} recovers ${result.change || amount} stamina${overage}${recoveryNote} (${display}).`);
    }
    if (lines.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
      });
    }
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

  function rollDiceFormula(formula) {
    const text = String(formula || "").trim().toLowerCase();
    if (!text) return 0;
    const match = text.match(/^(\d+)d(\d+)$/);
    if (!match) return asInt(text, 0);
    const count = Math.max(0, asInt(match[1], 0));
    const sides = Math.max(1, asInt(match[2], 1));
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      total += 1 + Math.floor(Math.random() * sides);
    }
    return total;
  }

  async function applyIfMarkEffect(state, effect, targets, ctx) {
    const targetGroupName = effect.target || state.currentGroup || "primary";
    const checkTargets = effect.target ? getTargetGroup(state, effect.target) : targets;
    let matched = false;
    if (typeof state.context.checkMark === "function") {
      for (const target of checkTargets || []) {
        if (!target?.id) continue;
        const result = await state.context.checkMark({
          predicate: effect.predicate || "targetJudgedBySelf",
          markType: effect.markType || "judgment",
          sourceId: state.sourcePlacement?.id || "",
          targetId: target.id,
          triggerPayload: state.triggerPayload || null,
        });
        if (result?.matched) {
          matched = true;
          break;
        }
      }
    }
    const branch = matched ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    await applyEffects(state, branch, targetGroupName, ctx);
  }

  async function applyMarkEffect(state, effect, targets) {
    const groupName = effect.target || state.currentGroup || "primary";
    const markTargets = effect.target ? getTargetGroup(state, effect.target) : targets;
    const target = (markTargets || []).find((item) => item?.id);
    if (!target?.id) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: no target to mark.`,
      });
      return;
    }
    if (typeof state.context.applyMark !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: mark ${target.name || "target"} manually.`,
      });
      return;
    }
    const result = await state.context.applyMark({
      markType: effect.markType || "judgment",
      sourceId: state.sourcePlacement?.id || "",
      sourceName: state.heroName || state.sourcePlacement?.name || "Source",
      targetId: target.id,
      targetName: target.name || "",
      abilityId: state.action?.id || "",
      abilityName: state.action?.name || "Ability",
      duration: effect.duration || "endOfEncounter",
      exclusivePerSource: effect.exclusivePerSource !== false,
      exclusivePerTarget: effect.exclusivePerTarget !== false,
      transfer: effect.transfer !== false,
    });
    const oldText = result?.oldTargetName ? ` Previous ${effect.markType || "mark"} on ${result.oldTargetName} ends.` : "";
    const replacedText = result?.replacedSourceName ? ` It replaces ${result.replacedSourceName}'s mark.` : "";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${target.name || "target"} is judged.${oldText}${replacedText}`,
    });
    if (groupName) setTargetGroup(state, groupName, [target]);
  }

  async function applyEndMarkEffect(state, effect, targets) {
    if (typeof state.context.endMark !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: end ${effect.markType || "mark"} manually.`,
      });
      return;
    }
    const markTargets = effect.target ? getTargetGroup(state, effect.target) : targets;
    const result = await state.context.endMark({
      markType: effect.markType || "judgment",
      sourceId: state.sourcePlacement?.id || "",
      targetId: markTargets?.[0]?.id || "",
      scope: effect.scope || "selfOwned",
      reason: "ability",
    });
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ended ${effect.markType || "mark"}${result?.targetName ? ` on ${result.targetName}` : ""}.`,
    });
  }

  function resolveScopedFlagIds(state, effect, targets) {
    const payload = state.triggerPayload?.payload || state.triggerPayload || {};
    const sourceId = effect.source === "eventSource"
      ? payload.sourceId || ""
      : state.sourcePlacement?.id || "";
    let targetId = "";
    if (effect.target === "eventTarget") {
      targetId = payload.targetId || payload.placementId || "";
    } else if (effect.target === "judgedTarget" && typeof state.context.getMarkedTarget === "function") {
      // This hook is optional; fall back to current target when absent.
      targetId = "";
    }
    if (!targetId) targetId = (targets || []).find((t) => t?.id)?.id || payload.targetId || payload.placementId || "";
    return { sourceId, targetId };
  }

  async function applyIfScopedFlagEffect(state, effect, targets, ctx) {
    if (typeof state.context.checkScopedFlag !== "function") return;
    const ids = resolveScopedFlagIds(state, effect, targets);
    const result = await state.context.checkScopedFlag({
      scope: effect.scope || "round",
      key: effect.key || "",
      sourceId: ids.sourceId,
      targetId: ids.targetId,
    });
    const isSet = Boolean(result?.set);
    const matched = effect.mode === "set" ? isSet : !isSet;
    const branch = matched ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    await applyEffects(state, branch, null, ctx);
  }

  async function applySetScopedFlagEffect(state, effect, targets) {
    if (typeof state.context.setScopedFlag !== "function") return;
    const ids = resolveScopedFlagIds(state, effect, targets);
    await state.context.setScopedFlag({
      scope: effect.scope || "round",
      key: effect.key || "",
      sourceId: ids.sourceId,
      targetId: ids.targetId,
    });
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

  async function applyResourceGainEffect(state, effect, _targets, _ctx) {
    const amount = asInt(effect.amount, 0);
    if (!amount) return;
    const resourceName = effect.resource || "";
    if (typeof state.context.applyResourceGain === "function") {
      const result = await state.context.applyResourceGain({
        amount,
        resource: resourceName,
        abilityName: state.action.name || "Ability",
      });
      if (result?.skipped && result.reason === "resource-mismatch") {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — caster's resource is "${result.resource}", manual adjust needed.`,
        });
        return;
      }
      if (result?.applied !== undefined) {
        const sign = result.applied >= 0 ? "+" : "";
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: ${sign}${result.applied} ${result.resource || resourceName || "resource"} (now ${result.current}).`,
        });
        return;
      }
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — apply manually.`,
    });
  }

  async function applyTeleportEffect(state, effect, targets, _ctx) {
    if (!targets.length) return;
    const distance = asInt(effect.distance, 0);
    if (!distance) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: teleport 0 (skipped).`,
      });
      return;
    }
    if (typeof state.context.applyTeleport !== "function") {
      await reminderEffect(state, effect, targets, "Teleport");
      return;
    }
    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result = await state.context.applyTeleport({
        placementId: target.id,
        distance,
        abilityName: state.action.name || "Ability",
        sourcePlacement: state.sourcePlacement || null,
      });
      if (!result || result.skipped) {
        lines.push(`${target.name || "Target"}: teleport ${distance} skipped.`);
        continue;
      }
      const moved = Number.isFinite(result.movedDistance) ? result.movedDistance : distance;
      lines.push(`${result.name || target.name || "Target"} teleports ${moved} square${moved === 1 ? "" : "s"}.`);
    }
    if (lines.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
      });
    }
  }

  async function applySwapEffect(state, effect, targets, _ctx) {
    if (!targets.length) return;
    if (typeof state.context.applySwap !== "function") {
      await reminderEffect(state, effect, targets, "Swap");
      return;
    }
    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const result = await state.context.applySwap({
        targetId: target.id,
        sourcePlacement: state.sourcePlacement || null,
        abilityName: state.action.name || "Ability",
      });
      if (!result || result.skipped) {
        lines.push(`${target.name || "Target"}: swap skipped${result?.reason ? ` (${result.reason})` : ""}.`);
        continue;
      }
      lines.push(`${state.heroName} and ${result.name || target.name || "Target"} swap places.`);
    }
    if (lines.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
      });
    }
  }

  async function applyFreeStrikeEffect(state, effect, targets, _ctx) {
    if (typeof state.context.runFreeStrike !== "function") {
      await reminderEffect(state, effect, targets, "Free Strike");
      return;
    }
    // "by" = the entity *making* the free strike. By default this is whoever
    // the parent ability most recently targeted (e.g., "the target makes a
    // free strike against an ally" → the parent target is the by-entity).
    // If there's no target group yet, fall back to the caster.
    const byIds = targets.length
      ? targets.map((t) => t?.id).filter(Boolean)
      : state.sourcePlacement?.id
        ? [state.sourcePlacement.id]
        : [];
    if (!byIds.length) {
      await reminderEffect(state, effect, targets, "Free Strike");
      return;
    }
    const result = await state.context.runFreeStrike({
      byCandidateIds: byIds,
      againstPredicate: effect.against || "creature",
      text: effect.text || "",
      abilityName: state.action.name || "Ability",
      casterName: state.heroName,
    });
    if (result?.skipped) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: free strike skipped.`,
      });
      return;
    }
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
    // Apply optional whenWinded override before dispatch. Universal — works for
    // any actor that exposes HP/stamina via state.hero or state.context.
    const effective = applyWhenWindedToBlock(state, block);
    switch (effective.type) {
      case "target":
        return runTargetBlock(state, effective);
      case "powerRoll":
        return runPowerRollBlock(state, effective);
      case "effect":
        return runEffectBlock(state, effective);
      case "trigger":
        return runTriggerBlock(state, effective);
      case "persistent":
        return runPersistentBlock(state, effective);
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
      if (effect.kind === "ifMark") {
        walkEffectList(effect.then || [], visit);
        walkEffectList(effect.else || [], visit);
      }
      if (effect.kind === "ifScopedFlag") {
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
      // Pre-suggested target id from a triggered action (e.g. the mover
      // that triggered an opp-attack). Threaded into every target picker
      // config so the board can paint a continuous red pulse on it.
      suggestedTargetId: options?.suggestedTargetId || "",
      // Captured firing-event payload from a triggered action. Set when the
      // panel resolves a ready trigger; consumed by `halveTriggeringDamage`
      // and similar trigger-context-aware effects. Null for non-triggered
      // ability runs.
      triggerPayload: options?.triggerPayload || null,
      groups: {},
      currentGroup: null,
      // Area templates placed by area-target blocks. Keyed by the target
      // block's `name`. Persistent zone registration looks here to find the
      // cells the zone should occupy.
      areas: {},
      currentArea: null,
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
      if (typeof state.context.fireTriggerEvent === "function") {
        state.context.fireTriggerEvent({
          eventType: "actionUsed",
          payload: {
            actorId: state.sourcePlacement?.id || "",
            actionId: state.action?.id || "",
            actionName: state.action?.name || "Ability",
            actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || "main",
            keywords: getAbilityKeywords(state),
          },
        });
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
