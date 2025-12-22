const SKILL_GROUPS = {
  "Crafting Skills": [
    "Alchemy",
    "Architecture",
    "Blacksmithing",
    "Carpentry",
    "Cooking",
    "Fletching",
    "Forgery",
    "Jewelry",
    "Mechanics",
    "Tailoring",
  ],
  "Exploration Skills": [
    "Climb",
    "Drive",
    "Endurance",
    "Gymnastics",
    "Heal",
    "Jump",
    "Lift",
    "Navigate",
    "Ride",
    "Swim",
    "Track",
  ],
  "Interpersonal Skills": [
    "Brag",
    "Empathize",
    "Flirt",
    "Gamble",
    "Handle Animals",
    "Interrogate",
    "Intimidate",
    "Lead",
    "Lie",
    "Music",
    "Perform",
    "Persuade",
    "Read Person",
  ],
  "Intrigue Skills": [
    "Alertness",
    "Conceal Object",
    "Disguise",
    "Eavesdrop",
    "Escape Artist",
    "Hide",
    "Pick Lock",
    "Pick Pocket",
    "Sabotage",
    "Search",
  ],
  "Lore Skills": [
    "Culture",
    "Criminal Underworld",
    "History",
    "Magic",
    "Monsters",
    "Nature",
    "Psionics",
    "Religion",
    "Rumors",
    "Society",
    "Strategy",
    "Timescape",
  ],
};

const ALL_SKILLS = Object.values(SKILL_GROUPS).flat();

const DEFAULT_CULTURE_FIELDS = {
  culture: "",
  environment: "",
  organization: "",
  upbringing: "",
};

const DEFAULT_CAREER_FIELDS = {
  career: "",
  incitingIncident: "",
};

const DEFAULT_VITALS = {
  size: "",
  speed: "",
  stability: "",
  disengage: "",
  save: "",
  staminaMax: 0,
  recoveriesMax: 0,
  currentStamina: 0,
  currentRecoveries: 0,
  recoveryValue: "",
};

const defaultSheet = {
  hero: {
    name: "",
    level: 1,
    class: "",
    complication: "",
    ancestry: "",
    culture: { ...DEFAULT_CULTURE_FIELDS },
    career: { ...DEFAULT_CAREER_FIELDS },
    classTrack: "",
    wealth: "",
    renown: "",
    xp: "",
    victories: "",
    surges: "",
    resource: { title: "Resource", value: "" },
    heroTokens: [false, false],
    stats: {
      might: 0,
      agility: 0,
      reason: 0,
      intuition: 0,
      presence: 0,
    },
    vitals: { ...DEFAULT_VITALS },
  },
  sidebar: {
    lists: {
      common: [],
      weaknesses: [],
      vulnerabilities: [],
      languages: [],
    },
    skills: {},
    resource: { title: "Resource", text: "" },
  },
  features: [],
  actions: {
    mains: [],
    maneuvers: [],
    triggers: [],
    freeStrikes: [],
  },
};

const ACTION_CONTAINER_IDS = {
  mains: "mains-pane",
  maneuvers: "maneuvers-pane",
  triggers: "triggers-pane",
  freeStrikes: "free-strikes-pane",
};

const TEST_TIERS = [
  { key: "low", label: "(\u2264 11)" },
  { key: "mid", label: "(12-16)" },
  { key: "high", label: "(17+)" },
];

const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence"];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultTestTier() {
  return {
    damage: "",
    damageType: "",
    notes: "",
    attributeCheck: {
      enabled: false,
      attribute: "",
      threshold: "",
      effect: "",
    },
  };
}

function defaultTest() {
  return {
    id: createId("test"),
    label: "",
    rollMod: "",
    tiers: {
      low: defaultTestTier(),
      mid: defaultTestTier(),
      high: defaultTestTier(),
    },
    additionalEffect: "",
  };
}

function normalizeTestTier(tier = {}) {
  return {
    damage: tier.damage || "",
    damageType: tier.damageType || "",
    notes: tier.notes || "",
    attributeCheck: {
      enabled: Boolean(tier.attributeCheck?.enabled),
      attribute: tier.attributeCheck?.attribute || "",
      threshold: tier.attributeCheck?.threshold || "",
      effect: tier.attributeCheck?.effect || "",
    },
  };
}

function normalizeTestTiers(tiers = {}) {
  const isArray = Array.isArray(tiers);
  return {
    low: normalizeTestTier(isArray ? tiers[0] : tiers.low),
    mid: normalizeTestTier(isArray ? tiers[1] : tiers.mid),
    high: normalizeTestTier(isArray ? tiers[2] : tiers.high),
  };
}

function normalizeTest(test = {}) {
  return {
    id: test.id || createId("test"),
    label: test.label || "",
    rollMod: test.rollMod ?? "",
    tiers: normalizeTestTiers(test.tiers || {}),
    additionalEffect: test.additionalEffect || "",
  };
}

function normalizeIdentityGroup(value, defaults) {
  if (typeof value === "string") {
    const primaryKey = Object.keys(defaults)[0];
    return { ...defaults, [primaryKey]: value };
  }

  if (!value || typeof value !== "object") {
    return { ...defaults };
  }

  return { ...defaults, ...value };
}

