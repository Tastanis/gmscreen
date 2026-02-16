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
    "Sneak",
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

const SORTED_SKILL_GROUPS = Object.fromEntries(
  Object.entries(SKILL_GROUPS).map(([group, skills]) => [
    group,
    [...skills].sort((a, b) => a.localeCompare(b)),
  ])
);

const ALL_SKILLS = Object.values(SORTED_SKILL_GROUPS).flat();

function getSkillGroup(skill) {
  return (
    Object.entries(SKILL_GROUPS).find(([, skills]) => skills.includes(skill))?.[0] ||
    "Other"
  );
}

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

function defaultCommonThing() {
  return {
    id: createId("common"),
    title: "",
    details: "",
  };
}

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
  staminaHistory: [],
};

const STAMINA_SYNC_INTERVAL_MS = 4000;
const STAMINA_SYNC_CHANNEL = "vtt-stamina-sync";
const HERO_TOKEN_SYNC_INTERVAL_MS = 4000;
const HERO_TOKEN_SYNC_CHANNEL = "vtt-hero-token-sync";

const EMPHASIZED_LABELS = new Set([
  "wealth",
  "renown",
  "xp",
  "victories",
  "surges",
  "resource",
  "size",
  "speed",
  "stability",
  "disengage",
  "save",
  "stamina",
  "recoveries",
  "recovery value",
]);

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
    resource: { title: "Resource", value: 0, autoDice: "" },
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
      vulnerability: [],
      immunity: [],
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
  { key: "low", label: "\u2264 11" },
  { key: "mid", label: "12-16" },
  { key: "high", label: "17+" },
];

const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence"];

const SKILL_MODAL_ID = "skill-picker-modal";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatBonusValue(value) {
  if (value === null || value === undefined) return "—";
  const trimmed = String(value).trim();
  return trimmed === "" ? "—" : trimmed;
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
    beforeEffect: "",
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
    beforeEffect: test.beforeEffect || "",
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

  const history = Array.isArray(vitals.staminaHistory)
    ? vitals.staminaHistory
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
    : [];
  if (history.length === 0 && Number.isFinite(normalized.currentStamina)) {
    history.push(normalized.currentStamina);
  }
  normalized.staminaHistory = history.slice(-4);

  return normalized;
}

