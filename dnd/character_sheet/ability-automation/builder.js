(function () {
  "use strict";

  const BUILDER_ID = "ability-automation-builder";
  const schema = window.AbilityAutomationSchema;
  const registry = window.AbilityAutomationPrimitives;
  const catalog = window.AbilityAutomationCatalog;
  let activeBuilderPopup = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function closeBuilder() {
    document.getElementById(BUILDER_ID)?.remove();
    if (activeBuilderPopup && !activeBuilderPopup.closed) {
      activeBuilderPopup.close();
    }
    activeBuilderPopup = null;
  }

  function asElement(value) {
    return value && value.nodeType === 1 ? value : null;
  }

  function tierRange(key) {
    return schema.tierRange ? schema.tierRange(key) : key === "low" ? "<= 11" : key === "mid" ? "12-16" : "17+";
  }

  function cardShell(card, title, description, body) {
    return `
      <section class="automation-builder__card" data-automation-card="${escapeHtml(card.id)}" data-card-type="${escapeHtml(card.type)}">
        <header class="automation-builder__card-header">
          <button class="automation-builder__drag-handle" type="button" draggable="true" data-drag-automation-card aria-label="Drag ${escapeHtml(title)} card">::</button>
          <div class="automation-builder__card-heading">
            <h3 class="automation-builder__card-title">${escapeHtml(title)}</h3>
            <p class="automation-builder__card-type">${escapeHtml(description)}</p>
          </div>
          <button class="icon-btn automation-builder__remove" type="button" data-remove-automation-card="${escapeHtml(card.id)}" aria-label="Remove ${escapeHtml(title)} card">X</button>
        </header>
        <div class="automation-builder__card-body">${body}</div>
      </section>
    `;
  }

  function renderTargetCard(card) {
    const data = card.data;
    const body = `
      <div class="automation-builder__grid">
        <label class="automation-builder__field">
          <span>Count</span>
          <select data-card-field="count">
            ${["one", "each", "all"].map((option) => `<option value="${option}" ${data.count === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Target type</span>
          <select data-card-field="creature">
            ${["enemy", "ally", "creature", "object", "creature or object"].map((option) => `<option value="${option}" ${data.creature === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Optional</span>
          <select data-card-field="optional">
            <option value="false" ${data.optional ? "" : "selected"}>Required</option>
            <option value="true" ${data.optional ? "selected" : ""}>No target allowed</option>
          </select>
        </label>
        <label class="automation-builder__field automation-builder__field--wide">
          <span>Range / area note</span>
          <input type="text" data-card-field="within" value="${escapeHtml(data.within)}" placeholder="e.g. within 1, melee 1, each enemy in the area" />
        </label>
      </div>
    `;
    return cardShell(card, "Target", registry.getPrimitive("target").description, body);
  }

  function renderActionSelector(data) {
    return `
      <label class="automation-builder__field automation-builder__field--wide">
        <span>Action type</span>
        <select data-card-field="actionType">
          ${registry.actionTypes.map((actionType) => `<option value="${actionType.type}" ${data.actionType === actionType.type ? "selected" : ""}>${escapeHtml(actionType.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function renderPowerRollFields(data) {
    const tiers = data.tiers || {};
    const tierMarkup = schema.TIER_KEYS.map((key) => {
      const tier = tiers[key] || {};
      const effects = catalog?.getTierEffects ? catalog.getTierEffects(tier) : [];
      const preview = effects.length
        ? `<div class="automation-builder__effect-preview">${effects.map((effect) => escapeHtml(catalog.describeEffect(effect))).join(" | ")}</div>`
        : "";
      return `
        <div class="automation-builder__tier" data-tier="${key}">
          <div class="automation-builder__tier-label">${tierRange(key)}</div>
          <label class="automation-builder__field">
            <span>Damage / result</span>
            <input type="text" data-tier-field="damage" value="${escapeHtml(tier.damage)}" placeholder="e.g. 5 or 5 fire" />
          </label>
          <label class="automation-builder__field">
            <span>Damage type</span>
            <input type="text" data-tier-field="damageType" value="${escapeHtml(tier.damageType)}" placeholder="optional" />
          </label>
          <label class="automation-builder__field automation-builder__field--wide">
            <span>Tier effect</span>
            <input type="text" data-tier-field="effect" value="${escapeHtml(tier.effect)}" placeholder="e.g. push 3, slowed SE, slowed EOT" />
          </label>
          ${preview}
        </div>
      `;
    }).join("");

    return `
      <div class="automation-builder__grid">
        <label class="automation-builder__field">
          <span>Roll</span>
          <input type="text" data-card-field="rollFormula" value="${escapeHtml(data.rollFormula)}" />
        </label>
        <label class="automation-builder__field">
          <span>Attribute</span>
          <select data-card-field="attribute">
            ${registry.ATTRIBUTES.map((attr) => `<option value="${attr}" ${data.attribute === attr ? "selected" : ""}>${attr}</option>`).join("")}
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Bonus</span>
          <input type="text" data-card-field="bonus" value="${escapeHtml(data.bonus)}" placeholder="optional" />
        </label>
      </div>
      <div class="automation-builder__tiers">${tierMarkup}</div>
    `;
  }

  function renderDealDamageFields(data) {
    return `
      <div class="automation-builder__grid">
        <label class="automation-builder__field">
          <span>Damage source</span>
          <select data-card-field="source">
            <option value="selectedPowerRollTier" ${data.source === "selectedPowerRollTier" ? "selected" : ""}>Selected power-roll tier</option>
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Target</span>
          <select data-card-field="target">
            <option value="selectedTarget" ${data.target === "selectedTarget" ? "selected" : ""}>Selected target</option>
          </select>
        </label>
        <label class="automation-builder__field automation-builder__field--wide">
          <span>Result note</span>
          <input type="text" data-card-field="note" value="${escapeHtml(data.note)}" placeholder="optional extra message after damage" />
        </label>
      </div>
    `;
  }

  function renderPushFields(data) {
    return `
      <div class="automation-builder__grid">
        <label class="automation-builder__field">
          <span>Push source</span>
          <select data-card-field="source">
            <option value="selectedPowerRollTier" ${data.source === "selectedPowerRollTier" ? "selected" : ""}>Selected power-roll tier</option>
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Target</span>
          <select data-card-field="target">
            <option value="selectedTarget" ${data.target === "selectedTarget" ? "selected" : ""}>Selected target</option>
          </select>
        </label>
        <label class="automation-builder__field">
          <span>Collision damage type</span>
          <input type="text" data-card-field="collisionDamageType" value="${escapeHtml(data.collisionDamageType)}" placeholder="blank = untyped" />
        </label>
        <label class="automation-builder__field automation-builder__field--wide">
          <span>Result note</span>
          <input type="text" data-card-field="note" value="${escapeHtml(data.note)}" placeholder="optional extra message after push" />
        </label>
      </div>
    `;
  }

  function renderNoteFields(data) {
    return `
      <label class="automation-builder__field automation-builder__field--wide">
        <span>Note</span>
        <textarea rows="3" data-card-field="text" placeholder="Describe a future automation detail.">${escapeHtml(data.text)}</textarea>
      </label>
    `;
  }

  function renderActionCard(card) {
    const data = card.data;
    const actionType = registry.getActionType(data.actionType);
    const fields = data.actionType === "dealStaminaDamage"
      ? renderDealDamageFields(data)
      : data.actionType === "push"
        ? renderPushFields(data)
      : data.actionType === "note"
        ? renderNoteFields(data)
        : renderPowerRollFields(data);
    return cardShell(card, "Action", actionType.description, `${renderActionSelector(data)}${fields}`);
  }

  function renderCard(card) {
    const normalized = schema.normalizeCard ? schema.normalizeCard(card) : card;
    if (normalized.type === "action") return renderActionCard(normalized);
    return renderTargetCard(normalized);
  }

  function readActionCard(cardEl, id) {
    const getField = (field) => cardEl.querySelector(`[data-card-field="${field}"]`);
    const actionType = getField("actionType")?.value || "powerRoll";

    if (actionType === "dealStaminaDamage") {
      return {
        id,
        type: "action",
        data: {
          actionType,
          source: getField("source")?.value || "selectedPowerRollTier",
          target: getField("target")?.value || "selectedTarget",
          note: getField("note")?.value || "",
        },
      };
    }

    if (actionType === "note") {
      return {
        id,
        type: "action",
        data: {
          actionType,
          text: getField("text")?.value || "",
        },
      };
    }

    if (actionType === "push") {
      return {
        id,
        type: "action",
        data: {
          actionType,
          source: getField("source")?.value || "selectedPowerRollTier",
          target: getField("target")?.value || "selectedTarget",
          collisionDamageType: getField("collisionDamageType")?.value || "",
          note: getField("note")?.value || "",
        },
      };
    }

    const tiers = {};
    schema.TIER_KEYS.forEach((key) => {
      const tierEl = cardEl.querySelector(`[data-tier="${key}"]`);
      const getTierField = (field) => tierEl?.querySelector(`[data-tier-field="${field}"]`);
      tiers[key] = {
        range: tierRange(key),
        damage: getTierField("damage")?.value || "",
        damageType: getTierField("damageType")?.value || "",
        effect: getTierField("effect")?.value || "",
      };
      tiers[key].effects = catalog?.getTierEffects ? catalog.getTierEffects(tiers[key]) : [];
    });

    return {
      id,
      type: "action",
      data: {
        actionType: "powerRoll",
        rollFormula: getField("rollFormula")?.value || "2d10",
        attribute: getField("attribute")?.value || "Might",
        bonus: getField("bonus")?.value || "",
        tiers,
      },
    };
  }

  function readAutomation(builder) {
    const cards = Array.from(builder.querySelectorAll("[data-automation-card]")).map((cardEl) => {
      const type = cardEl.getAttribute("data-card-type") || "target";
      const id = cardEl.getAttribute("data-automation-card") || schema.createId("card");
      const getField = (field) => cardEl.querySelector(`[data-card-field="${field}"]`);

      if (type === "action") {
        return readActionCard(cardEl, id);
      }

      return {
        id,
        type: "target",
        data: {
          count: getField("count")?.value || "one",
          creature: getField("creature")?.value || "enemy",
          within: getField("within")?.value || "",
          optional: getField("optional")?.value === "true",
        },
      };
    });

    return schema.normalizeAutomation({ cards });
  }

  function renderSummary(builder) {
    const summaryEl = builder.querySelector("[data-automation-summary]");
    if (!summaryEl) return;
    const automation = readAutomation(builder);
    summaryEl.innerHTML = automation.cards.length
      ? `<ol>${automation.cards.map((card) => `<li>${escapeHtml(schema.summarizeCard(card))}</li>`).join("")}</ol>`
      : "<p>No automation steps yet.</p>";
  }

  function renderWarnings(builder) {
    const warningsEl = builder.querySelector("[data-automation-warnings]");
    if (!warningsEl) return;
    const warnings = schema.validateAutomation(readAutomation(builder));
    warningsEl.innerHTML = warnings.length
      ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : "<p>Ready to save. VTT play mode will run cards from top to bottom.</p>";
    warningsEl.classList.toggle("automation-builder__warnings--ok", warnings.length === 0);
    renderSummary(builder);
  }

  function replaceCards(builder, cards) {
    builder.querySelector("[data-automation-cards]").innerHTML = cards.map(renderCard).join("");
    renderWarnings(builder);
  }

  function addCard(builder, type) {
    const automation = readAutomation(builder);
    const card = type === "action" ? schema.createActionCard("powerRoll") : schema.normalizeAutomation({ cards: [{ type: "target" }] }).cards[0];
    automation.cards.push(card);
    replaceCards(builder, automation.cards);
  }

  function makeDraggable(host) {
    if (host.classList.contains("automation-builder--external")) return;
    const panel = host.querySelector(".automation-builder__window");
    const handle = host.querySelector("[data-automation-builder-handle]");
    if (!panel || !handle) return;

    const doc = host.ownerDocument || document;
    const view = doc.defaultView || window;
    const positionPanel = () => {
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.round((view.innerWidth - rect.width) / 2))}px`;
      panel.style.top = `${Math.max(12, Math.round(view.innerHeight * 0.08))}px`;
    };
    view.requestAnimationFrame(positionPanel);

    handle.addEventListener("pointerdown", (event) => {
      if (asElement(event.target)?.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      panel.setPointerCapture(event.pointerId);
      panel.classList.add("automation-builder__window--dragging");

      const move = (moveEvent) => {
        const maxLeft = Math.max(12, view.innerWidth - panel.offsetWidth - 12);
        const maxTop = Math.max(12, view.innerHeight - 64);
        panel.style.left = `${Math.min(Math.max(12, moveEvent.clientX - offsetX), maxLeft)}px`;
        panel.style.top = `${Math.min(Math.max(12, moveEvent.clientY - offsetY), maxTop)}px`;
      };

      const stop = () => {
        panel.classList.remove("automation-builder__window--dragging");
        panel.removeEventListener("pointermove", move);
        panel.removeEventListener("pointerup", stop);
        panel.removeEventListener("pointercancel", stop);
      };

      panel.addEventListener("pointermove", move);
      panel.addEventListener("pointerup", stop);
      panel.addEventListener("pointercancel", stop);
    });
  }

  function bindCardSorting(builder) {
    let draggedCard = null;

    builder.addEventListener("dragstart", (event) => {
      const target = asElement(event.target);
      const handle = target?.closest("[data-drag-automation-card]");
      const card = target?.closest("[data-automation-card]");
      if (!handle || !card) {
        event.preventDefault();
        return;
      }
      draggedCard = card;
      card.classList.add("automation-builder__card--dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.getAttribute("data-automation-card") || "");
    });

    builder.addEventListener("dragover", (event) => {
      if (!draggedCard) return;
      const stack = builder.querySelector("[data-automation-cards]");
      const targetCard = asElement(event.target)?.closest("[data-automation-card]");
      if (!stack || !targetCard || targetCard === draggedCard) return;
      event.preventDefault();
      const rect = targetCard.getBoundingClientRect();
      const placeBefore = event.clientY < rect.top + rect.height / 2;
      stack.insertBefore(draggedCard, placeBefore ? targetCard : targetCard.nextSibling);
    });

    builder.addEventListener("drop", (event) => {
      if (!draggedCard) return;
      event.preventDefault();
      renderWarnings(builder);
    });

    builder.addEventListener("dragend", () => {
      draggedCard?.classList.remove("automation-builder__card--dragging");
      draggedCard = null;
      renderWarnings(builder);
    });
  }

  function createBuilderHost(targetDocument, actionId, actionType, automation) {
    const host = targetDocument.createElement("div");
    host.id = BUILDER_ID;
    host.className = "automation-builder";
    host.innerHTML = `
      <div class="automation-builder__window" role="dialog" aria-modal="false" aria-labelledby="ability-automation-title">
        <header class="modal__header automation-builder__header" data-automation-builder-handle>
          <div>
            <p class="automation-builder__eyebrow">${escapeHtml(actionType)} - ${escapeHtml(actionId)}</p>
            <h2 class="modal__title" id="ability-automation-title">Ability Automation</h2>
          </div>
          <button class="icon-btn" type="button" data-close-automation-builder aria-label="Close automation builder">X</button>
        </header>
        <div class="modal__body automation-builder__body">
          <p class="automation-builder__intro">Build the VTT play sequence with target cards and action cards. Cards run from top to bottom.</p>
          <div class="automation-builder__toolbar">
            ${registry.primitives.map((primitive) => `<button class="text-btn" type="button" data-add-automation-card="${escapeHtml(primitive.type)}">+ ${escapeHtml(primitive.label)}</button>`).join("")}
          </div>
          <div class="automation-builder__layout">
            <div class="automation-builder__stack" data-automation-cards>${automation.cards.map(renderCard).join("")}</div>
            <aside class="automation-builder__sidebar">
              <div class="automation-builder__plain">
                <h3>Play Sequence</h3>
                <div data-automation-summary></div>
              </div>
              <div class="automation-builder__warnings" data-automation-warnings aria-live="polite"></div>
            </aside>
          </div>
        </div>
        <footer class="automation-builder__footer">
          <button class="text-btn" type="button" data-close-automation-builder>Cancel</button>
          <button class="text-btn automation-builder__save" type="button" data-save-automation-builder>Save Automation</button>
        </footer>
      </div>
    `;
    return host;
  }

  function getStylesheetLinks() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.href || "")
      .filter(Boolean);
  }

  function openBuilderPopup(actionId) {
    const popup = window.open("", "abilityAutomationBuilder", "popup=yes,width=860,height=760,resizable=yes,scrollbars=yes");
    if (!popup || popup.closed) return null;
    const stylesheets = getStylesheetLinks();
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Automation - ${escapeHtml(actionId)}</title>
          ${stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join("")}
        </head>
        <body class="character-sheet-page automation-builder-popup-body"></body>
      </html>`);
    popup.document.close();
    activeBuilderPopup = popup;
    popup.addEventListener("beforeunload", () => {
      if (activeBuilderPopup === popup) activeBuilderPopup = null;
    });
    popup.focus();
    return popup;
  }

  function open(actionId, actionType, currentAutomation, onSave) {
    closeBuilder();

    const automation = schema.normalizeAutomation(currentAutomation);
    const popup = openBuilderPopup(actionId);
    const targetDocument = popup?.document || document;
    const host = createBuilderHost(targetDocument, actionId, actionType, automation);
    if (popup) {
      host.classList.add("automation-builder--external");
      targetDocument.body.appendChild(host);
    } else {
      document.body.appendChild(host);
    }

    renderWarnings(host);
    makeDraggable(host);
    bindCardSorting(host);

    host.addEventListener("click", (event) => {
      const target = asElement(event.target);
      if (!target) return;
      if (target.closest("[data-close-automation-builder]")) closeBuilder();
      const addButton = target.closest("[data-add-automation-card]");
      if (addButton) addCard(host, addButton.getAttribute("data-add-automation-card") || "target");
      const removeButton = target.closest("[data-remove-automation-card]");
      if (removeButton) {
        removeButton.closest("[data-automation-card]")?.remove();
        renderWarnings(host);
      }
      if (target.closest("[data-save-automation-builder]")) {
        if (typeof onSave === "function") {
          onSave(readAutomation(host));
        }
        closeBuilder();
      }
    });

    host.addEventListener("input", () => renderWarnings(host));
    host.addEventListener("change", (event) => {
      const target = asElement(event.target);
      if (target?.matches('[data-card-field="actionType"]')) {
        replaceCards(host, readAutomation(host).cards);
        return;
      }
      renderWarnings(host);
    });
  }

  window.AbilityAutomation = { open };
})();
