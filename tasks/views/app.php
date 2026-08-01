<?php
declare(strict_types=1);
if (!defined('TASK_APP_INTERNAL')) { http_response_code(403); exit; }
?>
  <div id="task-app-bootstrap" data-csrf-token="<?= htmlspecialchars(taskAppCsrfToken(), ENT_QUOTES, 'UTF-8') ?>" hidden></div>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Task lists">
      <div class="brand"><img src="assets/icon.svg" alt=""><span>My Tasks</span></div>
      <nav id="list-nav"></nav>
      <button class="sidebar-action" id="add-list-button" type="button"><span>＋</span> New list</button>
      <div class="storage-note" id="storage-note"></div>
      <form method="post" class="logout-form"><input type="hidden" name="action" value="logout"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars(taskAppCsrfToken(), ENT_QUOTES, 'UTF-8') ?>"><button type="submit">Sign out</button></form>
    </aside>
    <main class="main-panel">
      <header class="topbar">
        <button class="icon-button mobile-only" id="menu-button" type="button" aria-label="Open lists">☰</button>
        <div class="heading-wrap"><h1 id="list-title">Tasks</h1><p id="task-count"></p></div>
        <button class="icon-button" id="list-menu-button" type="button" aria-label="List options">•••</button>
      </header>
      <section class="task-content" aria-live="polite">
        <div class="import-banner" id="legacy-import" hidden>
          <div><strong>Local tasks found</strong><p>This device has tasks from before shared sync. Import and merge them into the shared list?</p></div>
          <button type="button" class="secondary" id="legacy-not-now">Not now</button><button type="button" class="primary" id="legacy-import-button">Import</button>
        </div>
        <form class="quick-add" id="add-task-form"><span class="add-icon">＋</span><input id="new-task-input" autocomplete="off" maxlength="240" placeholder="Add a task" aria-label="New task"><button type="submit">Add</button></form>
        <div id="task-list" class="task-list"></div>
        <section id="completed-section" class="completed-section" hidden><button id="completed-toggle" class="completed-toggle" type="button" aria-expanded="false"></button><div id="completed-list" class="task-list completed-list" hidden></div></section>
        <div class="empty-state" id="empty-state" hidden><div class="empty-check">✓</div><h2>All clear</h2><p>Add a task above when something comes to mind.</p></div>
      </section>
    </main>
  </div>
  <div class="scrim" id="scrim" hidden></div>
  <dialog id="task-dialog" class="modal"><form method="dialog" id="task-form"><div class="modal-header"><h2>Edit task</h2><button class="icon-button" value="cancel" aria-label="Close">×</button></div><label>Task<input id="edit-task-title" maxlength="240" required></label><label>Details<textarea id="edit-task-notes" maxlength="2000" rows="6" placeholder="Add notes"></textarea></label><div class="modal-actions"><button class="danger-link" id="delete-task-button" type="button">Delete</button><span></span><button value="cancel" class="secondary">Cancel</button><button value="default" id="save-task-button" type="submit" class="primary">Save</button></div></form></dialog>
  <dialog id="list-dialog" class="modal small-modal"><form method="dialog" id="list-form"><div class="modal-header"><h2 id="list-dialog-title">New list</h2><button class="icon-button" value="cancel" aria-label="Close">×</button></div><label>List name<input id="list-name-input" maxlength="80" required></label><div class="modal-actions"><button class="danger-link" id="delete-list-button" type="button" hidden>Delete list</button><span></span><button value="cancel" class="secondary">Cancel</button><button value="default" type="submit" class="primary">Save</button></div></form></dialog>
  <dialog id="conflict-dialog" class="modal small-modal"><form method="dialog"><div class="modal-header"><h2>Tasks changed elsewhere</h2></div><p class="dialog-copy">Another device saved first. Reload the shared version, then repeat your last change so nothing is silently overwritten.</p><div class="modal-actions conflict-actions"><span></span><span></span><button value="reload" class="primary" id="conflict-reload">Reload shared tasks</button></div></form></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script src="config.js"></script><script type="module" src="assets/app.mjs"></script>