function normalizeVitals(vitals = {}) {
  const normalized = { ...DEFAULT_VITALS };
  if (!vitals || typeof vitals !== "object") return normalized;

  const legacyStamina = vitals.stamina;
  const legacyRecoveries = vitals.recoveries;

  normalized.size = vitals.size ?? normalized.size;
  normalized.speed = vitals.speed ?? normalized.speed;
  normalized.stability = vitals.stability ?? normalized.stability;
  normalized.disengage = vitals.disengage ?? normalized.disengage;
  normalized.save = vitals.save ?? normalized.save;
  normalized.recoveryValue = vitals.recoveryValue ?? normalized.recoveryValue;

  const staminaMax = vitals.staminaMax ?? legacyStamina;
  const recoveriesMax = vitals.recoveriesMax ?? legacyRecoveries;

  normalized.staminaMax = staminaMax === "" ? "" : Number(staminaMax || 0);
  normalized.recoveriesMax = recoveriesMax === "" ? "" : Number(recoveriesMax || 0);
  normalized.currentStamina =
    vitals.currentStamina === ""
      ? ""
      : Number(vitals.currentStamina ?? legacyStamina ?? 0);
  normalized.currentRecoveries =
    vitals.currentRecoveries === ""
      ? ""
      : Number(vitals.currentRecoveries ?? legacyRecoveries ?? 0);

  return normalized;
}

function normalizeSkillsState(skills = {}) {
  const normalized = {};
  if (!skills || typeof skills !== "object") return normalized;

  Object.entries(skills).forEach(([skill, value]) => {
    if (typeof value === "string") {
      normalized[skill] = { level: value, bonus: "" };
      return;
    }

    if (value && typeof value === "object") {
      normalized[skill] = {
        level: value.level || "Untrained",
        bonus: value.bonus ?? "",
      };
    }
  });

  return normalized;
}

function convertLegacyEffectsToTests(effects = []) {
  return effects.map((effect) => {
    const test = defaultTest();
    test.label = effect?.label || "";
    test.additionalEffect = effect?.text || "";
    return test;
  });
}

let sheetState = deepClone(defaultSheet);
let activeCharacter = "";

function mergeWithDefaults(data) {
  const merged = deepClone(defaultSheet);
  if (!data || typeof data !== "object") return merged;

  const inputHero = data.hero || {};
  merged.hero = { ...merged.hero, ...inputHero };
  merged.hero.resource = { ...merged.hero.resource, ...(inputHero.resource || {}) };
  merged.hero.stats = { ...merged.hero.stats, ...(inputHero.stats || {}) };
  merged.hero.vitals = normalizeVitals(inputHero.vitals);
  merged.hero.culture = normalizeIdentityGroup(inputHero.culture, DEFAULT_CULTURE_FIELDS);
  merged.hero.career = normalizeIdentityGroup(inputHero.career, DEFAULT_CAREER_FIELDS);
  merged.hero.heroTokens = [
    Boolean(inputHero.heroTokens?.[0]),
    Boolean(inputHero.heroTokens?.[1]),
  ];

  merged.sidebar = { ...merged.sidebar, ...(data.sidebar || {}) };
  merged.sidebar.lists = { ...merged.sidebar.lists, ...(data.sidebar?.lists || {}) };
  merged.sidebar.skills = normalizeSkillsState(data.sidebar?.skills);
  merged.sidebar.resource = {
    ...merged.sidebar.resource,
    ...(data.sidebar?.resource || {}),
  };

  merged.features = Array.isArray(data.features) ? data.features : [];
  merged.actions = { ...merged.actions, ...(data.actions || {}) };
  ["mains", "maneuvers", "triggers", "freeStrikes"].forEach((key) => {
    merged.actions[key] = (merged.actions[key] || []).map((action) => ({
      id: action.id || createId("action"),
      name: action.name || "",
      actionLabel: action.actionLabel || "",
      tags: Array.isArray(action.tags) ? action.tags : [],
      range: action.range || "",
      target: action.target || "",
      speed: action.speed || "",
      cost: action.cost || "",
      description: action.description || "",
      tests: Array.isArray(action.tests)
        ? action.tests.map(normalizeTest)
        : convertLegacyEffectsToTests(action.effects).map(normalizeTest),
    }));
  });

  merged.features = merged.features.map((feature) => ({
    id: feature.id || createId("feature"),
    title: feature.title || "",
    tags: Array.isArray(feature.tags) ? feature.tags : [],
    text: feature.text || "",
  }));

  return merged;
}

function setByPath(path, value) {
  const parts = path.split(".");
  let current = sheetState;
  while (parts.length > 1) {
    const part = parts.shift();
    if (!(part in current)) current[part] = {};
    current = current[part];
  }
  current[parts[0]] = value;
}

function getValue(path) {
  const parts = path.split(".");
  let current = sheetState;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return "";
    }
  }
  return current ?? "";
}

