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
    resourceValue: "",
    stamina: 0,
    recovery: 0,
  },
  resourceLabel: "",
  sidebar: {
    lists: {
      common: [],
      weaknesses: [],
      languages: [],
    },
    skills: {},
  },
  tokens: {
    heroic: false,
    legendary: false,
  },
  tabs: {
    hero: "",
    features: "",
    mains: "",
    maneuvers: "",
    triggers: "",
    "free-strikes": "",
  },
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let sheetState = deepClone(defaultSheet);
let activeCharacter = "";

function mergeWithDefaults(data) {
  const merged = deepClone(defaultSheet);
  if (!data || typeof data !== "object") return merged;

  if (data.hero && typeof data.hero === "object") {
    Object.assign(merged.hero, data.hero);
  }

  if (typeof data.resourceLabel === "string") {
    merged.resourceLabel = data.resourceLabel;
  }

  if (data.sidebar && typeof data.sidebar === "object") {
    if (data.sidebar.lists && typeof data.sidebar.lists === "object") {
      Object.keys(merged.sidebar.lists).forEach((key) => {
        if (Array.isArray(data.sidebar.lists[key])) {
          merged.sidebar.lists[key] = data.sidebar.lists[key];
        }
      });
    }

    if (data.sidebar.skills && typeof data.sidebar.skills === "object") {
      merged.sidebar.skills = data.sidebar.skills;
    }
  }

  if (data.tokens && typeof data.tokens === "object") {
    Object.keys(merged.tokens).forEach((token) => {
      merged.tokens[token] = Boolean(data.tokens[token]);
    });
  }

  if (data.tabs && typeof data.tabs === "object") {
    merged.tabs = { ...merged.tabs, ...data.tabs };
  }

  return merged;
}

function select(el, selector) {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Missing element for selector: ${selector}`);
  return result;
}

function getFieldValue(key) {
  switch (key) {
    case "name":
      return sheetState.hero.name || "";
    case "level":
      return sheetState.hero.level ?? "";
    case "class":
      return sheetState.hero.class || "";
    case "complication":
      return sheetState.hero.complication || "";
    case "ancestry":
      return sheetState.hero.ancestry || "";
    case "culture":
      return sheetState.hero.culture || "";
    case "career":
      return sheetState.hero.career || "";
    case "classTrack":
      return sheetState.hero.classTrack || "";
    case "resourceLabel":
      return sheetState.resourceLabel || "";
    case "resourceValue":
      return sheetState.hero.resourceValue || "";
    case "stamina":
      return sheetState.hero.stamina ?? 0;
    case "recovery":
      return sheetState.hero.recovery ?? 0;
    default:
      return "";
  }
}

function setFieldValue(key, value) {
  switch (key) {
    case "name":
      sheetState.hero.name = value;
      break;
    case "level":
      sheetState.hero.level = Number(value) || 0;
      break;
    case "class":
      sheetState.hero.class = value;
      break;
    case "complication":
      sheetState.hero.complication = value;
      break;
    case "ancestry":
      sheetState.hero.ancestry = value;
      break;
    case "culture":
      sheetState.hero.culture = value;
      break;
    case "career":
      sheetState.hero.career = value;
      break;
    case "classTrack":
      sheetState.hero.classTrack = value;
      break;
    case "resourceLabel":
      sheetState.resourceLabel = value;
      break;
    case "resourceValue":
      sheetState.hero.resourceValue = value;
      break;
    case "stamina":
      sheetState.hero.stamina = Number(value) || 0;
      break;
    case "recovery":
      sheetState.hero.recovery = Number(value) || 0;
      break;
    default:
      break;
  }
}

function hydrateFields() {
  document.querySelectorAll(".editable-field").forEach((field) => {
    const key = field.dataset.field;
    const span = select(field, ".value");
    const input = select(field, "input");
    const value = getFieldValue(key);
    span.textContent = value;
    input.value = value;
  });
}

function hydrateLists() {
  document.querySelectorAll(".editable-list").forEach((block) => {
    const key = block.dataset.list;
    const list = block.querySelector("ul");
    const textarea = select(block, ".edit-input");
    const values = sheetState.sidebar.lists[key] || [];
    list.innerHTML = values.map((item) => `<li>${item}</li>`).join("");
    textarea.value = values.join("\n");
  });
}

function hydrateTokens() {
  document.querySelectorAll(".token").forEach((token) => {
    const key = token.dataset.token;
    const checkbox = select(token, "input[type='checkbox']");
    checkbox.checked = !!sheetState.tokens[key];
  });
}

function hydrateSkills() {
  document.querySelectorAll(".skill").forEach((skillEl) => {
    const key = skillEl.dataset.skill;
    const selectEl = select(skillEl, "select");
    selectEl.value = sheetState.sidebar.skills[key] || "Untrained";
  });
}

function hydrateBars() {
  const staminaFill = document.querySelector("[data-bar='stamina']");
  const recoveryFill = document.querySelector("[data-bar='recovery']");
  const staminaValue = Math.min(Math.max(sheetState.hero.stamina, 0), 100);
  const recoveryValue = Math.min(Math.max(sheetState.hero.recovery, 0), 100);
  staminaFill.style.width = `${staminaValue}%`;
  recoveryFill.style.width = `${recoveryValue}%`;
}

function toggleEditMode(enabled) {
  document.body.classList.toggle("edit-mode", enabled);
  const lists = document.querySelectorAll(".editable-list .edit-input");
  lists.forEach((input) => (input.disabled = !enabled));
  document.querySelectorAll(".editable-field input").forEach((input) => {
    input.disabled = !enabled;
  });
  document.querySelectorAll(".skill-select").forEach((select) => {
    select.disabled = !enabled;
  });
  document.querySelectorAll(".token input[type='checkbox']").forEach((checkbox) => {
    checkbox.disabled = !enabled;
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
    if (!enabled) {
      captureInputs();
      render();
      saveSheet();
    }
  });
}

function captureInputs() {
  document.querySelectorAll(".editable-field").forEach((field) => {
    const key = field.dataset.field;
    const input = select(field, "input");
    setFieldValue(key, input.value);
  });

  document.querySelectorAll(".editable-list").forEach((block) => {
    const key = block.dataset.list;
    const textarea = select(block, ".edit-input");
    sheetState.sidebar.lists[key] = textarea.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  });

  document.querySelectorAll(".token").forEach((token) => {
    const key = token.dataset.token;
    const checkbox = select(token, "input[type='checkbox']");
    sheetState.tokens[key] = checkbox.checked;
  });

  document.querySelectorAll(".skill").forEach((skillEl) => {
    const key = skillEl.dataset.skill;
    const selectEl = select(skillEl, "select");
    sheetState.sidebar.skills[key] = selectEl.value;
  });
}

function render() {
  hydrateFields();
  hydrateLists();
  hydrateTokens();
  hydrateSkills();
  hydrateBars();
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
      console.warn("Failed to load sheet", result.error);
      sheetState = deepClone(defaultSheet);
    }
  } catch (error) {
    console.error("Error loading sheet", error);
    sheetState = deepClone(defaultSheet);
  }

  render();
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
  toggleEditMode(false);
  await loadSheet();
}

document.addEventListener("DOMContentLoaded", ready);
