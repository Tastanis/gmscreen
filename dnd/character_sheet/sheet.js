const initialData = {
  name: "Wren Farrow",
  level: 5,
  class: "Bladecaller",
  complication: "Debt to the Guild",
  ancestry: "Human",
  culture: "Frontier",
  career: "Scout",
  classTrack: "Storm Edge",
  resourceLabel: "Focus Pool",
  resourceValue: "3 / 5",
  stamina: 78,
  recovery: 42,
  tokens: {
    heroic: true,
    legendary: false,
  },
  lists: {
    common: ["Bedroll", "Flint & steel", "Waystone shard"],
    weaknesses: ["Claustrophobic tunnels", "Glares in bright sun"],
    languages: ["Common", "Sylvan"],
  },
  skills: {
    acrobatics: "Trained",
    arcana: "Expert",
    athletics: "Master",
  },
};

const formState = JSON.parse(JSON.stringify(initialData));

function select(el, selector) {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Missing element for selector: ${selector}`);
  return result;
}

function hydrateFields() {
  document.querySelectorAll(".editable-field").forEach((field) => {
    const key = field.dataset.field;
    const span = select(field, ".value");
    const input = select(field, "input");
    const value = formState[key] ?? "";
    span.textContent = value;
    input.value = value;
  });
}

function hydrateLists() {
  document.querySelectorAll(".editable-list").forEach((block) => {
    const key = block.dataset.list;
    const list = block.querySelector("ul");
    const textarea = select(block, ".edit-input");
    const values = formState.lists[key] || [];
    list.innerHTML = values.map((item) => `<li>${item}</li>`).join("");
    textarea.value = values.join("\n");
  });
}

function hydrateTokens() {
  document.querySelectorAll(".token").forEach((token) => {
    const key = token.dataset.token;
    const checkbox = select(token, "input[type='checkbox']");
    checkbox.checked = !!formState.tokens[key];
  });
}

function hydrateSkills() {
  document.querySelectorAll(".skill").forEach((skillEl) => {
    const key = skillEl.dataset.skill;
    const selectEl = select(skillEl, "select");
    selectEl.value = formState.skills[key] || "Untrained";
  });
}

function hydrateBars() {
  const staminaFill = document.querySelector("[data-bar='stamina']");
  const recoveryFill = document.querySelector("[data-bar='recovery']");
  const staminaValue = Math.min(Math.max(formState.stamina, 0), 100);
  const recoveryValue = Math.min(Math.max(formState.recovery, 0), 100);
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
    }
  });
}

function captureInputs() {
  document.querySelectorAll(".editable-field").forEach((field) => {
    const key = field.dataset.field;
    const input = select(field, "input");
    formState[key] = input.value;
  });

  document.querySelectorAll(".editable-list").forEach((block) => {
    const key = block.dataset.list;
    const textarea = select(block, ".edit-input");
    formState.lists[key] = textarea.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  });

  document.querySelectorAll(".token").forEach((token) => {
    const key = token.dataset.token;
    const checkbox = select(token, "input[type='checkbox']");
    formState.tokens[key] = checkbox.checked;
  });

  document.querySelectorAll(".skill").forEach((skillEl) => {
    const key = skillEl.dataset.skill;
    const selectEl = select(skillEl, "select");
    formState.skills[key] = selectEl.value;
  });
}

function render() {
  hydrateFields();
  hydrateLists();
  hydrateTokens();
  hydrateSkills();
  hydrateBars();
}

function ready() {
  hydrateFields();
  hydrateLists();
  hydrateTokens();
  hydrateSkills();
  hydrateBars();
  setupTabbing();
  bindEditToggle();
  toggleEditMode(false);
}

document.addEventListener("DOMContentLoaded", ready);
