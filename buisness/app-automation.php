<?php
require_once __DIR__ . '/auth.php';
buisness_require_login();
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>APP Automation - Business</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/business.css">
</head>
<body class="no-chrome">

<div class="page detail" id="detail-page">
  <div class="topBar">
    <div style="display:flex;align-items:center;gap:14px">
      <a class="pillBtn ghost" href="projects.php">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M10 6H2m0 0L5.5 2.5M2 6l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Projects
      </a>
      <div class="crumb">Business &middot; <b>APP Automation</b></div>
    </div>
    <div class="topBarRight">
      <label class="editToggle">
        <input type="checkbox" id="edit-mode-toggle" />
        <span class="editToggleSlider"></span>
        <span class="editToggleLabel">Edit mode</span>
      </label>
      <div class="brand"><span class="brandMark">B</span> APP Automation</div>
    </div>
  </div>

  <div class="detailBody" id="detail-body">
    <div class="pane" id="left-pane">
      <div class="paneHd">
        <h3>Sections</h3>
        <div class="search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><path d="m11 11 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input type="text" id="search-input" placeholder="Search sections" />
        </div>
        <div class="meta" id="left-count">0 items</div>
        <div class="editActions">
          <button type="button" class="pillBtn dark addBulletBtn" id="add-bullet-btn">+ Add bullet</button>
        </div>
      </div>
      <div class="paneScroll">
        <div class="bList" id="bullet-list" aria-label="Bullet list"></div>
        <div class="emptyEditHint" id="empty-edit-hint">
          <div class="ico">+</div>
          <div>No bullets yet.</div>
          <div class="hint">Turn on <b>Edit mode</b> and click <b>Add bullet</b> to create your master list.</div>
        </div>
      </div>
    </div>

    <div class="splitter" id="splitter" title="Drag to resize"></div>

    <div class="pane right" id="right-pane">
      <div class="paneHd">
        <h3>Selection</h3>
        <div class="countChip" id="selection-count">0 items</div>
        <div class="actions">
          <button type="button" class="pillBtn ghost exportBtn" id="export-questions-btn" title="Export selected questions as HTML" disabled>Questions</button>
          <button type="button" class="pillBtn ghost exportBtn" id="export-drafts-btn" title="Export selected drafts as HTML" disabled>Drafts</button>
          <button type="button" class="iconBtn" id="copy-btn" title="Copy as text" disabled>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
          <button type="button" class="iconBtn" id="clear-btn" title="Clear selection" disabled>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 5h10M6.5 5V3.5h3V5M5 5l.5 8.5a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="paneScroll">
        <div class="bList rightList" id="selection-list"></div>
        <div class="rightEmpty" id="right-empty">
          <div>
            <div class="ico">+</div>
            <div>Nothing selected yet.</div>
            <div class="hint"><kbd>Click</kbd> a bullet to add it &middot; <kbd>Double-click</kbd> a header to add the whole section</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabBar">
    <button type="button" class="tab presetTab on" data-preset-key="general">General</button>
    <button type="button" class="tab presetTab" data-preset-key="templates">Templates</button>
    <button type="button" class="tab presetTab" data-preset-key="schedule">Schedule</button>
    <button type="button" class="tab presetTab" data-preset-key="integrations">Integrations</button>
    <button type="button" class="tab presetTab" data-preset-key="reports">Reports</button>
    <button type="button" class="tab presetTab" data-preset-key="audit-log">Audit Log</button>
    <div class="tabSpacer"></div>
    <div class="tabMeta" id="save-status">draft &middot; autosaved</div>
  </div>

  <div id="hint-pill" class="hint-pill" hidden></div>
</div>

<!-- Bullet edit row template -->
<template id="bullet-edit-template">
  <div class="bulletEditor" role="dialog" aria-label="Edit bullet">
    <div class="bulletEditorRow">
      <label class="depthGroup">
        <span class="depthLabel">Depth</span>
        <select class="depthSelect">
          <option value="0">0 - Section header</option>
          <option value="1">1 - Subsection</option>
          <option value="2">2 - Leaf</option>
        </select>
      </label>
      <input type="text" class="bulletText" placeholder="Bullet text" />
    </div>
    <label class="batchToggle">
      <input type="checkbox" class="batchWithParent" />
      <span>Batch with parent</span>
    </label>
    <div class="bulletEditorRow bulletEditorActions">
      <button type="button" class="pillBtn ghost cancelBtn">Cancel</button>
      <button type="button" class="pillBtn dark saveBtn">Save</button>
    </div>
  </div>
</template>

<div class="modalOverlay" id="content-modal" hidden>
  <div class="contentModal" role="dialog" aria-modal="true" aria-labelledby="content-modal-title">
    <div class="contentModalHead">
      <div>
        <h3 id="content-modal-title">Bullet content</h3>
        <p id="content-modal-subtitle"></p>
      </div>
      <button type="button" class="iconBtn" id="content-modal-close" title="Close">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="contentModalBody">
      <label class="richField">
        <span>Questions</span>
        <div class="richPasteBox" id="questions-editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
      </label>
      <label class="richField">
        <span>Draft</span>
        <div class="richPasteBox" id="draft-editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
      </label>
    </div>
    <div class="contentModalFoot">
      <button type="button" class="pillBtn ghost" id="content-clear-btn">Clear both</button>
      <div class="modalFootSpacer"></div>
      <button type="button" class="pillBtn ghost" id="content-cancel-btn">Cancel</button>
      <button type="button" class="pillBtn dark" id="content-save-btn">Save content</button>
    </div>
  </div>
</div>

<script src="js/app-automation.js"></script>
</body>
</html>
