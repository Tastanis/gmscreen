<?php
/**
 * The Table's test window (Brandon, October 27, 2026). The Director: "Ask for a test", the same form the map's Test
 * button opens (js/ask-test.js). A player: the Table opens it in front when the Director asks them for a test, and the
 * request (the roll from their sheet) shows here; one cancelled is taken away. The request rides on the table chat.
 */
require __DIR__ . '/config.php';
$config = tableSiteConfig();
session_write_close();
if ($config === null) { header('Location: /dnd/index.php'); exit; }
$v = static fn ($file) => (int) @filemtime(__DIR__ . '/../' . $file);
$json = static fn ($value) => json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo $config['isGM'] ? 'Ask for a test' : 'Test'; ?></title>
  <script>try { if (localStorage.getItem('sheet-theme') !== 'parchment') document.documentElement.classList.add('diablo'); } catch (e) { document.documentElement.classList.add('diablo'); }</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
  <link rel="stylesheet" href="/dnd/css/ui-kit.css?v=<?php echo $v('css/ui-kit.css'); ?>">
  <link rel="stylesheet" href="/dnd/css/ask-test.css?v=<?php echo $v('css/ask-test.css'); ?>">
  <style>
    html, body { margin: 0; min-height: 100%; background: #16130f; color: #e9dcc4; font: 14px "Segoe UI", sans-serif; }
    html:not(.diablo), html:not(.diablo) body { background: #efe3c8; color: #2b2116; }
    .hidden-chat { display: none !important; }
    .again { display: none; margin: 40px auto; text-align: center; }
    .again.on { display: block; }
    .again button { font: 700 14px Cinzel, Georgia, serif; padding: 10px 18px; border-radius: 6px; cursor: pointer; background: #3e2d18; color: #f0d898; border: 1px solid #8a6d36; }
  </style>
</head>
<body>
  <!-- When the form is closed or sent, the window offers another; closing the window is closing it. -->
<?php if ($config['isGM']): ?>
  <div class="again"><p>Test asked. The heroes roll from their sheets; results come to chat.</p><button type="button" data-ask-test-open>Ask another test</button></div>
<?php else: ?>
  <div class="again" data-player-idle><p>No test is waiting for you.</p></div>
<?php endif; ?>

  <!-- Hidden chat (js/chat-panel.js, headless): the test request rides on the table chat. -->
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
    window.chatHandlerUrl = <?php echo $json($config['chatHandlerUrl']); ?>;
    window.chatParticipants = <?php echo $json($config['chatParticipants']); ?>;
<?php if ($config['chatPusher'] !== null): ?>
    window.chatPusherConfig = <?php echo $json($config['chatPusher']); ?>;
<?php endif; ?>
  </script>
<?php if ($config['chatPusher'] !== null): ?>
  <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
<?php endif; ?>
  <script src="/dnd/js/ui-kit.js?v=<?php echo $v('js/ui-kit.js'); ?>"></script>
  <script src="/dnd/js/chat-panel.js?v=<?php echo $v('js/chat-panel.js'); ?>"></script>
  <script src="/dnd/js/ask-test.js?v=<?php echo $v('js/ask-test.js'); ?>"></script>
  <script>
    var director = <?php echo $config['isGM'] ? 'true' : 'false'; ?>;
    window.initChatPanel(director, <?php echo $json($config['currentUser']); ?>, { headless: true });
    window.AskTest.start({ isGM: director, currentUser: <?php echo $json($config['isGM'] ? $config['currentUser'] : strtolower($config['currentUser'])); ?>, endpoint: window.chatHandlerUrl, participants: window.chatParticipants });
    if (director) window.AskTest.openForm({ from: <?php echo $json((string) ($_GET['from'] ?? '')); ?> });
    // The Director: once the form is gone (sent or closed), offer another. A player: a line while no request shows.
    new MutationObserver(function () {
      var shown = !!document.querySelector(director ? '.ask-test__panel--form' : '.ask-test__panel--request, .ask-test__panel--results');
      document.querySelector('.again').classList.toggle('on', !shown);
    }).observe(document.body, { childList: true, subtree: true });
    // A request opens only in the window in use: this one is, the moment it is opened.
    window.focus();
  </script>
</body>
</html>
