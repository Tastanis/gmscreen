// The GM's two exports, moved unchanged from the classic sheet (sheet.js): Export Character Sheet (a printable
// sheet in a new window) and Export Skills (JSON for an LLM). makeSheetExports(sheet, character) gives both for one
// sheet as it stands.
import {
  SKILL_GROUPS, normalizeSkillsState, getSkillGroup, normalizeCommonThings, effectiveKit, renderRichText as renderRich, formatRoll as formatRollShort, stripHtmlToText,
} from './sheet-model.js';
import { PICKER_CONDITION_NAMES, normalizeSheetConditions, conditionChipLabel } from './conditions.js';

const SORTED_SKILL_GROUPS = Object.fromEntries(Object.entries(SKILL_GROUPS).map(([group, skills]) => [`${group} Skills`, [...skills].sort((a, b) => a.localeCompare(b))]));
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const cloneExportValue = (value) => (value === null || value === undefined ? null : deepClone(value));
const formatRoll = (rollMod) => (rollMod === '' || rollMod === null || rollMod === undefined ? '2d10+__' : formatRollShort(rollMod));
const renderRichText = (value) => renderRich(value);

export function makeSheetExports(sheetState, activeCharacter) {
  function buildSkillExportPayload() {

    const skills = Object.entries(normalizeSkillsState(sheetState.sidebar.skills || {}))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, data]) => ({
        name,
        group: getSkillGroup(name),
        level: data.level || "Trained",
        bonus: data.bonus ?? "",
      }));

    const features = (sheetState.features || []).map((feature) => ({
      id: feature.id,
      name: feature.title || "",
      type: "feature",
      useWhen: feature.useWhen || "",
      tags: Array.isArray(feature.tags) ? [...feature.tags] : [],
      text: stripHtmlToText(feature.text || ""),
      textHtml: feature.text || "",
      automation: cloneExportValue(feature.automation),
    }));

    const actions = {};
    Object.entries(sheetState.actions || {}).forEach(([type, entries]) => {
      actions[type] = (entries || []).map((action) => ({
        id: action.id,
        name: action.name || "",
        type,
        actionLabel: action.actionLabel || "",
        useWhen: action.useWhen || "",
        tags: Array.isArray(action.tags) ? [...action.tags] : [],
        range: action.range || "",
        target: action.target || "",
        trigger: action.trigger || "",
        cost: action.cost || "",
        description: stripHtmlToText(action.description || ""),
        descriptionHtml: action.description || "",
        tests: cloneExportValue(action.tests || []),
        automation: cloneExportValue(action.automation),
      }));
    });

    return {
      schema: "character-sheet-llm-export/v1",
      exportedAt: new Date().toISOString(),
      characterKey: activeCharacter || "",
      hero: {
        name: sheetState.hero?.name || "",
        level: sheetState.hero?.level || "",
        class: sheetState.hero?.class || "",
        classTrack: sheetState.hero?.classTrack || "",
        ancestry: sheetState.hero?.ancestry || "",
        career: sheetState.hero?.career || {},
        culture: sheetState.hero?.culture || {},
        kit: effectiveKit(sheetState).values,
        complication: sheetState.hero?.complication || "",
      },
      trainedSkills: skills,
      heroicResource: {
        title: sheetState.hero?.resource?.title || "Resource",
        sidebarText: stripHtmlToText(sheetState.sidebar?.resource?.text || ""),
        automation: cloneExportValue(sheetState.hero?.resource?.automation),
      },
      features,
      actions,
      rawSheet: cloneExportValue(sheetState),
    };
  }


  function printableValue(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function fieldBox(label, value) {
    return `
      <div class="fs-field">
        <div class="fs-value">${escapeHtml(printableValue(value))}</div>
        <div class="fs-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  function sectionTitle(title) {
    return `<div class="fs-section-title"><h2>${escapeHtml(title)}</h2><div class="fs-rule"></div></div>`;
  }

  function miniHeading(title) {
    return `<div class="fs-mini-heading"><span>${escapeHtml(title)}</span></div>`;
  }

  function statBox(label, short, value) {
    return `
      <div class="fs-stat">
        <div class="fs-stat-label"><b>${escapeHtml(short)}</b>${escapeHtml(label)}</div>
        <div class="fs-stat-value">${escapeHtml(printableValue(value, "0"))}</div>
      </div>
    `;
  }

  function vitalMini(label, value) {
    return `
      <div class="fs-vital">
        <div class="fs-vital-value">${escapeHtml(printableValue(value))}</div>
        <div class="fs-vital-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  function checkboxLine(label, checked) {
    return `<div class="fs-check-line"><span${checked ? ' class="fs-check-on"' : ""}>${checked ? "◆" : "◇"}</span>${escapeHtml(label)}</div>`;
  }

  function printableNumber(value, fallback = 0) {
    const num = Number(String(value ?? "").trim());
    return Number.isFinite(num) ? num : fallback;
  }

  function highestStatValue() {
    const stats = sheetState.hero?.stats || {};
    return Math.max(...["might", "agility", "reason", "intuition", "presence"].map((key) => printableNumber(stats[key], 0)));
  }

  function shieldSvg(value) {
    return `
      <svg class="fs-shield" viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 3 L97 16 L97 62 L50 107 L3 62 L3 16 Z" fill="none" stroke="#3a3a3a" stroke-width="4" />
        <text x="50" y="62" text-anchor="middle" font-size="34" font-family="Georgia, serif" fill="#1a1a1a">${escapeHtml(printableValue(value))}</text>
      </svg>
    `;
  }

  function hexSvg(value) {
    return `
      <svg class="fs-hex" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 2 L93 26 L93 74 L50 98 L7 74 L7 26 Z" fill="none" stroke="#3a3a3a" stroke-width="4" />
        <text x="50" y="61" text-anchor="middle" font-size="32" font-family="Georgia, serif" fill="#1a1a1a">${escapeHtml(printableValue(value))}</text>
      </svg>
    `;
  }

  function trainedSkillMap() {
    return normalizeSkillsState(sheetState.sidebar.skills || {});
  }

  function renderPrintableSkills() {
    const trained = trainedSkillMap();
    return Object.entries(SORTED_SKILL_GROUPS)
      .map(([group, skills]) => `
        <div class="fs-skill-group">
          <h3>${escapeHtml(group.replace(" Skills", ""))}</h3>
          <div class="fs-skill-grid">
            ${skills
              .map((skill) => {
                const data = trained[skill];
                const suffix = data?.bonus ? ` ${data.bonus}` : "";
                return checkboxLine(`${skill}${suffix}`, Boolean(data));
              })
              .join("")}
          </div>
        </div>
      `)
      .join("");
  }

  function testTierPrintLine(label, tier) {
    if (!tier) return "";
    const parts = [];
    if (tier.damage || tier.damageType) {
      parts.push(`${tier.damage || ""}${tier.damageType ? " " + tier.damageType : ""}`.trim());
    }
    if (tier.notes) parts.push(tier.notes);
    if (tier.attributeCheck?.enabled) {
      const attr = tier.attributeCheck.attribute || "Attr";
      const threshold = tier.attributeCheck.threshold || "?";
      const effect = tier.attributeCheck.effect || "";
      parts.push(`${attr} <= ${threshold}: ${effect}`);
    }
    if (!parts.length) return "";
    return `<div class="fs-tier"><span class="fs-tier-band">${escapeHtml(label)}</span><div>${escapeHtml(parts.join("; "))}</div></div>`;
  }

  function actionPrintTone(action, type) {
    const haystack = [type, action.actionLabel, ...(action.tags || [])].join(" ").toLowerCase();
    if (haystack.includes("trigger")) return "green";
    if (haystack.includes("free")) return "gray";
    if (haystack.includes("performance") || haystack.includes("no action")) return "purple";
    if (haystack.includes("maneuver")) return "blue";
    return "red";
  }

  const PRINT_TYPE_LABELS = {
    mains: "Main Action",
    maneuvers: "Maneuver",
    triggers: "Triggered Action",
    freeStrikes: "Free Strike",
  };

  function renderPrintableActionCard(action, type) {
    const tone = actionPrintTone(action, type);
    const label = printableValue(action.actionLabel, PRINT_TYPE_LABELS[type] || type);
    const keywords = (action.tags || []).join(", ");

    return `
      <article class="fs-ability-card fs-tone-${tone}">
        <div class="fs-ability-kind">${escapeHtml(label.toUpperCase())}</div>
        ${action.cost ? `<div class="fs-cost"><b>${escapeHtml(action.cost)}</b><small>COST</small></div>` : ""}
        <h3>${escapeHtml(printableValue(action.name, "Unnamed Ability"))}</h3>
        <div class="fs-card-rule"></div>
        ${action.useWhen ? `<p class="fs-flavor">${escapeHtml(action.useWhen)}</p>` : ""}
        ${keywords || action.actionLabel ? `
          <div class="fs-keyword-row">
            <span class="fs-keywords">${escapeHtml(keywords)}</span>
            <span class="fs-action-type">${escapeHtml(label)}</span>
          </div>` : ""}
        ${action.range || action.target ? `
          <div class="fs-range-row">
            <span>${action.range ? `&#9876; ${escapeHtml(action.range)}` : ""}</span>
            <span>${action.target ? `&#9678; ${escapeHtml(action.target)}` : ""}</span>
          </div>` : ""}
        ${type === "triggers" && action.trigger ? `<p class="fs-card-line"><b>Trigger:</b> ${escapeHtml(action.trigger)}</p>` : ""}
        ${(action.tests || [])
          .map((test) => `
            <div class="fs-test">
              <div class="fs-power-roll">${escapeHtml(printableValue(test.label, "Power Roll"))} ${escapeHtml(formatRoll(test.rollMod))}</div>
              ${test.beforeEffect ? `<p>${escapeHtml(test.beforeEffect)}</p>` : ""}
              ${testTierPrintLine("≤11", test.tiers?.low)}
              ${testTierPrintLine("12–16", test.tiers?.mid)}
              ${testTierPrintLine("17+", test.tiers?.high)}
              ${test.additionalEffect ? `<p>${escapeHtml(test.additionalEffect)}</p>` : ""}
            </div>
          `)
          .join("")}
        ${action.description ? `<div class="fs-card-text"><b>Effect:</b> ${renderRichText(action.description)}</div>` : ""}
      </article>
    `;
  }

  function renderPrintableFeature(feature) {
    const tags = Array.isArray(feature.tags) && feature.tags.length ? feature.tags.join(", ") : "";
    return `
      <div class="fs-feature">
        <h3>${escapeHtml(printableValue(feature.title, "Feature"))}</h3>
        ${tags ? `<div class="fs-chipline">${escapeHtml(tags)}</div>` : ""}
        ${feature.useWhen ? `<p class="fs-flavor">${escapeHtml(feature.useWhen)}</p>` : ""}
        <div>${renderRichText(feature.text || "")}</div>
      </div>
    `;
  }

  function renderPrintableCommonThing(thing) {
    return `
      <div class="fs-feature">
        <h3>${escapeHtml(printableValue(thing.title, "Common Thing"))}</h3>
        <div>${renderRichText(thing.details || "")}</div>
      </div>
    `;
  }


  function renderPrintableInventory(inventoryData) {
    const currentItems = inventoryData?.[activeCharacter]?.items || [];
    const sharedItems = inventoryData?.shared?.items || [];
    const items = [...currentItems, ...sharedItems].filter((item) => item && item.visible !== false);
    const rendered = items.map((item) => {
      const effects = Array.isArray(item.effectSections) ? item.effectSections : [];
      return `
        <div class="fs-inventory-item">
          <strong>${escapeHtml(printableValue(item.name, "Unnamed Item"))}</strong>
          ${item.keywords ? `<span class="fs-chipline">${escapeHtml(item.keywords)}</span>` : ""}
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          ${effects
            .map((section) => `
              <p><b>${escapeHtml(printableValue(section.title, "Effect"))}${section.cost ? ` (${escapeHtml(section.cost)})` : ""}:</b>
              ${escapeHtml(section.text || "")}</p>
            `)
            .join("")}
        </div>
      `;
    });
    const columns = [[], [], []];
    rendered.forEach((html, index) => columns[index % 3].push(html));
    return columns
      .map((column) => `<div class="fs-inventory-col">${column.join("") || '<div class="fs-empty-box"></div>'}</div>`)
      .join("");
  }

  function buildPrintableCharacterSheetHtml(inventoryData) {
    const hero = sheetState.hero || {};
    const vitals = hero.vitals || {};
    const resourceTitle = hero.resource?.title || sheetState.sidebar?.resource?.title || "Heroic Resource";
    const actions = [
      ...(sheetState.actions?.mains || []).map((action) => ({ action, type: "mains" })),
      ...(sheetState.actions?.maneuvers || []).map((action) => ({ action, type: "maneuvers" })),
      ...(sheetState.actions?.triggers || []).map((action) => ({ action, type: "triggers" })),
      ...(sheetState.actions?.freeStrikes || []).map((action) => ({ action, type: "freeStrikes" })),
    ];
    // The shared condition list (parts/conditions.js), the hero's current ones filled in (◆), then their own others.
    const current = normalizeSheetConditions(hero.conditions);
    const others = current.filter((c) => !PICKER_CONDITION_NAMES.includes(c.name)).map(conditionChipLabel);
    const conditions = [...PICKER_CONDITION_NAMES, ...others, "", ""];
    const conditionMark = (name, type) => (name && current.some((c) => conditionChipLabel(c) === name && c.duration.type === type) ? "◆" : "◇");
    const vulnerabilities = sheetState.sidebar?.lists?.vulnerability || [];
    const immunities = sheetState.sidebar?.lists?.immunity || [];
    const languages = sheetState.sidebar?.lists?.languages || [];
    const commonThings = normalizeCommonThings(sheetState.sidebar?.lists?.common || []);
    const kit = effectiveKit(sheetState).values;
    const kitHasData = Object.values(kit).some((value) => String(value ?? "").trim() !== "");
    const kitDamageTiers = (prefix) => ["Low", "Mid", "High"].map((tier, index) => `
      <div class="fs-kit-tier">
        <b>${escapeHtml(printableValue(kit[`${prefix}Damage${tier}`]))}</b>
        <span class="fs-tier-band">${["≤11", "12–16", "17+"][index]}</span>
      </div>
    `).join("");
    const kitHasMeleeDamage = ["meleeDamageLow", "meleeDamageMid", "meleeDamageHigh"].some((key) => String(kit[key] ?? "").trim() !== "");
    const kitHasRangedDamage = ["rangedDamageLow", "rangedDamageMid", "rangedDamageHigh"].some((key) => String(kit[key] ?? "").trim() !== "");
    const staminaMax = printableNumber(vitals.staminaMax, 0);
    const windedValue = Math.floor(staminaMax / 2);
    const maxStat = highestStatValue();
    const victories = printableNumber(hero.victories, 0);
    const victoryCells = Array.from({ length: 15 }, (_, index) => `<span class="${index < victories ? "fs-vic-on" : ""}"></span>`).join("");

    return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(printableValue(hero.name, "Character Sheet"))}</title>
    <style>
      @page { size: letter; margin: 0.2in; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #e6e6e6; color: #1a1a1a; font-family: Georgia, "Times New Roman", serif; font-size: 9pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .fs-page { width: 8.1in; min-height: 10.6in; margin: 0 auto; page-break-after: always; background: #e6e6e6; padding: 0.07in; }
      .fs-page:last-child { page-break-after: auto; }
      b, strong { font-weight: 700; }

      .fs-box { background: #fff; border: 1px solid #c3c3c3; border-radius: 4px; padding: 8px 10px; }
      .fs-section-title h2 { text-align: center; margin: 0; font-size: 11pt; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; }
      .fs-rule { position: relative; height: 4px; border-top: 1px solid #3a3a3a; border-bottom: 1px solid #3a3a3a; margin: 2px 0 8px; }
      .fs-rule::after { content: "◆"; position: absolute; left: 50%; top: -2px; transform: translateX(-50%); background: #fff; color: #3a3a3a; font-size: 6pt; line-height: 8px; padding: 0 4px; }
      .fs-mini-heading { display: flex; align-items: center; gap: 6px; margin: 2px 0 4px; color: #3a3a3a; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
      .fs-mini-heading::before, .fs-mini-heading::after { content: ""; flex: 1; border-top: 1px solid #999; }

      .fs-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
      .fs-brand::before, .fs-brand::after { content: ""; flex: 1; height: 4px; border-top: 1px solid #3a3a3a; border-bottom: 1px solid #3a3a3a; }
      .fs-brand-center { text-align: center; font-family: Arial, sans-serif; color: #3a3a3a; line-height: 1.15; }
      .fs-brand-center small { display: block; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.24em; }
      .fs-brand-center span { display: block; font-size: 13pt; font-weight: 900; letter-spacing: 0.1em; }

      .fs-top { display: grid; grid-template-columns: 1fr 3.55in; gap: 7px; margin-bottom: 7px; }
      .fs-name { font-size: 16pt; border-bottom: 1px solid #999; padding-bottom: 1px; }
      .fs-name-label { color: #666; font-size: 7pt; font-family: Arial, sans-serif; margin-bottom: 6px; }
      .fs-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
      .fs-field { min-height: 26px; }
      .fs-value { font-size: 11pt; min-height: 15px; border-bottom: 1px solid #999; }
      .fs-label { color: #666; font-size: 7pt; font-family: Arial, sans-serif; padding-top: 1px; }
      .fs-adv-top { display: grid; grid-template-columns: 1fr 0.62in; gap: 8px; align-items: center; margin-bottom: 8px; }
      .fs-victories { display: flex; align-items: center; gap: 6px; font-family: Arial, sans-serif; font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; }
      .fs-vic-track { display: flex; flex: 1; height: 0.2in; border: 1.5px solid #444; border-radius: 6px; overflow: hidden; background: #fff; }
      .fs-vic-track span { flex: 1; border-right: 1px solid #aaa; }
      .fs-vic-track span:last-child { border-right: none; }
      .fs-vic-track span.fs-vic-on { background: #444; }
      .fs-level { text-align: center; border-left: 1.5px solid #444; padding-left: 6px; font-family: Arial, sans-serif; }
      .fs-level small { font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; }
      .fs-level strong { display: block; font-family: Georgia, serif; font-size: 24pt; font-weight: 400; line-height: 1; }
      .fs-adv-track { display: flex; gap: 10px; }
      .fs-pill { flex: 1; border: 1px solid #555; border-radius: 8px; box-shadow: inset 0 0 0 2px #fff, inset 0 0 0 3px #555; text-align: center; padding: 3px 2px 4px; }
      .fs-pill small { display: block; font-family: Arial, sans-serif; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.14em; }
      .fs-pill span { font-size: 14pt; }

      .fs-main-row { display: grid; grid-template-columns: 2.55in 1.8in 1.05in 1.1in 1.15in; gap: 0; padding: 8px 4px; margin-bottom: 7px; }
      .fs-main-row > div { padding: 0 7px; }
      .fs-main-row > div + div { border-left: 1px solid #ccc; }
      .fs-main-row .fs-section-title h2 { font-size: 8pt; letter-spacing: 0.12em; }
      .fs-main-row .fs-rule { margin-bottom: 5px; }
      .fs-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
      .fs-stat { text-align: center; }
      .fs-stat-label { font-family: Arial, sans-serif; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
      .fs-stat-label b { background: #222; color: #fff; padding: 0 2px; margin-right: 1px; }
      .fs-stat-value { width: 0.4in; height: 0.4in; margin: 4px auto 0; border: 1px solid #444; border-radius: 6px; box-shadow: inset 0 0 0 2px #fff, inset 0 0 0 3px #444; font-size: 16pt; line-height: 0.38in; }
      .fs-vitals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 8px; }
      .fs-vital-value { border: 1px solid #555; border-radius: 4px; min-height: 0.22in; text-align: center; font-size: 10pt; line-height: 0.22in; }
      .fs-vital-label { text-align: center; font-family: Arial, sans-serif; font-size: 6.5pt; color: #444; padding-top: 1px; }
      .fs-stamina-row { display: flex; gap: 6px; align-items: flex-start; }
      .fs-shield { width: 0.62in; height: 0.68in; flex: 0 0 auto; }
      .fs-shield-label { text-align: center; font-size: 7pt; color: #444; }
      .fs-winded { font-size: 7.5pt; padding-top: 4px; }
      .fs-winded div { margin-bottom: 4px; }
      .fs-winded b { font-size: 8.5pt; }
      .fs-under-row { display: flex; justify-content: space-around; margin-top: 5px; font-size: 7.5pt; color: #444; text-align: center; }
      .fs-under-row b { display: block; font-size: 10pt; color: #1a1a1a; border-bottom: 1px solid #777; padding: 0 8px; }
      .fs-circle { width: 0.55in; height: 0.55in; margin: 2px auto; border: 2px solid #3a3a3a; border-radius: 50%; text-align: center; font-size: 15pt; line-height: 0.52in; }
      .fs-hex { display: block; width: 0.58in; height: 0.58in; margin: 2px auto; }
      .fs-resource-label { text-align: center; font-size: 11pt; border-bottom: 1px solid #999; margin: 0 4px; }
      .fs-resource-name { text-align: center; font-family: Arial, sans-serif; font-size: 6.5pt; color: #666; }
      .fs-square { width: 0.42in; height: 0.42in; margin: 2px auto 5px; border: 2px solid #3a3a3a; text-align: center; font-size: 14pt; line-height: 0.4in; }
      .fs-surge-note { font-size: 7pt; color: #333; margin: 2px 0; }

      .fs-overview-grid { display: grid; grid-template-columns: 2.95in 2.95in 1.78in; gap: 7px; align-items: start; margin-bottom: 7px; }
      .fs-overview-grid > * { min-height: 1in; }
      .fs-equipment-line { border: 1px solid #777; border-radius: 8px; margin: 6px 0; padding: 3px 4px; text-align: center; }
      .fs-equipment-line small { color: #555; font-size: 7pt; font-family: Arial, sans-serif; }
      .fs-kit-two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .fs-kit-two .fs-equipment-line { margin: 0 0 6px; }
      .fs-kit-mods { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin: 2px 0 6px; }
      .fs-kit-damage { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid #ccc; padding-top: 5px; margin-bottom: 6px; }
      .fs-kit-damage-title { text-align: center; font-family: Arial, sans-serif; font-size: 7pt; font-weight: 700; letter-spacing: 0.06em; margin-bottom: 2px; }
      .fs-kit-damage-row { display: flex; justify-content: space-around; }
      .fs-kit-tier { text-align: center; }
      .fs-kit-tier b { display: block; font-size: 11pt; font-weight: 400; }
      .fs-kit-tier .fs-tier-band { display: inline-block; padding: 0 4px; }
      .fs-condition-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
      .fs-condition-table th { font-weight: 400; font-family: Arial, sans-serif; font-size: 7.5pt; border-bottom: 1px solid #777; padding: 1px 4px; text-align: left; }
      .fs-condition-table td { padding: 2.5px 4px; min-height: 14px; }
      .fs-condition-table tr:nth-child(odd) td { background: #ececec; }
      .fs-footnote { font-size: 7pt; color: #444; margin: 4px 0 6px; }
      .fs-imm-weak { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border-top: 1px solid #bbb; padding-top: 5px; text-align: center; }
      .fs-imm-weak b { display: block; font-family: Arial, sans-serif; font-size: 7.5pt; }
      .fs-potency-row { display: flex; gap: 5px; margin-bottom: 8px; }
      .fs-potency-row .fs-pill span { font-size: 12pt; }
      .fs-side-note h3 { display: flex; align-items: center; gap: 6px; font-size: 8pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 8px 0 3px; }
      .fs-side-note h3::before, .fs-side-note h3::after { content: ""; flex: 1; border-top: 1px solid #999; }
      .fs-side-note p { font-size: 8pt; margin: 3px 0; }

      .fs-features-two { column-count: 2; column-gap: 14px; column-rule: 1px solid #ccc; }
      .fs-feature { break-inside: avoid; margin: 0 0 8px; }
      .fs-feature h3 { margin: 0 0 2px; font-size: 9.5pt; }
      .fs-feature p { margin: 2px 0; }
      .fs-flavor { font-style: italic; margin: 2px 0 4px; }
      .fs-chipline { display: inline-block; color: #444; background: #eee; border: 1px solid #ccc; border-radius: 2px; padding: 0 4px; font-size: 7.5pt; margin: 1px 3px 1px 0; }

      .fs-culture-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1.2fr; gap: 8px; }
      .fs-inner-box { border: 1px solid #bbb; border-radius: 4px; padding: 5px 7px; }
      .fs-center-value { text-align: center; font-size: 10.5pt; border-bottom: 1px solid #999; margin: 2px 8px 4px; min-height: 15px; }
      .fs-inner-box ul { margin: 2px 0; padding-left: 16px; }
      .fs-mid-grid { display: grid; grid-template-columns: 2.55in 2.55in 2.6in; gap: 7px; margin-top: 7px; align-items: start; }
      .fs-name-pill { border: 1px solid #555; border-radius: 10px; text-align: center; padding: 3px; margin: 0 12px 8px; font-size: 10.5pt; min-height: 24px; }
      .fs-skill-note { text-align: center; font-size: 7.5pt; color: #555; margin: 0 0 6px; }
      .fs-skill-group { break-inside: avoid; margin-bottom: 9px; }
      .fs-skill-group h3 { font-size: 9pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; border-bottom: 2px solid #555; padding-bottom: 1px; margin: 0 0 5px; }
      .fs-skill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px; }
      .fs-check-line { break-inside: avoid; margin-bottom: 3px; font-size: 8.5pt; }
      .fs-check-line span { display: inline-block; width: 13px; color: #555; }
      .fs-check-line span.fs-check-on { color: #1a1a1a; }

      .fs-abilities { column-count: 3; column-gap: 8px; }
      .fs-ability-card { position: relative; break-inside: avoid; background: #fff; border: 2.5px solid #999; border-radius: 10px; padding: 12px 9px 8px; margin: 0 0 8px; font-size: 8.5pt; }
      .fs-ability-kind { position: absolute; top: -7px; left: 0; right: 0; text-align: center; font-family: Arial, sans-serif; font-size: 7pt; font-weight: 800; letter-spacing: 0.14em; }
      .fs-ability-kind::after { content: ""; }
      .fs-tone-red .fs-ability-kind, .fs-tone-red .fs-flavor, .fs-tone-red .fs-action-type, .fs-tone-red .fs-cost { color: #e01b24; }
      .fs-tone-blue .fs-ability-kind, .fs-tone-blue .fs-flavor, .fs-tone-blue .fs-action-type, .fs-tone-blue .fs-cost { color: #00a9e0; }
      .fs-tone-green .fs-ability-kind, .fs-tone-green .fs-flavor, .fs-tone-green .fs-action-type, .fs-tone-green .fs-cost { color: #00a651; }
      .fs-tone-purple .fs-ability-kind, .fs-tone-purple .fs-flavor, .fs-tone-purple .fs-action-type, .fs-tone-purple .fs-cost { color: #a2119e; }
      .fs-tone-gray .fs-ability-kind, .fs-tone-gray .fs-flavor, .fs-tone-gray .fs-action-type, .fs-tone-gray .fs-cost { color: #555; }
      .fs-tone-red { border-color: #e01b24; } .fs-tone-red .fs-card-rule { color: #e01b24; }
      .fs-tone-blue { border-color: #00a9e0; } .fs-tone-blue .fs-card-rule { color: #00a9e0; }
      .fs-tone-green { border-color: #00a651; } .fs-tone-green .fs-card-rule { color: #00a651; }
      .fs-tone-purple { border-color: #a2119e; } .fs-tone-purple .fs-card-rule { color: #a2119e; }
      .fs-tone-gray { border-color: #999; } .fs-tone-gray .fs-card-rule { color: #777; }
      .fs-ability-kind { background: #fff; width: fit-content; margin: 0 auto; padding: 0 8px; }
      .fs-ability-card h3 { text-align: center; margin: 0; padding: 0 0.3in; font-size: 10.5pt; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #1a1a1a; }
      .fs-card-rule { position: relative; height: 3px; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; margin: 3px 0 5px; }
      .fs-card-rule::after { content: "◆"; position: absolute; left: 50%; top: -3px; transform: translateX(-50%); background: #fff; font-size: 5.5pt; line-height: 9px; padding: 0 3px; }
      .fs-cost { position: absolute; right: 5px; top: 8px; width: 0.3in; height: 0.3in; border: 1.5px solid currentColor; border-radius: 50%; text-align: center; }
      .fs-cost b { display: block; font-size: 9pt; line-height: 1.5; }
      .fs-cost small { display: block; font-size: 4.5pt; font-family: Arial, sans-serif; letter-spacing: 0.08em; margin-top: -3px; }
      .fs-keyword-row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
      .fs-keywords { font-weight: 700; color: #1a1a1a; }
      .fs-action-type { font-weight: 700; white-space: nowrap; }
      .fs-range-row { display: flex; justify-content: space-between; gap: 6px; margin: 1px 0 3px; color: #1a1a1a; }
      .fs-card-line { margin: 3px 0; color: #1a1a1a; }
      .fs-test { margin-top: 4px; color: #1a1a1a; }
      .fs-power-roll { font-weight: 700; margin-bottom: 2px; }
      .fs-test p, .fs-card-text p { margin: 2px 0; }
      .fs-card-text { color: #1a1a1a; margin-top: 3px; }
      .fs-tier { display: flex; gap: 5px; margin: 3px 0 3px 6px; align-items: flex-start; }
      .fs-tier-band { flex: 0 0 33px; border: 1px solid #1a1a1a; border-radius: 7px; text-align: center; font-size: 6.5pt; font-family: Arial, sans-serif; font-weight: 800; color: #1a1a1a; background: #fff; line-height: 11px; margin-top: 1px; }

      .fs-inventory-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
      .fs-inventory-grid > div + div { border-left: 1px solid #ccc; }
      .fs-inventory-col { padding: 0 8px; }
      .fs-inventory-item { break-inside: avoid; padding: 4px 0; font-size: 8.5pt; }
      .fs-inventory-item p { margin: 2px 0; }
      .fs-empty-box { min-height: 1.4in; }
      .fs-reference-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; align-items: start; }
      @media screen { body { padding: 16px; } .fs-page { background: #e6e6e6; margin-bottom: 16px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); } }
    </style>
  </head>
  <body>
    <section class="fs-page">
      <div class="fs-brand">
        <div class="fs-brand-center"><small>POWERED BY</small><span>DRAW STEEL</span><small>MADE WITH FORGE STEEL</small></div>
      </div>
      <div class="fs-top">
        <div class="fs-box">
          <div class="fs-name">${escapeHtml(printableValue(hero.name, "Unnamed Hero"))}</div>
          <div class="fs-name-label">Character Name</div>
          <div class="fs-field-grid">
            ${fieldBox("Ancestry", hero.ancestry)}
            ${fieldBox("Class", hero.class)}
            ${fieldBox("Career", hero.career?.career)}
            ${fieldBox("Subclass (Class Act)", hero.classTrack)}
          </div>
        </div>
        <div class="fs-box">
          <div class="fs-adv-top">
            <div class="fs-victories"><span>VICTORIES:</span><div class="fs-vic-track">${victoryCells}</div></div>
            <div class="fs-level"><small>LEVEL</small><strong>${escapeHtml(printableValue(hero.level, "1"))}</strong></div>
          </div>
          <div class="fs-adv-track">
            <div class="fs-pill"><small>WEALTH</small><span>${escapeHtml(printableValue(hero.wealth, "0"))}</span></div>
            <div class="fs-pill"><small>RENOWN</small><span>${escapeHtml(printableValue(hero.renown, "0"))}</span></div>
            <div class="fs-pill"><small>XP</small><span>${escapeHtml(printableValue(hero.xp, "0"))}</span></div>
          </div>
        </div>
      </div>
      <div class="fs-main-row fs-box">
        <div>
          <div class="fs-stats">
            ${statBox("IGHT", "M", hero.stats?.might)}
            ${statBox("GILITY", "A", hero.stats?.agility)}
            ${statBox("EASON", "R", hero.stats?.reason)}
            ${statBox("NTUITION", "I", hero.stats?.intuition)}
            ${statBox("RESENCE", "P", hero.stats?.presence)}
          </div>
          <div class="fs-vitals">
            ${vitalMini("Size", vitals.size)}
            ${vitalMini("Speed", vitals.speed)}
            ${vitalMini("Disengage", vitals.disengage)}
            ${vitalMini("Stability", vitals.stability)}
          </div>
        </div>
        <div>
          ${sectionTitle("STAMINA")}
          <div class="fs-stamina-row">
            <div>
              ${shieldSvg(vitals.currentStamina)}
              <div class="fs-shield-label">Current</div>
            </div>
            <div class="fs-winded">
              <div>◇ <b>Winded</b><br>&le; ${escapeHtml(String(windedValue))}</div>
              <div>◇ <b>Dying</b><br>0 to &minus;${escapeHtml(String(windedValue))}</div>
            </div>
          </div>
          <div class="fs-under-row">
            <div><b>&nbsp;</b>Temporary</div>
            <div><b>${escapeHtml(printableValue(vitals.staminaMax, "0"))}</b>Max</div>
          </div>
        </div>
        <div>
          ${sectionTitle("RECOVERIES")}
          <div class="fs-circle">${escapeHtml(printableValue(vitals.currentRecoveries))}</div>
          <div class="fs-under-row">
            <div><b>${escapeHtml(staminaMax > 0 ? String(Math.floor(staminaMax / 3)) : "-")}</b>Stamina</div>
            <div><b>${escapeHtml(printableValue(vitals.recoveriesMax, "0"))}</b>Max</div>
          </div>
        </div>
        <div>
          ${sectionTitle("HEROIC RESOURCE")}
          ${hexSvg(hero.resource?.value)}
          <div class="fs-resource-label">${escapeHtml(resourceTitle)}</div>
          <div class="fs-resource-name">Name</div>
        </div>
        <div>
          ${sectionTitle("SURGES")}
          <div class="fs-square">${escapeHtml(printableValue(hero.surges))}</div>
          <div class="fs-surge-note">1 Surge = Damage <b>+${escapeHtml(String(maxStat))}</b></div>
          <div class="fs-surge-note">2 Surges = Potency +1</div>
        </div>
      </div>
      <div class="fs-overview-grid">
        <div class="fs-box">
          ${sectionTitle("EQUIPMENT AND MODIFIERS")}
          ${kitHasData ? `
            <div class="fs-equipment-line">${escapeHtml(printableValue(kit.name))}<br><small>Kit</small></div>
            <div class="fs-kit-two">
              <div class="fs-equipment-line">${escapeHtml(printableValue(kit.weapon))}<br><small>Weapon / Implement</small></div>
              <div class="fs-equipment-line">${escapeHtml(printableValue(kit.armor))}<br><small>Armor / Ward</small></div>
            </div>
            <div class="fs-kit-mods">
              ${vitalMini("Speed", kit.speed)}
              ${vitalMini("Disengage", kit.disengage)}
              ${vitalMini("Stamina", kit.stamina)}
              ${vitalMini("Stability", kit.stability)}
              ${vitalMini("Melee Dist.", kit.meleeDistance)}
              ${vitalMini("Ranged Dist.", kit.rangedDistance)}
            </div>
            ${kitHasMeleeDamage || kitHasRangedDamage ? `
              <div class="fs-kit-damage">
                <div>
                  <div class="fs-kit-damage-title">Melee Damage Bonus</div>
                  <div class="fs-kit-damage-row">${kitDamageTiers("melee")}</div>
                </div>
                <div>
                  <div class="fs-kit-damage-title">Ranged Damage Bonus</div>
                  <div class="fs-kit-damage-row">${kitDamageTiers("ranged")}</div>
                </div>
              </div>
            ` : ""}
          ` : ""}
          ${(hero.bonuses || []).map((bonus) => `<div class="fs-equipment-line">${renderRichText(bonus.bonus || "")}<br><small>${renderRichText(bonus.source || "")}</small></div>`).join("") || (kitHasData ? "" : '<div class="fs-empty-box"></div>')}
        </div>
        <div class="fs-box">
          ${sectionTitle("CONDITIONS")}
          <table class="fs-condition-table"><thead><tr><th>Condition</th><th style="text-align:center;">End of Turn</th><th style="text-align:center;">Save Ends*</th></tr></thead><tbody>
            ${conditions.map((condition) => `<tr><td>${escapeHtml(condition)}&nbsp;</td><td style="text-align:center;">${conditionMark(condition, "end-of-turn")}</td><td style="text-align:center;">${conditionMark(condition, "save-ends")}</td></tr>`).join("")}
          </tbody></table>
          <p class="fs-footnote">* Save Ends = <b>6</b> or higher on 1d10 at the end of your turn removes the effect.</p>
          <div class="fs-imm-weak">
            <div><b>Immunities</b>${escapeHtml(immunities.join(", ") || "None")}</div>
            <div><b>Weaknesses</b>${escapeHtml(vulnerabilities.join(", ") || "None")}</div>
          </div>
        </div>
        <div class="fs-box fs-side-note">
          ${sectionTitle("POTENCY")}
          <div class="fs-potency-row">
            <div class="fs-pill"><small>WEAK</small><span>${escapeHtml(String(maxStat - 2))}</span></div>
            <div class="fs-pill"><small>AVERAGE</small><span>${escapeHtml(String(maxStat - 1))}</span></div>
            <div class="fs-pill"><small>STRONG</small><span>${escapeHtml(String(maxStat))}</span></div>
          </div>
          <h3>Your Turn</h3>
          <p>Each creature can take a move action, a maneuver, and a main action on their turn — in any order.</p>
          <p>You can also take <b>one triggered action per round</b> when the trigger happens. There is no limit to the number of free triggered actions you can take.</p>
        </div>
      </div>
      <div class="fs-box">
        ${sectionTitle("CLASS FEATURES")}
        <div class="fs-features-two">${(sheetState.features || []).slice(0, 8).map(renderPrintableFeature).join("") || '<div class="fs-empty-box"></div>'}</div>
      </div>
    </section>

    <section class="fs-page">
      <div class="fs-box" style="margin-bottom:7px;">
        ${sectionTitle("CULTURE")}
        <div class="fs-culture-grid">
          <div class="fs-inner-box">${miniHeading("Culture Name")}<div class="fs-center-value">${escapeHtml(printableValue(hero.culture?.culture))}</div></div>
          <div class="fs-inner-box">${miniHeading("Environment")}<div class="fs-center-value">${escapeHtml(printableValue(hero.culture?.environment))}</div></div>
          <div class="fs-inner-box">${miniHeading("Organization")}<div class="fs-center-value">${escapeHtml(printableValue(hero.culture?.organization))}</div>${miniHeading("Upbringing")}<div class="fs-center-value">${escapeHtml(printableValue(hero.culture?.upbringing))}</div></div>
          <div class="fs-inner-box">${miniHeading("Languages")}<ul>${languages.map((lang) => `<li>${escapeHtml(lang)}</li>`).join("") || "<li>&nbsp;</li>"}</ul></div>
        </div>
      </div>
      <div class="fs-mid-grid">
        <div>
          <div class="fs-box">
            ${sectionTitle("CAREER")}
            <div class="fs-name-pill">${escapeHtml(printableValue(hero.career?.career))}</div>
            ${miniHeading("Inciting Incident")}
            <div class="fs-center-value">${escapeHtml(printableValue(hero.career?.incitingIncident))}</div>
          </div>
          <div class="fs-box" style="margin-top:7px;">${sectionTitle("COMMON THINGS")}${commonThings.map(renderPrintableCommonThing).join("") || '<div class="fs-empty-box"></div>'}</div>
        </div>
        <div>
          <div class="fs-box">
            ${sectionTitle("COMPLICATION")}
            <div class="fs-name-pill">${escapeHtml(printableValue(hero.complication))}</div>
          </div>
          <div class="fs-box" style="margin-top:7px;">${sectionTitle("ANCESTRY TRAITS AND PERKS")}${(sheetState.features || []).slice(8).map(renderPrintableFeature).join("") || '<div class="fs-empty-box"></div>'}</div>
        </div>
        <div class="fs-box">
          ${sectionTitle("SKILLS")}
          <p class="fs-skill-note">Have 1+ skills that apply to a test? +2 bonus</p>
          ${renderPrintableSkills()}
        </div>
      </div>
    </section>

    <section class="fs-page">
      <div class="fs-abilities">${actions.map(({ action, type }) => renderPrintableActionCard(action, type)).join("") || '<div class="fs-box fs-empty-box"></div>'}</div>
    </section>

    <section class="fs-page">
      <div class="fs-box">
        ${sectionTitle("INVENTORY")}
        <div class="fs-inventory-grid">${renderPrintableInventory(inventoryData)}</div>
      </div>
      <div class="fs-reference-grid">
        <div class="fs-box">${sectionTitle("HIRELINGS")}${(hero.hirelings || []).map((hireling) => `<p><b>${escapeHtml(hireling.name || "Hireling")}</b> ${escapeHtml((hireling.skills || []).join(", "))}<br>${renderRichText(hireling.notes || "")}</p>`).join("") || '<div class="fs-empty-box"></div>'}</div>
        <div class="fs-box">${sectionTitle("NOTES")}<div class="fs-empty-box"></div></div>
      </div>
    </section>
  </body>
  </html>`;
  }


  return { buildSkillExportPayload, buildPrintableCharacterSheetHtml };
}

export function sheetExportFileBase(sheet, character) {
  return String(sheet?.hero?.name || character || 'character').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
}

export function downloadTextFile(filename, content, mimeType = 'application/json') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