function renderHeroPane() {
  const hero = sheetState.hero;
  const pane = document.getElementById("hero-pane");
  const statCard = (label, key) => `
    <div class="stat-card">
      <div class="card__label">${label}</div>
      <div class="card__value display-value">${hero.stats[key] ?? 0}</div>
      <input class="edit-field" type="number" data-model="hero.stats.${key}" value="${hero.stats[key] ?? 0}" />
    </div>
  `;

  const vitalField = (label, path, type = "text") => {
    const value = getValue(path);
    return `
    <div class="field-card">
      <label>${label}</label>
      <div class="display-value">${value ?? ""}</div>
      <input class="edit-field" type="${type}" data-model="${path}" value="${value ?? ""}" />
    </div>
  `;
  };

  const identityField = (label, path) => {
    const value = getValue(path);
    return `
      <div class="field-card">
        <label>${label}</label>
        <div class="display-value">${value || ""}</div>
        <input class="edit-field" type="text" data-model="${path}" value="${value || ""}" />
      </div>
    `;
  };

  const detailGroup = (title, entries, basePath) => `
    <div class="field-card detail-card">
      <label>${title}</label>
      <div class="detail-grid">
        ${entries
          .map(({ label, key }) => {
            const path = `${basePath}.${key}`;
            const value = getValue(path);
            return `
              <div class="detail-item">
                <div class="detail-item__label">${label}</div>
                <div class="display-value">${value || ""}</div>
                <input class="edit-field" type="text" data-model="${path}" value="${value || ""}" />
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  pane.innerHTML = `
    <section class="hero-grid">
      <div class="identity">
        <div class="field-card large">
          <label>Name</label>
          <div class="display-value">${hero.name || "Unnamed Hero"}</div>
          <input class="edit-field" type="text" data-model="hero.name" value="${hero.name || ""}" />
        </div>
        <div class="field-card">
          <label>Level</label>
          <div class="display-value">${hero.level || ""}</div>
          <input class="edit-field" type="number" min="1" data-model="hero.level" value="${hero.level || ""}" />
        </div>
        <div class="field-card">
          <label>Class</label>
          <div class="display-value">${hero.class || ""}</div>
          <input class="edit-field" type="text" data-model="hero.class" value="${hero.class || ""}" />
        </div>
        <div class="field-card">
          <label>Class Track</label>
          <div class="display-value">${hero.classTrack || ""}</div>
          <input class="edit-field" type="text" data-model="hero.classTrack" value="${hero.classTrack || ""}" />
        </div>
      </div>

      <div class="stat-grid">
        ${statCard("Might", "might")}
        ${statCard("Agility", "agility")}
        ${statCard("Reason", "reason")}
        ${statCard("Intuition", "intuition")}
        ${statCard("Presence", "presence")}
      </div>

      <div class="quick-resources">
        ${identityField("Wealth", "hero.wealth")}
        ${identityField("Renown", "hero.renown")}
        ${identityField("XP", "hero.xp")}
        ${identityField("Victories", "hero.victories")}
        ${identityField("Surges", "hero.surges")}
        <div class="field-card">
          <label>${hero.resource.title || "Resource"}</label>
          <div class="display-value">${hero.resource.value || ""}</div>
          <input class="edit-field" type="text" data-model="hero.resource.value" value="${hero.resource.value || ""}" />
          <input class="edit-field subtle" type="text" data-model="hero.resource.title" value="${hero.resource.title || "Resource"}" placeholder="Resource Title" />
        </div>
      </div>

      <div class="vital-grid">
        ${vitalField("Size", "hero.vitals.size")}
        ${vitalField("Speed", "hero.vitals.speed")}
        ${vitalField("Stability", "hero.vitals.stability")}
        ${vitalField("Disengage", "hero.vitals.disengage")}
        ${vitalField("Save", "hero.vitals.save")}
        ${vitalField("Stamina (Full)", "hero.vitals.staminaMax", "number")}
        ${vitalField("Recoveries (Full)", "hero.vitals.recoveriesMax", "number")}
        ${vitalField("Recovery Value", "hero.vitals.recoveryValue")}
      </div>

      <div class="identity identity--secondary">
        ${identityField("Ancestry", "hero.ancestry")}
        ${detailGroup(
          "Culture",
          [
            { label: "Culture", key: "culture" },
            { label: "Environment", key: "environment" },
            { label: "Organization", key: "organization" },
            { label: "Upbringing", key: "upbringing" },
          ],
          "hero.culture"
        )}
        ${detailGroup(
          "Career",
          [
            { label: "Career", key: "career" },
            { label: "Inciting Incident", key: "incitingIncident" },
          ],
          "hero.career"
        )}
        ${identityField("Complication", "hero.complication")}
      </div>
    </section>
  `;
}

function renderListSection(containerId, title, key, placeholder) {
  const container = document.getElementById(containerId);
  const values = sheetState.sidebar.lists[key] || [];
  container.innerHTML = `
    <div class="sidebar__header">${title}</div>
    <div class="sidebar__content">
      <ul class="display-list">
        ${values.map((item) => `<li>${item}</li>`).join("") || `<li class="muted">${placeholder}</li>`}
      </ul>
      <textarea class="edit-field" rows="4" data-list="${key}" placeholder="${placeholder}">${values.join("\n")}</textarea>
    </div>
  `;
}

function renderSidebarResource() {
  const container = document.getElementById("sidebar-resource");
  const resource = sheetState.sidebar.resource;
  container.innerHTML = `
    <div class="sidebar__header">
      <div class="display-value">${resource.title || "Resource"}</div>
      <input class="edit-field" type="text" data-model="sidebar.resource.title" value="${resource.title || "Resource"}" />
    </div>
    <div class="sidebar__content">
      <p class="display-value">${resource.text || ""}</p>
      <textarea class="edit-field" rows="4" data-model="sidebar.resource.text" placeholder="Describe the resource...">${resource.text || ""}</textarea>
    </div>
  `;
}

