(function () {
  "use strict";

  const MODAL_ID = "ability-automation-modal";
  const schema = window.AbilityAutomationSchema;
  const registry = window.AbilityAutomationPrimitives;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function cardShell(card, title, body) {
    return `
      <section class="automation-builder__card" data-automation-card="${escapeHtml(card.id)}" data-card-type="${escapeHtml(card.type)}">
        <header class="automation-builder__card-header">
          <div>
            <h3 class="automation-builder__card-title">${escapeHtml(title)}</h3>
            <p class="automation-builder__card-type">${escapeHtml(registry.getPrimitive(card.type).description)}</p>
          </div>
          <button class="icon-btn automation-builder__remove" type="button" data-remove-automation-card="${escapeHtml(card.id)}" aria-label="Remove ${escapeHtml(title)} card">✕</button>
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
        <label class="automation-builder__field automation-builder__field--wide">
          <span>Range / area note</span>
          <input type="text" data-card-field="within" value="${escapeHtml(data.within)}" placeholder="e.g. within 1, melee 1, each enemy in the area" />
        </label>
      </div>
    `;
    return cardShell(card, "Target", body);
  }

  function renderPowerRollCard(card) {
    const data = card.data;
    const tiers = data.tiers;
    const tierMarkup = schema.TIER_KEYS.map((key) => {
      const tier = tiers[key];
      const label = key === "low" ? "≤ 11" : key === "mid" ? "12-16" : "17+";
      return `
        <div class="automation-builder__tier" data-tier="${key}">
          <div class="automation-builder__tier-label">${label}</div>
          <label class="automation-builder__field">
            <span>Damage</span>
            <input type="text" data-tier-field="damage" value="${escapeHtml(tier.damage)}" placeholder="e.g. 3" />
          </label>
          <label class="automation-builder__field">
            <span>Damage type</span>
            <input type="text" data-tier-field="damageType" value="${escapeHtml(tier.damageType)}" placeholder="optional" />
          </label>
          <label class="automation-builder__field automation-builder__field--wide">
            <span>Tier effect</span>
            <input type="text" data-tier-field="effect" value="${escapeHtml(tier.effect)}" placeholder="optional push, condition, save note" />
          </label>
        </div>
      `;
    }).join("");

    const body = `
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
    return cardShell(card, "Power Roll Damage", body);
  }

  function renderNoteCard(card) {
    const body = `
      <label class="automation-builder__field automation-builder__field--wide">
        <span>Note</span>
        <textarea rows="3" data-card-field="text" placeholder="Describe a future automation detail.">${escapeHtml(card.data.text)}</textarea>
      </label>
    `;
    return cardShell(card, "Automation Note", body);
  }

  function renderCard(card) {
    if (card.type === "powerRollDamage") return renderPowerRollCard(card);
    if (card.type === "note") return renderNoteCard(card);
    return renderTargetCard(card);
  }

  function readAutomation(modal) {
    const cards = Array.from(modal.querySelectorAll("[data-automation-card]")).map((cardEl) => {
      const type = cardEl.getAttribute("data-card-type") || "target";
      const id = cardEl.getAttribute("data-automation-card") || schema.createId("card");
      const getField = (field) => cardEl.querySelector(`[data-card-field="${field}"]`);

      if (type === "powerRollDamage") {
        const tiers = {};
        schema.TIER_KEYS.forEach((key) => {
          const tierEl = cardEl.querySelector(`[data-tier="${key}"]`);
          const getTierField = (field) => tierEl?.querySelector(`[data-tier-field="${field}"]`);
          tiers[key] = {
            range: key === "low" ? "≤ 11" : key === "mid" ? "12-16" : "17+",
            damage: getTierField("damage")?.value || "",
            damageType: getTierField("damageType")?.value || "",
            effect: getTierField("effect")?.value || "",
          };
        });
        return {
          id,
          type,
          data: {
            rollFormula: getField("rollFormula")?.value || "2d10",
            attribute: getField("attribute")?.value || "Might",
            bonus: getField("bonus")?.value || "",
            tiers,
          },
        };
      }

      if (type === "note") {
        return { id, type, data: { text: getField("text")?.value || "" } };
      }

      return {
        id,
        type: "target",
        data: {
          count: getField("count")?.value || "one",
          creature: getField("creature")?.value || "enemy",
          within: getField("within")?.value || "",
        },
      };
    });

    return schema.normalizeAutomation({ cards });
  }

  function renderWarnings(modal) {
    const warningsEl = modal.querySelector("[data-automation-warnings]");
    if (!warningsEl) return;
    const warnings = schema.validateAutomation(readAutomation(modal));
    warningsEl.innerHTML = warnings.length
      ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : "<p>Ready to save. Runtime execution will be added later.</p>";
    warningsEl.classList.toggle("automation-builder__warnings--ok", warnings.length === 0);
  }

  function addCard(modal, type) {
    const automation = readAutomation(modal);
    automation.cards.push(schema.normalizeAutomation({ cards: [{ type }] }).cards[0]);
    modal.querySelector("[data-automation-cards]").innerHTML = automation.cards.map(renderCard).join("");
    renderWarnings(modal);
  }

  function open(actionId, actionType, currentAutomation, onSave) {
    closeModal();

    const automation = schema.normalizeAutomation(currentAutomation);
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "modal-overlay automation-builder";
    modal.innerHTML = `
      <div class="modal automation-builder__modal" role="dialog" aria-modal="true" aria-labelledby="ability-automation-title">
        <header class="modal__header automation-builder__header">
          <div>
            <p class="automation-builder__eyebrow">${escapeHtml(actionType)} • ${escapeHtml(actionId)}</p>
            <h2 class="modal__title" id="ability-automation-title">Ability Automation</h2>
          </div>
          <button class="icon-btn" type="button" data-close-automation-builder aria-label="Close automation builder">✕</button>
        </header>
        <div class="modal__body automation-builder__body">
          <p class="automation-builder__intro">Describe this ability as cards. These values are saved as data only; play-mode execution is intentionally not part of this version.</p>
          <div class="automation-builder__toolbar">
            ${registry.primitives.map((primitive) => `<button class="text-btn" type="button" data-add-automation-card="${escapeHtml(primitive.type)}">+ ${escapeHtml(primitive.label)}</button>`).join("")}
          </div>
          <div class="automation-builder__stack" data-automation-cards>${automation.cards.map(renderCard).join("")}</div>
          <aside class="automation-builder__warnings" data-automation-warnings aria-live="polite"></aside>
        </div>
        <footer class="automation-builder__footer">
          <button class="text-btn" type="button" data-close-automation-builder>Cancel</button>
          <button class="text-btn automation-builder__save" type="button" data-save-automation-builder>Save Automation</button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);
    renderWarnings(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-close-automation-builder]")) closeModal();
      const addButton = target.closest("[data-add-automation-card]");
      if (addButton) addCard(modal, addButton.getAttribute("data-add-automation-card") || "target");
      const removeButton = target.closest("[data-remove-automation-card]");
      if (removeButton) {
        removeButton.closest("[data-automation-card]")?.remove();
        renderWarnings(modal);
      }
      if (target.closest("[data-save-automation-builder]")) {
        if (typeof onSave === "function") {
          onSave(readAutomation(modal));
        }
        closeModal();
      }
    });

    modal.addEventListener("input", () => renderWarnings(modal));
    modal.addEventListener("change", () => renderWarnings(modal));
  }

  window.AbilityAutomation = { open };
})();