function normalizeSkillsState(skills = {}) {
  const normalized = {};
  if (!skills || typeof skills !== "object") return normalized;

  Object.entries(skills).forEach(([skill, value]) => {
    const entry = { bonus: "" };

    if (typeof value === "string") {
      entry.level = value;
    } else if (value && typeof value === "object") {
      entry.level = value.level || "Trained";
      entry.bonus = value.bonus ?? "";
    }

    if (entry.level && entry.level !== "Untrained") {
      normalized[skill] = entry;
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

function normalizeCommonThings(list) {
  if (!Array.isArray(list)) return [];

  return list.map((item) => {
    if (typeof item === "string") {
      return { ...defaultCommonThing(), title: item };
    }

    return {
      ...defaultCommonThing(),
      ...(item || {}),
      id: item?.id || createId("common"),
      title: item?.title || "",
      details: item?.details || item?.text || "",
    };
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
  merged.hero.resource.value = normalizeResourceValue(
    inputHero.resource?.value ?? merged.hero.resource.value
  );
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
  merged.sidebar.lists.common = normalizeCommonThings(data.sidebar?.lists?.common || []);
  if (data.sidebar?.lists?.weaknesses && !data.sidebar?.lists?.vulnerability) {
    merged.sidebar.lists.vulnerability = data.sidebar.lists.weaknesses;
  }
  if (data.sidebar?.lists?.vulnerabilities && !data.sidebar?.lists?.immunity) {
    merged.sidebar.lists.immunity = data.sidebar.lists.vulnerabilities;
  }
  merged.sidebar.skills = normalizeSkillsState(data.sidebar?.skills);
  merged.sidebar.resource = {
    ...merged.sidebar.resource,
    ...(data.sidebar?.resource || {}),
  };

  merged.features = Array.isArray(data.features) ? data.features : [];
  merged.actions = { ...merged.actions, ...(data.actions || {}) };
  ["mains", "maneuvers", "triggers", "freeStrikes"].forEach((key) => {
    merged.actions[key] = (merged.actions[key] || []).map((action) => {
      const normalizedAction = {
        id: action.id || createId("action"),
        name: action.name || "",
        actionLabel: action.actionLabel || "",
        tags: Array.isArray(action.tags) ? action.tags : [],
        range: action.range || "",
        target: action.target || "",
        cost: action.cost || "",
        description: action.description || "",
        useWhen: action.useWhen || "",
        tests: Array.isArray(action.tests)
          ? action.tests.map(normalizeTest)
          : convertLegacyEffectsToTests(action.effects).map(normalizeTest),
      };
      if (key === "triggers") {
        normalizedAction.trigger = action.trigger || "";
      }
      return normalizedAction;
    });
  });

  merged.features = merged.features.map((feature) => ({
    id: feature.id || createId("feature"),
    title: feature.title || "",
    tags: Array.isArray(feature.tags) ? feature.tags : [],
    text: feature.text || "",
    isWide: Boolean(feature.isWide),
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

function normalizeResourceValue(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getResourceValue() {
  return normalizeResourceValue(sheetState.hero.resource?.value);
}

function formatResourceValue() {
  const value = getResourceValue();
  return Number.isFinite(value) ? value : 0;
}

function persistResourceValue() {
  if (document.body.classList.contains("edit-mode")) {
    queueAutoSave();
  } else {
    saveSheet();
  }
}

function updateResourceDisplays() {
  const value = formatResourceValue();
  const targets = [
    ...document.querySelectorAll("[data-resource-display]"),
    ...document.querySelectorAll("[data-resource-value-display]"),
    ...document.querySelectorAll("[data-resource-value-input]"),
  ];

  targets.forEach((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
    } else {
      el.textContent = value;
    }
  });
}

function setResourceValue(value) {
  sheetState.hero.resource.value = normalizeResourceValue(value);
  updateResourceDisplays();
  persistResourceValue();
}

function parseAutoDice(die) {
  if (!die) return null;
  const match = /^d?(\d+)$/i.exec(die.trim());
  if (!match) return null;
  const sides = Number(match[1]);
  return Number.isFinite(sides) && sides > 0 ? sides : null;
}

function rollAutoDice() {
  const sides = parseAutoDice(sheetState.hero.resource?.autoDice || "");
  if (!sides) return null;
  return Math.floor(Math.random() * sides) + 1;
}

function getLabelClass(label) {
  return EMPHASIZED_LABELS.has(label.toLowerCase()) ? "label--emphasis" : "";
}

let tempStaminaFlashUntil = 0;
let tempStaminaFlashTimeout;
let tempStaminaFlashId = 0;
let staminaSyncIntervalId = null;
let staminaSyncInFlight = false;
let staminaSyncChannel = null;
let staminaVisibilityHandler = null;
let heroTokenSyncIntervalId = null;
let heroTokenSyncInFlight = false;
let heroTokenSyncChannel = null;
let heroTokenVisibilityHandler = null;

function triggerTempStaminaFlash() {
  tempStaminaFlashId = Date.now();
  tempStaminaFlashUntil = tempStaminaFlashId + 1500;
  clearTimeout(tempStaminaFlashTimeout);
  tempStaminaFlashTimeout = setTimeout(() => {
    if (Date.now() >= tempStaminaFlashUntil) {
      renderBars();
    }
  }, 1600);
}

function isTempStaminaFlashing() {
  return Date.now() < tempStaminaFlashUntil;
}

function updateStaminaHistory(newValue) {
  const history = Array.isArray(sheetState.hero.vitals.staminaHistory)
    ? [...sheetState.hero.vitals.staminaHistory]
    : [];
  const numericValue = Number(newValue);
  if (!Number.isFinite(numericValue)) return;
  history.push(numericValue);
  sheetState.hero.vitals.staminaHistory = history.slice(-4);
}

function getStaminaSyncChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  if (!staminaSyncChannel) {
    staminaSyncChannel = new BroadcastChannel(STAMINA_SYNC_CHANNEL);
  }
  return staminaSyncChannel;
}

function applyStaminaSync({ currentStamina, staminaMax }) {
  const normalizedVitals = normalizeVitals(sheetState.hero.vitals);
  const nextCurrent = Number.isFinite(Number(currentStamina))
    ? Number(currentStamina)
    : normalizedVitals.currentStamina;
  const nextMax = Number.isFinite(Number(staminaMax))
    ? Number(staminaMax)
    : normalizedVitals.staminaMax;
  const hasChanges =
    normalizedVitals.currentStamina !== nextCurrent || normalizedVitals.staminaMax !== nextMax;

  if (!hasChanges) {
    return;
  }

  sheetState.hero.vitals = {
    ...sheetState.hero.vitals,
    currentStamina: nextCurrent,
    staminaMax: nextMax,
  };

  if (Number.isFinite(nextCurrent)) {
    updateStaminaHistory(nextCurrent);
    if (Number.isFinite(nextMax) && nextCurrent > nextMax) {
      triggerTempStaminaFlash();
    }
  }

  if (document.body.classList.contains("edit-mode")) {
    renderBars();
  } else {
    renderAll();
  }
}

function handleStaminaBroadcast(event) {
  const payload = event?.data;
  if (!payload || payload.type !== "stamina-sync") return;
  const payloadCharacter =
    typeof payload.character === "string" ? payload.character.trim().toLowerCase() : "";
  const activeKey = typeof activeCharacter === "string" ? activeCharacter.trim().toLowerCase() : "";

  if (!activeKey || (payloadCharacter && payloadCharacter !== activeKey)) {
    return;
  }

  applyStaminaSync({
    currentStamina: payload.currentStamina,
    staminaMax: payload.staminaMax,
  });
}

async function pollStaminaSync() {
  if (!activeCharacter) return;
  if (document.visibilityState === "hidden") return;
  if (staminaSyncInFlight) return;

  staminaSyncInFlight = true;
  try {
    const response = await fetch(
      `handler.php?action=sync-stamina&character=${encodeURIComponent(activeCharacter)}`,
      { credentials: "same-origin", cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(`Stamina sync failed (${response.status})`);
    }
    const data = await response.json();
    if (!data || data.error) return;
    applyStaminaSync({
      currentStamina: data.currentStamina,
      staminaMax: data.staminaMax,
    });
  } catch (error) {
    console.warn("Failed to sync stamina", error);
  } finally {
    staminaSyncInFlight = false;
  }
}

function startStaminaSync() {
  if (staminaSyncIntervalId || !activeCharacter) return;
  const channel = getStaminaSyncChannel();
  if (channel) {
    channel.addEventListener("message", handleStaminaBroadcast);
  }

  staminaVisibilityHandler = () => {
    if (document.visibilityState === "visible") {
      pollStaminaSync();
    }
  };
  document.addEventListener("visibilitychange", staminaVisibilityHandler);

  pollStaminaSync();
  staminaSyncIntervalId = window.setInterval(pollStaminaSync, STAMINA_SYNC_INTERVAL_MS);
}

function stopStaminaSync() {
  if (staminaSyncIntervalId && typeof window?.clearInterval === "function") {
    window.clearInterval(staminaSyncIntervalId);
  }
  staminaSyncIntervalId = null;

  if (staminaVisibilityHandler) {
    document.removeEventListener("visibilitychange", staminaVisibilityHandler);
  }
  staminaVisibilityHandler = null;

  if (staminaSyncChannel) {
    staminaSyncChannel.close();
    staminaSyncChannel = null;
  }
}

function getHeroTokenSyncChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  if (!heroTokenSyncChannel) {
    heroTokenSyncChannel = new BroadcastChannel(HERO_TOKEN_SYNC_CHANNEL);
  }
  return heroTokenSyncChannel;
}

function normalizeHeroTokens(tokens) {
  return [Boolean(tokens?.[0]), Boolean(tokens?.[1])];
}

function applyHeroTokenSync(tokens) {
  const normalized = normalizeHeroTokens(tokens);
  const current = normalizeHeroTokens(sheetState.hero.heroTokens);
  if (normalized[0] === current[0] && normalized[1] === current[1]) return;
  sheetState.hero.heroTokens = normalized;
  renderHeroTokens();
  bindTokenButtons();
}

function handleHeroTokenBroadcast(event) {
  const payload = event?.data;
  if (!payload || payload.type !== "hero-token-sync") return;
  applyHeroTokenSync(payload.heroTokens);
}

async function pollHeroTokenSync() {
  if (!activeCharacter) return;
  if (document.visibilityState === "hidden") return;
  if (heroTokenSyncInFlight) return;

  heroTokenSyncInFlight = true;
  try {
    const response = await fetch(
      `handler.php?action=sync-hero-tokens&character=${encodeURIComponent(activeCharacter)}`,
      { credentials: "same-origin", cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(`Hero token sync failed (${response.status})`);
    }
    const data = await response.json();
    if (!data || data.error) return;
    applyHeroTokenSync(data.heroTokens);
  } catch (error) {
    console.warn("Failed to sync hero tokens", error);
  } finally {
    heroTokenSyncInFlight = false;
  }
}

function startHeroTokenSync() {
  if (heroTokenSyncIntervalId || !activeCharacter) return;
  const channel = getHeroTokenSyncChannel();
  if (channel) {
    channel.addEventListener("message", handleHeroTokenBroadcast);
  }

  heroTokenVisibilityHandler = () => {
    if (document.visibilityState === "visible") {
      pollHeroTokenSync();
    }
  };
  document.addEventListener("visibilitychange", heroTokenVisibilityHandler);

  pollHeroTokenSync();
  heroTokenSyncIntervalId = window.setInterval(pollHeroTokenSync, HERO_TOKEN_SYNC_INTERVAL_MS);
}

function stopHeroTokenSync() {
  if (heroTokenSyncIntervalId && typeof window?.clearInterval === "function") {
    window.clearInterval(heroTokenSyncIntervalId);
  }
  heroTokenSyncIntervalId = null;

  if (heroTokenVisibilityHandler) {
    document.removeEventListener("visibilitychange", heroTokenVisibilityHandler);
  }
  heroTokenVisibilityHandler = null;

  if (heroTokenSyncChannel) {
    heroTokenSyncChannel.close();
    heroTokenSyncChannel = null;
  }
}

function parseTrackerInput(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  if (trimmed === "") return null;

  const deltaMatch = trimmed.match(/^([+-])\s*(\d+(?:\.\d+)?)$/);
  if (deltaMatch) {
    const amount = Number(deltaMatch[2]);
    if (!Number.isFinite(amount)) return null;
    return {
      type: "delta",
      delta: deltaMatch[1] === "-" ? -amount : amount,
    };
  }

  const absoluteValue = Number(trimmed);
  if (!Number.isFinite(absoluteValue)) return null;
  return {
    type: "set",
    value: absoluteValue,
  };
}

function applyTrackerChange(path, rawValue) {
  const parsed = parseTrackerInput(rawValue);
  if (!parsed) {
    renderBars();
    return;
  }

  const isStamina = path.endsWith("currentStamina");
  const vitals = sheetState.hero.vitals;
  const currentValue = Number(getValue(path)) || 0;
  const maxValue = isStamina ? Number(vitals.staminaMax) || 0 : Number(vitals.recoveriesMax) || 0;

  let newValue = currentValue;

  if (parsed.type === "delta") {
    newValue = currentValue + parsed.delta;
    if (isStamina) {
      const ceiling = Math.max(maxValue, currentValue);
      newValue = Math.min(newValue, ceiling);
    }
  } else {
    newValue = parsed.value;
  }

  newValue = Math.max(0, newValue);

  if (isStamina) {
    const overflow = Math.max(0, newValue - maxValue);
    if (parsed.type === "set" && overflow > 0) {
      triggerTempStaminaFlash();
    }
  }

  setByPath(path, newValue);

  if (isStamina) {
    updateStaminaHistory(newValue);
  }

  renderBars();
  saveSheet();
}

function renderHeroPane() {
  const hero = sheetState.hero;
  const pane = document.getElementById("hero-pane");
  const isEditMode = document.body.classList.contains("edit-mode");
  const statCard = (label, key) => `
    <div class="stat-card">
      <label class="card__label">${label}</label>
      <div class="card__value display-value">${hero.stats[key] ?? 0}</div>
      <input class="edit-field" type="number" data-model="hero.stats.${key}" value="${hero.stats[key] ?? 0}" />
    </div>
  `;

  const vitalField = (label, path, type = "text") => {
    const value = getValue(path);
    return `
    <div class="field-card vital-card compact">
      <label class="${getLabelClass(label)}">${label}</label>
      <div class="display-value">${value ?? ""}</div>
      <input class="edit-field" type="${type}" data-model="${path}" value="${value ?? ""}" />
    </div>
  `;
  };

  const identityField = (label, path) => {
    const value = getValue(path);
    return `
      <div class="field-card">
        <label class="${getLabelClass(label)}">${label}</label>
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
      ${isEditMode ? `
      <div class="identity-edit-row">
        <div class="field-card">
          <label>Name</label>
          <input class="edit-field" type="text" data-model="hero.name" value="${hero.name || ""}" />
        </div>
        <div class="field-card">
          <label>Level</label>
          <input class="edit-field" type="number" min="1" data-model="hero.level" value="${hero.level || ""}" />
        </div>
        <div class="field-card">
          <label>Class</label>
          <input class="edit-field" type="text" data-model="hero.class" value="${hero.class || ""}" />
        </div>
        <div class="field-card">
          <label>Class Track</label>
          <input class="edit-field" type="text" data-model="hero.classTrack" value="${hero.classTrack || ""}" />
        </div>
      </div>
      ` : ""}

      <div class="marip-block">
        <div class="stat-grid">
          ${statCard("Might", "might")}
          ${statCard("Agility", "agility")}
          ${statCard("Reason", "reason")}
          ${statCard("Intuition", "intuition")}
          ${statCard("Presence", "presence")}
        </div>
      </div>

      <div class="key-vitals-row">
        ${vitalField("Victories", "hero.victories", "number")}
        ${vitalField("Size", "hero.vitals.size")}
        ${vitalField("Stability", "hero.vitals.stability")}
        ${vitalField("Speed", "hero.vitals.speed")}
      </div>

      <div class="quick-resources">
        ${identityField("Wealth", "hero.wealth")}
        ${identityField("Renown", "hero.renown")}
        ${identityField("XP", "hero.xp")}
        ${identityField("Surges", "hero.surges")}
        ${
          isEditMode
            ? `<div class="field-card resource-card edit-only">
                <div class="resource-editor">
                  <input
                    class="edit-field resource-name-input"
                    type="text"
                    data-model="hero.resource.title"
                    value="${hero.resource.title || "Resource"}"
                    placeholder="Resource Name"
                  />
                  <div class="auto-dice-input-row">
                    <span class="auto-dice-label">Auto Dice</span>
                    <input
                      class="edit-field resource-auto-dice-input"
                      type="text"
                      data-model="hero.resource.autoDice"
                      value="${hero.resource.autoDice || ""}"
                      placeholder="e.g. d6"
                    />
                  </div>
                </div>
              </div>`
            : ""
        }
      </div>

      <div class="vital-grid">
        ${vitalField("Disengage", "hero.vitals.disengage")}
        ${vitalField("Save", "hero.vitals.save")}
        ${vitalField("Stamina", "hero.vitals.staminaMax", "number")}
        ${vitalField("Recoveries", "hero.vitals.recoveriesMax", "number")}
        ${vitalField("Recovery Value", "hero.vitals.recoveryValue")}
      </div>

      <div class="bottom-details">
        <div class="identity identity--secondary" style="position:relative;">
          <span class="chat-dot-wrap" style="position:absolute;top:4px;right:4px;"><button class="chat-dot chat-dot--section" type="button" aria-label="Post background to chat" data-chat-type="background"></button></span>
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
      </div>
    </section>
  `;
  bindChatDots();
}

function renderListSection(containerId, title, key, placeholder) {
  const container = document.getElementById(containerId);
  const values = sheetState.sidebar.lists[key] || [];
  const chatType = key === "languages" ? "languages" : null;
  const dotMarkup = chatType
    ? ` <span class="chat-dot-wrap"><button class="chat-dot chat-dot--section" type="button" aria-label="Post ${title.toLowerCase()} to chat" data-chat-type="${chatType}"></button></span>`
    : "";
  container.innerHTML = `
    <div class="sidebar__header">${title}${dotMarkup}</div>
    <div class="sidebar__content">
      <ul class="display-list">
        ${values.map((item) => `<li>${item}</li>`).join("") || `<li class="muted">${placeholder}</li>`}
      </ul>
      <textarea class="edit-field" rows="4" data-list="${key}" placeholder="${placeholder}">${values.join("\n")}</textarea>
    </div>
  `;
  bindChatDots();
}

function renderCommonThingCard(thing) {
  const displayTitle = thing.title || "Common Thing";
  const displayDetails = thing.details || "";

  return `
    <article class="common-card" data-common-id="${thing.id}">
      <span class="chat-dot-wrap"><button class="chat-dot" type="button" aria-label="Post to chat" data-chat-type="common" data-chat-id="${thing.id}"></button></span>
      <header class="common-card__header">
        <div class="common-card__title-group">
          <div class="display-value common-card__title">${displayTitle}</div>
          <input
            class="edit-field"
            type="text"
            data-common-field="title"
            value="${thing.title || ""}"
            placeholder="Common thing title"
          />
        </div>
        <button class="icon-btn edit-only" data-remove-common="${thing.id}" aria-label="Remove common thing">✕</button>
      </header>
      <div class="common-card__body">
        <div class="display-value rich-text-display">${renderRichText(displayDetails || "")}</div>
        <div class="rich-text-wrapper">
          <div class="rich-toolbar edit-only" role="toolbar" aria-label="Common thing formatting">
            <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="bold" aria-label="Bold">
              <strong>B</strong>
            </button>
          </div>
          <div
            class="rich-text-editor edit-field"
            data-common-field="details"
            contenteditable="true"
            data-placeholder="Details or reminders"
          >${renderRichText(displayDetails || "")}</div>
        </div>
      </div>
    </article>
  `;
}

function renderCommonThings() {
  const container = document.getElementById("sidebar-common");
  if (!container) return;

  const commonThings = normalizeCommonThings(sheetState.sidebar.lists.common || []);
  sheetState.sidebar.lists.common = commonThings;
  const hasItems = commonThings.length > 0;

  container.innerHTML = `
    <div class="sidebar__header common-header">
      <span>Common Things</span>
      <button class="text-btn edit-only" data-add-common>+ Add Common Thing</button>
    </div>
    <div class="sidebar__content common-content">
      ${
        hasItems
          ? commonThings.map((thing) => renderCommonThingCard(thing)).join("")
          : '<div class="muted">Quick reminders go here.</div>'
      }
    </div>
  `;

  bindCommonAdds();
  bindCommonRemovals();
  bindRichTextToolbars();
  bindChatDots();
}

function renderSidebarResource() {
  const container = document.getElementById("sidebar-resource");
  const resource = sheetState.sidebar.resource;
  const title = resource.title || sheetState.hero.resource.title || "Resource";
  const resourceValue = formatResourceValue();
  const autoDice = (sheetState.hero.resource.autoDice || "").trim();
  const showAutoDice = Boolean(parseAutoDice(autoDice));

  container.innerHTML = `
    <div class="sidebar__header sidebar-resource-header">
      <div class="resource-title-stack">
        <div class="resource-title-text">${title}</div>
        <input
          class="edit-field resource-name-input"
          type="text"
          data-model="sidebar.resource.title"
          value="${title}"
        />
      </div>
      <div class="resource-value-wrapper">
        <button class="resource-step" data-resource-delta="1" aria-label="Increase resource">▲</button>
        <input
          class="resource-value-display"
          data-resource-value-input
          type="text"
          inputmode="numeric"
          value="${resourceValue}"
          aria-label="Resource value"
        />
        <button class="resource-step" data-resource-delta="-1" aria-label="Decrease resource">▼</button>
        ${
          showAutoDice
            ? `<button class="auto-dice-button" data-auto-dice-roll aria-label="Roll ${autoDice}">${autoDice}</button>`
            : ""
        }
      </div>
    </div>
    <div class="sidebar__content sidebar-resource-content">
      <div class="resource-text display-value rich-text-display">${renderRichText(resource.text || "")}</div>
      <div class="rich-text-wrapper">
        <div class="rich-toolbar edit-only" role="toolbar" aria-label="Resource formatting">
          <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="bold" aria-label="Bold">
            <strong>B</strong>
          </button>
        </div>
        <div
          class="rich-text-editor edit-field"
          data-model="sidebar.resource.text"
          contenteditable="true"
          data-placeholder="Describe the resource"
        >${renderRichText(resource.text || "")}</div>
      </div>
    </div>
  `;
}

function renderHeroTokens() {
  const container = document.getElementById("sidebar-hero-tokens");
  if (!container) return;

  container.innerHTML = `
    <div class="sidebar__header token-header">
      <span>Hero Tokens</span>
      <div class="token-row">
        ${sheetState.hero.heroTokens
          .map(
            (state, index) => `
              <span class="token-button-wrap">
                <button class="token-dot ${state ? "is-spent" : "is-ready"}" data-token-index="${index}" aria-label="Toggle hero token ${
              index + 1
            }"></button>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function clearHeroTokenConfirmations() {
  document.querySelectorAll(".token-confirmation").forEach((el) => el.remove());
}

function showHeroTokenConfirmation(btn, index) {
  clearHeroTokenConfirmations();
  const wrapper = btn.closest(".token-button-wrap");
  if (!wrapper) return;

  const confirm = document.createElement("div");
  confirm.className = "token-confirmation";
  confirm.innerHTML = `
    <div class="token-confirmation__text">Does everyone agree to use a hero token?</div>
    <div class="token-confirmation__actions">
      <button class="text-btn" data-confirm-hero-token>Yes</button>
      <button class="text-btn" data-cancel-hero-token>Cancel</button>
    </div>
  `;
  wrapper.appendChild(confirm);

  confirm.querySelector("[data-cancel-hero-token]")?.addEventListener("click", () => {
    confirm.remove();
  });

  confirm.querySelector("[data-confirm-hero-token]")?.addEventListener("click", async () => {
    confirm.remove();
    await toggleHeroToken(index);
  });
}

async function toggleHeroToken(index) {
  const current = sheetState.hero.heroTokens[index];
  const nextState = !current;
  try {
    const payload = new URLSearchParams();
    payload.append("action", "sync-hero-tokens");
    if (activeCharacter) {
      payload.append("character", activeCharacter);
    }
    payload.append("tokenIndex", String(index));
    payload.append("tokenState", nextState ? "1" : "0");

    const response = await fetch("handler.php", {
      method: "POST",
      body: payload,
      credentials: "same-origin",
    });
    const result = await response.json();
    if (!result || result.error) {
      throw new Error(result?.error || "Failed to sync hero token");
    }
    applyHeroTokenSync(result.heroTokens);
    const channel = getHeroTokenSyncChannel();
    if (channel) {
      channel.postMessage({ type: "hero-token-sync", heroTokens: result.heroTokens });
    }
  } catch (error) {
    console.warn("Failed to toggle hero token", error);
  }
}

function bindResourceControls() {
  document.querySelectorAll("[data-resource-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.resourceDelta) || 0;
      setResourceValue(getResourceValue() + delta);
    });
  });

  const inlineInput = document.querySelector("[data-resource-value-input]");
  if (inlineInput) {
    const commitValue = () => setResourceValue(inlineInput.value);

    inlineInput.addEventListener("focus", () => {
      inlineInput.select();
    });

    inlineInput.addEventListener("blur", commitValue);

    inlineInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitValue();
        inlineInput.blur();
      }
      if (event.key === "Escape") {
        inlineInput.value = formatResourceValue();
        inlineInput.blur();
      }
    });
  }

  document.querySelectorAll("[data-auto-dice-roll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const result = rollAutoDice();
      if (result === null) return;
      setResourceValue(getResourceValue() + result);
    });
  });
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
  const staminaHistory = Array.isArray(vitals.staminaHistory) ? vitals.staminaHistory : [];
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
  const staminaOverflow = Math.max(0, currentStamina - staminaMax);
  const staminaOverflowWidth =
    staminaMax > 0
      ? Math.max(0, Math.min(100, (staminaOverflow / staminaMax) * 100))
      : staminaOverflow > 0
        ? 100
        : 0;
  const shouldFlashTemp = staminaOverflow > 0 && isTempStaminaFlashing();
  const staminaHistoryDisplay = staminaHistory.slice(-4).join(" -> ");

  container.innerHTML = `
    <div class="sidebar__header">Vitals</div>
    <div class="sidebar__content bars">
      <div class="meter meter--stamina">
        <div class="meter__label-row">
          <span class="tracker-label tracker-label--stamina tracker-label--prominent">Stamina</span>
          ${shouldFlashTemp
            ? `<span class="tracker-label tracker-label--temp tracker-label--prominent" data-flash-id="${tempStaminaFlashId}">TEMP STAMINA</span>`
            : ""}
        </div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--stamina" style="width:${staminaWidth}%;"></div>
          ${staminaOverflowWidth > 0
            ? `<div class="meter__overflow" style="width:${staminaOverflowWidth}%;"></div>`
            : ""}
        </div>
        ${staminaHistoryDisplay
          ? `<div class="meter__history">${staminaHistoryDisplay}</div>`
          : ""}
        <div class="meter__row">
          <div class="meter__value display-value">${currentStaminaDisplay} / ${staminaMaxDisplay}</div>
          <div class="tracker-input-wrapper">
            <input class="edit-field tracker-input" data-live-edit="true" type="text" data-model="hero.vitals.currentStamina" value="${vitals.currentStamina}" />
          </div>
        </div>
      </div>
      <div class="meter meter--recovery">
        <div class="meter__label-row">
          <span class="tracker-label tracker-label--recovery tracker-label--prominent">Recoveries</span>
        </div>
        <div class="meter__track">
          <div class="meter__fill meter__fill--recovery" style="width:${recoveryWidth}%;"></div>
        </div>
        <div class="meter__row">
          <div class="meter__value display-value">${currentRecoveriesDisplay} / ${recoveriesMaxDisplay}</div>
          <div class="tracker-input-wrapper">
            <input class="edit-field tracker-input" data-live-edit="true" type="text" data-model="hero.vitals.currentRecoveries" value="${vitals.currentRecoveries}" />
          </div>
        </div>
      </div>
      <div class="field-card compact">
        <label>Recovery Value</label>
        <div class="display-value">${recoveryValue}</div>
        <input class="edit-field" type="text" data-model="hero.vitals.recoveryValue" value="${recoveryValue}" />
      </div>
    </div>
  `;

  container.querySelectorAll('.tracker-input').forEach((input) => {
    const path = input.getAttribute("data-model");
    if (!path) return;

    const apply = () => {
      applyTrackerChange(path, input.value);
      const latestValue = getValue(path);
      input.value = latestValue === null || latestValue === undefined ? "" : latestValue;
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    input.addEventListener("blur", apply);
  });
}

function closeSkillPickerModal() {
  const modal = document.getElementById(SKILL_MODAL_ID);
  if (modal) {
    modal.remove();
  }
}

function openSkillPickerModal(availableSkills) {
  closeSkillPickerModal();
  const modal = document.createElement("div");
  modal.id = SKILL_MODAL_ID;
  modal.classList.add("modal-overlay");

  const modalBody = availableSkills.length
    ? Object.entries(SORTED_SKILL_GROUPS)
        .map(([group, skillsInGroup]) => {
          const options = skillsInGroup
            .filter((skill) => availableSkills.includes(skill))
            .map((skill) => `<button type="button" class="skill-picker__option" data-pick-skill="${skill}">${skill}</button>`)
            .join("");

          if (!options) return "";

          return `
            <section class="skill-picker__group">
              <div class="skill-picker__title">${group}</div>
              <div class="skill-picker__grid">${options}</div>
            </section>
          `;
        })
        .join("")
    : `<p class="placeholder">All skills are already selected.</p>`;

  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal__header">
        <h2 class="modal__title">Select a Skill</h2>
        <button class="icon-btn" type="button" data-close-skill-modal aria-label="Close skill picker">✕</button>
      </header>
      <div class="modal__body">${modalBody}</div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeSkillPickerModal();
    }
  });

  modal.querySelectorAll("[data-close-skill-modal]").forEach((btn) => {
    btn.addEventListener("click", closeSkillPickerModal);
  });

  modal.querySelectorAll("[data-pick-skill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const skill = btn.getAttribute("data-pick-skill");
      if (!skill) return;
      sheetState.sidebar.skills[skill] = { level: "Trained", bonus: "" };
      closeSkillPickerModal();
      renderSkills();
    });
  });
}

