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
  const fieldMap = global.AbilityAutomationFieldMap;

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

  function isWrappedPayload(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "fields") &&
      Object.prototype.hasOwnProperty.call(value, "automation")
    );
  }

  function parsePastePayload(rawText) {
    if (!rawText.trim()) {
      return { ok: true, parsed: null, automationInput: null, fields: null, wrapped: false };
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      return { ok: false, error: err, parsed: null, automationInput: null, fields: null, wrapped: false };
    }
    if (isWrappedPayload(parsed)) {
      return {
        ok: true,
        parsed,
        automationInput: parsed.automation,
        fields: parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {},
        wrapped: true,
      };
    }
    return { ok: true, parsed, automationInput: parsed, fields: null, wrapped: false };
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
          <p class="ability-paste__hint">Accepts automation JSON, or wrapped <code>{ fields, automation }</code> to also fill the text fields.</p>
          <div class="ability-paste__status" data-paste-status></div>
          <div class="ability-paste__field-warnings" data-paste-field-warnings hidden></div>
        </div>
        <footer class="ability-paste__footer">
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-paste-clear>Clear automation</button>
          <span class="ability-paste__spacer"></span>
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-paste-undo hidden>Undo paste</button>
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-paste-cancel>Cancel</button>
          <button class="ability-paste__btn ability-paste__btn--primary" type="button" data-paste-save>Save</button>
        </footer>
      </div>
    `;
    document.body.appendChild(host);

    const textarea = host.querySelector("[data-paste-input]");
    const statusEl = host.querySelector("[data-paste-status]");
    const fieldWarningsEl = host.querySelector("[data-paste-field-warnings]");
    const undoBtn = host.querySelector("[data-paste-undo]");
    let undoSnapshot = null;

    function setFieldWarnings(warnings) {
      if (!fieldWarningsEl) return;
      if (!warnings.length) {
        fieldWarningsEl.hidden = true;
        fieldWarningsEl.innerHTML = "";
        return;
      }
      fieldWarningsEl.hidden = false;
      fieldWarningsEl.innerHTML = `<ul class="ability-paste__warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;
    }

    function renderStatus(rawText) {
      if (!rawText.trim()) {
        statusEl.innerHTML = '<span class="ability-paste__status-empty">Empty — saving will clear this ability\'s automation.</span>';
        return { ok: true, parsed: null, warnings: [], normalized: null };
      }
      const payload = parsePastePayload(rawText);
      if (!payload.ok) {
        statusEl.innerHTML = `<span class="ability-paste__status-error">JSON parse error: ${escapeHtml(payload.error.message)}</span>`;
        return { ok: false, parsed: null, warnings: [], normalized: null };
      }
      const normalized = schema.normalizeAutomation(payload.automationInput);
      const warnings = normalized.warnings || [];
      const summaries = (normalized.cards || []).map((block, index) => `${index + 1}. ${block.type}`);
      const modifierCount = Array.isArray(normalized.modifiers) ? normalized.modifiers.length : 0;
      let summaryHtml = '';
      if (summaries.length) {
        summaryHtml = `<div class="ability-paste__summary"><strong>${normalized.cards.length} block(s):</strong> ${escapeHtml(summaries.join("  →  "))}</div>`;
      } else if (modifierCount > 0) {
        const labels = normalized.modifiers.map((m, i) => m.label || `modifier ${i + 1}`).join(', ');
        summaryHtml = `<div class="ability-paste__summary"><strong>${modifierCount} feature modifier(s):</strong> ${escapeHtml(labels)}</div>`;
      } else {
        summaryHtml = '<div class="ability-paste__summary">No blocks or modifiers parsed.</div>';
      }
      const warnHtml = warnings.length
        ? `<ul class="ability-paste__warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
        : "";
      const wrappedHtml = payload.wrapped
        ? '<div class="ability-paste__summary">Wrapped paste detected: fields + automation.</div>'
        : "";
      statusEl.innerHTML = `${wrappedHtml}${summaryHtml}${warnHtml}`;
      return { ok: true, parsed: payload.parsed, warnings, normalized, fields: payload.fields, wrapped: payload.wrapped };
    }

    let renderTimer = null;
    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => renderStatus(textarea.value), 200);
    }
    scheduleRender();
    textarea.addEventListener("input", scheduleRender);

    let isSaving = false;
    async function runSave(value) {
      if (isSaving) return;
      isSaving = true;
      const saveBtn = host.querySelector('[data-paste-save]');
      const cancelBtn = host.querySelector('[data-paste-cancel]');
      const clearBtn = host.querySelector('[data-paste-clear]');
      const undoButton = host.querySelector('[data-paste-undo]');
      const previousLabel = saveBtn?.textContent;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }
      if (cancelBtn) cancelBtn.disabled = true;
      if (clearBtn) clearBtn.disabled = true;
      if (undoButton) undoButton.disabled = true;
      try {
        await Promise.resolve(onSave(value));
      } catch (err) {
        console.error('[AbilityAutomation paste] save failed', err);
      } finally {
        isSaving = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = previousLabel || 'Save';
        }
        if (cancelBtn) cancelBtn.disabled = false;
        if (clearBtn) clearBtn.disabled = false;
        if (undoButton) undoButton.disabled = false;
      }
    }

    host.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (isSaving) return;
      if (target.closest("[data-paste-cancel]")) {
        close();
        return;
      }
      if (target.closest("[data-paste-clear]")) {
        textarea.value = "";
        renderStatus("");
        setFieldWarnings([]);
        undoSnapshot = null;
        if (undoBtn) undoBtn.hidden = true;
        // Persist the clear, but keep the dialog open so the user can paste
        // fresh JSON without reopening.
        await runSave(null);
        textarea.focus();
        return;
      }
      if (target.closest("[data-paste-undo]")) {
        if (!undoSnapshot) return;
        fieldMap?.restoreFields?.(actionId, actionType, undoSnapshot.fields, undoSnapshot.touched);
        setFieldWarnings([]);
        await runSave(undoSnapshot.automation);
        undoSnapshot = null;
        if (undoBtn) undoBtn.hidden = true;
        textarea.focus();
        return;
      }
      if (target.closest("[data-paste-save]")) {
        const text = textarea.value;
        if (!text.trim()) {
          await runSave(null);
          close();
          return;
        }
        const result = renderStatus(text);
        if (!result.ok) {
          // JSON parse error — keep the dialog open so user can fix.
          return;
        }
        let keepOpen = false;
        setFieldWarnings([]);
        if (result.wrapped) {
          const fieldWarnings = [];
          const beforeFields = fieldMap?.snapshotFields?.(actionId, actionType) || {};
          const applyResult = fieldMap?.applyFields?.(actionId, actionType, result.fields) || { touched: [], unknown: [], missing: [] };
          if (applyResult.unknown?.length) {
            fieldWarnings.push(`Ignored unknown fields: ${applyResult.unknown.map((k) => `\`${k}\``).join(", ")}.`);
          }
          if (applyResult.missing?.length) {
            fieldWarnings.push(`Could not find controls for: ${applyResult.missing.map((k) => `\`${k}\``).join(", ")}.`);
          }
          setFieldWarnings(fieldWarnings);
          keepOpen = fieldWarnings.length > 0;
          if (applyResult.touched?.length) {
            undoSnapshot = {
              fields: beforeFields,
              touched: applyResult.touched,
              automation: currentAutomation ? JSON.parse(JSON.stringify(currentAutomation)) : null,
            };
            if (undoBtn) undoBtn.hidden = false;
            keepOpen = true;
          }
        }
        await runSave(result.normalized);
        if (keepOpen) {
          textarea.focus();
          return;
        }
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
