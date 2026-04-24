<?php
if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

$sessionUser = isset($_SESSION['user']) ? strtolower($_SESSION['user']) : '';
$currentUser = isset($_SESSION['user']) ? (string) $_SESSION['user'] : '';
$isGm = strcasecmp($currentUser, 'GM') === 0;
$requestedCharacter = isset($_GET['character']) ? strtolower(trim($_GET['character'])) : '';
$activeCharacter = $requestedCharacter !== '' ? $requestedCharacter : $sessionUser;

if (!defined('VERSION_SYSTEM_INTERNAL')) {
  define('VERSION_SYSTEM_INTERNAL', true);
}
require_once __DIR__ . '/../version.php';

$assetVersion = Version::getBuildNumber();
$chatParticipantsMap = require __DIR__ . '/../includes/chat_participants.php';
$chatParticipantList = array();
foreach ($chatParticipantsMap as $participantId => $participantLabel) {
  $chatParticipantList[] = array(
    'id' => (string) $participantId,
    'label' => (string) $participantLabel,
  );
}

// Include navigation bar
require_once '../includes/strix-nav.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hero Sheet</title>
  <link rel="stylesheet" href="../css/chat-panel.css?v=<?php echo (int) $assetVersion; ?>" />
  <link rel="stylesheet" href="styles.css?v=<?php echo (int) $assetVersion; ?>" />
  <script type="module" src="sheet.js?v=<?php echo (int) $assetVersion; ?>"></script>
</head>
<body class="character-sheet-page" data-character="<?php echo htmlspecialchars($activeCharacter, ENT_QUOTES, 'UTF-8'); ?>">
  <?php renderStrixNav('charactersheet'); ?>
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

  <aside
    id="chat-panel"
    class="chat-panel chat-panel--closed"
    aria-hidden="true"
    data-module="character-sheet-chat"
    data-drop-scope="panel"
  >
    <div class="chat-panel__header">
      <h3 class="chat-panel__title">Table Chat</h3>
      <div class="chat-panel__actions">
        <?php if ($isGm): ?>
          <button type="button" id="chat-clear-btn" class="chat-panel__clear">Clear Chat</button>
        <?php endif; ?>
        <button type="button" id="chat-panel-close" class="chat-panel__close" aria-label="Close chat">&times;</button>
      </div>
    </div>
    <div id="chat-message-list" class="chat-panel__history" role="log" aria-live="polite"></div>
    <div id="chat-whisper-targets" class="chat-panel__whispers" role="group" aria-label="Whisper targets"></div>
    <form id="chat-input-form" class="chat-panel__input" autocomplete="off">
      <textarea id="chat-input" class="chat-panel__textarea" rows="2" placeholder="Type a message..."></textarea>
      <button type="submit" id="chat-send-btn" class="chat-panel__send">Send</button>
    </form>
    <div
      id="chat-drop-target"
      class="chat-drop-target"
      data-drop-scope="panel"
      hidden
      aria-hidden="true"
    >
      Drop images or image links to share
    </div>
  </aside>
  <button id="chat-panel-toggle" class="chat-panel-toggle" type="button" aria-expanded="false" aria-controls="chat-panel">
    Open Chat
  </button>
  <div id="chat-whisper-popouts" class="chat-whisper-popouts" aria-live="polite" aria-atomic="false"></div>
  <div id="chat-whisper-alerts" class="chat-whisper-alerts" aria-live="assertive" aria-atomic="true"></div>

  <script>
    window.chatHandlerUrl = '/dnd/chat_handler.php';
    window.chatParticipants = <?php echo json_encode($chatParticipantList, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
    window.characterSheetChatConfig = {
      isGM: <?php echo $isGm ? 'true' : 'false'; ?>,
      currentUser: <?php echo json_encode($currentUser, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>
    };
  </script>
  <script src="../js/chat-panel.js?v=<?php echo (int) $assetVersion; ?>"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof window.initChatPanel === 'function') {
        window.initChatPanel(
          Boolean(window.characterSheetChatConfig && window.characterSheetChatConfig.isGM),
          window.characterSheetChatConfig ? window.characterSheetChatConfig.currentUser : ''
        );
      }
    });
  </script>
</body>
</html>