function renderSkills() {
  const container = document.getElementById("sidebar-skills");
  if (!container) return;

  const skills = normalizeSkillsState(sheetState.sidebar.skills);
  sheetState.sidebar.skills = skills;
  const skillEntries = Object.entries(skills);
  const isEditMode = document.body.classList.contains("edit-mode");

  if (!isEditMode) {
    closeSkillPickerModal();
  }

  const displayList =
    !isEditMode && skillEntries.length
      ? `
          <ul class="skill-display-list">
            ${skillEntries
              .map(
                ([skill, data]) => `
                  <li class="skill-display" data-skill-row="${skill}">
                    <div class="skill-display__name">${skill}</div>
                    <div class="skill-display__meta">${getSkillGroup(skill)} • ${formatBonusValue(data.bonus)}</div>
                  </li>
                `
              )
              .join("")}
          </ul>
        `
      : "";

  const editorList = isEditMode && skillEntries.length
    ? `
        <div class="skill-edit-list">
          ${skillEntries
            .map(
              ([skill, data]) => `
                <div class="skill-edit-row" data-skill-row="${skill}">
                  <div class="skill-edit-row__label">
                    <div>
                      <div class="skill-edit-row__name">${skill}</div>
                      <div class="skill-edit-row__group">${getSkillGroup(skill)}</div>
                    </div>
                    <button class="text-btn text-btn--danger" type="button" data-remove-skill="${skill}">Remove</button>
                  </div>
                  <label class="input-stack">
                    <span>Bonus</span>
                    <input class="edit-field" type="text" data-skill-bonus="${skill}" value="${
                      data.bonus || ""
                    }" placeholder="+0" />
                  </label>
                </div>
              `
            )
            .join("")}
        </div>
      `
    : "";

  container.innerHTML = `
    <div class="sidebar__header">Skills <span class="chat-dot-wrap"><button class="chat-dot chat-dot--section" type="button" aria-label="Post skills to chat" data-chat-type="skills"></button></span></div>
    <div class="sidebar__content skills-panel">
      ${isEditMode ? editorList : displayList}
      ${isEditMode ? '<button class="text-btn" type="button" id="open-skill-picker">+ Add New Skill</button>' : ""}
    </div>
  `;

  if (isEditMode) {
    container.querySelectorAll("[data-remove-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const skill = btn.getAttribute("data-remove-skill");
        if (!skill) return;
        delete sheetState.sidebar.skills[skill];
        renderSkills();
      });
    });

    const addBtn = container.querySelector("#open-skill-picker");
    const availableSkills = ALL_SKILLS.filter((skill) => !skills[skill]);
    if (addBtn) {
      addBtn.addEventListener("click", () => openSkillPickerModal(availableSkills));
    }
  }
  bindChatDots();
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
          (feature, index) => `
            <article class="feature-card ${feature.isWide ? "feature-card--wide" : ""}" data-feature-id="${feature.id}">
              <header class="card-head">
                <div>
                  <div class="display-value feature-title">${feature.title || "Untitled Feature"}</div>
                  <input class="edit-field" type="text" data-field="title" value="${feature.title || ""}" />
                </div>
                <div class="feature-controls">
                  <span class="chat-dot-wrap"><button class="chat-dot" type="button" aria-label="Post to chat" data-chat-type="feature" data-chat-id="${feature.id}"></button></span>
                  <button
                    class="icon-btn edit-only"
                    data-move-feature="up"
                    data-feature-id="${feature.id}"
                    aria-label="Move feature up"
                    ${index === 0 ? "disabled" : ""}
                  >▲</button>
                  <button
                    class="icon-btn edit-only"
                    data-move-feature="down"
                    data-feature-id="${feature.id}"
                    aria-label="Move feature down"
                    ${index === sheetState.features.length - 1 ? "disabled" : ""}
                  >▼</button>
                  <button
                    class="icon-btn edit-only"
                    data-toggle-feature-width
                    data-feature-id="${feature.id}"
                    aria-label="Toggle feature width"
                    aria-pressed="${feature.isWide ? "true" : "false"}"
                  >2×</button>
                  <button class="icon-btn edit-only" data-remove-feature="${feature.id}" aria-label="Remove feature">✕</button>
                </div>
              </header>
              <div class="chip-row display-value">
                ${(feature.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}
              </div>
              <input class="edit-field" type="text" data-field="tags" value="${(feature.tags || []).join(", ")}" placeholder="Tags" />
              <div class="feature-body display-value rich-text-display">${renderRichText(feature.text || "")}</div>
              <div class="rich-text-wrapper">
                <div class="rich-toolbar edit-only" role="toolbar" aria-label="Feature formatting">
                  <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="bold" aria-label="Bold">
                    <strong>B</strong>
                  </button>
                  <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="underline" aria-label="Underline">
                    <span class="rich-toolbar__underline">U</span>
                  </button>
                </div>
                <div
                  class="rich-text-editor edit-field"
                  data-field="text"
                  contenteditable="true"
                  data-placeholder="Describe the feature"
                >${renderRichText(feature.text || "")}</div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    <button class="text-btn edit-only" id="add-feature">+ Add Feature</button>
  `;

  bindFeatureAdd();
  bindFeatureRemovals();
  bindFeatureMoves();
  bindFeatureWidthToggles();
  bindRichTextToolbars();
  bindChatDots();
}

