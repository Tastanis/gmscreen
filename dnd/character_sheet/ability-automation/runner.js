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

  function closeRunner() {
    document.getElementById(RUNNER_ID)?.remove();
  }

  function getRunnerDefaultPosition(modal, variant, anchor = null) {
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
        host.dispatchEvent(new CustomEvent("automation-cancel"));
        closeRunner();
      }
    });
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

  // Resolve an `amountFrom` rider to an integer using the captured trigger
  // payload. `state.triggerPayload` is set when a ready trigger is resolved
  // (see runner.open `options.triggerPayload`); without it (e.g. a normal,
  // non-reactive ability), this contributes 0. The raw captured value is
  // scaled by multiplier × fraction, then rounded — default DOWN, matching the
  // Draw Steel "round down when you halve" convention. The result is added on
  // top of the effect's own amount/attribute/dice by the caller.
  function resolveTriggerValue(state, amountFrom) {
    if (!amountFrom || typeof amountFrom !== "object") return 0;
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
    return state.groups[groupName] || [];
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
      if (effect.kind === "potency" && effectListContainsKind(effect.onFail, kind)) return true;
      if (effect.kind === "spend" && effectListContainsKind(effect.effects, kind)) return true;
      if (effect.kind === "ifKeyword" || effect.kind === "ifPrompt" || effect.kind === "ifMark" || effect.kind === "ifScopedFlag" || effect.kind === "ifDistance") {
        if (effectListContainsKind(effect.then, kind) || effectListContainsKind(effect.else, kind)) return true;
      }
    }
    return false;
  }

  function inferTargetPrompt(block, nextBlocks = [], startIndex = -1) {
    if (!block || block.mode !== "token") return {};
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

  async function runTargetBlock(state, block) {
    const useBoardOnlyPrompt = block.mode === "token" && Boolean(block.promptTitle || block.promptText);
    const host = useBoardOnlyPrompt ? null : showTargetPrompt(state, block);
    const finish = () => host?.remove();

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
          allowDone: upTo,
          // Pre-suggested target (e.g. the mover that triggered an
          // opp-attack). Picker pulses this token red but the player can
          // still click anyone.
          suggestedTargetId: state.suggestedTargetId || "",
          // Source token, used by the board to draw the reach/range box
          // around the caster while the player is picking a target.
          sourcePlacement: state.sourcePlacement || null,
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

    const host = makeHost("Power Roll", state.action.name || "Ability Automation", "power", state.context?.automationAnchor || null);
    renderPowerRoll(host, state, block);
    await new Promise((resolve) => wirePowerRoll(host, state, block, resolve));

    if (state.aborted) return;
    if (!state.selectedTier) return;

    await fireRollTriggerEvent(state, block);

    const tier = block.tiers?.[state.selectedTier] || { effects: [] };
    const targetGroupName = block.target;
    await applyEffects(state, tier.effects || [], targetGroupName, {
      sourceLabel: `${state.action.name || "Ability"} (${P.tierLabel(state.selectedTier)})`,
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
      actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || state.context?.actionType || "main",
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
        const lines = [`${state.heroName} - ${state.action.name || "Ability"} trigger listening:`];
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
      case "setScopedFlag":
        return applySetScopedFlagEffect(state, effect, targets, ctx);
      case "applyMark":
        return applyMarkEffect(state, effect, targets, ctx);
      case "endMark":
        return applyEndMarkEffect(state, effect, targets, ctx);
      case "halveTriggeringDamage":
        return applyHalveTriggeringDamageEffect(state, effect, targets, ctx);
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
    const triggerValue = resolveTriggerValue(state, effect.amountFrom);
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
      const amount = Math.max(0, baseAmount + attributeBonus + diceAmount + markBonus + triggerValue);
      const result =
        typeof state.context.applyDamage === "function"
          ? await state.context.applyDamage({
              placementId: target.id,
              sourceId: state.sourcePlacement?.id || "",
              amount,
              damageType,
              abilityName: state.action.name || "Ability",
              actionId: state.action?.id || "",
              actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || state.context?.actionType || "main",
              cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
              keywords: getAbilityKeywords(state),
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
    const attributeBonus = effect.attribute
      ? resolveAttributeBonusForDamage(state, effect.attribute)
      : 0;
    const triggerValue = resolveTriggerValue(state, effect.amountFrom);
    const flatAmount = Math.max(0, asInt(effect.amount, 0) + attributeBonus + triggerValue);

    if (!recoveries && !flatAmount) return;

    const lines = [];
    for (const target of targets) {
      if (state.aborted) return;
      if (!target?.id) continue;

      // Resolve the actual heal amount for this target. With `recoveries`,
      // the VTT hook spends the target's recovery counter and returns their
      // recovery value. Older hosts can still provide only the read hook, in
      // which case chat reminds the player to decrement recoveries manually.
      let amount = flatAmount;
      let recoveryValueUsed = 0;
      let recoveryUnknown = false;
      let recoverySpent = 0;
      let recoveryManualDecrement = false;
      if (recoveries) {
        const spent = typeof state.context.spendRecoveryForTarget === "function"
          ? await state.context.spendRecoveryForTarget({
              placementId: target.id,
              recoveries,
              abilityName: state.action.name || "Ability",
            })
          : null;
        if (spent?.skipped) {
          lines.push(`${target.name || "Target"}: recovery spend skipped (${spent.reason || "unavailable"}).`);
          if (!flatAmount) continue;
        } else if (Number.isFinite(spent?.recoveryValue) && spent.recoveryValue > 0) {
          recoverySpent = asInt(spent.spent, recoveries);
          recoveryValueUsed = Math.trunc(spent.recoveryValue) * recoverySpent;
          amount = recoveryValueUsed + flatAmount;
        } else {
          const resolved = typeof state.context.getRecoveryValueForTarget === "function"
            ? await state.context.getRecoveryValueForTarget({ placementId: target.id })
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
      const finalRecoveryNote = recoveries && recoveryValueUsed
        ? ` (spent ${recoverySpent || recoveries} recovery -> ${recoveryValueUsed}${flatAmount ? `+${flatAmount}` : ""}${recoveryManualDecrement ? "; decrement recoveries on sheet" : ""})`
        : "";
      lines.push(`${targetName} recovers ${result.change || amount} stamina${overage}${finalRecoveryNote} (${display}).`);
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
        abilityName: state.action.name || "Ability",
      });
      if (!result || result.skipped) {
        lines.push(`${target.name || "Target"}: ${verb} ${distance} skipped.`);
        continue;
      }
      const moved = result.movedDistance ?? distance;
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
          actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || state.context?.actionType || "main",
          cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
          keywords: getAbilityKeywords(state),
        };
        state.context.fireTriggerEvent({ eventType: "forcedMovement", payload: eventPayload });
        state.context.fireTriggerEvent({ eventType: "forcedMovementDealt", payload: eventPayload });
      }
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
            actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || state.context?.actionType || "main",
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
      for (const id of ids) {
        await state.context.setAura({
          placementId: id,
          enabled,
          radius,
          color: effect.color || "",
        });
      }
      return;
    }
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: ${P.describeEffect(effect)} — apply manually.`,
    });
  }

  async function applySpendEffect(state, effect, targets, ctx) {
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
      return;
    }
    if (spendResult?.canceled) {
      await postChat(state.context, {
        message: `${state.heroName} - ${state.action.name || "Ability"}: declined to spend ${cost}.`,
      });
      return;
    }
    if (!spendResult) {
      const proceed = global.confirm(
        `Spend ${cost} for ${state.action.name || "this ability"}?\n${inner || "(no listed effect)"}`
      );
      if (!proceed) {
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: declined to spend ${cost}.`,
        });
        return;
      }
    }
    const spent = spendResult?.spent || effect.amount || 1;
    const resource = spendResult?.resource || effect.resource || "resource";
    await postChat(state.context, {
      message: `${state.heroName} - ${state.action.name || "Ability"}: spent ${spent} ${resource}.`,
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
    if (!targets.length) return;
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
      roll: null,
      resultText: "",
    };
    const block = {
      type: "powerRoll",
      attribute: effect.attribute || "Strongest",
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
      if (effect.kind === "ifDistance") {
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
      const actionType = String(state.context?.actionType || state.action?.actionType || state.action?.kind || state.action?.type || "").toLowerCase();
      const triggerOnlyAction = actionType.includes("trigger") || isNonFreeTriggeredAction(state.action);
      const isArmingOnly = triggerOnlyAction && structuredTriggerBlocks.length > 0 && !isResolvingReadyTrigger;

      if (!isArmingOnly) {
        for (const block of blocks) {
          if (block?.type !== "choice") break;
          await preflightChoiceBlock(state, block);
          if (state.aborted) return;
        }
      }

      const matchedModifiers = collectMatchingModifiers(automation, options?.action, features, state);
      if (matchedModifiers.length) {
        applyModifiersInPlace(automation, matchedModifiers, state);
        await postChat(state.context, {
          message: `${state.heroName} - ${state.action.name || "Ability"}: applied ${matchedModifiers.length} feature modifier${matchedModifiers.length === 1 ? "" : "s"} (${matchedModifiers.map((m) => m.source).join(", ")}).`,
        });
      }

      if (!isArmingOnly && typeof state.context.spendResource === "function") {
        const spendResult = await state.context.spendResource(state.action);
        if (spendResult?.canceled) {
          closeRunner();
          return;
        }
      }

      if (isArmingOnly) {
        for (const block of structuredTriggerBlocks) {
          if (state.aborted) break;
          await runBlock(state, block);
        }
        return;
      }

      if (typeof state.context.fireTriggerEvent === "function") {
        state.context.fireTriggerEvent({
          eventType: "actionUsed",
          payload: {
            actorId: state.sourcePlacement?.id || "",
            actionId: state.action?.id || "",
            actionName: state.action?.name || "Ability",
            actionKind: state.action?.actionKind || state.action?.kind || state.action?.type || state.context?.actionType || "main",
            cost: state.action?.cost || state.action?.resource_cost || state.action?.resourceCost || "",
            keywords: getAbilityKeywords(state),
          },
        });
      }
      if (isResolvingReadyTrigger && isNonFreeTriggeredAction(state.action) && typeof state.context.consumeTriggeredAction === "function") {
        const consumeResult = await state.context.consumeTriggeredAction({
          placementId: state.sourcePlacement?.id || "",
          abilityName: state.action.name || "Ability",
        });
        if (consumeResult?.blocked) {
          await postChat(state.context, {
            message: `${state.heroName} - ${state.action.name || "Ability"}: triggered action already used this round.`,
          });
          return;
        }
      }
      if (isResolvingReadyTrigger && structuredTriggerBlocks.length) {
        await runReadyTriggerResolution(state, blocks);
        return;
      }
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (state.aborted) break;
        if (isResolvingReadyTrigger && block?.type === "trigger") continue;
        await runBlockAt(state, blocks, index);
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
