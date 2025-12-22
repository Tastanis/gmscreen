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

const defaultSheet = {
  hero: {
    name: "",
    level: 1,
    class: "",
    complication: "",
    ancestry: "",
    culture: "",
    career: "",
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
    vitals: {
      size: "",
      speed: "",
      stability: "",
      disengage: "",
      save: "",
      stamina: 0,
      recoveries: 0,
      recoveryValue: "",
    },
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

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

let sheetState = deepClone(defaultSheet);
let activeCharacter = "";

function mergeWithDefaults(data) {
  const merged = deepClone(defaultSheet);
  if (!data || typeof data !== "object") return merged;

  merged.hero = { ...merged.hero, ...(data.hero || {}) };
  merged.hero.resource = { ...merged.hero.resource, ...(data.hero?.resource || {}) };
  merged.hero.stats = { ...merged.hero.stats, ...(data.hero?.stats || {}) };
  merged.hero.vitals = { ...merged.hero.vitals, ...(data.hero?.vitals || {}) };
  merged.hero.heroTokens = [
    Boolean(data.hero?.heroTokens?.[0]),
    Boolean(data.hero?.heroTokens?.[1]),
  ];

  merged.sidebar = { ...merged.sidebar, ...(data.sidebar || {}) };
  merged.sidebar.lists = { ...merged.sidebar.lists, ...(data.sidebar?.lists || {}) };
  merged.sidebar.skills = { ...merged.sidebar.skills, ...(data.sidebar?.skills || {}) };
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
      effects: Array.isArray(action.effects) && action.effects.length > 0
        ? action.effects
        : [{ label: "", text: "" }],
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

  const vitalField = (label, key, type = "text") => `
    <div class="field-card">
      <label>${label}</label>
      <div class="display-value">${hero.vitals[key] ?? ""}</div>
      <input class="edit-field" type="${type}" data-model="hero.vitals.${key}" value="${hero.vitals[key] ?? ""}" />
    </div>
  `;

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
          <label>Hero Tokens</label>
          <div class="token-row">
            ${hero.heroTokens
              .map(
                (state, index) => `
                  <button class="token-dot ${state ? "is-spent" : "is-ready"}" data-token-index="${index}" aria-label="Toggle hero token ${
                  index + 1
                }"></button>
                `
              )
              .join("")}
          </div>
          <div class="token-hint">Green = ready, Red = spent</div>
        </div>
        <div class="field-card">
          <label>${hero.resource.title || "Resource"}</label>
          <div class="display-value">${hero.resource.value || ""}</div>
          <input class="edit-field" type="text" data-model="hero.resource.value" value="${hero.resource.value || ""}" />
          <input class="edit-field subtle" type="text" data-model="hero.resource.title" value="${hero.resource.title || "Resource"}" placeholder="Resource Title" />
        </div>
      </div>

      <div class="vital-grid">
        ${vitalField("Size", "size")}
        ${vitalField("Speed", "speed")}
        ${vitalField("Stability", "stability")}
        ${vitalField("Disengage", "disengage")}
        ${vitalField("Save", "save")}
        ${vitalField("Stamina", "stamina", "number")}
        ${vitalField("Recoveries", "recoveries", "number")}
        ${vitalField("Recovery Value", "recoveryValue")}
      </div>

      <div class="identity identity--secondary">
        ${identityField("Ancestry", "hero.ancestry")}
        ${identityField("Culture", "hero.culture")}
        ${identityField("Career", "hero.career")}
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

function renderBars() {
  const container = document.getElementById("sidebar-bars");
  const stamina = Number(sheetState.hero.vitals.stamina) || 0;
  const recoveries = Number(sheetState.hero.vitals.recoveries) || 0;
  const recoveryValue = sheetState.hero.vitals.recoveryValue || "";
  const staminaWidth = Math.max(0, Math.min(100, stamina));
  const recoveryWidth = Math.max(0, Math.min(100, recoveries));

  container.innerHTML = `
    <div class="sidebar__header">Vitals</div>
    <div class="sidebar__content bars">
      <div class="meter">
        <div class="meter__label">Stamina</div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--stamina" style="width:${staminaWidth}%;"></div>
        </div>
        <div class="meter__value display-value">${stamina}</div>
        <input class="edit-field" type="number" min="0" data-model="hero.vitals.stamina" value="${stamina}" />
      </div>
      <div class="meter">
        <div class="meter__label">Recoveries</div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--recovery" style="width:${recoveryWidth}%;"></div>
        </div>
        <div class="meter__value display-value">${recoveries}</div>
        <input class="edit-field" type="number" min="0" data-model="hero.vitals.recoveries" value="${recoveries}" />
      </div>
      <div class="field-card compact">
        <label>Recovery Value</label>
        <div class="display-value">${recoveryValue}</div>
        <input class="edit-field" type="text" data-model="hero.vitals.recoveryValue" value="${recoveryValue}" />
      </div>
    </div>
  `;
}

function renderSkills() {
  const container = document.getElementById("sidebar-skills");
  container.innerHTML = `<div class="sidebar__header">Skills</div>`;
  const content = document.createElement("div");
  content.classList.add("sidebar__content", "skills-grid");

  Object.entries(SKILL_GROUPS).forEach(([group, skills]) => {
    const groupBlock = document.createElement("div");
    groupBlock.classList.add("skill-group");
    const heading = document.createElement("div");
    heading.classList.add("skill-group__title");
    heading.textContent = group;
    groupBlock.appendChild(heading);

    skills.forEach((skill) => {
      const level = sheetState.sidebar.skills[skill] || "Untrained";
      const row = document.createElement("div");
      row.classList.add("skill-row");
      row.innerHTML = `
        <span class="skill-row__label">${skill}</span>
        <select class="skill-select" data-skill="${skill}">
          <option${level === "Untrained" ? " selected" : ""}>Untrained</option>
          <option${level === "Trained" ? " selected" : ""}>Trained</option>
          <option${level === "Expert" ? " selected" : ""}>Expert</option>
          <option${level === "Master" ? " selected" : ""}>Master</option>
        </select>
      `;
      groupBlock.appendChild(row);
    });

    content.appendChild(groupBlock);
  });

  container.appendChild(content);
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
    effects: [{ label: "", text: "" }],
  };
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
              <div class="effect-list">
                ${(action.effects || [])
                  .map(
                    (effect, index) => `
                      <div class="effect" data-effect-index="${index}">
                        <div class="effect__label">
                          <span class="display-value">${effect.label || ""}</span>
                          <input class="edit-field" type="text" data-effect="label" value="${effect.label || ""}" placeholder="Tier or trigger" />
                        </div>
                        <div class="effect__body">
                          <p class="display-value">${effect.text || ""}</p>
                          <textarea class="edit-field" rows="3" data-effect="text" placeholder="Effect details">${effect.text || ""}</textarea>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
              <button class="text-btn edit-only" data-add-effect="${action.id}">+ Add Effect</button>
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
  bindEffectAdds();
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
    sheetState.features.push({ id: createId("feature"), title: "", tags: [], text: "" });
    renderFeatures();
  });
}

function bindFeatureRemovals() {
  document.querySelectorAll("[data-remove-feature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-feature");
      sheetState.features = sheetState.features.filter((f) => f.id !== id);
      renderFeatures();
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

function bindEffectAdds() {
  document.querySelectorAll("[data-add-effect]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-add-effect");
      const type = btn.closest(".action-card")?.dataset.actionType;
      if (!type) return;
      const action = (sheetState.actions[type] || []).find((a) => a.id === id);
      if (!action) return;
      action.effects.push({ label: "", text: "" });
      renderActionSection(type, ACTION_CONTAINER_IDS[type] || `${type}-pane`);
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

  document.querySelectorAll(".skill-select").forEach((select) => {
    const skill = select.getAttribute("data-skill");
    sheetState.sidebar.skills[skill] = select.value;
  });
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
      const effects = Array.from(card.querySelectorAll(".effect")).map((row) => ({
        label: row.querySelector('[data-effect="label"]').value,
        text: row.querySelector('[data-effect="text"]').value,
      }));
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
        effects: effects.length ? effects : [{ label: "", text: "" }],
      });
    });
    sheetState.actions[type] = updated;
  });
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
      captureCoreFields();
      captureFeatures();
      captureActions();
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
  await loadSheet();
}

document.addEventListener("DOMContentLoaded", ready);
