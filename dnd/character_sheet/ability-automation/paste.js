// Ability Automation — Paste UI.
//
// Exposes window.AbilityAutomation.open(actionId, actionType, currentAutomation, onSave)
// matching the legacy builder signature so the character sheet integration is
// zero-touch.
//
// The UI is a single big textarea for JSON paste. Live lenient validation shows
// warnings as you type. Save accepts even with warnings (per A2 = lenient).

(function (global) {
  "use strict";

  const PASTE_ID = "ability-automation-paste";
  const schema = global.AbilityAutomationSchema;

  if (!schema) {
    console.error("AbilityAutomation paste UI requires schema.js to load first.");
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function close() {
    document.getElementById(PASTE_ID)?.remove();
  }

  function open(actionId, actionType, currentAutomation, onSave) {
    if (!actionId || !actionType || typeof onSave !== "function") {
      console.warn("AbilityAutomation.open called with invalid arguments");
      return;
    }
    close();

    const initialJson = currentAutomation && typeof currentAutomation === "object" && Object.keys(currentAutomation).length
      ? JSON.stringify(currentAutomation, null, 2)
      : "";

    const host = document.createElement("div");
    host.id = PASTE_ID;
    host.className = "ability-paste";
    host.innerHTML = `
      <div class="ability-paste__backdrop" data-paste-cancel></div>
      <div class="ability-paste__modal" role="dialog" aria-modal="true" aria-labelledby="ability-paste-title">
        <header class="ability-paste__header">
          <div>
            <h2 class="ability-paste__title" id="ability-paste-title">Automation JSON</h2>
            <p class="ability-paste__subtitle">Paste the JSON for this ability. Validation is lenient — warnings show below.</p>
          </div>
          <button class="ability-paste__close" type="button" data-paste-cancel aria-label="Close">&times;</button>
        </header>
        <div class="ability-paste__body">
          <textarea
            class="ability-paste__textarea"
            data-paste-input
            spellcheck="false"
            placeholder='Paste JSON like:&#10;{&#10;  "schema": "ability-automation/v3",&#10;  "cards": [&#10;    { "type": "target", "mode": "token", "predicate": "enemy", "count": 1 },&#10;    { "type": "powerRoll", "attribute": "Might", "tiers": { "tier1": { "effects": [{ "kind": "damage", "amount": 3, "attribute": "M" }] } } }&#10;  ]&#10;}'
          >${escapeHtml(initialJson)}</textarea>
          <div class="ability-paste__status" data-paste-status></div>
        </div>
        <footer class="ability-paste__footer">
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-paste-clear>Clear automation</button>
          <span class="ability-paste__spacer"></span>
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-paste-cancel>Cancel</button>
          <button class="ability-paste__btn ability-paste__btn--primary" type="button" data-paste-save>Save</button>
        </footer>
      </div>
    `;
    document.body.appendChild(host);

    const textarea = host.querySelector("[data-paste-input]");
    const statusEl = host.querySelector("[data-paste-status]");

    function renderStatus(rawText) {
      if (!rawText.trim()) {
        statusEl.innerHTML = '<span class="ability-paste__status-empty">Empty — saving will clear this ability\'s automation.</span>';
        return { ok: true, parsed: null, warnings: [], normalized: null };
      }
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        statusEl.innerHTML = `<span class="ability-paste__status-error">JSON parse error: ${escapeHtml(err.message)}</span>`;
        return { ok: false, parsed: null, warnings: [], normalized: null };
      }
      const normalized = schema.normalizeAutomation(parsed);
      const warnings = normalized.warnings || [];
      const summaries = (normalized.cards || []).map((block, index) => `${index + 1}. ${block.type}`);
      const summaryHtml = summaries.length
        ? `<div class="ability-paste__summary"><strong>${normalized.cards.length} block(s):</strong> ${escapeHtml(summaries.join("  →  "))}</div>`
        : '<div class="ability-paste__summary">No blocks parsed.</div>';
      const warnHtml = warnings.length
        ? `<ul class="ability-paste__warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
        : "";
      statusEl.innerHTML = `${summaryHtml}${warnHtml}`;
      return { ok: true, parsed, warnings, normalized };
    }

    let renderTimer = null;
    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => renderStatus(textarea.value), 200);
    }
    scheduleRender();
    textarea.addEventListener("input", scheduleRender);

    host.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-paste-cancel]")) {
        close();
        return;
      }
      if (target.closest("[data-paste-clear]")) {
        textarea.value = "";
        renderStatus("");
        onSave(null);
        close();
        return;
      }
      if (target.closest("[data-paste-save]")) {
        const text = textarea.value;
        if (!text.trim()) {
          onSave(null);
          close();
          return;
        }
        const result = renderStatus(text);
        if (!result.ok) {
          // JSON parse error — keep the dialog open so user can fix.
          return;
        }
        onSave(result.normalized);
        close();
      }
    });

    document.addEventListener(
      "keydown",
      function escListener(event) {
        if (event.key !== "Escape") return;
        if (!document.getElementById(PASTE_ID)) {
          document.removeEventListener("keydown", escListener);
          return;
        }
        close();
        document.removeEventListener("keydown", escListener);
      },
      true
    );

    requestAnimationFrame(() => textarea.focus());
  }

  global.AbilityAutomation = { open, close };
})(window);