function renderHeroTokens() {
  const container = document.getElementById("sidebar-hero-tokens");
  if (!container) return;

  container.innerHTML = `
    <div class="sidebar__header">Hero Tokens</div>
    <div class="sidebar__content token-sidebar">
      <div class="token-row">
        ${sheetState.hero.heroTokens
          .map(
            (state, index) => `
              <button class="token-dot ${state ? "is-spent" : "is-ready"}" data-token-index="${index}" aria-label="Toggle hero token ${
              index + 1
            }"></button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderBars() {
  const container = document.getElementById("sidebar-bars");
  const vitals = normalizeVitals(sheetState.hero.vitals);
  sheetState.hero.vitals = vitals;
  const staminaMax = Number(vitals.staminaMax) || 0;
  const recoveriesMax = Number(vitals.recoveriesMax) || 0;
  const currentStamina = Number(vitals.currentStamina) || 0;
  const currentRecoveries = Number(vitals.currentRecoveries) || 0;
  const recoveryValue = vitals.recoveryValue || "";
  const staminaMaxDisplay = vitals.staminaMax === "" ? "—" : staminaMax;
  const recoveriesMaxDisplay = vitals.recoveriesMax === "" ? "—" : recoveriesMax;
  const currentStaminaDisplay = vitals.currentStamina === "" ? 0 : currentStamina;
  const currentRecoveriesDisplay = vitals.currentRecoveries === "" ? 0 : currentRecoveries;

  const staminaWidth =
    staminaMax > 0 ? Math.max(0, Math.min(100, (currentStamina / staminaMax) * 100)) : 0;
  const recoveryWidth =
    recoveriesMax > 0
      ? Math.max(0, Math.min(100, (currentRecoveries / recoveriesMax) * 100))
      : 0;

  container.innerHTML = `
    <div class="sidebar__header">Vitals</div>
    <div class="sidebar__content bars">
      <div class="meter">
        <div class="meter__label">Stamina</div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--stamina" style="width:${staminaWidth}%;"></div>
        </div>
        <div class="meter__value display-value">${currentStaminaDisplay} / ${staminaMaxDisplay}</div>
        <input class="edit-field tracker-input" data-live-edit="true" type="number" min="0" data-model="hero.vitals.currentStamina" value="${vitals.currentStamina}" />
        <div class="meter__max-note">Full: ${staminaMaxDisplay}</div>
      </div>
      <div class="meter">
        <div class="meter__label">Recoveries</div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--recovery" style="width:${recoveryWidth}%;"></div>
        </div>
        <div class="meter__value display-value">${currentRecoveriesDisplay} / ${recoveriesMaxDisplay}</div>
        <input class="edit-field tracker-input" data-live-edit="true" type="number" min="0" data-model="hero.vitals.currentRecoveries" value="${vitals.currentRecoveries}" />
        <div class="meter__max-note">Full: ${recoveriesMaxDisplay}</div>
      </div>
      <div class="field-card compact">
        <label>Recovery Value</label>
        <div class="display-value">${recoveryValue}</div>
        <input class="edit-field" type="text" data-model="hero.vitals.recoveryValue" value="${recoveryValue}" />
      </div>
    </div>
  `;

  container.querySelectorAll('[data-live-edit="true"]').forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.getAttribute("data-model");
      if (!path) return;
      const value = input.type === "number" ? Number(input.value || 0) : input.value;
      setByPath(path, value);
      renderBars();
      saveSheet();
    });
  });
}

function renderSkills() {
  const container = document.getElementById("sidebar-skills");
  container.innerHTML = `<div class="sidebar__header">Skills</div>`;
  const content = document.createElement("div");
  content.classList.add("sidebar__content", "skills-list");

  const skills = normalizeSkillsState(sheetState.sidebar.skills);
  sheetState.sidebar.skills = skills;
  const skillEntries = Object.entries(skills);

  if (skillEntries.length === 0) {
    const empty = document.createElement("div");
    empty.classList.add("muted");
    empty.textContent = "Add skills to track them here.";
    content.appendChild(empty);
  } else {
    skillEntries.forEach(([skill, data]) => {
      const row = document.createElement("div");
      row.classList.add("skill-row", "skill-row--compact");
      row.setAttribute("data-skill-row", skill);
      row.innerHTML = `
        <span class="skill-row__label">${skill}</span>
        <div class="skill-row__level">
          <span class="display-value">${data.level || "Untrained"}</span>
          <select class="skill-select edit-field" data-skill="${skill}">
            <option${data.level === "Untrained" ? " selected" : ""}>Untrained</option>
            <option${data.level === "Trained" ? " selected" : ""}>Trained</option>
            <option${data.level === "Expert" ? " selected" : ""}>Expert</option>
            <option${data.level === "Master" ? " selected" : ""}>Master</option>
          </select>
        </div>
        <div class="skill-row__bonus">
          <span class="display-value">${data.bonus || "—"}</span>
          <input class="edit-field skill-bonus-input" type="text" data-skill-bonus="${skill}" value="${data.bonus || ""}" placeholder="+0" />
        </div>
        <button class="icon-btn icon-btn--danger edit-only" data-remove-skill="${skill}">Remove</button>
      `;
      content.appendChild(row);
    });
  }

  const availableSkills = ALL_SKILLS.filter((skill) => !skills[skill]);
  const addRow = document.createElement("div");
  addRow.classList.add("skill-add", "edit-only");
  addRow.innerHTML = `
    <select class="edit-field" id="add-skill-select">
      <option value="" disabled selected>${availableSkills.length ? "Select a skill" : "All skills added"}</option>
      ${availableSkills.map((skill) => `<option value="${skill}">${skill}</option>`).join("")}
    </select>
    <button class="icon-btn" id="add-skill-btn" ${availableSkills.length ? "" : "disabled"}>+ Add Skill</button>
  `;
  content.appendChild(addRow);

  container.appendChild(content);

  container.querySelectorAll("[data-remove-skill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const skill = btn.getAttribute("data-remove-skill");
      delete sheetState.sidebar.skills[skill];
      renderSkills();
    });
  });

  const addBtn = container.querySelector("#add-skill-btn");
  const addSelect = container.querySelector("#add-skill-select");
  if (addBtn && addSelect) {
    addBtn.addEventListener("click", () => {
      const selected = addSelect.value;
      if (!selected) return;
      sheetState.sidebar.skills[selected] = { level: "Untrained", bonus: "" };
      renderSkills();
    });
  }
}

