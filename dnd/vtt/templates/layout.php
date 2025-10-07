<?php
/** @var array<string,string> $sections */
/** @var array<string,mixed> $config */
/** @var array<string,string> $routes */

$assetVersion = (int) ($config['assetsVersion'] ?? time());
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VTT Workspace</title>
    <link rel="stylesheet" href="../css/style.css" />
    <link rel="stylesheet" href="assets/css/base.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/layout.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/board.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/chat.css?v=<?= $assetVersion ?>" />
    <link rel="stylesheet" href="assets/css/settings.css?v=<?= $assetVersion ?>" />
</head>
<body class="vtt-body">
    <div id="vtt-app" class="vtt-app" data-routes='<?= json_encode($routes, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>'>
        <div class="vtt-app__sidebar vtt-app__sidebar--settings">
            <?= $sections['settingsPanel'] ?? '' ?>
        </div>
        <main class="vtt-app__main" id="vtt-main" tabindex="-1">
            <?= $sections['sceneBoard'] ?? '' ?>
        </main>
        <div class="vtt-app__sidebar vtt-app__sidebar--chat">
            <?= $sections['chatPanel'] ?? '' ?>
        </div>
    </div>
    <script>
        window.vttConfig = <?= json_encode($config, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;
    </script>
    <script type="module" src="assets/js/bootstrap.js?v=<?= $assetVersion ?>"></script>
</body>
</html>
