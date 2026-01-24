<?php
/** @var array<string,string> $sections */
/** @var array<string,mixed> $config */
/** @var array<string,string> $routes */

$assetVersion = (int) ($config['assetsVersion'] ?? time());

// Include navigation bar
require_once __DIR__ . '/../../includes/strix-nav.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VTT Workspace</title>
    <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
    <link rel="stylesheet" href="../css/style.css" />
    <link rel="stylesheet" href="assets/css/base.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/layout.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/board.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/chat.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/settings.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="../dice-roller/dice-roller.css?v=<?= $assetVersion ?>" />
</head>
<body class="vtt-body">
    <?php renderStrixNav('vtt'); ?>
    <div id="vtt-app" class="vtt-app" data-routes='<?= json_encode($routes, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>'>
        <?= $sections['settingsPanel'] ?? '' ?>
        <main class="vtt-app__main" id="vtt-main" tabindex="-1">
            <?= $sections['sceneBoard'] ?? '' ?>
        </main>
        <?= $sections['chatPanel'] ?? '' ?>
    </div>
    <script>
        window.vttConfig = <?= json_encode($config, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;
        window.chatHandlerUrl = <?= json_encode($config['chatHandlerUrl'] ?? ($routes['chat'] ?? '/dnd/chat_handler.php'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;
        window.chatParticipants = <?= json_encode($config['chatParticipants'] ?? [], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;
        // Pusher configuration for real-time sync
        window.vttPusherConfig = {
            key: 'c32516844b741a8b1772',
            cluster: 'us3',
            channel: 'vtt-board'
        };
    </script>
    <script src="../js/chat-panel.js?v=<?= $assetVersion ?>"></script>
    <script type="module" src="assets/js/bootstrap.js?v=<?= $assetVersion ?>"></script>
</body>
</html>