function renderFeatures() {
  const container = document.getElementById("features-pane");
  if (!container) return;

  if (sheetState.features.length === 0) {
    container.innerHTML = `
      <div class="placeholder">No features yet. Flip to edit mode and add your first feature.</div>
      <button class="text-btn edit-only" id="add-feature">+ Add Feature</button>
    `;
    bindFeatureAdd();
    return;
  }

  container.innerHTML = `
    <div class="card-grid">
      ${sheetState.features
        .map(
          (feature) => `
            <article class="feature-card" data-feature-id="${feature.id}">
              <header class="card-head">
                <div>
                  <div class="display-value feature-title">${feature.title || "Untitled Feature"}</div>
                  <input class="edit-field" type="text" data-field="title" value="${feature.title || ""}" />
                </div>
                <button class="icon-btn edit-only" data-remove-feature="${feature.id}" aria-label="Remove feature">✕</button>
              </header>
              <div class="chip-row display-value">
                ${(feature.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}
              </div>
              <input class="edit-field" type="text" data-field="tags" value="${(feature.tags || []).join(", ")}" placeholder="Tags" />
              <div class="feature-body display-value">${feature.text || ""}</div>
              <textarea class="edit-field" rows="4" data-field="text" placeholder="Describe the feature">${feature.text || ""}</textarea>
            </article>
          `
        )
        .join("")}
    </div>
    <button class="text-btn edit-only" id="add-feature">+ Add Feature</button>
  `;

  bindFeatureAdd();
  bindFeatureRemovals();
}

function actionDefaults(type) {
  const labelMap = {
    mains: "Main Action",
    maneuvers: "Maneuver",
    triggers: "Triggered Action",
    freeStrikes: "Free Strike",
  };
  return {
    id: createId("action"),
    name: "",
    actionLabel: labelMap[type] || "Action",
    tags: [],
    range: "",
    target: "",
    speed: "",
    cost: "",
    description: "",
    tests: [],
  };
}

function formatRoll(rollMod) {
  if (rollMod === "" || rollMod === null || rollMod === undefined) return "2d10+__";
  const mod = rollMod.toString();
  const needsPlus = !mod.startsWith("-");
  return `2d10${needsPlus ? "+" : ""}${mod}`;
}

function renderTierDisplay(tier) {
  const parts = [];
  if (tier.damage || tier.damageType) {
    const damageText = [tier.damage || "-", tier.damageType ? `(${tier.damageType})` : ""].filter(Boolean).join(" ");
    parts.push(`<div class="tier-line"><strong>Damage:</strong> ${damageText}</div>`);
  }
  if (tier.notes) {
    parts.push(`<div class="tier-line tier-line--muted">${tier.notes}</div>`);
  }
  if (tier.attributeCheck?.enabled) {
    const attribute = tier.attributeCheck.attribute || "Attribute";
    const threshold = tier.attributeCheck.threshold || "-";
    const effect = tier.attributeCheck.effect || "";
    parts.push(`<div class="tier-line"><strong>${attribute} \u2264 ${threshold}:</strong> ${effect}</div>`);
  }
  return parts.join("") || '<div class="tier-line tier-line--muted">No details set.</div>';
}

function renderTierSection(label, tier, key) {
  const attribute = tier.attributeCheck || {};
  return `
    <div class="test-tier" data-tier="${key}">
      <div class="test-tier__label">${label}</div>
      <div class="test-tier__body">
        <div class="display-value">${renderTierDisplay(tier)}</div>
        <div class="test-tier__inputs edit-field">
          <div class="tier-grid">
            <label class="tier-grid__cell">
              <span>Damage</span>
              <input type="text" class="edit-field" data-tier-field="damage" value="${tier.damage || ""}" />
            </label>
            <label class="tier-grid__cell">
              <span>Damage Type</span>
              <input type="text" class="edit-field" data-tier-field="damageType" value="${tier.damageType || ""}" />
            </label>
            <label class="tier-grid__cell tier-grid__cell--wide">
              <span>Other Info</span>
              <input type="text" class="edit-field" data-tier-field="notes" value="${tier.notes || ""}" />
            </label>
          </div>
          <div class="attribute-check ${attribute.enabled ? "is-active" : ""}">
            <label class="attribute-check__toggle">
              <input type="checkbox" class="edit-field" data-tier-field="attr-enabled" ${attribute.enabled ? "checked" : ""} />
              Attribute Check
            </label>
            <div class="attribute-check__fields ${attribute.enabled ? "" : "is-hidden"}">
              <select class="edit-field" data-tier-field="attribute">
                <option value="">Select attribute</option>
                ${ATTRIBUTES.map(
                  (attr) => `<option value="${attr}" ${attribute.attribute === attr ? "selected" : ""}>${attr}</option>`
                ).join("")}
              </select>
              <span class="attribute-check__symbol">\u2264</span>
              <input type="number" class="edit-field" data-tier-field="threshold" value="${attribute.threshold || ""}" />
              <input type="text" class="edit-field" data-tier-field="attr-effect" value="${attribute.effect || ""}" placeholder="Effect" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTest(test) {
  return `
    <div class="test" data-test-id="${test.id}">
      <header class="test__header">
        <div>
          <div class="display-value action-name">${test.label || "Test"}</div>
          <input class="edit-field" type="text" data-test-field="label" value="${test.label || ""}" placeholder="Test name" />
        </div>
        <button class="icon-btn edit-only" data-remove-test="${test.id}" aria-label="Remove test">✕</button>
      </header>
      <div class="test__roll">
        <div class="display-value">${formatRoll(test.rollMod)}</div>
        <div class="test__roll-editor edit-field">
          <span class="test__dice">2d10 +</span>
          <input type="number" class="edit-field" data-test-field="rollMod" value="${test.rollMod}" />
        </div>
      </div>
      <div class="test__tiers">
        ${TEST_TIERS.map(({ key, label }) => renderTierSection(label, test.tiers?.[key] || defaultTestTier(), key)).join("")}
      </div>
      <div class="test__additional">
        <p class="display-value">${test.additionalEffect || ""}</p>
        <textarea class="edit-field" rows="2" data-test-field="additionalEffect" placeholder="Additional effects after the test">${
          test.additionalEffect || ""
        }</textarea>
      </div>
    </div>
  `;
}

function renderActionSection(type, containerId) {
  const actions = sheetState.actions[type] || [];
  const container = document.getElementById(containerId);
  if (!container) return;

  if (actions.length === 0) {
    container.innerHTML = `
      <div class="placeholder">No ${type} listed. Switch to edit mode to add one.</div>
      <button class="text-btn edit-only" data-add-action="${type}">+ Add ${type.slice(0, 1).toUpperCase() + type.slice(1)}</button>
    `;
    bindActionAdds();
    return;
  }

  container.innerHTML = `
    <div class="card-grid action-grid">
      ${actions
        .map(
          (action) => `
            <article class="action-card" data-action-id="${action.id}" data-action-type="${type}">
              <header class="card-head">
                <div class="card-head__left">
                  <div class="display-value action-name">${action.name || "New Action"}</div>
                  <input class="edit-field" type="text" data-field="name" value="${action.name || ""}" />
                  <div class="chip-row display-value">
                    <span class="chip chip--tone">${action.actionLabel || "Action"}</span>
                    ${(action.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}
                  </div>
                  <input class="edit-field" type="text" data-field="actionLabel" value="${action.actionLabel || ""}" placeholder="Action label" />
                  <input class="edit-field" type="text" data-field="tags" value="${(action.tags || []).join(", ")}" placeholder="Tags" />
                </div>
                <button class="icon-btn edit-only" data-remove-action="${action.id}" aria-label="Remove action">✕</button>
              </header>
              <div class="action-meta">
                <div class="meta-field">
                  <span class="meta-label">Range</span>
                  <span class="display-value">${action.range || "-"}</span>
                  <input class="edit-field" type="text" data-field="range" value="${action.range || ""}" />
                </div>
                <div class="meta-field">
                  <span class="meta-label">Target</span>
                  <span class="display-value">${action.target || "-"}</span>
                  <input class="edit-field" type="text" data-field="target" value="${action.target || ""}" />
                </div>
                <div class="meta-field">
                  <span class="meta-label">Speed</span>
                  <span class="display-value">${action.speed || "-"}</span>
                  <input class="edit-field" type="text" data-field="speed" value="${action.speed || ""}" />
                </div>
                <div class="meta-field">
                  <span class="meta-label">Cost</span>
                  <span class="display-value">${action.cost || "-"}</span>
                  <input class="edit-field" type="text" data-field="cost" value="${action.cost || ""}" />
                </div>
              </div>
              <div class="test-list">
                ${
                  (action.tests || []).length
                    ? (action.tests || []).map((test) => renderTest(test)).join("")
                    : '<div class="placeholder">No tests yet. Switch to edit mode to add one.</div>'
                }
              </div>
              <button class="text-btn edit-only" data-add-test="${action.id}">+ Add Test</button>
              <div class="action-notes">
                <p class="display-value">${action.description || ""}</p>
                <textarea class="edit-field" rows="3" data-field="description" placeholder="Additional notes">${action.description || ""}</textarea>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    <button class="text-btn edit-only" data-add-action="${type}">+ Add ${type.slice(0, 1).toUpperCase() + type.slice(1)}</button>
  `;

  bindActionAdds();
  bindActionRemovals();
  bindTestAdds();
  bindTestRemovals();
  bindAttributeToggles();
}

function renderSidebarLists() {
  renderListSection("sidebar-common", "Common Things", "common", "Quick reminders go here.");
  const weakContainer = document.getElementById("sidebar-weaknesses");
  if (weakContainer) {
    const weaknesses = sheetState.sidebar.lists.weaknesses || [];
    const vulnerabilities = sheetState.sidebar.lists.vulnerabilities || [];
    weakContainer.innerHTML = `
      <div class="sidebar__header">Weaknesses &amp; Vulnerabilities</div>
      <div class="sidebar__content">
        <div class="sub-section">
          <div class="sub-section__title">Weaknesses</div>
          <ul class="display-list">${weaknesses
            .map((item) => `<li>${item}</li>`)
            .join("") || '<li class="muted">List weaknesses here.</li>'}</ul>
          <textarea class="edit-field" rows="3" data-list="weaknesses" placeholder="List weaknesses">${weaknesses.join(
            "\n"
          )}</textarea>
        </div>
        <div class="sub-section">
          <div class="sub-section__title">Vulnerabilities</div>
          <ul class="display-list">${vulnerabilities
            .map((item) => `<li>${item}</li>`)
            .join("") || '<li class="muted">List vulnerabilities here.</li>'}</ul>
          <textarea class="edit-field" rows="3" data-list="vulnerabilities" placeholder="List vulnerabilities">${vulnerabilities.join(
            "\n"
          )}</textarea>
        </div>
      </div>
    `;
  }

  renderListSection("sidebar-languages", "Languages", "languages", "Languages known.");
}

function renderAll() {
  renderHeroPane();
  renderBars();
  renderSidebarResource();
  renderHeroTokens();
  renderSidebarLists();
  renderSkills();
  renderFeatures();
  renderActionSection("mains", "mains-pane");
  renderActionSection("maneuvers", "maneuvers-pane");
  renderActionSection("triggers", "triggers-pane");
  renderActionSection("freeStrikes", "free-strikes-pane");
  updateHeading();
  bindTokenButtons();
}

function bindTokenButtons() {
  document.querySelectorAll(".token-dot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.tokenIndex);
      const current = sheetState.hero.heroTokens[index];
      sheetState.hero.heroTokens[index] = !current;
      btn.classList.toggle("is-spent", sheetState.hero.heroTokens[index]);
      btn.classList.toggle("is-ready", !sheetState.hero.heroTokens[index]);
      saveSheet();
    });
  });
}

