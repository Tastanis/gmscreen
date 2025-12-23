<?php
if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

$sessionUser = isset($_SESSION['user']) ? strtolower($_SESSION['user']) : '';
$requestedCharacter = isset($_GET['character']) ? strtolower(trim($_GET['character'])) : '';
$activeCharacter = $requestedCharacter !== '' ? $requestedCharacter : $sessionUser;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hero Sheet</title>
  <link rel="stylesheet" href="styles.css" />
  <script type="module" src="sheet.js"></script>
</head>
<body data-character="<?php echo htmlspecialchars($activeCharacter); ?>">
  <div class="app-shell">
    <main class="sheet">
      <header class="sheet__header">
        <div class="header__title">
          <p class="title__eyebrow">Character Sheet</p>
          <h1 id="hero-name-heading">Tableside Hero View</h1>
        </div>
        <div class="header__actions">
          <label class="toggle">
            <input type="checkbox" id="edit-toggle" />
            <span class="toggle__slider"></span>
            <span class="toggle__label">Edit Mode</span>
          </label>
        </div>
      </header>

      <div class="tabs">
        <button class="tab tab--active" data-tab="hero">Hero</button>
        <button class="tab" data-tab="features">Features</button>
        <button class="tab" data-tab="mains">Mains</button>
        <button class="tab" data-tab="maneuvers">Maneuvers</button>
        <button class="tab" data-tab="triggers">Triggers</button>
        <button class="tab" data-tab="free-strikes">Free Strikes</button>
      </div>

      <div class="sheet__content">
        <div class="pane" data-pane="hero" id="hero-pane"></div>
        <div class="pane is-hidden" data-pane="features" id="features-pane"></div>
        <div class="pane is-hidden" data-pane="mains" id="mains-pane"></div>
        <div class="pane is-hidden" data-pane="maneuvers" id="maneuvers-pane"></div>
        <div class="pane is-hidden" data-pane="triggers" id="triggers-pane"></div>
        <div class="pane is-hidden" data-pane="free-strikes" id="free-strikes-pane"></div>
      </div>
    </main>

    <aside class="sidebar">
      <div class="sidebar__section" id="sidebar-bars"></div>
      <div class="sidebar__section" id="sidebar-resource"></div>
      <div class="sidebar__section" id="sidebar-hero-tokens"></div>
      <div class="sidebar__section" id="sidebar-common"></div>
      <div class="sidebar__section" id="sidebar-skills"></div>
      <div class="sidebar__section" id="sidebar-weaknesses"></div>
      <div class="sidebar__section" id="sidebar-languages"></div>
    </aside>
  </div>
</body>
</html>
