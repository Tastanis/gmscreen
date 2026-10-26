<?php
/**
 * Projects and Relationships: the heroes' projects (with the project roll) and their relationships.
 * Opened as windows on the Table (dnd/table/), and works as a page of its own too.
 *   ?view=projects|relationships  &character=all|<hero id>
 * The Director sees and changes everything; a player sees their own hero: project bars and the roll button,
 * and their relationships read-only. Data: api/campaign.php.
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

$view = (($_GET['view'] ?? '') === 'relationships') ? 'relationships' : 'projects';
$character = strtolower(trim((string) ($_GET['character'] ?? 'all')));
if (!$isGM) {
    $character = $user;
} elseif ($character !== 'all' && !in_array($character, players_ids(), true)) {
    $character = 'all';
}

// The chat stays hidden here (the Table shows the one chat); it is only there so a project roll can be posted.
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
$config = array(
    'isGM' => $isGM,
    'user' => $user,
    'view' => $view,
    'character' => $character,
    'api' => '../api/campaign.php',
    'base' => '../',
);
$json = static function ($value) {
    return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
};
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo $view === 'relationships' ? 'Relationships' : 'Projects'; ?></title>
  <script>
    // The theme before the first paint (shared with the character sheet): Diablo unless Parchment was chosen.
    try { if (localStorage.getItem('sheet-theme') !== 'parchment') document.documentElement.classList.add('diablo'); } catch (e) { document.documentElement.classList.add('diablo'); }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
  <link rel="stylesheet" href="../css/ui-kit.css?v=<?php echo $v('../css/ui-kit.css'); ?>">
  <link rel="stylesheet" href="../dice-roller/dice-roller.css?v=<?php echo $v('../dice-roller/dice-roller.css'); ?>">
  <link rel="stylesheet" href="../dice-roller/diablo-dice.css?v=<?php echo $v('../dice-roller/diablo-dice.css'); ?>">
  <link rel="stylesheet" href="campaign.css?v=<?php echo $v('campaign.css'); ?>">
</head>
<body>
  <div id="app"><p class="placeholder">Loading…</p></div>

  <!-- The dice roller needs its open button; the project roll opens it from the cards instead. -->
  <button type="button" id="dice-roller-btn" class="hidden-tool" tabindex="-1" aria-hidden="true">Dice Roller</button>

  <!-- Hidden chat (js/chat-panel.js, headless): posts the project roll; the Table's chat window shows it. -->
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
    window.CAMPAIGN_CONFIG = <?php echo $json($config); ?>;
    window.chatHandlerUrl = '../chat_handler.php';
    window.chatParticipants = <?php echo $json($chatParticipants); ?>;
<?php if ($chatPusherConfig !== null): ?>
    window.chatPusherConfig = <?php echo $json($chatPusherConfig); ?>;
<?php endif; ?>
    // The dice roller reads this name (Zepha rolls 6d10 a day); the Projects screen sets it to the hero rolling.
    var currentUser = <?php echo $json($user); ?>;
  </script>
<?php if ($chatPusherConfig !== null): ?>
  <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
<?php endif; ?>
  <script src="../js/ui-kit.js?v=<?php echo $v('../js/ui-kit.js'); ?>"></script>
  <script src="../js/chat-panel.js?v=<?php echo $v('../js/chat-panel.js'); ?>"></script>
  <script src="../dice-roller/dice-roller.js?v=<?php echo $v('../dice-roller/dice-roller.js'); ?>"></script>
  <script>
    window.initChatPanel(<?php echo $isGM ? 'true' : 'false'; ?>, <?php echo $json($user); ?>, { headless: true });
  </script>
  <script src="campaign-views.js?v=<?php echo $v('campaign-views.js'); ?>"></script>
  <script src="campaign.js?v=<?php echo $v('campaign.js'); ?>"></script>
</body>
</html>