function bindFeatureAdd() {
  const addBtn = document.getElementById("add-feature");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    captureFeatures();
    sheetState.features.push({ id: createId("feature"), title: "", tags: [], text: "" });
    renderFeatures();
    queueAutoSave();
  });
}

function bindFeatureRemovals() {
  document.querySelectorAll("[data-remove-feature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      captureFeatures();
      const id = btn.getAttribute("data-remove-feature");
      sheetState.features = sheetState.features.filter((f) => f.id !== id);
      renderFeatures();
      queueAutoSave();
    });
  });
}

function bindActionAdds() {
  document.querySelectorAll("[data-add-action]").forEach((btn) => {
    btn.onclick = () => {
      const type = btn.getAttribute("data-add-action");
      const list = sheetState.actions[type] || [];
      list.push(actionDefaults(type));
      sheetState.actions[type] = list;
      renderActionSection(type, ACTION_CONTAINER_IDS[type] || `${type}-pane`);
    };
  });
}

function bindActionRemovals() {
  document.querySelectorAll("[data-remove-action]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-remove-action");
      const card = btn.closest(".action-card");
      const type = card?.dataset.actionType;
      if (!type) return;
      sheetState.actions[type] = (sheetState.actions[type] || []).filter((a) => a.id !== id);
      renderActionSection(type, ACTION_CONTAINER_IDS[type] || `${type}-pane`);
    };
  });
}

