// Ability Automation — v3 Runtime.
//
// Walks `automation.cards` in order. For each block:
//   target     → asks the VTT board to select tokens or place an area template
//   powerRoll  → rolls 2d10 + attribute, pauses for tier confirm, applies tier effects
//   effect     → applies a list of effects without a roll
//   trigger    → registers a passive listener when match config is present
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

  // Hosts whose close has already been handled, so the UIKit onClose hook
  // doesn't re-dispatch a cancel for programmatic closes.
  const closedRunnerHosts = new WeakSet();

  function removeRunnerHost(host) {
    if (!host) return;
    closedRunnerHosts.add(host);
    const modal = host.querySelector(".power-roll-runner__modal");
    host.remove();
    if (global.UIKit && modal) global.UIKit.closeModal(modal);
  }

  function closeRunner() {
    removeRunnerHost(document.getElementById(RUNNER_ID));
  }

  function isVttAutomationContext() {
    return Boolean(
      document.body?.classList?.contains("vtt-body")
        || document.querySelector(".vtt-workspace")
        || document.querySelector(".vtt-character-summary")
    );
  }

  function getVttAutomationInitialPosition(modal) {
    const styles = document.body ? window.getComputedStyle(document.body) : null;
    const panelWidth = parseFloat(styles?.getPropertyValue("--vtt-character-panel-width")) || 380;
    const panelOffset = parseFloat(styles?.getPropertyValue("--vtt-character-panel-offset")) || 16;
    const effectiveWidth = Math.min(panelWidth, Math.max(0, window.innerWidth - panelOffset * 2));
    const left = effectiveWidth + panelOffset;
    const top = Math.max(96, Math.round(window.innerHeight * 0.25));
    return constrainRunnerPosition(left, top, modal);
  }

  function getRunnerDefaultPosition(modal, variant, anchor = null) {
    if (isVttAutomationContext()) {
      return getVttAutomationInitialPosition(modal);
    }
    if (anchor && typeof anchor === "object") {
      const left = Number.isFinite(anchor.right) ? anchor.right + 12 : Number(anchor.left) || 24;
      const top = Number.isFinite(anchor.top) ? anchor.top : 72;
      return constrainRunnerPosition(left, top, modal);
    }
    const panel = document.querySelector(".vtt-character-summary--open, .vtt-character-summary");
    const panelRect = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null;
    const panelRight =
      panelRect && panelRect.width > 40 && panelRect.left < window.innerWidth ? panelRect.right : 0;
    const left = Math.max(16, panelRight ? panelRight + 16 : 24);
    const top = variant === "target" ? 76 : 72;
    return constrainRunnerPosition(left, top, modal);
  }

  // When the right-side chat panel is open it overlays the right edge of the
  // viewport (see layout.css / character-summary.css). Reserve that width so
  // the runner window never slides underneath the chat. Returns 0 outside the
  // VTT (or when chat is closed), where the body class is never set.
  function getChatPanelReservedWidth() {
    if (typeof document === "undefined" || !document.body) return 0;
    if (!document.body.classList.contains("chat-panel-is-open")) return 0;
    const styles = window.getComputedStyle(document.body);
    const width = parseFloat(styles.getPropertyValue("--chat-panel-width")) || 360;
    const offset = parseFloat(styles.getPropertyValue("--chat-panel-offset")) || 20;
    return width + offset + 8;
  }

  function constrainRunnerPosition(left, top, modal) {
    const rect = modal?.getBoundingClientRect();
    const width = rect?.width || 360;
    const height = rect?.height || 220;
    const padding = 12;
    const reservedRight = getChatPanelReservedWidth();
    const maxLeft = Math.max(padding, window.innerWidth - reservedRight - width - padding);
    const maxTop = Math.max(padding, window.innerHeight - height - padding);
    return {
      left: Math.min(Math.max(padding, left), maxLeft),
      top: Math.min(Math.max(padding, top), maxTop),
    };
  }

  function positionRunnerWindow(host, variant, anchor = null) {
    const modal = host.querySelector(".power-roll-runner__modal");
    if (!(modal instanceof HTMLElement)) return;
    requestAnimationFrame(() => {
      const position = getRunnerDefaultPosition(modal, variant, anchor);
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

  function makeHost(title, eyebrow, variant = "power", anchor = null) {
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
        closedRunnerHosts.add(host);
        host.dispatchEvent(new CustomEvent("automation-cancel"));
        closeRunner();
      }
    });
    const modal = host.querySelector(".power-roll-runner__modal");
    if (global.UIKit && modal instanceof HTMLElement) {
      modal.tabIndex = -1;
      global.UIKit.openModal(modal, {
        initialFocus: modal,
        onClose: () => {
          // Esc through UIKit behaves like the close button.
          if (closedRunnerHosts.has(host)) return;
          closedRunnerHosts.add(host);
          host.dispatchEvent(new CustomEvent("automation-cancel"));
          host.remove();
        },
      });
    }
    makeRunnerDraggable(host);
    positionRunnerWindow(host, variant, anchor);
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
    const edge = Math.max(0, Math.min(2, asInt(edgeCount)));
    const bane = Math.max(0, Math.min(2, asInt(baneCount)));
    const net = edge - bane;
    if (net === 0) return { edge, bane, net, bonus: 0, tierShift: 0, label: "Normal roll" };
    if (net > 0) {
      return {
        edge,
        bane,
        net,
        bonus: net >= 2 ? 0 : 2,
        tierShift: net >= 2 ? 1 : 0,
        label: net >= 2 ? "Double Edge (tier up)" : "Edge (+2)",
      };
    }
    return {
      edge,
      bane,
      net,
      bonus: net <= -2 ? 0 : -2,
      tierShift: net <= -2 ? -1 : 0,
      label: net <= -2 ? "Double Bane (tier down)" : "Bane (-2)",
    };
  }

  function getActiveEdgeControl(edgeState) {
    const net = asInt(edgeState?.net);
    if (net >= 2) return { kind: "edge", count: 2 };
    if (net === 1) return { kind: "edge", count: 1 };
    if (net === -1) return { kind: "bane", count: 1 };
    if (net <= -2) return { kind: "bane", count: 2 };
    return null;
  }

  function getManualEdgeBaneCounts(state) {
    return {
      edge: Math.max(0, Math.min(2, asInt(state?.edgeCount))),
      bane: Math.max(0, Math.min(2, asInt(state?.baneCount))),
    };
  }

  function setManualEdgeBaneSelection(state, kind, count) {
    const normalizedKind = kind === "bane" ? "bane" : "edge";
    const normalizedCount = Math.max(1, Math.min(2, asInt(count, 1)));
    const manual = getManualEdgeBaneCounts(state);
    const isActive = manual[normalizedKind] === normalizedCount && manual[normalizedKind === "edge" ? "bane" : "edge"] === 0;
    state.edgeCount = isActive || normalizedKind === "bane" ? 0 : normalizedCount;
    state.baneCount = isActive || normalizedKind === "edge" ? 0 : normalizedCount;
    return { kind: normalizedKind, count: normalizedCount, active: !isActive };
  }

  function edgeControlIsActive(edgeState, kind, count) {
    const active = getActiveEdgeControl(edgeState);
    return Boolean(active && active.kind === kind && active.count === count);
  }

  function renderEdgeControlButton(manualEdgeState, kind, count, label, title) {
    const active = edgeControlIsActive(manualEdgeState, kind, count);
    const adjustAttribute = kind === "edge" ? "data-power-roll-edge-adjust" : "data-power-roll-bane-adjust";
    const kindClass = kind === "edge" ? "dice-btn--edge" : "dice-btn--bane";
    return `
      <button
        class="dice-btn ${kindClass} power-roll-runner__edge-btn ${active ? "power-roll-runner__edge-btn--active" : ""}"
        type="button"
        ${adjustAttribute}="${count}"
        title="${escapeHtml(title)}"
        aria-pressed="${active ? "true" : "false"}"
      >${escapeHtml(label)}</button>
    `;
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
    const sourceToken = state?.sourcePlacement || state?.sourceToken;
    const livePlacement = sourceToken?.id && typeof state?.context?.getPlacementById === "function"
      ? state.context.getPlacementById(sourceToken.id)
      : null;
    const candidates = [
      { cur: livePlacement?.hp?.current, max: livePlacement?.hp?.max },
      { cur: sourceToken?.hp?.current, max: sourceToken?.hp?.max },
      { cur: state?.hero?.vitals?.currentStamina, max: state?.hero?.vitals?.staminaMax },
      { cur: state?.hero?.currentStamina, max: state?.hero?.maxStamina },
      { cur: state?.hero?.hp, max: state?.hero?.maxHp },
      { cur: state?.hero?.stamina, max: state?.hero?.maxStaminaTotal },
      { cur: state?.sourceToken?.hp, max: state?.sourceToken?.maxHp },
    ];
    for (const c of candidates) {
      if (c.cur == null || c.max == null || String(c.cur).trim() === "" || String(c.max).trim() === "") continue;
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

  function resolveAbilityTestSkill(state, block) {
    if (block?.rollEvent !== "abilityTest") {
      return { skill: "", bonus: 0 };
    }
    const requested = String(block.skill || state.action?.skill || state.action?.name || "").trim();
    if (!requested || typeof state.context.getSkillBonus !== "function") {
      return { skill: requested, bonus: 0 };
    }
    const result = state.context.getSkillBonus(requested);
    if (result && typeof result === "object") {
      return {
        skill: String(result.skill || requested).trim(),
        bonus: asInt(result.bonus, 0),
      };
    }
    return { skill: requested, bonus: asInt(result, 0) };
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

  // Resolve an `amountFrom` rider to an integer using the captured trigger
  // payload. `state.triggerPayload` is set when a ready trigger is resolved
  // (see runner.open `options.triggerPayload`); without it (e.g. a normal,
  // non-reactive ability), this contributes 0. The raw captured value is
  // scaled by multiplier × fraction, then rounded — default DOWN, matching the
  // Draw Steel "round down when you halve" convention. The result is added on
  // top of the effect's own amount/attribute/dice by the caller.
  function resolveTriggerValue(state, amountFrom) {
    if (!amountFrom || typeof amountFrom !== "object") return 0;
    if (amountFrom.source === "damageDealt") return scaleTriggerValue(asInt(state.damageDealt, 0), amountFrom);
    if (amountFrom.source === "count") return asInt(state.countValue, 0);
    const payload = state.triggerPayload?.payload && typeof state.triggerPayload.payload === "object"
      ? state.triggerPayload.payload
      : state.triggerPayload || null;
    if (!payload) return 0;
    let raw;
    switch (amountFrom.source) {
      case "triggeringForcedMovement":
        raw = asInt(payload.distance ?? payload.movedDistance, 0);
        break;
      case "triggeringDamage":
      default:
        raw = asInt(payload.amount, 0);
        break;
    }
    return scaleTriggerValue(raw, amountFrom);
  }

  function scaleTriggerValue(raw, amountFrom) {
    if (!raw) return 0;
    const multiplier = Number.isFinite(amountFrom.multiplier) ? amountFrom.multiplier : 1;
    const fraction = Number.isFinite(amountFrom.fraction) ? amountFrom.fraction : 1;
    const scaled = raw * multiplier * fraction;
    return amountFrom.rounding === "up" ? Math.ceil(scaled) : Math.floor(scaled);
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
    if (Array.isArray(name)) {
      const seen = new Set();
      const merged = [];
      name.forEach((groupName) => {
        getTargetGroup(state, groupName).forEach((target) => {
          const key = target?.id || target?.name || JSON.stringify(target);
          if (!key || seen.has(key)) return;
          seen.add(key);
          merged.push(target);
        });
      });
      return merged;
    }
    const groupName = name || state.currentGroup || "primary";
    if (String(groupName || "").toLowerCase() === "self") {
      return state.sourcePlacement?.id ? [state.sourcePlacement] : [];
    }
    const eventTarget = resolveTriggerPlacementGroup(state, groupName);
    if (eventTarget) return eventTarget;
    // "target" means the ability's target: a group of that name, or else the targets picked last.
    if (String(groupName).toLowerCase() === "target" && !state.groups[groupName]) {
      return state.groups[state.currentGroup || "primary"] || [];
    }
    return state.groups[groupName] || [];
  }

  function normalizeRollSuggestion(input) {
    if (!input || typeof input !== "object") return null;
    const kind = String(input.kind || "").trim().toLowerCase();
    if (kind !== "edge" && kind !== "bane" && kind !== "damage" && kind !== "potency") return null;
    const id = String(input.id || `${kind}-${input.label || ""}`).trim();
    const label = String(input.label || id).trim();
    if (!id || !label) return null;
    return {
      id,
      kind,
      label,
      reason: typeof input.reason === 'string' ? input.reason : '',
      active: input.active !== false,
      count: Math.max(1, Math.min(2, asInt(input.count, 1))),
      // +damage / +potency suggestions (timed buffs): the bonus they add.
      amount: kind === "damage" || kind === "potency" ? asInt(input.amount, 0) : 0,
      conditionRef: input.conditionRef && typeof input.conditionRef === "object"
        ? {
            placementId: String(input.conditionRef.placementId || ""),
            conditionIndex: asInt(input.conditionRef.conditionIndex, -1),
          }
        : null,
      consume: String(input.consume || "").trim(),
    };
  }

  function getActiveRollSuggestionCounts(state) {
    const counts = { edge: 0, bane: 0 };
    const suggestions = Array.isArray(state.rollSuggestions) ? state.rollSuggestions : [];
    suggestions.forEach((suggestion) => {
      if (!suggestion?.active) return;
      const count = Math.max(1, Math.min(2, asInt(suggestion.count, 1)));
      if (suggestion.kind === "edge") counts.edge = Math.min(2, counts.edge + count);
      if (suggestion.kind === "bane") counts.bane = Math.min(2, counts.bane + count);
    });
    return counts;
  }

  function getTotalEdgeBaneCounts(state) {
    const suggested = getActiveRollSuggestionCounts(state);
    const manual = getManualEdgeBaneCounts(state);
    return {
      edge: Math.max(manual.edge, suggested.edge),
      bane: Math.max(manual.bane, suggested.bane),
    };
  }

  function getRollSuggestionLabel(state) {
    const active = (Array.isArray(state.rollSuggestions) ? state.rollSuggestions : [])
      .filter((suggestion) => suggestion?.active)
      .map((suggestion) => suggestion.label);
    // One buff can give an edge and +damage: its name once.
    const names = [...new Set(active)];
    return names.length ? `Suggested: ${names.join(", ")}` : "Suggested: none";
  }

  function resolveTriggerPlacementGroup(state, name) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;
    const payload = state.triggerPayload?.payload && typeof state.triggerPayload.payload === "object"
      ? state.triggerPayload.payload
      : state.triggerPayload || null;
    if (!payload) return null;
    const idsByKey = {
      eventactor: [payload.actorId || payload.placementId || payload.sourceId || payload.targetId || ""],
      triggeractor: [payload.actorId || payload.placementId || payload.sourceId || payload.targetId || ""],
      eventsource: [payload.sourceId || payload.actorId || payload.placementId || ""],
      triggersource: [payload.sourceId || payload.actorId || payload.placementId || ""],
      eventtarget: Array.isArray(payload.targetIds) && payload.targetIds.length
        ? payload.targetIds
        : [payload.targetId || payload.placementId || ""],
      triggertarget: Array.isArray(payload.targetIds) && payload.targetIds.length
        ? payload.targetIds
        : [payload.targetId || payload.placementId || ""],
    };
    if (!Object.prototype.hasOwnProperty.call(idsByKey, key)) return null;
    const ids = idsByKey[key].filter(Boolean);
    if (!ids.length) return [];
    return ids.map((id) => {
      const placement = state.context.getPlacementById?.(id);
      if (placement && typeof placement === "object") return placement;
      const name =
        payload.actorId === id ? payload.actorName :
        payload.sourceId === id ? payload.sourceName :
        payload.targetId === id ? payload.targetName :
        "";
      return { id, name: name || id };
    });
  }

  function setTargetGroup(state, name, tokens) {
    const groupName = name || "primary";
    state.groups[groupName] = Array.isArray(tokens) ? tokens : [];
    state.currentGroup = groupName;
  }

  // ---------- target block ----------

  function titleCaseWord(value) {
    const text = String(value || "").trim();
    if (!text) return "Target";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function describeTargetCount(block) {
    const count = block?.count;
    const value = count && typeof count === "object" ? asInt(count.value, 1) : asInt(count, 1);
    const upTo = count && typeof count === "object" && count.mode === "upTo";
    if (value > 1) return `${upTo ? "up to " : ""}${value}`;
    return upTo ? "up to one" : "one";
  }

  function effectListContainsKind(effects, kind) {
    if (!Array.isArray(effects)) return false;
    for (const effect of effects) {
      if (!effect || typeof effect !== "object") continue;
      if (effect.kind === kind) return true;
      if (effect.kind === "potency" && (effectListContainsKind(effect.onFail, kind) || effectListContainsKind(effect.onResist, kind))) return true;
      if (effect.kind === "spend" && effectListContainsKind(effect.effects, kind)) return true;
      if (effect.kind === "ifKeyword" || effect.kind === "ifPrompt" || effect.kind === "ifMark" || effect.kind === "ifScopedFlag" || effect.kind === "ifDistance" || effect.kind === "ifZone" || effect.kind === "ifStrained" || effect.kind === "ifTarget" || effect.kind === "ifRoll" || effect.kind === "ifCounter") {
        if (effectListContainsKind(effect.then, kind) || effectListContainsKind(effect.else, kind)) return true;
      }
      if (effect.kind === "aura" && effectListContainsKind(effect.effects, kind)) return true;
    }
    return false;
  }

  function inferTargetPrompt(block, nextBlocks = [], startIndex = -1) {
    // Splash targets ("near") have their own confirm wording.
    if (!block || block.mode !== "token" || block.near) return {};
    const groupName = block.name || "primary";
    for (let index = startIndex + 1; index < nextBlocks.length; index += 1) {
      const candidate = nextBlocks[index];
      if (!candidate || candidate.type !== "effect") continue;
      const targetName = candidate.target || "";
      if ((targetName || "primary") !== groupName) continue;
      if (effectListContainsKind(candidate.effects, "damage")) {
        const predicate = titleCaseWord(block.predicate || "target");
        const count = describeTargetCount(block);
        return {
          promptTitle: `Pick ${predicate} to Damage`,
          promptText: `Choose ${count} ${block.predicate || "target"} to damage.`,
        };
      }
      break;
    }
    return {};
  }

  function withTargetPromptDefaults(block, inferred = {}) {
    if (!block || block.type !== "target") return block;
    return {
      ...block,
      promptTitle: block.promptTitle || inferred.promptTitle || "",
      promptText: block.promptText || inferred.promptText || "",
    };
  }

  function showTargetPrompt(state, block) {
    const title = block.promptTitle || "Pick Target";
    const instruction = block.promptText || (
      block.mode === "area"
        ? "Place the area template on the map."
        : "Click a token on the map."
    );
    const host = makeHost(title, state.action.name || "Ability Automation", "target", state.context?.automationAnchor || null);
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--compact">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(schema.summarizeBlock(block))}</p>
        </div>
      </section>
      <div class="power-roll-runner__inline-actions">
        <p class="power-roll-runner__instruction">${escapeHtml(instruction)}</p>
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

  function getRangeOriginPlacement(state, block) {
    const originName = String(block?.rangeOrigin || "self").trim();
    if (!originName || originName.toLowerCase() === "self") {
      return state.sourcePlacement || null;
    }

    // Area target blocks preserve their selected map footprint separately
    // from the creatures caught in it. Prefer that location when the named
    // group is an area so follow-up ranges start at the chosen space.
    const area = state.areas?.[originName];
    const template = area?.template;
    if (template && typeof template === "object") {
      return {
        id: `automation-area:${originName}`,
        name: originName,
        column: asInt(template.column, 0),
        row: asInt(template.row, 0),
        width: Math.max(1, asInt(template.width, 1)),
        height: Math.max(1, asInt(template.height, 1)),
      };
    }

    // Token picks retain both a lightweight id/name and (on the VTT) a
    // placement snapshot. The first selected member is the deterministic
    // origin when a group contains more than one token.
    const originTarget = getTargetGroup(state, originName)[0];
    if (originTarget) {
      return originTarget.placement && typeof originTarget.placement === "object"
        ? originTarget.placement
        : originTarget;
    }

    // Old/malformed automations should remain usable. The documented default
    // is the caster, so an unresolved reference degrades to that same default.
    return state.sourcePlacement || null;
  }

  async function runTargetBlock(state, block) {
    const desired = getTokenTargetCount(block);
    const upTo = block.count?.mode === "upTo";
    // The board already owns the multi-pick/Done prompt and its cancellation.
    const useBoardOnlyPrompt = block.mode === "token" && Boolean(block.near || block.promptTitle || block.promptText || block.optional || upTo || desired > 1);
    const host = useBoardOnlyPrompt ? null : showTargetPrompt(state, block);
    const finish = () => removeRunnerHost(host);

    const cancelPromise = new Promise((resolve) => {
      if (!host) return;
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
          if (!host) return;
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
            sourcePlacement: getRangeOriginPlacement(state, block),
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

      if (block.near) {
        await runNearTargetPick(state, block, cancelPromise);
        return;
      }

      const rangeOriginPlacement = getRangeOriginPlacement(state, block);
      const selected = [];
      const seen = new Set();
      const excludedIds = new Set(
        (block.excludeGroups || [])
          .flatMap((groupName) => getTargetGroup(state, groupName))
          .map((target) => target?.id)
          .filter(Boolean)
      );

      for (let pickIndex = 0; pickIndex < desired; pickIndex += 1) {
        const promptConfig = {
          ...block,
          // Send predicate under the v2 field name the board still reads.
          creature: block.predicate,
          affects: block.predicate,
          pickIndex: pickIndex + 1,
          pickTotal: Number.isFinite(desired) ? desired : 0,
          // Multi-pick flows need the board prompt even when authors did not
          // provide custom wording; that prompt owns the early Done button.
          showPrompt: Boolean(block.promptTitle || block.promptText || block.optional || upTo || desired > 1),
          // "Done" finishes early with the targets picked so far without
          // cancelling the ability. Always offer it once at least one target
          // is locked in, so a multi-target ability can hit a single target.
          allowDone: upTo || selected.length > 0,
          // Pre-suggested target (e.g. the mover that triggered an
          // opp-attack). Picker pulses this token red but the player can
          // still click anyone.
          suggestedTargetId: state.suggestedTargetId || "",
          // Source token/location used only by the advisory reach/range box.
          // It defaults to the caster, but rangeOrigin can reference an
          // earlier token target group or placed area.
          sourcePlacement: rangeOriginPlacement,
          excludeTargetIds: [...excludedIds, ...seen],
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
        if (result?.id && !seen.has(result.id) && !excludedIds.has(result.id)) {
          seen.add(result.id);
          selected.push(result);
        }
        // Count "all"/"each": picking goes on until Done.
      }
      setTargetGroup(state, block.name, selected);
    } catch (error) {
      if (block.mode === "area") state.context.cancelAreaSelection?.();
      else state.context.cancelTargetSelection?.();
      throw error;
    } finally {
      finish();
    }
  }

  // ---------- splash targets (target block "near") ----------
  //
  // "Each enemy adjacent to the target also takes 3 damage": every creature that fits is pre-picked and pulses on
  // the board; the user clicks a token to add or remove it, then Done. Nobody fits: nothing to confirm.

  function tokenTeam(token) {
    const raw = String(token?.combatTeam ?? token?.team ?? token?.tags?.team ?? token?.faction ?? "").trim().toLowerCase();
    return raw === "enemy" ? "enemy" : "ally";
  }

  function nearPredicateFits(predicate, candidate, casterTeam, casterId) {
    const team = tokenTeam(candidate);
    switch (predicate) {
      case "enemy": return team !== casterTeam;
      case "ally": return team === casterTeam && candidate.id !== casterId;
      case "selfOrAlly":
      case "selfAndAlly": return team === casterTeam;
      default: return true;
    }
  }

  async function nearCandidates(state, block) {
    const near = block.near || {};
    const anchors = getTargetGroup(state, near.group || "primary").filter((item) => item && item.id);
    if (!anchors.length || typeof state.context.getActiveScenePlacements !== "function" || typeof state.context.getDistanceBetween !== "function") {
      return { anchors, candidates: [] };
    }
    const anchorIds = new Set(anchors.map((item) => item.id));
    const casterId = state.sourcePlacement?.id || "";
    const casterTeam = tokenTeam(liveTokenFor(state, state.sourcePlacement));
    const within = Math.max(0, asInt(near.within, 1));
    const placements = (await state.context.getActiveScenePlacements()) || [];
    const candidates = [];
    for (const placement of placements) {
      if (!placement?.id || anchorIds.has(placement.id) || placement.hidden) continue;
      if (placement.id === casterId && !near.includeSelf) continue;
      if (!nearPredicateFits(block.predicate || "creature", placement, casterTeam, casterId)) continue;
      let close = false;
      for (const anchor of anchors) {
        const squares = Number(await state.context.getDistanceBetween(anchor.id, placement.id));
        if (Number.isFinite(squares) && squares <= within) { close = true; break; }
      }
      if (close) candidates.push({ id: placement.id, name: placement.name || placement.label || "Creature", placement });
    }
    return { anchors, candidates };
  }

  // How many creatures fit `spec` around `center` (or among the ability's targets). Returns null when the board
  // can't tell (no scene list or distances).
  async function countCreatures(state, spec, center, targets = []) {
    const casterId = state.sourcePlacement?.id || "";
    const casterTeam = tokenTeam(liveTokenFor(state, state.sourcePlacement));
    const fits = (token) => {
      if (!token?.id || token.hidden) return false;
      if (!nearPredicateFits(spec.predicate || "creature", token, casterTeam, casterId)) return false;
      if (spec.keyword && spec.keyword.length) {
        const words = tokenKindWords(token);
        if (!spec.keyword.some((word) => word.split(/\s+/).every((part) => words.has(part)))) return false;
      }
      const facts = {};
      if (spec.condition) facts.condition = spec.condition;
      if (spec.stamina) facts.stamina = spec.stamina;
      if (Object.keys(facts).length && checkTargetFacts(state, facts, token) !== true) return false;
      return true;
    };
    let count = 0;
    if (spec.in === "targets") {
      count = (targets || []).map((target) => liveTokenFor(state, target)).filter(fits).length;
    } else {
      if (!center?.id || typeof state.context.getActiveScenePlacements !== "function" || typeof state.context.getDistanceBetween !== "function") return null;
      const placements = (await state.context.getActiveScenePlacements()) || [];
      for (const token of placements) {
        if (token?.id === center.id) continue;
        if (token?.id === casterId && !spec.includeSelf) continue;
        if (!fits(token)) continue;
        const squares = Number(await state.context.getDistanceBetween(center.id, token.id));
        if (Number.isFinite(squares) && squares <= Math.max(0, asInt(spec.within, 1))) count += 1;
      }
    }
    if (spec.max !== undefined) count = Math.min(count, spec.max);
    return count;
  }

  async function countAmountFor(state, amountFrom, target, targets) {
    const center = amountFrom.around === "self" ? state.sourcePlacement : target;
    const count = await countCreatures(state, amountFrom, center, targets);
    return { count: count ?? 0, extra: scaleTriggerValue(count ?? 0, amountFrom) };
  }

  async function runNearTargetPick(state, block, cancelPromise) {
    const { anchors, candidates } = await nearCandidates(state, block);
    const label = state.action.name || "Ability";
    if (!candidates.length) {
      const where = anchors.map((item) => item.name || "the target").join(", ") || "the target";
      await postChat(state.context, { message: `${state.heroName} - ${label}: nobody fits near ${where}.` });
      setTargetGroup(state, block.name, []);
      return;
    }
    const selected = new Map(candidates.map((item) => [item.id, item]));
    for (;;) {
      const result = await Promise.race([
        state.context.selectTarget({
          ...block,
          creature: block.predicate,
          affects: block.predicate,
          showPrompt: true,
          allowDone: true,
          preselectedIds: [...selected.keys()],
          promptTitle: block.promptTitle || "Confirm the targets",
          promptText: block.promptText || `${selected.size} picked. Click a token to add or remove it, then Done.`,
        }),
        cancelPromise,
      ]);
      if (result?.canceled) {
        state.context.cancelTargetSelection?.();
        state.aborted = true;
        return;
      }
      if (result?.skipped || result?.done || !result?.id) {
        state.context.cancelTargetSelection?.();
        break;
      }
      if (selected.has(result.id)) selected.delete(result.id);
      else selected.set(result.id, result);
    }
    setTargetGroup(state, block.name, [...selected.values()]);
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

  function refreshPowerRollSuggestions(state, block) {
    const callback = state?.context?.getPowerRollSuggestions;
    if (typeof callback !== "function") {
      state.rollSuggestions = [];
      return;
    }
    const targetGroup = getTargetGroup(state, block.target);
    const payload = {
      actorId: state.sourcePlacement?.id || "",
      sourceId: state.sourcePlacement?.id || "",
      action: state.action || {},
      actionId: state.action?.id || "",
      actionName: state.action?.name || "",
      actionKind: getActionKind(state),
      keywords: getAbilityKeywords(state),
      range: state.action?.range || "",
      attribute: block.attribute || "",
      rollEvent: block.rollEvent === "abilityTest" ? "abilityTest" : "powerRoll",
      targets: targetGroup.map((target) => ({ id: target?.id || "", name: target?.name || "" })).filter((target) => target.id),
      targetIds: targetGroup.map((target) => target?.id).filter(Boolean),
    };
    try {
      const contextKey = JSON.stringify([payload.actorId, payload.actionId, block.id,
        payload.rollEvent, [...payload.targetIds].sort()]);
      if (state.rollSuggestionContext !== contextKey) {
        state.rollSuggestionContext = contextKey;
        state.rollSuggestionOverrides = new Map();
      }
      const next = callback(payload);
      state.rollSuggestions = (Array.isArray(next) ? next : [])
        .map(normalizeRollSuggestion)
        .filter(Boolean)
        .map((suggestion) => {
          if (state.rollSuggestionOverrides.has(suggestion.id)) {
            suggestion.active = state.rollSuggestionOverrides.get(suggestion.id);
          }
          return suggestion;
        });
    } catch (err) {
      console.warn("[AbilityAutomationRunner] roll suggestions failed", err);
      state.rollSuggestions = [];
    }
  }

  function setRollSuggestionActive(state, suggestion, active) {
    suggestion.active = active;
    if (!state.rollSuggestionOverrides) state.rollSuggestionOverrides = new Map();
    state.rollSuggestionOverrides.set(suggestion.id, active);
  }

  function watchPowerRollSuggestions(host, state, block, render) {
    let stopped = false;
    let timer;
    const tick = () => {
      if (stopped) return;
      if (!host.isConnected) { stopped = true; return; }
      if (!state.roll) {
        const previous = JSON.stringify(state.rollSuggestions);
        refreshPowerRollSuggestions(state, block);
        if (previous !== JSON.stringify(state.rollSuggestions)) render(host, state, block);
      }
      timer = window.setTimeout(tick, 1000);
    };
    timer = window.setTimeout(tick, 1000);
    return () => { stopped = true; window.clearTimeout(timer); };
  }

  function renderRollSuggestionButtons(state, manualEdgeState = null) {
    const suggestions = Array.isArray(state.rollSuggestions) ? state.rollSuggestions : [];
    const chips = suggestions.map((suggestion) => {
      const count = Math.max(1, Math.min(2, asInt(suggestion.count, 1)));
      const icon = suggestion.kind === "damage"
        ? `+${asInt(suggestion.amount, 0)} dmg`
        : suggestion.kind === "potency"
          ? `+${asInt(suggestion.amount, 0)} potency`
          : suggestion.kind === "edge"
            ? (count > 1 ? "▲▲" : "▲")
            : (count > 1 ? "▼▼" : "▼");
      const tone = suggestion.kind === "bane" ? "b" : "e";
      return `
        <button
          class="power-roll-runner__suggestion pr5-chip pr5-chip--${tone} ${suggestion.active ? "power-roll-runner__suggestion--active is-on" : ""}"
          type="button"
          data-power-roll-suggestion-toggle="${escapeHtml(suggestion.id)}"
          data-suggestion-kind="${escapeHtml(suggestion.kind)}"
          aria-pressed="${suggestion.active ? "true" : "false"}"
          title="${escapeHtml(suggestion.reason || suggestion.label)}"
        >${escapeHtml(icon)} ${escapeHtml(suggestion.label)}</button>
      `;
    }).join("");
    const manual = manualEdgeState || getEdgeState(state.edgeCount, state.baneCount);
    const manualChip = (kind, count, label) => {
      const active = edgeControlIsActive(manual, kind, count);
      const attribute = kind === "edge" ? "data-power-roll-edge-adjust" : "data-power-roll-bane-adjust";
      return `<button class="pr5-chip pr5-chip--${kind === "edge" ? "e" : "b"} ${active ? "is-on" : ""}" type="button" ${attribute}="${count}" aria-pressed="${active ? "true" : "false"}">${label}</button>`;
    };
    const manualOpen = Boolean(state.showManualEdges) || manual.edge > 0 || manual.bane > 0;
    return `
      <div class="power-roll-runner__suggestions pr5-chips">
        ${chips}
        <button class="pr5-chip pr5-chip--add ${manualOpen ? "is-open" : ""}" type="button" data-power-roll-manual-toggle aria-expanded="${manualOpen ? "true" : "false"}" title="Add an edge or bane yourself">+</button>
      </div>
      <div class="pr5-chips pr5-chips--manual" ${manualOpen ? "" : "hidden"}>
        ${manualChip("edge", 1, "▲ Edge")}${manualChip("edge", 2, "▲▲ Double edge")}${manualChip("bane", 1, "▼ Bane")}${manualChip("bane", 2, "▼▼ Double bane")}
      </div>`;
  }

  function getPowerRollTotal(state, block) {
    // flatBonus (monster-style literal) takes priority over attribute lookup.
    // When flatBonus is set, attribute is only a label for display.
    const hasFlat = block && typeof block.flatBonus === "number" && Number.isFinite(block.flatBonus);
    const resolved = hasFlat
      ? { attribute: typeof block.attribute === "string" ? block.attribute : "Flat", bonus: asInt(block.flatBonus, 0) }
      : resolveAttribute(state, block.attribute);
    const attributeBonus = resolved.bonus;
    const skillState = resolveAbilityTestSkill(state, block);
    const skillBonus = asInt(skillState.bonus, 0);
    const bonus = asInt(block.bonus);
    const manualBonus = asInt(state.manualBonus);
    const edgeBaneCounts = getTotalEdgeBaneCounts(state);
    const edgeState = getEdgeState(edgeBaneCounts.edge, edgeBaneCounts.bane);
    const total = state.roll
      ? state.roll.total + attributeBonus + skillBonus + bonus + manualBonus + edgeState.bonus
      : null;
    return {
      total,
      attribute: resolved.attribute,
      attributeBonus,
      skill: skillState.skill,
      skillBonus,
      bonus,
      manualBonus,
      edgeState,
    };
  }

  function getAvailableSurges(state) {
    if (state?.hero && Object.prototype.hasOwnProperty.call(state.hero, "surges")) {
      return Math.max(0, asInt(state.hero.surges, 0));
    }
    return Math.max(0, asInt(state?.sourceTraits?.surges, 0));
  }

  async function refreshPowerRollSurges(state) {
    if (typeof state?.context?.getSurges !== "function") return getAvailableSurges(state);
    try {
      const result = await state.context.getSurges({
        placementId: state.sourcePlacement?.id || "",
        abilityName: state.action?.name || "Ability",
      });
      const current = Number.isFinite(result)
        ? result
        : Number.isFinite(result?.current)
          ? result.current
          : Number.isFinite(result?.surges)
            ? result.surges
            : null;
      if (current !== null && state.hero && typeof state.hero === "object") {
        state.hero.surges = Math.max(0, asInt(current, 0));
      }
    } catch (error) {
      console.warn("[AbilityAutomationRunner] failed to refresh surges", error);
    }
    return getAvailableSurges(state);
  }

  function surgeDamagePerSpend(state) {
    const bonus = state.context?.getStrongestAttribute?.()?.bonus;
    if (Number.isFinite(Number(bonus))) return Math.max(0, asInt(bonus, 0));
    return Math.max(0, ...["might", "agility", "reason", "intuition", "presence"].map(key => asInt(state.hero?.stats?.[key], 0)));
  }

  function canUsePowerRollSurges(block) {
    return block?.rollEvent !== "abilityTest";
  }

  function clampPowerRollSurges(state, block) {
    if (!canUsePowerRollSurges(block)) {
      state.powerRollSurges = 0;
      return 0;
    }
    const available = getAvailableSurges(state);
    state.powerRollSurges = Math.max(0, Math.min(3, available, asInt(state.powerRollSurges, 0)));
    return state.powerRollSurges;
  }

  // Surges: a small pill (they are not used often). Hidden when the roller has none to spend.
  function renderPowerRollSurgeControls(state, block) {
    if (!canUsePowerRollSurges(block)) return "";
    const available = getAvailableSurges(state);
    const count = clampPowerRollSurges(state, block);
    const hasAvailableSurges = available > 0;
    const hasArmedSurges = count > 0;
    if (!hasAvailableSurges && !hasArmedSurges) return "";
    const per = surgeDamagePerSpend(state);
    const disabledMinus = count <= 0 ? "disabled" : "";
    const disabledPlus = count >= Math.min(3, available) ? "disabled" : "";
    return `
      <span class="pr5-pill pr5-surge power-roll-runner__surges ${hasAvailableSurges ? "power-roll-runner__surges--available" : ""} ${hasArmedSurges ? "power-roll-runner__surges--armed is-on" : ""}">
        <span class="pr5-gem" aria-hidden="true">◆</span>${escapeHtml(available)} surge${available === 1 ? "" : "s"}
        <button class="pr5-step" type="button" data-power-roll-surge-adjust="-1" ${disabledMinus} aria-label="One surge fewer">−</button>
        <span class="pr5-n ${hasArmedSurges ? "is-armed" : ""}" data-power-roll-surge-count>${escapeHtml(count)}</span>
        <button class="pr5-step power-roll-runner__surge-btn ${hasAvailableSurges ? "is-available" : ""} ${hasArmedSurges ? "is-armed" : ""}" type="button" data-power-roll-surge-adjust="1" aria-pressed="${hasArmedSurges ? "true" : "false"}" ${disabledPlus} aria-label="Spend one surge for +${escapeHtml(per)} damage">+</button>
        <span class="pr5-dmg">+${escapeHtml(count * per)} dmg</span>
      </span>
    `;
  }

  async function consumePowerRollSurgeBonus(state, ctx, targets) {
    const surgeCtx = ctx?.powerRollSurges;
    if (!surgeCtx || surgeCtx.consumed) return { spent: 0, damage: 0 };
    surgeCtx.consumed = true;
    const requested = Math.max(0, Math.min(3, asInt(surgeCtx.requested, 0)));
    if (!requested) return { spent: 0, damage: 0 };
    const eligible = [...new Map((targets || []).filter(target => target?.id).map(target => [target.id, target])).values()];
    if (!eligible.length) return { spent: 0, damage: 0 };
    const choice = await askChoice(state, {
      prompt: "Which target receives the surge damage?",
      options: eligible.map(target => ({ id: target.id, label: target.hidden || target.placement?.hidden ? "Hidden target" : target.name || "Target" })),
    });
    if (state.aborted || !choice) return { spent: 0, damage: 0 };
    const placementId = state.sourcePlacement?.id || "";
    if (!placementId || typeof state.context.applySurgeGain !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: spend ${requested} surge${requested === 1 ? "" : "s"} manually for +${requested * surgeDamagePerSpend(state)} damage.`,
      });
      return { spent: 0, damage: 0 };
    }
    const result = await state.context.applySurgeGain({
      placementId,
      amount: -requested,
      abilityName: state.action.name || "Ability",
    });
    if (!result || result.skipped) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: surge spend skipped${result?.reason ? ` (${result.reason})` : ""}.`,
      });
      return { spent: 0, damage: 0 };
    }
    const spent = Math.max(0, Math.abs(asInt(result.applied, requested)));
    const current = Number.isFinite(result.current) ? result.current : Math.max(0, getAvailableSurges(state) - spent);
    if (state.hero && typeof state.hero === "object") {
      state.hero.surges = current;
    }
    surgeCtx.spent = spent;
    surgeCtx.damage = spent * surgeDamagePerSpend(state);
    return { spent, damage: spent * surgeDamagePerSpend(state), targetId: choice.id };
  }

  // ---------- the power roll window (C5 "Tier Ladder") ----------

  const TIER_ROWS = [
    { key: "tier3", range: "17+", label: "Tier 3" },
    { key: "tier2", range: "12–16", label: "Tier 2" },
    { key: "tier1", range: "≤11", label: "Tier 1" },
  ];

  function edgeStateWords(edgeState) {
    if (edgeState.net >= 2) return { text: "Double Edge: Tier +1", kind: "edge" };
    if (edgeState.net === 1) return { text: "Edge +2", kind: "edge" };
    if (edgeState.net === -1) return { text: "Bane −2", kind: "bane" };
    if (edgeState.net <= -2) return { text: "Double Bane: Tier −1", kind: "bane" };
    if (edgeState.edge > 0 && edgeState.bane > 0) return { text: "Edge and bane cancel", kind: "flat" };
    return { text: "No edge or bane", kind: "flat" };
  }

  function shortAttribute(name, flat) {
    const text = String(name || "").trim();
    if (flat || !text || /^flat$/i.test(text)) return "Base";
    if (/^strongest$/i.test(text)) return "Best";
    return text.length > 4 ? text.slice(0, 3) : text;
  }

  // One tier's effects as text: the first damage number large, potencies as tags; long text wraps.
  function renderTierEffects(effects, ctx, extraDamage) {
    let bigDone = false;
    const parts = (effects || []).map((eff) => {
      const raw = ctx && P.describeEffectResolved ? P.describeEffectResolved(eff, ctx) : P.describeEffect(eff);
      if (!raw) return "";
      // Table words: "A<2 weakened (save ends)", not "Agility<2 → weakened (saveEnds)".
      const text = String(raw)
        .replace(/\b(Might|Agility|Reason|Intuition|Presence)</g, (m, name) => `${name[0]}<`)
        .replace(/ → /g, " ")
        .replace(/\(saveEnds\)/g, "(save ends)")
        .replace(/\(endOfTurn\)/g, "(EoT)")
        .replace(/\(endOfEncounter\)/g, "(end of encounter)")
        .replace(/\(untilDying\)/g, "(until dying)");
      // Potency as "A < 2" with the number bold, so it reads at a glance.
      if (eff?.kind === "potency") {
        const tag = escapeHtml(text).replace(/^([MARIP?])&lt;(\d+)/, (m, letter, number) => `${letter} &lt; <b>${number}</b>`);
        return `<span class="pr5-pot">${tag}</span>`;
      }
      if (eff?.kind === "damage" && !bigDone) {
        bigDone = true;
        const match = /^(\d+)(.*)$/.exec(text);
        if (match) {
          const extra = extraDamage ? `<small> +${escapeHtml(extraDamage)}</small>` : "";
          return `<span class="pr5-big">${escapeHtml(match[1])}${extra}</span>${escapeHtml(match[2])}`;
        }
      }
      return escapeHtml(text);
    }).filter(Boolean);
    return parts.join("; ") || '<span class="pr5-none">No effects</span>';
  }

  function renderPowerRoll(host, state, block) {
    const { total, attribute, attributeBonus, skill, skillBonus, bonus, manualBonus, edgeState } = getPowerRollTotal(state, block);
    const manualEdgeState = getEdgeState(state.edgeCount, state.baneCount);
    const targetGroup = getTargetGroup(state, block.target);
    const targetNames = targetGroup.map((target) => target?.name).filter(Boolean).join(" · ") || "No target selected";
    const titleEl = host.querySelector("#power-roll-title");
    if (titleEl) titleEl.textContent = state.action.name || "Power Roll";
    const labelEl = host.querySelector(".dice-modal-project-label");
    if (labelEl) labelEl.textContent = targetNames;
    host.classList.add("power-roll-runner--c5");

    const flat = asInt(attributeBonus) + asInt(skillBonus) + asInt(bonus) + asInt(manualBonus) + asInt(edgeState.bonus);
    const formula = `${block.rollFormula || "2d10"} ${flat < 0 ? "−" : "+"} ${Math.abs(flat)}`;
    const words = edgeStateWords(edgeState);
    const hasFlat = block && typeof block.flatBonus === "number" && Number.isFinite(block.flatBonus);
    const breakdown = [`${escapeHtml(shortAttribute(attribute, hasFlat))} ${escapeHtml(formatModifier(attributeBonus))}`];
    if (skillBonus) breakdown.push(`${escapeHtml(skill || "Skill")} ${escapeHtml(formatModifier(skillBonus))}`);
    if (bonus) breakdown.push(`Ability ${escapeHtml(formatModifier(bonus))}`);
    breakdown.push(`<span class="pr5-tag pr5-tag--${words.kind}">${escapeHtml(words.text)}</span>`);
    if (manualBonus) breakdown.push(`<span class="pr5-tag pr5-tag--bonus">Bonus ${escapeHtml(formatModifier(manualBonus))}</span>`);

    const rolled = Boolean(state.roll);
    const tierShifted = rolled && state.baseTier && state.selectedTier && state.baseTier !== state.selectedTier;
    const tierNumber = (key) => String(key || "").replace(/\D/g, "");
    const tierBadge = rolled && state.selectedTier
      ? `<span class="pr5-tier ${tierShifted ? (tierNumber(state.selectedTier) > tierNumber(state.baseTier) ? "pr5-tier--up" : "pr5-tier--down") : ""}">TIER ${tierShifted ? `${tierNumber(state.baseTier)} → ${tierNumber(state.selectedTier)}` : tierNumber(state.selectedTier)}</span>`
      : "";
    const dice = rolled ? (state.roll.rolls || []).map((value) => `<span class="pr5-die"><span>${escapeHtml(value)}</span></span>`).join("") : "";

    const surgeDamage = clampPowerRollSurges(state, block) * surgeDamagePerSpend(state);
    const chipDamage = (state.rollSuggestions || []).filter((s) => s?.active && s.kind === "damage").reduce((sum, s) => sum + asInt(s.amount, 0), 0);
    const ctx = buildResolveCtx(state);
    const tiers = block.tiers || {};
    const rows = TIER_ROWS.map(({ key, range, label }) => {
      const hit = rolled && state.selectedTier === key;
      return `
        <button class="pr5-row ${hit ? "pr5-row--hit" : ""}" type="button" data-select-tier="${key}" ${rolled ? "" : "disabled"} aria-pressed="${hit ? "true" : "false"}">
          <span class="pr5-range">${escapeHtml(range)}<small>${escapeHtml(label.toUpperCase())}</small></span>
          <span class="pr5-fx">${renderTierEffects(tiers[key]?.effects || [], ctx, hit ? surgeDamage + chipDamage : 0)}</span>
        </button>`;
    }).join("");

    const description = plainText(state.action.description || "");
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <div class="pr5">
        <div class="pr5-top">
          <div class="pr5-medal" aria-live="polite">${rolled && total !== null ? `<span class="pr5-total">${escapeHtml(total)}</span>` : '<span class="pr5-ready">roll</span>'}</div>
          <div class="pr5-sum">
            <div class="pr5-formula">${escapeHtml(formula)}</div>
            <div class="pr5-parts">${breakdown.join(" · ")}</div>
            ${rolled ? `<div class="pr5-dice">${dice}${tierBadge}</div>` : ""}
          </div>
        </div>
        ${state.resultText && !/^Rolled /.test(state.resultText) ? `<div class="pr5-status">${escapeHtml(state.resultText)}</div>` : ""}
        <div class="pr5-rows ${rolled ? "pr5-rows--rolled" : ""}">${rows}</div>
        ${description ? `<details class="pr5-text"><summary>Ability text</summary><p>${escapeHtml(description)}</p></details>` : ""}
        <div class="pr5-mods">
          ${renderRollSuggestionButtons(state, manualEdgeState)}
          <div class="pr5-pills">
            <span class="pr5-pill pr5-bonus ${manualBonus ? "is-on" : ""}">Bonus
              <button class="pr5-step" type="button" data-power-roll-bonus-adjust="-1" aria-label="Bonus minus one">−</button>
              <span class="pr5-n">${escapeHtml(formatModifier(manualBonus))}</span>
              <button class="pr5-step" type="button" data-power-roll-bonus-adjust="1" aria-label="Bonus plus one">+</button>
            </span>
            ${renderPowerRollSurgeControls(state, block)}
            <button class="pr5-clear" type="button" data-power-roll-clear-adjustments>Clear</button>
          </div>
        </div>
      </div>
      <div class="pr5-bar">
        ${rolled
          ? `<button class="pr5-btn" type="button" data-power-roll-roll>Reroll</button><button class="pr5-btn pr5-btn--ok" type="button" data-power-roll-accept>Accept</button>`
          : `<button class="pr5-btn" type="button" data-cancel-automation>Cancel</button><button class="pr5-btn pr5-btn--roll" type="button" data-power-roll-roll>Roll</button>`}
      </div>
    `;
  }

  function buildRollChatEntry(state, block, total, attributeBonus, bonus, edgeBonus, skillState = {}) {
    const manualBonus = asInt(state.manualBonus);
    const skillBonus = asInt(skillState.skillBonus, 0);
    const numericModifiers = [
      attributeBonus ? `${attributeBonus >= 0 ? "+" : "-"} ${Math.abs(attributeBonus)}` : "",
      skillBonus ? `${skillBonus >= 0 ? "+" : "-"} ${Math.abs(skillBonus)}` : "",
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
          ...(skillBonus ? [{ type: "modifier", notation: String(skillBonus), value: skillBonus, label: skillState.skill || "Skill" }] : []),
          ...(bonus ? [{ type: "modifier", notation: String(bonus), value: bonus }] : []),
          ...(manualBonus ? [{ type: "modifier", notation: String(manualBonus), value: manualBonus }] : []),
          ...(edgeBonus ? [{ type: "modifier", notation: String(edgeBonus), value: edgeBonus }] : []),
        ],
        total,
      },
    };
  }

  function wirePowerRoll(host, state, block, resolve, reject) {
    const stopSuggestions = watchPowerRollSuggestions(host, state, block, renderPowerRoll);
    let finished = false, pending = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      stopSuggestions();
      host.removeEventListener("click", onClick);
      host.removeEventListener("automation-cancel", onCancel);
      if (error) reject(error); else resolve();
    };
    const onCancel = () => {
      state.aborted = true;
      finish();
    };
    const onClick = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-cancel-automation]")) {
        state.aborted = true;
        closeRunner();
        finish();
        return;
      }
      if (pending || finished) return;
      pending = true;
      try {
      if (target.closest("[data-power-roll-edge-adjust]")) {
        const button = target.closest("[data-power-roll-edge-adjust]");
        const selection = setManualEdgeBaneSelection(state, "edge", button?.getAttribute("data-power-roll-edge-adjust"));
        state.resultText = state.roll
          ? `${selection.active ? (selection.count >= 2 ? "Double edge selected" : "Edge selected") : "Edge cleared"}. Reroll to post the adjusted result.`
          : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-bane-adjust]")) {
        const button = target.closest("[data-power-roll-bane-adjust]");
        const selection = setManualEdgeBaneSelection(state, "bane", button?.getAttribute("data-power-roll-bane-adjust"));
        state.resultText = state.roll
          ? `${selection.active ? (selection.count >= 2 ? "Double bane selected" : "Bane selected") : "Bane cleared"}. Reroll to post the adjusted result.`
          : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-manual-toggle]")) {
        state.showManualEdges = !state.showManualEdges;
        renderPowerRoll(host, state, block);
        return;
      }
      const suggestionButton = target.closest("[data-power-roll-suggestion-toggle]");
      if (suggestionButton) {
        const id = suggestionButton.getAttribute("data-power-roll-suggestion-toggle") || "";
        const suggestion = (state.rollSuggestions || []).find((entry) => entry.id === id);
        if (suggestion) {
          setRollSuggestionActive(state, suggestion, !suggestion.active);
          state.resultText = state.roll ? "Suggestion changed. Reroll to post the adjusted result." : "";
          renderPowerRoll(host, state, block);
        }
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
      const surgeButton = target.closest("[data-power-roll-surge-adjust]");
      if (surgeButton) {
        state.powerRollSurges =
          asInt(state.powerRollSurges, 0) + asInt(surgeButton.getAttribute("data-power-roll-surge-adjust"), 0);
        const count = clampPowerRollSurges(state, block);
        state.resultText = count
          ? `${count} surge${count === 1 ? "" : "s"} armed for +${count * surgeDamagePerSpend(state)} damage after this roll.`
          : "No surges armed.";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-clear-adjustments]")) {
        state.edgeCount = 0;
        state.baneCount = 0;
        state.manualBonus = 0;
        state.powerRollSurges = 0;
        (state.rollSuggestions || []).forEach((suggestion) => {
          setRollSuggestionActive(state, suggestion, false);
        });
        state.resultText = state.roll ? "Adjustments cleared. Reroll to post the adjusted result." : "";
        renderPowerRoll(host, state, block);
        return;
      }
      if (target.closest("[data-power-roll-roll]")) {
        refreshPowerRollSuggestions(state, block);
        state.roll = rollFormula(block.rollFormula || "2d10");
        const { total, attributeBonus, skill, skillBonus, bonus, edgeState } = getPowerRollTotal(state, block);
        state.baseTier = P.tierFromTotal(total);
        state.selectedTier = P.shiftTierKey(state.baseTier, edgeState.tierShift);
        fireActionUsedEvent(state);
        state.resultText = `Rolled ${total}. Auto-selected ${P.tierLabel(state.selectedTier)}${
          state.baseTier !== state.selectedTier
            ? ` from ${P.tierLabel(state.baseTier)} (${edgeState.label}).`
            : "."
        }`;
        await postChat(state.context, buildRollChatEntry(state, block, total, attributeBonus, bonus, edgeState.bonus, { skill, skillBonus }));
        if (finished) return;
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
        const acceptedEdgeState = getPowerRollTotal(state, block).edgeState;
        if (acceptedEdgeState.net > 0) {
          state.acceptedPowerRollWithEdge = true;
        }
        closeRunner();
        finish();
      }
      } catch (error) {
        if (finished) return;
        removeRunnerHost(host);
        finish(error);
      } finally { pending = false; }
    };

    host.addEventListener("click", onClick);
    host.addEventListener("automation-cancel", onCancel);
  }

  async function runPowerRollBlock(state, block) {
    await refreshPowerRollSurges(state);
    state.edgeCount = Math.max(0, Math.min(2, asInt(block?.edge, 0)));
    state.baneCount = Math.max(0, Math.min(2, asInt(block?.bane, 0)));
    state.manualBonus = 0;
    state.powerRollSurges = 0;
    state.roll = null;
    state.selectedTier = null;
    state.baseTier = null;
    state.resultText = "";
    state.rollSuggestionContext = null;
    refreshPowerRollSuggestions(state, block);
    // Spends the ability asks for before the roll ("timing": "preRoll") are offered now, before the dice.
    await offerPreRollSpends(state);
    if (state.aborted) return;

    const host = makeHost("Power Roll", state.action.name || "Ability Automation", "power", state.context?.automationAnchor || null);
    renderPowerRoll(host, state, block);
    await new Promise((resolve, reject) => wirePowerRoll(host, state, block, resolve, reject));

    if (state.aborted) return;
    if (!state.selectedTier) return;
    rememberAcceptedRoll(state, block);

    await fireRollTriggerEvent(state, block);
    await consumeActiveRollRiders(state, block);

    const tier = block.tiers?.[state.selectedTier] || { effects: [] };
    const targetGroupName = block.target;
    // Timed buffs ticked in the roll window: +damage on the roll's first damage effect, +potency on its potencies.
    const rollBonuses = activeRollBonuses(state);
    const tierEffects = rollBonuses.damage ? withDamageBonus(tier.effects || [], rollBonuses.damage) : (tier.effects || []);
    if (rollBonuses.labels.length) {
      await postChat(state.context, { message: `${state.heroName} - ${state.action.name || "Ability"}: ${rollBonuses.labels.join(", ")}.` });
    }
    state.rollPotencyBonus = rollBonuses.potency;
    try {
    await applyEffects(state, tierEffects, targetGroupName, {
      sourceLabel: `${state.action.name || "Ability"} (${P.tierLabel(state.selectedTier)})`,
      powerRollSurges: {
        requested: clampPowerRollSurges(state, block),
        spent: 0,
        damage: 0,
        consumed: false,
      },
    });
    } finally {
      state.rollPotencyBonus = 0;
    }
  }

  function activeRollBonuses(state) {
    const result = { damage: 0, potency: 0, labels: [] };
    (Array.isArray(state.rollSuggestions) ? state.rollSuggestions : []).forEach((suggestion) => {
      if (!suggestion?.active) return;
      const amount = asInt(suggestion.amount, 0);
      if (!amount) return;
      if (suggestion.kind === "damage") { result.damage += amount; result.labels.push(`+${amount} damage (${suggestion.label})`); }
      if (suggestion.kind === "potency") { result.potency += amount; result.labels.push(`+${amount} potency (${suggestion.label})`); }
    });
    return result;
  }

  // Adds a bonus to the first damage effect of a tier (as a kit's or captain's damage bonus is added).
  function withDamageBonus(effects, bonus) {
    let added = false;
    return effects.map((effect) => {
      if (added || !effect || effect.kind !== "damage" || effect.raw) return effect;
      added = true;
      return { ...effect, amount: asInt(effect.amount, 0) + bonus };
    });
  }

  function serializeRequestedTestContinuation(state, block, targets) {
    return {
      kind: "abilityAutomationRequestedTest",
      action: state.action || {},
      hero: state.hero || {},
      heroName: state.heroName || "",
      sourcePlacement: state.sourcePlacement || null,
      sourceTraits: state.sourceTraits || {},
      targetGroup: block.target || state.currentGroup || "primary",
      targets: (targets || []).map((target) => ({
        id: target?.id || "",
        name: target?.name || target?.label || "",
      })).filter((target) => target.id),
      tiers: block.tiers || {},
      note: block.note || "",
    };
  }

  async function applyRequestedTestTier(state, block, result) {
    const tierKey = String(result?.tier || "").trim();
    const tier = block.tiers?.[tierKey];
    if (!tier) return;
    const resultTargets = (Array.isArray(result?.targetIds) ? result.targetIds : [])
      .map((id) => state.context.getPlacementById?.(id) || { id, name: id })
      .filter((target) => target?.id);
    const groupName = `requested-test-${result?.requestId || tierKey}`;
    setTargetGroup(state, groupName, resultTargets);
    await applyEffects(state, tier.effects || [], groupName, {
      sourceLabel: `${state.action.name || "Ability"} (${P.tierLabel(tierKey)})`,
    });
  }

  async function runRequestedTestBlock(state, block) {
    if (typeof state.context.requestTest !== "function") {
      await postChat(state.context, {
        message: `${state.action.name || "Ability"}: ${block.label || block.attribute || "requested test"} must be rolled manually.`,
      });
      return;
    }
    const targets = getTargetGroup(state, block.target);
    if (!targets.length) return;
    const response = await state.context.requestTest({
      abilityName: state.action.name || "Ability",
      sourcePlacementId: state.sourcePlacement?.id || "",
      sourceName: state.heroName || state.action.name || "Ability",
      target: block.target,
      targets: targets.map((target) => ({
        id: target?.id || "",
        name: target?.name || target?.label || "",
      })).filter((target) => target.id),
      attribute: block.attribute,
      rollMode: block.rollMode,
      rollFormula: block.rollFormula,
      label: block.label,
      prompt: block.prompt,
      bonus: block.bonus,
      edge: block.edge,
      bane: block.bane,
      tiers: block.tiers,
      continuation: serializeRequestedTestContinuation(state, block, targets),
      resourceReservation: {
        abilityResourceSpend: state.abilityResourceSpend || null,
        triggeredActionSpend: state.triggeredActionSpend || null,
        external: state.context.resourceReservation || null,
      },
    });
    if (response?.canceled) {
      state.aborted = true;
      await clearUsageLimit(state);
      if (typeof state.context.refundAbility === "function") {
        await state.context.refundAbility({
          resourceSpend: state.abilityResourceSpend,
          triggeredActionSpend: state.triggeredActionSpend || null,
          action: state.action,
          sourcePlacementId: state.sourcePlacement?.id || "",
        });
      }
      if (typeof state.context.completeRequestedTests === "function") {
        await state.context.completeRequestedTests(response?.requestIds || []);
      }
      return;
    }
    for (const result of Array.isArray(response?.results) ? response.results : []) {
      await applyRequestedTestTier(state, block, result);
    }
    if (typeof state.context.completeRequestedTests === "function") {
      await state.context.completeRequestedTests(response?.requestIds || []);
    }
  }

  async function consumeActiveRollRiders(state, block) {
    const callback = state?.context?.consumeRollRiders;
    if (typeof callback !== "function") return;
    const seenRefs = new Set();
    const activeSuggestions = (Array.isArray(state.rollSuggestions) ? state.rollSuggestions : [])
      .filter((suggestion) => suggestion?.active && suggestion.conditionRef)
      .filter((suggestion) => {
        const key = `${suggestion.conditionRef.placementId}#${suggestion.conditionRef.conditionIndex}`;
        if (seenRefs.has(key)) return false;
        seenRefs.add(key);
        return true;
      });
    if (!activeSuggestions.length) return;
    const targets = getTargetGroup(state, block.target);
    await callback({
      actorId: state.sourcePlacement?.id || "",
      actionId: state.action?.id || "",
      actionName: state.action?.name || "",
      rollEvent: block.rollEvent === "abilityTest" ? "abilityTest" : "powerRoll",
      targetIds: targets.map((target) => target?.id).filter(Boolean),
      suggestions: activeSuggestions.map((suggestion) => ({
        id: suggestion.id,
        label: suggestion.label,
        kind: suggestion.kind,
        count: suggestion.count,
        consume: suggestion.consume,
        conditionRef: suggestion.conditionRef,
      })),
    });
  }

  async function fireRollTriggerEvent(state, block) {
    if (typeof state.context.fireTriggerEvent !== "function") return;
    const eventType = block.rollEvent === "abilityTest" ? "abilityTest" : "powerRoll";
    const targetIds = getTargetGroup(state, block.target).map((target) => target?.id).filter(Boolean);
    const targetNames = getTargetGroup(state, block.target).map((target) => target?.name || "").filter(Boolean);
    const totalInfo = getPowerRollTotal(state, block);
    const payload = {
      actorId: state.sourcePlacement?.id || "",
      actorName: state.heroName || "",
      actionId: state.action?.id || "",
      actionName: state.action?.name || "Ability",
      actionKind: getActionKind(state),
      cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
      keywords: getAbilityKeywords(state),
      attribute: totalInfo.attribute || block.attribute || "",
      rollTotal: totalInfo.total,
      tier: state.selectedTier || "",
      targetIds,
      targetNames,
    };
    state.context.fireTriggerEvent({ eventType, payload });
    state.context.fireTriggerEvent({ eventType: "abilityRoll", payload: { ...payload, rollEvent: eventType } });
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
    const targetGroupRef = block.target || block.match?.filter?.targetGroup || "";
    let targetIds = collectTargetIdsForGroup(state, targetGroupRef);
    // whose:"target" with no group of its own: the targets picked last (REGISTRY).
    if (!targetIds.length && block.match?.filter?.whose === "target") targetIds = collectTargetIdsForGroup(state, state.currentGroup);
    const inner = (block.effects || []).map(P.describeEffect).filter(Boolean).join("; ");

    if (block.match && typeof ctx.registerTrigger === "function") {
      try {
        if (["main","maneuver"].includes(getActionKind(state))) fireActionUsedEvent(state);
        await ctx.registerTrigger({
          casterId,
          abilityId: state.action?.id || state.action?._stableActionId || `ability_${block.id}`,
          abilityName: state.action?.name || "",
          match: block.match,
          effects: block.effects || [],
          targetGroup: targetGroupRef,
          targetIds,
          condition: block.condition || "",
          note: block.note || "",
          expires: block.expires || null,
          // A trigger card embedded in a main action or maneuver is a delayed
          // rider of that action, not a second triggered action. Standalone
          // triggered actions keep their normal once-per-round gate.
          freeTriggered: getActionKind(state) !== "triggered",
          autoResolve: Boolean(block.autoResolve),
          effectTarget: block.effectTarget || block.resolveTarget || "",
        });
        const lines = [`${state.heroName} - ${state.action.name || "Ability"} trigger listening:`];
        if (block.condition) lines.push(`When: ${block.condition}`);
        if (inner) lines.push(`Then: ${inner}`);
        if (block.expires) {
          const who = block.expires.whose === "self"
            ? "your"
            : block.expires.whose === "target"
              ? "the target's"
              : block.expires.whose === "ally"
                ? "an ally's"
                : block.expires.whose === "enemy"
                  ? "an enemy's"
                  : "";
          const eventText = String(block.expires.event || "").replace(/([A-Z])/g, " $1").toLowerCase();
          lines.push(`Expires at ${who ? `${who} ` : ""}${eventText}.`);
        }
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
        fireActionUsedEvent(state);
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
          expiresAt: block.expiresAt || "never",
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
        if (block.expiresAt && block.expiresAt !== "never") lines.push(`Expires at owner's ${block.expiresAt}.`);
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
    if (block.expiresAt && block.expiresAt !== "never") lines.push(`Expires at owner's ${block.expiresAt}.`);
    if (inner) lines.push(`Each tick: ${inner}`);
    if (!areaRecord) lines.push("(No area placed — manual tracking required.)");
    if (block.note) lines.push(block.note);
    await postChat(ctx, { message: lines.join("\n") });
  }

  // ---------- effect dispatch ----------

  async function applyEffects(state, effects, targetGroupName, ctx = {}) {
    if (!Array.isArray(effects) || !effects.length) return;
    for (const effect of effects) {
      if (state.aborted) return;
      const effectTarget = effect?.target !== undefined && effect?.target !== null && effect?.target !== ""
        ? effect.target
        : targetGroupName;
      const targets = getTargetGroup(state, effectTarget);
      await applyEffect(state, effect, targets, ctx);
    }
  }

  async function applyEffect(state, effect, targets, ctx) {
    if (!effect || typeof effect !== "object") return;
    if (targets.length && ["damage","condition","forcedMovement","shift","setScopedFlag","applyMark","endMark","halveTriggeringDamage","aura","heal","temporaryStamina","teleport","swap","resourceGain","surgeGain","endCondition","loseRecoveries","buff","counter"].includes(effect.kind)) {
      fireActionUsedEvent(state);
    }
    switch (effect.kind) {
      case "damage":
        return applyDamageEffect(state, effect, targets, ctx);
      case "condition":
        return applyConditionEffect(state, effect, targets, ctx);
      case "forcedMovement":
        return applyForcedMovementEffect(state, effect, targets, ctx);
      case "shift":
        return applyShiftEffect(state, effect, targets, ctx);
      case "potency":
        return applyPotencyEffect(state, effect, targets, ctx);
      case "spend":
        return applySpendEffect(state, effect, targets, ctx);
      case "ifKeyword":
        return applyIfKeywordEffect(state, effect, targets, ctx);
      case "ifStrained":
        return applyIfStrainedEffect(state, effect, targets, ctx);
      case "ifPrompt":
        return applyIfPromptEffect(state, effect, targets, ctx);
      case "ifMark":
        return applyIfMarkEffect(state, effect, targets, ctx);
      case "ifScopedFlag":
        return applyIfScopedFlagEffect(state, effect, targets, ctx);
      case "ifDistance":
        return applyIfDistanceEffect(state, effect, targets, ctx);
      case "ifZone":
        return applyIfZoneEffect(state, effect, targets, ctx);
      case "ifTarget":
        return applyIfTargetEffect(state, effect, targets, ctx);
      case "ifRoll":
        return applyIfRollEffect(state, effect, targets, ctx);
      case "endCondition":
        return applyEndConditionEffect(state, effect, targets, ctx);
      case "loseRecoveries":
        return applyLoseRecoveriesEffect(state, effect, targets, ctx);
      case "maliceGain":
        return applyMaliceGainEffect(state, effect);
      case "buff":
        return applyBuffEffect(state, effect, targets, ctx);
      case "move":
        return applyMoveEffect(state, effect, targets, ctx);
      case "grantAction":
        return applyGrantActionEffect(state, effect, targets);
      case "useAbility":
        return applyUseAbilityEffect(state, effect, targets);
      case "counter":
        return applyCounterEffect(state, effect, targets);
      case "ifCounter":
        return applyIfCounterEffect(state, effect, targets, ctx);
      case "setScopedFlag":
        return applySetScopedFlagEffect(state, effect, targets, ctx);
      case "applyMark":
        return applyMarkEffect(state, effect, targets, ctx);
      case "endMark":
        return applyEndMarkEffect(state, effect, targets, ctx);
      case "halveTriggeringDamage":
        return applyHalveTriggeringDamageEffect(state, effect, targets, ctx);
      case "floatingText":
        return applyFloatingTextEffect(state, effect);
      case "startTurn":
        return applyStartTurnEffect(state, effect, targets);
      case "aura":
        return applyAuraEffect(state, effect, targets, ctx);
      case "heal":
        return applyHealEffect(state, effect, targets, ctx, false);
      case "temporaryStamina":
        return applyHealEffect(state, effect, targets, ctx, true);
      case "teleport":
        return applyTeleportEffect(state, effect, targets, ctx);
      case "swap":
        return applySwapEffect(state, effect, targets, ctx);
      case "abilityTest":
        return applyAbilityTestEffect(state, effect, targets, ctx);
      case "freeStrike":
        return applyFreeStrikeEffect(state, effect, targets, ctx);
      case "cascade":
        return reminderEffect(state, effect, targets, "Cascade");
      case "resourceGain":
        return applyResourceGainEffect(state, effect, targets, ctx);
      case "surgeGain":
        return applySurgeGainEffect(state, effect, targets, ctx);
      case "note":
        return noteEffect(state, effect);
      case "other":
        return reminderEffect(state, effect, targets, "Note");
      default:
        return null;
    }
  }

  async function applyFloatingTextEffect(state, effect) {
    const text = String(effect.text || "").trim();
    if (!text) return;
    if (typeof state.context.showFloatingText === "function") {
      await state.context.showFloatingText({
        text,
        audience: effect.audience || "all",
        tone: effect.tone || "danger",
        durationMs: effect.durationMs,
        sourceId: state.sourcePlacement?.id || "",
        sourceName: state.heroName || state.sourcePlacement?.name || "",
        abilityName: state.action?.name || "Ability",
        actionId: state.action?.id || "",
      });
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${text}`,
    });
  }

  async function applyStartTurnEffect(state, effect, targets) {
    const target = Array.isArray(targets) && targets.length ? targets[0] : state.sourcePlacement;
    const placementId = target?.id || state.sourcePlacement?.id || "";
    if (!placementId) return;
    if (typeof state.context.startTurn !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: start turn manually.`,
      });
      return;
    }
    const result = await state.context.startTurn({
      placementId,
      target: effect.target || "self",
      condition: effect.condition || "enemyPickNoActive",
      confirmOnInvalid: effect.confirmOnInvalid !== false,
      invalidMessage: effect.invalidMessage || "",
      sourceId: state.sourcePlacement?.id || "",
      sourceName: state.heroName || state.sourcePlacement?.name || "",
      abilityName: state.action?.name || "Ability",
      actionId: state.action?.id || "",
      preflightAccepted: Boolean(state.startTurnPreflightAccepted),
    });
    if (result && result.started === false && result.message) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${result.message}`,
      });
    }
  }

  async function preflightStartTurnEffects(state, blocks) {
    if (!Array.isArray(blocks) || typeof state.context.startTurn !== "function") return true;
    const effect = findFirstStartTurnEffectInBlocks(blocks);
    if (!effect) return true;
    const placementId = state.sourcePlacement?.id || "";
    if (!placementId) return true;
    const result = await state.context.startTurn({
      placementId,
      target: effect.target || "self",
      condition: effect.condition || "enemyPickNoActive",
      confirmOnInvalid: effect.confirmOnInvalid !== false,
      invalidMessage: effect.invalidMessage || "",
      sourceId: state.sourcePlacement?.id || "",
      sourceName: state.heroName || state.sourcePlacement?.name || "",
      abilityName: state.action?.name || "Ability",
      actionId: state.action?.id || "",
      preflight: true,
    });
    if (result?.canceled || result?.accepted === false) return false;
    if (result?.accepted) {
      state.startTurnPreflightAccepted = true;
    }
    return true;
  }

  function findFirstStartTurnEffectInBlocks(blocks) {
    for (const block of blocks || []) {
      const found = findFirstStartTurnEffectInBlock(block);
      if (found) return found;
    }
    return null;
  }

  function findFirstStartTurnEffectInBlock(block) {
    if (!block || typeof block !== "object") return null;
    if (Array.isArray(block.effects)) {
      const found = findFirstStartTurnEffectInEffects(block.effects);
      if (found) return found;
    }
    if (block.tiers && typeof block.tiers === "object") {
      for (const tier of Object.values(block.tiers)) {
        const found = findFirstStartTurnEffectInEffects(tier?.effects || []);
        if (found) return found;
      }
    }
    for (const listName of ["then", "else", "cards"]) {
      if (Array.isArray(block[listName])) {
        const found = findFirstStartTurnEffectInBlocks(block[listName]);
        if (found) return found;
      }
    }
    if (Array.isArray(block.options)) {
      for (const option of block.options) {
        const found = findFirstStartTurnEffectInBlocks(option?.cards || []);
        if (found) return found;
      }
    }
    return null;
  }

  function findFirstStartTurnEffectInEffects(effects) {
    for (const effect of effects || []) {
      if (!effect || typeof effect !== "object") continue;
      if (effect.kind === "startTurn") return effect;
      for (const nested of ["then", "else", "effects", "onFail", "onResist"]) {
        if (Array.isArray(effect[nested])) {
          const found = findFirstStartTurnEffectInEffects(effect[nested]);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // The ability's melee distance: the largest melee distance among its target cards (1 when it names none).
  function abilityMeleeDistance(state) {
    let reach = 0;
    walkAutomationBlocks(state.automation, (block) => {
      const distance = block?.type === "target" ? block.distance : null;
      if (distance && (distance.form === "melee" || distance.form === "meleeOrRanged")) reach = Math.max(reach, Number(distance.value) || 0);
    });
    return reach || 1;
  }

  // A kit's melee-only (or ranged-only) damage bonus for this target: melee when it stands within the ability's melee
  // distance of the caster, ranged beyond it. When the distance can't be told, the bonus applies, as it did before.
  async function reachBonusFor(state, effect, target) {
    const bonuses = Array.isArray(effect?.reachBonuses) ? effect.reachBonuses : [];
    if (!bonuses.length) return 0;
    let squares = null;
    const sourceId = state.sourcePlacement?.id || "";
    if (sourceId && target?.id && typeof state.context.getDistanceBetween === "function") {
      try { squares = Number(await state.context.getDistanceBetween(sourceId, target.id)); } catch (_) { squares = null; }
    }
    const known = Number.isFinite(squares);
    const melee = known && squares <= abilityMeleeDistance(state);
    return bonuses.reduce((sum, bonus) => sum + (!known || (bonus.reach === "melee") === melee ? Number(bonus.amount) || 0 : 0), 0);
  }

  async function applyDamageEffect(state, effect, targets, ctx) {
    if (!targets.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} (no target).`,
      });
      return;
    }
    const baseAmount = asInt(effect.amount, 0);
    const damageMultiplier = Number(effect.multiplier) || 1;
    const attributeBonus = effect.attribute
      ? resolveAttributeBonusForDamage(state, effect.attribute) * damageMultiplier
      : 0;
    const countsCreatures = effect.amountFrom?.source === "count";
    const triggerValue = countsCreatures ? 0 : resolveTriggerValue(state, effect.amountFrom);
    let damageType = effect.damageType && effect.damageType !== "untyped" ? effect.damageType : "";
    const damageTypeOptions = Array.isArray(effect.damageTypeOptions)
      ? [...new Set(effect.damageTypeOptions
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean))]
      : [];
    if (damageTypeOptions.length >= 2) {
      const choice = typeof state.context.chooseDamageType === "function"
        ? await state.context.chooseDamageType({
          abilityName: state.action.name || "Ability",
          actionId: state.action?.id || "",
          options: damageTypeOptions,
        })
        : null;
      const selected = String(choice?.damageType ?? choice ?? "").trim().toLowerCase();
      if (!damageTypeOptions.includes(selected)) {
        state.aborted = true;
        return;
      }
      damageType = selected === "untyped" ? "" : selected;
      // Keep the choice in this effect-list execution context so a following
      // typed rider (for example Smolder's weakness) can inherit the exact
      // damage type that was just chosen.
      if (ctx && typeof ctx === "object") ctx.selectedDamageType = damageType;
    }
    if (ctx && typeof ctx === "object") {
      // Inheritance is intentionally limited to a choice-based damage effect
      // immediately preceding the numeric rider. Any later fixed/untyped
      // damage clears it so legacy universal weaknesses stay universal.
      ctx.selectedDamageType = damageTypeOptions.length ? damageType : "";
    }
    const lines = [];
    let visibleHidden = 0;
    const selectedSurgeBonus = await consumePowerRollSurgeBonus(state, ctx, targets);
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const surgeBonus = selectedSurgeBonus.targetId === target.id ? selectedSurgeBonus : { spent: 0, damage: 0 };
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
      const reachBonus = await reachBonusFor(state, effect, target);
      const counted = countsCreatures ? await countAmountFor(state, effect.amountFrom, target, targets) : null;
      if (counted) {
        await postChat(state.context, { message: `${state.heroName} - ${state.action.name || "Ability"}: ${counted.count} counted for ${target.name || "the target"} (+${counted.extra}).` });
      }
      const amountBeforeSurge = Math.max(0, baseAmount + attributeBonus + diceAmount + markBonus + triggerValue + reachBonus + (counted ? counted.extra : 0));
      const amount = Math.max(0, amountBeforeSurge + surgeBonus.damage);
      // Nobody counted and nothing else: no hit of 0.
      if (counted && amount <= 0) continue;
      const damagePayload = {
        placementId: target.id,
        sourceId: state.sourcePlacement?.id || "",
        amount,
        damageType,
        abilityName: state.action.name || "Ability",
        actionId: state.action?.id || "",
        actionKind: getActionKind(state),
        cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
        keywords: getAbilityKeywords(state),
      };
      if (effect.ignoreImmunity !== undefined) damagePayload.ignoreImmunity = effect.ignoreImmunity;
      if (surgeBonus.spent > 0) {
        damagePayload.includesSurge = true;
        damagePayload.surgeSpent = surgeBonus.spent;
        damagePayload.surgeDamage = surgeBonus.damage;
      }
      const result =
        typeof state.context.applyDamage === "function"
          ? await state.context.applyDamage(damagePayload)
          : null;
      state.damageDealt = asInt(state.damageDealt, 0) + Math.max(0, Number.isFinite(result?.amount) ? result.amount : amount);
      const hidden = Boolean(result?.hidden || target.hidden || target.placement?.hidden);
      if (hidden) {
        visibleHidden += 1;
        continue;
      }
      const targetName = result?.name || target.name || "Target";
      const finalAmount = Number.isFinite(result?.amount) ? result.amount : amount;
      const adjustments = [];
      if (surgeBonus.damage > 0) adjustments.push(`+${surgeBonus.damage} surge`);
      if (Number.isFinite(result?.vulnerability) && result.vulnerability > 0) adjustments.push(`+${result.vulnerability} vulnerability`);
      if (Number.isFinite(result?.immunity) && result.immunity > 0) adjustments.push(`-${result.immunity} immunity`);
      if (Number.isFinite(result?.ignoredImmunity) && result.ignoredImmunity > 0) adjustments.push(`${result.ignoredImmunity} immunity ignored`);
      const adjustmentText = !result?.hideHitPointValues && adjustments.length
        ? ` (${amountBeforeSurge}${damageType ? ` ${damageType}` : ""} ${adjustments.join(" ")} = ${finalAmount})`
        : "";
      const remaining = result?.hideHitPointValues ? "" : result?.max !== null && result?.max !== undefined
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

  async function applyConditionEffect(state, effect, targets, ctx = {}) {
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
        const damageType = effect.damageType || ctx.selectedDamageType || "";
        if (damageType) conditionPayload.damageType = damageType;
      }
      if (effect.name === "hiddenEffect") {
        conditionPayload.hidden = true;
        // A buff: its label shows on the token (hidden effects otherwise show only as a badge).
        if (effect.shown === true) conditionPayload.shown = true;
        conditionPayload.label = effect.label || effect.text || "Hidden effect";
        if (effect.rider && typeof effect.rider === "object") {
          conditionPayload.rider = JSON.parse(JSON.stringify(effect.rider));
        }
        if (effect.consume) conditionPayload.consume = effect.consume;
        if (effect.sourceId) conditionPayload.sourceId = effect.sourceId;
        conditionPayload.sourceName = effect.sourceName || state.heroName || "";
        conditionPayload.sourceAbility = effect.sourceAbility || state.action?.name || "";
      }
      if (effect.sourceId && !conditionPayload.sourceId) {
        conditionPayload.sourceId = effect.sourceId;
      }
      if (effect.sourceName && !conditionPayload.sourceName) {
        conditionPayload.sourceName = effect.sourceName;
      }
      if (effect.sourceAbility && !conditionPayload.sourceAbility) {
        conditionPayload.sourceAbility = effect.sourceAbility;
      }
      if (Array.isArray(effect.riders) && effect.riders.length) {
        conditionPayload.riders = JSON.parse(JSON.stringify(effect.riders));
        if (!conditionPayload.sourceName) {
          conditionPayload.sourceName = state.heroName || state.sourcePlacement?.name || "";
        }
        if (!conditionPayload.sourceAbility) {
          conditionPayload.sourceAbility = state.action?.name || "";
        }
      }
      await state.context.applyCondition?.({
        placementId: target.id,
        condition: conditionPayload,
        sourceId: state.sourcePlacement?.id || "",
        sourceName: state.heroName || state.sourcePlacement?.name || "",
      });
    }
    const describedEffect = isNumeric && !effect.damageType && ctx.selectedDamageType
      ? { ...effect, damageType: ctx.selectedDamageType }
      : effect;
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: applies ${P.describeEffect(describedEffect)}.`,
    });
  }

  async function applyIfStrainedEffect(state, effect, _targets, ctx) {
    const strained = isCasterStrained(state);
    const branch = strained ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    // Branch goes to the wrapper's own target, else the current target group (as ifPrompt).
    await applyEffects(state, branch, effect.target || null, ctx);
  }

  function formatPromptQuestion(effect, targets) {
    const firstTarget = targets?.[0]?.name || "the target";
    return String(effect.question || "Confirm?")
      .replace(/\{target\}/g, firstTarget);
  }

  async function askAutomationPrompt(state, effect, targets) {
    const question = formatPromptQuestion(effect, targets);
    if (typeof document === "undefined" || !document.body) {
      return global.confirm(question);
    }
    const host = makeHost("Confirm", state.action.name || "Ability Automation", "prompt", state.context?.automationAnchor || null);
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--compact">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(question)}</p>
        </div>
        <div class="power-roll-runner__actions">
          <button type="button" class="dice-btn dice-btn-primary" data-if-prompt-answer="yes">${escapeHtml(effect.yesLabel || "Yes")}</button>
          <button type="button" class="dice-btn dice-btn-secondary" data-if-prompt-answer="no">${escapeHtml(effect.noLabel || "No")}</button>
        </div>
      </section>
    `;
    return new Promise((resolve) => {
      const finish = (value) => {
        host.removeEventListener("click", onClick);
        host.removeEventListener("automation-cancel", onCancel);
        closeRunner();
        resolve(value);
      };
      const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const answer = target?.closest("[data-if-prompt-answer]")?.getAttribute("data-if-prompt-answer");
        if (answer === "yes") finish(true);
        if (answer === "no") finish(false);
      };
      const onCancel = () => {
        state.aborted = true;
        finish(false);
      };
      host.addEventListener("click", onClick);
      host.addEventListener("automation-cancel", onCancel);
    });
  }

  async function applyIfPromptEffect(state, effect, targets, ctx) {
    const answer = await askAutomationPrompt(state, effect, targets);
    if (state.aborted) return;
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${formatPromptQuestion(effect, targets)} ${answer ? effect.yesLabel || "Yes" : effect.noLabel || "No"}.`,
    });
    const branch = answer ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    await applyEffects(state, branch, effect.target || null, ctx);
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
    const payload = state.triggerPayload?.payload && typeof state.triggerPayload.payload === "object"
      ? state.triggerPayload.payload
      : state.triggerPayload || null;
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
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${targetName} takes ${taken} of ${originalAmount} (refunded ${refund} stamina${result?.hideHitPointValues ? "" : `; ${display}`}).`,
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
    const recoverySource = String(effect.recoverySource || "target").trim().toLowerCase();
    const recoveryFromSelf = recoveries && ["self", "source", "caster"].includes(recoverySource);
    const selfRecoveryTarget = recoveryFromSelf && state.sourcePlacement?.id
      ? state.sourcePlacement
      : null;
    const attributeBonus = effect.attribute
      ? resolveAttributeBonusForDamage(state, effect.attribute)
      : 0;
    const countsCreatures = effect.amountFrom?.source === "count";
    const triggerValue = countsCreatures ? 0 : resolveTriggerValue(state, effect.amountFrom);
    const flatAmount = Math.max(0, asInt(effect.amount, 0) + attributeBonus + triggerValue);

    if (!recoveries && !flatAmount && !countsCreatures) return;

    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;

      // Resolve the actual heal amount for this target. With `recoveries`,
      // the VTT hook spends the target's recovery counter and returns their
      // recovery value. Older hosts can still provide only the read hook, in
      // which case chat reminds the player to decrement recoveries manually.
      let amount = flatAmount;
      // "Regain 2 Stamina for each ally adjacent to you": counted for this target.
      if (countsCreatures) {
        const counted = await countAmountFor(state, effect.amountFrom, target, targets);
        amount += counted.extra;
        if (!amount && !recoveries) continue;
      }
      let recoveryValueUsed = 0;
      let recoveryUnknown = false;
      let recoverySpent = 0;
      let recoveryManualDecrement = false;
      let recoverySourceName = recoveryFromSelf ? state.heroName : target.name || "Target";
      if (recoveries) {
        const recoveryTarget = selfRecoveryTarget || target;
        recoverySourceName = recoveryTarget.name || recoverySourceName;
        if (!recoveryTarget?.id) {
          lines.push(`${recoveryFromSelf ? state.heroName : target.name || "Target"}: recovery spend skipped (missing placement).`);
          recoveryUnknown = true;
        } else {
          const spent = typeof state.context.spendRecoveryForTarget === "function"
            ? await state.context.spendRecoveryForTarget({
                placementId: recoveryTarget.id,
                recoveries,
                abilityName: state.action.name || "Ability",
              })
            : null;
          if (spent?.skipped) {
            lines.push(`${recoveryTarget.name || state.heroName || "Recovery source"}: recovery spend skipped (${spent.reason || "unavailable"}).`);
          } else if (Number.isFinite(spent?.recoveryValue) && spent.recoveryValue > 0) {
            recoverySpent = asInt(spent.spent, recoveries);
            recoverySourceName = spent.name || recoverySourceName;
            recoveryValueUsed = Math.trunc(spent.recoveryValue) * recoverySpent;
            amount = recoveryValueUsed + flatAmount;
          } else {
            const resolved = typeof state.context.getRecoveryValueForTarget === "function"
              ? await state.context.getRecoveryValueForTarget({ placementId: recoveryTarget.id })
              : null;
            if (Number.isFinite(resolved?.recoveryValue) && resolved.recoveryValue > 0) {
              recoverySpent = recoveries;
              recoveryManualDecrement = true;
              recoveryValueUsed = Math.trunc(resolved.recoveryValue) * recoveries;
              amount = recoveryValueUsed + flatAmount;
            } else {
              recoveryUnknown = true;
            }
          }
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
      const overage = !result.hideHitPointValues && allowTempHp && Number.isFinite(max) && current > max ? ` (+${current - max} temp)` : "";
      const finalRecoveryNote = recoveries && recoveryValueUsed
        ? ` (spent ${recoverySpent || recoveries} ${recoverySourceName} recovery -> ${recoveryValueUsed}${flatAmount ? `+${flatAmount}` : ""}${recoveryManualDecrement ? "; decrement recoveries on sheet" : ""})`
        : "";
      lines.push(`${targetName} recovers ${result.change || amount} stamina${overage}${finalRecoveryNote}${result.hideHitPointValues ? "" : ` (${display})`}.`);
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
    const distance = P.resolveForcedMovementDistance
      ? P.resolveForcedMovementDistance(effect, state.context)
      : asInt(effect.distance, 0);
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
        keywords: getAbilityKeywords(state),
        abilityName: state.action.name || "Ability",
        ...(effect.ignoreStability !== undefined ? { ignoreStability: effect.ignoreStability } : {}),
        ...(effect.ignoreRestrained === true ? { ignoreRestrained: true } : {}),
      });
      if (!result || result.skipped) {
        lines.push(`${target.name || "Target"}: ${verb} ${distance} skipped.`);
        continue;
      }
      const moved = result.movedDistance ?? distance;
      if (moved <= 0 && !result.collision) {
        lines.push(`${result.name || target.name || "Target"} is not moved: there is nowhere to ${verb.replace(/^vertical/, "").toLowerCase()} them.`);
        continue;
      }
      if (typeof state.context.fireTriggerEvent === "function") {
        const eventPayload = {
          placementId: target.id,
          targetId: target.id,
          targetName: result.name || target.name || "",
          sourceId: state.sourcePlacement?.id || "",
          sourceName: state.heroName || "",
          actorId: state.sourcePlacement?.id || "",
          actorName: state.heroName || "",
          distance: moved,
          movedDistance: moved,
          requestedDistance: distance,
          verb,
          abilityName: state.action.name || "Ability",
          actionId: state.action?.id || "",
          actionKind: getActionKind(state),
          cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
          keywords: getAbilityKeywords(state),
        };
        state.context.fireTriggerEvent({ eventType: "forcedMovement", payload: eventPayload });
        state.context.fireTriggerEvent({ eventType: "forcedMovementDealt", payload: eventPayload });
      }
      const pastVerb = ({ push: "pushed", pull: "pulled", slide: "slid", verticalPush: "vertically pushed", verticalPull: "vertically pulled", verticalSlide: "vertically slid" })[verb] || "moved";
      lines.push(`${result.name || target.name || "Target"} is ${pastVerb} ${moved} square${moved === 1 ? "" : "s"}.`);
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

  function parseSpeedValue(value) {
    const match = String(value ?? "").match(/-?\d+/);
    if (!match) return 0;
    return Math.max(0, asInt(match[0], 0));
  }

  function resolveShiftDistance(state, effect) {
    if (effect.distance !== "speed") return asInt(effect.distance, 0);
    return parseSpeedValue(
      state.hero?.vitals?.speed ??
      state.hero?.speed ??
      state.sourceTraits?.speed ??
      state.sourcePlacement?.traits?.speed ??
      state.sourcePlacement?.movementSpeed ??
      state.sourcePlacement?.speed ??
      state.sourcePlacement?.movement
    );
  }

  function getShiftPool(state, effect) {
    const poolKey = effect.pool || "";
    if (!poolKey) return null;
    state.shiftPools ||= {};
    if (!state.shiftPools[poolKey]) {
      state.shiftPools[poolKey] = {
        total: resolveShiftDistance(state, effect),
        used: 0,
      };
    }
    return state.shiftPools[poolKey];
  }

  async function applyShiftEffect(state, effect, _targets, _ctx) {
    const target = state.sourcePlacement;
    if (!target?.id) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} (no source token).`,
      });
      return;
    }
    const pool = getShiftPool(state, effect);
    const baseDistance = pool ? Math.max(0, pool.total - pool.used) : resolveShiftDistance(state, effect);
    if (!baseDistance) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: no shift distance remaining.`,
      });
      return;
    }
    if (typeof state.context.forceMove !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: shift up to ${baseDistance} squares â€” apply manually.`,
      });
      return;
    }
    const result = await state.context.forceMove({
      movement: "slide",
      verb: "slide",
      verbLabel: "Shift",
      distance: baseDistance,
      upTo: true,
      ignoreStability: true,
      ignoreSizePenalty: true,
      targetId: target.id,
      target,
      sourcePlacement: target,
      sourceTraits: state.sourceTraits || {},
      abilityName: state.action.name || "Ability",
    });
    if (!result || result.skipped) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: shift skipped${pool ? ` (${baseDistance} remaining)` : ""}.`,
      });
      return;
    }
    const moved = Math.max(0, asInt(result.movedDistance, baseDistance));
    if (pool) pool.used = Math.min(pool.total, pool.used + moved);
    const remaining = pool ? Math.max(0, pool.total - pool.used) : 0;
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: shifted ${moved} square${moved === 1 ? "" : "s"}${pool ? ` (${remaining} remaining)` : ""}.`,
    });
  }

  async function applyPotencyEffect(state, effect, targets, ctx) {
    if (!targets.length) return;
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;
      if (typeof state.context.fireTriggerEvent === "function") {
        state.context.fireTriggerEvent({
          eventType: "potency",
          payload: {
            actorId: state.sourcePlacement?.id || "",
            actorName: state.heroName || "",
            sourceId: state.sourcePlacement?.id || "",
            sourceName: state.heroName || "",
            targetId: target.id,
            targetName: target.name || "",
            targetIds: targets.map((item) => item?.id).filter(Boolean),
            targetCount: targets.length,
            actionId: state.action?.id || "",
            actionName: state.action?.name || "Ability",
            actionKind: getActionKind(state),
            cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
            keywords: getAbilityKeywords(state),
            attribute: effect.attribute || "",
            level: effect.level || "",
          },
        });
      }
      const result =
        typeof state.context.checkPotency === "function"
          ? await state.context.checkPotency({
            placementId: target.id,
            attribute: effect.attribute,
            threshold: Number.isFinite(Number(effect.threshold))
              ? Number(effect.threshold)
              : effect.level,
            sourceStats: state.hero?.stats || {},
            ...(asInt(state.rollPotencyBonus, 0) ? { thresholdBonus: asInt(state.rollPotencyBonus, 0) } : {}),
            })
          : { passes: true };
      if (!result?.passes) {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: ${target.name || "Target"} resisted ${effect.attribute}<${Number.isFinite(result?.threshold) ? result.threshold : Number.isFinite(Number(effect.threshold)) ? Number(effect.threshold) : effect.level}.`,
        });
        if (Array.isArray(effect.onResist) && effect.onResist.length) {
          await applyPotencyBranch(state, [target], effect.onResist, ctx);
        }
        continue;
      }
      await applyPotencyBranch(state, [target], effect.onFail || [], ctx);
    }
  }

  // A potency result's effects: on the ability's own state (its named groups, and a stop that ends the ability), with
  // the target that failed or resisted as the group they fall back to. The state is put back as it was afterwards.
  async function applyPotencyBranch(state, targets, effects, ctx) {
    if (!effects.length) return;
    const hadGroup = Object.prototype.hasOwnProperty.call(state.groups, "_potency");
    const previousGroup = state.groups._potency;
    const previousCurrent = state.currentGroup;
    state.groups._potency = targets;
    state.currentGroup = "_potency";
    try {
      await applyEffects(state, effects, "_potency", ctx);
    } finally {
      if (hadGroup) state.groups._potency = previousGroup;
      else delete state.groups._potency;
      state.currentGroup = previousCurrent;
    }
  }

  async function applyIfKeywordEffect(state, effect, targets, ctx) {
    const keywords = getAbilityKeywords(state);
    const matched = P.keywordsMatch
      ? P.keywordsMatch(keywords, { all: effect.all, any: effect.any, none: effect.none })
      : true;
    const branch = matched ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    // The wrapper's own target, else the current target group (as ifPrompt).
    await applyEffects(state, branch, effect.target || null, ctx);
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

  async function applyIfDistanceEffect(state, effect, targets, ctx) {
    const spec = {
      from: effect.from || "self",
      to: effect.to || effect.target || "target",
      fromGroup: effect.fromGroup,
      toGroup: effect.toGroup,
      max: effect.max,
      min: effect.min,
    };
    const squares = await measureDistanceBetween(state, spec);
    const matched = distanceWithinBand(squares, spec);
    const branch = matched ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    const branchGroup = effect.target || state.currentGroup || "primary";
    await applyEffects(state, branch, branchGroup, ctx);
  }

  // ---------- terrain zones ("is it in blood?") ----------
  // The board knows which tagged zones a token stands in. `getZoneTags(id)` gives the list of
  // tags, or null when the board cannot say (no zones on this scene, or the host has no such
  // callback). When it cannot say, the user is asked once instead, exactly like ifPrompt.
  // With `adjacent` the board answers with the zones the token is in or next to.
  async function zoneTagsFor(state, placementId, adjacent = false) {
    if (!placementId || typeof state.context.getZoneTags !== "function") return null;
    try {
      const tags = await state.context.getZoneTags(placementId, { adjacent: Boolean(adjacent) });
      return Array.isArray(tags) ? tags.map((tag) => String(tag).trim().toLowerCase()) : null;
    } catch (_) {
      return null;
    }
  }

  function zoneSpecTags(spec) {
    const list = Array.isArray(spec?.tags) && spec.tags.length ? spec.tags : spec?.tag ? [spec.tag] : [];
    return list.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  }

  function zoneSubjects(state, spec, targets) {
    if (String(spec?.who || "target").toLowerCase() === "self") {
      return state.sourcePlacement?.id ? [{ id: state.sourcePlacement.id, name: state.heroName }] : [];
    }
    const list = spec?.target ? getTargetGroup(state, spec.target) : targets;
    return (list || []).filter((target) => target && target.id);
  }

  function zoneWhere(spec) {
    return spec?.adjacent === true ? "in or next to" : "in";
  }

  function zoneQuestion(spec, tags) {
    return spec?.question || `Is {target} ${zoneWhere(spec)} ${tags.join(" or ") || "the zone"}?`;
  }

  // Sorts the subjects into those standing in one of the zones and those not.
  async function resolveZoneCondition(state, spec, targets) {
    const tags = zoneSpecTags(spec);
    const subjects = zoneSubjects(state, spec, targets);
    const inside = [];
    const outside = [];
    // Nobody was targeted (an area with no creature in it): there is nothing to check and nobody to ask about.
    if (!subjects.length && String(spec?.who || "target").toLowerCase() !== "self") {
      return { tags, subjects, inside, outside, asked: false, nobody: true };
    }
    let known = subjects.length > 0 && tags.length > 0;
    if (known) {
      for (const subject of subjects) {
        const found = await zoneTagsFor(state, subject.id, spec?.adjacent === true);
        if (found === null) { known = false; break; }
        (tags.some((tag) => found.includes(tag)) ? inside : outside).push(subject);
      }
    }
    if (known) return { tags, subjects, inside, outside, asked: false };
    const answer = await askAutomationPrompt(state, { question: zoneQuestion(spec, tags), yesLabel: "Yes", noLabel: "No" }, subjects);
    return { tags, subjects, inside: answer ? subjects : [], outside: answer ? [] : subjects, asked: true, answer: Boolean(answer) };
  }

  function zoneChatLine(state, spec, result) {
    const prefix = `${state.heroName} - ${state.action.name || "Ability"}: `;
    if (result.asked) {
      return `${prefix}${formatPromptQuestion({ question: zoneQuestion(spec, result.tags) }, result.subjects)} ${result.answer ? "Yes" : "No"}.`;
    }
    const label = result.tags.join(" or ");
    const names = (list) => list.map((subject) => subject.name || "the target").join(", ");
    const parts = [];
    const where = zoneWhere(spec);
    if (result.inside.length) parts.push(`${names(result.inside)} ${result.inside.length === 1 ? "is" : "are"} ${where} ${label}`);
    if (result.outside.length) parts.push(`${names(result.outside)} ${result.outside.length === 1 ? "is" : "are"} not ${where} ${label}`);
    return `${prefix}${parts.join("; ")}.`;
  }

  // ifZone: each target gets the branch that fits where it stands. With `who: "self"` the whole
  // group follows where the user of the ability stands.
  async function applyIfZoneEffect(state, effect, targets, ctx) {
    const result = await resolveZoneCondition(state, effect, targets);
    if (state.aborted || result.nobody) return;
    await postChat(state.context, { message: zoneChatLine(state, effect, result) });
    const group = effect.target || state.currentGroup || "primary";
    const selfMode = String(effect.who || "target").toLowerCase() === "self";
    const runFor = async (branch, subset) => {
      if (!Array.isArray(branch) || !branch.length) return;
      if (selfMode || !subset) { await applyEffects(state, branch, group, ctx); return; }
      if (!subset.length) return;
      // A short-lived group holding just the targets this branch applies to.
      const saved = state.currentGroup;
      const temp = `__zone_${state.zoneGroupSeq = (state.zoneGroupSeq || 0) + 1}`;
      state.groups[temp] = subset;
      try { await applyEffects(state, branch, temp, ctx); }
      finally { delete state.groups[temp]; state.currentGroup = saved; }
    };
    if (selfMode) {
      await runFor(result.inside.length ? effect.then : effect.else, null);
      return;
    }
    await runFor(effect.then, result.inside);
    if (state.aborted) return;
    await runFor(effect.else, result.outside);
  }

  // ---------- target checks (ifTarget, branch "target") ----------
  //
  // Facts read from the token: its conditions (custom ones by their name, e.g. "wet"), size, stability,
  // Stamina and kind of creature. When the board can't tell a fact (a hero's stability, a token with no
  // size), the user is asked once, like ifPrompt. Each target gets the branch that fits it.

  const SIZE_LETTER_RANK = { T: 1, S: 2, M: 3, L: 4 };

  // 1T=1, 1S=2, 1M=3, 1L=4, 2=5, 3=6... A bare 1 is 1M for a creature; as a limit it means any size 1.
  function sizeRank(value, bound) {
    const text = String(value === null || value === undefined ? "" : value).trim().toUpperCase().replace(/\s+/g, "");
    const match = /^(\d+)([TSML]?)$/.exec(text);
    if (!match) return null;
    const number = parseInt(match[1], 10);
    if (number <= 1) {
      if (match[2]) return SIZE_LETTER_RANK[match[2]];
      return bound === "max" ? 4 : bound === "min" ? 1 : 3;
    }
    return number + 3;
  }

  function liveTokenFor(state, subject) {
    const id = subject?.id || "";
    const live = id && typeof state.context.getPlacementById === "function" ? state.context.getPlacementById(id) : null;
    if (live && typeof live === "object") return live;
    return subject?.placement && typeof subject.placement === "object" ? { ...subject.placement, ...subject } : subject || null;
  }

  function tokenSizeRank(token) {
    const declared = token?.monster?.size ?? token?.automationTraits?.size ?? token?.size;
    const fromDeclared = declared !== undefined && declared !== null && declared !== "" ? sizeRank(declared, "creature") : null;
    if (fromDeclared !== null) return fromDeclared;
    const width = parseInt(token?.width, 10);
    if (Number.isFinite(width) && width > 0) return width <= 1 ? 3 : width + 3;
    return null;
  }

  function tokenStability(token) {
    const value = token?.monster?.stability ?? token?.automationTraits?.stability ?? token?.stability;
    const number = parseInt(value, 10);
    return Number.isFinite(number) ? number : null;
  }

  function tokenStamina(token) {
    const hp = token?.hp;
    let current; let max;
    if (hp && typeof hp === "object") { current = hp.current; max = hp.max; }
    else { current = hp; max = token?.maxHp ?? token?.hpMax; }
    current = Number(current); max = Number(max);
    return Number.isFinite(current) && Number.isFinite(max) && max > 0 ? { current, max } : null;
  }

  function tokenConditions(token) {
    const raw = Array.isArray(token?.conditions) ? token.conditions : token?.condition ? [token.condition] : [];
    return raw.map((entry) => (typeof entry === "string" ? { name: entry } : entry)).filter((entry) => entry && typeof entry === "object");
  }

  function tokenKindWords(token) {
    const monster = token?.monster || token?.automationTraits || {};
    const text = [monster.role, monster.types, monster.keywords, monster.ancestry, monster.name, token?.name]
      .map((value) => (Array.isArray(value) ? value.join(" ") : value || "")).join(" ").toLowerCase();
    return new Set(text.split(/[^a-z0-9']+/).filter(Boolean));
  }

  // true / false, or null when the board can't tell.
  function checkTargetFacts(state, test, subject) {
    const token = liveTokenFor(state, subject);
    let unknown = false;
    const fail = () => false;
    if (test.condition && test.condition.length) {
      const casterId = state.sourcePlacement?.id || "";
      const has = tokenConditions(token).some((condition) => {
        const names = [condition.name, condition.text, condition.label].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
        if (!test.condition.some((wanted) => names.includes(wanted))) return false;
        return test.conditionFrom !== "self" || String(condition.sourceId || condition.source?.id || "") === casterId;
      });
      if (!has) return fail();
    }
    if (test.sizeMax || test.sizeMin || test.sizeVsSelf) {
      const rank = tokenSizeRank(token);
      if (rank === null) unknown = true;
      else {
        if (test.sizeMax && rank > sizeRank(test.sizeMax, "max")) return fail();
        if (test.sizeMin && rank < sizeRank(test.sizeMin, "min")) return fail();
        if (test.sizeVsSelf) {
          const mine = tokenSizeRank(liveTokenFor(state, state.sourcePlacement));
          if (mine === null) unknown = true;
          else {
            const ok = { smaller: rank < mine, sameOrSmaller: rank <= mine, same: rank === mine, sameOrLarger: rank >= mine, larger: rank > mine }[test.sizeVsSelf];
            if (!ok) return fail();
          }
        }
      }
    }
    if (test.stabilityMax !== undefined || test.stabilityMin !== undefined) {
      const stability = tokenStability(token);
      if (stability === null) unknown = true;
      else {
        if (test.stabilityMax !== undefined && stability > test.stabilityMax) return fail();
        if (test.stabilityMin !== undefined && stability < test.stabilityMin) return fail();
      }
    }
    if (test.stamina) {
      const stamina = tokenStamina(token);
      if (!stamina) unknown = true;
      else {
        const winded = stamina.current <= Math.floor(stamina.max / 2);
        const ok = {
          winded,
          notWinded: !winded,
          full: stamina.current >= stamina.max,
          belowFull: stamina.current < stamina.max,
          dying: stamina.current <= 0,
        }[test.stamina];
        if (!ok) return fail();
      }
    }
    if ((test.keyword && test.keyword.length) || (test.notKeyword && test.notKeyword.length)) {
      const words = tokenKindWords(token);
      const hasWord = (list) => list.some((word) => word.split(/\s+/).every((part) => words.has(part)));
      if (test.keyword && test.keyword.length && !hasWord(test.keyword)) return fail();
      if (test.notKeyword && test.notKeyword.length && hasWord(test.notKeyword)) return fail();
    }
    return unknown ? null : true;
  }

  // The `nearby` part of a target check needs the board, so it is counted here, after the other facts.
  async function checkNearbyFacts(state, test, subject) {
    if (!test.nearby) return true;
    const count = await countCreatures(state, test.nearby, subject, []);
    if (count === null) return null;
    if (count < (test.nearby.min ?? 1)) return false;
    if (test.nearby.max !== undefined && count > test.nearby.max) return false;
    return true;
  }

  async function resolveTargetTest(state, test, targets) {
    const selfMode = test.who === "self";
    const subjects = selfMode
      ? [state.sourcePlacement].filter((item) => item && item.id)
      : (test.target ? getTargetGroup(state, test.target) : targets || []).filter((item) => item && item.id);
    const passed = []; const failed = []; const unsure = [];
    if (!subjects.length) return { subjects, passed, failed, asked: false, nobody: true };
    for (const subject of subjects) {
      let result = checkTargetFacts(state, test, subject);
      if (result !== false && test.nearby) {
        const near = await checkNearbyFacts(state, test, subject);
        result = near === false ? false : near === null || result === null ? null : true;
      }
      (result === true ? passed : result === false ? failed : unsure).push(subject);
    }
    if (!unsure.length) return { subjects, passed, failed, asked: false };
    const question = test.question || `Is {target} ${P.describeTargetTest(test)}?`;
    const answer = await askAutomationPrompt(state, { question, yesLabel: "Yes", noLabel: "No" }, unsure);
    (answer ? passed : failed).push(...unsure);
    return { subjects, passed, failed, asked: true, answer: Boolean(answer), unsure, question };
  }

  function targetTestChatLine(state, test, result) {
    const prefix = `${state.heroName} - ${state.action.name || "Ability"}: `;
    const names = (list) => list.map((subject) => subject.name || "the target").join(", ");
    const parts = [];
    if (result.passed.length) parts.push(`${names(result.passed)} ${result.passed.length === 1 ? "is" : "are"} ${P.describeTargetTest(test)}`);
    if (result.failed.length) parts.push(`${names(result.failed)} ${result.failed.length === 1 ? "is" : "are"} not`);
    const asked = result.asked ? ` (${formatPromptQuestion({ question: result.question }, result.unsure)} ${result.answer ? "Yes" : "No"})` : "";
    return `${prefix}${parts.join("; ")}.${asked}`;
  }

  async function runSubsetBranch(state, branch, subset, group, ctx) {
    if (!Array.isArray(branch) || !branch.length) return;
    if (!subset) { await applyEffects(state, branch, group, ctx); return; }
    if (!subset.length) return;
    // A short-lived group holding just the targets this branch applies to.
    const saved = state.currentGroup;
    const temp = `__check_${state.zoneGroupSeq = (state.zoneGroupSeq || 0) + 1}`;
    state.groups[temp] = subset;
    try { await applyEffects(state, branch, temp, ctx); }
    finally { delete state.groups[temp]; state.currentGroup = saved; }
  }

  async function applyIfTargetEffect(state, effect, targets, ctx) {
    const result = await resolveTargetTest(state, effect, targets);
    if (state.aborted || result.nobody) return;
    await postChat(state.context, { message: targetTestChatLine(state, effect, result) });
    const group = effect.target || state.currentGroup || "primary";
    if (effect.who === "self") {
      await runSubsetBranch(state, result.passed.length ? effect.then : effect.else, null, group, ctx);
      return;
    }
    await runSubsetBranch(state, effect.then, result.passed, group, ctx);
    if (state.aborted) return;
    await runSubsetBranch(state, effect.else, result.failed, group, ctx);
  }

  // ---------- roll checks (ifRoll, branch "roll") ----------

  function rememberAcceptedRoll(state, block) {
    const accepted = getPowerRollTotal(state, block);
    const natural = state.roll && Number.isFinite(state.roll.total) ? state.roll.total : null;
    const twoD10 = !block.rollFormula || String(block.rollFormula).replace(/\s+/g, "").toLowerCase() === "2d10";
    state.lastPowerRoll = {
      total: accepted.total,
      net: accepted.edgeState.net,
      natural,
      tier: state.selectedTier || "",
      critical: Boolean(twoD10 && natural !== null && natural >= 19),
    };
  }

  function rollTestPasses(state, test) {
    const roll = state.lastPowerRoll;
    if (!roll) return false;
    if (test.edge) {
      const net = roll.net;
      const ok = {
        edge: net === 1,
        doubleEdge: net >= 2,
        anyEdge: net >= 1,
        bane: net === -1,
        doubleBane: net <= -2,
        anyBane: net <= -1,
        none: net === 0,
      }[test.edge];
      if (!ok) return false;
    }
    if (test.critical === true && !roll.critical) return false;
    if (Array.isArray(test.tier) && test.tier.length && !test.tier.includes(roll.tier)) return false;
    return true;
  }

  async function applyIfRollEffect(state, effect, targets, ctx) {
    const passes = rollTestPasses(state, effect);
    const branch = passes ? effect.then : effect.else;
    if (!Array.isArray(branch) || !branch.length) return;
    await applyEffects(state, branch, effect.target || state.currentGroup || "primary", ctx);
  }

  // ---------- move other creatures ----------
  //
  // "Allies shift up to their speed", "one ally within 3 shifts 2", "each ally moves half its speed, then free
  // strikes". Monsters and other tokens are moved by whoever uses the ability; a hero gets a popup and moves itself;
  // the ability waits for the heroes. `then` effects run on each creature after it moved.

  async function moveDistanceFor(state, effect, target) {
    let base = asInt(effect.distance, 0);
    if (effect.distance === "speed" || effect.distance === "halfSpeed") {
      let speed = null;
      if (typeof state.context.getSpeed === "function") {
        try { speed = Number(await state.context.getSpeed(target.id)); } catch (_) { speed = null; }
      }
      if (!Number.isFinite(speed)) {
        const token = liveTokenFor(state, target);
        speed = Number(token?.traits?.speed ?? token?.movementSpeed ?? token?.monster?.speed) || 5;
      }
      base = effect.distance === "halfSpeed" ? Math.floor(speed / 2) : speed;
    }
    return Math.max(0, base + asInt(effect.bonus, 0));
  }

  async function moveOneCreature(state, effect, target, distance) {
    const label = state.action.name || "Ability";
    if (effect.verb === "teleport") {
      if (typeof state.context.applyTeleport !== "function") return false;
      const result = await state.context.applyTeleport({ placementId: target.id, distance, abilityName: label, sourcePlacement: target });
      return Boolean(result && !result.skipped);
    }
    if (typeof state.context.forceMove !== "function") {
      await postChat(state.context, { message: `${state.heroName} - ${label}: ${target.name || "the creature"} ${effect.verb === "move" ? "moves" : "shifts"} up to ${distance} (by hand).` });
      return false;
    }
    // The creature's own move (as a shift effect is), so it is a walk or a shift, not forced movement.
    const result = await state.context.forceMove({
      movement: "slide", verb: "slide", verbLabel: effect.verb === "move" ? "Move" : "Shift",
      distance, upTo: true, ignoreStability: true, ignoreSizePenalty: true,
      targetId: target.id, target, sourcePlacement: target, sourceTraits: {},
      walkKind: effect.verb === "move" ? "walk" : "shift", abilityName: label,
    });
    return Boolean(result && !result.skipped);
  }

  async function applyMoveEffect(state, effect, targets, ctx) {
    const label = state.action.name || "Ability";
    const movers = (targets && targets.length ? targets : [state.sourcePlacement]).filter((item) => item && item.id);
    const moved = [];
    const heroes = [];
    for (const target of movers) {
      if (state.aborted) return;
      const distance = await moveDistanceFor(state, effect, target);
      const isHero = effect.heroesMove !== false && effect.verb !== "teleport"
        && target.id !== state.sourcePlacement?.id
        && typeof state.context.isHeroPlacement === "function" && state.context.isHeroPlacement(target.id)
        && typeof state.context.requestHeroMove === "function";
      if (isHero) { heroes.push({ target, distance }); continue; }
      if (await moveOneCreature(state, effect, target, distance)) moved.push(target);
    }
    if (heroes.length) {
      const reply = await state.context.requestHeroMove({
        abilityName: label,
        sourceName: state.heroName || "",
        moves: heroes.map(({ target, distance }) => ({ placementId: target.id, name: target.name || "", distance, verb: effect.verb || "shift" })),
      });
      const done = new Set((reply?.results || []).filter((item) => item?.moved).map((item) => item.placementId));
      heroes.forEach(({ target }) => { if (done.has(target.id)) moved.push(target); });
      const waited = heroes.map(({ target }) => `${target.name || "a hero"} ${done.has(target.id) ? "moved" : "stayed"}`).join(", ");
      await postChat(state.context, { message: `${state.heroName} - ${label}: ${waited}.` });
    }
    if (Array.isArray(effect.then) && effect.then.length && moved.length) {
      await runSubsetBranch(state, effect.then, moved, effect.target || state.currentGroup || "primary", ctx);
    }
  }

  // ---------- use another ability ----------
  //
  // The named ability (of the user, or with who:"target" of each target: "the target uses its signature ability")
  // runs inside this one: its own targets and rolls, `times` times. It costs nothing more. `edge` adds an edge (or,
  // negative, a bane) to its rolls; `sameTargets` gives it this ability's targets instead of picking.
  async function applyUseAbilityEffect(state, effect, targets) {
    const label = state.action.name || "Ability";
    const users = effect.who === "target"
      ? (targets || []).filter((item) => item && item.id)
      : [state.sourcePlacement].filter((item) => item && item.id);
    const reused = (targets || []).filter((item) => item && item.id);
    for (const user of users) {
      if (state.aborted) return;
      const found = typeof state.context.getAbility === "function"
        ? await state.context.getAbility({ placementId: user.id, name: effect.ability })
        : null;
      const cards = found?.automation && schema?.normalizeAutomation ? schema.normalizeAutomation(found.automation).cards : null;
      if (!cards || !cards.length) {
        await postChat(state.context, { message: `${state.heroName} - ${label}: ${user.name || "it"} uses ${found?.name || effect.ability}${effect.times > 1 ? ` ${effect.times} times` : ""} (by hand).` });
        continue;
      }
      const times = Math.max(1, asInt(effect.times, 1));
      for (let use = 0; use < times; use += 1) {
        if (state.aborted) return;
        const saved = { action: state.action, sourcePlacement: state.sourcePlacement, heroName: state.heroName, currentGroup: state.currentGroup };
        const otherUser = user.id !== state.sourcePlacement?.id;
        state.action = { ...found, name: found.name || effect.ability };
        if (otherUser) {
          state.sourcePlacement = liveTokenFor(state, user) || user;
          state.heroName = user.name || state.heroName;
        }
        await postChat(state.context, { message: `${saved.heroName} - ${label}: ${otherUser ? `${user.name || "the target"} uses` : "uses"} ${state.action.name}${times > 1 ? ` (${use + 1} of ${times})` : ""}.` });
        const run = JSON.parse(JSON.stringify(cards)).filter((card) => card && card.type !== "trigger");
        try {
          for (let index = 0; index < run.length; index += 1) {
            if (state.aborted) break;
            const card = run[index];
            if (card.type === "powerRoll" && effect.edge) {
              if (effect.edge > 0) card.edge = Math.min(2, asInt(card.edge, 0) + effect.edge);
              else card.bane = Math.min(2, asInt(card.bane, 0) - effect.edge);
            }
            if (card.type === "target" && effect.sameTargets && reused.length) {
              setTargetGroup(state, card.name || "primary", reused);
              continue;
            }
            await runBlockAt(state, run, index);
          }
        } finally {
          state.action = saved.action;
          state.sourcePlacement = saved.sourcePlacement;
          state.heroName = saved.heroName;
          state.currentGroup = saved.currentGroup;
        }
      }
    }
  }

  // "An ally gets a main action" / "uses its signature ability": a chat reminder (Brandon: "Chat reminder only").
  async function applyGrantActionEffect(state, effect, targets) {
    const label = state.action.name || "Ability";
    const names = (targets || []).map((target) => target?.name).filter(Boolean);
    const who = names.length ? names.join(", ") : "an ally";
    const extra = effect.text ? ` ${effect.text}` : "";
    await postChat(state.context, { message: `${state.heroName} - ${label}: ${who} ${names.length > 1 ? "get" : "gets"} ${effect.grant}.${extra}` });
  }

  // ---------- counters ----------
  //
  // Named counters on a creature (rage, deathcount, charges): `counter` changes one, `ifCounter` / branch "counter"
  // read one. The board keeps them on the token; a counter passive sets its start, limits and reset.

  function counterValueOf(state, subject, name) {
    if (!subject?.id) return null;
    if (typeof state.context.getCounter === "function") {
      const value = Number(state.context.getCounter({ placementId: subject.id, name }));
      return Number.isFinite(value) ? value : 0;
    }
    const token = liveTokenFor(state, subject);
    const value = Number(token?.counters?.[name]);
    return Number.isFinite(value) ? value : 0;
  }

  function counterInBand(value, test) {
    if (value === null) return false;
    if (test.min !== undefined && value < test.min) return false;
    if (test.max !== undefined && value > test.max) return false;
    return true;
  }

  async function applyCounterEffect(state, effect, targets) {
    const recipients = targets && targets.length ? targets : [state.sourcePlacement].filter((item) => item && item.id);
    const label = state.action.name || "Ability";
    for (const target of recipients) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const amount = effect.amountDice ? rollDiceFormula(effect.amountDice) : asInt(effect.amount, effect.op === "set" ? 0 : 1);
      if (typeof state.context.changeCounter !== "function") {
        await postChat(state.context, { message: `${state.heroName} - ${label}: ${effect.name} ${effect.op === "set" ? "=" : effect.op === "spend" ? "-" : "+"}${amount} on ${target.name || "the target"} (by hand).` });
        continue;
      }
      const result = await state.context.changeCounter({
        placementId: target.id, name: effect.name, label: effect.label || "", op: effect.op || "add", amount,
        ...(effect.min !== undefined ? { min: effect.min } : {}), ...(effect.max !== undefined ? { max: effect.max } : {}),
      });
      const shown = result?.label || effect.label || effect.name;
      const short = effect.op === "spend" && result && result.previous < amount ? ` (only had ${result.previous})` : "";
      await postChat(state.context, { message: `${state.heroName} - ${label}: ${target.name || "the target"}'s ${shown} is now ${result?.value ?? "?"}${short}.` });
    }
  }

  async function applyIfCounterEffect(state, effect, targets, ctx) {
    const group = effect.target || state.currentGroup || "primary";
    if (effect.who !== "target") {
      const value = counterValueOf(state, state.sourcePlacement, effect.name);
      await runSubsetBranch(state, counterInBand(value, effect) ? effect.then : effect.else, null, group, ctx);
      return;
    }
    const subjects = (targets || []).filter((item) => item && item.id);
    const passed = subjects.filter((subject) => counterInBand(counterValueOf(state, subject, effect.name), effect));
    const failed = subjects.filter((subject) => !passed.includes(subject));
    await runSubsetBranch(state, effect.then, passed, group, ctx);
    if (state.aborted) return;
    await runSubsetBranch(state, effect.else, failed, group, ctx);
  }

  // ---------- buff ----------
  //
  // "Your next strike gets +2 damage", "edge on your next roll", "+1 potency until the end of your turn", "allies
  // have an edge against this target until...". A label on the token with an x; ticked in the roll window; used up
  // after the next matching roll unless `consume: "duration"`.

  function buffRider(effect) {
    const appliesTo = {};
    if (effect.appliesTo === "strikes") appliesTo.keywordsAll = ["Strike"];
    else if (effect.appliesTo === "melee") appliesTo.keywordsAny = ["Melee"];
    else if (effect.appliesTo === "ranged") appliesTo.keywordsAny = ["Ranged"];
    else if (effect.appliesTo === "tests") appliesTo.rollEvent = "abilityTest";
    else appliesTo.rollEvent = "powerRoll";
    if (Array.isArray(effect.keywordsAny) && effect.keywordsAny.length) appliesTo.keywordsAny = [...(appliesTo.keywordsAny || []), ...effect.keywordsAny];
    if (Array.isArray(effect.keywordsAll) && effect.keywordsAll.length) appliesTo.keywordsAll = [...(appliesTo.keywordsAll || []), ...effect.keywordsAll];
    const rider = { type: "rollBuff", appliesTo, consume: effect.consume === "duration" ? "manual" : "nextMatchingRoll" };
    if (effect.modifier) rider.modifier = effect.modifier;
    if (effect.damageBonus) rider.damageBonus = effect.damageBonus;
    if (effect.speedBonus) rider.speedBonus = effect.speedBonus;
    ["ignoreDifficultTerrain", "noOpportunityAttacks", "moveThroughCreatures"].forEach((flag) => { if (effect[flag]) rider[flag] = true; });
    if (effect.potencyBonus) rider.potencyBonus = effect.potencyBonus;
    if (effect.side === "against") rider.side = "against";
    return rider;
  }

  async function applyBuffEffect(state, effect, targets, ctx) {
    const recipients = targets && targets.length ? targets : [state.sourcePlacement].filter((item) => item && item.id);
    await applyConditionEffect(state, {
      kind: "condition",
      name: "hiddenEffect",
      shown: true,
      label: effect.label || "Buff",
      duration: effect.duration || "endOfTurn",
      rider: buffRider(effect),
      consume: effect.consume === "duration" ? "manual" : "nextMatchingRoll",
      sourceId: state.sourcePlacement?.id || "",
    }, recipients, ctx);
  }

  // ---------- maliceGain ----------
  //
  // "Gain 1 Malice when a demon dies within 10 squares": the Malice counter goes up and chat says why. The
  // Director can still change the counter by hand.

  async function applyMaliceGainEffect(state, effect) {
    const label = state.action.name || "Ability";
    const amount = effect.amountDice ? rollDiceFormula(effect.amountDice) : asInt(effect.amount, 1);
    if (!amount) return;
    fireActionUsedEvent(state);
    const result = typeof state.context.gainMalice === "function"
      ? await state.context.gainMalice({ amount, abilityName: label })
      : null;
    if (!result || result.skipped) {
      await postChat(state.context, { message: `${state.heroName} - ${label}: the Director ${amount < 0 ? "loses" : "gains"} ${Math.abs(amount)} Malice (${amount < 0 ? "take it off" : "add it"} by hand).` });
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${label}: ${amount < 0 ? "−" : "+"}${Math.abs(amount)} Malice${Number.isFinite(result.current) ? ` (now ${result.current})` : ""}.`,
    });
  }

  // ---------- loseRecoveries ----------

  async function applyLoseRecoveriesEffect(state, effect, targets) {
    const label = state.action.name || "Ability";
    for (const target of targets || []) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const count = Math.max(1, effect.amountDice ? rollDiceFormula(effect.amountDice) : asInt(effect.amount, 1));
      const word = count === 1 ? "Recovery" : "Recoveries";
      if (typeof state.context.spendRecoveryForTarget !== "function") {
        await postChat(state.context, { message: `${state.heroName} - ${label}: ${target.name || "the target"} loses ${count} ${word} (by hand).` });
        continue;
      }
      const result = await state.context.spendRecoveryForTarget({ placementId: target.id, recoveries: count, abilityName: label });
      const name = result?.name || target.name || "The target";
      await postChat(state.context, {
        message: result?.skipped || !result
          ? `${state.heroName} - ${label}: ${name} loses ${count} ${word}; take them off by hand${result?.reason ? ` (${result.reason})` : ""}.`
          : `${state.heroName} - ${label}: ${name} loses ${asInt(result.spent, count)} ${word}${Number.isFinite(result.currentRecoveries) ? ` (${result.currentRecoveries} left)` : ""}.`,
      });
    }
  }

  // ---------- endCondition ----------
  //
  // Ends conditions on each target: "an ally ends one condition on them", "end one save-ends effect". With more
  // than the allowed number to choose from, the user picks.

  function conditionDurationKind(condition) {
    const source = condition?.duration ?? condition?.mode ?? condition?.type ?? "";
    const text = String(typeof source === "string" ? source : source?.type || "").toLowerCase().replace(/[^a-z]/g, "");
    if (text === "saveends" || text === "save") return "saveEnds";
    if (text === "endofturn" || text === "eot") return "endOfTurn";
    if (text === "endofencounter" || text === "encounter") return "endOfEncounter";
    return text || "saveEnds";
  }

  function conditionLabel(condition) {
    const name = String(condition?.name || "condition");
    const kind = conditionDurationKind(condition);
    const words = { saveEnds: "save ends", endOfTurn: "end of turn", endOfEncounter: "end of encounter" };
    return words[kind] ? `${name} (${words[kind]})` : name;
  }

  async function applyEndConditionEffect(state, effect, targets) {
    const label = state.action.name || "Ability";
    for (const target of targets || []) {
      if (state.aborted) return;
      if (!target?.id) continue;
      const token = liveTokenFor(state, target);
      const name = token?.name || target.name || "The target";
      const candidates = tokenConditions(token).filter((condition) => {
        const conditionName = String(condition.name || "").trim().toLowerCase();
        if (!conditionName || conditionName === "hiddeneffect" || conditionName === "dying") return false;
        if (effect.condition && effect.condition.length) {
          const names = [condition.name, condition.text, condition.label].map((value) => String(value || "").trim().toLowerCase());
          if (!effect.condition.some((wanted) => names.includes(wanted))) return false;
        }
        if (effect.duration && effect.duration !== "any" && conditionDurationKind(condition) !== effect.duration) return false;
        return true;
      });
      if (!candidates.length) {
        await postChat(state.context, { message: `${state.heroName} - ${label}: ${name} has nothing to end.` });
        continue;
      }
      const count = Math.max(1, asInt(effect.count, 1));
      let chosen = candidates;
      if (effect.pick !== "all" && candidates.length > count) {
        chosen = [];
        const left = candidates.map((condition, index) => ({ condition, id: `c${index}` }));
        while (chosen.length < count && left.length) {
          const option = await askChoice(state, {
            prompt: `Which effect on ${name} ends?${count > 1 ? ` (${chosen.length + 1} of ${count})` : ""}`,
            options: left.map((entry) => ({ id: entry.id, label: conditionLabel(entry.condition) })),
          });
          if (state.aborted || !option) return;
          const at = left.findIndex((entry) => entry.id === option.id);
          chosen.push(left[at].condition);
          left.splice(at, 1);
        }
      } else if (effect.pick !== "all") {
        chosen = candidates.slice(0, count);
      }
      const ended = [];
      for (const condition of chosen) {
        if (typeof state.context.removeCondition !== "function") break;
        const result = await state.context.removeCondition({ placementId: target.id, condition, abilityName: label });
        if (result?.removed !== false) ended.push(condition);
      }
      if (typeof state.context.removeCondition !== "function") {
        await postChat(state.context, { message: `${state.heroName} - ${label}: end ${chosen.map((c) => c.name).join(", ")} on ${name} by hand.` });
        continue;
      }
      await postChat(state.context, {
        message: ended.length
          ? `${state.heroName} - ${label}: ${chosen.length === ended.length ? "" : "only "}${ended.map((c) => c.name).join(", ")} on ${name} ${ended.length === 1 ? "ends" : "end"}.`
          : `${state.heroName} - ${label}: could not end ${chosen.map((c) => c.name).join(", ")} on ${name}; remove it by hand.`,
      });
    }
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
      targetId = state.context.getMarkedTarget({ markType: "judgment", sourceId: state.sourcePlacement?.id || "" })?.id || "";
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

  function resolveUsageLimitIds(state, limit) {
    const sourceId = state.sourcePlacement?.id || "";
    return {
      sourceId,
      targetId: limit?.target === "self" ? sourceId : sourceId,
    };
  }

  async function checkUsageLimit(state) {
    const limit = state.automation?.usageLimit;
    if (!limit || !limit.key || typeof state.context.checkScopedFlag !== "function") {
      return { allowed: true };
    }
    const ids = resolveUsageLimitIds(state, limit);
    if (!ids.sourceId || !ids.targetId) {
      return { allowed: true };
    }
    const result = await state.context.checkScopedFlag({
      scope: limit.scope || "round",
      key: limit.key,
      sourceId: ids.sourceId,
      targetId: ids.targetId,
    });
    if (result?.set) {
      return {
        allowed: false,
        message: limit.message || `${state.action.name || "Ability"} has already been used this ${limit.scope || "round"}.`,
      };
    }
    return { allowed: true };
  }

  // A refused ability never ran, so what was paid for it goes back: a monster's
  // Malice is taken before the runner opens, a hero's resource just after.
  async function refundRefusedAbility(state) {
    if (typeof state.context.refundAbility !== "function") return;
    await state.context.refundAbility({
      resourceSpend: state.abilityResourceSpend,
      triggeredActionSpend: state.triggeredActionSpend || null,
      action: state.action,
      sourcePlacementId: state.sourcePlacement?.id || "",
      refused: true,
    });
  }

  async function markUsageLimit(state) {
    const limit = state.automation?.usageLimit;
    if (!limit || !limit.key || typeof state.context.setScopedFlag !== "function") {
      return;
    }
    const ids = resolveUsageLimitIds(state, limit);
    if (!ids.sourceId || !ids.targetId) {
      return;
    }
    await state.context.setScopedFlag({
      scope: limit.scope || "round",
      key: limit.key,
      sourceId: ids.sourceId,
      targetId: ids.targetId,
    });
  }

  async function applyAuraEffect(state, effect, targets) {
    const enabled = effect.enabled !== false;
    const radius = Math.min(20, Math.max(1, asInt(effect.radius, 1)));
    const targetMode = effect.target === "target" ? "target" : "self";
    let ids = [];
    if (targetMode === "target") {
      ids = (targets || []).map((t) => t?.id).filter(Boolean);
    } else if (state.sourcePlacement?.id) {
      ids = [state.sourcePlacement.id];
    }
    if (!ids.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — apply manually (no token).`,
      });
      return;
    }
    if (typeof state.context.setAura === "function") {
      const attributeBonuses = {};
      if (typeof state.context.getAttributeBonus === "function") {
        for (const attr of ["Might", "Agility", "Reason", "Intuition", "Presence"]) {
          attributeBonuses[attr] = state.context.getAttributeBonus(attr) || 0;
        }
      }
      const automation = Array.isArray(effect.triggers) && effect.triggers.length && Array.isArray(effect.effects) && effect.effects.length
        ? {
            abilityId: state.action?.id || "",
            abilityName: state.action?.name || "Aura",
            sourceId: state.sourcePlacement?.id || "",
            sourceName: state.heroName || "",
            affects: effect.affects || "creature",
            triggers: effect.triggers,
            effects: effect.effects,
            expires: effect.expires || null,
            attributeBonuses,
          }
        : null;
      for (const id of ids) {
        await state.context.setAura({
          placementId: id,
          enabled,
          radius,
          color: effect.color || "",
          automation,
        });
      }
      const on = targetMode === "target" ? ` on ${(targets || []).map((t) => t?.name).filter(Boolean).join(", ") || "the target"}` : "";
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: aura ${enabled ? `on, ${radius} ${radius === 1 ? "square" : "squares"}` : "off"}${on}.`,
      });
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — apply manually.`,
    });
  }

  // A spend decided before the roll (timing "preRoll") is known by what it is, so the same spend written into each
  // tier is asked about once.
  function spendSignature(effect) {
    return JSON.stringify([effect.resource || "", effect.amount || 1, effect.maxAmount || 0, effect.prompt || "", effect.effects || []]);
  }

  // Before an ability's dice are rolled: every preRoll spend in it not yet decided is asked about now.
  async function offerPreRollSpends(state) {
    const spends = [];
    walkAutomationEffects(state.automation, (effect) => {
      if (effect?.kind === "spend" && effect.timing === "preRoll") spends.push(effect);
    });
    if (!spends.length) return;
    if (!state.preRollSpends) state.preRollSpends = new Map();
    for (const effect of spends) {
      if (state.aborted) return;
      const key = spendSignature(effect);
      if (state.preRollSpends.has(key)) continue;
      const decision = await askSpend(state, effect, " (before the roll)");
      state.preRollSpends.set(key, decision);
    }
  }

  async function applySpendEffect(state, effect, targets, ctx) {
    // Decided before the roll: its effects run now if it was spent, nothing if not, with no second question.
    const decided = effect.timing === "preRoll" ? state.preRollSpends?.get(spendSignature(effect)) : null;
    const outcome = decided || await askSpend(state, effect, "");
    if (!outcome?.spent) return;
    await applyEffects(state, effect.effects || [], effect.target || null, ctx);
  }

  // Asks for a spend and takes it: { spent, resource } when spent, { spent: 0 } when declined or not possible.
  async function askSpend(state, effect, when) {
    const cost = `${effect.amount || 1} ${effect.resource || "resource"}`;
    const inner = (effect.effects || []).map(P.describeEffect).filter(Boolean).join("; ");
    const spendResult = typeof state.context.spendHeroicResource === "function"
      ? await state.context.spendHeroicResource({
        amount: effect.amount || 1,
        maxAmount: effect.maxAmount || 0,
        resource: effect.resource || "",
        abilityName: state.action.name || "Ability",
        prompt: effect.prompt || `Spend ${cost} for ${state.action.name || "this ability"}?\n${inner || "(no listed effect)"}`,
      })
      : null;
    if (spendResult?.skipped) {
      if (spendResult.reason !== "insufficient") {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — apply manually.`,
        });
      }
      return { spent: 0 };
    }
    if (spendResult?.canceled) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: declined to spend ${cost}${when}.`,
      });
      return { spent: 0 };
    }
    if (!spendResult) {
      const question = `Spend ${cost} for ${state.action.name || "this ability"}?\n${inner || "(no listed effect)"}`;
      const proceed = global.UIKit
        ? await global.UIKit.confirm({
          title: "Spend Resource",
          message: question,
          confirmText: "Spend",
        })
        : global.confirm(question);
      if (!proceed) {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: declined to spend ${cost}${when}.`,
        });
        return { spent: 0 };
      }
    }
    const spent = spendResult?.spent || effect.amount || 1;
    if (spent > 0) fireActionUsedEvent(state);
    const resource = spendResult?.resource || effect.resource || "resource";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: spent ${spent} ${resource}${when}.`,
    });
    return { spent, resource };
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

  async function applySurgeGainEffect(state, effect, targets, _ctx) {
    const amount = asInt(effect.amount, 0);
    if (!amount) return;
    if (!targets.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} (no target).`,
      });
      return;
    }
    if (typeof state.context.applySurgeGain !== "function") {
      await reminderEffect(state, effect, targets, "Surge");
      return;
    }
    const lines = [];
    for (const target of targets) {
      if (!target?.id) continue;
      const result = await state.context.applySurgeGain({
        placementId: target.id,
        amount,
        abilityName: state.action.name || "Ability",
      });
      if (result?.applied !== undefined) {
        if (
          target.id === state.sourcePlacement?.id
          && Number.isFinite(result.current)
          && state.hero
          && typeof state.hero === "object"
        ) {
          state.hero.surges = Math.max(0, asInt(result.current, 0));
        }
        const sign = result.applied >= 0 ? "+" : "";
        lines.push(`${result.name || target.name || "Target"}: ${sign}${result.applied} surge${Math.abs(result.applied) === 1 ? "" : "s"} (now ${result.current}).`);
      } else {
        lines.push(`${target.name || "Target"}: adjust ${amount} surge${Math.abs(amount) === 1 ? "" : "s"} manually.`);
      }
    }
    if (lines.length) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}:\n${lines.join("\n")}`,
      });
    }
  }

  async function applyTeleportEffect(state, effect, targets, _ctx) {
    const effectHasExplicitTarget = effect?.target !== undefined
      && effect?.target !== null
      && effect?.target !== "";
    const actionTargetsSelf = String(state.action?.target || "").trim().toLowerCase() === "self";
    // Trigger resolution commonly makes the triggering attacker the current
    // target group. A self-targeted action must not inherit that attacker for
    // an otherwise-unscoped teleport (for example, In All This Confusion).
    const teleportTargets = !effectHasExplicitTarget && actionTargetsSelf && state.sourcePlacement?.id
      ? [state.sourcePlacement]
      : targets;
    if (!teleportTargets.length) return;
    let distance = asInt(effect.distance, 0);
    if (effect.spend && typeof state.context.spendHeroicResource === "function") {
      const spendResult = await state.context.spendHeroicResource({
        amount: effect.spend.amount || 1,
        maxAmount: effect.spend.maxAmount || "available",
        resource: effect.spend.resource || "",
        abilityName: state.action.name || "Ability",
        prompt: effect.spend.prompt || `Spend ${effect.spend.resource || "resource"} to teleport farther?`,
      });
      if (spendResult?.spent) {
        distance += spendResult.spent * (effect.spend.perAmount || 1);
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: spent ${spendResult.spent} ${spendResult.resource || effect.spend.resource || "resource"} to increase teleport to ${distance}.`,
        });
      }
    }
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
    for (const target of teleportTargets) {
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

  async function applyAbilityTestEffect(state, effect, _targets, _ctx) {
    const testAction = {
      ...state.action,
      name: effect.label || "Test",
      description: effect.text || state.action.description || "",
      range: "",
      cost: "",
    };
    const testState = {
      ...state,
      action: testAction,
      selectedTier: null,
      baseTier: null,
      edgeCount: 0,
      baneCount: 0,
      manualBonus: 0,
      rollSuggestions: [],
      roll: null,
      resultText: "",
    };
    const block = {
      type: "powerRoll",
      attribute: effect.attribute || "Strongest",
      skill: effect.skill || effect.label || "",
      bonus: asInt(effect.bonus, 0),
      rollFormula: effect.rollFormula || "2d10",
      rollEvent: "abilityTest",
      target: "self",
      tiers: {
        tier1: { effects: [] },
        tier2: { effects: [] },
        tier3: { effects: [] },
      },
    };
    await runPowerRollBlock(testState, block);
    if (testState.aborted) state.aborted = true;
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
    if (effect.asPowerRoll) {
      await applyFreeStrikePowerRollEffect(state, effect);
      return;
    }
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

  async function applyFreeStrikePowerRollEffect(state, effect) {
    if (typeof state.context.selectTarget !== "function") {
      await reminderEffect(state, effect, [state.sourcePlacement].filter(Boolean), "Free Strike");
      return;
    }
    const groupName = `freeStrikeTarget_${Date.now().toString(36)}`;
    const promptConfig = {
      mode: "token",
      predicate: effect.against || "creature",
      creature: effect.against || "creature",
      affects: effect.against || "creature",
      showPrompt: true,
      promptTitle: "Free Strike",
      promptText: effect.text || "Choose a target for your free strike.",
      count: { value: 1, mode: "exact" },
      distance: { form: "melee", value: 1 },
      pickIndex: 1,
      pickTotal: 1,
      allowDone: false,
      suggestedTargetId: state.triggerPayload?.sourceId || state.suggestedTargetId || "",
      sourcePlacement: state.sourcePlacement || null,
    };
    const result = await state.context.selectTarget(promptConfig);
    if (result?.canceled) {
      state.context.cancelTargetSelection?.();
      state.aborted = true;
      return;
    }
    if (result?.skipped || result?.done || !result?.id) {
      state.context.cancelTargetSelection?.();
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: free strike skipped.`,
      });
      return;
    }
    setTargetGroup(state, groupName, [result]);
    const block = {
      type: "powerRoll",
      id: "free-strike-power-roll",
      attribute: ["Might", "Agility"],
      target: groupName,
      tiers: {
        tier1: { effects: [{ kind: "damage", amount: 2, attribute: ["Might", "Agility"], damageType: "" }] },
        tier2: { effects: [{ kind: "damage", amount: 5, attribute: ["Might", "Agility"], damageType: "" }] },
        tier3: { effects: [{ kind: "damage", amount: 7, attribute: ["Might", "Agility"], damageType: "" }] },
      },
    };
    const previousAction = state.action;
    state.action = {
      ...previousAction,
      name: "Free Strike",
      description: effect.text || previousAction?.description || "",
      cost: "",
      actionLabel: "Free Strike",
    };
    await runPowerRollBlock(state, block);
    state.action = previousAction;
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

  // ---------- distance helpers (Layer 2) ----------

  // Resolve a distance endpoint keyword to a placement id.
  // Keywords: "self" (caster), "source"/"eventSource" (trigger payload source),
  // "eventTarget" (trigger payload target), "target" (current target group),
  // or any other string treated as a named target group.
  function resolveDistanceEndpointId(state, which, groupName) {
    const payload = state.triggerPayload?.payload || state.triggerPayload || {};
    const key = String(which == null ? "self" : which).toLowerCase();
    if (key === "self") return state.sourcePlacement?.id || "";
    if (key === "source" || key === "eventsource") return payload.sourceId || "";
    if (key === "eventtarget") return payload.targetId || payload.placementId || "";
    const resolvedGroup = groupName || (key === "target" ? (state.currentGroup || "primary") : which);
    const targets = getTargetGroup(state, resolvedGroup);
    return (targets || []).find((t) => t && t.id)?.id || "";
  }

  // Returns the square distance between the two resolved endpoints, or null when
  // it cannot be determined (missing host callback, missing placement, etc.).
  async function measureDistanceBetween(state, spec) {
    if (typeof state.context.getDistanceBetween !== "function") return null;
    const fromId = resolveDistanceEndpointId(state, spec.from || "self", spec.fromGroup);
    const toId = resolveDistanceEndpointId(state, spec.to || "target", spec.toGroup);
    if (!fromId || !toId) return null;
    const result = await state.context.getDistanceBetween(fromId, toId);
    const squares = Number(result);
    return Number.isFinite(squares) ? squares : null;
  }

  function distanceWithinBand(squares, spec) {
    if (squares == null) return false;
    if (spec.max != null && squares > Number(spec.max)) return false;
    if (spec.min != null && squares < Number(spec.min)) return false;
    return true;
  }

  // ---------- branch block ----------

  async function evaluateBranchCondition(state, condition) {
    const c = condition && typeof condition === "object" ? condition : { kind: "prompt" };
    switch (c.kind) {
      case "strained":
        return isCasterStrained(state);
      case "winded":
        return isActorWinded(state);
      case "keyword":
        return P.keywordsMatch
          ? P.keywordsMatch(getAbilityKeywords(state), { all: c.all, any: c.any, none: c.none })
          : true;
      case "prompt": {
        const targets = getTargetGroup(state, c.target || state.currentGroup || "primary");
        const answer = await askAutomationPrompt(state, {
          question: c.question || "Use the first branch?",
          yesLabel: c.yesLabel || "Yes",
          noLabel: c.noLabel || "No",
        }, targets);
        if (!state.aborted) {
          await postChat(state.context, {
            message: `${state.heroName} - ${state.action.name || "Ability"}: ${formatPromptQuestion(c, targets)} ${answer ? c.yesLabel || "Yes" : c.noLabel || "No"}.`,
          });
        }
        return answer;
      }
      case "mark": {
        if (typeof state.context.checkMark !== "function") return false;
        const checkTargets = c.target ? getTargetGroup(state, c.target) : getTargetGroup(state, state.currentGroup || "primary");
        for (const target of checkTargets || []) {
          if (!target?.id) continue;
          const result = await state.context.checkMark({
            predicate: c.predicate || "targetJudgedBySelf",
            markType: c.markType || "judgment",
            sourceId: state.sourcePlacement?.id || "",
            targetId: target.id,
            triggerPayload: state.triggerPayload || null,
          });
          if (result?.matched) return true;
        }
        return false;
      }
      case "scopedFlag": {
        if (typeof state.context.checkScopedFlag !== "function") return false;
        const targets = getTargetGroup(state, c.target || state.currentGroup || "primary");
        const ids = resolveScopedFlagIds(state, c, targets);
        const result = await state.context.checkScopedFlag({
          scope: c.scope || "round",
          key: c.key || "",
          sourceId: ids.sourceId,
          targetId: ids.targetId,
        });
        const isSet = Boolean(result?.set);
        return c.mode === "set" ? isSet : !isSet;
      }
      case "distance": {
        const squares = await measureDistanceBetween(state, c);
        if (squares == null) return false;
        return distanceWithinBand(squares, c);
      }
      case "target": {
        const targets = getTargetGroup(state, c.target || state.currentGroup || "primary");
        const result = await resolveTargetTest(state, c, targets);
        if (!state.aborted && !result.nobody) await postChat(state.context, { message: targetTestChatLine(state, c, result) });
        return result.passed.length > 0;
      }
      case "roll":
        return rollTestPasses(state, c);
      case "counter": {
        if (c.who === "target") {
          const subjects = getTargetGroup(state, c.target || state.currentGroup || "primary");
          return subjects.some((subject) => counterInBand(counterValueOf(state, subject, c.name), c));
        }
        return counterInBand(counterValueOf(state, state.sourcePlacement, c.name), c);
      }
      case "zone": {
        const targets = getTargetGroup(state, c.target || state.currentGroup || "primary");
        const result = await resolveZoneCondition(state, c, targets);
        if (!state.aborted && !result.nobody) await postChat(state.context, { message: zoneChatLine(state, c, result) });
        return result.inside.length > 0;
      }
      default:
        return false;
    }
  }

  async function runBranchBlock(state, block) {
    const matched = await evaluateBranchCondition(state, block.condition);
    if (state.aborted) return;
    const branch = matched ? block.then : block.else;
    if (!Array.isArray(branch) || !branch.length) return;
    if (block.note) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: ${block.note}`,
      });
    }
    for (let index = 0; index < branch.length; index += 1) {
      if (state.aborted) break;
      await runBlockAt(state, branch, index);
    }
  }

  // ---------- choice block ----------

  function getSelectedChoice(state, block) {
    return state.choices?.[block.name || block.id || "choice"] || null;
  }

  function setSelectedChoice(state, block, option) {
    if (!state.choices) state.choices = {};
    const key = block.name || block.id || "choice";
    state.choices[key] = option?.id || "";
    if (Array.isArray(option?.keywords) && option.keywords.length) {
      state.executionKeywords = option.keywords;
    }
  }

  async function askChoice(state, block) {
    const options = Array.isArray(block.options) ? block.options : [];
    if (!options.length) return null;
    if (options.length === 1) return options[0];
    const host = makeHost("Choose", state.action.name || "Ability Automation", "choice", state.context?.automationAnchor || null);
    host.querySelector("[data-power-roll-body]").innerHTML = `
      <section class="power-roll-runner__section power-roll-runner__section--compact">
        <div class="power-roll-runner__ability">
          <h3>${escapeHtml(state.action.name || "Unnamed Ability")}</h3>
          <p>${escapeHtml(block.prompt || "Choose one option.")}</p>
        </div>
        <div class="power-roll-runner__actions">
          ${options.map((option) => `
            <button type="button" class="dice-btn dice-btn-primary" data-choice-option="${escapeHtml(option.id)}">
              ${escapeHtml(option.label || option.id)}
              ${option.description ? `<span class="muted">${escapeHtml(option.description)}</span>` : ""}
            </button>
          `).join("")}
        </div>
      </section>
    `;
    return new Promise((resolve) => {
      const finish = (option) => {
        host.removeEventListener("click", onClick);
        host.removeEventListener("automation-cancel", onCancel);
        closeRunner();
        resolve(option);
      };
      const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const id = target?.closest("[data-choice-option]")?.getAttribute("data-choice-option");
        if (!id) return;
        finish(options.find((option) => option.id === id) || null);
      };
      const onCancel = () => {
        state.aborted = true;
        finish(null);
      };
      host.addEventListener("click", onClick);
      host.addEventListener("automation-cancel", onCancel);
    });
  }

  async function preflightChoiceBlock(state, block) {
    if (getSelectedChoice(state, block)) return;
    const option = await askChoice(state, block);
    if (state.aborted || !option) return;
    setSelectedChoice(state, block, option);
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: chose ${option.label || option.id}.`,
    });
  }

  async function runChoiceBlock(state, block) {
    let selectedId = getSelectedChoice(state, block);
    if (!selectedId) {
      await preflightChoiceBlock(state, block);
      selectedId = getSelectedChoice(state, block);
    }
    if (state.aborted || !selectedId) return;
    const option = (block.options || []).find((item) => item.id === selectedId);
    if (!option) return;
    setSelectedChoice(state, block, option);
    for (let index = 0; index < (option.cards || []).length; index += 1) {
      if (state.aborted) break;
      await runBlockAt(state, option.cards, index);
    }
  }

  function getTriggerPayloadEventType(state) {
    const payload = state.triggerPayload || null;
    if (!payload || typeof payload !== "object") return "";
    return String(payload.eventType || payload.event || payload.payload?.eventType || payload.payload?.event || "").trim();
  }

  function findReadyTriggerBlock(blocks, state) {
    const structured = (blocks || []).filter((block) => block?.type === "trigger" && block.match);
    if (!structured.length) return { block: null, index: -1 };
    const eventType = getTriggerPayloadEventType(state).toLowerCase();
    const matched = eventType
      ? structured.find((block) => String(block.match?.event || "").toLowerCase() === eventType)
      : null;
    const block = matched || structured[0];
    return { block, index: (blocks || []).indexOf(block) };
  }

  async function runReadyTriggerResolution(state, blocks) {
    const { block, index } = findReadyTriggerBlock(blocks, state);
    if (!block) return false;
    if (Array.isArray(block.effects) && block.effects.length) {
      await applyEffects(state, block.effects, block.effectTarget || block.resolveTarget || "eventActor", {
        sourceLabel: `${state.action.name || "Ability"} trigger`,
      });
    }
    for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
      if (state.aborted) break;
      const next = blocks[cursor];
      if (next?.type === "trigger") continue;
      await runBlockAt(state, blocks, cursor);
    }
    return true;
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
      case "requestedTest":
        return runRequestedTestBlock(state, effective);
      case "effect":
        return runEffectBlock(state, effective);
      case "trigger":
        return runTriggerBlock(state, effective);
      case "persistent":
        return runPersistentBlock(state, effective);
      case "branch":
        return runBranchBlock(state, effective);
      case "choice":
        return runChoiceBlock(state, effective);
      default:
        return null;
    }
  }

  // Single source of truth for ability keywords. Priority:
  //   1. automation.keywords (LLM-authored JSON) — most specific
  //   2. action.keywords (character sheet)
  //   3. action.tags (legacy field name)
  function getAbilityKeywords(state) {
    if (Array.isArray(state?.executionKeywords) && state.executionKeywords.length) {
      return state.executionKeywords;
    }
    const auto = state?.automation;
    if (auto && Array.isArray(auto.keywords) && auto.keywords.length) return auto.keywords;
    const action = state?.action;
    if (action && Array.isArray(action.keywords) && action.keywords.length) return action.keywords;
    if (action && Array.isArray(action.tags) && action.tags.length) return action.tags;
    return [];
  }

  async function runBlockAt(state, blocks, index) {
    const block = blocks[index];
    if (block?.type === "target") {
      const inferred = inferTargetPrompt(block, blocks, index);
      return runBlock(state, withTargetPromptDefaults(block, inferred));
    }
    return runBlock(state, block);
  }

  function isNonFreeTriggeredAction(action) {
    const label = String(action?.actionLabel || action?.type || action?.kind || "").toLowerCase();
    return label.includes("triggered") && !label.includes("free");
  }

  function getActionKind(state) {
    const text = String(
      state.action?.actionKind ||
        state.action?.kind ||
        state.action?.type ||
        state.context?.actionType ||
        "main"
    ).toLowerCase();
    if (text === "mains" || text.includes("main")) return "main";
    if (text === "maneuvers" || text.includes("maneuver")) return "maneuver";
    if (text.includes("trigger")) return "triggered";
    return text || "main";
  }

  // ---------- feature modifier application (pre-roll) ----------

  // Collect every modifier from every feature on the source character that
  // matches THIS ability's keywords/damage/attribute. Returns an array of
  // matching `apply` blocks (already extracted from features).
  function collectMatchingModifiers(automation, action, features, state = null) {
    if (!Array.isArray(features) || !features.length) return [];
    const keywords = state
      ? getAbilityKeywords(state)
      : Array.isArray(automation?.keywords) && automation.keywords.length
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
          matched.push({ apply: mod.apply || {}, reach: mod.match?.reach || "", source: feature.title || feature.name || "Feature", label: mod.label || "" });
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
    let found = "";
    walkAutomationBlocks(automation, (block) => {
      if (block?.type === "powerRoll" && block.attribute) return block.attribute;
      return "";
    }, (attribute) => {
      if (!found && attribute) found = attribute;
    });
    return found;
  }

  function walkAutomationBlocks(automation, visit, onReturn) {
    const blocks = automation?.cards || [];
    walkBlockList(blocks, visit, onReturn);
  }

  function walkBlockList(blocks, visit, onReturn) {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const result = visit(block);
      if (result !== undefined && result !== "") onReturn?.(result);
      if (block.type === "branch") {
        walkBlockList(block.then || [], visit, onReturn);
        walkBlockList(block.else || [], visit, onReturn);
      } else if (block.type === "choice") {
        (block.options || []).forEach((option) => walkBlockList(option.cards || [], visit, onReturn));
      }
    }
  }

  function walkAutomationEffects(automation, visit) {
    walkAutomationBlocks(automation, (block) => {
      walkBlockEffects(block, visit);
    });
  }

  function fireActionUsedEvent(state, force = false) {
    if (state.actionUsedFired || (state.deferActionUsed && !force)) return;
    if (typeof state.context.fireTriggerEvent !== "function") return;
    // Reserve once before dispatch: an uncertain/partial execution is never replayed.
    state.actionUsedFired = true;
    state.context.fireTriggerEvent({
      eventType: "actionUsed",
      payload: {
        actorId: state.sourcePlacement?.id || "",
        actionId: state.action?.id || "",
        actionName: state.action?.name || "Ability",
        actionKind: getActionKind(state),
        cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
        keywords: getAbilityKeywords(state),
      },
    });
  }

  async function clearUsageLimit(state) {
    const limit = state.automation?.usageLimit;
    if (!limit || !limit.key || typeof state.context.clearScopedFlag !== "function") return;
    const ids = resolveUsageLimitIds(state, limit);
    if (!ids.sourceId || !ids.targetId) return;
    await state.context.clearScopedFlag({
      scope: limit.scope || "round",
      key: limit.key,
      sourceId: ids.sourceId,
      targetId: ids.targetId,
    });
  }

  async function preflightDamageTypeChoices(state) {
    const groups = new Map();
    const collectEffects = (effects, path) => {
      if (!Array.isArray(effects)) return;
      effects.forEach((effect, index) => {
        if (!effect || typeof effect !== "object") return;
        const effectPath = `${path}.${index}`;
        collectEffect(effect, effectPath);
        for (const nested of ["then", "else", "effects", "onFail", "onResist"]) {
          if (Array.isArray(effect[nested])) collectEffects(effect[nested], `${effectPath}.${nested}`);
        }
      });
    };
    const collectEffect = (effect, path) => {
      if (effect?.kind !== "damage" || !Array.isArray(effect.damageTypeOptions)) return;
      const options = [...new Set(effect.damageTypeOptions
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean))];
      if (options.length < 2) return;
      const key = `${path}|${[...options].sort().join("|")}`;
      if (!groups.has(key)) groups.set(key, { options, effects: [] });
      groups.get(key).effects.push(effect);
    };
    const collectBlocks = (blocks, path = "cards") => {
      if (!Array.isArray(blocks)) return;
      blocks.forEach((block, index) => {
        if (!block || typeof block !== "object") return;
        const blockPath = `${path}.${index}`;
        if (block.type === "powerRoll" && block.tiers) {
          // The same effect position in each outcome tier is one authored
          // effect family, so it gets one choice before the roll.
          for (const tier of P.TIER_KEYS) {
            collectEffects(block.tiers[tier]?.effects, `${blockPath}.tiers.*.effects`);
          }
        } else {
          collectEffects(block.effects, `${blockPath}.effects`);
        }
        if (block.type === "branch") {
          collectBlocks(block.then, `${blockPath}.then`);
          collectBlocks(block.else, `${blockPath}.else`);
        } else if (block.type === "choice") {
          (block.options || []).forEach((option, optionIndex) => {
            collectBlocks(option?.cards, `${blockPath}.options.${optionIndex}.cards`);
          });
        }
      });
    };
    collectBlocks(state.automation?.cards);
    for (const group of groups.values()) {
      const choice = typeof state.context.chooseDamageType === "function"
        ? await state.context.chooseDamageType({
          abilityName: state.action.name || "Ability",
          actionId: state.action?.id || "",
          options: group.options,
        })
        : null;
      const selected = String(choice?.damageType ?? choice ?? "").trim().toLowerCase();
      if (!group.options.includes(selected)) {
        state.aborted = true;
        return false;
      }
      for (const effect of group.effects) {
        effect.damageType = selected;
        // This is an execution-only normalized clone. Narrowing the options
        // prevents a second prompt when the chosen tier/effect is resolved.
        effect.damageTypeOptions = [selected];
      }
    }
    return true;
  }

  async function applyPowerRollEdgeCostDiscount(state) {
    if (state.edgeCostDiscountHandled) return;
    state.edgeCostDiscountHandled = true;
    const enabled = Boolean(state.hero?.resource?.discountOnPowerRollEdge);
    const spent = Math.max(0, asInt(state.abilityResourceSpend?.spent, 0));
    if (!enabled || !state.acceptedPowerRollWithEdge || spent < 1) return;
    const resource = state.abilityResourceSpend?.resource
      || state.hero?.resource?.title
      || "";
    if (typeof state.context.applyResourceGain !== "function") {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: edge reduces the cost by 1 ${resource || "resource"}; refund it manually.`,
      });
      return;
    }
    const result = await state.context.applyResourceGain({
      amount: 1,
      resource,
      abilityName: state.action.name || "Ability",
      reason: "powerRollEdgeCostDiscount",
    });
    if (result?.skipped) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: edge cost discount could not update ${resource || "the resource"} automatically; refund 1 manually.`,
      });
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: edge reduces the cost by 1 ${result?.resource || resource || "resource"} (${result?.current ?? "refunded"}).`,
    });
  }

  function walkBlockEffects(block, visit) {
    if (!block || typeof block !== "object") return;
    if ((block.type === "powerRoll" || block.type === "requestedTest") && block.tiers) {
      for (const key of P.TIER_KEYS) {
        const effects = block.tiers[key]?.effects || [];
        walkEffectList(effects, visit);
        // The tiers used while the actor is winded.
        walkEffectList(block.whenWinded?.tiers?.[key]?.effects || [], visit);
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
      if (effect.kind === "potency" && Array.isArray(effect.onResist)) walkEffectList(effect.onResist, visit);
      if (effect.kind === "spend" && Array.isArray(effect.effects)) walkEffectList(effect.effects, visit);
      if (effect.kind === "ifKeyword") {
        walkEffectList(effect.then || [], visit);
        walkEffectList(effect.else || [], visit);
      }
      if (effect.kind === "ifPrompt") {
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
      if (effect.kind === "ifDistance" || effect.kind === "ifZone" || effect.kind === "ifStrained" || effect.kind === "ifTarget" || effect.kind === "ifRoll" || effect.kind === "ifCounter") {
        walkEffectList(effect.then || [], visit);
        walkEffectList(effect.else || [], visit);
      }
      if (effect.kind === "aura" && Array.isArray(effect.effects)) walkEffectList(effect.effects, visit);
      if (effect.kind === "move" && Array.isArray(effect.then)) walkEffectList(effect.then, visit);
    }
  }

  // Mutate the (pre-cloned) automation by applying each matched modifier's
  // bonus fields. Runs ONCE at the start of open() so all UI rendering and
  // damage calculations see the post-modifier values.
  function applyModifiersInPlace(automation, matchedModifiers, state) {
    if (!matchedModifiers.length) return;
    // Melee- or ranged-only modifiers: their damage bonus waits on each damage effect (reachBonuses) to be judged per
    // target when it lands; their distance bonus goes to the matching distance only.
    const reachModifiers = matchedModifiers.filter((m) => m.reach === "melee" || m.reach === "ranged");
    const totals = matchedModifiers.filter((m) => !reachModifiers.includes(m)).reduce((acc, m) => {
      const a = m.apply || {};
      acc.damageBonus += Number.parseInt(a.damageBonus, 10) || 0;
      acc.rangeBonus += Number.parseInt(a.rangeBonus, 10) || 0;
      acc.forcedMovementBonus += Number.parseInt(a.forcedMovementBonus, 10) || 0;
      if (a.damageType) acc.damageTypeOverride = String(a.damageType).trim().toLowerCase();
      return acc;
    }, { damageBonus: 0, rangeBonus: 0, forcedMovementBonus: 0, damageTypeOverride: "" });

    for (const modifier of reachModifiers) {
      const bonus = Number.parseInt(modifier.apply?.rangeBonus, 10) || 0;
      if (!bonus) continue;
      walkAutomationBlocks(automation, (block) => {
        const distance = block?.type === "target" ? block.distance : null;
        if (!distance) return;
        if (modifier.reach === "melee" && (distance.form === "melee" || distance.form === "meleeOrRanged") && Number.isFinite(distance.value)) {
          distance.value = Math.max(0, distance.value + bonus);
        }
        if (modifier.reach === "ranged" && distance.form === "ranged" && Number.isFinite(distance.value)) {
          distance.value = Math.max(0, distance.value + bonus);
        }
        if (modifier.reach === "ranged" && distance.form === "meleeOrRanged" && Number.isFinite(distance.secondary)) {
          distance.secondary = Math.max(0, distance.secondary + bonus);
        }
      });
    }
    // Add range bonus to every target block's distance.value.
    if (totals.rangeBonus) {
      walkAutomationBlocks(automation, (block) => {
        if (block?.type === "target" && block.distance && Number.isFinite(block.distance.value)) {
          block.distance.value = Math.max(0, block.distance.value + totals.rangeBonus);
        }
      });
    }

    // Add damage / forced-movement bonuses to every relevant effect. The
    // `rolled` flag tracks whether the effect lives inside a powerRoll block,
    // because a damage *bonus* only buffs ROLLED damage — flat or triggered
    // damage (reflected damage, self-backlash, amountFrom riders) is not a
    // "damage roll", so a "+N to rolled damage" augmentation must skip it.
    walkAutomationBlocks(automation, (block) => {
      const rolled = block?.type === "powerRoll";
      walkBlockEffects(block, (effect) => {
        if (effect.kind === "damage") {
          // `raw` damage opts out of feature modifiers entirely (no damage
          // bonus, no damage-type override).
          if (effect.raw) return;
          if (totals.damageBonus && rolled) {
            effect.amount = (Number.parseInt(effect.amount, 10) || 0) + totals.damageBonus;
          }
          if (rolled) {
            for (const modifier of reachModifiers) {
              const amount = Number.parseInt(modifier.apply?.damageBonus, 10) || 0;
              if (amount) (effect.reachBonuses ||= []).push({ reach: modifier.reach, amount, source: modifier.source });
            }
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
    });

    // Stash a summary on state for the inspector / chat to reference.
    state.appliedModifiers = matchedModifiers;
  }

  async function open(options) {
    const automation = schema.normalizeAutomation(options?.automation);
    // Feature modifiers are applied after leading choices so execution-scoped
    // keywords (for melee/ranged mode, etc.) can control modifier matching.
    const features = Array.isArray(options?.features) ? options.features : [];
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
      choices: {},
      executionKeywords: null,
      shiftPools: {},
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
      abilityResourceSpend: null,
      triggeredActionSpend: null,
      acceptedPowerRollWithEdge: false,
      edgeCostDiscountHandled: false,
    };

    try {
      const blocks = automation.cards || [];
      if (!blocks.length) {
        await postChat(state.context, {
          message: `${state.action.name || "Ability"} has no automation configured.`,
        });
        return;
      }

      const structuredTriggerBlocks = blocks.filter((block) => block?.type === "trigger" && block.match);
      const isResolvingReadyTrigger = Boolean(state.triggerPayload);
      const isManualTriggerResolution = Boolean(options?.manualTriggerResolution);
      const actionType = String(state.context?.actionType || state.action?.actionType || state.action?.kind || state.action?.type || "").toLowerCase();
      const triggerOnlyAction = actionType.includes("trigger") || isNonFreeTriggeredAction(state.action);
      const isArmingOnly = triggerOnlyAction && structuredTriggerBlocks.length > 0 && !isResolvingReadyTrigger && !isManualTriggerResolution;
      const defersActionUsed = blocks.some((block) => block?.type === "requestedTest");
      state.deferActionUsed = defersActionUsed;

      if (!isArmingOnly) {
        for (const block of blocks) {
          if (block?.type !== "choice") break;
          await preflightChoiceBlock(state, block);
          if (state.aborted) return;
        }
        if (!await preflightDamageTypeChoices(state)) {
          closeRunner();
          return;
        }
      }

      const matchedModifiers = collectMatchingModifiers(automation, options?.action, features, state);
      if (matchedModifiers.length) {
        applyModifiersInPlace(automation, matchedModifiers, state);
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: applied ${matchedModifiers.length} feature modifier${matchedModifiers.length === 1 ? "" : "s"} (${matchedModifiers.map((m) => m.source).join(", ")}).`,
        });
      }

      if (!isArmingOnly) {
        const usageLimit = await checkUsageLimit(state);
        if (!usageLimit.allowed) {
          await postChat(state.context, {
            message: `${state.heroName} - ${state.action.name || "Ability"}: ${usageLimit.message}`,
          });
          await refundRefusedAbility(state);
          closeRunner();
          return;
        }
        const startTurnPreflight = await preflightStartTurnEffects(state, blocks);
        if (!startTurnPreflight) {
          closeRunner();
          return;
        }
      }

      if (!isArmingOnly && typeof state.context.spendResource === "function") {
        const spendResult = await state.context.spendResource(state.action);
        if (spendResult?.canceled) {
          closeRunner();
          return;
        }
        state.abilityResourceSpend = spendResult || null;
        if (Number(spendResult?.spent) > 0) fireActionUsedEvent(state);
      }

      if (isArmingOnly) {
        for (const block of structuredTriggerBlocks) {
          if (state.aborted) break;
          await runBlock(state, block);
        }
        return;
      }

      if ((isResolvingReadyTrigger || isManualTriggerResolution) && isNonFreeTriggeredAction(state.action) && typeof state.context.consumeTriggeredAction === "function") {
        const consumeResult = await state.context.consumeTriggeredAction({
          placementId: state.sourcePlacement?.id || "",
          abilityName: state.action.name || "Ability",
        });
        if (consumeResult?.blocked) {
          await postChat(state.context, {
            message: `${state.heroName} - ${state.action.name || "Ability"}: triggered action already used this round.`,
          });
          await refundRefusedAbility(state);
          return;
        }
        state.triggeredActionSpend = consumeResult || { consumed: true };
      }
      await markUsageLimit(state);
      if ((isResolvingReadyTrigger || isManualTriggerResolution) && structuredTriggerBlocks.length) {
        await runReadyTriggerResolution(state, blocks);
        if (!state.aborted) fireActionUsedEvent(state, defersActionUsed);
        return;
      }
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (state.aborted) break;
        if (isResolvingReadyTrigger && block?.type === "trigger") continue;
        await runBlockAt(state, blocks, index);
      }
      // Manual/narrative effects still represent a successfully used ability.
      // Earlier concrete attempts reserve this once; canceled selection does not.
      if (!state.aborted) fireActionUsedEvent(state, defersActionUsed);
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
    } finally {
      try {
        await applyPowerRollEdgeCostDiscount(state);
      } catch (discountError) {
        console.warn("[AbilityAutomationRunner] edge cost discount failed", discountError);
      }
    }
  }

  global.AbilityAutomationRunner = {
    open,
    close: closeRunner,
    cancelRequestedTestRoll() {
      const host = document.getElementById(RUNNER_ID);
      host?.dispatchEvent(new CustomEvent("automation-cancel"));
      closeRunner();
    },
    async rollRequestedTest(options = {}) {
      const profile = options.profile && typeof options.profile === "object" ? options.profile : {};
      const stats = profile.stats && typeof profile.stats === "object" ? profile.stats : {};
      const attribute = String(options.attribute || "Might");
      const target = options.target || { id: options.targetId || "", name: options.targetName || "Creature" };
      const state = {
        action: { name: options.label || `${attribute} test`, skill: "" },
        automation: {},
        context: {
          ...(options.context || {}),
          getAttributeBonus: (name) => asInt(stats[String(name || "").trim().toLowerCase()], 0),
          getSkillBonus: () => 0,
          getStrongestAttribute: () => ({ attribute, bonus: asInt(stats[attribute.toLowerCase()], 0) }),
        },
        hero: { name: profile.name || options.targetName || "Creature", stats, surges: 0 },
        heroName: profile.name || options.targetName || "Creature",
        sourcePlacement: target,
        sourceTraits: {},
        groups: { self: [target] },
        currentGroup: "self",
        choices: {}, executionKeywords: null, shiftPools: {}, areas: {}, currentArea: null,
        selectedTier: null, baseTier: null, edgeCount: 0, baneCount: 0, manualBonus: 0,
        roll: null, resultText: "", aborted: false, appliedModifiers: [], abilityResourceSpend: null,
        acceptedPowerRollWithEdge: false, edgeCostDiscountHandled: true,
      };
      const block = {
        type: "powerRoll",
        target: "self",
        attribute,
        flatBonus: asInt(options.flatBonus, asInt(stats[attribute.toLowerCase()], 0)),
        bonus: asInt(options.bonus, 0),
        edge: asInt(options.edge, 0),
        bane: asInt(options.bane, 0),
        rollFormula: options.rollFormula || "2d10",
        rollEvent: "abilityTest",
        label: options.prompt || options.label || `${attribute} test`,
        tiers: { tier1: { effects: [] }, tier2: { effects: [] }, tier3: { effects: [] } },
      };
      await runPowerRollBlock(state, block);
      if (state.aborted || !state.selectedTier || !state.roll) return { canceled: true };
      const total = getPowerRollTotal(state, block);
      return {
        canceled: false,
        tier: state.selectedTier,
        total: total.total,
        dice: state.roll.rolls,
        rollFormula: state.roll.notation,
        attribute,
        attributeBonus: total.attributeBonus,
        bonus: total.bonus + total.manualBonus,
        edge: total.edgeState.edge,
        bane: total.edgeState.bane,
      };
    },
    async applyRequestedTestContinuation(record, context = {}) {
      const continuation = record?.continuation || {};
      const state = {
        action: continuation.action || { name: record?.abilityName || "Ability" },
        automation: {},
        context,
        hero: continuation.hero || {},
        heroName: continuation.heroName || "",
        sourcePlacement: continuation.sourcePlacement || null,
        sourceTraits: continuation.sourceTraits || {},
        groups: {}, currentGroup: continuation.targetGroup || "primary", choices: {}, executionKeywords: null,
        shiftPools: {}, areas: {}, currentArea: null, aborted: false,
      };
      await applyRequestedTestTier(state, { tiers: continuation.tiers || {} }, {
        ...(record?.result || {}), requestId: record?.id, targetIds: record?.targetIds || [],
      });
      return { applied: true };
    },
    __testing: {
      refreshPowerRollSuggestions,
      setRollSuggestionActive,
      watchPowerRollSuggestions,
      getActiveEdgeControl,
      getEdgeState,
      getManualEdgeBaneCounts,
      getTotalEdgeBaneCounts,
      refreshPowerRollSurges,
      renderPowerRollSurgeControls,
      setManualEdgeBaneSelection,
    },
  };
})(window);
