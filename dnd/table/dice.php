<?php
/**
 * The Table's Dice window (Brandon, October 27, 2026): the dice roller on its own, so Dice no longer opens the map.
 * It is the same roller the character sheet and the Projects screen use (dnd/dice-roller/); rolls go to the table chat
 * through a hidden chat (js/chat-panel.js, headless), as on the Projects screen. Project rolls stay on Projects.
 */
session_start();
require_once __DIR__ . '/../includes/players.php';
players_gate(); // a player turned off is logged out

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

$user = (string) ($_SESSION['user'] ?? '');
$isGM = $user === 'GM';
session_write_close();

$chatParticipantsMap = require __DIR__ . '/../includes/chat_participants.php';
$chatParticipants = array();
foreach ($chatParticipantsMap as $participantId => $participantLabel) {
    $chatParticipants[] = array('id' => $participantId, 'label' => $participantLabel);
}
require_once __DIR__ . '/../includes/chat_pusher.php';
$chatPusherConfig = getChatPusherClientConfig();

$v = static function ($file) {
    return (int) @filemtime(__DIR__ . '/' . $file);
};
$json = static function ($value) {
    return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
};
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dice</title>
  <script>
    // The theme before the first paint (shared with the character sheet): Diablo unless Parchment was chosen.
    try { if (localStorage.getItem('sheet-theme') !== 'parchment') document.documentElement.classList.add('diablo'); } catch (e) { document.documentElement.classList.add('diablo'); }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
  <link rel="stylesheet" href="../css/ui-kit.css?v=<?php echo $v('../css/ui-kit.css'); ?>">
  <link rel="stylesheet" href="../dice-roller/dice-roller.css?v=<?php echo $v('../dice-roller/dice-roller.css'); ?>">
  <link rel="stylesheet" href="../dice-roller/diablo-dice.css?v=<?php echo $v('../dice-roller/diablo-dice.css'); ?>">
  <style>
    html, body { margin: 0; height: 100%; background: #16130f; overflow: auto; }
    html:not(.diablo), html:not(.diablo) body { background: #efe3c8; }
    .hidden-tool, .hidden-chat, .chat-notification-host, .chat-whisper-popout, .chat-whisper-alert { display: none !important; }
    /* The roller fills the window: the window is its frame, so no floating box, no close button, no dragging. */
    .dice-modal-overlay { position: static !important; display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto; }
    .dice-modal { position: static !important; width: 100% !important; max-width: none !important; min-height: 100vh; box-sizing: border-box; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; transform: none !important; }
    .dice-modal-header { cursor: default !important; }
    .dice-modal-close { display: none !important; }
    /* Project rolls need the Projects screen (its list of projects); they stay there. */
    .dice-project-section, .dice-divider:has(+ .dice-project-section) { display: none !important; }
  </style>
</head>
<body>
  <script>if (document.documentElement.classList.contains('diablo')) document.body.classList.add('diablo-theme');   // the dice skin keys on the body</script>
  <button type="button" id="dice-roller-btn" class="hidden-tool" tabindex="-1" aria-hidden="true">Dice Roller</button>

  <!-- Hidden chat (js/chat-panel.js, headless): posts the rolls; the Table's chat window shows them. -->
  <div class="hidden-chat" aria-hidden="true">
    <aside id="chat-panel" class="chat-panel" data-drop-scope="panel">
      <div class="chat-panel__header"><button type="button" id="chat-panel-close">&times;</button></div>
      <div id="chat-message-list" class="chat-panel__history"></div>
      <form id="chat-input-form" autocomplete="off"><textarea id="chat-input" rows="1"></textarea><button type="submit" id="chat-send-btn">Send</button></form>
      <div id="chat-drop-target" data-drop-scope="panel" hidden></div>
    </aside>
    <button id="chat-panel-toggle" type="button">Open Chat</button>
  </div>

  <script>
    window.chatHandlerUrl = '../chat_handler.php';
    window.chatParticipants = <?php echo $json($chatParticipants); ?>;
<?php if ($chatPusherConfig !== null): ?>
    window.chatPusherConfig = <?php echo $json($chatPusherConfig); ?>;
<?php endif; ?>
    // The roller names the roller in chat by this.
    var currentUser = <?php echo $json($user); ?>;
    window.currentCharacter = <?php echo $json(strtolower($user)); ?>;
  </script>
<?php if ($chatPusherConfig !== null): ?>
  <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
<?php endif; ?>
  <script src="../js/ui-kit.js?v=<?php echo $v('../js/ui-kit.js'); ?>"></script>
  <script src="../js/chat-panel.js?v=<?php echo $v('../js/chat-panel.js'); ?>"></script>
  <script src="../dice-roller/dice-roller.js?v=<?php echo $v('../dice-roller/dice-roller.js'); ?>"></script>
  <script>
    window.initChatPanel(<?php echo $isGM ? 'true' : 'false'; ?>, <?php echo $json($user); ?>, { headless: true });
    // Open at once and stay open: closing is closing the window.
    window.addEventListener('DOMContentLoaded', function () {
      var roller = window.dashboardDiceRoller;
      if (!roller) return;
      roller.open();
      roller.close = function () { if (typeof roller.cancelProjectRoll === 'function') roller.cancelProjectRoll(); };
    });
  </script>
</body>
</html>