function bindTestAdds() {
  document.querySelectorAll("[data-add-test]").forEach((btn) => {
    btn.onclick = () => {
      const actionId = btn.getAttribute("data-add-test");
      const type = btn.closest(".action-card")?.dataset.actionType;
      if (!type) return;
      const action = (sheetState.actions[type] || []).find((a) => a.id === actionId);
      if (!action) return;
      action.tests = action.tests || [];
      action.tests.push(defaultTest());
      renderActionSection(type, ACTION_CONTAINER_IDS[type] || `${type}-pane`);
    };
  });
}

function bindTestRemovals() {
  document.querySelectorAll("[data-remove-test]").forEach((btn) => {
    btn.onclick = () => {
      const testId = btn.getAttribute("data-remove-test");
      const card = btn.closest(".action-card");
      const type = card?.dataset.actionType;
      const actionId = card?.dataset.actionId;
      if (!type || !actionId) return;
      const action = (sheetState.actions[type] || []).find((a) => a.id === actionId);
      if (!action) return;
      action.tests = (action.tests || []).filter((test) => test.id !== testId);
      renderActionSection(type, ACTION_CONTAINER_IDS[type] || `${type}-pane`);
    };
  });
}

function bindAttributeToggles() {
  document.querySelectorAll('[data-tier-field="attr-enabled"]').forEach((checkbox) => {
    checkbox.onchange = () => {
      const container = checkbox.closest(".attribute-check");
      if (!container) return;
      container.classList.toggle("is-active", checkbox.checked);
      const fields = container.querySelector(".attribute-check__fields");
      if (fields) {
        fields.classList.toggle("is-hidden", !checkbox.checked);
      }
    };
  });
}

function captureCoreFields() {
  document.querySelectorAll("[data-model]").forEach((el) => {
    const path = el.getAttribute("data-model");
    let value = el.value;
    if (el.type === "number") {
      value = el.value === "" ? "" : Number(el.value);
    }
    setByPath(path, value);
  });

  // Keep hero resource title aligned with sidebar title
  sheetState.sidebar.resource.title = sheetState.hero.resource.title;

  document.querySelectorAll("[data-list]").forEach((textarea) => {
    const key = textarea.getAttribute("data-list");
    sheetState.sidebar.lists[key] = textarea.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  });

  const updatedSkills = {};
  document.querySelectorAll("[data-skill-row]").forEach((row) => {
    const skill = row.getAttribute("data-skill-row");
    if (!skill) return;
    const levelSelect = row.querySelector(".skill-select");
    const bonusInput = row.querySelector("[data-skill-bonus]");
    updatedSkills[skill] = {
      level: levelSelect?.value || "Untrained",
      bonus: bonusInput?.value || "",
    };
  });
  sheetState.sidebar.skills = updatedSkills;
}