function actionDefaults(type) {
  const labelMap = {
    mains: "Main Action",
    maneuvers: "Maneuver",
    triggers: "Triggered Action",
    freeStrikes: "Free Strike",
  };
  const defaults = {
    id: createId("action"),
    name: "",
    actionLabel: labelMap[type] || "Action",
    tags: [],
    range: "",
    target: "",
    cost: "",
    description: "",
    useWhen: "",
    tests: [],
  };
  if (type === "triggers") {
    defaults.trigger = "";
  }
  return defaults;
}

function formatRoll(rollMod) {
  if (rollMod === "" || rollMod === null || rollMod === undefined) return "2d10+__";
  const mod = rollMod.toString();
  const needsPlus = !mod.startsWith("-");
  return `2d10${needsPlus ? "+" : ""}${mod}`;
}

function formatMultiline(text) {
  if (!text) return "";
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, arr) => line !== "" || index < arr.length - 1)
    .map((line) => line || "\u00a0")
    .join("<br>");
}

function normalizeRichText(value) {
  if (!value) return "";
  const text = String(value);
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  return formatMultiline(text);
}

function sanitizeRichText(html) {
  if (!html) return "";
  const allowedTags = new Set(["B", "STRONG", "U", "BR", "P", "DIV", "UL", "OL", "LI", "EM", "SPAN"]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createTextNode("");
    }
    const tagName = node.tagName.toUpperCase();
    if (!allowedTags.has(tagName)) {
      const fragment = document.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => {
        fragment.appendChild(sanitizeNode(child));
      });
      return fragment;
    }
    const clean = document.createElement(tagName.toLowerCase());
    Array.from(node.childNodes).forEach((child) => {
      clean.appendChild(sanitizeNode(child));
    });
    return clean;
  };

  const fragment = document.createDocumentFragment();
  Array.from(root.childNodes).forEach((child) => {
    fragment.appendChild(sanitizeNode(child));
  });
  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

