<?php
// The character sheet (October 2026 rebuild; the design Brandon approved over five rounds of mock-ups). The page is
// drawn by app.js from the parts in parts/ (shared with the map's side panel). The classic sheet (classic.php) was retired
// when this one was approved (Brandon, October 2026).
if (session_status() === PHP_SESSION_NONE) {
  session_start();
}
require_once __DIR__ . '/../includes/players.php'; players_gate(); // a player turned off is logged out

$sessionUser = isset($_SESSION['user']) ? strtolower($_SESSION['user']) : '';
$currentUser = isset($_SESSION['user']) ? (string) $_SESSION['user'] : '';
$isGm = strcasecmp($currentUser, 'GM') === 0;

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $sessionUser === '') {
  header('Location: ../index.php');
  exit;
}

$requestedCharacter = isset($_GET['character']) ? strtolower(trim($_GET['character'])) : '';

// Players see their own sheet; the Director any.
if (!$isGm && $requestedCharacter !== '' && $requestedCharacter !== $sessionUser) {
  $requestedCharacter = $sessionUser;
}

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

require_once __DIR__ . '/../includes/chat_pusher.php';
$chatPusherConfig = getChatPusherClientConfig();

// Include navigation bar
require_once '../includes/strix-nav.php';
$v = (int) $assetVersion;
?>
<!DOCTYPE html>
<html lang="en" data-sheet-theme="diablo">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hero Sheet</title>
  <script>
    // The sheet's own look, before anything is drawn (no flash): Diablo unless this browser chose Parchment.
    try { document.documentElement.dataset.sheetTheme = localStorage.getItem('sheet-theme') === 'parchment' ? 'parchment' : 'diablo'; } catch (e) {}
  </script>
  <script type="importmap"><?php
    // Every module the sheet loads, at this build's version (a new build is never served an old part).
    $imports = array();
    foreach (array('app.js', 'sheet-changes.mjs') as $file) $imports['/dnd/character_sheet/' . $file] = '/dnd/character_sheet/' . $file . '?v=' . $v;
    foreach (glob(__DIR__ . '/parts/*.js') ?: array() as $file) $imports['/dnd/character_sheet/parts/' . basename($file)] = '/dnd/character_sheet/parts/' . basename($file) . '?v=' . $v;
    echo json_encode(array('imports' => $imports), JSON_UNESCAPED_SLASHES);
  ?></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
  <link rel="stylesheet" href="../css/chat-panel.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="../css/ask-test.css?v=<?php echo $v; ?>" />
  <?php echo players_script(); ?>
  <link rel="stylesheet" href="inventory-tab.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="../dice-roller/dice-roller.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="../dice-roller/diablo-dice.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="ability-automation/automation.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="parts/sheet-parts.css?v=<?php echo $v; ?>" />
  <link rel="stylesheet" href="app.css?v=<?php echo $v; ?>" />
  <script src="ability-automation/primitives.js?v=<?php echo $v; ?>"></script>
  <script src="ability-automation/schema.js?v=<?php echo $v; ?>"></script>
  <script src="ability-automation/catalog.js?v=<?php echo $v; ?>"></script>
  <script src="ability-automation/field-map.js?v=<?php echo $v; ?>"></script>
  <script src="ability-automation/paste.js?v=<?php echo $v; ?>"></script>
  <script src="ability-automation/inspector.js?v=<?php echo $v; ?>"></script>
  <script type="module" src="app.js?v=<?php echo $v; ?>"></script>
  <script src="inventory-tab.js?v=<?php echo $v; ?>" defer></script>
  <script src="../dice-roller/dice-roller.js?v=<?php echo $v; ?>" defer></script>
<?php if ($chatPusherConfig !== null): ?>
  <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
<?php endif; ?>
</head>
<body class="character-sheet-page sheet-v2" data-character="<?php echo htmlspecialchars($activeCharacter, ENT_QUOTES, 'UTF-8'); ?>" data-user="<?php echo htmlspecialchars($sessionUser, ENT_QUOTES, 'UTF-8'); ?>" data-is-gm="<?php echo $isGm ? '1' : '0'; ?>">
  <?php renderStrixNav('charactersheet'); ?>
  <main id="sheet-app" class="sp" data-sheet-theme="diablo" aria-label="Character sheet">
    <div class="sp-layout">
      <div data-host="status"><p class="sp-none" style="padding:20px">Loading the sheet…</p></div>
      <div class="sp-main">
        <div data-host="tabs"></div>
        <div data-host="banner"></div>
        <div class="sp-pane" data-host="pane"></div>
        <!-- The inventory keeps its own code (inventory-tab.js), which looks for this pane, the Edit toggle below and body.edit-mode. -->
        <div class="pane sp-pane sp-inventory is-hidden" data-pane="inventory" id="inventory-pane"></div>
      </div>
    </div>
    <input type="checkbox" id="edit-toggle" hidden aria-hidden="true" tabindex="-1" />
    <button type="button" id="dice-roller-btn" class="dice-roller-launch" hidden aria-hidden="true" tabindex="-1">Dice Roller</button>
  </main>

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
    window.currentCharacter = <?php echo json_encode($activeCharacter, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
    window.chatHandlerUrl = '/dnd/chat_handler.php';
    window.chatParticipants = <?php echo json_encode($chatParticipantList, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
    window.chatPusherConfig = <?php echo json_encode($chatPusherConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
    window.characterSheetChatConfig = {
      isGM: <?php echo $isGm ? 'true' : 'false'; ?>,
      currentUser: <?php echo json_encode($currentUser, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>
    };
  </script>
  <script src="../js/ask-test.js?v=<?php echo $v; ?>"></script>
  <script src="../js/chat-panel.js?v=<?php echo $v; ?>"></script>
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