function captureFeatures() {
  const cards = document.querySelectorAll(".feature-card");
  const updated = [];
  cards.forEach((card) => {
    const id = card.getAttribute("data-feature-id") || createId("feature");
    const title = card.querySelector('[data-field="title"]').value;
    const tagsValue = card.querySelector('[data-field="tags"]').value;
    const text = card.querySelector('[data-field="text"]').value;
    updated.push({
      id,
      title,
      tags: tagsValue
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      text,
    });
  });
  sheetState.features = updated;
}

function captureActions() {
  ["mains", "maneuvers", "triggers", "freeStrikes"].forEach((type) => {
    const cards = document.querySelectorAll(`.action-card[data-action-type="${type}"]`);
    const updated = [];
    cards.forEach((card) => {
      const id = card.getAttribute("data-action-id") || createId("action");
      const getField = (field) => card.querySelector(`[data-field="${field}"]`);
      const tests = Array.from(card.querySelectorAll(".test")).map((testEl) => {
        const tiers = {};
        TEST_TIERS.forEach(({ key }) => {
          const tierEl = testEl.querySelector(`.test-tier[data-tier="${key}"]`);
          const getTierField = (field) => tierEl?.querySelector(`[data-tier-field="${field}"]`);
          tiers[key] = {
            damage: getTierField("damage")?.value || "",
            damageType: getTierField("damageType")?.value || "",
            notes: getTierField("notes")?.value || "",
            attributeCheck: {
              enabled: Boolean(getTierField("attr-enabled")?.checked),
              attribute: getTierField("attribute")?.value || "",
              threshold: getTierField("threshold")?.value || "",
              effect: getTierField("attr-effect")?.value || "",
            },
          };
        });

        return {
          id: testEl.getAttribute("data-test-id") || createId("test"),
          label: testEl.querySelector('[data-test-field="label"]')?.value || "",
          rollMod: testEl.querySelector('[data-test-field="rollMod"]')?.value || "",
          additionalEffect: testEl.querySelector('[data-test-field="additionalEffect"]')?.value || "",
          tiers,
        };
      });
      updated.push({
        id,
        name: getField("name")?.value || "",
        actionLabel: getField("actionLabel")?.value || "",
        tags: (getField("tags")?.value || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        range: getField("range")?.value || "",
        target: getField("target")?.value || "",
        speed: getField("speed")?.value || "",
        cost: getField("cost")?.value || "",
        description: getField("description")?.value || "",
        tests,
      });
    });
    sheetState.actions[type] = updated;
  });
}

function captureAllSections() {
  captureCoreFields();
  captureFeatures();
  captureActions();
}

const AUTOSAVE_DELAY_MS = 500;
let autoSaveTimeout;

function queueAutoSave() {
  if (!document.body.classList.contains("edit-mode")) return;
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    captureAllSections();
    saveSheet();
  }, AUTOSAVE_DELAY_MS);
}

function bindAutoSave() {
  const handler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.classList.contains("edit-field") || target.classList.contains("skill-select")) {
      queueAutoSave();
    }
  };

  document.addEventListener("input", handler, true);
  document.addEventListener("change", handler, true);
}

function updateHeading() {
  const heading = document.getElementById("hero-name-heading");
  if (!heading) return;
  const name = sheetState.hero.name || "Tableside Hero View";
  heading.textContent = name;
}

function toggleEditMode(enabled) {
  document.body.classList.toggle("edit-mode", enabled);
  document.querySelectorAll(".edit-field").forEach((input) => {
    if (input.dataset.liveEdit === "true") return;
    input.disabled = !enabled;
  });
  document.querySelectorAll(".skill-select").forEach((select) => {
    select.disabled = !enabled;
  });
}

function setupTabbing() {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("tab--active", t === tab));
      document.querySelectorAll(".pane").forEach((pane) => {
        pane.classList.toggle("is-hidden", pane.dataset.pane !== tab.dataset.tab);
      });
    });
  });
}

function bindEditToggle() {
  const toggle = document.getElementById("edit-toggle");
  toggle.addEventListener("change", (event) => {
    const enabled = event.target.checked;
    if (!enabled) {
      captureAllSections();
      renderAll();
      saveSheet();
    }
    toggleEditMode(enabled);
  });
}

async function loadSheet() {
  const payload = new URLSearchParams();
  payload.append("action", "load");
  if (activeCharacter) {
    payload.append("character", activeCharacter);
  }

  try {
    const response = await fetch("handler.php", {
      method: "POST",
      body: payload,
      credentials: "same-origin",
    });

    const result = await response.json();
    if (result.success && result.data) {
      sheetState = mergeWithDefaults(result.data);
    } else {
      sheetState = deepClone(defaultSheet);
      console.warn("Failed to load sheet", result.error);
    }
  } catch (error) {
    console.error("Error loading sheet", error);
    sheetState = deepClone(defaultSheet);
  }

  renderAll();
  toggleEditMode(false);
}

async function saveSheet() {
  const payload = new URLSearchParams();
  payload.append("action", "save");
  if (activeCharacter) {
    payload.append("character", activeCharacter);
  }
  payload.append("data", JSON.stringify(sheetState));

  try {
    const response = await fetch("handler.php", {
      method: "POST",
      body: payload,
      credentials: "same-origin",
    });

    const result = await response.json();
    if (!result.success) {
      console.warn("Failed to save sheet", result.error);
    }
  } catch (error) {
    console.error("Error saving sheet", error);
  }
}

async function ready() {
  activeCharacter = document.body.dataset.character || "";
  setupTabbing();
  bindEditToggle();
  bindAutoSave();
  await loadSheet();
}

document.addEventListener("DOMContentLoaded", ready);