function renderRichText(value) {
  return sanitizeRichText(normalizeRichText(value));
}

function renderTierDisplay(tier) {
  const parts = [];
  if (tier.damage || tier.damageType) {
    const damageText = [tier.damage || "-", tier.damageType || ""].filter(Boolean).join(" ");
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
            <div class="attribute-check__header">
              <label class="attribute-check__toggle">
                <input type="checkbox" class="edit-field" data-tier-field="attr-enabled" ${attribute.enabled ? "checked" : ""} />
                <span>Attribute Check</span>
              </label>
            </div>
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
  const isEditMode = document.body.classList.contains("edit-mode");
  const showBeforeEffect = isEditMode || Boolean(test.beforeEffect);
  const showAfterEffect = isEditMode || Boolean(test.additionalEffect);

  return `
    <div class="test" data-test-id="${test.id}">
      <header class="test__header">
        <div class="display-value action-name">${test.label || "Test"}</div>
        <input class="edit-field" type="hidden" data-test-field="label" value="${test.label || ""}" />
        <button class="icon-btn edit-only" data-remove-test="${test.id}" aria-label="Remove test">✕</button>
      </header>
      ${
        showBeforeEffect
          ? `
              <div class="effect-block test__effects">
                <div class="effect-block__title">Effects</div>
                <p class="display-value">${formatMultiline(test.beforeEffect)}</p>
                <textarea class="edit-field" rows="2" data-test-field="beforeEffect" placeholder="Effects before the test">${
                  test.beforeEffect || ""
                }</textarea>
              </div>
            `
          : ""
      }
      <div class="test__roll">
        <div class="display-value">${formatRoll(test.rollMod)}</div>
        <span class="test__dice edit-only">2d10 +</span>
        <input type="number" class="edit-field" data-test-field="rollMod" value="${test.rollMod}" />
      </div>
      <div class="test__tiers">
        ${TEST_TIERS.map(({ key, label }) => renderTierSection(label, test.tiers?.[key] || defaultTestTier(), key)).join("")}
      </div>
      ${
        showAfterEffect
          ? `
              <div class="effect-block test__effects">
                <div class="effect-block__title">Effects</div>
                <p class="display-value">${formatMultiline(test.additionalEffect)}</p>
                <textarea class="edit-field" rows="2" data-test-field="additionalEffect" placeholder="Additional effects after the test">${
                  test.additionalEffect || ""
                }</textarea>
              </div>
            `
          : ""
      }
    </div>
  `;
}

function renderActionSection(type, containerId) {
  const actions = sheetState.actions[type] || [];
  const container = document.getElementById(containerId);
  const isEditMode = document.body.classList.contains("edit-mode");
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
          (action) => {
            const rangeValue = (action.range || "").trim();
            const targetValue = (action.target || "").trim();
            const triggerValue = (action.trigger || "").trim();
            const costValue = (action.cost || "").trim();
            const metaFields = [
              {
                key: "range",
                label: "Range",
                symbol: "\uD83C\uDFF9",
                value: rangeValue,
                inputValue: action.range || "",
              },
              {
                key: "target",
                label: "Target",
                symbol: "\uD83C\uDFAF",
                value: targetValue,
                inputValue: action.target || "",
              },
              ...(type === "triggers"
                ? [
                    {
                      key: "trigger",
                      label: "Trigger",
                      symbol: "\uD83D\uDD2B",
                      value: triggerValue,
                      inputValue: action.trigger || "",
                    },
                  ]
                : []),
              {
                key: "cost",
                label: "Cost",
                symbol: "\u2728",
                value: costValue,
                inputValue: action.cost || "",
              },
            ];

            const metaMarkup = metaFields
              .filter((field) => isEditMode || field.value)
              .map(
                (field) => `
                <div class="meta-field">
                  <span class="meta-label">${field.label} ${field.symbol}</span>
                  <span class="display-value">${field.value || "-"}</span>
                  <input class="edit-field" type="text" data-field="${field.key}" value="${field.inputValue}" />
                </div>
              `
              )
              .join("");

            const useWhenValue = (action.useWhen || "").trim();
            return `
            <article class="action-card action-card--collapsed" data-action-id="${action.id}" data-action-type="${type}">
              <header class="card-head">
                <div class="card-head__left">
                  <div class="display-value action-name" data-action-toggle>${action.name || "New Action"}</div>
                  <input class="edit-field" type="text" data-field="name" value="${action.name || ""}" />
                  <div class="use-when-row">
                    <span class="use-when-label display-value">Use when:</span>
                    <span class="use-when-value display-value">${useWhenValue || "-"}</span>
                    <input class="edit-field use-when-input" type="text" data-field="useWhen" value="${action.useWhen || ""}" placeholder="When to use this ability..." />
                  </div>
                  <div class="chip-row display-value action-collapsible">
                    <span class="chip chip--tone">${action.actionLabel || "Action"}</span>
                    ${(action.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}
                  </div>
                  <input class="edit-field" type="text" data-field="actionLabel" value="${action.actionLabel || ""}" placeholder="Action label" />
                  <input class="edit-field" type="text" data-field="tags" value="${(action.tags || []).join(", ")}" placeholder="Tags" />
                </div>
                <span class="chat-dot-wrap"><button class="chat-dot" type="button" aria-label="Post to chat" data-chat-type="action" data-chat-id="${action.id}" data-chat-action-type="${type}"></button></span>
                <button class="icon-btn edit-only" data-remove-action="${action.id}" aria-label="Remove action">✕</button>
              </header>
              <div class="action-label display-value action-collapsible">${action.actionLabel || "Action"}</div>
              <div class="action-meta action-collapsible">
                ${metaMarkup}
              </div>
              <div class="test-list action-collapsible">
                ${
                  (action.tests || []).length
                    ? (action.tests || []).map((test) => renderTest(test)).join("")
                    : isEditMode
                      ? '<div class="placeholder">No tests yet. Switch to edit mode to add one.</div>'
                      : ""
                }
              </div>
              ${
                (action.tests || []).length || !isEditMode
                  ? ""
                  : `<button class="text-btn edit-only action-collapsible" data-add-test="${action.id}">+ Add Test</button>`
              }
              <div class="action-notes action-collapsible">
                <div class="display-value rich-text-display">${renderRichText(action.description || "")}</div>
                <div class="rich-text-wrapper">
                  <div class="rich-toolbar edit-only" role="toolbar" aria-label="Action notes formatting">
                    <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="bold" aria-label="Bold">
                      <strong>B</strong>
                    </button>
                    <button class="icon-btn rich-toolbar__btn" type="button" data-rich-command="underline" aria-label="Underline">
                      <span class="rich-toolbar__underline">U</span>
                    </button>
                  </div>
                  <div
                    class="rich-text-editor edit-field"
                    data-field="description"
                    contenteditable="true"
                    data-placeholder="Additional notes"
                  >${renderRichText(action.description || "")}</div>
                </div>
              </div>
            </article>
          `;
          }
        )
        .join("")}
    </div>
    <button class="text-btn edit-only" data-add-action="${type}">+ Add ${type.slice(0, 1).toUpperCase() + type.slice(1)}</button>
  `;

  bindActionAdds();
  bindActionRemovals();
  bindActionToggles();
  bindTestAdds();
  bindTestRemovals();
  bindAttributeToggles();
  bindRichTextToolbars();
  bindChatDots();
}

function renderSidebarLists() {
  renderCommonThings();
  const weakContainer = document.getElementById("sidebar-weaknesses");
  if (weakContainer) {
    const vulnerabilities = sheetState.sidebar.lists.vulnerability || [];
    const immunities = sheetState.sidebar.lists.immunity || [];
    weakContainer.innerHTML = `
      <div class="sidebar__header">Vulnerability &amp; Immunity <span class="chat-dot-wrap"><button class="chat-dot chat-dot--section" type="button" aria-label="Post vulnerabilities and immunities to chat" data-chat-type="vuln-immunity"></button></span></div>
      <div class="sidebar__content">
        <div class="sub-section">
          <div class="sub-section__title">Vulnerability</div>
          <ul class="display-list">${vulnerabilities
            .map((item) => `<li>${item}</li>`)
            .join("") || '<li class="muted">List vulnerabilities here.</li>'}</ul>
          <textarea class="edit-field" rows="3" data-list="vulnerability" placeholder="List vulnerabilities">${vulnerabilities.join(
            "\n"
          )}</textarea>
        </div>
        <div class="sub-section">
          <div class="sub-section__title">Immunity</div>
          <ul class="display-list">${immunities
            .map((item) => `<li>${item}</li>`)
            .join("") || '<li class="muted">List immunities here.</li>'}</ul>
          <textarea class="edit-field" rows="3" data-list="immunity" placeholder="List immunities">${immunities.join(
            "\n"
          )}</textarea>
        </div>
      </div>
    `;
    bindChatDots();
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
  updateResourceDisplays();
  bindTokenButtons();
  bindResourceControls();
  bindRichTextToolbars();
}

function bindTokenButtons() {
  document.querySelectorAll(".token-dot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.tokenIndex);
      showHeroTokenConfirmation(btn, index);
    });
  });
}

function bindFeatureAdd() {
  const addBtn = document.getElementById("add-feature");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    captureFeatures();
    sheetState.features.push({ id: createId("feature"), title: "", tags: [], text: "", isWide: false });
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

function bindFeatureMoves() {
  document.querySelectorAll("[data-move-feature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-feature-id");
      const direction = btn.getAttribute("data-move-feature");
      if (!id || !direction) return;
      captureFeatures();
      const index = sheetState.features.findIndex((feature) => feature.id === id);
      if (index === -1) return;
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= sheetState.features.length) return;
      const updated = [...sheetState.features];
      [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
      sheetState.features = updated;
      renderFeatures();
      queueAutoSave();
    });
  });
}

function bindFeatureWidthToggles() {
  document.querySelectorAll("[data-toggle-feature-width]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-feature-id");
      if (!id) return;
      captureFeatures();
      const feature = sheetState.features.find((item) => item.id === id);
      if (!feature) return;
      feature.isWide = !feature.isWide;
      renderFeatures();
      queueAutoSave();
    });
  });
}

function bindCommonAdds() {
  document.querySelectorAll("[data-add-common]").forEach((btn) => {
    btn.onclick = () => {
      captureCommonThings();
      sheetState.sidebar.lists.common.push(defaultCommonThing());
      renderCommonThings();
      queueAutoSave();
    };
  });
}

function bindCommonRemovals() {
  document.querySelectorAll("[data-remove-common]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-remove-common");
      captureCommonThings();
      sheetState.sidebar.lists.common = (sheetState.sidebar.lists.common || []).filter(
        (thing) => thing.id !== id
      );
      renderCommonThings();
      queueAutoSave();
    };
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

function bindActionToggles() {
  document.querySelectorAll("[data-action-toggle]").forEach((toggle) => {
    toggle.onclick = (e) => {
      // Don't toggle if clicking on edit input
      if (e.target.classList.contains("edit-field")) return;

      const card = toggle.closest(".action-card");
      if (!card) return;

      const grid = card.closest(".action-grid");
      if (!grid) return;

      const allCards = Array.from(grid.querySelectorAll(".action-card"));
      const isCurrentlyCollapsed = card.classList.contains("action-card--collapsed");

      if (isCurrentlyCollapsed) {
        // Opening this card - find cards in the same row
        const cardRect = card.getBoundingClientRect();
        const sameRowCards = allCards.filter((c) => {
          const rect = c.getBoundingClientRect();
          // Cards are in same row if their tops are within 10px of each other
          return Math.abs(rect.top - cardRect.top) < 10;
        });

        // Count how many cards are currently expanded
        const expandedCards = allCards.filter((c) => !c.classList.contains("action-card--collapsed"));

        if (expandedCards.length > 0) {
          // At least one card is already open, opening another means open ALL
          allCards.forEach((c) => c.classList.remove("action-card--collapsed"));
        } else {
          // No cards open yet, open this row
          sameRowCards.forEach((c) => c.classList.remove("action-card--collapsed"));
        }
      } else {
        // Closing this card - close ALL cards
        allCards.forEach((c) => c.classList.add("action-card--collapsed"));
      }
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

function bindRichTextToolbars() {
  document.querySelectorAll("[data-rich-command]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      const command = button.getAttribute("data-rich-command");
      if (!command) return;
      const editor = button.closest(".rich-text-wrapper")?.querySelector(".rich-text-editor");
      if (!editor) return;
      editor.focus();
      document.execCommand(command, false, null);
    };
  });
}

function captureCoreFields() {
  document.querySelectorAll("[data-model]").forEach((el) => {
    const path = el.getAttribute("data-model");
    let value = el.value;
    if (el.classList.contains("rich-text-editor")) {
      value = sanitizeRichText(normalizeRichText(el.innerHTML));
    }
    if (el.type === "number") {
      value = el.value === "" ? "" : Number(el.value);
    }
    if (["hero.vitals.currentStamina", "hero.vitals.currentRecoveries"].includes(path)) {
      value = value === "" ? "" : Number(value);
      if (path === "hero.vitals.currentStamina" && value !== "") {
        updateStaminaHistory(value);
        const staminaMax = Number(sheetState.hero.vitals.staminaMax) || 0;
        if (value > staminaMax) {
          triggerTempStaminaFlash();
        }
      }
    }
    setByPath(path, value);
  });

  // Keep hero resource title aligned with sidebar title
  sheetState.sidebar.resource.title = sheetState.hero.resource.title;

  document.querySelectorAll("[data-list]").forEach((textarea) => {
    const key = textarea.getAttribute("data-list");
    if (key === "common") return;
    sheetState.sidebar.lists[key] = textarea.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  });

  const updatedSkills = {};
  document.querySelectorAll("[data-skill-row]").forEach((row) => {
    const skill = row.getAttribute("data-skill-row");
    if (!skill) return;
    const bonusInput = row.querySelector("[data-skill-bonus]");
    updatedSkills[skill] = {
      level: "Trained",
      bonus: bonusInput?.value || "",
    };
  });
  sheetState.sidebar.skills = updatedSkills;
}

function captureCommonThings() {
  const cards = document.querySelectorAll(".common-card");
  const updated = [];

  cards.forEach((card) => {
    const id = card.getAttribute("data-common-id") || createId("common");
    const title = card.querySelector('[data-common-field="title"]')?.value || "";
    const details = card.querySelector('[data-common-field="details"]')?.innerHTML || "";
    updated.push({ id, title, details: sanitizeRichText(normalizeRichText(details)) });
  });

  sheetState.sidebar.lists.common = updated;
}

function captureFeatures() {
  const cards = document.querySelectorAll(".feature-card");
  const updated = [];
  cards.forEach((card) => {
    const id = card.getAttribute("data-feature-id") || createId("feature");
    const title = card.querySelector('[data-field="title"]').value;
    const tagsValue = card.querySelector('[data-field="tags"]').value;
    const text = card.querySelector('[data-field="text"]')?.innerHTML || "";
    updated.push({
      id,
      title,
      tags: tagsValue
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      text: sanitizeRichText(normalizeRichText(text)),
      isWide: card.classList.contains("feature-card--wide"),
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
          beforeEffect: testEl.querySelector('[data-test-field="beforeEffect"]')?.value || "",
          additionalEffect: testEl.querySelector('[data-test-field="additionalEffect"]')?.value || "",
          tiers,
        };
      });
      updated.push({
        id,
        name: getField("name")?.value || "",
        actionLabel: getField("actionLabel")?.value || "",
        useWhen: getField("useWhen")?.value || "",
        tags: (getField("tags")?.value || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        range: getField("range")?.value || "",
        target: getField("target")?.value || "",
        cost: getField("cost")?.value || "",
        description: sanitizeRichText(normalizeRichText(getField("description")?.innerHTML || "")),
        tests,
        ...(type === "triggers"
          ? {
              trigger: getField("trigger")?.value || "",
            }
          : {}),
      });
    });
    sheetState.actions[type] = updated;
  });
}

function captureAllSections() {
  captureCoreFields();
  captureCommonThings();
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
    if (target.classList.contains("edit-field")) {
      queueAutoSave();
    }
  };

  document.addEventListener("input", handler, true);
  document.addEventListener("change", handler, true);
}

function updateHeading() {
  const heading = document.getElementById("hero-name-heading");
  if (!heading) return;
  const hero = sheetState.hero;
  const name = hero.name || "Tableside Hero View";
  const details = [hero.level ? `Lvl ${hero.level}` : "", hero.class || "", hero.classTrack || ""].filter(Boolean).join(" \u2022 ");
  heading.innerHTML = name + (details ? ` <span class="hero-heading-details">${details}</span>` : "");
}

function toggleEditMode(enabled) {
  document.body.classList.toggle("edit-mode", enabled);
  document.querySelectorAll(".edit-field").forEach((input) => {
    if (input.dataset.liveEdit === "true") return;
    input.disabled = !enabled;
  });
  document.querySelectorAll(".rich-text-editor").forEach((editor) => {
    editor.contentEditable = enabled ? "true" : "false";
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
    toggleEditMode(enabled);
    if (enabled) {
      renderAll();
    }
    if (!enabled) {
      captureAllSections();
      renderAll();
      saveSheet();
    }
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

/* ─── Post-to-Chat System ─── */

const CHAT_API = "/dnd/chat_handler.php";

async function sendToChat(text) {
  const params = new URLSearchParams();
  params.append("action", "chat_send");
  params.append("message", text);
  try {
    const response = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!response.ok) throw new Error("Chat send failed");
    const data = await response.json();
    return Boolean(data && data.success);
  } catch (error) {
    console.warn("Failed to post to chat", error);
    return false;
  }
}

function showChatToast(text) {
  const existing = document.querySelector(".chat-post-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "chat-post-toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  toast.addEventListener("animationend", () => toast.remove());
}

function stripHtmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

function clearChatDotConfirmations() {
  document.querySelectorAll(".chat-dot-confirm").forEach((el) => el.remove());
}

function showChatDotConfirm(dotWrap, onConfirm) {
  clearChatDotConfirmations();
  const confirm = document.createElement("div");
  confirm.className = "chat-dot-confirm";
  confirm.innerHTML = `
    <div class="chat-dot-confirm__text">Post to chat?</div>
    <div class="chat-dot-confirm__actions">
      <button class="chat-dot-confirm__btn chat-dot-confirm__btn--yes" data-chat-yes>Yes</button>
      <button class="chat-dot-confirm__btn" data-chat-no>No</button>
    </div>
  `;
  dotWrap.appendChild(confirm);

  confirm.querySelector("[data-chat-no]").addEventListener("click", (e) => {
    e.stopPropagation();
    confirm.remove();
  });
  confirm.querySelector("[data-chat-yes]").addEventListener("click", async (e) => {
    e.stopPropagation();
    confirm.remove();
    await onConfirm();
  });

  const dismiss = (e) => {
    if (!dotWrap.contains(e.target)) {
      confirm.remove();
      document.removeEventListener("pointerdown", dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", dismiss, true), 0);
}

function chatDotHtml(extraClass) {
  const cls = extraClass ? `chat-dot ${extraClass}` : "chat-dot";
  return `<span class="chat-dot-wrap"><button class="${cls}" type="button" aria-label="Post to chat"></button></span>`;
}

/* ─── Chat formatting helpers ─── */

function formatActionForChat(action, type) {
  const heroName = sheetState.hero.name || "Hero";
  const name = action.name || "Unnamed Action";
  const labelMap = { mains: "Action", maneuvers: "Maneuver", triggers: "Triggered Action", freeStrikes: "Free Strike" };
  const actionLabel = action.actionLabel || labelMap[type] || "Action";
  const tags = (action.tags || []).join(", ");

  const lines = [];
  lines.push(`${heroName} — ${name}`);
  lines.push(`Type: ${actionLabel}${tags ? " | " + tags : ""}`);

  if (action.range) lines.push(`Range: ${action.range}`);
  if (action.target) lines.push(`Target: ${action.target}`);
  if (type === "triggers" && action.trigger) lines.push(`Trigger: ${action.trigger}`);
  if (action.cost) lines.push(`Cost: ${action.cost}`);
  if (action.useWhen) lines.push(`Use When: ${action.useWhen}`);
  if (action.description) lines.push(`Effect: ${stripHtmlToText(action.description)}`);

  (action.tests || []).forEach((test) => {
    const testLabel = test.label || "Test";
    lines.push(`--- ${testLabel} (${formatRoll(test.rollMod)}) ---`);
    if (test.beforeEffect) lines.push(`Before: ${test.beforeEffect}`);
    for (const { key, label } of TEST_TIERS) {
      const tier = test.tiers?.[key];
      if (!tier) continue;
      const parts = [];
      if (tier.damage || tier.damageType) {
        parts.push(`${tier.damage || "-"} ${tier.damageType || ""}`.trim());
      }
      if (tier.notes) parts.push(tier.notes);
      if (tier.attributeCheck?.enabled) {
        const attr = tier.attributeCheck.attribute || "Attr";
        const thresh = tier.attributeCheck.threshold || "?";
        const eff = tier.attributeCheck.effect || "";
        parts.push(`${attr} \u2264 ${thresh}: ${eff}`);
      }
      if (parts.length) lines.push(`  ${label}: ${parts.join(" | ")}`);
    }
    if (test.additionalEffect) lines.push(`Additional: ${test.additionalEffect}`);
  });

  return lines.join("\n");
}

function formatFeatureForChat(feature) {
  const heroName = sheetState.hero.name || "Hero";
  const title = feature.title || "Untitled Feature";
  const tags = (feature.tags || []).join(", ");
  const body = stripHtmlToText(feature.text);

  const lines = [];
  lines.push(`${heroName} — ${title}`);
  if (tags) lines.push(`Tags: ${tags}`);
  if (body) lines.push(body);
  return lines.join("\n");
}

function formatSkillsForChat() {
  const heroName = sheetState.hero.name || "Hero";
  const skills = normalizeSkillsState(sheetState.sidebar.skills);
  const entries = Object.entries(skills);
  if (!entries.length) return null;

  const lines = [`${heroName} — Skills`];
  entries.forEach(([skill, data]) => {
    const group = getSkillGroup(skill);
    const bonus = formatBonusValue(data.bonus);
    lines.push(`  ${skill} (${group}) ${bonus}`);
  });
  return lines.join("\n");
}

function formatLanguagesForChat() {
  const heroName = sheetState.hero.name || "Hero";
  const languages = sheetState.sidebar.lists.languages || [];
  if (!languages.length) return null;

  return `${heroName} — Languages\n  ${languages.join(", ")}`;
}

function formatBackgroundForChat() {
  const hero = sheetState.hero;
  const heroName = hero.name || "Hero";
  const lines = [`${heroName} — Background`];

  if (hero.ancestry) lines.push(`Ancestry: ${hero.ancestry}`);
  if (hero.complication) lines.push(`Complication: ${hero.complication}`);

  const culture = hero.culture || {};
  const cultureParts = [];
  if (culture.culture) cultureParts.push(`Culture: ${culture.culture}`);
  if (culture.environment) cultureParts.push(`Environment: ${culture.environment}`);
  if (culture.organization) cultureParts.push(`Organization: ${culture.organization}`);
  if (culture.upbringing) cultureParts.push(`Upbringing: ${culture.upbringing}`);
  if (cultureParts.length) lines.push(...cultureParts);

  const career = hero.career || {};
  if (career.career) lines.push(`Career: ${career.career}`);
  if (career.incitingIncident) lines.push(`Inciting Incident: ${career.incitingIncident}`);

  return lines.length > 1 ? lines.join("\n") : null;
}

function formatCommonThingForChat(thing) {
  const heroName = sheetState.hero.name || "Hero";
  const title = thing.title || "Common Thing";
  const details = stripHtmlToText(thing.details);

  const lines = [`${heroName} — ${title}`];
  if (details) lines.push(details);
  return lines.join("\n");
}

function formatVulnImmunityForChat() {
  const heroName = sheetState.hero.name || "Hero";
  const vulns = sheetState.sidebar.lists.vulnerability || [];
  const immunes = sheetState.sidebar.lists.immunity || [];
  if (!vulns.length && !immunes.length) return null;

  const lines = [`${heroName} — Vulnerabilities & Immunities`];
  if (vulns.length) lines.push(`Vulnerable: ${vulns.join(", ")}`);
  if (immunes.length) lines.push(`Immune: ${immunes.join(", ")}`);
  return lines.join("\n");
}

/* ─── Bind post-to-chat dots ─── */

function bindChatDots(scope) {
  const root = scope || document;
  root.querySelectorAll(".chat-dot").forEach((dot) => {
    if (dot.dataset.chatBound) return;
    dot.dataset.chatBound = "1";
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = dot.closest(".chat-dot-wrap");
      if (!wrap) return;

      const dataType = dot.dataset.chatType;
      const dataId = dot.dataset.chatId;
      const dataActionType = dot.dataset.chatActionType;

      showChatDotConfirm(wrap, async () => {
        let text = null;
        if (dataType === "action") {
          const actions = sheetState.actions[dataActionType] || [];
          const action = actions.find((a) => a.id === dataId);
          if (action) text = formatActionForChat(action, dataActionType);
        } else if (dataType === "feature") {
          const feature = sheetState.features.find((f) => f.id === dataId);
          if (feature) text = formatFeatureForChat(feature);
        } else if (dataType === "skills") {
          text = formatSkillsForChat();
        } else if (dataType === "languages") {
          text = formatLanguagesForChat();
        } else if (dataType === "background") {
          text = formatBackgroundForChat();
        } else if (dataType === "common") {
          const commons = sheetState.sidebar.lists.common || [];
          const thing = commons.find((c) => c.id === dataId);
          if (thing) text = formatCommonThingForChat(thing);
        } else if (dataType === "vuln-immunity") {
          text = formatVulnImmunityForChat();
        }

        if (text) {
          const ok = await sendToChat(text);
          showChatToast(ok ? "Posted to chat" : "Failed to post");
        } else {
          showChatToast("Nothing to post");
        }
      });
    });
  });
}

async function ready() {
  activeCharacter = document.body.dataset.character || "";
  setupTabbing();
  bindEditToggle();
  bindAutoSave();
  await loadSheet();
  startStaminaSync();
  startHeroTokenSync();
  window.addEventListener("pagehide", stopStaminaSync);
  window.addEventListener("pagehide", stopHeroTokenSync);
}

document.addEventListener("DOMContentLoaded", ready);
