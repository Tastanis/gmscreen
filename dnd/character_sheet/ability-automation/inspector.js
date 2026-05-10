// Ability Automation — Inspector.
//
// Read-only debug view for a single ability. Opens from the character sheet
// next to the automation button. Shows: raw JSON, normalized structure, ordered
// runtime steps preview, validation warnings.
//
// To edit, the user re-pastes through the automation paste UI.

(function (global) {
  "use strict";

  const INSPECTOR_ID = "ability-automation-inspector";
  const schema = global.AbilityAutomationSchema;

  if (!schema) {
    console.error("AbilityAutomationInspector requires schema.js to load first.");
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
    document.getElementById(INSPECTOR_ID)?.remove();
  }

  function open(options = {}) {
    const action = options.action || {};
    const automation = action.automation;
    close();

    const host = document.createElement("div");
    host.id = INSPECTOR_ID;
    host.className = "ability-inspector";

    if (!automation || !schema.hasAutomation(automation)) {
      host.innerHTML = `
        <div class="ability-paste__backdrop" data-inspector-cancel></div>
        <div class="ability-paste__modal ability-inspector__modal" role="dialog" aria-modal="true">
          <header class="ability-paste__header">
            <div>
              <h2 class="ability-paste__title">${escapeHtml(action.name || "Ability")} — Inspector</h2>
              <p class="ability-paste__subtitle">No automation configured for this ability.</p>
            </div>
            <button class="ability-paste__close" type="button" data-inspector-cancel aria-label="Close">&times;</button>
          </header>
          <footer class="ability-paste__footer">
            <span class="ability-paste__spacer"></span>
            <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-inspector-cancel>Close</button>
          </footer>
        </div>
      `;
      document.body.appendChild(host);
      bindClose(host);
      return;
    }

    const normalized = schema.normalizeAutomation(automation);
    const steps = schema.describeAutomationSteps(normalized);
    const warnings = normalized.warnings || [];
    const rawJson = JSON.stringify(automation, null, 2);
    const normalizedJson = JSON.stringify(stripWarnings(normalized), null, 2);

    host.innerHTML = `
      <div class="ability-paste__backdrop" data-inspector-cancel></div>
      <div class="ability-paste__modal ability-inspector__modal" role="dialog" aria-modal="true">
        <header class="ability-paste__header">
          <div>
            <h2 class="ability-paste__title">${escapeHtml(action.name || "Ability")} — Inspector</h2>
            <p class="ability-paste__subtitle">Read-only. To edit, re-paste through the automation button.</p>
          </div>
          <button class="ability-paste__close" type="button" data-inspector-cancel aria-label="Close">&times;</button>
        </header>
        <div class="ability-paste__body ability-inspector__body">
          <section class="ability-inspector__section">
            <h3 class="ability-inspector__section-title">Runtime steps</h3>
            <pre class="ability-inspector__pre ability-inspector__pre--steps">${escapeHtml(steps.join("\n") || "(no blocks)")}</pre>
          </section>
          ${warnings.length ? `
          <section class="ability-inspector__section">
            <h3 class="ability-inspector__section-title">Warnings</h3>
            <ul class="ability-paste__warnings">
              ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
            </ul>
          </section>` : ""}
          <section class="ability-inspector__section">
            <h3 class="ability-inspector__section-title">Normalized JSON (after defaults)</h3>
            <pre class="ability-inspector__pre">${escapeHtml(normalizedJson)}</pre>
          </section>
          <section class="ability-inspector__section">
            <h3 class="ability-inspector__section-title">Raw saved JSON</h3>
            <pre class="ability-inspector__pre">${escapeHtml(rawJson)}</pre>
          </section>
        </div>
        <footer class="ability-paste__footer">
          <span class="ability-paste__spacer"></span>
          <button class="ability-paste__btn ability-paste__btn--ghost" type="button" data-inspector-cancel>Close</button>
        </footer>
      </div>
    `;
    document.body.appendChild(host);
    bindClose(host);
  }

  function stripWarnings(automation) {
    if (!automation || typeof automation !== "object") return automation;
    const { warnings, ...rest } = automation;
    return rest;
  }

  function bindClose(host) {
    host.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-inspector-cancel]")) close();
    });
    document.addEventListener(
      "keydown",
      function escListener(event) {
        if (event.key !== "Escape") return;
        if (!document.getElementById(INSPECTOR_ID)) {
          document.removeEventListener("keydown", escListener);
          return;
        }
        close();
        document.removeEventListener("keydown", escListener);
      },
      true
    );
  }

  global.AbilityAutomationInspector = { open, close };
})(window);
