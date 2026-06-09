// Character Sheet Inventory Tab
// Renders items as compact icons that expand in place into detail cards.
// Cards are read-only until the sheet's Edit Mode toggle is enabled.
(function () {
  "use strict";

  var HANDLER_URL = "inventory_handler.php";
  var SYNC_INTERVAL_MS = 4000;
  var SAVE_DEBOUNCE_MS = 800;
  var CHARACTER_TABS = ["cal", "sharon", "indigo", "zepha"];

  var ciData = {};
  var ciFolder = "";
  var ciOpen = {};
  var ciLastModified = null;
  var ciLoaded = false;
  var ciSaveTimeouts = {};
  var ciPendingSaves = 0;
  var ciUploadItemId = "";
  var ciSyncTimer = null;

  var pane = null;
  var activeCharacter = "";
  var currentUser = "";
  var isGM = false;

  function escapeHtml(text) {
    if (typeof text !== "string") return "";
    return text.replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
    });
  }

  function isEditMode() {
    return document.body.classList.contains("edit-mode");
  }

  function canEditFolder(folder) {
    if (isGM) return true;
    if (folder === currentUser) return true;
    if (folder === "shared") return true;
    return false;
  }

  function folderLabel(folder) {
    if (folder === "gm") return "GM";
    if (folder === "shared") return "Shared";
    return folder.charAt(0).toUpperCase() + folder.slice(1);
  }

  function getFolders() {
    var folders = [];
    if (CHARACTER_TABS.indexOf(activeCharacter) !== -1) {
      folders.push(activeCharacter);
    } else if (isGM) {
      folders = folders.concat(CHARACTER_TABS);
    }
    folders.push("shared");
    folders.push("gm");
    return folders;
  }

  function getItems(folder) {
    if (!ciData[folder] || !Array.isArray(ciData[folder].items)) return [];
    return ciData[folder].items;
  }

  function findItem(folder, itemId) {
    var items = getItems(folder);
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === itemId) return items[i];
    }
    return null;
  }

  function createSectionId() {
    return "effect_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8);
  }

  function normalizeSections(item) {
    if (!item) return [];
    var raw = Array.isArray(item.effectSections) ? item.effectSections : [];
    var sections = [];
    raw.forEach(function (section) {
      if (!section || typeof section !== "object") return;
      sections.push({
        id: String(section.id || createSectionId()),
        title: String(section.title || ""),
        cost: String(section.cost || ""),
        text: String(section.text || "")
      });
    });
    if (!sections.length && item.effect) {
      sections.push({ id: createSectionId(), title: "Effect", cost: "", text: String(item.effect) });
    }
    item.effectSections = sections;
    return sections;
  }

  function meaningfulSections(item) {
    return normalizeSections(item).filter(function (section) {
      return section.title.trim() || section.cost.trim() || section.text.trim();
    });
  }

  // ---------------------------------------------------------------------
  // Server communication
  // ---------------------------------------------------------------------

  function post(body, onDone) {
    ciPendingSaves++;
    fetch(HANDLER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "same-origin",
      body: body.toString()
    })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        ciPendingSaves--;
        if (!result.success) {
          showStatus("Error: " + (result.error || "Unknown error"), "error");
        }
        if (onDone) onDone(result);
      })
      .catch(function (error) {
        ciPendingSaves--;
        console.error("Inventory request failed", error);
        showStatus("Network error", "error");
        if (onDone) onDone({ success: false, error: "network" });
      });
  }

  function loadData(options) {
    options = options || {};
    var params = new URLSearchParams();
    params.append("action", "load");

    post(params, function (result) {
      if (!result.success || !result.data) return;
      if (options.onlyIfModified && result.last_modified && ciLastModified === result.last_modified) {
        return;
      }
      ciLastModified = result.last_modified || null;
      ciData = result.data;
      ciLoaded = true;
      render();
    });
  }

  function queueFieldSave(folder, itemId, field, value) {
    var key = folder + ":" + itemId + ":" + field;
    if (ciSaveTimeouts[key]) clearTimeout(ciSaveTimeouts[key]);
    ciSaveTimeouts[key] = setTimeout(function () {
      delete ciSaveTimeouts[key];
      saveFieldNow(folder, itemId, field, value());
    }, SAVE_DEBOUNCE_MS);
  }

  function saveFieldNow(folder, itemId, field, value) {
    var params = new URLSearchParams();
    params.append("action", "update_item_field");
    params.append("tab", folder);
    params.append("item_id", itemId);
    params.append("field", field);
    params.append("value", value);
    post(params);
  }

  function flushPendingSaves() {
    Object.keys(ciSaveTimeouts).forEach(function (key) {
      clearTimeout(ciSaveTimeouts[key]);
      delete ciSaveTimeouts[key];
      var parts = key.split(":");
      var folder = parts[0];
      var itemId = parts[1];
      var field = parts.slice(2).join(":");
      var item = findItem(folder, itemId);
      if (!item) return;
      var value = field === "effectSections" ? JSON.stringify(item.effectSections || []) : String(item[field] || "");
      saveFieldNow(folder, itemId, field, value);
    });
  }

  function hasUnsavedEdits() {
    return Object.keys(ciSaveTimeouts).length > 0 || ciPendingSaves > 0;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  function render() {
    if (!pane || !ciLoaded) return;

    var folders = getFolders();
    if (folders.indexOf(ciFolder) === -1) {
      ciFolder = folders[0];
    }

    var editMode = isEditMode();
    var canEdit = canEditFolder(ciFolder);
    var items = getItems(ciFolder);

    var folderButtons = folders
      .map(function (folder) {
        return (
          '<button type="button" class="ci-folder' +
          (folder === ciFolder ? " ci-folder--active" : "") +
          '" data-ci-action="folder" data-folder="' + escapeHtml(folder) + '">' +
          escapeHtml(folderLabel(folder)) +
          "</button>"
        );
      })
      .join("");

    var hiddenCount = isGM
      ? items.filter(function (item) { return item && item.visible === false; }).length
      : 0;
    var countText = items.length + " item" + (items.length !== 1 ? "s" : "");
    if (hiddenCount > 0) {
      countText += " (" + hiddenCount + " hidden)";
    }

    var toolButtons = "";
    if (editMode && canEdit) {
      toolButtons += '<button type="button" class="ci-btn ci-btn--add" data-ci-action="add">+ Add Item</button>';
    }
    if (isGM) {
      toolButtons += '<button type="button" class="ci-btn" data-ci-action="import" title="Copy all items from the dashboard inventory into this one">Import Dashboard Items</button>';
    }

    var grid = items.map(function (item) { return renderItem(item, editMode, canEdit); }).join("");
    if (!items.length) {
      grid = '<div class="ci-empty">No items in ' + escapeHtml(folderLabel(ciFolder)) + " yet.</div>";
    }

    pane.innerHTML =
      '<div class="ci">' +
      '<div class="ci__bar">' +
      '<div class="ci__folders">' + folderButtons + "</div>" +
      '<div class="ci__tools">' + toolButtons + '<span class="ci__count">' + escapeHtml(countText) + "</span></div>" +
      "</div>" +
      '<div class="ci__grid">' + grid + "</div>" +
      '<input type="file" class="ci__file" accept="image/*" hidden />' +
      "</div>";
  }

  function renderItem(item, editMode, canEdit) {
    if (!item || !item.id) return "";
    if (ciOpen[item.id]) {
      return renderCard(item, editMode, canEdit);
    }
    return renderTile(item);
  }

  function renderTile(item) {
    var hidden = isGM && item.visible === false;
    var icon = item.image
      ? '<img class="ci-tile__img" src="' + escapeHtml(item.image) + '" alt="" loading="lazy" />'
      : '<span class="ci-tile__placeholder">' + escapeHtml((item.name || "?").trim().charAt(0).toUpperCase() || "?") + "</span>";

    return (
      '<button type="button" class="ci-tile' + (hidden ? " ci-tile--hidden" : "") +
      '" data-ci-action="open" data-item-id="' + escapeHtml(item.id) + '" title="' + escapeHtml(item.name || "Unnamed Item") + '">' +
      '<span class="ci-tile__icon">' + icon + "</span>" +
      '<span class="ci-tile__name">' + escapeHtml(item.name || "Unnamed Item") + "</span>" +
      (hidden ? '<span class="ci-tile__badge">Hidden</span>' : "") +
      "</button>"
    );
  }

  function renderCard(item, editMode, canEdit) {
    var editable = editMode && canEdit;
    var sections = editable ? normalizeSections(item) : meaningfulSections(item);
    if (editable && !sections.length) {
      sections.push({ id: createSectionId(), title: "", cost: "", text: "" });
      item.effectSections = sections;
    }
    var wide = sections.length >= 3;
    var hidden = isGM && item.visible === false;

    var classes = "ci-card";
    if (wide) classes += " ci-card--wide";
    if (hidden) classes += " ci-card--hidden";
    if (editable) classes += " ci-card--editing";

    var html = '<div class="' + classes + '" data-item-id="' + escapeHtml(item.id) + '">';

    // Header
    html +=
      '<div class="ci-card__header">' +
      (item.image ? '<img class="ci-card__thumb" src="' + escapeHtml(item.image) + '" alt="" draggable="true" />' : "") +
      '<div class="ci-card__title">' +
      (editable
        ? '<input type="text" class="ci-input ci-card__name-input" data-ci-field="name" value="' + escapeHtml(item.name || "") + '" placeholder="Item name" />'
        : '<span class="ci-card__name">' + escapeHtml(item.name || "Unnamed Item") + "</span>") +
      (hidden ? '<span class="ci-card__badge">Hidden</span>' : "") +
      "</div>" +
      '<button type="button" class="ci-card__close" data-ci-action="close" data-item-id="' + escapeHtml(item.id) + '" aria-label="Collapse item">&times;</button>' +
      "</div>";

    html += '<div class="ci-card__body">';

    // Keywords
    if (editable) {
      html +=
        '<div class="ci-field"><label>Keywords</label>' +
        '<input type="text" class="ci-input" data-ci-field="keywords" value="' + escapeHtml(item.keywords || "") + '" placeholder="fire, sword, magical" /></div>';
    } else if ((item.keywords || "").trim()) {
      var chips = item.keywords
        .split(",")
        .map(function (keyword) { return keyword.trim(); })
        .filter(Boolean)
        .map(function (keyword) { return '<span class="ci-chip">' + escapeHtml(keyword) + "</span>"; })
        .join("");
      html += '<div class="ci-card__keywords">' + chips + "</div>";
    }

    // Description
    if (editable) {
      html +=
        '<div class="ci-field"><label>Description</label>' +
        '<textarea class="ci-input ci-textarea" data-ci-field="description" placeholder="Description">' + escapeHtml(item.description || "") + "</textarea></div>";
    } else if ((item.description || "").trim()) {
      html += '<div class="ci-card__description">' + escapeHtml(item.description) + "</div>";
    }

    // Effects
    if (sections.length || editable) {
      html += '<div class="ci-card__effects-head"><span>Effects</span>' +
        (editable ? '<button type="button" class="ci-btn ci-btn--small" data-ci-action="add-effect" data-item-id="' + escapeHtml(item.id) + '">+ Add Effect</button>' : "") +
        "</div>";
      html += '<div class="ci-card__effects">';
      sections.forEach(function (section) {
        html += renderEffectSection(section, editable);
      });
      html += "</div>";
    }

    html += "</div>"; // body

    // Footer actions
    var actions = "";
    if (editable) {
      actions += '<button type="button" class="ci-btn ci-btn--small" data-ci-action="upload-image" data-item-id="' + escapeHtml(item.id) + '">' + (item.image ? "Change Image" : "Add Image") + "</button>";
      if (isGM) {
        actions += '<button type="button" class="ci-btn ci-btn--small" data-ci-action="toggle-visibility" data-item-id="' + escapeHtml(item.id) + '">' + (item.visible === false ? "Show" : "Hide") + "</button>";
        actions += '<button type="button" class="ci-btn ci-btn--small" data-ci-action="duplicate" data-item-id="' + escapeHtml(item.id) + '">Copy Item</button>';
      }
      if (CHARACTER_TABS.indexOf(ciFolder) !== -1 && (ciFolder === currentUser || isGM)) {
        actions += '<button type="button" class="ci-btn ci-btn--small" data-ci-action="share" data-item-id="' + escapeHtml(item.id) + '">' + (isGM ? "Move to GM" : "Share") + "</button>";
      }
      actions += '<button type="button" class="ci-btn ci-btn--small ci-btn--danger" data-ci-action="delete" data-item-id="' + escapeHtml(item.id) + '">Delete</button>';
    }
    if (!isGM && (ciFolder === "gm" || ciFolder === "shared")) {
      actions += '<button type="button" class="ci-btn ci-btn--small ci-btn--take" data-ci-action="take" data-item-id="' + escapeHtml(item.id) + '">Take Item</button>';
    }
    if (actions) {
      html += '<div class="ci-card__actions">' + actions + "</div>";
    }

    html += "</div>";
    return html;
  }

  function renderEffectSection(section, editable) {
    if (editable) {
      return (
        '<div class="ci-effect ci-effect--editing" data-section-id="' + escapeHtml(section.id) + '">' +
        '<div class="ci-effect__head">' +
        '<input type="text" class="ci-input ci-effect__title" data-ci-sfield="title" value="' + escapeHtml(section.title) + '" placeholder="Effect title" />' +
        '<input type="text" class="ci-input ci-effect__cost" data-ci-sfield="cost" value="' + escapeHtml(section.cost) + '" placeholder="Cost" />' +
        '<button type="button" class="ci-effect__remove" data-ci-action="remove-effect" data-section-id="' + escapeHtml(section.id) + '" aria-label="Remove effect">&times;</button>' +
        "</div>" +
        '<textarea class="ci-input ci-textarea ci-effect__text" data-ci-sfield="text" placeholder="Effect text">' + escapeHtml(section.text) + "</textarea>" +
        "</div>"
      );
    }

    return (
      '<div class="ci-effect">' +
      '<div class="ci-effect__head"><strong>' + escapeHtml(section.title || "Effect") + "</strong>" +
      (section.cost ? '<span class="ci-effect__cost-label">' + escapeHtml(section.cost) + "</span>" : "") +
      "</div>" +
      '<div class="ci-effect__body">' + escapeHtml(section.text) + "</div>" +
      "</div>"
    );
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  function openItem(itemId) {
    ciOpen[itemId] = true;
    render();
  }

  function closeItem(itemId) {
    flushPendingSaves();
    delete ciOpen[itemId];
    render();
  }

  function addItem() {
    var folder = ciFolder;
    var params = new URLSearchParams();
    params.append("action", "add_item");
    params.append("tab", folder);
    post(params, function (result) {
      if (!result.success || !result.item) return;
      if (!ciData[folder]) ciData[folder] = { items: [] };
      ciData[folder].items.push(result.item);
      ciOpen[result.item.id] = true;
      render();
      var nameInput = pane.querySelector('.ci-card[data-item-id="' + result.item.id + '"] .ci-card__name-input');
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
    });
  }

  function importDashboard() {
    if (!confirm("Copy all items from the dashboard inventory into the character sheet inventory? Items that were already imported are skipped.")) {
      return;
    }
    var params = new URLSearchParams();
    params.append("action", "import_dashboard");
    showStatus("Importing items...", "loading");
    post(params, function (result) {
      if (!result.success) return;
      showStatus("Imported " + result.imported_total + " item(s)" + (result.skipped ? ", skipped " + result.skipped + " already imported" : ""), "success");
      loadData();
    });
  }

  function deleteItem(itemId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    if (!confirm('Delete "' + (item.name || "Unnamed Item") + '"?')) return;

    var folder = ciFolder;
    var params = new URLSearchParams();
    params.append("action", "delete_item");
    params.append("tab", folder);
    params.append("item_id", itemId);
    post(params, function (result) {
      if (!result.success) return;
      ciData[folder].items = getItems(folder).filter(function (entry) { return entry.id !== itemId; });
      delete ciOpen[itemId];
      render();
      showStatus("Item deleted", "success");
    });
  }

  function duplicateItem(itemId) {
    var folder = ciFolder;
    var params = new URLSearchParams();
    params.append("action", "duplicate_item");
    params.append("tab", folder);
    params.append("item_id", itemId);
    post(params, function (result) {
      if (!result.success || !result.item) return;
      ciData[folder].items.push(result.item);
      ciOpen[result.item.id] = true;
      render();
      showStatus("Item copied", "success");
    });
  }

  function toggleVisibility(itemId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    var newVisible = item.visible === false;
    item.visible = newVisible;
    render();
    saveFieldNow(ciFolder, itemId, "visible", newVisible ? "true" : "false");
  }

  function shareItem(itemId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    var target = isGM ? "GM folder" : "shared folder";
    if (!confirm('Move "' + (item.name || "Unnamed Item") + '" to the ' + target + "?")) return;

    var folder = ciFolder;
    var params = new URLSearchParams();
    params.append("action", "share_item");
    params.append("from_tab", folder);
    params.append("item_id", itemId);
    post(params, function (result) {
      if (!result.success || !result.item) return;
      ciData[folder].items = getItems(folder).filter(function (entry) { return entry.id !== itemId; });
      delete ciOpen[itemId];
      var toTab = result.to_tab;
      if (!ciData[toTab]) ciData[toTab] = { items: [] };
      ciData[toTab].items.push(result.item);
      render();
      showStatus('Moved "' + (result.item.name || "item") + '" to ' + target, "success");
    });
  }

  function takeItem(itemId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    if (!confirm('Take "' + (item.name || "Unnamed Item") + '" to your inventory?')) return;

    var folder = ciFolder;
    var params = new URLSearchParams();
    params.append("action", "take_item");
    params.append("from_tab", folder);
    params.append("item_id", itemId);
    post(params, function (result) {
      if (!result.success || !result.item) return;
      ciData[folder].items = getItems(folder).filter(function (entry) { return entry.id !== itemId; });
      delete ciOpen[itemId];
      var toTab = result.to_tab;
      if (!ciData[toTab]) ciData[toTab] = { items: [] };
      ciData[toTab].items.push(result.item);
      render();
      showStatus('"' + (result.item.name || "Item") + '" added to your inventory', "success");
    });
  }

  function uploadImage(itemId) {
    var fileInput = pane.querySelector(".ci__file");
    if (!fileInput) return;
    ciUploadItemId = itemId;
    fileInput.value = "";
    fileInput.click();
  }

  function handleFileSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file || !ciUploadItemId) return;

    if (file.size > 5 * 1024 * 1024) {
      showStatus("File too large. Maximum size is 5MB.", "error");
      return;
    }

    var formData = new FormData();
    formData.append("action", "upload_image");
    formData.append("item_id", ciUploadItemId);
    formData.append("image", file);

    showStatus("Uploading image...", "loading");
    ciPendingSaves++;
    fetch(HANDLER_URL, { method: "POST", body: formData, credentials: "same-origin" })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        ciPendingSaves--;
        if (!result.success) {
          showStatus("Error uploading image: " + (result.error || "unknown"), "error");
          return;
        }
        var item = findItem(result.tab, result.item_id);
        if (item) item.image = result.image_path;
        render();
        showStatus("Image uploaded", "success");
      })
      .catch(function (error) {
        ciPendingSaves--;
        console.error("Image upload failed", error);
        showStatus("Network error uploading image", "error");
      });
  }

  // ---------------------------------------------------------------------
  // Field editing
  // ---------------------------------------------------------------------

  function handleFieldInput(target) {
    var card = target.closest(".ci-card");
    if (!card) return;
    var itemId = card.getAttribute("data-item-id");
    var item = findItem(ciFolder, itemId);
    if (!item) return;

    var field = target.getAttribute("data-ci-field");
    if (field) {
      item[field] = target.value;
      if (field === "name") {
        // keep tooltip/labels consistent on next render
      }
      queueFieldSave(ciFolder, itemId, field, function () { return item[field] || ""; });
      return;
    }

    var sectionField = target.getAttribute("data-ci-sfield");
    if (sectionField) {
      syncSectionsFromCard(card, item);
      queueFieldSave(ciFolder, itemId, "effectSections", function () {
        return JSON.stringify(item.effectSections || []);
      });
    }
  }

  function syncSectionsFromCard(card, item) {
    var sectionElements = card.querySelectorAll(".ci-effect--editing[data-section-id]");
    var sections = [];
    sectionElements.forEach(function (element) {
      sections.push({
        id: element.getAttribute("data-section-id") || createSectionId(),
        title: (element.querySelector('[data-ci-sfield="title"]') || {}).value || "",
        cost: (element.querySelector('[data-ci-sfield="cost"]') || {}).value || "",
        text: (element.querySelector('[data-ci-sfield="text"]') || {}).value || ""
      });
    });
    item.effectSections = sections;
  }

  function addEffectSection(itemId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    var card = pane.querySelector('.ci-card[data-item-id="' + itemId + '"]');
    if (card) syncSectionsFromCard(card, item);
    normalizeSections(item).push({ id: createSectionId(), title: "", cost: "", text: "" });
    saveFieldNow(ciFolder, itemId, "effectSections", JSON.stringify(item.effectSections));
    render();
  }

  function removeEffectSection(itemId, sectionId) {
    var item = findItem(ciFolder, itemId);
    if (!item) return;
    var card = pane.querySelector('.ci-card[data-item-id="' + itemId + '"]');
    if (card) syncSectionsFromCard(card, item);
    item.effectSections = normalizeSections(item).filter(function (section) { return section.id !== sectionId; });
    saveFieldNow(ciFolder, itemId, "effectSections", JSON.stringify(item.effectSections));
    render();
  }

  // ---------------------------------------------------------------------
  // Status toast
  // ---------------------------------------------------------------------

  function showStatus(message, type) {
    var existing = document.getElementById("ci-status");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "ci-status";
    toast.className = "ci-status ci-status--" + (type || "info");
    toast.textContent = message;
    document.body.appendChild(toast);

    if (type !== "loading") {
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 3000);
    }
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------

  function handleClick(event) {
    var target = event.target.closest("[data-ci-action]");
    if (!target || !pane.contains(target)) return;

    var action = target.getAttribute("data-ci-action");
    var itemId = target.getAttribute("data-item-id") || "";

    switch (action) {
      case "folder":
        flushPendingSaves();
        ciFolder = target.getAttribute("data-folder") || ciFolder;
        render();
        break;
      case "open":
        openItem(itemId);
        break;
      case "close":
        closeItem(itemId);
        break;
      case "add":
        addItem();
        break;
      case "import":
        importDashboard();
        break;
      case "add-effect":
        addEffectSection(itemId);
        break;
      case "remove-effect":
        var card = target.closest(".ci-card");
        removeEffectSection(card ? card.getAttribute("data-item-id") : "", target.getAttribute("data-section-id"));
        break;
      case "upload-image":
        uploadImage(itemId);
        break;
      case "toggle-visibility":
        toggleVisibility(itemId);
        break;
      case "duplicate":
        duplicateItem(itemId);
        break;
      case "share":
        shareItem(itemId);
        break;
      case "take":
        takeItem(itemId);
        break;
      case "delete":
        deleteItem(itemId);
        break;
    }
  }

  function paneIsVisible() {
    return pane && !pane.classList.contains("is-hidden");
  }

  function startSync() {
    if (ciSyncTimer) clearInterval(ciSyncTimer);
    ciSyncTimer = setInterval(function () {
      if (document.hidden) return;
      if (!paneIsVisible()) return;
      if (isEditMode()) return;
      if (hasUnsavedEdits()) return;
      loadData({ onlyIfModified: true });
    }, SYNC_INTERVAL_MS);
  }

  function init() {
    pane = document.getElementById("inventory-pane");
    if (!pane) return;

    activeCharacter = (document.body.getAttribute("data-character") || "").toLowerCase();
    currentUser = (document.body.getAttribute("data-user") || "").toLowerCase();
    isGM = document.body.getAttribute("data-is-gm") === "1";
    ciFolder = CHARACTER_TABS.indexOf(activeCharacter) !== -1 ? activeCharacter : "cal";

    pane.addEventListener("click", handleClick);
    pane.addEventListener("input", function (event) {
      if (event.target.matches("[data-ci-field], [data-ci-sfield]")) {
        handleFieldInput(event.target);
      }
    });
    pane.addEventListener("change", function (event) {
      if (event.target.classList.contains("ci__file")) {
        handleFileSelected(event);
      }
    });

    // Re-render when Edit Mode is toggled (sheet.js owns the toggle).
    var editToggle = document.getElementById("edit-toggle");
    if (editToggle) {
      editToggle.addEventListener("change", function () {
        flushPendingSaves();
        render();
      });
    }

    window.addEventListener("beforeunload", flushPendingSaves);

    loadData();
    startSync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
