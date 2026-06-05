<?php
/** @var array<string,string> $sections */
/** @var array<string,mixed> $config */
/** @var array<string,string> $routes */

$assetVersion = (int) ($config['assetsVersion'] ?? time());
$jsonScriptFlags = JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_PRETTY_PRINT;

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
    <script>
        (function () {
            try {
                var storedTheme = window.localStorage ? window.localStorage.getItem('vtt.theme') : null;
                document.documentElement.setAttribute('data-vtt-theme', storedTheme === 'light' ? 'light' : 'dark');
            } catch (error) {
                document.documentElement.setAttribute('data-vtt-theme', 'dark');
            }
        })();
    </script>
    <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
    <link rel="stylesheet" href="../css/style.css" />
    <link rel="stylesheet" href="assets/css/base.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/layout.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/board.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/chat.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/character-summary.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/settings.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/fog-of-war.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/stairs.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="../dice-roller/dice-roller.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="../character_sheet/ability-automation/automation.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/monster-ability-tray.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/monster-summary-panel.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/theme.css?v=<?= $assetVersion ?>" />
</head>
<body class="vtt-body">
    <?php renderStrixNav('vtt'); ?>
    <div id="vtt-app" class="vtt-app" data-routes='<?= json_encode($routes, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>'>
        <?= $sections['characterSummaryPanel'] ?? '' ?>
        <?= $sections['monsterSummaryPanel'] ?? '' ?>
        <?= $sections['settingsPanel'] ?? '' ?>
        <main class="vtt-app__main" id="vtt-main" tabindex="-1">
            <?= $sections['sceneBoard'] ?? '' ?>
        </main>
        <?= $sections['chatPanel'] ?? '' ?>
    </div>
    <script>
        window.vttConfig = <?= json_encode($config, $jsonScriptFlags) ?>;
        window.chatHandlerUrl = <?= json_encode($config['chatHandlerUrl'] ?? ($routes['chat'] ?? '/dnd/chat_handler.php'), $jsonScriptFlags) ?>;
        window.chatParticipants = <?= json_encode($config['chatParticipants'] ?? [], $jsonScriptFlags) ?>;
        // Pusher configuration for real-time sync
        window.vttPusherConfig = {
            key: 'c32516844b741a8b1772',
            cluster: 'us3',
            channel: 'vtt-board'
        };
        // Pusher chat channel — `chat-updated` notifications drive
        // immediate refetch instead of 1.5s polling.
        window.chatPusherConfig = <?= json_encode($config['chatPusher'] ?? null, $jsonScriptFlags) ?>;
    </script>
    <script src="../js/chat-panel.js?v=<?= $assetVersion ?>"></script>
    <script src="../character_sheet/ability-automation/primitives.js?v=<?= $assetVersion ?>"></script>
    <script src="../character_sheet/ability-automation/schema.js?v=<?= $assetVersion ?>"></script>
    <script src="../character_sheet/ability-automation/catalog.js?v=<?= $assetVersion ?>"></script>
    <script src="../character_sheet/ability-automation/runner.js?v=<?= $assetVersion ?>"></script>
    <script src="assets/js/ui/monster-ability-runner-glue.js?v=<?= $assetVersion ?>"></script>
    <script src="assets/js/ui/monster-ability-tray.js?v=<?= $assetVersion ?>"></script>
    <script src="assets/js/ui/monster-summary-panel.js?v=<?= $assetVersion ?>"></script>
    <script type="module" src="assets/js/ui/theme-settings.js?v=<?= $assetVersion ?>"></script>
    <script type="module" src="assets/js/bootstrap.js?v=<?= $assetVersion ?>"></script>
</body>
</html>
